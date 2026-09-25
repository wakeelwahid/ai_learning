import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_profile import ParentProfile, UserProfile
from app.models.parent_settings import StudyTimeLimit
from app.schemas.user import (
    CreateProfileRequest,
    ParentStudentLinkCreate,
    StudyTimeLimitUpsert,
    UpdateParentLinkRequest,
    UpdateProfileRequest,
)


# ── User profile ───────────────────────────────────────────────────────────────

async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> UserProfile | None:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    return result.scalar_one_or_none()


async def get_profiles_by_ids(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, UserProfile]:
    """Batched form of get_profile — one query for a list of users instead
    of one per user (e.g. enriching every linked-student/parent row in a
    single links list)."""
    if not user_ids:
        return {}
    result = await db.execute(select(UserProfile).where(UserProfile.user_id.in_(user_ids)))
    return {p.user_id: p for p in result.scalars().all()}


async def create_profile(db: AsyncSession, body: CreateProfileRequest) -> UserProfile:
    profile = UserProfile(**body.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def list_user_ids_by_curriculum(
    db: AsyncSession, board: str, class_number: int
) -> list[uuid.UUID]:
    """Every user_id whose profile is set to this exact board & class — the
    only "classroom" concept this platform has (no teacher-student roster
    exists), used by analytics_service to build a teacher's cohort view."""
    result = await db.execute(
        select(UserProfile.user_id).where(
            UserProfile.board == board, UserProfile.class_number == class_number
        )
    )
    return [row[0] for row in result.all()]


async def update_profile(
    db: AsyncSession, user_id: uuid.UUID, body: UpdateProfileRequest
) -> UserProfile | None:
    profile = await get_profile(db, user_id)
    if profile is None:
        return None
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


async def set_avatar(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: bytes,
    content_type: str,
    avatar_url: str,
) -> UserProfile | None:
    """Store uploaded avatar bytes/mime/url on the caller's profile row."""
    profile = await get_profile(db, user_id)
    if profile is None:
        return None
    profile.avatar_bytes = data
    profile.avatar_mime = content_type
    profile.avatar_url = avatar_url
    await db.commit()
    return profile


async def get_avatar_bytes(
    db: AsyncSession, user_id: uuid.UUID
):
    """Return the (avatar_bytes, avatar_mime) row for a user, or None."""
    result = await db.execute(
        select(UserProfile.avatar_bytes, UserProfile.avatar_mime).where(UserProfile.user_id == user_id)
    )
    return result.first()


async def get_all_profiles(
    db: AsyncSession, skip: int = 0, limit: int = 100
) -> list[UserProfile]:
    result = await db.execute(select(UserProfile).offset(skip).limit(limit))
    return list(result.scalars().all())


async def upsert_profile_fields(db: AsyncSession, body: dict) -> UserProfile:
    """[internal] Upsert a user's profile from a raw dict payload sent by
    auth_service at registration (board & class are collected at signup and
    become the source of truth for content filtering).

    Creates the UserProfile row if missing, applies only the fields present
    in `body`, and commits once — verbatim logic relocated from
    routes/internal.py's internal_upsert_profile.
    """
    user_id = uuid.UUID(str(body["user_id"]))
    profile = await get_profile(db, user_id)
    if profile is None:
        profile = UserProfile(user_id=user_id, full_name=body.get("full_name") or "Student")
        db.add(profile)
    if body.get("full_name"):
        profile.full_name = body["full_name"]
    if body.get("board"):
        profile.board = str(body["board"])[:20]
    if body.get("class_number") is not None:
        profile.class_number = int(body["class_number"])
    if body.get("school_name"):
        profile.school_name = body["school_name"]
    await db.commit()
    return profile


# ── Parent-student links ───────────────────────────────────────────────────────

async def get_parent_students(
    db: AsyncSession, parent_user_id: uuid.UUID, approved: bool | None = None
) -> list[ParentProfile]:
    stmt = select(ParentProfile).where(ParentProfile.parent_user_id == parent_user_id)
    if approved is not None:
        stmt = stmt.where(ParentProfile.is_approved.is_(approved))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_approved_parent_ids(db: AsyncSession) -> list[uuid.UUID]:
    result = await db.execute(
        select(ParentProfile.parent_user_id).where(ParentProfile.is_approved.is_(True)).distinct()
    )
    return list(result.scalars().all())


async def list_approved_student_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Students with at least one APPROVED parent link — the only students
    whose activity any parent can ask about, so the only ones worth indexing."""
    result = await db.execute(
        select(ParentProfile.student_user_id).where(ParentProfile.is_approved.is_(True)).distinct()
    )
    return list(result.scalars().all())


async def get_student_parents(
    db: AsyncSession, student_user_id: uuid.UUID
) -> list[ParentProfile]:
    result = await db.execute(
        select(ParentProfile).where(ParentProfile.student_user_id == student_user_id)
    )
    return list(result.scalars().all())


async def get_parent_student_link(
    db: AsyncSession, parent_user_id: uuid.UUID, student_user_id: uuid.UUID
) -> ParentProfile | None:
    result = await db.execute(
        select(ParentProfile).where(
            ParentProfile.parent_user_id == parent_user_id,
            ParentProfile.student_user_id == student_user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_approved_child_ids_batch(
    db: AsyncSession, parent_user_id: uuid.UUID, student_user_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    """Batched form of verify_parent_child_link for N candidate students in
    one query — backs analytics_service's parent multi-child summary (a
    parent with several linked children would otherwise cost one internal
    HTTP round-trip per child to authorize). Returns only the subset that is
    both linked to this parent AND approved — same "approval required, not
    just parent's say-so" rule as the single-child check."""
    if not student_user_ids:
        return set()
    rows = (await db.execute(
        select(ParentProfile.student_user_id).where(
            ParentProfile.parent_user_id == parent_user_id,
            ParentProfile.student_user_id.in_(student_user_ids),
            ParentProfile.is_approved.is_(True),
        )
    )).scalars().all()
    return set(rows)


