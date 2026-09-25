"""JWT authentication & RBAC dependencies for payment_service.

The actual verify/cache/require_* logic lives in _shared_auth.py (a
generated copy of services/_shared_auth/auth_core.py — see that file's
docstring for why it's a copy, not a real shared import, and re-run
tools/sync_shared_auth.py after any change there). This file just wires it
up with this service's own settings and re-exports the names every route
in this service imports.

`verify_parent_link` / `require_purchase_approval` / this service's own
`require_internal` (parent/child relationship + purchase-approval checks
via user_service) are service-specific business logic, not part of this
module — they live in app/routes/_common.py alongside the parent-payment
routes that use them, and are a DIFFERENT pattern (calling another
service's API to check a relationship, not JWT verification).
"""
from app.core.config import settings
from app.core._shared_auth import bearer, build_auth_dependencies

_auth = build_auth_dependencies(settings)

get_current_user_id = _auth.get_current_user_id
get_current_user_id_and_role = _auth.get_current_user_id_and_role
is_admin_role = _auth.is_admin_role
require_admin = _auth.require_admin
verify_owner_or_admin = _auth.verify_owner_or_admin
