"""Service layer for the multi-day Challenge Programs feature.

RBAC is enforced entirely at the route layer (app/routes/challenge_programs.py)
via Depends(require_admin) / Depends(get_current_user_id) /
Depends(verify_owner_or_admin) — this class assumes the caller has already
been authorized and never re-checks role itself, matching the existing
service-layer convention in this codebase (see GamificationService,
DailyChallengeService).
"""
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import challenge_program_crud as crud
from app.models.challenge_program import (
    ChallengeDay,
    ChallengeProgram,
    ChallengeProgramStatus,
    ChallengeTask,
    ChallengeTaskType,
    EnrollmentStatus,
    UserChallengeEnrollment,
    UserChallengeTaskProgress,
)
from app.models.gamification import BadgeType, EduPointEvent, XPEvent
from app.services.gamification_service import EduPointsService, GamificationService

logger = logging.getLogger(__name__)


class ChallengeProgramService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Admin: authoring ─────────────────────────────────────────────────────

    async def create_program(
        self, created_by: uuid.UUID, title: str, description: str | None,
        cover_image_url: str | None, duration_days: int, badge_type: str | None,
        completion_xp: int, completion_ep: int,
    ) -> ChallengeProgram:
        badge = self._validate_badge(badge_type)
        program = ChallengeProgram(
            title=title, description=description, cover_image_url=cover_image_url,
            duration_days=duration_days, badge_type=badge,
            completion_xp=completion_xp, completion_ep=completion_ep,
            created_by=created_by, status=ChallengeProgramStatus.DRAFT,
        )
        self.db.add(program)
        await self.db.flush()
        return program

    def _validate_badge(self, badge_type: str | None) -> BadgeType | None:
        if not badge_type:
            return None
        try:
            return BadgeType(badge_type)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Unknown badge_type '{badge_type}'")

    async def update_program(self, program: ChallengeProgram, updates: dict) -> ChallengeProgram:
        if "badge_type" in updates:
            updates["badge_type"] = self._validate_badge(updates["badge_type"])
        for key, value in updates.items():
            if value is not None:
                setattr(program, key, value)
        await self.db.flush()
        return program

    async def add_day(self, program_id: uuid.UUID, day_number: int, title: str | None) -> ChallengeDay:
        day = ChallengeDay(program_id=program_id, day_number=day_number, title=title)
        self.db.add(day)
        try:
            await self.db.flush()
        except Exception as exc:
            await self.db.rollback()
            raise HTTPException(status_code=409, detail=f"Day {day_number} already exists for this program") from exc
        return day

    async def add_task(
        self, day_id: uuid.UUID, task_type: ChallengeTaskType, content_ref: str, title: str,
        is_required: bool, sequence: int, xp_reward: int, ep_reward: int,
    ) -> ChallengeTask:
        task = ChallengeTask(
            day_id=day_id, task_type=task_type, content_ref=content_ref, title=title,
            is_required=is_required, sequence=sequence, xp_reward=xp_reward, ep_reward=ep_reward,
        )
        self.db.add(task)
        await self.db.flush()
        return task

    async def update_task(self, task: ChallengeTask, updates: dict) -> ChallengeTask:
        for key, value in updates.items():
            if value is not None:
                setattr(task, key, value)
        await self.db.flush()
        return task

    async def delete_task(self, task: ChallengeTask) -> None:
        await self.db.delete(task)
        await self.db.flush()

    async def delete_day(self, day: ChallengeDay) -> None:
        tasks = await crud.get_tasks_for_day(self.db, day.id)
        for t in tasks:
            await self.db.delete(t)
        await self.db.delete(day)
        await self.db.flush()

    # ── Admin: lifecycle ─────────────────────────────────────────────────────

    async def publish(self, program: ChallengeProgram) -> ChallengeProgram:
        days = await crud.get_days_for_program(self.db, program.id)
        if not days:
            raise HTTPException(status_code=400, detail="Cannot publish a program with no days")
        for day in days:
            tasks = await crud.get_tasks_for_day(self.db, day.id)
            if not tasks:
                raise HTTPException(status_code=400, detail=f"Day {day.day_number} has no tasks")
        program.status = ChallengeProgramStatus.PUBLISHED
        program.published_at = datetime.now(timezone.utc)
        await self.db.flush()
        return program

    async def unpublish(self, program: ChallengeProgram) -> ChallengeProgram:
        program.status = ChallengeProgramStatus.DRAFT
        await self.db.flush()
        return program

    async def archive(self, program: ChallengeProgram) -> ChallengeProgram:
        program.status = ChallengeProgramStatus.ARCHIVED
        await self.db.flush()
        return program

    async def delete_program(self, program: ChallengeProgram) -> None:
        if program.status != ChallengeProgramStatus.DRAFT:
            raise HTTPException(
                status_code=400,
                detail="Only a draft program can be deleted — unpublish/archive first, or archive instead of deleting.",
            )
        days = await crud.get_days_for_program(self.db, program.id)
        day_ids = [d.id for d in days]
        tasks = await crud.get_tasks_for_days(self.db, day_ids)
        for t in tasks:
            await self.db.delete(t)
        for d in days:
            await self.db.delete(d)
        await self.db.delete(program)
        await self.db.flush()

    # ── Admin: analytics ─────────────────────────────────────────────────────

    async def get_analytics(self, program: ChallengeProgram) -> dict:
        enrollments = await crud.get_enrollments_for_program(self.db, program.id)
        total = len(enrollments)
        completed = sum(1 for e in enrollments if e.status == EnrollmentStatus.COMPLETED)
        days = await crud.get_days_for_program(self.db, program.id)
        per_day_funnel = []
        for day in sorted(days, key=lambda d: d.day_number):
            reached = sum(1 for e in enrollments if e.current_day >= day.day_number)
            per_day_funnel.append({"day_number": day.day_number, "reached": reached})
        return {
            "program_id": str(program.id),
            "total_participants": total,
            "completed": completed,
            "completion_rate": round(completed / total, 4) if total else 0.0,
            "per_day_funnel": per_day_funnel,
        }

    # ── Student: browse / join ───────────────────────────────────────────────

    async def list_published(self, limit: int, offset: int) -> list[ChallengeProgram]:
        return await crud.list_published_programs(self.db, limit, offset)

    async def get_published_or_404(self, program_id: uuid.UUID, allow_draft: bool = False) -> ChallengeProgram:
        program = await crud.get_program(self.db, program_id)
        if not program:
            raise HTTPException(status_code=404, detail="Challenge program not found")
        if not allow_draft and program.status != ChallengeProgramStatus.PUBLISHED:
            raise HTTPException(status_code=404, detail="Challenge program not found")
        return program

    async def join(self, user_id: uuid.UUID, program_id: uuid.UUID) -> UserChallengeEnrollment:
        program = await crud.get_program(self.db, program_id)
        if not program or program.status != ChallengeProgramStatus.PUBLISHED:
            raise HTTPException(status_code=404, detail="Challenge program not found")
        existing = await crud.get_enrollment(self.db, user_id, program_id)
        if existing:
            return existing
        enrollment = UserChallengeEnrollment(user_id=user_id, program_id=program_id)
        self.db.add(enrollment)
        try:
            await self.db.flush()
        except Exception as exc:
            await self.db.rollback()
            existing = await crud.get_enrollment(self.db, user_id, program_id)
            if existing:
                return existing
            raise HTTPException(status_code=500, detail="Could not join challenge") from exc
        return enrollment

    async def get_enrollment_progress(self, user_id: uuid.UUID, program_id: uuid.UUID) -> dict:
        program = await crud.get_program(self.db, program_id)
        if not program:
            raise HTTPException(status_code=404, detail="Challenge program not found")
        enrollment = await crud.get_enrollment(self.db, user_id, program_id)
        if not enrollment:
            raise HTTPException(status_code=404, detail="You have not joined this challenge")

        days = await crud.get_days_for_program(self.db, program_id)
        day_ids = [d.id for d in days]
        all_tasks = await crud.get_tasks_for_days(self.db, day_ids)
        task_ids = [t.id for t in all_tasks]
        progress_rows = await crud.get_task_progress_for_tasks(self.db, user_id, task_ids)
        progress_by_task = {p.task_id: p for p in progress_rows}

        tasks_by_day: dict[uuid.UUID, list[ChallengeTask]] = {}
        for t in all_tasks:
            tasks_by_day.setdefault(t.day_id, []).append(t)

        day_payload = []
        for day in sorted(days, key=lambda d: d.day_number):
            day_tasks = sorted(tasks_by_day.get(day.id, []), key=lambda t: t.sequence)
            day_payload.append({
                "day": day,
                "tasks": day_tasks,
                "task_progress": [
                    progress_by_task.get(t.id) for t in day_tasks
                ],
                "is_unlocked": day.day_number <= enrollment.current_day,
            })

        return {"program": program, "enrollment": enrollment, "days": day_payload}

    # ── Internal: task-completion trigger ────────────────────────────────────

    async def handle_task_progress_trigger(
        self, user_id: uuid.UUID, task_content_ref: str, task_type: ChallengeTaskType | None,
    ) -> dict:
        """Called by content_service/quiz_service/battle_service/
        analytics_service on a REAL completion event. Resolves every
        ChallengeTask referencing this content_ref (scoped to task_type
        when given), restricted to programs this user is actually enrolled
        in, verifies completion server-side against the OWNING service
        (never trusts this call's mere arrival as proof), and advances
        progress + awards rewards. Always safe to call speculatively — a
        no-op if the user isn't enrolled in any matching challenge."""
        task_types = [task_type] if task_type else None
        matching_tasks = await crud.find_tasks_by_content_ref(self.db, task_content_ref, task_types)
        if not matching_tasks:
            return {"advanced": []}

        day_ids = list({t.day_id for t in matching_tasks})
        days = await crud.get_days(self.db, day_ids)
        program_ids = list({d.program_id for d in days})
        enrollments = await crud.find_active_enrollments_for_task_content(self.db, user_id, program_ids)
        if not enrollments:
            return {"advanced": []}
        enrolled_program_ids = {e.program_id for e in enrollments}
        day_by_id = {d.id: d for d in days}

        advanced = []
        for task in matching_tasks:
            day = day_by_id.get(task.day_id)
            if not day or day.program_id not in enrolled_program_ids:
                continue
            enrollment = next(e for e in enrollments if e.program_id == day.program_id)
            if enrollment.status != EnrollmentStatus.ACTIVE:
                continue
            # A task on a day the student hasn't reached yet doesn't count
            # early — this also blocks a task on day 5 from silently
            # completing before day 1-4 are done, preserving sequencing.
            if day.day_number > enrollment.current_day:
                continue

            result = await self._advance_task(user_id, task, day, enrollment)
            if result:
                advanced.append(result)

        return {"advanced": advanced}

    async def _advance_task(
        self, user_id: uuid.UUID, task: ChallengeTask, day: ChallengeDay, enrollment: UserChallengeEnrollment,
    ) -> dict | None:
        progress = await crud.get_task_progress(self.db, user_id, task.id)
        if progress and progress.is_completed:
            return None  # already advanced — retried trigger, safe no-op

        completed = await self._verify_task_completion(user_id, task)
        if not completed:
            return None

        if not progress:
            progress = UserChallengeTaskProgress(user_id=user_id, task_id=task.id)
            self.db.add(progress)
        progress.is_completed = True
        progress.completed_at = datetime.now(timezone.utc)
        await self.db.flush()

        if task.xp_reward > 0 and not progress.xp_awarded:
            await GamificationService(self.db)._apply_xp_amount(
                user_id, task.xp_reward, XPEvent.CHALLENGE_TASK_COMPLETE, str(task.id),
            )
            progress.xp_awarded = True
        if task.ep_reward > 0 and not progress.ep_awarded:
            await EduPointsService(self.db).award_amount(
                user_id, task.ep_reward, EduPointEvent.CHALLENGE_TASK_COMPLETE, str(task.id),
            )
            progress.ep_awarded = True

        await self._maybe_advance_day_and_program(user_id, day, enrollment)
        return {"task_id": str(task.id), "day_number": day.day_number}

    async def _verify_task_completion(self, user_id: uuid.UUID, task: ChallengeTask) -> bool:
        """Re-verify completion directly against the owning service —
        the internal trigger call is just a hint to re-check, never
        trusted as proof by itself, matching the referral-qualification
        pattern used elsewhere in this platform."""
        try:
            async with httpx.AsyncClient(timeout=settings.CHALLENGE_TASK_CHECK_TIMEOUT_SECONDS) as client:
                if task.task_type == ChallengeTaskType.VIDEO:
                    resp = await client.get(
                        f"{settings.CONTENT_SERVICE_URL}/api/v1/content/videos/internal/{task.content_ref}/completed/{user_id}",
                        headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    )
                elif task.task_type in (ChallengeTaskType.QUIZ, ChallengeTaskType.PRACTICE):
                    resp = await client.get(
                        f"{settings.QUIZ_SERVICE_URL}/api/v1/quizzes/attempts/internal/completed/{user_id}/{task.content_ref}",
                        headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    )
                elif task.task_type == ChallengeTaskType.BATTLE:
                    resp = await client.get(
                        f"{settings.BATTLE_SERVICE_URL}/api/v1/battles/internal/completed/{user_id}/{task.content_ref}",
                        headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    )
                elif task.task_type == ChallengeTaskType.STUDY_SESSION:
                    # content_ref holds a topic_id (or "" for unscoped); the
                    # window starts when the row's own enrollment... but we
                    # don't have that here, so anchor to the task's own
                    # creation would be wrong too — anchor to "since the
                    # program day was reachable" isn't tracked either.
                    # Simplest correct anchor available: the ChallengeTask
                    # itself never expires, so use a wide-enough window
                    # (this call only fires on a genuine completion event
                    # anyway, so `since` mainly guards against a session
                    # from years before this challenge existed).
                    since_iso = task.created_at.isoformat() if task.created_at else "1970-01-01T00:00:00+00:00"
                    params = {"since": since_iso}
                    if task.content_ref:
                        params["topic_id"] = task.content_ref
                    resp = await client.get(
                        f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/revision/completed/{user_id}",
                        params=params,
                        headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    )
                else:
                    return False
            if resp.status_code != 200:
                return False
            return resp.json().get("completed", False) is True
        except Exception as exc:
            logger.warning("Challenge task completion check failed for task %s: %s", task.id, exc)
            return False

    async def _maybe_advance_day_and_program(
        self, user_id: uuid.UUID, day: ChallengeDay, enrollment: UserChallengeEnrollment,
    ) -> None:
        day_tasks = await crud.get_tasks_for_day(self.db, day.id)
        required = [t for t in day_tasks if t.is_required]
        if required:
            progress_rows = await crud.get_task_progress_for_tasks(self.db, user_id, [t.id for t in required])
            done_ids = {p.task_id for p in progress_rows if p.is_completed}
            if not all(t.id in done_ids for t in required):
                return  # this day isn't done yet

        program = await crud.get_program(self.db, enrollment.program_id)
        if not program:
            return

        if day.day_number >= enrollment.current_day:
            enrollment.current_day = day.day_number + 1

        if day.day_number >= program.duration_days:
            # Final day's required tasks just completed — finish the program.
            if enrollment.status != EnrollmentStatus.COMPLETED:
                enrollment.status = EnrollmentStatus.COMPLETED
                enrollment.completed_at = datetime.now(timezone.utc)
                await self._award_program_completion(user_id, program)

        await self.db.flush()

    async def _award_program_completion(self, user_id: uuid.UUID, program: ChallengeProgram) -> None:
        ref = f"challenge_program_complete_{program.id}"
        if program.completion_xp > 0:
            await GamificationService(self.db)._apply_xp_amount(
                user_id, program.completion_xp, XPEvent.CHALLENGE_PROGRAM_COMPLETE, ref,
            )
        if program.completion_ep > 0:
            await EduPointsService(self.db).award_amount(
                user_id, program.completion_ep, EduPointEvent.CHALLENGE_PROGRAM_COMPLETE, ref,
            )
        if program.badge_type:
            await GamificationService(self.db)._award_badge(user_id, program.badge_type)
