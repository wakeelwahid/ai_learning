"""
Background worker: flushes video progress from Redis to PostgreSQL.

Flow:
  PUT /progress  →  Redis (immediate, sub-ms)  +  mark dirty
  This loop      →  pop dirty keys  →  write to PostgreSQL  (every FLUSH_INTERVAL s)
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from app.core.redis import pop_dirty_progress_keys, cache_get_progress, mark_progress_dirty
from app.crud.videos_crud import get_or_create_video_progress
from app.database.session import AsyncSessionLocal
from app.models.content import VideoProgress

logger = logging.getLogger(__name__)

FLUSH_INTERVAL = 45   # seconds between flush passes


async def flush_one(db, user_id_str: str, video_id_str: str, data: dict) -> None:
    user_id  = uuid.UUID(user_id_str)
    video_id = uuid.UUID(video_id_str)

    watched  = int(data.get("watched_seconds", 0) or 0)
    actual   = int(data.get("actual_watched_seconds", 0) or 0)
    pct      = float(data.get("completion_percentage", 0.0) or 0.0)
    done     = bool(data.get("is_completed", False))
    status   = str(data.get("status", "in_progress") or "in_progress")
    position = int(data.get("last_position_seconds", 0) or 0)
    now      = datetime.now(timezone.utc)

    progress = await get_or_create_video_progress(db, user_id, video_id)
    if progress:
        progress.watched_seconds          = max(progress.watched_seconds or 0, watched)
        progress.actual_watched_seconds   = max(progress.actual_watched_seconds or 0, actual)
        progress.completion_percentage    = max(progress.completion_percentage or 0.0, pct)
        progress.is_completed             = done or progress.is_completed
        progress.last_position_seconds    = position
        if status == "paused" and progress.status != "paused":
            progress.paused_at = now
        elif status == "in_progress" and progress.status == "paused":
            progress.resumed_at = now
        progress.status = status
    else:
        progress = VideoProgress(
            user_id=user_id,
            video_id=video_id,
            watched_seconds=watched,
            actual_watched_seconds=actual,
            is_completed=done,
            completion_percentage=pct,
            status=status,
            last_position_seconds=position,
        )
        db.add(progress)


async def flush_dirty_progress() -> None:
    """Pop all dirty progress keys and write them to PostgreSQL in one transaction."""
    dirty = await pop_dirty_progress_keys(count=200)
    if not dirty:
        return

    logger.info("Progress worker: flushing %d dirty keys to PostgreSQL", len(dirty))
    failed: list[tuple[str, str]] = []

    async with AsyncSessionLocal() as db:
        for user_id_str, video_id_str in dirty:
            try:
                data = await cache_get_progress(user_id_str, video_id_str)
                if not data:
                    continue
                await flush_one(db, user_id_str, video_id_str, data)
            except Exception as exc:
                logger.error(
                    "Progress flush failed for %s:%s — %s", user_id_str, video_id_str, exc
                )
                failed.append((user_id_str, video_id_str))
        try:
            await db.commit()
        except Exception as exc:
            logger.error("Progress worker commit failed — %s", exc)
            failed.extend(dirty)

    # Re-enqueue anything that failed so it gets retried next pass
    for user_id_str, video_id_str in failed:
        await mark_progress_dirty(user_id_str, video_id_str)


async def run_flush_loop() -> None:
    """Infinite loop: sleep → flush. Cancelled on app shutdown (triggers final flush)."""
    logger.info("Progress worker started (interval=%ds)", FLUSH_INTERVAL)
    while True:
        try:
            await asyncio.sleep(FLUSH_INTERVAL)
            await flush_dirty_progress()
        except asyncio.CancelledError:
            logger.info("Progress worker cancelled — running final flush")
            await flush_dirty_progress()
            raise
        except Exception as exc:
            logger.error("Progress worker unexpected error — %s", exc)
