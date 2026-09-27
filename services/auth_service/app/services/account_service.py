import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.redis import get_redis
from app.models.user import UserRole
from app.crud.user_crud import UserRepository
from app.schemas.user import UserResponse
from app.services.session_service import SessionService


class AccountService:
    """Profile/account management: auth-layer profile updates, admin user
    management, and account deletion."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.sessions = SessionService(db)

    # ── Profile ───────────────────────────────────────────────────────────────

    async def update_profile(self, current_user, update_data: dict):
        if not update_data:
            return current_user
        await self.user_repo.update_fields(current_user.id, **update_data)
        await self.db.commit()
        await self.db.refresh(current_user)
        return current_user

    # ── Admin user management ────────────────────────────────────────────────

    async def admin_update_user(self, user_id: uuid.UUID, update_data: dict, admin) -> UserResponse:
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        if user_id == admin.id:
            raise HTTPException(
                status_code=403,
                detail="Cannot modify your own account through this endpoint",
            )

        target = await self.user_repo.get_by_id(user_id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")

        if "role" in update_data:
            try:
                update_data["role"] = UserRole(update_data["role"])
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid role value")

        # Elevating/deactivating an admin or super_admin account, or granting
        # admin/super_admin, requires super_admin — a plain admin cannot use this
        # endpoint to promote themselves/others or touch peer/superior accounts.
        high_privilege_roles = (UserRole.ADMIN, UserRole.SUPER_ADMIN)
        touches_high_privilege = target.role in high_privilege_roles or (
            "role" in update_data and update_data["role"] in high_privilege_roles
        )
        if touches_high_privilege and admin.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Super admin access required to modify admin/super_admin accounts or grant admin roles",
            )

        await self.user_repo.update_fields(user_id, **update_data)
        await self.db.commit()

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    # ── Account deletion ──────────────────────────────────────────────────────

    async def delete_account(self, current_user) -> None:
        """Soft-delete the account: deactivate, anonymise email, clear the
        live phone number (after archiving it to audit_logs), unlink socials,
        revoke all sessions/tokens, and clear Redis session data.

        Why `phone` is set to NULL rather than a synthetic placeholder: the
        `phone` column has a UNIQUE index, and a genuinely new person must be
        able to register with this same real phone number later without
        being blocked by (or ever merged into) this deactivated row. Postgres
        treats NULL <> NULL, so a UNIQUE index allows unlimited NULL phones —
        clearing it frees the number immediately. It's also the only value
        that can NEVER be re-matched by get_by_phone()/get_by_identifier(),
        unlike an earlier fix here that reused a synthetic
        f"del_{uuid.hex[:15]}" value: that unblocked the index too, but threw
        the original phone away with no record of it anywhere. We still need
        the original number for support/compliance ("what number was on this
        deleted account?"), so it's written to the audit_logs table (see
        app/core/audit.py, app/models/audit_log.py) BEFORE it's cleared here.
        This account row itself stays permanently is_active=False, so even
        though the phone is free for reuse by a *new* row, this exact row can
        never log back in (session_service/phone_otp_service both gate on
        is_active).
        """
        original_phone = current_user.phone
        deleted_email = f"deleted_{current_user.id}@deleted.invalid"

        # Archive the original phone (and email) before it's gone from the
        # live row — write_audit_log runs in its own session/transaction and
        # never raises, so a logging hiccup can't block the actual deletion.
        await write_audit_log(
            "account_deleted",
            actor_id=current_user.id,
            actor_role=getattr(current_user.role, "value", current_user.role),
            resource_type="user",
            resource_id=current_user.id,
            result="success",
            metadata={
                "original_phone": original_phone,
                "original_email": current_user.email,
                "deleted_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        await self.user_repo.update_fields(
            current_user.id,
            is_active=False,
            email=deleted_email,
            phone=None,
            google_id=None,
            facebook_id=None,
        )
        await self.db.commit()

        await self.sessions.logout_all(current_user.id)
        await self.db.commit()

        try:
            r = await get_redis()
            await r.delete(f"otp_attempts:{current_user.id}")
            async for key in r.scan_iter(f"session:{current_user.id}:*"):
                await r.delete(key)
        except Exception:
            pass  # Redis unavailable — proceed silently
