import json
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, get_optional_user_id_and_role, require_admin, require_internal, require_teacher
from app.models.content import Subject
from app.core.redis import catalog_get, catalog_invalidate, catalog_lock, catalog_set, get_redis
from app.crud.curriculum_admin_crud import (
    deactivate_chapter,
    get_chapter as crud_get_chapter,
    update_chapter as crud_update_chapter,
)
from app.crud.curriculum_crud import get_subjects_for_board_class
from app.database.session import get_db
from app.schemas.content import (
    BoardCreate,
    BoardResponse,
    ChapterCreate,
    ChapterResponse,
    ChapterUpdate,
    ClassCreate,
    ClassResponse,
    NoteResponse,
    SubjectCreate,
    SubjectResponse,
    TopicCreate,
    TopicResponse,
    VideoResponse,
)
from app.services.content_service import ContentService

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/boards", response_model=list[BoardResponse])
async def list_boards(db: AsyncSession = Depends(get_db)):
    key = "content:boards"
    cached = await catalog_get(key)
    if cached is not None:
        return cached
    async with catalog_lock(key):
        cached = await catalog_get(key)
        if cached is not None:
            return cached
        rows = await ContentService(db).list_boards()
        data = [BoardResponse.model_validate(r).model_dump(mode="json") for r in rows]
        await catalog_set(key, data)
        return data


