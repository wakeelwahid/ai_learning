"""
Celery task: generate a quiz/paper with the LLM (Ollama) in the background.

The /papers/generate endpoint creates a GeneratedPaper row with status
"GENERATING" and enqueues this task, so the HTTP request returns immediately
(no blocking on a slow/unreachable Ollama). The task fills in the questions and
flips the status to PUBLISHED, or FAILED with an error message.
"""
import asyncio
import logging

from sqlalchemy import select

from app.celery_app import celery_app
from app.database.session import AsyncSessionLocal
from app.models.generated_paper import GeneratedPaper
from app.services import generation_service, llm_service, offline_generator, question_cache

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="app.tasks.generation.generate_paper_task",
    max_retries=2,
    default_retry_delay=30,
    soft_time_limit=180,    # Phase 7: warn at 3 min
    time_limit=240,         # hard kill at 4 min — Ollama timeout protection
    retry_backoff=True,
    retry_backoff_max=120,
)
def generate_paper_task(self, paper_id: str, params: dict):
    asyncio.run(_run(paper_id, params))


async def _run(paper_id: str, params: dict):
    meta = {k: params.get(k) for k in ("board", "class_num", "subject", "chapter", "topic")}
    count = max(1, min(int(params.get("count", 10)), 30))
    difficulty = params.get("difficulty", "medium")

    try:
        context = await generation_service.gather_context(meta)

        # 1. Preferred path: LLM (Ollama / Groq / OpenAI / Anthropic).
        # 2. Fallback: deterministic offline generator grounded in the syllabus
        #    context, so generation NEVER hard-fails when no LLM is reachable.
        provider = "offline_template"
        try:
            raw, provider = await generation_service.generate_mcqs(
                context, meta, count=count, difficulty=difficulty)
            verified, report = generation_service.verify_mcqs(raw, context)
            if not verified:
                raise llm_service.NoLLMAvailable("LLM returned no verifiable questions")
        except llm_service.NoLLMAvailable:
            logger.info("generate_paper_task: no LLM — using offline generator for %s", paper_id)
            raw = offline_generator.generate_offline(context, meta, count=count, difficulty=difficulty)
            verified, report = generation_service.verify_mcqs(raw, context)
            report["mode"] = "offline_template"
            provider = "offline_template"

        async with AsyncSessionLocal() as s:
            p = (await s.execute(select(GeneratedPaper).where(GeneratedPaper.id == paper_id))).scalar_one_or_none()
            if not p:
                return
            if not verified:
                p.status = "FAILED"
                p.content = {"error": "The model returned no verifiable questions. Try again or adjust the topic."}
            else:
                p.content = {
                    "sections": [{
                        "section_name": "Multiple Choice Questions",
                        "marks_per_question": 1,
                        "questions": [{"q_no": i + 1, **v} for i, v in enumerate(verified)],
                    }],
                    "verification": report,
                }
                p.total_marks = len(verified)
                p.duration_min = max(10, len(verified) * 2)
                p.generated_by = provider
                p.verified = True
                p.status = "PUBLISHED"
            await s.commit()

        # Warm the Redis question bank so students get fast random retrieval.
        # question_cache.warm()'s real signature is
        # (feature, board, class_num, subject, chapter, questions) — this
        # call was missing the leading `feature` arg entirely (a straight
        # TypeError), which a broad `except Exception` below caught and used
        # to overwrite the paper's just-committed PUBLISHED status back to
        # FAILED — silently turning every successful generation into an
        # apparent failure, confirmed live before this fix. "questions" is
        # the general question-bank feature bucket /ai/questions reads by
        # default, matching what a generated paper's content is for.
        if verified:
            await question_cache.warm("questions", meta.get("board"), meta.get("class_num"),
                                      meta.get("subject"), meta.get("chapter"), verified)
        logger.info("generate_paper_task done: paper=%s verified=%d", paper_id, len(verified))
    except llm_service.NoLLMAvailable as e:
        await _fail(paper_id, f"No LLM available: {e}")
    except Exception as e:  # noqa
        logger.exception("generate_paper_task failed for %s", paper_id)
        await _fail(paper_id, str(e)[:300])


async def _fail(paper_id: str, msg: str):
    async with AsyncSessionLocal() as s:
        p = (await s.execute(select(GeneratedPaper).where(GeneratedPaper.id == paper_id))).scalar_one_or_none()
        if p:
            p.status = "FAILED"
            p.content = {"error": msg}
            await s.commit()
