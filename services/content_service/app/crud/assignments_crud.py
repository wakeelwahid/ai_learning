import uuid
from datetime import datetime, timezone

from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    Assignment,
    AssignmentTarget,
    Chapter,
    Exercise,
    Subject,
    UserLearningProgress,
)


async def create_assignment(
    db: AsyncSession, title: str, description: str | None,
    entity_type: str, entity_id: uuid.UUID, assigned_by: uuid.UUID,
    due_at, student_ids: list[uuid.UUID],
) -> Assignment:
    assignment = Assignment(
        title=title, description=description, entity_type=entity_type,
        entity_id=entity_id, assigned_by=assigned_by, due_at=due_at,
    )
    db.add(assignment)
    await db.flush()  # populate assignment.id before creating targets
    for sid in student_ids:
        db.add(AssignmentTarget(assignment_id=assignment.id, student_id=sid))
    await db.commit()
    await db.refresh(assignment)
    return assignment


async def get_assignment_target_count(db: AsyncSession, assignment_id: uuid.UUID) -> int:
    return await db.scalar(
        select(sqlfunc.count()).select_from(AssignmentTarget).where(AssignmentTarget.assignment_id == assignment_id)
    ) or 0


async def list_assignments_by_admin(db: AsyncSession, assigned_by: uuid.UUID | None, limit: int, offset: int) -> list[dict]:
    stmt = select(Assignment, sqlfunc.count(AssignmentTarget.id).label("student_count")) \
        .outerjoin(AssignmentTarget, AssignmentTarget.assignment_id == Assignment.id) \
        .where(Assignment.is_active.is_(True))
    if assigned_by:
        stmt = stmt.where(Assignment.assigned_by == assigned_by)
    stmt = stmt.group_by(Assignment.id).order_by(Assignment.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).all()
    out = []
    for assignment, student_count in rows:
        out.append({**assignment.__dict__, "student_count": student_count})
    return out


async def get_student_assignments(db: AsyncSession, student_id: uuid.UUID) -> list[dict]:
    """Real per-assignment completion for one student: joins the assignment's
    target entity (chapter/exercise) against UserLearningProgress for that
    exact (entity_type, entity_id, user_id=student). No client-reported
    "done" flag anywhere — completion is exactly what content_service
    already considers true elsewhere in the platform."""
    stmt = (
        select(
            Assignment.id.label("assignment_id"),
            Assignment.title,
            Assignment.description,
            Assignment.entity_type,
            Assignment.entity_id,
            Assignment.due_at,
            UserLearningProgress.status.label("progress_status"),
            UserLearningProgress.completed_at,
        )
        .select_from(AssignmentTarget)
        .join(Assignment, Assignment.id == AssignmentTarget.assignment_id)
        .outerjoin(
            UserLearningProgress,
            (UserLearningProgress.user_id == AssignmentTarget.student_id)
            & (UserLearningProgress.entity_type == Assignment.entity_type)
            & (UserLearningProgress.entity_id == Assignment.entity_id),
        )
        .where(AssignmentTarget.student_id == student_id, Assignment.is_active.is_(True))
        .order_by(Assignment.due_at.asc().nulls_last(), Assignment.created_at.desc())
    )
    rows = (await db.execute(stmt)).mappings().all()

    # Resolve entity titles + subject in a second pass (chapter vs exercise
    # have different lookups) — cheap since assignment lists are small.
    chapter_ids = {r["entity_id"] for r in rows if r["entity_type"] == "chapter"}
    exercise_ids = {r["entity_id"] for r in rows if r["entity_type"] == "exercise"}
    chapter_info: dict[uuid.UUID, tuple[str, str | None]] = {}
    if chapter_ids:
        crows = (await db.execute(
            select(Chapter.id, Chapter.title, Subject.name)
            .outerjoin(Subject, Subject.id == Chapter.subject_id)
            .where(Chapter.id.in_(chapter_ids))
        )).all()
        chapter_info = {cid: (title, subj) for cid, title, subj in crows}
    exercise_info: dict[uuid.UUID, tuple[str, str | None]] = {}
    if exercise_ids:
        erows = (await db.execute(
            select(Exercise.id, Exercise.name, Subject.name)
            .outerjoin(Chapter, Chapter.id == Exercise.chapter_id)
            .outerjoin(Subject, Subject.id == Chapter.subject_id)
            .where(Exercise.id.in_(exercise_ids))
        )).all()
        exercise_info = {eid: (title, subj) for eid, title, subj in erows}

    now = datetime.now(timezone.utc)
    out = []
    for r in rows:
        info = chapter_info.get(r["entity_id"]) if r["entity_type"] == "chapter" else exercise_info.get(r["entity_id"])
        is_completed = r["progress_status"] == "completed"
        due_at = r["due_at"]
        out.append({
            "assignment_id": r["assignment_id"],
            "title": r["title"],
            "description": r["description"],
            "entity_type": r["entity_type"],
            "entity_id": r["entity_id"],
            "entity_title": info[0] if info else None,
            "subject_name": info[1] if info else None,
            "due_at": due_at,
            "is_completed": is_completed,
            "completed_at": r["completed_at"] if is_completed else None,
            "is_overdue": bool(due_at and not is_completed and due_at < now),
        })
    return out
