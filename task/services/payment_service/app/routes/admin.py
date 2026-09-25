"""Admin endpoints: revenue metrics, subscription listing, plan CRUD and the
/admin/coupons coupon CRUD.

NOTE: the /admin/coupons routes here are distinct from the admin-panel coupon
routes in coupons.py (/coupons). Both sets existed in the original single
routes file with subtly different behavior; preserved as-is, not merged.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.dependencies import require_admin
from app.crud import coupon_crud, payment_crud, plan_crud, revenue_crud, subscription_crud
from app.database.session import get_db
from app.models.audit_log import AuditLog
from app.schemas.checkout import RefundPaymentRequest, RefundPaymentResponse
from app.schemas.coupon import CouponCreateRequest, CouponResponse
from app.schemas.plan import PlanCreateRequest, PlanResponse, PlanUpdateRequest
from app.schemas.subscription import SubscriptionResponse
from app.services.cashfree_service import CashfreeService
from app.services.family_entitlement_service import get_inherited_subscriptions_batch

router = APIRouter(prefix="/payments", tags=["payments"])


# ── Admin: payments list (feeds the refund UI) ─────────────────────────────────

@router.get("/admin/payments", summary="[Admin] List captured/failed payments",
            dependencies=[Depends(require_admin)])
async def admin_list_payments(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    payments, total = await payment_crud.list_payments(db, status=status, page=page, limit=limit)
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "payments": [
            {
                "id": str(p.id),
                "user_id": str(p.user_id),
                "plan_key": p.plan_key,
                "amount_paise": p.amount_paise,
                "currency": p.currency,
                "status": p.status.value,
                "gateway": p.gateway,
                "cashfree_order_id": p.cashfree_order_id,
                "coupon_code_used": p.coupon_code_used,
                "created_at": p.created_at.isoformat(),
            }
            for p in payments
        ],
    }


# ── Admin: refunds ─────────────────────────────────────────────────────────────

@router.post("/admin/payments/{payment_id}/refund", response_model=RefundPaymentResponse,
             summary="[Admin] Refund a captured payment and revoke the access it granted")
async def admin_refund_payment(
    payment_id: uuid.UUID,
    body: RefundPaymentRequest,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = CashfreeService(db)
    result = await service.refund_payment(payment_id, reason=body.reason)
    await db.commit()
    await write_audit_log(
        "payment_refunded", actor_id=admin_id, resource_type="payment", resource_id=payment_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"refund_id": result["refund_id"], "reason": body.reason},
    )
    return RefundPaymentResponse(**result)


# ── Admin: subscriptions ───────────────────────────────────────────────────────

@router.get("/admin/revenue", summary="[Admin] Real revenue metrics from captured payments",
            dependencies=[Depends(require_admin)])
async def admin_revenue(db: AsyncSession = Depends(get_db)):
    return await revenue_crud.get_revenue_stats(db)


@router.get("/admin/revenue/daily", summary="[Admin] Daily captured-revenue trend",
            dependencies=[Depends(require_admin)])
async def admin_daily_revenue(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    return {"trend": await revenue_crud.get_daily_revenue(db, days)}


class EffectiveStatusBatchRequest(BaseModel):
    user_ids: list[uuid.UUID]


@router.post("/admin/subscriptions/effective-batch",
             summary="[Admin] Effective plan status (own vs inherited from a parent) for a batch of users")
async def admin_effective_status_batch(
    body: EffectiveStatusBatchRequest,
    db: AsyncSession = Depends(get_db),
    _admin_id: uuid.UUID = Depends(require_admin),
):
    """Backs the Users table's Subscription column — a student can be
    premium with zero rows of their own in this service's `subscriptions`
    table if a linked parent pays instead (see
    services/family_entitlement_service.py). Without this, admin has no way
    to tell "this student paid" apart from "this student is covered by
    their parent" when reviewing accounts."""
    user_ids = body.user_ids[:200]  # bounded — this is a per-page lookup, not a full-table scan
    own_subs = await subscription_crud.get_active_subscriptions_for_users(db, user_ids)

    # Only students with no subscription of their own need the (slower,
    # cross-service) inherited-subscription check.
    students_needing_check = [uid for uid in user_ids if uid not in own_subs]
    inherited = await get_inherited_subscriptions_batch(db, students_needing_check)

    out: dict[str, dict] = {}
    for user_id in user_ids:
        sub = own_subs.get(user_id)
        if sub:
            out[str(user_id)] = {"status": "own", "plan": sub.plan, "expires_at": sub.expires_at.isoformat() if sub.expires_at else None}
            continue
        parent_hit = inherited.get(user_id)
        if parent_hit:
            parent_id, parent_sub = parent_hit
            out[str(user_id)] = {
                "status": "inherited",
                "plan": parent_sub.plan,
                "expires_at": parent_sub.expires_at.isoformat() if parent_sub.expires_at else None,
                "inherited_from_parent": str(parent_id),
            }
        else:
            out[str(user_id)] = {"status": "free"}
    return out


