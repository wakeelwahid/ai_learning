"""Write helper for the audit_logs table (see models/audit_log.py).

Call write_audit_log() from a route/service AFTER the action it's recording
has actually happened (or failed) — this is a record of what occurred, not
a permission check. It never raises: a failed audit write must never take
down the real request it's describing. It also runs in its OWN short-lived
DB session rather than reusing the caller's, so it commits (or fails)
independently of whatever transaction the caller is mid-way through —
an audit row for a failed login, for instance, must still land even though
the login itself is about to roll back / return without ever calling
db.commit().
"""
import logging
import uuid

from app.database.session import AsyncSessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Defense in depth: even though every call site is expected to only ever
# pass non-secret context, strip these key names from `metadata` before
# writing — belt-and-suspenders against a future call site accidentally
# forwarding a raw request body that happens to contain one of these.
_DENYLIST_KEYS = {
    "password", "current_password", "new_password", "old_password",
    "token", "access_token", "refresh_token", "otp", "otp_code", "verification_code",
    "secret", "api_key", "authorization", "card_number", "cvv",
    "card", "pin",
}


def _scrub(metadata: dict | None) -> dict | None:
    if not metadata:
        return metadata
    return {k: v for k, v in metadata.items() if k.lower() not in _DENYLIST_KEYS}


async def write_audit_log(
    action: str,
    *,
    actor_id: uuid.UUID | str | None = None,
    actor_role: str | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | str | None = None,
    result: str = "success",
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Insert one audit_logs row. Never raises.

    `action` should be a short, stable, greppable event name — "login",
    "login_failed", "password_changed", "role_changed", "user_deactivated" —
    not a formatted sentence (the sentence belongs in a UI that reads this
    table later, not in the stored action itself).

    `metadata` is for small, genuinely non-sensitive event-specific detail
    (e.g. {"old_role": "student", "new_role": "parent"}) — never a password,
    token, OTP, or payment credential; see _DENYLIST_KEYS above for the
    scrub this function applies regardless of what the caller passes.
    """
    try:
        async with AsyncSessionLocal() as session:
            session.add(AuditLog(
                actor_id=uuid.UUID(str(actor_id)) if actor_id else None,
                actor_role=actor_role,
                action=action,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id is not None else None,
                result=result,
                ip_address=ip_address,
                user_agent=user_agent,
                request_id=request_id,
                metadata_json=_scrub(metadata),
            ))
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit log write failed for action=%s: %s", action, exc)
