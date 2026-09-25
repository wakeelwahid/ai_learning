import uuid

from fastapi import HTTPException, status


def ensure_self(user_id: uuid.UUID, caller_id: uuid.UUID) -> None:
    """Raise 403 unless the path user_id matches the authenticated caller."""
    if user_id != caller_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another user's referral data",
        )
