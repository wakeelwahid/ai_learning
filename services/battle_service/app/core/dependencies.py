"""JWT authentication & RBAC dependencies for battle_service.

verify_token, get_current_user_id and require_internal are re-exported
from _shared_auth.py (a generated copy of services/_shared_auth/auth_core.py
— see that file's docstring for why it's a copy, not a real shared import).

get_current_user_claims, require_admin and decode_ws_user_id stay LOCAL,
deliberately not shared: this service's routes read the verified identity
as `claims["sub"]` (a plain string, matching the old local-JWT-payload
shape) rather than the shared module's `(uuid.UUID, str)` tuple, and
decode_ws_user_id's WebSocket-close contract with app/routes/battle.py
depends on that exact shape and on always raising HTTPException (never
ValueError) on failure. Changing this shape here would be a real behavior
change, not a refactor — see the extended note on each function below.
"""
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import settings
from app.core._shared_auth import bearer, build_auth_dependencies

_auth = build_auth_dependencies(settings)

verify_token = _auth.verify_token
get_current_user_id = _auth.get_current_user_id
require_internal = _auth.require_internal

ADMIN_ROLES = ("admin", "super_admin")

__all__ = [
    "ADMIN_ROLES",
    "verify_token",
    "get_current_user_id",
    "get_current_user_claims",
    "require_admin",
    "require_internal",
    "decode_ws_user_id",
]


async def get_current_user_claims(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    """Return the verified caller identity as `{"sub": ..., "role": ..., "is_active": ...}`.

    Used by routes that need to implement "caller must own this resource, OR
    be an admin" checks — `require_admin` alone can't express that because it
    hard-403s any non-admin before the route gets a chance to check ownership.

    The `sub` key name matches the old local-JWT-payload shape (routes here
    do `claims["sub"]`), even though auth_service's verify response uses
    `user_id`.
    """
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    data = await verify_token(creds.credentials)
    return {"sub": data["user_id"], "role": data.get("role"), "is_active": data.get("is_active")}


async def require_admin(
    claims: dict = Depends(get_current_user_claims),
) -> uuid.UUID:
    """Require admin or super_admin role."""
    if claims.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return uuid.UUID(claims["sub"])


async def decode_ws_user_id(token: str | None) -> uuid.UUID:
    """Verify a JWT for WebSocket auth and return the caller's user id.

    WebSockets can't send an `Authorization` header from a browser, so the
    access token is passed as a `?token=` query param instead — this helper
    applies the exact same verification as `get_current_user_id` (calls the
    same `verify_token`, backed by auth_service) so WS identity can never
    diverge from REST identity. Callers MUST treat any failure here as fatal
    (close the socket) rather than falling back to a client-supplied id.

    Raises HTTPException on failure — missing token (401), invalid/expired
    token (401), or auth_service unreachable (503). The WS handler in
    battle.py specifically catches `HTTPException` to close the socket with
    code 1008, so this must keep raising that type.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    data = await verify_token(token)
    return uuid.UUID(data["user_id"])
