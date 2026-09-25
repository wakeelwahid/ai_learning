from fastapi import Depends

from app.core.dependencies import get_current_user_id_and_role


async def peek_role(identity: tuple = Depends(get_current_user_id_and_role)) -> str:
    """Role of the authenticated caller — reuses the same verify-token cache
    as get_current_user_id, so this costs no extra network round-trip."""
    return identity[1]
