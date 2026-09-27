import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, is_admin_role
from app.crud.gamification_crud import create_share_event
from app.database.session import get_db
from app.routes._common import peek_role
from app.schemas.gamification import ShareCardResponse, ShareEventRequest

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Share Card endpoints ──────────────────────────────────────────────────────

SHARE_CARD_META: dict[str, dict] = {
    "streak": {
        "title": "Day Streak!",
        "gradient_start": "#f97316",
        "gradient_end": "#dc2626",
        "icon": "fire",
    },
    "badge": {
        "title": "Badge Earned!",
        "gradient_start": "#9333ea",
        "gradient_end": "#7c3aed",
        "icon": "star",
    },
    "quiz_perfect": {
        "title": "Perfect Score!",
        "gradient_start": "#10b981",
        "gradient_end": "#059669",
        "icon": "hundred",
    },
    "battle_win": {
        "title": "Battle Won!",
        "gradient_start": "#ef4444",
        "gradient_end": "#e11d48",
        "icon": "trophy",
    },
    "level_up": {
        "title": "Level Up!",
        "gradient_start": "#3b82f6",
        "gradient_end": "#4f46e5",
        "icon": "bolt",
    },
}


@router.get("/share-card/{user_id}/{achievement_type}", response_model=ShareCardResponse, dependencies=[Depends(get_current_user_id)])
async def get_share_card(user_id: uuid.UUID, achievement_type: str):
    """Return share card metadata for a given achievement type."""
    meta = SHARE_CARD_META.get(achievement_type)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Unknown achievement_type: {achievement_type}")
    return ShareCardResponse(
        achievement_type=achievement_type,
        title=meta["title"],
        subtitle=f"Check out my achievement on EduPlatform!",
        icon=meta["icon"],
        gradient_start=meta["gradient_start"],
        gradient_end=meta["gradient_end"],
        referral_code=None,
    )


@router.post("/share-event", status_code=201)
async def record_share_event(
    body: ShareEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Record a share event when a user shares an achievement card.

    Phase 11: Only admins or the authenticated user themselves may record a
    share event for a given user_id. Prevents IDOR where a user could forge
    body.user_id to attribute a share event to another user.
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot record a share event for another user.")
    await create_share_event(db, body.user_id, body.achievement_type, body.platform)
    return {"recorded": True}
