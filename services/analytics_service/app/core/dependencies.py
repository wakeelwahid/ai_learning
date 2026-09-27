"""JWT authentication & RBAC dependencies for analytics_service.

The actual verify/cache/require_* logic lives in _shared_auth.py (a
generated copy of services/_shared_auth/auth_core.py — see that file's
docstring for why it's a copy, not a real shared import, and re-run
tools/sync_shared_auth.py after any change there). This file just wires it
up with this service's own settings and re-exports the names every route
in this service imports.
"""
from app.core.config import settings
from app.core._shared_auth import build_auth_dependencies

_auth = build_auth_dependencies(settings)

get_current_user_id = _auth.get_current_user_id
get_current_user_id_and_role = _auth.get_current_user_id_and_role
is_admin_role = _auth.is_admin_role
require_admin = _auth.require_admin
require_teacher = _auth.require_teacher
require_internal = _auth.require_internal
