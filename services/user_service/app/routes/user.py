import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, get_current_user_id_and_role, get_redis, require_admin
from app.crud.user_crud import (
    get_all_profiles as crud_get_all_profiles,
    get_avatar_bytes,
    get_parent_link_by_id,
    get_profile as crud_get_profile,
    get_study_time_limit_by_child,
    set_avatar,
    verify_parent_child_link,
)
from app.database.session import get_db
from app.schemas.user import (
    CreateProfileRequest,
    LinkStudentRequest,
    ParentStudentLinkCreate,
    ParentStudentLinkResponse,
    ProfileResponse,
    StudyLimitRequest,
    StudyTimeLimitResponse,
    StudyTimeLimitUpsert,
    StudyTimeStatusResponse,
    UpdateParentLinkRequest,
    UpdateProfileRequest,
)
from app.services.activity_client import get_used_today_minutes, is_limit_reached
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])

ADMIN_ROLES = ("admin", "super_admin")
PARENT_ROLES = ("parent", "admin", "super_admin")


# ── Student profile ────────────────────────────────────────────────────────────

@router.post("/profile", response_model=ProfileResponse, status_code=201)
async def create_profile(
    body: CreateProfileRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if body.user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot create profile for another user")
    return await UserService(db).create_profile(body)


@router.get("/profile/{user_id}", response_model=ProfileResponse)
async def get_profile(
    user_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's profile")
    return await UserService(db).get_profile(user_id)


@router.patch("/profile/{user_id}", response_model=ProfileResponse)
async def update_profile(
    user_id: uuid.UUID,
    body: UpdateProfileRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot update another user's profile")
    return await UserService(db).update_profile(user_id, body)


@router.put("/profile/{user_id}", response_model=ProfileResponse)
async def put_profile(
    user_id: uuid.UUID,
    body: UpdateProfileRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot update another user's profile")
    return await UserService(db).update_profile(user_id, body)


# ── Profile photo (avatar) ─────────────────────────────────────────────────────

AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
AVATAR_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/profile/avatar", summary="Upload / replace the caller's profile photo")
async def upload_avatar(
    file: UploadFile = File(...),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Stores the image in the caller's profile row and returns the public
    avatar_url (served by GET /users/avatar/{user_id}, ?v= cache-buster).
    The client should then push the same avatar_url to auth's PUT /profile so
    it also appears in /auth/me."""
    if (file.content_type or "").lower() not in AVATAR_MIMES:
        raise HTTPException(status_code=400, detail="Use a JPEG, PNG, WebP or GIF image")
    data = await file.read()
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large — keep it under 2 MB")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    version = int(datetime.now(timezone.utc).timestamp())
    avatar_url = f"{settings.PUBLIC_GATEWAY_URL}/api/v1/users/avatar/{caller_id}?v={version}"
    profile = await set_avatar(db, caller_id, data, file.content_type, avatar_url)
    if not profile:
        raise HTTPException(status_code=404, detail="Create your profile before uploading a photo")

    await avatar_cache_invalidate(caller_id)  # new photo visible immediately
    return {"avatar_url": profile.avatar_url}


AVATAR_CACHE_TTL = 300      # positive hits — photo bytes change rarely
AVATAR_MISS_TTL = 120       # negative hits — most students have no photo yet
AVATAR_CACHE_HEADERS = {"Cache-Control": "public, max-age=300"}


async def avatar_cache_invalidate(user_id: uuid.UUID) -> None:
    try:
        redis = await get_redis()
        if redis is not None:
            await redis.delete(f"avatar:{user_id}")
    except Exception:
        pass


@router.get("/avatar/{user_id}", summary="Serve a user's uploaded profile photo")
async def get_avatar(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Public (no auth) so plain <img>/Image tags work everywhere the photo is
    shown — chat rows, battle lobbies, leaderboards, activity feeds.

    Built for high fan-out (every leaderboard row on every screen points here):
    - Redis read-through (base64) — repeat hits never touch Postgres.
    - Negative caching — users WITHOUT a photo (the majority) are remembered
      for 2 minutes, so their 404s cost one Redis GET, not a DB query each.
    - Cache-Control on BOTH 200 and 404 — browsers stop re-requesting for
      5 minutes; the uploader's own URL carries ?v= so they see changes at once.
    """
    cache_key = f"avatar:{user_id}"
    redis = None
    try:
        redis = await get_redis()
        if redis is not None:
            raw = await redis.get(cache_key)
            if raw == "0":  # cached miss
                raise HTTPException(status_code=404, detail="No photo uploaded",
                                    headers=AVATAR_CACHE_HEADERS)
            if raw:
                doc = json.loads(raw)
                return Response(
                    content=base64.b64decode(doc["b"]),
                    media_type=doc.get("m") or "image/jpeg",
                    headers=AVATAR_CACHE_HEADERS,
                )
    except HTTPException:
        raise
    except Exception:
        redis = None  # Redis down — serve from DB, never fail the image

    row = await get_avatar_bytes(db, user_id)
    if not row or not row[0]:
        if redis is not None:
            try:
                await redis.set(cache_key, "0", ex=AVATAR_MISS_TTL)
            except Exception:
                pass
        raise HTTPException(status_code=404, detail="No photo uploaded", headers=AVATAR_CACHE_HEADERS)

    data, mime = bytes(row[0]), row[1] or "image/jpeg"
    if redis is not None:
        try:
            await redis.set(
                cache_key,
                json.dumps({"m": mime, "b": base64.b64encode(data).decode()}),
                ex=AVATAR_CACHE_TTL,
            )
        except Exception:
            pass
    return Response(content=data, media_type=mime, headers=AVATAR_CACHE_HEADERS)


# ── Parent-student links ───────────────────────────────────────────────────────

@router.post(
    "/parents/{parent_id}/students",
    response_model=ParentStudentLinkResponse,
    status_code=201,
    summary="Link a student to a parent account",
)
async def link_student(
    parent_id: uuid.UUID,
    body: ParentStudentLinkCreate,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if parent_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot manage links for another parent account")
    if role not in PARENT_ROLES:
        raise HTTPException(status_code=403, detail="Parent role required to create a parent-student link")
    return await UserService(db).link_student(parent_id, body)


@router.get(
    "/parents/{parent_id}/students",
    response_model=list[ParentStudentLinkResponse],
    summary="Get all students linked to a parent",
)
async def get_parent_students(
    parent_id: uuid.UUID,
    status: str | None = Query(default=None, pattern="^(pending|approved)$"),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if parent_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot access another parent's students")
    approved = None if status is None else status == "approved"
    return await UserService(db).get_parent_students(parent_id, approved=approved)


@router.get(
    "/students/{student_id}/parents",
    response_model=list[ParentStudentLinkResponse],
    summary="Get all parent-link requests (pending and approved) for a student",
)
async def get_student_parents(
    student_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if student_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's parent links")
    return await UserService(db).get_student_parent_links(student_id)


@router.patch(
    "/parents/links/{link_id}",
    response_model=ParentStudentLinkResponse,
    summary="Update a parent-student link (relationship, approval, names)",
)
async def update_parent_link(
    link_id: uuid.UUID,
    body: UpdateParentLinkRequest,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    link = await get_parent_link_by_id(db, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    is_admin = role in ADMIN_ROLES
    is_parent = link.parent_user_id == caller_id
    is_student = link.student_user_id == caller_id
    if not is_admin and not is_parent and not is_student:
        raise HTTPException(status_code=403, detail="Cannot modify this link")
    if body.is_approved is not None and not is_admin and not is_student:
        # The parent who requested the link cannot also be the one who
        # approves it — only the student being linked (or an admin, for
        # support cases) can grant consent. See create_parent_student_link().
        raise HTTPException(
            status_code=403,
            detail="Only the student can approve or reject a parent link",
        )
    if body.is_approved is False and link.is_approved and not is_admin:
        # An approved link can only be undone by the parent removing it
        # (DELETE) — never by the student flipping approval back off, which
        # would be a silent self-unlink around the parent-only removal rule
        # enforced in delete_parent_link().
        raise HTTPException(
            status_code=403,
            detail="Only the parent can remove an approved link.",
        )
    if body.is_approved is False and not link.is_approved:
        # Declining is a delete, not a no-op PATCH that returns 200 and
        # leaves the pending request alive.
        raise HTTPException(
            status_code=400,
            detail="To decline a pending request, delete the link (DELETE /parents/links/{link_id}).",
        )
    if (body.relationship is not None or body.father_name is not None or body.mother_name is not None) \
            and not is_admin and not is_parent:
        raise HTTPException(status_code=403, detail="Only the parent can edit link details")
    if body.approval_required is not None and not is_admin and not is_parent:
        raise HTTPException(status_code=403, detail="Only the parent can change Approval Mode for this link")
    return await UserService(db).update_parent_link(link_id, body)


@router.delete(
    "/parents/links/{link_id}",
    summary="Remove a parent-student link",
)
async def delete_parent_link(
    link_id: uuid.UUID,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    link = await get_parent_link_by_id(db, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    # The parent may remove the link at any time (unlinking their child).
    # The student may remove it only while it is still PENDING — i.e.
    # reject a request they never approved. Once the student has approved
    # it, only the parent (or an admin) can remove it: the parent owns the
    # monitoring relationship, and letting the student silently unlink
    # themselves afterwards would defeat parental monitoring entirely.
    is_admin = role in ADMIN_ROLES
    is_parent = link.parent_user_id == caller_id
    is_student = link.student_user_id == caller_id
    if not is_admin and not is_parent and not is_student:
        raise HTTPException(status_code=403, detail="Cannot modify this link")
    if is_student and not is_parent and not is_admin and link.is_approved:
        raise HTTPException(
            status_code=403,
            detail="Only the parent can remove an approved link.",
        )
    removed_by = "admin" if is_admin else ("parent" if is_parent else "student")
    return await UserService(db).remove_parent_link(link_id, removed_by=removed_by)


# ── Study time limits ─────────────────────────────────────────────────────────

@router.get(
    "/parent/study-limits/{child_id}",
    response_model=StudyTimeLimitResponse,
    summary="Get daily study-time limit set by parent for a child",
)
async def get_study_limit(
    child_id: uuid.UUID,
    parent_id: uuid.UUID,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in ADMIN_ROLES:
        if parent_id != caller_id:
            raise HTTPException(status_code=403, detail="Cannot access study limits for another parent")
        if not await verify_parent_child_link(db, parent_id, child_id):
            raise HTTPException(status_code=403, detail="No parent-child link found between the given users.")
    return await _with_usage(await UserService(db).get_study_time_limit(parent_id, child_id))


async def _with_usage(limit: StudyTimeLimitResponse) -> StudyTimeLimitResponse:
    used = await get_used_today_minutes(limit.child_user_id)
    limit.used_today_minutes = used
    limit.limit_reached = is_limit_reached(limit.daily_limit_minutes, limit.is_enabled, used)
    return limit


@router.put(
    "/parent/study-limits/{child_id}",
    response_model=StudyTimeLimitResponse,
    summary="Create or update a daily study-time limit for a child",
)
async def set_study_limit(
    child_id: uuid.UUID,
    parent_id: uuid.UUID,
    body: StudyTimeLimitUpsert,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in ADMIN_ROLES:
        if parent_id != caller_id:
            raise HTTPException(status_code=403, detail="Cannot set study limits for another parent")
        if not await verify_parent_child_link(db, parent_id, child_id):
            raise HTTPException(status_code=403, detail="No parent-child link found between the given users.")
    return await _with_usage(await UserService(db).upsert_study_time_limit(parent_id, child_id, body))


# ── Legacy endpoints kept for backward compatibility ───────────────────────────

@router.post("/parent-link")
async def link_parent(
    parent_user_id: uuid.UUID,
    student_user_id: uuid.UUID,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if parent_user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot create links for another parent")
    if role not in PARENT_ROLES:
        raise HTTPException(status_code=403, detail="Parent role required to create a parent-student link")
    return await UserService(db).link_parent(parent_user_id, student_user_id)


@router.get("/parent/{parent_user_id}/children")
async def get_children(
    parent_user_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if parent_user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot access another parent's children")
    return await UserService(db).get_children(parent_user_id)


# ── New endpoints ──────────────────────────────────────────────────────────────

@router.post(
    "/parent/link-student",
    summary="Link authenticated parent to a student by student_id",
)
async def parent_link_student(
    body: LinkStudentRequest,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in PARENT_ROLES:
        raise HTTPException(status_code=403, detail="Parent role required to create a parent-student link")
    return await UserService(db).link_parent(caller_id, body.student_id)


@router.post(
    "/parent/study-limit/{child_id}",
    response_model=StudyTimeLimitResponse,
    summary="Create or update a daily study-time limit for a child (POST)",
)
async def post_study_limit(
    child_id: uuid.UUID,
    body: StudyLimitRequest,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in ADMIN_ROLES and not await verify_parent_child_link(db, caller_id, child_id):
        raise HTTPException(status_code=403, detail="No parent-child link found between the given users.")
    upsert_body = StudyTimeLimitUpsert(daily_limit_minutes=body.daily_limit_minutes)
    return await _with_usage(await UserService(db).upsert_study_time_limit(caller_id, child_id, upsert_body))


@router.get(
    "/study-time/{user_id}",
    response_model=StudyTimeStatusResponse,
    summary="Get study time limit + today's usage for a user (child perspective)",
)
async def get_study_time(
    user_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's study time")
    limit = await get_study_time_limit_by_child(db, user_id)
    used = await get_used_today_minutes(user_id)
    if limit is None:
        return StudyTimeStatusResponse(user_id=user_id, used_today_minutes=used)
    return StudyTimeStatusResponse(
        user_id=user_id,
        daily_limit_minutes=limit.daily_limit_minutes,
        is_enabled=limit.is_enabled,
        used_today_minutes=used,
        limit_reached=is_limit_reached(limit.daily_limit_minutes, limit.is_enabled, used),
        id=limit.id,
        parent_user_id=limit.parent_user_id,
        child_user_id=limit.child_user_id,
        updated_at=limit.updated_at,
    )


@router.get(
    "/parent/student-progress/{student_id}",
    summary="Get basic student info for parent monitoring dashboard",
)
async def get_student_progress(
    student_id: uuid.UUID,
    caller: Tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    caller_id, role = caller
    if role not in ADMIN_ROLES and caller_id != student_id:
        if not await verify_parent_child_link(db, caller_id, student_id):
            raise HTTPException(status_code=403, detail="Cannot access this student's progress")

    profile = await crud_get_profile(db, student_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return {
        "user_id": profile.user_id,
        "full_name": profile.full_name,
        "avatar_url": profile.avatar_url,
        "class_number": profile.class_number,
        "board": profile.board,
        "school_name": profile.school_name,
        "last_active": None,
    }


@router.get(
    "/admin/all",
    summary="Get all user profiles (admin only)",
    dependencies=[Depends(require_admin)],
)
async def get_all_profiles(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    profiles = await crud_get_all_profiles(db, skip=skip, limit=limit)
    return [
        {
            "user_id": p.user_id,
            "full_name": p.full_name,
            "avatar_url": p.avatar_url,
            "class_number": p.class_number,
            "board": p.board,
            "school_name": p.school_name,
            "city": p.city,
            "state": p.state,
            "gender": p.gender,
            "bio": p.bio,
        }
        for p in profiles
    ]
