"""Internal-only, service-to-service endpoints.

These routes are reachable only from other backend services over the
private, non-host-exposed Docker network (`edulearn_net`), gated by
require_internal (IP-allowlist against that network — see
app/core/dependencies.py). Security fix: these 4 routes previously carried
NO auth dependency of any kind, unlike every sibling service's internal
routes — their only protection was the gateway happening not to declare a
proxy stub for them today. require_internal makes that the same
network-boundary guarantee every other service's internal routes already
have, instead of an incidental one.

payment_service and analytics_service each own an isolated database and
cannot query user_service's `parent_profiles` table directly, so they call
this endpoint instead to verify a parent-child relationship before serving
cross-service data (e.g. billing on behalf of a child, or analytics
rollups for a parent's children).
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_internal
from app.crud import parent_features_crud
from app.crud.community_crud import get_accepted_friend_ids_and_profiles
from app.crud.user_crud import (
    get_approved_child_ids_batch,
    get_profile,
    list_approved_parent_ids,
    list_approved_parent_ids_for_student,
    list_approved_parent_ids_for_students,
    list_approved_student_ids,
    list_user_ids_by_curriculum,
    upsert_profile_fields,
    verify_parent_child_link,
)
from app.database.session import get_db
from app.services.content_client import invalidate_board_class_cache
from app.schemas.parent_features import PurchaseApprovalCheck, PurchaseApprovalConsume

router = APIRouter(prefix="/users/internal", tags=["internal"], dependencies=[Depends(require_internal)])


@router.get(
    "/purchase-approval",
    response_model=PurchaseApprovalCheck,
    summary="[internal] Does this student's purchase need / have parent approval?",
)
async def internal_purchase_approval(
    student_id: uuid.UUID = Query(...),
    reference: str = Query(..., min_length=1, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    """payment_service gates the student self create-order route on this
    (fail-closed on its side)."""
    required = bool(await parent_features_crud.list_approval_parents(db, student_id))
    approved = await parent_features_crud.has_approved_purchase(db, student_id, reference)
    return PurchaseApprovalCheck(required=required, approved=approved)


@router.post(
    "/purchase-approval/consume",
    summary="[internal] Mark a student's approved purchase-approval rows as consumed after payment",
)
async def internal_purchase_approval_consume(
    body: PurchaseApprovalConsume,
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    consumed = await parent_features_crud.consume_approved_purchase(db, body.student_id, body.reference)
    return {"consumed": consumed}


@router.get(
    "/parent-link-check",
    summary="[internal] Check whether a parent-child link exists (network-gated only)",
)
async def parent_link_check(
    parent_id: uuid.UUID = Query(...),
    child_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    linked = await verify_parent_child_link(db, parent_id, child_id)
    return {"linked": linked}


class ParentLinkCheckBatchRequest(BaseModel):
    parent_id: uuid.UUID
    child_ids: list[uuid.UUID]


@router.post(
    "/parent-link-check-batch",
    summary="[internal] Batched parent-link-check for N children in one call",
)
async def parent_link_check_batch(
    body: ParentLinkCheckBatchRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, list[str]]:
    """analytics_service's parent multi-child summary uses this instead of
    calling /parent-link-check once per child — a parent with several linked
    children would otherwise cost one internal HTTP round-trip per child to
    authorize."""
    linked = await get_approved_child_ids_batch(db, body.parent_id, body.child_ids)
    return {"linked_child_ids": [str(i) for i in linked]}


@router.get(
    "/parent-links/approved-parents",
    summary="[internal] Distinct parent ids that have at least one APPROVED child link",
)
async def internal_approved_parents(db: AsyncSession = Depends(get_db)) -> dict[str, list[str]]:
    """notification_service's weekly parent-summary job uses this to target
    real linked parents (it can't see parent_profiles from its own DB)."""
    return {"parent_ids": [str(i) for i in await list_approved_parent_ids(db)]}


@router.get(
    "/parent-links/approved-students",
    summary="[internal] Distinct student ids that have at least one APPROVED parent link",
)
async def internal_approved_students(db: AsyncSession = Depends(get_db)) -> dict[str, list[str]]:
    """ai_service's nightly parent-RAG index uses this to decide whose activity
    to index — only students a parent can actually ask about."""
    return {"student_ids": [str(i) for i in await list_approved_student_ids(db)]}


@router.get(
    "/profile/{user_id}",
    summary="[internal] Minimal profile (board/class/name/avatar) by user_id",
)
async def internal_get_profile(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """content_service resolves the caller's board & class from here (Redis-
    cached on its side) to filter every learning resource to the student's
    curriculum; auth_service reads it back after registration."""
    p = await get_profile(db, user_id)
    if not p:
        return {"user_id": str(user_id), "exists": False, "board": None, "class_number": None}
    return {
        "user_id": str(user_id),
        "exists": True,
        "full_name": p.full_name,
        "board": p.board,
        "class_number": p.class_number,
        "avatar_url": p.avatar_url,
    }


@router.post(
    "/profile",
    summary="[internal] Upsert a user's profile (registration: board & class are mandatory)",
)
async def internal_upsert_profile(
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Called by auth_service when a student registers — board and class are
    collected at signup and become the source of truth for content filtering."""
    p = await upsert_profile_fields(db, body)
    if body.get("board") or body.get("class_number") is not None:
        await invalidate_board_class_cache(p.user_id)
    return {"user_id": str(p.user_id), "board": p.board, "class_number": p.class_number}


@router.get(
    "/students-by-curriculum",
    summary="[internal] All student user_ids for a given board & class number",
)
async def internal_students_by_curriculum(
    board: str = Query(...),
    class_number: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Backs the teacher cohort dashboard in analytics_service: there is no
    teacher-student roster in this platform, so a "classroom" is simply
    every student whose profile is set to this exact board & class."""
    user_ids = await list_user_ids_by_curriculum(db, board, class_number)
    return {"board": board, "class_number": class_number, "user_ids": [str(u) for u in user_ids]}


@router.get(
    "/parents-of-student/{student_user_id}",
    summary="[internal] Every approved-linked parent_user_id for a student",
)
async def internal_parents_of_student(
    student_user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """payment_service calls this to check family entitlement sharing: a
    student with no active subscription of their own inherits premium if
    ANY approved-linked parent has an active subscription. Only
    student-approved links count — same gate as verify_parent_child_link."""
    parent_ids = await list_approved_parent_ids_for_student(db, student_user_id)
    return {"student_user_id": str(student_user_id), "parent_user_ids": [str(p) for p in parent_ids]}


class ParentsOfStudentsBatchRequest(BaseModel):
    student_user_ids: list[uuid.UUID]


@router.post(
    "/parents-of-students-batch",
    summary="[internal] Batched form of /parents-of-student/{id} for a page of students",
)
async def internal_parents_of_students_batch(
    body: ParentsOfStudentsBatchRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """payment_service's admin effective-status batch lookup calls this
    instead of one /parents-of-student/{id} request per student — one query
    for a whole page (bounded to 200 by the caller) instead of N."""
    by_student = await list_approved_parent_ids_for_students(db, body.student_user_ids[:200])
    return {
        str(sid): [str(p) for p in by_student.get(sid, [])]
        for sid in body.student_user_ids[:200]
    }


@router.get(
    "/friends",
    summary="[internal] List a user's accepted friends by user_id (network-gated only)",
)
async def internal_list_friends(
    user_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Same shape/logic as the JWT-gated GET /community/friends, but for an
    arbitrary user_id — gamification_service calls this to resolve a user's
    friend list for the Friend Activity feed, where there's no end-user JWT
    to forward (the caller is a scheduled job or another backend service)."""
    other_ids, profiles_by_id = await get_accepted_friend_ids_and_profiles(db, user_id)
    friends = []
    for other_id in other_ids:
        profile = profiles_by_id.get(other_id)
        friends.append({
            "user_id": str(other_id),
            "full_name": profile.full_name if profile else None,
            "avatar_url": getattr(profile, "avatar_url", None) if profile else None,
        })
    return friends
