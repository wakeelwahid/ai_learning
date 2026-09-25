"""Family entitlement sharing: a student with no subscription of their own
inherits "premium" if any parent with a student-approved link (verified via
user_service, never assumed) has their own active subscription. Shared by
the internal /subscription/status/{id} check (gamification_service's quota
gate), the user-facing /subscription/{id}/effective endpoint, and admin's
per-user effective-status lookup — kept in one place so all three call
sites can never drift on what "inherited" means.
"""
import uuid

import httpx

from app.core.config import settings
from app.crud import subscription_crud


async def get_approved_parent_ids(student_user_id: uuid.UUID) -> list[uuid.UUID]:
    """Ask user_service which parents have a student-approved link to this
    user. Fails closed (empty list) on any error — a user_service outage
    must never grant a student premium access they don't actually have."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parents-of-student/{student_user_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            return [uuid.UUID(p) for p in resp.json().get("parent_user_ids", [])]
    except Exception:
        pass
    return []


async def get_approved_parent_ids_batch(student_user_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Batched form of get_approved_parent_ids — one call to user_service
    for a whole page of students instead of one per student. Fails closed
    (empty dict) on any error, same as the single-student version."""
    if not student_user_ids:
        return {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parents-of-students-batch",
                json={"student_user_ids": [str(s) for s in student_user_ids]},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            return {
                uuid.UUID(sid): [uuid.UUID(p) for p in parent_ids]
                for sid, parent_ids in resp.json().items()
            }
    except Exception:
        pass
    return {}


async def get_inherited_subscriptions_batch(
    db, student_user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[uuid.UUID, object]]:
    """Batched form of get_inherited_subscription for a page of students —
    one user_service call and one payment DB query total, instead of one
    round trip of each per student. Returns only students that actually
    have an inherited subscription; others are simply absent."""
    parents_by_student = await get_approved_parent_ids_batch(student_user_ids)
    all_parent_ids = {p for parents in parents_by_student.values() for p in parents}
    subs_by_parent = await subscription_crud.get_active_subscriptions_for_users(db, list(all_parent_ids))

    out: dict[uuid.UUID, tuple[uuid.UUID, object]] = {}
    for student_id, parent_ids in parents_by_student.items():
        for parent_id in parent_ids:
            parent_sub = subs_by_parent.get(parent_id)
            if parent_sub:
                out[student_id] = (parent_id, parent_sub)
                break
    return out


async def get_inherited_subscription(db, student_user_id: uuid.UUID):
    """Returns (parent_user_id, parent_subscription) for the first approved
    parent with an active subscription, or (None, None) if the student has
    no such parent. Callers should only reach for this after confirming the
    student has no active subscription of their own."""
    parent_ids = await get_approved_parent_ids(student_user_id)
    if not parent_ids:
        return None, None
    subs_by_parent = await subscription_crud.get_active_subscriptions_for_users(db, parent_ids)
    for parent_id in parent_ids:
        parent_sub = subs_by_parent.get(parent_id)
        if parent_sub:
            return parent_id, parent_sub
    return None, None
