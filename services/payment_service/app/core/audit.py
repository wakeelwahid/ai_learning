"""Write helper for the audit_logs table (see models/audit_log.py).

Identical contract to auth_service's app/core/audit.py — see that module's
docstring for the full rationale (never raises, own short-lived session,
denylist-scrubbed metadata). Kept as a separate copy rather than a shared
package because this platform has no shared library across services;
each service is fully independent by design.
"""
import logging
import uuid

from app.database.session import AsyncSessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

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

    `metadata` is for small, non-sensitive event-specific detail (e.g.
    {"amount_paise": 99900, "plan": "monthly"}) — never a card number, CVV,
    or raw gateway secret; see _DENYLIST_KEYS above for the scrub applied
    regardless of what the caller passes.
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
