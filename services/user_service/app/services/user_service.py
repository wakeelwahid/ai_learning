import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import parent_features_crud, user_crud
from app.services.content_client import invalidate_board_class_cache
from app.services.link_notifications import notify_link_approved, notify_link_removed, notify_link_requested
from app.models.parent_settings import StudyTimeLimit
from app.models.user_profile import ParentProfile, UserProfile
from app.schemas.user import (
    CreateProfileRequest,
    ParentStudentLinkCreate,
    ParentStudentLinkResponse,
    StudyTimeLimitResponse,
    StudyTimeLimitUpsert,
    UpdateParentLinkRequest,
    UpdateProfileRequest,
)


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── User profile ───────────────────────────────────────────────────────────

    async def get_profile(self, user_id: uuid.UUID) -> UserProfile:
        profile = await user_crud.get_profile(self.db, user_id)
        if profile is None:
            # Auto-provision a blank scaffold profile on first access. Needs a
            # non-empty full_name to satisfy CreateProfileRequest's min_length=1
            # (added during API-validation hardening) — this is just a
            # placeholder the user overwrites via the normal update flow.
            profile = await user_crud.create_profile(
                self.db,
                CreateProfileRequest(user_id=user_id, full_name="Student"),
            )
        return profile

    async def create_profile(self, body: CreateProfileRequest) -> UserProfile:
        return await user_crud.create_profile(self.db, body)

    # Board/Class/School may change at most three times; the 3rd change locks
    # the three fields for 90 days (server-enforced — clients only display it).
    CURRICULUM_FIELDS = ("board", "class_number", "school_name")
    CURRICULUM_MAX_CHANGES = 3
    CURRICULUM_LOCK_DAYS = 90

    async def update_profile(self, user_id: uuid.UUID, body: UpdateProfileRequest) -> UserProfile:
        profile = await user_crud.get_profile(self.db, user_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="Profile not found")

        data = body.model_dump(exclude_none=True)
        # A "curriculum change" replaces an EXISTING value — the first-time
        # fill (e.g. right after registration) is free.
        changing = any(
            f in data
            and getattr(profile, f) is not None
            and data[f] != getattr(profile, f)
            for f in self.CURRICULUM_FIELDS
        )
        now = datetime.now(timezone.utc)
        if changing:
            locked_until = profile.curriculum_locked_until
            if locked_until and now < locked_until:
                raise HTTPException(
                    status_code=423,
                    detail=(
                        f"Board, Class and School changes are locked until "
                        f"{locked_until.strftime('%d %b %Y')}. You already used your "
                        f"{self.CURRICULUM_MAX_CHANGES} allowed changes."
                    ),
                )
            if locked_until and now >= locked_until:
                # Lock window over — fresh allowance
                profile.curriculum_changes_count = 0
                profile.curriculum_locked_until = None
            profile.curriculum_changes_count += 1
            if profile.curriculum_changes_count >= self.CURRICULUM_MAX_CHANGES:
                profile.curriculum_locked_until = now + timedelta(days=self.CURRICULUM_LOCK_DAYS)

        updated = await user_crud.update_profile(self.db, user_id, body)
        if updated is None:
            raise HTTPException(status_code=404, detail="Profile not found")
        if "board" in data or "class_number" in data:
            await invalidate_board_class_cache(user_id)
        return updated

    # ── Parent-student links ───────────────────────────────────────────────────

    async def link_student(
        self, parent_user_id: uuid.UUID, body: ParentStudentLinkCreate
    ) -> ParentStudentLinkResponse:
        existing = await user_crud.get_parent_student_link(
            self.db, parent_user_id, body.student_user_id
        )
        if existing:
            raise HTTPException(status_code=409, detail="Student already linked to this parent")

        student_profile = await user_crud.get_profile(self.db, body.student_user_id)
        if student_profile is None:
            raise HTTPException(status_code=404, detail="Student profile not found")

        # Role lives in auth_service, not here — without this check, any
        # existing user's id (a teacher, another parent, an admin) passed
        # the not-found/duplicate checks above and got linked as a "child"
        # (found live: a parent could link to another parent's own account).
        # The blast radius was limited by relationship checks on every read
        # path, but the write itself never confirmed the target was actually
        # a student.
        if not await self._is_student(body.student_user_id):
            raise HTTPException(status_code=400, detail="Target user is not a student account")

        await self._check_decline_cooldown(parent_user_id, body.student_user_id)
        await self._check_link_caps(parent_user_id, body.student_user_id)

        try:
            link = await user_crud.create_parent_student_link(self.db, parent_user_id, body)
        except IntegrityError:
            # uq_parent_student_link — lost a race with an identical request
            # that passed the read-then-write duplicate check above.
            await self.db.rollback()
            raise HTTPException(status_code=409, detail="Student already linked to this parent")
        await notify_link_requested(self.db, link)
        return enrich_link(link, student_profile)

    async def _check_link_caps(
        self, parent_user_id: uuid.UUID, student_user_id: uuid.UUID
    ) -> None:
        """Enforce the platform-wide parent<->student linking caps.

        Checked here (not as a DB constraint) because both counts require a
        second query plus a human-readable 400 rather than a raw
        IntegrityError — the caller-facing UI needs a specific message to
        show ("this student already has too many parents" is not something
        the linking parent can fix by retrying).
        """
        parent_link_count = len(await user_crud.get_parent_students(self.db, parent_user_id))
        if parent_link_count >= settings.MAX_STUDENTS_PER_PARENT:
            raise HTTPException(
                status_code=400,
                detail=f"A parent can track at most {settings.MAX_STUDENTS_PER_PARENT} students. "
                       "Remove an existing link before adding a new one.",
            )

        student_link_count = len(await user_crud.get_student_parents(self.db, student_user_id))
        if student_link_count >= settings.MAX_PARENTS_PER_STUDENT:
            raise HTTPException(
                status_code=400,
                detail=f"This student already has the maximum of {settings.MAX_PARENTS_PER_STUDENT} "
                       "linked parent accounts.",
            )

    DECLINE_COOLDOWN_DAYS = 3
    DECLINE_REPEAT_THRESHOLD = 3
    DECLINE_LONG_COOLDOWN_DAYS = 30

    async def _check_decline_cooldown(
        self, parent_user_id: uuid.UUID, student_user_id: uuid.UUID
    ) -> None:
        decline = await parent_features_crud.get_link_decline(self.db, parent_user_id, student_user_id)
        if decline is None:
            return
        days = (
            self.DECLINE_LONG_COOLDOWN_DAYS
            if decline.count >= self.DECLINE_REPEAT_THRESHOLD
            else self.DECLINE_COOLDOWN_DAYS
        )
        retry_at = decline.declined_at + timedelta(days=days)
        if datetime.now(timezone.utc) < retry_at:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"This student declined your request on {decline.declined_at.strftime('%d %b %Y')}. "
                    f"You can send a new request after {retry_at.strftime('%d %b %Y')}."
                ),
            )

    async def _is_student(self, user_id: uuid.UUID) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(
                    f"{settings.AUTH_SERVICE_URL}/api/v1/auth/internal/role/{user_id}",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            if resp.status_code != 200:
                return False
            return resp.json().get("role") == "student"
        except httpx.RequestError:
            # auth_service unreachable — fail closed rather than silently
            # allowing an unverified link, consistent with this service's
            # own JWT-verification dependency (which fails closed with 503).
            raise HTTPException(status_code=503, detail="Unable to verify student role right now")

    async def get_parent_students(
        self, parent_user_id: uuid.UUID, approved: bool | None = None
    ) -> list[ParentStudentLinkResponse]:
        links = await user_crud.get_parent_students(self.db, parent_user_id, approved=approved)
        profiles = await user_crud.get_profiles_by_ids(self.db, [link.student_user_id for link in links])
        return [enrich_link(link, profiles.get(link.student_user_id)) for link in links]

    async def get_student_parent_links(
        self, student_user_id: uuid.UUID
    ) -> list[ParentStudentLinkResponse]:
        """The student's own view of every parent-link request against
        their account, approved or still pending — what they need to see in
        order to approve/reject via update_parent_link()."""
        links = await user_crud.get_student_parents(self.db, student_user_id)
        profiles = await user_crud.get_profiles_by_ids(self.db, [link.parent_user_id for link in links])
        results = []
        for link in links:
            parent_profile = profiles.get(link.parent_user_id)
            resp = enrich_link(link, None)
            resp.parent_name = parent_profile.full_name if parent_profile else None
            results.append(resp)
        return results

    async def update_parent_link(
        self, link_id: uuid.UUID, body: UpdateParentLinkRequest
    ) -> ParentStudentLinkResponse:
        before = await user_crud.get_parent_link_by_id(self.db, link_id)
        was_pending = before is not None and not before.is_approved
        link = await user_crud.update_parent_student_link(self.db, link_id, body)
        if link is not None and was_pending and link.is_approved:
            await parent_features_crud.clear_link_decline(self.db, link.parent_user_id, link.student_user_id)
            await notify_link_approved(self.db, link)
        if link is None:
            raise HTTPException(status_code=404, detail="Link not found")
        student_profile = await user_crud.get_profile(self.db, link.student_user_id)
        return enrich_link(link, student_profile)

    async def remove_parent_link(self, link_id: uuid.UUID, removed_by: str = "parent") -> dict:
        link = await user_crud.get_parent_link_by_id(self.db, link_id)
        if link is None:
            raise HTTPException(status_code=404, detail="Link not found")
        # Snapshot before the delete — the ORM row's attributes expire once
        # the delete commits and the notifier still needs the ids.
        snapshot = SimpleNamespace(
            parent_user_id=link.parent_user_id,
            student_user_id=link.student_user_id,
            relationship=link.relationship,
            is_approved=link.is_approved,
        )
        deleted = await user_crud.delete_parent_student_link(self.db, link_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Link not found")
        if removed_by == "student" and not snapshot.is_approved:
            await parent_features_crud.record_link_decline(
                self.db, snapshot.parent_user_id, snapshot.student_user_id
            )
        await notify_link_removed(self.db, snapshot, removed_by)
        return {"deleted": True}

    # ── Study time limits ──────────────────────────────────────────────────────

    async def get_study_time_limit(
        self, parent_user_id: uuid.UUID, child_user_id: uuid.UUID
    ) -> StudyTimeLimitResponse:
        limit = await user_crud.get_study_time_limit(self.db, parent_user_id, child_user_id)
        if limit is None:
            # Return default (not persisted yet)
            limit = StudyTimeLimit(
                id=uuid.uuid4(),
                parent_user_id=parent_user_id,
                child_user_id=child_user_id,
                daily_limit_minutes=120,
                is_enabled=False,
                updated_at=datetime.utcnow(),
            )
        return StudyTimeLimitResponse.model_validate(limit)

    async def upsert_study_time_limit(
        self,
        parent_user_id: uuid.UUID,
        child_user_id: uuid.UUID,
        body: StudyTimeLimitUpsert,
    ) -> StudyTimeLimitResponse:
        limit = await user_crud.upsert_study_time_limit(self.db, parent_user_id, child_user_id, body)
        return StudyTimeLimitResponse.model_validate(limit)

    # ── Legacy ─────────────────────────────────────────────────────────────────

    async def link_parent(
        self, parent_user_id: uuid.UUID, student_user_id: uuid.UUID
    ) -> dict:
        # Legacy shortcut — delegates to the main path so it can never create
        # a link with different checks or defaults (it used to skip the
        # duplicate/role/cap checks entirely and left the approval flags to
        # model defaults).
        await self.link_student(parent_user_id, ParentStudentLinkCreate(student_user_id=student_user_id))
        return {"linked": True}

    async def get_children(self, parent_user_id: uuid.UUID) -> list[dict]:
        links: list[ParentProfile] = await user_crud.get_children(self.db, parent_user_id)
        return [
            {"student_user_id": str(link.student_user_id), "relationship": link.relationship}
            for link in links
        ]


def enrich_link(link: ParentProfile, student: UserProfile | None) -> ParentStudentLinkResponse:
    return ParentStudentLinkResponse(
        id=link.id,
        parent_user_id=link.parent_user_id,
        student_user_id=link.student_user_id,
        relationship=link.relationship,
        father_name=link.father_name,
        mother_name=link.mother_name,
        approval_required=link.approval_required,
        is_approved=link.is_approved,
        student_name=student.full_name if student else None,
        student_class=student.class_number if student else None,
        student_board=student.board if student else None,
        created_at=link.created_at,
        approved_at=link.approved_at,
    )
