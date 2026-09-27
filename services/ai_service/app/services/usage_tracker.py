"""
Daily per-feature AI usage limiter.

Quota ENFORCEMENT now delegates to gamification_service's central
FeatureUsageService (POST /gamification/internal/usage/check-and-log) — the
single admin-configurable quota enforcer shared by every gated service on
the platform (AI features, video watching, quiz attempts, battle play,
chat). Replaces the old local-DB-only DAILY_LIMIT=3 so an admin can change
AI limits, and differentiate free vs premium, from the admin panel with no
deploy — previously every user got the exact same hardcoded 3/day
regardless of plan.

ai_usage_log/AIUsageLog is still WRITTEN here (for the "paper" feature
only), but purely as a historical event log now, not a quota source —
ai_crud.count_papers_generated() reads it for the parent-facing
"generated_count" lifetime stat (routes/paper_attempts.py's internal
summary endpoint), which is a different concern from today's daily quota
and must keep growing even though quota decisions no longer consult this
table.
"""
import uuid
from datetime import date, datetime

import httpx
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai_usage_log import AIUsageLog

# Local feature keys -> central FeatureLimit keys (see
# gamification_service/app/models/gamification.py's FEATURE_KEYS).
_CENTRAL_FEATURE_KEY = {
    "questions":         "ai_questions",
    "quiz":              "ai_quiz",
    "paper":             "ai_paper",
    "custom":            "ai_custom",
    "flashcards":        "flashcards",
    "revision_plan":     "revision_plan",
    "ai_chat":           "ai_chat",
    "mistake_analysis":  "mistake_analysis",
}


async def check_and_log(
    db: AsyncSession,
    user_id: str,
    feature: str,
    params: dict | None = None,
) -> int | None:
    """Increment today's usage for this user+feature against the caller's
    plan-tier limit. Raises HTTP 429 (with the central service's
    upgrade-prompt message) if the limit is already reached today.
    Returns remaining uses after this one, or None if the feature is
    unlimited for this user's tier (or admin has disabled enforcement).

    Fails OPEN (returns None, does not block) if gamification_service is
    unreachable — a dependency outage must not take down AI features
    platform-wide; the old local-DB limiter had no such single point of
    failure, so this trade-off is deliberate and worth flagging if
    gamification_service's uptime becomes a concern."""
    central_key = _CENTRAL_FEATURE_KEY.get(feature, feature)
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/usage/check-and-log",
                json={"user_id": user_id, "feature_key": central_key},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        return None

    if resp.status_code == 429:
        # gamification_service's FeatureUsageService always sets a ready-
        # to-show message on this response — forward it verbatim rather
        # than inventing wording here, so every gated feature across the
        # platform shows the exact same admin-controlled copy.
        detail = resp.json().get("detail", {})
        message = detail.get("message") if isinstance(detail, dict) else None
        raise HTTPException(status_code=429, detail=message)

    if resp.status_code != 200:
        return None

    # Historical event log for the "paper" feature only — preserves
    # count_papers_generated()'s lifetime stat now that quota decisions no
    # longer read/write this table. Best-effort: never blocks the request.
    if feature == "paper":
        try:
            db.add(AIUsageLog(
                id=uuid.uuid4(), user_id=user_id, feature=feature,
                used_date=date.today(), request_params=params,
                created_at=datetime.utcnow(),
            ))
            await db.commit()
        except Exception:
            await db.rollback()

    doc = resp.json()
    remaining = doc.get("remaining")
    return remaining
