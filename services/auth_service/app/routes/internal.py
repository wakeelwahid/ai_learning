import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.dependencies import require_internal
from app.database.session import get_db
from app.models.user import User, UserRole
from app.schemas.session import TokenResponse
from app.services.phone_otp_service import PhoneOTPService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Internal test-only token issuance ─────────────────────────────────────────
# Email/password login is now admin-only in AuthService.login() (see below),
# which means the API regression test harness (tools/api-tests/run_tests.py)
# can no longer log in as its seeded student/parent fixtures that way. Those
# accounts have no phone number on file, so phone-OTP would create brand-new
# accounts instead of authenticating the deterministic seeded ones the tests
# depend on. This route mints a real session (via the same create_session()
# every other login path uses) for a known user id/email, with NO password
# check at all — so it is gated by BOTH require_internal (Docker-network-only,
# 404s otherwise) AND settings.APP_ENV == "development" (the same fail-safe
# literal-string gate used for the OTP dev bypass — see phone_otp_service),
# and is never reachable from a real client or in a production config.
# Deliberately NOT gated on settings.DEBUG: DEBUG is used elsewhere only for
# docs exposure / SQL-echo / logging verbosity and must stay fully
# decoupled from anything auth-bypass related, so turning on verbose
# logging can never accidentally also open this route.
@router.post("/internal/test-token", response_model=TokenResponse,
             include_in_schema=False, dependencies=[Depends(require_internal)])
async def internal_test_token(
    identifier: str,
    db: AsyncSession = Depends(get_db),
):
    if settings.APP_ENV != "development":
        raise HTTPException(status_code=404, detail="Not found")
    service = PhoneOTPService(db)
    user = await service.user_repo.get_by_identifier(identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await service.create_session(user)


@router.get("/internal/role/{user_id}", dependencies=[Depends(require_internal)])
async def get_user_role(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Role lookup for cross-service authorization checks — auth_service
    owns role data and no other service can see it locally (e.g.
    user_service's parent-student link creation needs to confirm the target
    is actually a student, not just that *some* user row exists, before
    linking; previously it accepted any existing user's id regardless of
    role). require_internal-gated the same way as the other routes here."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": str(user.id), "role": user.role.value}


@router.get("/internal/dormant-users", dependencies=[Depends(require_internal)])
async def get_dormant_users(
    inactive_days: int = Query(..., ge=1, le=90,
        description="Return users whose last_login was EXACTLY this many days ago (a day-wide window) — "
                    "not 'at least', so a win-back scheduler tier fires once per user, not every day after."),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Win-back campaign support (notification_service's dormant-user
    scheduler) — no end-user JWT in that call's context, same
    require_internal pattern as the phone-OTP test-token route. Only
    student/parent accounts (admins going quiet isn't a re-engagement
    target), and only accounts that have logged in at least once —
    last_login IS NULL means never-activated, a different lifecycle stage
    entirely, not "went dormant"."""
    window_start = datetime.now(timezone.utc) - timedelta(days=inactive_days, hours=12)
    window_end = datetime.now(timezone.utc) - timedelta(days=inactive_days) + timedelta(hours=12)
    result = await db.execute(
        select(User.id, User.full_name, User.role).where(
            User.last_login.isnot(None),
            User.last_login >= window_start,
            User.last_login < window_end,
            User.role.in_([UserRole.STUDENT, UserRole.PARENT]),
            User.is_active.is_(True),
        )
    )
    return [{"user_id": str(r.id), "full_name": r.full_name, "role": r.role.value} for r in result.all()]


class InternalDeactivateBody(BaseModel):
    user_id: uuid.UUID
    actioned_by: uuid.UUID
    reason: str | None = None


@router.post("/internal/deactivate", dependencies=[Depends(require_internal)])
async def internal_deactivate_user(
    body: InternalDeactivateBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Deactivate a user account on behalf of an already-authorized admin
    action taken in another service (currently: user_service resolving a
    moderation ContentReport with action='deactivate'). The calling service
    is responsible for having verified the caller is an admin via its own
    require_admin dependency before reaching this endpoint — this route
    only trusts require_internal (Docker-network-only + shared secret),
    same as every other route in this file. `actioned_by` is the admin's
    user id, recorded in the audit log for traceability even though the
    admin's own JWT never crosses the service boundary."""
    user = await db.get(User, body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await db.commit()
    await write_audit_log(
        "user_deactivated", actor_id=body.actioned_by, actor_role="admin",
        resource_type="user", resource_id=body.user_id, result="success",
        metadata={"reason": body.reason, "via": "moderation_report"},
    )
    return {"user_id": str(body.user_id), "is_active": False}
