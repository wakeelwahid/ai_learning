from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.models.user import UserRole
from app.crud.user_crud import UserRepository
from app.schemas.session import TokenResponse
from app.services.session_service import SessionService


class SocialLoginService:
    """Google social login — distinct from the OAuth redirect-URL /
    token-exchange logic, which lives in oauth_service.py."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.sessions = SessionService(db)

    # ── Social Login ──────────────────────────────────────────────────────────

    async def social_login(
        self,
        provider: str,
        social_id: str,
        email: str,
        name: str | None = None,
        avatar_url: str | None = None,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> TokenResponse:
        # Try to find by social ID first
        if provider == "google":
            user = await self.user_repo.get_by_google_id(social_id)
        else:
            user = None

        if not user:
            # Fall back to email lookup (user may have registered with email)
            user = await self.user_repo.get_by_email(email)
            if user:
                # Never auto-link a privileged account from a Google email
                # match alone: the operator may not control the email's domain
                # (the default admin is admin@edtech.com), so matching it would
                # hand an attacker who owns that Google identity an admin/
                # teacher session. These accounts must link Google explicitly
                # while already logged in, never via this login path.
                if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.TEACHER):
                    raise ForbiddenError(
                        "This account can't sign in with Google. Use your email and password."
                    )
                # Link social ID to existing (student/parent) account
                await self.user_repo.update_social_id(user.id, provider, social_id, avatar_url)
                await self.user_repo.mark_verified(user.id)
            else:
                # Create new user
                user = await self.user_repo.create(
                    email=email,
                    hashed_password=None,
                    role=UserRole.STUDENT,
                    is_verified=True,
                    avatar_url=avatar_url,
                    **{f"{provider}_id": social_id},
                )

        if not user.is_active:
            raise ForbiddenError("Account is deactivated")

        await self.db.commit()
        return await self.sessions.create_session(user, user_agent=user_agent, ip_address=ip_address)

    # ── Google disconnect ────────────────────────────────────────────────────

    async def disconnect_google(self, current_user):
        if not current_user.hashed_password:
            raise HTTPException(
                status_code=400,
                detail="Cannot disconnect Google: this account has no password. Set a password first.",
            )
        if not current_user.google_id:
            raise HTTPException(status_code=400, detail="No Google account is linked.")

        await self.user_repo.update_fields(current_user.id, google_id=None)
        await self.db.commit()
        await self.db.refresh(current_user)
        return current_user
