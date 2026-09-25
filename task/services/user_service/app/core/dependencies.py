"""JWT authentication & RBAC dependencies for user_service.

The actual verify/cache/require_* logic lives in _shared_auth.py (a
generated copy of services/_shared_auth/auth_core.py — see that file's
docstring for why it's a copy, not a real shared import, and re-run
tools/sync_shared_auth.py after any change there). This file wires it up
with this service's own settings, re-exports the names every route in
this service imports, and keeps require_roles — a dependency factory
genuinely specific to user_service (no other service pre-builds
role-list-gated dependencies this way).

`verify_token` is exposed at module level (no leading underscore) because
app/routes/chat_ws.py's WebSocket handler also needs to verify a
bearer token — WebSocket handshakes can't carry a `Depends(HTTPBearer())`
dependency (no Authorization header on the handshake in browsers/RN), so it
imports and calls this function directly with the token pulled from the
`?token=` query param, guaranteeing WS identity is verified via the exact
same auth_service call + cache as the REST paths, with no local secret and
no hardcoded fallback.
"""
import uuid

from fastapi import Depends, HTTPException, status

from app.core.config import settings
from app.core._shared_auth import bearer, build_auth_dependencies

_auth = build_auth_dependencies(settings)

get_redis = _auth.get_redis
verify_token = _auth.verify_token
get_current_user_id = _auth.get_current_user_id
get_current_user_id_and_role = _auth.get_current_user_id_and_role
is_admin_role = _auth.is_admin_role
require_admin = _auth.require_admin
require_internal = _auth.require_internal


def require_roles(*roles: str):
    """Dependency factory: require the caller's verified role to be one of
    `roles`. admin/super_admin are NOT implicitly included, so each
    pre-built dependency below lists its full allowed role set
    explicitly."""
    allowed = set(roles)

    async def checker(
        identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    ) -> uuid.UUID:
        user_id, role = identity
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {sorted(allowed)}",
            )
        return user_id

    return checker


# Pre-built role dependencies:
require_teacher = require_roles("teacher", "admin", "super_admin")
require_parent = require_roles("parent", "admin", "super_admin")
require_student = require_roles("student", "teacher", "admin", "super_admin")
