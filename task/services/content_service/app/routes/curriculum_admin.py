import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.core.redis import catalog_invalidate
from app.database.session import get_db
from app.schemas.content import (
    BoardCreate,
    BoardUpdate,
    ChapterCreate,
    ChapterUpdate,
    ClassCreate,
    ClassUpdate,
    SubjectCreate,
    SubjectUpdate,
    TopicCreate,
    TopicUpdate,
)
from app.services.content_service import ContentService

router = APIRouter(prefix="/content", tags=["content"])


# ─── Admin Catalog Endpoints (/admin/boards, /admin/classes, etc.) ─────────────
# These mirror the public catalog routes but are explicitly namespaced under
# /admin/ so the frontend admin panel can distinguish them from public reads.
# All mutating operations (POST/PUT/DELETE) require admin JWT.

# ── Admin: Boards ─────────────────────────────────────────────────────────────
@router.get("/admin/boards", dependencies=[Depends(require_admin)])
async def admin_list_boards(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] List all boards, optionally including inactive ones."""
    rows = await ContentService(db).admin_list_boards(include_inactive)
    return [{"id": str(r.id), "name": r.name, "code": r.code, "is_active": r.is_active} for r in rows]


@router.post("/admin/boards", status_code=201, dependencies=[Depends(require_admin)])
async def admin_create_board(body: BoardCreate, db: AsyncSession = Depends(get_db)):
    """[Admin] Create a new board (alias of POST /boards with /admin/ prefix)."""
    result = await ContentService(db).create_board(body)
    await catalog_invalidate("content:boards")
    return {"id": str(result.id), "name": result.name, "code": result.code}


@router.put("/admin/boards/{board_id}", dependencies=[Depends(require_admin)])
async def admin_update_board(board_id: uuid.UUID, body: BoardUpdate, db: AsyncSession = Depends(get_db)):
    """[Admin] Update a board's name, code, or active status."""
    board = await ContentService(db).admin_update_board(board_id, body)
    await catalog_invalidate("content:boards")
    return {"id": str(board.id), "name": board.name, "code": board.code, "is_active": board.is_active}


