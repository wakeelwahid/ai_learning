"""
AnalyticsService — cache-first dashboard reads.

Read path:
  1. Check Redis dashboard cache (TTL 30 min)
  2. On miss: query PostgreSQL, populate cache, return

Write path:
  1. Write to PostgreSQL
  2. Invalidate student dashboard cache so next read is fresh
     (see app.services.progress_writer)
"""
import uuid

from app.core.cache import (
    TTL_DASHBOARD,
    cache_get, cache_set,
    dashboard_key,
)
from app.crud import progress_crud, weak_topic_crud
from app.schemas.dashboard import DashboardResponse
from app.schemas.weak_topic import WeakTopicItem


class AnalyticsService:

    @staticmethod
    async def get_student_dashboard(db, user_id: uuid.UUID) -> DashboardResponse:
        """Cache-first dashboard. Returns cached result within TTL; else rebuilds from DB."""
        key    = dashboard_key(str(user_id))
        cached = await cache_get(key)
        if cached:
            # Rehydrate Pydantic model from cache dict
            return DashboardResponse(**cached)

        # Cache miss — compute from PostgreSQL
        progress_rows = await progress_crud.get_student_progress(db, user_id)
        weak_topics   = await weak_topic_crud.get_weak_topics(db, user_id, max_accuracy=60.0)

        total_videos  = sum(p.videos_watched    for p in progress_rows)
        total_quizzes = sum(p.quizzes_completed  for p in progress_rows)
        avg_score     = (
            sum(p.avg_quiz_score for p in progress_rows) / len(progress_rows)
            if progress_rows else 0.0
        )

        dashboard = DashboardResponse(
            total_videos_watched=total_videos,
            total_quizzes_completed=total_quizzes,
            avg_quiz_score=round(avg_score, 2),
            chapters_in_progress=len(progress_rows),
            weak_topics=[
                WeakTopicItem(
                    topic_id=str(t.topic_id),
                    accuracy=round(t.accuracy, 2),
                    attempts=t.attempts,
                )
                for t in weak_topics
            ],
        )

        # Populate cache
        await cache_set(key, dashboard.model_dump(), TTL_DASHBOARD)
        return dashboard