async def verify_parent_child_link(
    db: AsyncSession, parent_user_id: uuid.UUID, student_user_id: uuid.UUID
) -> bool:
    """Return True iff a ParentProfile row links this parent to this student
    AND the student has approved it.

    This is the single source of truth for parent->child ownership checks.
    Used by route-level IDOR guards in user.py/chat.py and by the
    cross-service internal endpoint (see routes/internal.py) that
    payment_service and analytics_service call, since each service has
    its own isolated database and cannot query ParentProfile directly. An
    unapproved link must grant NO access anywhere this is consulted — the
    student's approval, not the parent's say-so, is what makes the link real.
    """
    link = await get_parent_student_link(db, parent_user_id, student_user_id)
    return link is not None and link.is_approved


async def get_parent_link_by_id(
    db: AsyncSession, link_id: uuid.UUID
) -> ParentProfile | None:
    result = await db.execute(select(ParentProfile).where(ParentProfile.id == link_id))
    return result.scalar_one_or_none()


async def list_approved_parent_ids_for_student(
    db: AsyncSession, student_user_id: uuid.UUID
) -> list[uuid.UUID]:
    """Every parent_user_id with a student-approved link to this student —
    backs payment_service's family entitlement sharing (a premium parent's
    subscription covers their approved-linked students). Same is_approved
    gate as verify_parent_child_link: an unapproved link must never grant
    anything."""
    result = await db.execute(
        select(ParentProfile.parent_user_id).where(
            ParentProfile.student_user_id == student_user_id,
            ParentProfile.is_approved.is_(True),
        )
    )
    return [row[0] for row in result.all()]


