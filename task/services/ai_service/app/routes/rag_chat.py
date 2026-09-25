import asyncio
import json
import uuid

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id_and_role, parent_has_approved_link, require_admin
from app.core.redis import get_redis
from app.database.session import get_db
from app.services import chat_memory, usage_tracker
from app.schemas.ai import (
    AIResponse, GeneralQueryRequest, IngestRequest, IngestResponse,
    ParentChatRequest, ParentChatResponse, StudyQueryRequest,
)
from app.services.parent_rag_service import ParentRAGService
from app.services.rag_service import RAGService
from app.services.student_indexer import StudentIndexer

router = APIRouter(prefix="/ai", tags=["ai"])


async def _record_ai_doubt_goal_progress(user_id: uuid.UUID) -> None:
    """Best-effort, fire-and-forget POST to gamification_service so the
    "Ask AI 1 Doubt" daily goal advances — mirrors quiz_service's/
    content_service's identical helper for the quiz/video goal types. Never
    raises: a missed goal tick must never fail the actual AI answer."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/goals/progress",
                json={"user_id": str(user_id), "goal_type": "ai_doubt", "increment": 1},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


# ── RAG + Chat ────────────────────────────────────────────────────────────────

@router.post("/study", response_model=AIResponse)
async def study_mode(
    body:  StudyQueryRequest,
    identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    redis: aioredis.Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    """RAG study mode — filter-aware cache + Groq/Claude LLM.

    Was basic-plan-only (403 for free users); now admin-configurable daily
    quota via FeatureUsageService (feature_key="ai_chat", same bucket as
    /chat below — study mode and general chat share one daily allowance)."""
    user_id, _role = identity
    await usage_tracker.check_and_log(db, str(user_id), "ai_chat")
    service = RAGService(redis)
    result  = await service.answer_study_mode(
        query=body.query,
        # RAGService JSON-serializes these into a cache key / Qdrant filter,
        # so pass plain strings — uuid.UUID objects aren't JSON-serializable.
        chapter_id=str(body.chapter_id) if body.chapter_id else None,
        subject_id=str(body.subject_id) if body.subject_id else None,
        board=body.board,
        class_num=body.class_num,
        subject=body.subject,
        chapter=body.chapter,
    )
    asyncio.create_task(_record_ai_doubt_goal_progress(user_id))
    return AIResponse(mode="study", **result)


@router.post("/chat", response_model=AIResponse)
async def general_mode(
    body:  GeneralQueryRequest,
    identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    redis: aioredis.Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    user_id, role = identity
    if role == "parent":
        if body.student_id is None or not await parent_has_approved_link(user_id, body.student_id):
            raise HTTPException(status_code=403, detail="No verified parent-child link with this student.")
    else:
        # Was basic-plan-only (403 for free users); now admin-configurable
        # daily quota via FeatureUsageService, same "ai_chat" bucket as
        # /study above.
        await usage_tracker.check_and_log(db, str(user_id), "ai_chat")

    # Server-side memory wins over whatever the client sends, so the thread
    # survives a page refresh or a switch to another device.
    scope = chat_memory.STUDENT_SCOPE
    history = await chat_memory.load_history(scope, user_id) or body.history
    summary = await chat_memory.load_summary(scope, user_id)

    answer = await RAGService(redis).answer_general_mode(
        body.query, history, memory=chat_memory.format_for_prompt(history or [], summary),
    )
    turns = await chat_memory.append_exchange(scope, user_id, body.query, answer)
    if turns and turns % settings.CHAT_SUMMARY_EVERY == 0:
        asyncio.create_task(chat_memory.refresh_summary(scope, user_id))
    # Only students carry a daily-goal row (goal generation is keyed off
    # UserStreak, a student-only concept) — skip the fire-and-forget call
    # for parents asking on a child's behalf, which would just 404/no-op
    # server-side anyway but is clearer to gate explicitly here.
    if role != "parent":
        asyncio.create_task(_record_ai_doubt_goal_progress(user_id))
    return AIResponse(answer=answer, mode="general", from_cache=False)


@router.post("/parent-chat/stream", summary="[Parent RAG] Streaming answer (SSE)")
async def parent_chat_stream(
    body:  ParentChatRequest,
    identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Token-by-token answer. Generation takes 1-3s, so streaming is what makes
    the wait feel instant — the first token lands in ~300ms."""
    user_id, role = identity
    if role not in ("parent", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="This chat is for parent accounts.")
    if role == "parent" and not await parent_has_approved_link(user_id, body.student_id):
        raise HTTPException(status_code=403, detail="No verified parent-child link with this student.")

    service = ParentRAGService(redis)

    async def events():
        async for kind, payload in service.answer_stream(body.query, body.student_id, user_id):
            if kind == "token":
                data = {"type": "token", "text": payload}
            elif kind == "sources":
                data = {"type": "sources", "sources": payload}
            elif kind == "error":
                data = {"type": "error", "message": payload}
            else:
                data = {"type": "done", **payload}
            yield f"data: {json.dumps(data)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        # Tell any proxy in front of us not to buffer, or the stream arrives
        # as one lump at the end and the whole point is lost.
        "X-Accel-Buffering": "no",
    })