@router.delete("/admin/boards/{board_id}", status_code=204, dependencies=[Depends(require_admin)])
async def admin_delete_board(board_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Soft-delete a board (sets is_active=False)."""
    await ContentService(db).admin_delete_board(board_id)
    await catalog_invalidate("content:boards")


# ── Admin: Classes ────────────────────────────────────────────────────────────
@router.get("/admin/classes", dependencies=[Depends(require_admin)])
async def admin_list_classes(
    board_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] List all classes, optionally filtered by board_id."""
    rows = await ContentService(db).admin_list_classes(board_id, include_inactive)
    return [
        {"id": str(r.id), "board_id": str(r.board_id), "name": r.name, "number": r.number, "is_active": r.is_active}
        for r in rows
    ]


@router.post("/admin/classes", status_code=201, dependencies=[Depends(require_admin)])
async def admin_create_class(body: ClassCreate, db: AsyncSession = Depends(get_db)):
    """[Admin] Create a new class."""
    result = await ContentService(db).create_class(body)
    await catalog_invalidate("content:classes:")
    return {"id": str(result.id), "name": result.name, "number": result.number}


@router.put("/admin/classes/{class_id}", dependencies=[Depends(require_admin)])
async def admin_update_class(class_id: uuid.UUID, body: ClassUpdate, db: AsyncSession = Depends(get_db)):
    """[Admin] Update a class."""
    cls = await ContentService(db).admin_update_class(class_id, body)
    await catalog_invalidate("content:classes:")
    return {"id": str(cls.id), "board_id": str(cls.board_id), "name": cls.name, "number": cls.number, "is_active": cls.is_active}


@router.delete("/admin/classes/{class_id}", status_code=204, dependencies=[Depends(require_admin)])
async def admin_delete_class(class_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Soft-delete a class."""
    await ContentService(db).admin_delete_class(class_id)
    await catalog_invalidate("content:classes:")


# ── Admin: Subjects ───────────────────────────────────────────────────────────
@router.get("/admin/subjects", dependencies=[Depends(require_admin)])
async def admin_list_subjects(
    class_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] List all subjects, optionally filtered by class_id."""
    rows = await ContentService(db).admin_list_subjects(class_id, include_inactive)
    return [
        {"id": str(r.id), "class_id": str(r.class_id), "name": r.name, "code": r.code, "icon_url": r.icon_url, "is_active": r.is_active}
        for r in rows
    ]


@router.post("/admin/subjects", status_code=201, dependencies=[Depends(require_admin)])
async def admin_create_subject(body: SubjectCreate, db: AsyncSession = Depends(get_db)):
    """[Admin] Create a new subject."""
    result = await ContentService(db).create_subject(body)
    await catalog_invalidate("content:subjects:")
    return {"id": str(result.id), "name": result.name, "code": result.code}


@router.put("/admin/subjects/{subject_id}", dependencies=[Depends(require_admin)])
async def admin_update_subject(subject_id: uuid.UUID, body: SubjectUpdate, db: AsyncSession = Depends(get_db)):
    """[Admin] Update a subject."""
    subj = await ContentService(db).admin_update_subject(subject_id, body)
    await catalog_invalidate("content:subjects:")
    return {"id": str(subj.id), "class_id": str(subj.class_id), "name": subj.name, "code": subj.code, "is_active": subj.is_active}


@router.delete("/admin/subjects/{subject_id}", status_code=204, dependencies=[Depends(require_admin)])
async def admin_delete_subject(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Soft-delete a subject."""
    await ContentService(db).admin_delete_subject(subject_id)
    await catalog_invalidate("content:subjects:")


# ── Admin: Chapters ───────────────────────────────────────────────────────────
@router.get("/admin/chapters", dependencies=[Depends(require_admin)])
async def admin_list_chapters(
    subject_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] List all chapters, optionally filtered by subject_id."""
    rows = await ContentService(db).admin_list_chapters(subject_id, include_inactive, limit, offset)
    return [
        {
            "id": str(r.id), "subject_id": str(r.subject_id), "title": r.title,
            "description": r.description, "sequence": r.sequence, "is_active": r.is_active,
        }
        for r in rows
    ]


@router.post("/admin/chapters", status_code=201, dependencies=[Depends(require_admin)])
async def admin_create_chapter(body: ChapterCreate, db: AsyncSession = Depends(get_db)):
    """[Admin] Create a new chapter."""
    result = await ContentService(db).create_chapter(body)
    await catalog_invalidate("content:chapters:")
    return {"id": str(result.id), "title": result.title, "sequence": result.sequence}


@router.put("/admin/chapters/{chapter_id}", dependencies=[Depends(require_admin)])
async def admin_update_chapter(chapter_id: uuid.UUID, body: ChapterUpdate, db: AsyncSession = Depends(get_db)):
    """[Admin] Update a chapter (alias of PUT /chapters/{chapter_id} with /admin/ prefix)."""
    chapter = await ContentService(db).admin_update_chapter(chapter_id, body)
    await catalog_invalidate("content:chapters:")
    return {"id": str(chapter.id), "title": chapter.title, "sequence": chapter.sequence, "is_active": chapter.is_active}


@router.delete("/admin/chapters/{chapter_id}", status_code=204, dependencies=[Depends(require_admin)])
async def admin_delete_chapter(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Soft-delete a chapter."""
    await ContentService(db).admin_delete_chapter(chapter_id)
    await catalog_invalidate("content:chapters:")


# ── Admin: Topics ─────────────────────────────────────────────────────────────
@router.get("/admin/topics", dependencies=[Depends(require_admin)])
async def admin_list_topics(
    chapter_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] List all topics, optionally filtered by chapter_id."""
    rows = await ContentService(db).admin_list_topics(chapter_id, include_inactive, limit, offset)
    return [
        {
            "id": str(r.id), "chapter_id": str(r.chapter_id), "title": r.title,
            "description": r.description, "sequence": r.sequence,
            "difficulty": r.difficulty.value if r.difficulty else None, "is_active": r.is_active,
        }
        for r in rows
    ]


@router.post("/admin/topics", status_code=201, dependencies=[Depends(require_admin)])
async def admin_create_topic(body: TopicCreate, db: AsyncSession = Depends(get_db)):
    """[Admin] Create a new topic."""
    result = await ContentService(db).create_topic(body)
    await catalog_invalidate("content:topics:")
    return {"id": str(result.id), "title": result.title, "sequence": result.sequence}


@router.put("/admin/topics/{topic_id}", dependencies=[Depends(require_admin)])
async def admin_update_topic(topic_id: uuid.UUID, body: TopicUpdate, db: AsyncSession = Depends(get_db)):
    """[Admin] Update a topic."""
    topic = await ContentService(db).admin_update_topic(topic_id, body)
    await catalog_invalidate("content:topics:")
    return {
        "id": str(topic.id), "chapter_id": str(topic.chapter_id), "title": topic.title,
        "sequence": topic.sequence, "difficulty": topic.difficulty.value if topic.difficulty else None,
        "is_active": topic.is_active,
    }


@router.delete("/admin/topics/{topic_id}", status_code=204, dependencies=[Depends(require_admin)])
async def admin_delete_topic(topic_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Soft-delete a topic."""
    await ContentService(db).admin_delete_topic(topic_id)
    await catalog_invalidate("content:topics:")
