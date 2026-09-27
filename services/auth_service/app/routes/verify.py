import logging

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import TokenVerifyResponse, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Inter-service token verification ────────────────────────────────────────
# Called by every OTHER service to verify a bearer token instead of decoding
# it locally — auth_service is the single authentication authority. Callers
# should cache the result (keyed by token) in their own Redis for a short TTL
# to avoid a network round-trip on every request.

@router.get("/verify", response_model=TokenVerifyResponse, summary="Verify a bearer token (for other services)")
async def verify_token(current_user: User = Depends(get_current_user)):
    return TokenVerifyResponse(user_id=current_user.id, role=current_user.role, is_active=current_user.is_active)


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
