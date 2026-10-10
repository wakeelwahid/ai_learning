"""Public coupon validation + the admin-panel coupon CRUD mounted at /coupons.

NOTE: the admin-panel coupon routes here (`/coupons`, `/coupons/{id}`) are a
SEPARATE set from the ones in admin.py (`/admin/coupons`, ...). Both existed in
the original single routes file with slightly different behavior — e.g.
create_coupon_admin passes `is_active=True` explicitly while create_coupon does
not, and delete_coupon_admin returns {"deleted": True} where deactivate_coupon
returns {"deactivated": True}. Preserved exactly as-is; not deduplicated.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
import uuid

from app.core.dependencies import get_optional_user_id, require_admin
from app.crud import coupon_crud
from app.database.session import get_db
from app.schemas.coupon import (
    CouponCreateRequest,
    CouponResponse,
    CouponToggleRequest,
    CouponValidateRequest,
    CouponValidateResponse,
)
from app.services.cashfree_service import CashfreeService

router = APIRouter(prefix="/payments", tags=["payments"])


# ── Coupon validation (public) ─────────────────────────────────────────────────

@router.post("/coupons/validate", response_model=CouponValidateResponse,
             summary="Validate a coupon code for a given plan")
async def validate_coupon(
    body: CouponValidateRequest,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID | None = Depends(get_optional_user_id),
):
    service = CashfreeService(db)
    return await service.validate_coupon(body.code, body.plan, user_id=str(user_id) if user_id else None)


# ── Admin: coupon manager (CRUD used by admin panel) ──────────────────────────

@router.get("/coupons", response_model=list[CouponResponse],
            summary="[Admin] List all coupon codes (admin panel)", dependencies=[Depends(require_admin)])
async def list_coupons_admin(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=200),
    include_inactive: bool = Query(False, description="Include deleted/deactivated coupons"),
    db: AsyncSession = Depends(get_db),
):
    return await coupon_crud.list_coupons_admin(db, page=page, limit=limit, include_inactive=include_inactive)


@router.post("/coupons", response_model=CouponResponse,
             summary="[Admin] Create a new coupon code (admin panel)")
async def create_coupon_admin(
    body: CouponCreateRequest,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await coupon_crud.get_coupon_by_code(db, body.code)
    if existing:
        raise HTTPException(status_code=409, detail="Coupon code already exists")

    coupon = await coupon_crud.create_coupon(db, body, is_active=body.is_active)
    await write_audit_log(
        "coupon_created", actor_id=admin_id, resource_type="coupon", resource_id=coupon.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"code": body.code, "discount_type": body.discount_type, "discount_value": body.discount_value},
    )
    return coupon


@router.patch("/coupons/{coupon_id}", response_model=CouponResponse,
              summary="[Admin] Toggle coupon active state (admin panel)")
async def toggle_coupon_admin(
    coupon_id: uuid.UUID,
    body: CouponToggleRequest,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    coupon = await coupon_crud.get_coupon_by_id(db, coupon_id)
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    coupon = await coupon_crud.toggle_coupon(db, coupon, body.is_active)
    await write_audit_log(
        "coupon_toggled", actor_id=admin_id, resource_type="coupon", resource_id=coupon_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"code": coupon.code, "is_active": body.is_active},
    )
    return coupon


@router.delete("/coupons/{coupon_id}", summary="[Admin] Delete a coupon (admin panel)")
async def delete_coupon_admin(
    coupon_id: uuid.UUID,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Soft delete (matches /admin/coupons/{id}'s deactivate behavior) — a
    # coupon may already be referenced by past payments (Payment.coupon_code_used
    # is a snapshot string, not an FK, but the coupon's own discount/terms
    # history is worth preserving for audit purposes). Hidden from
    # list_coupons_admin by default; pass include_inactive=true to see it.
    coupon = await coupon_crud.get_coupon_by_id(db, coupon_id)
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    await coupon_crud.deactivate_coupon(db, coupon_id)
    await write_audit_log(
        "coupon_deleted", actor_id=admin_id, resource_type="coupon", resource_id=coupon_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"code": coupon.code},
    )
    return {"id": str(coupon_id), "deleted": True}
