"""Multi-day Challenge Programs — routes.

Path segment `/challenge-programs/...` deliberately avoids the existing
`/challenges/...` namespace owned by the unrelated DailyChallenge feature
(see app/routes/challenges.py).

RBAC (spec, enforced here — the backend, not just UI-hiding):
  - Admin/Super Admin: every /admin/* route below, via Depends(require_admin)
    (allows only admin/super_admin — automatically 403s teachers, students,
    everyone else, with zero extra role-block logic needed).
  - Teacher: no route below grants them anything — same as every other
    admin-only surface in this service.
  - Student: /published, /{id}, /{id}/join, /enrollments/{user_id} only.
    There is deliberately NO student-callable "mark task complete" route —
    task completion only ever advances via the internal trigger endpoint,
    called server-to-server by content_service/quiz_service/battle_service/
    analytics_service on a real completion event they verify themselves.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, require_admin, require_internal, verify_owner_or_admin
from app.crud import challenge_program_crud as crud
from app.database.session import get_db
from app.schemas.challenge_program import (
    AddChallengeDayRequest,
    AddChallengeTaskRequest,
    ChallengeDayProgressResponse,
    ChallengeDayResponse,
    ChallengeProgramResponse,
    ChallengeTaskProgressResponse,
    ChallengeTaskResponse,
    CreateChallengeProgramRequest,
    EnrollmentProgressResponse,
    InternalTaskProgressRequest,
    UpdateChallengeProgramRequest,
    UpdateChallengeTaskRequest,
)
from app.services.challenge_program_service import ChallengeProgramService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _program_response(db: AsyncSession, program, include_days: bool = False) -> ChallengeProgramResponse:
    participant_count = await crud.get_participant_count(db, program.id)
    days_payload = []
    if include_days:
        days = await crud.get_days_for_program(db, program.id)
        for day in sorted(days, key=lambda d: d.day_number):
            tasks = await crud.get_tasks_for_day(db, day.id)
            days_payload.append(ChallengeDayResponse(
                id=day.id, day_number=day.day_number, title=day.title,
                tasks=[ChallengeTaskResponse.model_validate(t) for t in sorted(tasks, key=lambda t: t.sequence)],
            ))
    return ChallengeProgramResponse(
        id=program.id, title=program.title, description=program.description,
        cover_image_url=program.cover_image_url, duration_days=program.duration_days,
        status=program.status, badge_type=program.badge_type.value if program.badge_type else None,
        completion_xp=program.completion_xp, completion_ep=program.completion_ep,
        created_by=program.created_by, created_at=program.created_at, published_at=program.published_at,
        participant_count=participant_count, days=days_payload,
    )


async def _get_task_or_404(db: AsyncSession, task_id: uuid.UUID):
    task = await crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def _get_day_or_404(db: AsyncSession, day_id: uuid.UUID):
    day = await crud.get_day(db, day_id)
    if not day:
        raise HTTPException(status_code=404, detail="Day not found")
    return day


async def _get_program_or_404_admin(db: AsyncSession, program_id: uuid.UUID):
    program = await crud.get_program(db, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Challenge program not found")
    return program


# ── Admin: authoring ─────────────────────────────────────────────────────────

@router.post("/challenge-programs/admin", response_model=ChallengeProgramResponse, status_code=201)
async def admin_create_program(
    body: CreateChallengeProgramRequest,
    db: AsyncSession = Depends(get_db),
    admin_id: uuid.UUID = Depends(require_admin),
):
    svc = ChallengeProgramService(db)
    program = await svc.create_program(
        admin_id, body.title, body.description, body.cover_image_url,
        body.duration_days, body.badge_type, body.completion_xp, body.completion_ep,
    )
    response = await _program_response(db, program)
    await db.commit()
    return response


@router.get("/challenge-programs/admin", response_model=list[ChallengeProgramResponse], dependencies=[Depends(require_admin)])
async def admin_list_programs(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    programs = await crud.list_programs_admin(db, limit, offset)
    return [await _program_response(db, p) for p in programs]


@router.get("/challenge-programs/admin/{program_id}", response_model=ChallengeProgramResponse, dependencies=[Depends(require_admin)])
async def admin_get_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = await _get_program_or_404_admin(db, program_id)
    return await _program_response(db, program, include_days=True)


@router.patch("/challenge-programs/admin/{program_id}", response_model=ChallengeProgramResponse, dependencies=[Depends(require_admin)])
async def admin_update_program(program_id: uuid.UUID, body: UpdateChallengeProgramRequest, db: AsyncSession = Depends(get_db)):
    program = await _get_program_or_404_admin(db, program_id)
    svc = ChallengeProgramService(db)
    program = await svc.update_program(program, body.model_dump(exclude_unset=True))
    response = await _program_response(db, program)
    await db.commit()
    return response


@router.post("/challenge-programs/admin/{program_id}/days", response_model=ChallengeDayResponse, status_code=201, dependencies=[Depends(require_admin)])
async def admin_add_day(program_id: uuid.UUID, body: AddChallengeDayRequest, db: AsyncSession = Depends(get_db)):
    await _get_program_or_404_admin(db, program_id)  # 404 before attempting the insert
    svc = ChallengeProgramService(db)
    day = await svc.add_day(program_id, body.day_number, body.title)
    await db.commit()
    return ChallengeDayResponse(id=day.id, day_number=day.day_number, title=day.title, tasks=[])


@router.delete("/challenge-programs/admin/days/{day_id}", dependencies=[Depends(require_admin)])
async def admin_delete_day(day_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    day = await _get_day_or_404(db, day_id)
    svc = ChallengeProgramService(db)
    await svc.delete_day(day)
    await db.commit()
    return {"deleted": True}


@router.post("/challenge-programs/admin/days/{day_id}/tasks", response_model=ChallengeTaskResponse, status_code=201, dependencies=[Depends(require_admin)])
async def admin_add_task(day_id: uuid.UUID, body: AddChallengeTaskRequest, db: AsyncSession = Depends(get_db)):
    await _get_day_or_404(db, day_id)
    svc = ChallengeProgramService(db)
    task = await svc.add_task(
        day_id, body.task_type, body.content_ref, body.title,
        body.is_required, body.sequence, body.xp_reward, body.ep_reward,
    )
    await db.commit()
    return ChallengeTaskResponse.model_validate(task)


@router.patch("/challenge-programs/admin/tasks/{task_id}", response_model=ChallengeTaskResponse, dependencies=[Depends(require_admin)])
async def admin_update_task(task_id: uuid.UUID, body: UpdateChallengeTaskRequest, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, task_id)
    svc = ChallengeProgramService(db)
    task = await svc.update_task(task, body.model_dump(exclude_unset=True))
    await db.commit()
    return ChallengeTaskResponse.model_validate(task)


@router.delete("/challenge-programs/admin/tasks/{task_id}", dependencies=[Depends(require_admin)])
async def admin_delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, task_id)
    svc = ChallengeProgramService(db)
    await svc.delete_task(task)
    await db.commit()
    return {"deleted": True}


# ── Admin: lifecycle ─────────────────────────────────────────────────────────

@router.post("/challenge-programs/admin/{program_id}/publish", response_model=ChallengeProgramResponse, dependencies=[Depends(require_admin)])
async def admin_publish_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = await _get_program_or_404_admin(db, program_id)
    svc = ChallengeProgramService(db)
    program = await svc.publish(program)
    response = await _program_response(db, program)
    await db.commit()
    return response


@router.post("/challenge-programs/admin/{program_id}/unpublish", response_model=ChallengeProgramResponse, dependencies=[Depends(require_admin)])
async def admin_unpublish_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = await _get_program_or_404_admin(db, program_id)
    svc = ChallengeProgramService(db)
    program = await svc.unpublish(program)
    response = await _program_response(db, program)
    await db.commit()
    return response


@router.post("/challenge-programs/admin/{program_id}/archive", response_model=ChallengeProgramResponse, dependencies=[Depends(require_admin)])
async def admin_archive_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = await _get_program_or_404_admin(db, program_id)
    svc = ChallengeProgramService(db)
    program = await svc.archive(program)
    response = await _program_response(db, program)
    await db.commit()
    return response


@router.delete("/challenge-programs/admin/{program_id}", dependencies=[Depends(require_admin)])
async def admin_delete_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = await _get_program_or_404_admin(db, program_id)
    svc = ChallengeProgramService(db)
    await svc.delete_program(program)
    await db.commit()
    return {"deleted": True}


@router.get("/challenge-programs/admin/{program_id}/analytics", dependencies=[Depends(require_admin)])
async def admin_get_analytics(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = await _get_program_or_404_admin(db, program_id)
    svc = ChallengeProgramService(db)
    return await svc.get_analytics(program)


# ── Student: browse / join / progress ───────────────────────────────────────

@router.get("/challenge-programs/published", response_model=list[ChallengeProgramResponse])
async def list_published_programs(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _caller_id: uuid.UUID = Depends(get_current_user_id),
):
    svc = ChallengeProgramService(db)
    programs = await svc.list_published(limit, offset)
    return [await _program_response(db, p, include_days=True) for p in programs]


@router.get("/challenge-programs/{program_id}", response_model=ChallengeProgramResponse)
async def get_published_program(
    program_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _caller_id: uuid.UUID = Depends(get_current_user_id),
):
    svc = ChallengeProgramService(db)
    program = await svc.get_published_or_404(program_id)
    return await _program_response(db, program, include_days=True)


@router.post("/challenge-programs/{program_id}/join", status_code=201)
async def join_program(
    program_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Students can only ever enroll themselves — current_user_id comes
    from the verified JWT, never a client-supplied user_id in the body."""
    svc = ChallengeProgramService(db)
    enrollment = await svc.join(current_user_id, program_id)
    await db.commit()
    return {
        "enrolled": True,
        "program_id": str(program_id),
        "status": enrollment.status.value,
        "current_day": enrollment.current_day,
    }


