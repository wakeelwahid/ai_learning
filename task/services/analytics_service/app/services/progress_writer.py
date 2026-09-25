"""Background write helpers — each writes to PostgreSQL, then invalidates the
student's dashboard cache (and every days-variant of the parent/admin summary
cache built from it) so the next read is fresh."""
from app.core.cache import (
    cache_delete, dashboard_key, parent_summary_key, subject_scores_key,
    weekly_summary_key,
)
from app.crud import progress_crud, weak_topic_crud
from app.database.session import AsyncSessionLocal
from app.schemas.progress import (
    RecordProgressEventRequest,
    UpdateProgressRequest,
)
from app.schemas.weak_topic import RecordTopicAttemptRequest

# Kept in sync with ALLOWED_SUMMARY_DAYS in routes/parent.py — every value
# that route will ever cache under needs its own invalidation here.
_SUMMARY_DAYS = (1, 7, 30, 90, 365)


async def _invalidate_student(user_id) -> None:
    await cache_delete(dashboard_key(str(user_id)))
    await cache_delete(subject_scores_key(str(user_id)))
    await cache_delete(weekly_summary_key(str(user_id)))
    for days in _SUMMARY_DAYS:
        await cache_delete(parent_summary_key(str(user_id), days))


async def do_update_progress(body: UpdateProgressRequest) -> None:
    async with AsyncSessionLocal() as db:
        await progress_crud.upsert_progress(db, body)
    await _invalidate_student(body.user_id)


async def do_record_progress_event(body: RecordProgressEventRequest) -> None:
    async with AsyncSessionLocal() as db:
        await progress_crud.record_progress_event(db, body)
    await _invalidate_student(body.user_id)


async def do_record_topic_attempt(body: RecordTopicAttemptRequest) -> None:
    async with AsyncSessionLocal() as db:
        await weak_topic_crud.upsert_topic_attempt(db, body)
    await _invalidate_student(body.user_id)
