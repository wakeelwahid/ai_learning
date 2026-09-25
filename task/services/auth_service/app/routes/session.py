import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.dependencies import get_current_user
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.database.session import get_db
from app.models.user import User
from app.routes._email import fire_reset_email  # noqa: F401
from app.schemas.session import (
    ChangePasswordRequest,
    ForgotPasswordRequest,  # noqa: F401
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,  # noqa: F401
    TokenResponse,
)
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Login (email OR phone) ────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Login with **email address or phone number** + password."""
    service = SessionService(db)
    ip = request.client.host if request.client else None
    ua = request.headers.get("User-Agent")
    try:
        result = await service.login(body, user_agent=ua, ip_address=ip)
    except (UnauthorizedError, ForbiddenError) as exc:
        # A failed login is exactly as important to have logged as a
        # successful one — actor_id is None here on purpose: the identifier
        # supplied might not even correspond to a real user, and logging
        # the raw identifier itself (email/phone) would put PII in a table
        # that's meant to hold structured events, not free-text lookups.
        await write_audit_log(
            "login_failed", result="failure", ip_address=ip, user_agent=ua,
            metadata={"reason": str(exc.detail if hasattr(exc, "detail") else exc)[:200]},
        )
        raise
    try:
        actor_id = decode_access_token(result.access_token).get("sub")
    except JWTError:
        actor_id = None
    await write_audit_log("login", actor_id=actor_id, result="success", ip_address=ip, user_agent=ua)
    return result


@router.post("/token", response_model=TokenResponse, include_in_schema=True,
             summary="Swagger-compatible token endpoint (username = email or phone)")
async def token_form(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """OAuth2 password-flow endpoint for Swagger Authorize button.
    Pass email address or phone number in the `username` field."""
    service = SessionService(db)
    body = LoginRequest(identifier=form.username, password=form.password)
    return await service.login(
        body,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )


# ── Refresh / Logout ──────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    return await service.refresh(body.refresh_token)


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    access_jti: str | None = None
    access_exp: datetime | None = None
    actor_id: str | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = decode_access_token(auth_header[7:])
            access_jti = payload.get("jti")
            actor_id = payload.get("sub")
            exp = payload.get("exp")
            if exp:
                access_exp = datetime.fromtimestamp(exp, tz=timezone.utc)
        except JWTError:
            pass

    service = SessionService(db)
    await service.logout(body.refresh_token, access_jti=access_jti, access_exp=access_exp)
    await write_audit_log(
        "logout", actor_id=actor_id, result="success",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
    )
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    await service.logout_all(current_user.id)
    return {"message": "All sessions terminated"}


# ── Forgot / Reset password ───────────────────────────────────────────────────
# Disabled along with email/password login itself — only admin accounts use
# a password now, and this pair was never wired into the admin panel's UI.
# AuthService.forgot_password() / reset_password() are untouched.

# @router.post("/forgot-password")
# async def forgot_password(
#     body: ForgotPasswordRequest,
#     background_tasks: BackgroundTasks,
#     db: AsyncSession = Depends(get_db),
# ):
#     """Send a password-reset link to the registered email address."""
#     service = AuthService(db)
#     raw_token = await service.forgot_password(body.email)
#     if raw_token:
#         background_tasks.add_task(fire_reset_email, body.email, raw_token)
#     # Always respond 200 to avoid email enumeration
#     return {"message": "If that email is registered you will receive a reset link shortly."}


# @router.post("/reset-password")
# async def reset_password(
#     body: ResetPasswordRequest,
#     db: AsyncSession = Depends(get_db),
# ):
#     service = AuthService(db)
#     await service.reset_password(body.token, body.new_password)
#     return {"message": "Password reset successfully"}


# ── Change password (authenticated) ──────────────────────────────────────────

@router.post("/change-password", summary="Change password for the currently authenticated user")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the authenticated user's password.

    Requires a valid Bearer token. Verifies ``current_password`` against the
    stored hash, then replaces it with a bcrypt hash of ``new_password``.
    All other active sessions are revoked after the change.
    """
    service = SessionService(db)
    ip = request.client.host if request.client else None
    ua = request.headers.get("User-Agent")
    try:
        await service.change_password(current_user, body.current_password, body.new_password)
    except (UnauthorizedError, ForbiddenError):
        await write_audit_log(
            "password_changed", actor_id=current_user.id, actor_role=current_user.role.value,
            resource_type="user", resource_id=current_user.id, result="failure",
            ip_address=ip, user_agent=ua,
        )
        raise
    await write_audit_log(
        "password_changed", actor_id=current_user.id, actor_role=current_user.role.value,
        resource_type="user", resource_id=current_user.id, result="success",
        ip_address=ip, user_agent=ua,
    )
    return {"message": "Password changed successfully"}
