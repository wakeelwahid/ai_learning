import uuid

from fastapi import HTTPException


def assert_own_data(
    requesting_user_id: uuid.UUID,
    path_user_id: uuid.UUID,
    role: str | None = None,
) -> None:
    """Phase 11: IDOR guard — students can only access their own analytics.

    Admin/super_admin are exempt, matching the bypass already used by
    parent.py's parent_student_summary. `role` is optional (defaults to
    None = no bypass) so existing callers that don't have a role available
    keep their current self-only behavior unchanged.
    """
    if role in ("admin", "super_admin"):
        return
    if requesting_user_id != path_user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: you can only view your own analytics.",
        )
