"""Parent-flow features layered on top of parent-student links:
purchase approvals (Approval Mode), pending-request badges and
parent-admin meeting requests. Same /users prefix as routes/user.py."""
import uuid
from datetime import datetime, timezone
from typing import Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id_and_role, require_admin
from app.crud import parent_features_crud as crud
from app.crud.user_crud import get_profile, verify_parent_child_link
from app.database.session import get_db
from app.schemas.parent_features import (
    ApprovalParent,
    ApprovalRequiredResponse,
    LinkBadgesResponse,
    MeetingAdminUpdate,
    MeetingCreate,
    MeetingResponse,
    ParentApprovalCreate,
    ParentApprovalDecide,
    ParentApprovalResponse,
)
from app.services.link_notifications import (
    notify_meeting_updated,
    notify_purchase_approval_decided,
    notify_purchase_approval_requested,
)

router = APIRouter(prefix="/users", tags=["parent-features"])

ADMIN_ROLES = ("admin", "super_admin")
PARENT_ROLES = ("parent", "admin", "super_admin")

MAX_PENDING_MEETINGS_PER_PARENT = 3


async def _full_name(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    profile = await get_profile(db, user_id)
    return profile.full_name if profile else None


async def _approval_response(db: AsyncSession, row, *, with_student: bool = False,
                             with_parent: bool = False) -> ParentApprovalResponse:
    resp = ParentApprovalResponse.model_validate(row)
    if with_student:
        resp.student_name = await _full_name(db, row.student_user_id)
    if with_parent:
        resp.parent_name = await _full_name(db, row.parent_user_id)
    return resp


async def _meeting_response(db: AsyncSession, row, *, with_parent: bool = False) -> MeetingResponse:
    resp = MeetingResponse.model_validate(row)
    resp.student_name = await _full_name(db, row.student_user_id)
    if with_parent:
        resp.parent_name = await _full_name(db, row.parent_user_id)
    return resp


# ── Purchase approvals (F1) ───────────────────────────────────────────────────

@router.get(
    "/parent-approvals/required",
    response_model=ApprovalRequiredResponse,
    summary="Does the caller (student) need a parent's approval for this kind of action?",
)
async def approval_required(
    kind: str = Query(default="purchase", pattern="^purchase$"),
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, _ = caller
    parent_ids = await crud.list_approval_parents(db, caller_id)
    parents = [ApprovalParent(parent_user_id=pid, parent_name=await _full_name(db, pid)) for pid in parent_ids]
    return ApprovalRequiredResponse(required=bool(parents), parents=parents)


@router.post(
    "/parent-approvals",
    response_model=list[ParentApprovalResponse],
    status_code=201,
    summary="Student asks every Approval-Mode parent to approve a purchase",
)
async def create_approval_request(
    body: ParentApprovalCreate,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role != "student":
        raise HTTPException(status_code=403, detail="Only students can request parent approval")
    parent_ids = await crud.list_approval_parents(db, caller_id)
    if not parent_ids:
        raise HTTPException(status_code=400, detail="No parent approval is required for this purchase")
    if await crud.get_pending_approval(db, caller_id, body.kind, body.reference):
        raise HTTPException(status_code=409, detail="A pending approval request already exists for this item")
    rows = await crud.create_approval_requests(
        db, caller_id, parent_ids, body.kind, body.reference, body.title, body.amount
    )
    for row in rows:
        await notify_purchase_approval_requested(db, row)
    return [await _approval_response(db, row, with_parent=True) for row in rows]


@router.get(
    "/parent-approvals/mine",
    response_model=list[ParentApprovalResponse],
    summary="Student's own approval requests, newest first",
)
async def my_approval_requests(
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, _ = caller
    rows = await crud.list_student_approvals(db, caller_id)
    return [await _approval_response(db, row, with_parent=True) for row in rows]


@router.get(
    "/parent-approvals/pending",
    response_model=list[ParentApprovalResponse],
    summary="Pending approval requests across all of the caller's (parent) children",
)
async def pending_approval_requests(
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in PARENT_ROLES:
        raise HTTPException(status_code=403, detail="Parent role required")
    rows = await crud.list_parent_pending_approvals(db, caller_id)
    return [await _approval_response(db, row, with_student=True) for row in rows]


@router.patch(
    "/parent-approvals/{approval_id}",
    response_model=ParentApprovalResponse,
    summary="Parent approves or rejects a pending request",
)
async def decide_approval_request(
    approval_id: uuid.UUID,
    body: ParentApprovalDecide,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    row = await crud.get_approval_by_id(db, approval_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if role not in ADMIN_ROLES and row.parent_user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot decide another parent's approval request")
    if row.status != "pending":
        raise HTTPException(status_code=400, detail="This request has already been decided")
    row = await crud.decide_approval(db, row, body.status, body.note)
    await notify_purchase_approval_decided(row)
    return await _approval_response(db, row, with_student=True)


# ── Badges (F4) ───────────────────────────────────────────────────────────────

@router.get(
    "/me/link-badges",
    response_model=LinkBadgesResponse,
    summary="Pending counts for the caller's nav badges",
)
async def link_badges(
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, _ = caller
    return LinkBadgesResponse(
        pending_incoming=await crud.count_pending_links(db, student_user_id=caller_id),
        pending_outgoing=await crud.count_pending_links(db, parent_user_id=caller_id),
        pending_approvals=await crud.count_parent_pending_approvals(db, caller_id),
    )


# ── Meetings (F8) ─────────────────────────────────────────────────────────────

@router.post(
    "/meetings",
    response_model=MeetingResponse,
    status_code=201,
    summary="Parent requests a meeting about an approved linked child",
)
async def create_meeting(
    body: MeetingCreate,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in PARENT_ROLES:
        raise HTTPException(status_code=403, detail="Parent role required to request a meeting")
    if not await verify_parent_child_link(db, caller_id, body.student_user_id):
        raise HTTPException(status_code=403, detail="No approved parent-child link found between the given users.")
    preferred_at = body.preferred_at
    if preferred_at.tzinfo is None:
        preferred_at = preferred_at.replace(tzinfo=timezone.utc)
    if preferred_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="preferred_at must be in the future")
    if await crud.count_pending_meetings(db, caller_id) >= MAX_PENDING_MEETINGS_PER_PARENT:
        raise HTTPException(
            status_code=400,
            detail=f"You can have at most {MAX_PENDING_MEETINGS_PER_PARENT} pending meeting requests. "
                   "Wait for a decision or cancel one before requesting another.",
        )
    row = await crud.create_meeting(db, caller_id, body.student_user_id, preferred_at, body.topic, body.notes)
    return await _meeting_response(db, row)


@router.get(
    "/meetings/mine",
    response_model=list[MeetingResponse],
    summary="Parent's own meeting requests, newest first",
)
async def my_meetings(
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in PARENT_ROLES:
        raise HTTPException(status_code=403, detail="Parent role required")
    rows = await crud.list_parent_meetings(db, caller_id)
    return [await _meeting_response(db, row) for row in rows]


@router.get(
    "/meetings",
    response_model=list[MeetingResponse],
    summary="Admin: list meeting requests",
    dependencies=[Depends(require_admin)],
)
async def list_meetings(
    status: str | None = Query(default=None, pattern="^(pending|confirmed|declined|completed|cancelled)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    rows = await crud.list_meetings(db, status, limit, offset)
    return [await _meeting_response(db, row, with_parent=True) for row in rows]


@router.patch(
    "/meetings/{meeting_id}",
    response_model=MeetingResponse,
    summary="Admin: confirm / decline / complete a meeting request",
    dependencies=[Depends(require_admin)],
)
async def admin_update_meeting(
    meeting_id: uuid.UUID,
    body: MeetingAdminUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await crud.get_meeting_by_id(db, meeting_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Meeting request not found")
    if row.status == "cancelled":
        raise HTTPException(status_code=400, detail="This meeting request was cancelled by the parent")
    if body.status is None and body.scheduled_at is None and body.meeting_link is None and body.admin_note is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if body.scheduled_at is not None:
        row.scheduled_at = body.scheduled_at
    if body.meeting_link is not None:
        row.meeting_link = body.meeting_link.strip() or None
    if body.admin_note is not None:
        row.admin_note = body.admin_note.strip() or None
    status_changed = body.status is not None and body.status != row.status
    if body.status is not None:
        row.status = body.status
        if body.status == "confirmed" and row.scheduled_at is None:
            row.scheduled_at = row.preferred_at
    row = await crud.save_meeting(db, row)
    if status_changed:
        await notify_meeting_updated(row)
    return await _meeting_response(db, row, with_parent=True)


@router.delete(
    "/meetings/{meeting_id}",
    response_model=MeetingResponse,
    summary="Parent cancels their own pending/confirmed meeting request",
)
async def cancel_meeting(
    meeting_id: uuid.UUID,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    row = await crud.get_meeting_by_id(db, meeting_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Meeting request not found")
    if role not in ADMIN_ROLES and row.parent_user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot cancel another parent's meeting request")
    if row.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=400, detail=f"A {row.status} meeting request cannot be cancelled")
    row.status = "cancelled"
    row = await crud.save_meeting(db, row)
    return await _meeting_response(db, row)