@router.get("/challenge-programs/enrollments/{user_id}/{program_id}", response_model=EnrollmentProgressResponse, dependencies=[Depends(verify_owner_or_admin)])
async def get_enrollment_progress(user_id: uuid.UUID, program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    svc = ChallengeProgramService(db)
    data = await svc.get_enrollment_progress(user_id, program_id)
    program_resp = await _program_response(db, data["program"])
    enrollment = data["enrollment"]

    day_responses = []
    for entry in data["days"]:
        day = entry["day"]
        day_responses.append(ChallengeDayProgressResponse(
            day_number=day.day_number,
            title=day.title,
            is_unlocked=entry["is_unlocked"],
            tasks=[ChallengeTaskResponse.model_validate(t) for t in entry["tasks"]],
            task_progress=[
                ChallengeTaskProgressResponse(task_id=t.id, is_completed=p.is_completed if p else False, completed_at=p.completed_at if p else None)
                for t, p in zip(entry["tasks"], entry["task_progress"])
            ],
        ))

    return EnrollmentProgressResponse(
        program=program_resp, status=enrollment.status, current_day=enrollment.current_day,
        joined_at=enrollment.joined_at, completed_at=enrollment.completed_at, days=day_responses,
    )


@router.get("/challenge-programs/enrollments/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def list_my_enrollments(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    enrollments = await crud.get_enrollments_for_user(db, user_id)
    out = []
    for e in enrollments:
        program = await crud.get_program(db, e.program_id)
        if not program:
            continue
        out.append({
            "program": await _program_response(db, program),
            "status": e.status.value,
            "current_day": e.current_day,
            "joined_at": e.joined_at,
            "completed_at": e.completed_at,
        })
    return out


# ── Internal: task-completion trigger ───────────────────────────────────────

@router.post(
    "/challenge-programs/internal/task-progress",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
)
async def internal_task_progress(body: InternalTaskProgressRequest, db: AsyncSession = Depends(get_db)):
    """[Internal] content_service/quiz_service/battle_service/
    analytics_service call this on a REAL completion event. This is the
    ONLY way a Challenge task ever advances — there is deliberately no
    student-callable "mark complete" route; the handler itself re-verifies
    completion against the owning service before advancing anything."""
    svc = ChallengeProgramService(db)
    result = await svc.handle_task_progress_trigger(body.user_id, body.task_content_ref, body.task_type)
    await db.commit()
    return result
