import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, require_admin
from app.crud import assignments_crud
from app.crud import curriculum_admin_crud
from app.crud import exercises_crud
from app.database.session import get_db
from app.schemas.content import (
    AssignmentCreateRequest,
    AssignmentResponse,
    StudentAssignmentsResponse,
)

router = APIRouter(prefix="/content", tags=["content"])


# ── Assignments ────────────────────────────────────────────────────────────────
@router.post("/assignments", response_model=AssignmentResponse, status_code=201,
             dependencies=[Depends(require_admin)])
async def create_assignment(
    body: AssignmentCreateRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Assign a chapter or exercise to one or more students, with an
    optional due date. Completion is never reported by the client — it's
    derived later from each student's real UserLearningProgress."""
    if body.entity_type == "chapter":
        target = await curriculum_admin_crud.get_chapter(db, body.entity_id)
    else:
        target = await exercises_crud.get_exercise(db, body.entity_id)
    if not target:
        raise HTTPException(status_code=404, detail=f"{body.entity_type.capitalize()} not found")

    assignment = await assignments_crud.create_assignment(
        db, body.title, body.description, body.entity_type, body.entity_id,
        current_user_id, body.due_at, body.student_ids,
    )
    return AssignmentResponse(**assignment.__dict__, student_count=len(body.student_ids))


@router.get("/assignments", response_model=list[AssignmentResponse],
            dependencies=[Depends(require_admin)])
async def list_assignments(
    mine_only: bool = Query(default=False, description="Only assignments created by the caller"),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] List assignments with a real student-count per assignment."""
    rows = await assignments_crud.list_assignments_by_admin(
        db, current_user_id if mine_only else None, limit, offset,
    )
    return [AssignmentResponse(**r) for r in rows]


@router.get("/assignments/student/{student_id}", response_model=StudentAssignmentsResponse)
async def get_student_assignments_route(
    student_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """A student's own assignments, or a linked parent viewing their child's.
    Completion is real (see get_student_assignments) — this is the endpoint
    that finally replaces the hardcoded "Assignments Done" stat."""
    if student_id != current_user_id:
        # Not the student themself — must be a parent with a real, verified link.
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parent-link-check",
                    params={"parent_id": str(current_user_id), "child_id": str(student_id)},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            linked = resp.status_code == 200 and resp.json().get("linked")
        except Exception:
            linked = False
        if not linked:
            raise HTTPException(status_code=403, detail="Not authorized to view this student's assignments")

    items = await assignments_crud.get_student_assignments(db, student_id)
    completed = sum(1 for i in items if i["is_completed"])
    return StudentAssignmentsResponse(assignments=items, total=len(items), completed=completed)
