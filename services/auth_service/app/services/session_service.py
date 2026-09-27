import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.redis import blacklist_jti
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.user import UserRole
from app.crud.user_crud import UserRepository
from app.crud.session_crud import DeviceSessionRepository, RefreshTokenRepository
from app.schemas.session import LoginRequest, TokenResponse


class SessionService:
    """Session/token lifecycle: password login, refresh, logout, device
    sessions, and the shared `create_session` primitive every other login
    path (phone OTP, social login, internal test-token) builds on."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = RefreshTokenRepository(db)
        self.device_repo = DeviceSessionRepository(db)

    # ── Login ────────────────────────────────────────────────────────────────

    async def login(
        self,
        data: LoginRequest,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> TokenResponse:
        user = await self.user_repo.get_by_identifier(data.identifier)
        if not user:
            raise UnauthorizedError("Invalid credentials")

        # Email/password login is admin-only — students and parents sign in
        # with Mobile Number + OTP instead (see send_phone_otp/verify_phone_otp
        # below). This endpoint stays reachable (the admin panel still uses
        # it) but is checked before the password so a correct password on a
        # student/parent account never grants a session through this path.
        if user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            raise UnauthorizedError("Please sign in with your mobile number and OTP instead.")

        if not user.hashed_password:
            raise UnauthorizedError("This account uses social login. Please sign in with Google.")

        if not verify_password(data.password, user.hashed_password):
            raise UnauthorizedError("Invalid credentials")

        if not user.is_active:
            raise ForbiddenError("Account is deactivated")

        return await self.create_session(user, user_agent=user_agent, ip_address=ip_address)

    # ── Token management ─────────────────────────────────────────────────────

    async def refresh(self, raw_token: str) -> TokenResponse:
        token_hash = hash_token(raw_token)
        record = await self.token_repo.get_by_hash(token_hash)
        if not record:
            raise UnauthorizedError("Invalid or expired refresh token")

        # ── Inactivity check ────────────────────────────────────────────────────
        # If the device session hasn't been seen for > INACTIVITY_EXPIRE_DAYS,
        # the user is considered inactive and must log in again.
        if record.session_id:
            device_session = await self.device_repo.get_by_session_id(record.session_id)
            if device_session:
                inactive_days = (datetime.now(timezone.utc) - device_session.last_seen).days
                if inactive_days >= settings.INACTIVITY_EXPIRE_DAYS:
                    await self.token_repo.revoke_all_for_user(record.user_id)
                    await self.device_repo.revoke_all_for_user(record.user_id)
                    await self.db.commit()
                    raise UnauthorizedError(
                        "Your session has expired due to inactivity. Please log in again."
                    )
                # Update last-seen so active users keep their window rolling
                await self.device_repo.touch(record.session_id)

        revoked_here = await self.token_repo.revoke(token_hash)
        if not revoked_here:
            # Lost a race against a concurrent refresh call using this same
            # (single-use) token — the other request already revoked it
            # between our get_by_hash() read and this revoke() write. That's
            # exactly the refresh-token-reuse signal token rotation exists to
            # catch, so treat it as theft: kill the whole session's token
            # family rather than letting two independent sessions silently
            # coexist from one stolen/replayed token.
            await self.token_repo.revoke_all_for_user(record.user_id)
            if record.session_id:
                await self.device_repo.revoke_all_for_user(record.user_id)
            await self.db.commit()
            raise UnauthorizedError("Invalid or expired refresh token")

        user = await self.user_repo.get_by_id(record.user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or deactivated")

        access_token, _ = create_access_token(str(user.id), user.role.value)
        new_raw, new_hash = create_refresh_token()

        await self.token_repo.create(
            user_id=user.id,
            token_hash=new_hash,
            session_id=record.session_id,   # preserve session continuity
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        await self.db.commit()

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_raw,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def logout(
        self,
        raw_token: str,
        access_jti: str | None = None,
        access_exp: datetime | None = None,
    ) -> None:
        token_hash = hash_token(raw_token)
        record = await self.token_repo.get_by_hash(token_hash)
        await self.token_repo.revoke(token_hash)
        if record:
            if record.session_id:
                await self.device_repo.revoke_session(record.session_id, record.user_id)
            else:
                await self.device_repo.revoke_all_for_user(record.user_id)
        # Blacklist the current access token so it cannot be reused until expiry
        if access_jti and access_exp:
            await blacklist_jti(access_jti, access_exp)

    async def logout_all(self, user_id: uuid.UUID) -> None:
        await self.token_repo.revoke_all_for_user(user_id)
        await self.device_repo.revoke_all_for_user(user_id)

    # ── Password change ──────────────────────────────────────────────────────

    async def change_password(self, current_user, current_password: str, new_password: str) -> None:
        """Verify the current password, replace it, and revoke all other sessions."""
        if not current_user.hashed_password:
            raise HTTPException(
                status_code=400,
                detail="This account uses social login and has no password to change.",
            )

        if not verify_password(current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")

        await self.user_repo.update_password(current_user.id, hash_password(new_password))
        await self.db.commit()

        await self.logout_all(current_user.id)

    # ── Device sessions ──────────────────────────────────────────────────────

    async def list_active_sessions(self, user_id: uuid.UUID) -> list[dict]:
        sessions = await self.device_repo.get_active_for_user(user_id)
        return [
            {
                "session_id": s.session_id,
                "device_type": s.device_type,
                "os": s.os,
                "browser": s.browser,
                "ip_address": s.ip_address,
                "last_seen": s.last_seen.isoformat(),
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ]

    async def revoke_device_session(self, session_id: str, user_id: uuid.UUID) -> None:
        # Look up and mutate the SAME column (the public `session_id` hex token
        # returned by GET /auth/sessions), scoped to the caller's own user_id, so
        # the ownership check and the mutation always target the identical row.
        session = await self.device_repo.get_by_session_id_for_user(session_id, user_id)
        if not session:
            raise ForbiddenError("Not authorized to revoke this session")
        revoked = await self.device_repo.revoke_session(session_id, user_id)
        if not revoked:
            raise ForbiddenError("Not authorized to revoke this session")
        await self.db.commit()

    # ── Internal ──────────────────────────────────────────────────────────────

    @staticmethod
    async def _ping_daily_activity(user_id: uuid.UUID) -> None:
        """Best-effort logged_in=true for today in analytics_service's
        daily_activity — never raises; login must succeed regardless."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/activity",
                    json={"user_id": str(user_id), "logged_in": True},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass

    async def create_session(self, user, user_agent: str | None = None, ip_address: str | None = None) -> TokenResponse:
        access_token, _ = create_access_token(str(user.id), user.role.value)
        raw_refresh, refresh_hash = create_refresh_token()

        await self.user_repo.update_last_login(user.id)
        await self._ping_daily_activity(user.id)

        session_id = secrets.token_hex(32)
        device_type = "mobile" if user_agent and re.search(r"(Mobile|Android|iPhone)", user_agent) else "desktop"
        os_name = browser_name = None
        if user_agent:
            if "Windows" in user_agent: os_name = "Windows"
            elif "Mac" in user_agent: os_name = "macOS"
            elif "Linux" in user_agent: os_name = "Linux"
            elif "Android" in user_agent: os_name = "Android"
            elif "iPhone" in user_agent or "iPad" in user_agent: os_name = "iOS"
            if "Chrome" in user_agent: browser_name = "Chrome"
            elif "Firefox" in user_agent: browser_name = "Firefox"
            elif "Safari" in user_agent: browser_name = "Safari"
            elif "Edge" in user_agent: browser_name = "Edge"

        await self.device_repo.create(
            user_id=user.id,
            session_id=session_id,
            device_type=device_type,
            os=os_name,
            browser=browser_name,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        # Store refresh token AFTER device session so we can link via session_id
        await self.token_repo.create(
            user_id=user.id,
            token_hash=refresh_hash,
            session_id=session_id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        await self.db.commit()

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