@router.get("/admin/subscriptions", summary="[Admin] List all subscriptions with stats", dependencies=[Depends(require_admin)])
async def admin_subscriptions(
    status: str | None = Query(None),
    plan: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    subs = await subscription_crud.list_subscriptions(db, status=status, plan=plan, page=page, limit=limit)
    stats = await subscription_crud.get_subscription_stats(db)
    return {
        "stats": stats,
        "subscriptions": [SubscriptionResponse.model_validate(s) for s in subs],
    }


# ── Admin: plans (dynamic, admin-managed) ──────────────────────────────────────

@router.get("/admin/plans", response_model=list[PlanResponse],
            summary="[Admin] List all plans, including inactive", dependencies=[Depends(require_admin)])
async def admin_list_plans(db: AsyncSession = Depends(get_db)):
    plans = await plan_crud.list_all_plans_ordered(db)
    return [PlanResponse.from_model(p) for p in plans]


@router.post("/admin/plans", response_model=PlanResponse,
             summary="[Admin] Create a new plan")
async def admin_create_plan(
    body: PlanCreateRequest,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await plan_crud.get_plan_by_key(db, body.plan_key)
    if existing:
        raise HTTPException(status_code=409, detail="A plan with this key already exists")

    plan = await plan_crud.create_plan(db, body)
    await write_audit_log(
        "plan_created", actor_id=admin_id, resource_type="plan", resource_id=plan.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"plan_key": body.plan_key, "price": body.price},
    )
    return PlanResponse.from_model(plan)


@router.patch("/admin/plans/{plan_id}", response_model=PlanResponse,
              summary="[Admin] Update a plan")
async def admin_update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdateRequest,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    plan = await plan_crud.get_plan_by_id(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    updates = body.model_dump(exclude_unset=True)
    if "price" in updates:
        updates["price_paise"] = updates.pop("price") * 100

    plan = await plan_crud.update_plan(db, plan, updates)
    await write_audit_log(
        "plan_updated", actor_id=admin_id, resource_type="plan", resource_id=plan_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"plan_key": plan.plan_key, "changes": updates},
    )
    return PlanResponse.from_model(plan)


@router.delete("/admin/plans/{plan_id}", summary="[Admin] Deactivate a plan")
async def admin_delete_plan(
    plan_id: uuid.UUID,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Soft delete — existing subscriptions/payments reference plan_key as a
    # plain string, not a foreign key, so their history stays intact even
    # after the plan is hidden from the public /plans listing.
    plan = await plan_crud.get_plan_by_id(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    await plan_crud.deactivate_plan(db, plan_id)
    await write_audit_log(
        "plan_deactivated", actor_id=admin_id, resource_type="plan", resource_id=plan_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"plan_key": plan.plan_key},
    )
    return {"id": str(plan_id), "deactivated": True}


# ── Admin: coupons ─────────────────────────────────────────────────────────────

@router.post("/admin/coupons", response_model=CouponResponse,
             summary="[Admin] Create a new coupon code")
async def create_coupon(
    body: CouponCreateRequest,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Check uniqueness
    existing = await coupon_crud.get_coupon_by_code(db, body.code)
    if existing:
        raise HTTPException(status_code=409, detail="Coupon code already exists")

    coupon = await coupon_crud.create_coupon(db, body)
    await write_audit_log(
        "coupon_created", actor_id=admin_id, resource_type="coupon", resource_id=coupon.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        metadata={"code": body.code, "discount_type": body.discount_type, "discount_value": body.discount_value},
    )
    return coupon


@router.get("/admin/coupons", response_model=list[CouponResponse],
            summary="[Admin] List all coupon codes", dependencies=[Depends(require_admin)])
async def list_coupons(
    active_only: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    return await coupon_crud.list_coupons(db, active_only=active_only, page=page, limit=limit)


@router.delete("/admin/coupons/{coupon_id}", summary="[Admin] Deactivate a coupon")
async def deactivate_coupon(
    coupon_id: uuid.UUID,
    request: Request,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
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
    return {"id": str(coupon_id), "deactivated": True}


# ── Admin: audit log ────────────────────────────────────────────────────────────

@router.get("/admin/audit-logs", summary="[Admin] List payment_service audit log entries",
            dependencies=[Depends(require_admin)])
async def admin_list_audit_logs(
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
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
            "service": "payment_service",
        }
        for r in rows
    ]