async def list_approved_parent_ids_for_students(
    db: AsyncSession, student_user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Batched form of list_approved_parent_ids_for_student — one query for
    a whole page of students (e.g. the admin Users table) instead of one
    round trip per student. Students with no approved parent link are
    simply absent from the returned dict."""
    if not student_user_ids:
        return {}
    result = await db.execute(
        select(ParentProfile.student_user_id, ParentProfile.parent_user_id).where(
            ParentProfile.student_user_id.in_(student_user_ids),
            ParentProfile.is_approved.is_(True),
        )
    )
    by_student: dict[uuid.UUID, list[uuid.UUID]] = {}
    for student_id, parent_id in result.all():
        by_student.setdefault(student_id, []).append(parent_id)
    return by_student


async def create_parent_student_link(
    db: AsyncSession, parent_user_id: uuid.UUID, body: ParentStudentLinkCreate
) -> ParentProfile:
    # approval_required/is_approved are never taken from the client — a
    # parent must not be able to self-approve a link to a student who never
    # consented. Every new link starts unapproved; only the student's own
    # approval (via PATCH /parents/links/{link_id}) can activate it, and
    # verify_parent_child_link() (the source of truth every downstream
    # authorization check relies on) treats an unapproved link as no link.
    fields = body.model_dump()
    link = ParentProfile(
        parent_user_id=parent_user_id,
        approval_required=False,
        is_approved=False,
        **fields,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


async def update_parent_student_link(
    db: AsyncSession, link_id: uuid.UUID, body: UpdateParentLinkRequest
) -> ParentProfile | None:
    result = await db.execute(select(ParentProfile).where(ParentProfile.id == link_id))
    link = result.scalar_one_or_none()
    if link is None:
        return None
    was_approved = link.is_approved
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(link, field, value)
    if link.is_approved and not was_approved:
        link.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(link)
    return link


async def delete_parent_student_link(
    db: AsyncSession, link_id: uuid.UUID
) -> bool:
    result = await db.execute(select(ParentProfile).where(ParentProfile.id == link_id))
    link = result.scalar_one_or_none()
    if link is None:
        return False
    # A parent's study-time limit only makes sense while the link exists —
    # otherwise an ex-parent's (or a rejected requester's) limit kept
    # applying to the student forever through get_study_time_limit_by_child().
    await db.execute(
        delete(StudyTimeLimit).where(
            StudyTimeLimit.parent_user_id == link.parent_user_id,
            StudyTimeLimit.child_user_id == link.student_user_id,
        )
    )
    await db.delete(link)
    await db.commit()
    return True


# ── Study time limits ─────────────────────────────────────────────────────────

async def get_study_time_limit(
    db: AsyncSession, parent_user_id: uuid.UUID, child_user_id: uuid.UUID
) -> StudyTimeLimit | None:
    result = await db.execute(
        select(StudyTimeLimit).where(
            StudyTimeLimit.parent_user_id == parent_user_id,
            StudyTimeLimit.child_user_id == child_user_id,
        )
    )
    return result.scalar_one_or_none()


async def upsert_study_time_limit(
    db: AsyncSession,
    parent_user_id: uuid.UUID,
    child_user_id: uuid.UUID,
    body: StudyTimeLimitUpsert,
) -> StudyTimeLimit:
    limit = await get_study_time_limit(db, parent_user_id, child_user_id)
    if limit is None:
        limit = StudyTimeLimit(
            parent_user_id=parent_user_id,
            child_user_id=child_user_id,
            **body.model_dump(),
        )
        db.add(limit)
    else:
        for field, value in body.model_dump().items():
            setattr(limit, field, value)
    await db.commit()
    await db.refresh(limit)
    return limit


async def get_study_time_limit_by_child(
    db: AsyncSession, child_user_id: uuid.UUID
) -> StudyTimeLimit | None:
    """The limit that applies to a child (child-perspective endpoint).

    Only limits set by a parent whose link is still APPROVED count — an
    unlinked ex-parent's or a rejected requester's row must not keep
    applying. With several approved parents the most restrictive enabled
    limit wins (0 minutes means "no limit", so it never wins on its own).
    """
    result = await db.execute(
        select(StudyTimeLimit)
        .join(
            ParentProfile,
            (ParentProfile.parent_user_id == StudyTimeLimit.parent_user_id)
            & (ParentProfile.student_user_id == StudyTimeLimit.child_user_id),
        )
        .where(StudyTimeLimit.child_user_id == child_user_id, ParentProfile.is_approved.is_(True))
    )
    limits = list(result.scalars().all())
    enabled = [lim for lim in limits if lim.is_enabled]
    bounded = [lim for lim in enabled if lim.daily_limit_minutes > 0]
    if bounded:
        return min(bounded, key=lambda lim: lim.daily_limit_minutes)
    if enabled:
        return enabled[0]
    return limits[0] if limits else None


# ── Legacy aliases kept for backward compatibility ─────────────────────────────

async def get_children(
    db: AsyncSession, parent_user_id: uuid.UUID
) -> list[ParentProfile]:
    return await get_parent_students(db, parent_user_id)
