"""
RabbitMQ consumer — rebuilds Redis caches when quiz content changes.

Consumed routing keys (exchange: quiz_events, type: topic):
  quiz.cache_rebuild    — rebuild quiz + question caches from PostgreSQL
  quiz.cache_invalidate — delete stale cache entries
"""
import asyncio
import json
import logging
import uuid

import aio_pika
from sqlalchemy import select

from app.core.config import settings
from app.core.cache import (
    TTL_QUESTION, TTL_QUIZ, TTL_QUESTIONS,
    cache_delete, cache_set,
    question_key, questions_key, quiz_id_key, quiz_meta_key,
)
from app.database.session import AsyncSessionLocal
from app.models.quiz import Question, Quiz

logger = logging.getLogger(__name__)

EXCHANGE_NAME = "quiz_events"
QUEUE_NAME    = "quiz_cache_worker"


async def rebuild_cache(payload: dict) -> None:
    quiz_id_raw = payload.get("quiz_id")
    if not quiz_id_raw:
        return

    try:
        quiz_uuid = uuid.UUID(str(quiz_id_raw))
    except ValueError:
        return

    async with AsyncSessionLocal() as db:
        quiz = await db.get(Quiz, quiz_uuid)
        if not quiz:
            return
        result = await db.execute(
            select(Question).where(Question.quiz_id == quiz.id).order_by(Question.sequence)
        )
        questions = result.scalars().all()

    q_list = [
        {
            "id":         str(q.id),
            "question":   q.text,
            "options":    q.options,
            "difficulty": "medium",
            "topic":      str(q.topic_id) if q.topic_id else None,
            "marks":      q.marks,
            "sequence":   q.sequence,
        }
        for q in questions
    ]

    quiz_payload = {
        "quiz_id":         str(quiz.id),
        "title":           quiz.title,
        "total_questions": len(q_list),
        "duration_minutes": quiz.duration_minutes,
        "total_marks":     quiz.total_marks,
        "questions":       q_list,
    }

    # quiz:{quiz_id}
    await cache_set(quiz_id_key(str(quiz.id)), quiz_payload, TTL_QUIZ)

    # quiz:{board}:{class}:{subject}:{chapter}  +  questions:{board}:...
    if all([quiz.board, quiz.class_num, quiz.subject_name, quiz.chapter_name]):
        mk = quiz_meta_key(quiz.board, quiz.class_num, quiz.subject_name, quiz.chapter_name)
        await cache_set(mk, quiz_payload, TTL_QUIZ)
        qk = questions_key(quiz.board, quiz.class_num, quiz.subject_name, quiz.chapter_name)
        await cache_set(qk, q_list, TTL_QUESTIONS)

    # question:{id} — individual metadata for fast answer validation
    for q in questions:
        meta = {
            "question_id":    str(q.id),
            "topic":          str(q.topic_id) if q.topic_id else None,
            "difficulty":     "medium",
            "correct_answer": q.correct_answer,
            "marks":          q.marks,
            "negative_marks": q.negative_marks,
        }
        await cache_set(question_key(str(q.id)), meta, TTL_QUESTION)

    logger.info("Cache rebuilt for quiz %s (%d questions)", quiz_uuid, len(q_list))


async def invalidate_cache(payload: dict) -> None:
    quiz_id_raw = payload.get("quiz_id")
    if quiz_id_raw:
        await cache_delete(quiz_id_key(str(quiz_id_raw)))
    logger.info("Cache invalidated for quiz %s", quiz_id_raw)


HANDLERS = {
    "quiz.cache_rebuild":    rebuild_cache,
    "quiz.cache_invalidate": invalidate_cache,
}


async def start_consumer() -> None:
    """Start consuming quiz events. Reconnects automatically on failure."""
    while True:
        try:
            conn = await aio_pika.connect_robust(settings.RABBITMQ_URL)
            ch   = await conn.channel()
            exch = await ch.declare_exchange(EXCHANGE_NAME, aio_pika.ExchangeType.TOPIC, durable=True)
            q    = await ch.declare_queue(QUEUE_NAME, durable=True)
            for rk in HANDLERS:
                await q.bind(exch, routing_key=rk)

            logger.info("Quiz cache consumer ready, listening on '%s'", QUEUE_NAME)

            async with q.iterator() as it:
                async for msg in it:
                    async with msg.process():
                        try:
                            body    = json.loads(msg.body)
                            handler = HANDLERS.get(msg.routing_key)
                            if handler:
                                await handler(body)
                        except Exception as exc:
                            logger.exception("Event handler error (%s): %s", msg.routing_key, exc)

        except asyncio.CancelledError:
            logger.info("Quiz cache consumer cancelled")
            break
        except Exception as exc:
            logger.warning("RabbitMQ consumer error, retrying in 5 s: %s", exc)
            await asyncio.sleep(5)
