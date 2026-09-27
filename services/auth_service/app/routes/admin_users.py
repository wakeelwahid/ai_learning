import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.dependencies import require_admin
from app.crud.user_crud import UserRepository, list_users
from app.database.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.schemas.user import CreateTeacherRequest, UpdateUserRequest, UserResponse
from app.services.account_service import AccountService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/users", response_model=list[UserResponse])
async def get_users(
    role: UserRole | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await list_users(db, role=role, is_active=is_active, page=page, limit=limit)


@router.patch("/users/{user_id}", response_model=UserResponse, summary="[Admin] Update a user's status or role")
async def patch_user(
    user_id: str,
    body: UpdateUserRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    # mode="json" so a UserRole enum value (e.g. role=UserRole.PARENT)
    # serializes to its plain string ("parent") rather than staying an enum
    # instance, which the audit log's JSONB metadata column can't accept.
    changes = body.model_dump(exclude_none=True, mode="json")
    service = AccountService(db)
    ip = request.client.host if request.client else None
    ua = request.headers.get("User-Agent")
    try:
        updated = await service.admin_update_user(uid, changes, admin)
    except HTTPException:
        await write_audit_log(
            "user_updated_by_admin", actor_id=admin.id, actor_role=admin.role.value,
            resource_type="user", resource_id=uid, result="denied",
            ip_address=ip, user_agent=ua, metadata={"requested_changes": changes},
        )
        raise
    # role/is_active are the two fields this endpoint actually allows
    # changing (see UpdateUserRequest) — worth naming explicitly in the
    # action so "role_changed" and "account_deactivated" are individually
    # greppable rather than buried in one generic "user_updated" event.
    action = "role_changed" if "role" in changes else (
        "user_deactivated" if changes.get("is_active") is False else
        "user_activated" if changes.get("is_active") is True else
        "user_updated_by_admin"
    )
    await write_audit_log(
        action, actor_id=admin.id, actor_role=admin.role.value,
        resource_type="user", resource_id=uid, result="success",
        ip_address=ip, user_agent=ua, metadata={"changes": changes},
    )
    return updated


@router.post("/admin/teachers", response_model=UserResponse, status_code=201,
             summary="[Admin] Create a teacher account (teachers have no self-service sign-up)")
async def create_teacher(
    body: CreateTeacherRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    if await repo.get_by_phone(body.phone):
        raise HTTPException(status_code=409, detail="A user with this phone number already exists.")
    if body.email and await repo.get_by_email(body.email):
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    user = await repo.create(
        phone=body.phone,
        email=body.email,
        full_name=body.full_name,
        school_name=body.school_name,
        role=UserRole.TEACHER,
        is_verified=True,
        terms_accepted=True,
    )
    await db.commit()
    await db.refresh(user)

    # Mirror what phone-OTP registration does for a student/parent — create
    # the user_service profile row now so check_profile_complete() passes
    # immediately (teachers only need full_name, no board/class) instead of
    # the teacher hitting /profile-complete on first login.
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/profile",
                json={
                    "user_id": str(user.id),
                    "full_name": body.full_name,
                    "school_name": body.school_name,
                },
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        logger.warning("Failed to pre-create user_service profile for new teacher %s", user.id)

    ip = request.client.host if request.client else None
    await write_audit_log(
        "teacher_created", actor_id=admin.id, actor_role=admin.role.value,
        resource_type="user", resource_id=user.id, result="success",
        ip_address=ip, user_agent=request.headers.get("User-Agent"),
        metadata={"phone": body.phone, "full_name": body.full_name},
    )
    return user


@router.get("/admin/audit-logs", summary="[Admin] List auth_service audit log entries")
async def list_audit_logs(
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditLog)
    if action:
        q = q.where(AuditLog.action == action)
    if resource_type:
        q = q.where(AuditLog.resource_type == resource_type)
    q = q.order_by(AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": str(r.id),
            "actor_id": str(r.actor_id) if r.actor_id else None,
            "actor_role": r.actor_role,
            "action": r.action,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "result": r.result,
            "ip_address": r.ip_address,
            "metadata": r.metadata_json,
            "created_at": r.created_at.isoformat(),
            "service": "auth_service",
        }
        for r in rows
    ]