@router.get("/boards/{board_id}/classes", response_model=list[ClassResponse])
async def list_classes(board_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    key = f"content:classes:{board_id}"
    cached = await catalog_get(key)
    if cached is not None:
        return cached
    async with catalog_lock(key):
        cached = await catalog_get(key)
        if cached is not None:
            return cached
        rows = await ContentService(db).list_classes(board_id)
        data = [ClassResponse.model_validate(r).model_dump(mode="json") for r in rows]
        await catalog_set(key, data)
        return data


# ── Profile-driven catalog (board & class come from the user's profile) ──────
BC_CACHE_TTL = 300


async def get_user_board_class(user_id) -> tuple[str | None, int | None]:
    """Resolve the student's board + class from user_service, Redis-cached for
    5 minutes — with thousands of concurrent students this is one profile
    lookup per user per 5 min, not one per catalog request."""
    key = f"userbc:{user_id}"
    try:
        r = get_redis()
        raw = await r.get(key)
        if raw:
            doc = json.loads(raw)
            return doc.get("b"), doc.get("c")
    except Exception:
        r = None
    board, class_num = None, None
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/profile/{user_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
            if resp.status_code == 200:
                doc = resp.json()
                board, class_num = doc.get("board"), doc.get("class_number")
    except Exception:
        pass
    if r is not None and (board or class_num):
        try:
            await r.set(key, json.dumps({"b": board, "c": class_num}), ex=BC_CACHE_TTL)
        except Exception:
            pass
    return board, class_num


@router.get("/my-catalog", summary="Subjects for the caller's own board & class")
async def my_catalog(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """THE entry point of the learning flow (Subject → Chapter → Exercise →
    Questions). Board and class are read from the student's profile — set at
    registration — never from client-supplied filters, so students only see
    content that belongs to their curriculum."""
    board, class_num = await get_user_board_class(current_user_id)
    if not board or not class_num:
        raise HTTPException(
            status_code=409,
            detail="Set your board and class in your profile to see your subjects.",
        )
    rows = await get_subjects_for_board_class(db, str(board), int(class_num))
    return {
        "board": board,
        "class_num": class_num,
        "subjects": rows,
    }


@router.get("/internal/subjects-for", dependencies=[Depends(require_internal)])
async def internal_subjects_for(
    board: str | None = Query(default=None),
    class_num: int | None = Query(default=None, ge=1, le=12),
    ids: str | None = Query(default=None, description="Comma-separated subject ids to resolve by id"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """[internal] [{id, name}] for a board+class curriculum and/or explicit
    subject ids (union, de-duplicated) — analytics_service resolves display
    names for the parent dashboard from here."""
    out: dict[str, str] = {}
    if board and class_num:
        for r in await get_subjects_for_board_class(db, board, class_num):
            out[str(r["id"])] = r["name"]
    wanted: list[uuid.UUID] = []
    for raw in (ids or "").split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            wanted.append(uuid.UUID(raw))
        except ValueError:
            continue
    if wanted:
        rows = (await db.execute(
            select(Subject.id, Subject.name).where(Subject.id.in_(wanted))
        )).all()
        for sid, name in rows:
            out.setdefault(str(sid), name)
    return [{"id": sid, "name": name} for sid, name in out.items()]


@router.get("/classes/{class_id}/subjects", response_model=list[SubjectResponse])
async def list_subjects(class_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    key = f"content:subjects:{class_id}"
    cached = await catalog_get(key)
    if cached is not None:
        return cached
    async with catalog_lock(key):
        cached = await catalog_get(key)
        if cached is not None:
            return cached
        rows = await ContentService(db).list_subjects(class_id)
        data = [SubjectResponse.model_validate(r).model_dump(mode="json") for r in rows]
        await catalog_set(key, data)
        return data


@router.get("/subjects/{subject_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(
    subject_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    key = f"content:chapters:{subject_id}:{limit}:{offset}"
    cached = await catalog_get(key)
    if cached is not None:
        return cached
    async with catalog_lock(key):
        cached = await catalog_get(key)
        if cached is not None:
            return cached
        rows = await ContentService(db).list_chapters(subject_id, limit=limit, offset=offset)
        data = [ChapterResponse.model_validate(r).model_dump(mode="json") for r in rows]
        await catalog_set(key, data)
        return data


@router.get("/chapters/{chapter_id}/topics", response_model=list[TopicResponse])
async def list_topics(
    chapter_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    key = f"content:topics:{chapter_id}:{limit}:{offset}"
    cached = await catalog_get(key)
    if cached is not None:
        return cached
    async with catalog_lock(key):
        cached = await catalog_get(key)
        if cached is not None:
            return cached
        rows = await ContentService(db).list_topics(chapter_id, limit=limit, offset=offset)
        data = [TopicResponse.model_validate(r).model_dump(mode="json") for r in rows]
        await catalog_set(key, data)
        return data


@router.get("/topics/{topic_id}/videos", response_model=list[VideoResponse])
async def list_videos(
    topic_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    identity: tuple[uuid.UUID | None, str | None] = Depends(get_optional_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    current_user_id, role = identity
    viewer_board = viewer_class = None
    if role == "student" and current_user_id:
        viewer_board, viewer_class = await get_user_board_class(current_user_id)

    # A signed-in student's cache key must vary by their own curriculum —
    # otherwise the first student to hit a cold cache would have their
    # board/class silently applied to every other viewer's cached response.
    key = f"content:videos:{topic_id}:{limit}:{offset}:{viewer_board or ''}:{viewer_class or ''}"
    cached = await catalog_get(key)
    if cached is not None:
        return cached
    async with catalog_lock(key):
        cached = await catalog_get(key)
        if cached is not None:
            return cached
        rows = await ContentService(db).list_videos(
            topic_id, limit=limit, offset=offset,
            viewer_board=viewer_board, viewer_class=viewer_class,
        )
        data = [VideoResponse.model_validate(r).model_dump(mode="json") for r in rows]
        await catalog_set(key, data)
        return data


@router.get("/chapters/{chapter_id}/notes", response_model=list[NoteResponse])
async def list_notes(
    chapter_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    identity: tuple[uuid.UUID | None, str | None] = Depends(get_optional_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    current_user_id, role = identity
    viewer_board = viewer_class = None
    if role == "student" and current_user_id:
        viewer_board, viewer_class = await get_user_board_class(current_user_id)

    key = f"content:notes:{chapter_id}:{limit}:{offset}:{viewer_board or ''}:{viewer_class or ''}"
    cached = await catalog_get(key)
    if cached is not None:
        return cached
    async with catalog_lock(key):
        cached = await catalog_get(key)
        if cached is not None:
            return cached
        rows = await ContentService(db).list_notes(
            chapter_id, limit=limit, offset=offset,
            viewer_board=viewer_board, viewer_class=viewer_class,
        )
        data = [NoteResponse.model_validate(r).model_dump(mode="json") for r in rows]
        await catalog_set(key, data)
        return data


@router.post("/boards", response_model=BoardResponse, status_code=201, dependencies=[Depends(require_admin)])
async def create_board(body: BoardCreate, db: AsyncSession = Depends(get_db)):
    result = await ContentService(db).create_board(body)
    await catalog_invalidate("content:boards")
    return result


@router.post("/classes", response_model=ClassResponse, status_code=201, dependencies=[Depends(require_admin)])
async def create_class(body: ClassCreate, db: AsyncSession = Depends(get_db)):
    result = await ContentService(db).create_class(body)
    await catalog_invalidate("content:classes:")
    return result


@router.post("/subjects", response_model=SubjectResponse, status_code=201, dependencies=[Depends(require_teacher)])
async def create_subject(body: SubjectCreate, db: AsyncSession = Depends(get_db)):
    result = await ContentService(db).create_subject(body)
    await catalog_invalidate("content:subjects:")
    return result


@router.post("/chapters", response_model=ChapterResponse, status_code=201, dependencies=[Depends(require_teacher)])
async def create_chapter(body: ChapterCreate, db: AsyncSession = Depends(get_db)):
    result = await ContentService(db).create_chapter(body)
    await catalog_invalidate("content:chapters:")
    return result


@router.post("/topics", response_model=TopicResponse, status_code=201, dependencies=[Depends(require_teacher)])
async def create_topic(body: TopicCreate, db: AsyncSession = Depends(get_db)):
    result = await ContentService(db).create_topic(body)
    await catalog_invalidate("content:topics:")
    return result


@router.get("/chapters/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    chapter = await crud_get_chapter(db, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.put("/chapters/{chapter_id}", response_model=ChapterResponse, dependencies=[Depends(require_teacher)])
async def update_chapter(
    chapter_id: uuid.UUID,
    body: ChapterUpdate,
    db: AsyncSession = Depends(get_db),
):
    chapter = await crud_get_chapter(db, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    chapter = await crud_update_chapter(db, chapter, body)
    await catalog_invalidate("content:chapters:")
    return chapter


@router.delete("/chapters/{chapter_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_chapter(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    chapter = await crud_get_chapter(db, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    await deactivate_chapter(db, chapter)
    await catalog_invalidate("content:chapters:")
