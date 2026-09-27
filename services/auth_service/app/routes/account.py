import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.crud.user_crud import UserRepository
from app.database.session import get_db
from app.models.user import User, UserRole
from app.routes._profile_check import check_profile_complete
from app.schemas.user import SetRoleRequest, UpdateAuthProfileRequest, UserResponse
from app.services.account_service import AccountService
from app.services.social_login_service import SocialLoginService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/profile-status", summary="Real backend check: does the authenticated user need to complete their profile?")
async def profile_status(current_user: User = Depends(get_current_user)):
    """Frontend route guards call this (not a client-side flag) to decide
    whether to redirect to the mandatory profile-completion screen. Backed by
    a live call to user_service — never cached client-side beyond the current
    navigation, so completing the profile takes effect immediately."""
    complete = await check_profile_complete(current_user.id, current_user.role)
    return {"profile_complete": complete}


@router.patch("/role", response_model=UserResponse, summary="One-time role choice for a brand-new phone-OTP account")
async def set_role(
    body: SetRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """A brand-new phone-OTP account is created with role=PENDING (see
    PhoneOTPService.verify_phone_otp) — the client shows a Student/Parent
    picker right after OTP verify and calls this exactly once to commit the
    choice. Locked permanently once set: any account not currently PENDING
    gets a 403, so a student can never flip themselves to parent (or back)
    later. A genuine mistake needs admin intervention via the existing
    PATCH /auth/users/{id}."""
    if current_user.role != UserRole.PENDING:
        raise HTTPException(status_code=403, detail="Role has already been set for this account.")
    if body.role not in (UserRole.STUDENT, UserRole.PARENT):
        raise HTTPException(status_code=422, detail="role must be 'student' or 'parent'.")

    repo = UserRepository(db)
    await repo.update_fields(current_user.id, role=body.role)
    await db.commit()
    updated = await repo.get_by_id(current_user.id)
    return updated


@router.put("/profile", response_model=UserResponse, summary="Update auth-layer profile (phone, avatar_url)")
async def update_auth_profile(
    body: UpdateAuthProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = AccountService(db)
    return await service.update_profile(current_user, body.model_dump(exclude_none=True))


# ── Google Disconnect ─────────────────────────────────────────────────────────

@router.post("/google/disconnect", response_model=UserResponse, summary="Unlink Google account from current user")
async def google_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the Google account link from the authenticated user.

    Rejected with 400 if the account has no password set (Google-only account),
    because disconnecting would leave the user with no way to log in.
    """
    service = SocialLoginService(db)
    return await service.disconnect_google(current_user)


# ── Account deletion ──────────────────────────────────────────────────────────

@router.delete("/me", status_code=204, summary="Soft-delete the authenticated user's account")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete the current user's account.

    Sets ``is_active = False``, anonymises the email address so the original
    address can be reused for a new registration, clears social IDs, revokes all
    device sessions (setting revoked_at=NOW()), and removes Redis session data.
    """
    service = AccountService(db)
    await service.delete_account(current_user)
