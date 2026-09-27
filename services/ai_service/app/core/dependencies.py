"""JWT authentication & RBAC dependencies for ai_service.

The actual verify/cache/require_* logic lives in _shared_auth.py (a
generated copy of services/_shared_auth/auth_core.py — see that file's
docstring for why it's a copy, not a real shared import, and re-run
tools/sync_shared_auth.py after any change there). This file wires it up
with this service's own settings, re-exports the names every route in
this service imports, and keeps parent_has_approved_link — a dependency
genuinely specific to ai_service's parent-chat exemption, not shared with
any other service.

Subscription-tier gating (`require_basic_plan` / `require_premium_plan`,
formerly here) has been replaced platform-wide by
gamification_service's FeatureUsageService — an admin-configurable daily
quota per feature per plan tier (free/premium), rather than a hard
all-or-nothing block on free users. See app/services/usage_tracker.py.
"""
import uuid

import httpx

from app.core.config import settings
from app.core._shared_auth import bearer, build_auth_dependencies

_auth = build_auth_dependencies(settings)

verify_token = _auth.verify_token
get_current_user_id = _auth.get_current_user_id
get_current_user_id_and_role = _auth.get_current_user_id_and_role
get_optional_user_id = _auth.get_optional_user_id
is_admin_role = _auth.is_admin_role
require_admin = _auth.require_admin
require_internal = _auth.require_internal


async def parent_has_approved_link(parent_id: uuid.UUID, child_id: uuid.UUID) -> bool:
    """Ask user_service (owner of parent_profiles) whether this parent has an
    APPROVED link to this child. Fails closed on any error/timeout.

    Backs /ai/chat's parent exemption from the plan check: parents get the
    general chat free to ask about THEIR child (a monitoring feature, not the
    paid student AI Tutor), but only for a child who actually approved the
    link — the previous version exempted the parent role unconditionally,
    which was both a paywall bypass for any parent account and unscoped to
    any real child.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parent-link-check",
                params={"parent_id": str(parent_id), "child_id": str(child_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
            if resp.status_code == 200:
                return bool(resp.json().get("linked", False))
    except Exception:
        pass
    return False
