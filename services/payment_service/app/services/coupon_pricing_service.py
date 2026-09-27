"""Coupon lookup, discount math and public coupon validation.

Extracted verbatim from CashfreeService — the discount computation and the
validation-response shapes are money-critical and must not be altered. Kept as
a mixin so `CashfreeService` retains exactly the same method set and `self`
semantics it had as a single class (no call-site or behavioral change).
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select, update

from app.models.coupon import Coupon
from app.models.plan import Plan


class CouponPricingMixin:
    # ── Plan lookup ──────────────────────────────────────────────────────────

    async def _get_active_plan(self, plan_key: str) -> Plan:
        result = await self.db.execute(
            select(Plan).where(Plan.plan_key == plan_key, Plan.is_active == True)  # noqa: E712
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail=f"Unknown or inactive plan '{plan_key}'")
        return plan

    # ── Coupon helpers ─────────────────────────────────────────────────────────

    async def _get_coupon(self, code: str) -> Coupon | None:
        result = await self.db.execute(
            select(Coupon).where(Coupon.code == code.upper(), Coupon.is_active == True)  # noqa: E712
        )
        return result.scalar_one_or_none()

    def _compute_discount(self, coupon: Coupon, original_amount: int) -> int:
        """Return discount in paise (never exceeds original_amount)."""
        if coupon.discount_type == "percent":
            discount = int(original_amount * coupon.discount_value / 100)
        else:
            discount = coupon.discount_value
        return min(discount, original_amount)

    async def validate_coupon(self, code: str, plan_key: str) -> dict:
        """Public coupon-validation endpoint handler."""
        plan = await self._get_active_plan(plan_key)
        original = plan.price_paise
        coupon = await self._get_coupon(code)

        if not coupon:
            return {"valid": False, "discount_amount": 0, "final_price": original,
                    "original_price": original, "message": "Coupon not found or inactive"}

        now = datetime.now(timezone.utc)
        if coupon.expires_at and coupon.expires_at < now:
            return {"valid": False, "discount_amount": 0, "final_price": original,
                    "original_price": original, "message": "Coupon has expired"}

        if coupon.max_uses > 0 and coupon.used_count >= coupon.max_uses:
            return {"valid": False, "discount_amount": 0, "final_price": original,
                    "original_price": original, "message": "Coupon usage limit reached"}

        if coupon.applicable_plans and plan_key not in coupon.applicable_plans:
            return {"valid": False, "discount_amount": 0, "final_price": original,
                    "original_price": original,
                    "message": f"Coupon not valid for '{plan_key}' plan"}

        discount = self._compute_discount(coupon, original)
        final = original - discount
        return {
            "valid": True,
            "discount_amount": discount,
            "final_price": final,
            "original_price": original,
            "message": "Coupon applied successfully",
        }

    async def _reserve_coupon_use(self, coupon: Coupon) -> bool:
        """Atomically increment used_count iff it is still under max_uses (or
        unlimited, max_uses <= 0) — the increment and the limit check happen
        in one statement, closing the check-then-act race that a plain
        `SELECT` followed by `used_count = used_count + 1` leaves open under
        concurrent redemption. Returns True iff this call actually reserved a
        use; False means the limit was already reached by a concurrent
        request and the caller must NOT apply the discount."""
        stmt = (
            update(Coupon)
            .where(Coupon.id == coupon.id)
            .where((Coupon.max_uses <= 0) | (Coupon.used_count < Coupon.max_uses))
            .values(used_count=Coupon.used_count + 1)
        )
        result = await self.db.execute(stmt)
        return result.rowcount > 0
