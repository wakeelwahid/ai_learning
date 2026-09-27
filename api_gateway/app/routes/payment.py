from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import payment_svc
from app.schemas import (
    CouponCreateRequest,
    CouponToggleRequest,
    CouponValidateRequest,
    CreateOrderRequest,
    ParentCreateOrderRequest,
    ParentVerifyPaymentRequest,
    PlanCreateRequest,
    PlanUpdateRequest,
    RefundPaymentRequest,
    RetryPaymentRequest,
    VerifyPaymentRequest,
)

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])


# ── Orders (Cashfree) ────────────────────────────────────────────────────────

@rest_router(router.post, path="/orders", proxy=payment_svc,
    summary="Create a Cashfree payment order")
async def create_order(request: Request, response: Response, data: CreateOrderRequest):
    pass

@rest_router(router.post, path="/verify", proxy=payment_svc,
    summary="Verify a Cashfree order's status and activate the subscription")
async def verify_payment(request: Request, response: Response, data: VerifyPaymentRequest):
    pass

@rest_router(router.post, path="/webhook", proxy=payment_svc,
    summary="Cashfree webhook receiver (called by Cashfree servers)")
async def webhook(request: Request, response: Response):
    pass


# ── Retry ──────────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/retry", proxy=payment_svc,
    summary="Retry a failed payment")
async def retry_payment(request: Request, response: Response, data: RetryPaymentRequest):
    pass


# ── Subscription ───────────────────────────────────────────────────────────────

@rest_router(router.get, path="/subscription/{user_id}", proxy=payment_svc,
    summary="Get active subscription for a user")
async def get_subscription(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/subscription/{user_id}/cancel", proxy=payment_svc,
    summary="Cancel own subscription (access continues until the current period ends)")
async def cancel_subscription(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/subscription/{user_id}/effective", proxy=payment_svc,
    summary="Own subscription, including family-inherited premium from a linked parent")
async def get_effective_subscription(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/plans", proxy=payment_svc,
    summary="List available subscription plans and prices (admin-managed, dynamic)")
async def get_plans(request: Request, response: Response):
    pass

@rest_router(router.get, path="/history/{user_id}", proxy=payment_svc,
    forward_path=lambda path: path.replace("/history/", "/invoices/", 1),
    summary="Get payment invoices for a user (alias for /invoices)")
async def payment_history(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/invoices/{user_id}", proxy=payment_svc,
    summary="Get invoices for a user")
async def get_invoices(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/admin/subscriptions", proxy=payment_svc,
    summary="[Admin] List all subscriptions with stats")
async def admin_subscriptions(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/subscriptions/effective-batch", proxy=payment_svc,
    summary="[Admin] Effective plan status (own vs inherited) for a batch of users")
async def admin_effective_status_batch(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/revenue", proxy=payment_svc,
    summary="[Admin] Real revenue metrics from captured payments")
async def admin_revenue(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/revenue/daily", proxy=payment_svc,
    summary="[Admin] Daily captured-revenue trend")
async def admin_daily_revenue(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/payments", proxy=payment_svc,
    summary="[Admin] List captured/failed payments")
async def admin_list_payments(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/payments/{payment_id}/refund", proxy=payment_svc,
    summary="[Admin] Refund a captured payment and revoke the access it granted")
async def admin_refund_payment(request: Request, response: Response, payment_id: str, data: RefundPaymentRequest):
    pass

@rest_router(router.get, path="/admin/audit-logs", proxy=payment_svc,
    summary="[Admin] List payment_service audit log entries")
async def admin_list_payment_audit_logs(request: Request, response: Response):
    pass


# ── Receipt ────────────────────────────────────────────────────────────────────

@rest_router(router.get, path="/{payment_id}/receipt", proxy=payment_svc,
    summary="Download invoice/receipt for a payment")
async def get_receipt(request: Request, response: Response, payment_id: str):
    pass


# ── Coupon validation (public) ─────────────────────────────────────────────────

@rest_router(router.post, path="/coupons/validate", proxy=payment_svc,
    summary="Validate a coupon code for a given plan")
async def validate_coupon(request: Request, response: Response, data: CouponValidateRequest):
    pass


# ── Admin: coupons ─────────────────────────────────────────────────────────────

@rest_router(router.post, path="/admin/coupons", proxy=payment_svc,
    summary="[Admin] Create a new coupon code")
async def create_coupon(request: Request, response: Response, data: CouponCreateRequest):
    pass

@rest_router(router.get, path="/admin/coupons", proxy=payment_svc,
    summary="[Admin] List all coupon codes")
async def list_coupons(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/admin/coupons/{coupon_id}", proxy=payment_svc,
    summary="[Admin] Deactivate a coupon")
async def deactivate_coupon(request: Request, response: Response, coupon_id: str):
    pass


# ── Admin: coupon manager (used by admin panel) ────────────────────────────────

@rest_router(router.get, path="/coupons", proxy=payment_svc,
    summary="[Admin] List all coupon codes (admin panel)")
async def list_coupons_admin(request: Request, response: Response):
    pass

@rest_router(router.post, path="/coupons", proxy=payment_svc,
    summary="[Admin] Create a new coupon code (admin panel)")
async def create_coupon_admin(request: Request, response: Response, data: CouponCreateRequest):
    pass

@rest_router(router.patch, path="/coupons/{coupon_id}", proxy=payment_svc,
    summary="[Admin] Toggle coupon active state (admin panel)")
async def toggle_coupon_admin(request: Request, response: Response, coupon_id: str, data: CouponToggleRequest):
    pass

@rest_router(router.delete, path="/coupons/{coupon_id}", proxy=payment_svc,
    summary="[Admin] Delete a coupon (admin panel)")
async def delete_coupon_admin(request: Request, response: Response, coupon_id: str):
    pass


# ── Admin: plans (admin panel — full dynamic plan management) ─────────────────

@rest_router(router.get, path="/admin/plans", proxy=payment_svc,
    summary="[Admin] List all plans, including inactive")
async def list_plans_admin(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/plans", proxy=payment_svc,
    summary="[Admin] Create a new plan")
async def create_plan_admin(request: Request, response: Response, data: PlanCreateRequest):
    pass

@rest_router(router.patch, path="/admin/plans/{plan_id}", proxy=payment_svc,
    summary="[Admin] Update a plan")
async def update_plan_admin(request: Request, response: Response, plan_id: str, data: PlanUpdateRequest):
    pass

@rest_router(router.delete, path="/admin/plans/{plan_id}", proxy=payment_svc,
    summary="[Admin] Deactivate a plan")
async def delete_plan_admin(request: Request, response: Response, plan_id: str):
    pass


# ── Parent payments (parent pays for a linked student) ─────────────────────────

@rest_router(router.get, path="/parent/student-subscription", proxy=payment_svc,
    summary="[Parent] View a linked student's subscription status")
async def parent_student_subscription(request: Request, response: Response):
    pass

@rest_router(router.post, path="/parent/create-order", proxy=payment_svc,
    summary="[Parent] Create a Cashfree order on behalf of a linked student")
async def parent_create_order(request: Request, response: Response, data: ParentCreateOrderRequest):
    pass

@rest_router(router.post, path="/parent/verify", proxy=payment_svc,
    summary="[Parent] Verify a Cashfree order and activate the student's subscription")
async def parent_verify_payment(request: Request, response: Response, data: ParentVerifyPaymentRequest):
    pass