@router.delete("/chat/history", summary="Clear the caller's own AI chat history")
async def clear_chat_history(
    identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
):
    user_id, _ = identity
    await chat_memory.clear(chat_memory.STUDENT_SCOPE, user_id)
    return {"cleared": True}


@router.delete("/parent-chat/history", summary="Clear a parent's chat history for one child")
async def clear_parent_chat_history(
    student_id: uuid.UUID,
    identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
):
    """Scoped to one child: clearing the Rahul thread leaves the Pooja one."""
    user_id, role = identity
    # Same role gate as /parent-chat and /parent-chat/stream. Without it a
    # non-parent role (student/teacher) fell through the `role == "parent"`
    # link check below entirely, so this route was the only one of the three
    # parent-chat endpoints that any authenticated caller could reach.
    if role not in ("parent", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="This chat is for parent accounts.")
    if role == "parent" and not await parent_has_approved_link(user_id, student_id):
        raise HTTPException(status_code=403, detail="No verified parent-child link with this student.")
    await chat_memory.clear(chat_memory.parent_scope(student_id), user_id)
    return {"cleared": True}


@router.post("/parent-chat", response_model=ParentChatResponse)
async def parent_chat(
    body:  ParentChatRequest,
    identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Grounded RAG chat about one approved linked child.

    The child is identified by body.student_id, but the PARENT is always the
    authenticated caller — the link check below is the access boundary, and
    the same student_id also scopes the vector search.
    """
    user_id, role = identity
    if role not in ("parent", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="This chat is for parent accounts.")
    if role == "parent" and not await parent_has_approved_link(user_id, body.student_id):
        raise HTTPException(status_code=403, detail="No verified parent-child link with this student.")

    result = await ParentRAGService(redis).answer(
        body.query, body.student_id, body.history, parent_id=user_id,
    )
    return ParentChatResponse(mode="parent", **{
        k: v for k, v in result.items() if k in ParentChatResponse.model_fields
    })


@router.post("/admin/index-student/{student_id}", dependencies=[Depends(require_admin)])
async def admin_index_student(
    student_id: uuid.UUID,
    force: bool = False,
    redis: aioredis.Redis = Depends(get_redis),
):
    """[Admin] Rebuild one student's parent-RAG fact cards."""
    return await StudentIndexer(redis).index_student(student_id, force=force)


@router.post("/ingest", response_model=IngestResponse, dependencies=[Depends(require_admin)])
async def ingest_content(
    body:  IngestRequest,
    redis: aioredis.Redis = Depends(get_redis),
):
    service = RAGService(redis)
    chunks  = [c.model_dump() for c in body.chunks]
    count   = await service.ingest_content(chunks)
    return IngestResponse(ingested=count, message=f"Successfully ingested {count} chunks")
