import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, is_admin_role, verify_owner_or_admin
from app.database.session import get_db
from app.models.gamification import EDUPOINTS_COSTS, EduPointEvent, EduPointItem
from app.routes._common import peek_role
from app.schemas.gamification import (
    AwardEduPointsRequest,
    EduPointsBalanceResponse,
    EduPointsHistoryEntry,
    RedemptionResponse,
    ShopItem,
    SpendEduPointsRequest,
)
from app.services.gamification_service import EduPointsService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── EduPoints endpoints ───────────────────────────────────────────────────────

@router.post("/edupoints/award")
async def award_edupoints(
    body: AwardEduPointsRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Award EduPoints for an earning event — committed before the response
    is sent (previously dispatched via FastAPI BackgroundTasks, which runs
    AFTER the response with no persistence and silently drops the award on a
    crash/restart between response and task execution — same fix as
    routes/xp_level.py::award_xp; EduPointsService.award is already called
    synchronously elsewhere with no issue).

    Phase 11: Only admins or the authenticated user themselves may award
    EduPoints. Prevents IDOR where a user could forge body.user_id to mint
    points into another user's balance.

    Phase 12: every event except DAILY_LOGIN requires a reference_id, and
    repeats of the same (user_id, event, reference_id) are a no-op — see
    EduPointsService.award / the matching XP fix in routes/xp_level.py for
    the full rationale. YOUTUBE_VERIFIED stays admin-gated separately
    upstream (only ever called by the admin YouTube-claim approval flow).
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot award EduPoints to another user.")
    if body.event != EduPointEvent.DAILY_LOGIN and not body.reference_id:
        raise HTTPException(
            status_code=422,
            detail=f"reference_id is required for event '{body.event.value}'.",
        )
    result = await EduPointsService(db).award(body.user_id, body.event, body.reference_id)
    await db.commit()
    return result


@router.post("/edupoints/spend", response_model=RedemptionResponse)
async def spend_edupoints(
    body: SpendEduPointsRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Spend EduPoints to unlock an item (synchronous — returns result immediately).

    Phase 11: Only admins or the authenticated user themselves may spend a
    user's EduPoints. Prevents IDOR where a user could forge body.user_id to
    drain another user's balance.
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot spend another user's EduPoints.")
    result = await EduPointsService(db).spend(body.user_id, body.item, body.reference_id)
    await db.commit()
    return RedemptionResponse(
        item_key=result["item_key"],
        cost=result["cost"],
        balance_after=result["balance_after"],
        message=f"'{body.item.value}' unlocked successfully!",
    )


@router.get("/edupoints/balance/{user_id}", response_model=EduPointsBalanceResponse, dependencies=[Depends(verify_owner_or_admin)])
async def get_edupoints_balance(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    balance = await EduPointsService(db).get_balance(user_id)
    return EduPointsBalanceResponse(**balance)


@router.get("/edupoints/history/{user_id}", response_model=list[EduPointsHistoryEntry], dependencies=[Depends(verify_owner_or_admin)])
async def get_edupoints_history(
    user_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    rows = await EduPointsService(db).get_history(user_id, limit)
    return rows


@router.get("/edupoints/shop/{user_id}", response_model=list[ShopItem], dependencies=[Depends(verify_owner_or_admin)])
async def get_shop(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return all shop items with ownership status for this user."""

    _NAMES: dict[str, tuple[str, str]] = {
        "chapter_quiz_pack":   ("Chapter Quiz Pack",        "quiz"),
        "subject_quiz_pack":   ("Subject Quiz Pack",        "quiz"),
        "advanced_quiz_pack":  ("Advanced Quiz Pack",       "quiz"),
        "chapter_flashcards":  ("Chapter Flashcards",       "flashcards"),
        "subject_flashcards":  ("Subject Flashcards",       "flashcards"),
        "chapter_pyq_pack":    ("Chapter PYQ Pack",         "pyq"),
        "subject_pyq_pack":    ("Subject PYQ Pack",         "pyq"),
        "complete_exam_pyq":   ("Complete Exam PYQ Pack",   "pyq"),
        "tech_videos":         ("Technology Videos",        "videos"),
        "ai_learning_videos":  ("AI Learning Videos",       "videos"),
        "career_videos":       ("Career Guidance Videos",   "videos"),
        "frame_bronze":        ("Bronze Frame",             "profile"),
        "frame_silver":        ("Silver Frame",             "profile"),
        "frame_gold":          ("Gold Frame",               "profile"),
        "profile_theme":       ("Profile Theme",            "profile"),
        "premium_badge":       ("Premium Badge",            "profile"),
    }

    owned = set(await EduPointsService(db).get_owned_items(user_id))
    items = []
    for item in EduPointItem:
        name, category = _NAMES.get(item.value, (item.value, "other"))
        items.append(ShopItem(
            key=item.value,
            name=name,
            cost=EDUPOINTS_COSTS[item],
            category=category,
            owned=item.value in owned,
        ))
    return items
