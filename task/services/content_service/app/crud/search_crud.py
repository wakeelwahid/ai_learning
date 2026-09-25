from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    Chapter,
    ContentBoard,
    ContentClass,
    Note,
    Subject,
    Topic,
    Video,
)


async def search_content(db: AsyncSession, q: str, limit: int = 8) -> dict:
    pattern = f"%{q}%"

    def _fmt_duration(secs: int) -> str:
        mins = (secs or 0) // 60
        return f"{mins} min" if mins > 0 else "< 1 min"

    # ── Videos ──
    v_rows = (await db.execute(
        select(
            Video.id, Video.title, Video.duration_seconds,
            Topic.title.label("topic_title"),
            Chapter.title.label("chapter_title"),
            Subject.name.label("subject_name"),
            ContentBoard.name.label("board_name"),
            ContentClass.number.label("class_num"),
        )
        .join(Topic, Video.topic_id == Topic.id)
        .join(Chapter, Topic.chapter_id == Chapter.id)
        .join(Subject, Chapter.subject_id == Subject.id)
        .join(ContentClass, Subject.class_id == ContentClass.id)
        .join(ContentBoard, ContentClass.board_id == ContentBoard.id)
        .where(
            Video.is_active == True,  # noqa: E712
            or_(
                Video.title.ilike(pattern),
                Chapter.title.ilike(pattern),
                Subject.name.ilike(pattern),
                Topic.title.ilike(pattern),
            ),
        )
        .limit(limit)
    )).mappings().all()

    # ── Notes ──
    n_rows = (await db.execute(
        select(
            Note.id, Note.title,
            Chapter.title.label("chapter_title"),
            Subject.name.label("subject_name"),
            ContentBoard.name.label("board_name"),
            ContentClass.number.label("class_num"),
        )
        .join(Chapter, Note.chapter_id == Chapter.id)
        .join(Subject, Chapter.subject_id == Subject.id)
        .join(ContentClass, Subject.class_id == ContentClass.id)
        .join(ContentBoard, ContentClass.board_id == ContentBoard.id)
        .where(
            Note.is_active == True,  # noqa: E712
            or_(
                Note.title.ilike(pattern),
                Chapter.title.ilike(pattern),
                Subject.name.ilike(pattern),
            ),
        )
        .limit(limit)
    )).mappings().all()

    # ── Chapters ──
    c_rows = (await db.execute(
        select(
            Chapter.id, Chapter.title,
            Subject.name.label("subject_name"),
            ContentBoard.name.label("board_name"),
            ContentClass.number.label("class_num"),
        )
        .join(Subject, Chapter.subject_id == Subject.id)
        .join(ContentClass, Subject.class_id == ContentClass.id)
        .join(ContentBoard, ContentClass.board_id == ContentBoard.id)
        .where(
            Chapter.is_active == True,  # noqa: E712
            or_(
                Chapter.title.ilike(pattern),
                Chapter.description.ilike(pattern),
                Subject.name.ilike(pattern),
            ),
        )
        .limit(limit)
    )).mappings().all()

    return {
        "videos": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "subject": r["subject_name"],
                "board": f"{r['board_name']} {r['class_num']}",
                "chapter": r["chapter_title"],
                "duration": _fmt_duration(r["duration_seconds"]),
                "timestamp": None,
            }
            for r in v_rows
        ],
        "notes": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "subject": r["subject_name"],
                "board": f"{r['board_name']} {r['class_num']}",
                "chapter": r["chapter_title"],
            }
            for r in n_rows
        ],
        "chapters": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "subject": r["subject_name"],
                "board": f"{r['board_name']} {r['class_num']}",
                "videos": 0,
                "notes": 0,
            }
            for r in c_rows
        ],
        "questions": [],
        "pyqs": [],
    }
