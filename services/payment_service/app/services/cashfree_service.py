"""Cashfree order/subscription business logic.

This module wraps the raw gateway primitives in app/services/cashfree_client.py
(mode detection, base URL, auth headers) with the DB-orchestrating flows:
order creation, verify-and-activate, receipt generation and retry.

MONEY-CRITICAL: the idempotency guards in verify_and_activate, the carry-over
arithmetic, and every amount/currency conversion are preserved exactly as they
were in the original single-file implementation. Do not reorder or "simplify".
"""
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.enums import PaymentStatus, SubscriptionStatus
from app.models.coupon import Coupon
from app.models.payment_record import Payment
from app.models.subscription import Subscription
from app.services.cashfree_client import CASHFREE_BASE, base_url, build_headers, is_test_mode
from app.services.coupon_pricing_service import CouponPricingMixin

__all__ = ["CashfreeService", "CASHFREE_BASE", "base_url", "is_test_mode"]


class CashfreeService(CouponPricingMixin):
    def __init__(self, db: AsyncSession):
        self.db = db
        self._headers = build_headers()

    # ── Order creation ─────────────────────────────────────────────────────────

    async def create_order(
        self,
        user_id: str,
        plan_key: str,
        coupon_code: str | None = None,
        customer_email: str | None = None,
        customer_phone: str | None = None,
    ) -> dict:
        # Idempotency guard: a double-click, browser refresh, or network retry
        # of "create order" for the same user+plan must not create a second
        # chargeable order while an earlier one is still open. Re-open the
        # existing CREATED/AUTHORIZED order instead of minting a new one.
        existing_result = await self.db.execute(
            select(Payment)
            .where(
                Payment.user_id == user_id,
                Payment.plan_key == plan_key,
                Payment.status.in_([PaymentStatus.CREATED, PaymentStatus.AUTHORIZED]),
            )
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
        existing_payment = existing_result.scalar_one_or_none()
        if existing_payment and existing_payment.cashfree_order_id:
            return await self._reopen_existing_order(existing_payment)

        return await self._create_order_row(
            user_id, plan_key, coupon_code, customer_email, customer_phone,
        )

    async def _reopen_existing_order(self, existing_payment: Payment) -> dict:
        return {
            "order_id": existing_payment.cashfree_order_id,
            "payment_session_id": (
                f"session_test_{uuid.uuid4().hex[:24]}"
                if is_test_mode()
                else await self._fetch_payment_session_id(existing_payment.cashfree_order_id)
            ),
            "amount": existing_payment.amount_paise,
            "currency": existing_payment.currency,
            "key": "test_mode" if is_test_mode() else settings.CASHFREE_ENV,
            "payment_id": str(existing_payment.id),
            "discount_amount": existing_payment.discount_amount_paise,
            "original_amount": existing_payment.amount_paise + existing_payment.discount_amount_paise,
        }

    async def _create_order_row(
        self,
        user_id: str,
        plan_key: str,
        coupon_code: str | None,
        customer_email: str | None,
        customer_phone: str | None,
    ) -> dict:
        plan = await self._get_active_plan(plan_key)
        original_amount = plan.price_paise
        discount_amount = 0
        applied_code: str | None = None

        if coupon_code:
            validation = await self.validate_coupon(coupon_code, plan_key)
            if validation["valid"]:
                coupon = await self._get_coupon(coupon_code)
                # Re-check-and-increment atomically: validate_coupon()'s read
                # above can race with a concurrent redemption of the same
                # limited-use coupon, so the actual reservation of a "use"
                # happens here, in one statement, immediately before it's
                # relied on — a losing concurrent request simply gets no
                # discount rather than both winning past the limit.
                if coupon and await self._reserve_coupon_use(coupon):
                    discount_amount = validation["discount_amount"]
                    applied_code = coupon_code.upper()

        charged_amount = original_amount - discount_amount
        order_id = f"order_{uuid.uuid4().hex[:20]}"

        if is_test_mode():
            payment = Payment(
                user_id=user_id,
                plan_key=plan_key,
                amount_paise=charged_amount,
                discount_amount_paise=discount_amount,
                coupon_code_used=applied_code,
                currency=plan.currency,
                gateway="cashfree",
                cashfree_order_id=order_id,
            )
            self.db.add(payment)
            try:
                await self.db.flush()
            except IntegrityError:
                # Lost the race: a concurrent request for the same
                # (user_id, plan_key) committed its own open order between
                # this method's earlier SELECT and this INSERT — the
                # partial unique index (uq_payments_user_plan_open) is what
                # actually caught it. Re-open THAT order instead of
                # surfacing a 500 for what is, from the user's perspective,
                # just a slightly-late duplicate tap.
                await self.db.rollback()
                return await self._reopen_existing_order(await self._get_open_order(user_id, plan_key))
            return {
                "order_id": order_id,
                "payment_session_id": f"session_test_{uuid.uuid4().hex[:24]}",
                "amount": charged_amount,
                "currency": plan.currency,
                "key": "test_mode",
                "payment_id": str(payment.id),
                "discount_amount": discount_amount,
                "original_amount": original_amount,
            }

        body = {
            "order_id": order_id,
            "order_amount": round(charged_amount / 100, 2),
            "order_currency": plan.currency,
            "customer_details": {
                "customer_id": str(user_id).replace("-", ""),
                "customer_email": customer_email or "student@edulearn.app",
                "customer_phone": customer_phone or "9999999999",
            },
            "order_meta": {
                "return_url": f"{settings.FRONTEND_URL}/payment-return?order_id={{order_id}}",
                "notify_url": f"{settings.APP_BASE_URL}/api/v1/payments/webhook",
            },
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(f"{base_url()}/orders", json=body, headers=self._headers)
            if resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Cashfree API error: {resp.text}")
            cf_order = resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Cashfree API error: {exc}") from exc

        payment = Payment(
            user_id=user_id,
            plan_key=plan_key,
            amount_paise=charged_amount,
            discount_amount_paise=discount_amount,
            coupon_code_used=applied_code,
            currency=plan.currency,
            gateway="cashfree",
            cashfree_order_id=order_id,
            cashfree_cf_order_id=str(cf_order.get("cf_order_id") or ""),
        )
        self.db.add(payment)
        try:
            await self.db.flush()
        except IntegrityError:
            # Same race as the test-mode branch above, but here a real
            # Cashfree order was already created before this INSERT — it's
            # simply left unused/orphaned at Cashfree (no Payment row ever
            # references it, so it can never be verified/activated). Not
            # ideal, but harmless: re-opening the winning request's order
            # below is what the user actually sees.
            await self.db.rollback()
            return await self._reopen_existing_order(await self._get_open_order(user_id, plan_key))

        return {
            "order_id": order_id,
            "payment_session_id": cf_order["payment_session_id"],
            "amount": charged_amount,
            "currency": plan.currency,
            "key": settings.CASHFREE_ENV,
            "payment_id": str(payment.id),
            "discount_amount": discount_amount,
            "original_amount": original_amount,
        }

    async def _get_open_order(self, user_id: str, plan_key: str) -> Payment:
        result = await self.db.execute(
            select(Payment)
            .where(
                Payment.user_id == user_id,
                Payment.plan_key == plan_key,
                Payment.status.in_([PaymentStatus.CREATED, PaymentStatus.AUTHORIZED]),
            )
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            # Should be unreachable — an IntegrityError on this exact
            # constraint means a conflicting open row exists by definition.
            # Surfaced as a clear 500 rather than silently returning None
            # into _reopen_existing_order, which would crash less legibly.
            raise HTTPException(status_code=500, detail="Order conflict could not be resolved — please retry.")
        return payment

    # ── Order status (server-to-server, authoritative) ──────────────────────────

    async def _fetch_payment_session_id(self, order_id: str) -> str:
        """Re-fetch the checkout session for an order created moments ago by
        an earlier (still-open) request — used by the create_order idempotency
        guard so re-opening an existing order doesn't require minting a new
        Cashfree order."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{base_url()}/orders/{order_id}", headers=self._headers)
            if resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Cashfree API error: {resp.text}")
            return resp.json().get("payment_session_id", "")
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Cashfree API error: {exc}") from exc

    async def _fetch_order_status(self, order_id: str) -> str:
        """Query Cashfree directly for an order's true status — this (not any
        client-supplied data) is the source of truth for whether a payment
        succeeded, since Cashfree's checkout flow has no client-side signature
        the way Razorpay's did."""
        # The "order_test_" prefix check that used to sit here also fired
        # OUTSIDE test mode, so any Payment row whose cashfree_order_id began
        # with that prefix would auto-report PAID against a live gateway with
        # no Cashfree call at all. No current code path mints such an id
        # (real ids are f"order_{uuid4}") so this was not reachable, but it is
        # an auto-succeed primitive one seeded/imported row away from being
        # real money. Test mode alone is the gate.
        if is_test_mode():
            return "PAID"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{base_url()}/orders/{order_id}", headers=self._headers)
            if resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Cashfree API error: {resp.text}")
            return resp.json().get("order_status", "")
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Cashfree API error: {exc}") from exc

    # ── Verify & activate ──────────────────────────────────────────────────────

    async def verify_and_activate(
        self,
        order_id: str,
        user_id: uuid.UUID,
        plan_key: str,
        coupon_code: str | None = None,
    ) -> tuple["Subscription", int]:   # (subscription, carry_over_days)
        result = await self.db.execute(
            select(Payment).where(Payment.cashfree_order_id == order_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            raise HTTPException(status_code=404, detail="Payment record not found")

        # Ownership guard: an order_id is guessable/enumerable (it's returned
        # to the client and passed back on /verify), so the route's own check
        # (body.user_id == current_user_id) is NOT sufficient on its own — it
        # only proves the caller is who they claim to be, not that the order
        # belongs to them. Without this, a caller could pass someone else's
        # order_id together with their OWN user_id and have this method
        # activate a subscription for themselves off another user's payment,
        # while corrupting that payment's subscription_id linkage. Must be
        # checked before the CAPTURED short-circuit and before FAILED, since
        # both of those branches would otherwise still act on a payment that
        # isn't the caller's.
        if payment.user_id != user_id:
            raise HTTPException(status_code=404, detail="Payment record not found")

        # Idempotency guard: a client-side double-submit/retry of /verify for a
        # payment that's already been captured must NOT re-run the cancel+carry
        # -over+create logic below — the subscription it would find as "existing
        # active" is the one THIS SAME payment already created moments ago,
        # which would nearly double its duration via bogus carry-over. Just
        # return the current active subscription unchanged.
        if payment.status == PaymentStatus.CAPTURED:
            existing = await self.db.execute(
                select(Subscription)
                .where(
                    Subscription.user_id == user_id,
                    Subscription.status == SubscriptionStatus.ACTIVE,
                    Subscription.expires_at > datetime.now(timezone.utc),
                )
                .order_by(Subscription.expires_at.desc())
                .limit(1)
            )
            active_sub = existing.scalar_one_or_none()
            if active_sub:
                return active_sub, 0

        # A payment the gateway has already reported as FAILED (e.g. via a
        # legitimate webhook) must never be resurrected by /verify. A real
        # Cashfree order that failed would still report a non-PAID
        # order_status on re-query, so treat this as a hard terminal state
        # rather than falling through to _fetch_order_status() (which in
        # test mode unconditionally reports "PAID" regardless of the
        # payment's actual recorded status).
        if payment.status == PaymentStatus.FAILED:
            raise HTTPException(status_code=400, detail="Payment failed")

        order_status = await self._fetch_order_status(order_id)
        if order_status != "PAID":
            raise HTTPException(status_code=400, detail=f"Payment not completed (status: {order_status or 'unknown'})")

        # The plan actually charged for at /orders time is authoritative —
        # a client-supplied `plan_key` on /verify that disagrees is ignored
        # for duration/activation purposes (still accepted for backward compat).
        effective_plan_key = payment.plan_key or plan_key
        plan = await self._get_active_plan(effective_plan_key)

        update_values: dict = {
            "cashfree_payment_id": f"cf_pay_{uuid.uuid4().hex[:16]}" if is_test_mode() else payment.cashfree_payment_id,
            "status": PaymentStatus.CAPTURED,
        }
        if coupon_code and not payment.coupon_code_used:
            update_values["coupon_code_used"] = coupon_code.upper()

        await self.db.execute(
            update(Payment).where(Payment.id == payment.id).values(**update_values)
        )

        now = datetime.now(timezone.utc)

        # ── Carry-over: find remaining time on the current active plan ────────
        existing_result = await self.db.execute(
            select(Subscription)
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.expires_at > now,
            )
            .order_by(Subscription.expires_at.desc())
            .limit(1)
        )
        existing_sub = existing_result.scalar_one_or_none()

        carry_over_seconds = 0
        if existing_sub and existing_sub.expires_at:
            old_expires = existing_sub.expires_at
            if old_expires.tzinfo is None:
                old_expires = old_expires.replace(tzinfo=timezone.utc)
            remaining = old_expires - now
            carry_over_seconds = max(0, int(remaining.total_seconds()))

        # Cancel any existing active subscriptions so only one is ever ACTIVE.
        await self.db.execute(
            update(Subscription)
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
            .values(status=SubscriptionStatus.CANCELLED, deactivated_at=now)
        )

        plan_seconds = plan.duration_days * 86400
        new_expires = now + timedelta(seconds=plan_seconds + carry_over_seconds)
        carry_over_days = carry_over_seconds // 86400

        subscription = Subscription(
            user_id=user_id,
            plan=effective_plan_key,
            status=SubscriptionStatus.ACTIVE,
            starts_at=now,
            expires_at=new_expires,
        )
        self.db.add(subscription)
        await self.db.flush()

        await self.db.execute(
            update(Payment).where(Payment.id == payment.id).values(subscription_id=subscription.id)
        )
        await self.db.refresh(subscription)
        return subscription, carry_over_days

    # ── Receipt generation ─────────────────────────────────────────────────────

    async def generate_receipt(
        self,
        payment_id: uuid.UUID,
        current_user_id: uuid.UUID,
        role: str = "",
    ) -> dict:
        result = await self.db.execute(
            select(Payment).where(Payment.id == payment_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")

        if payment.user_id != current_user_id and role not in ("admin", "super_admin"):
            raise HTTPException(
                status_code=403,
                detail="Access denied: you can only view your own receipts.",
            )

        plan_label: str | None = None
        if payment.subscription_id:
            sub_result = await self.db.execute(
                select(Subscription).where(Subscription.id == payment.subscription_id)
            )
            sub = sub_result.scalar_one_or_none()
            if sub:
                plan_label = sub.plan
        elif payment.plan_key:
            plan_label = payment.plan_key

        receipt_number = f"RCP-{str(payment.id).upper()[:8]}-{payment.created_at.strftime('%Y%m%d')}"

        return {
            "receipt_number": receipt_number,
            "payment_id": payment.id,
            "cashfree_payment_id": payment.cashfree_payment_id,
            "cashfree_order_id": payment.cashfree_order_id,
            "user_id": payment.user_id,
            "plan": plan_label,
            "amount_paise": payment.amount_paise,
            "discount_amount_paise": payment.discount_amount_paise,
            "coupon_code_used": payment.coupon_code_used,
            "currency": payment.currency,
            "status": payment.status.value,
            "paid_at": payment.updated_at,
        }

    # ── Refund ──────────────────────────────────────────────────────────────────

    async def refund_payment(
        self, payment_id: uuid.UUID, reason: str | None = None
    ) -> dict:
        """Admin-triggered refund: call Cashfree's refund API for a captured
        payment, mark it REFUNDED, and cancel the subscription it granted so
        access is actually revoked (not just a status label with no effect).
        """
        result = await self.db.execute(select(Payment).where(Payment.id == payment_id))
        payment = result.scalar_one_or_none()
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        if payment.status != PaymentStatus.CAPTURED:
            raise HTTPException(
                status_code=400,
                detail=f"Only a captured payment can be refunded (current status: {payment.status.value})",
            )

        refund_id = f"refund_{uuid.uuid4().hex[:20]}"
        if not is_test_mode():
            body = {
                "refund_amount": round(payment.amount_paise / 100, 2),
                "refund_id": refund_id,
                "refund_note": reason or "Admin-initiated refund",
            }
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"{base_url()}/orders/{payment.cashfree_order_id}/refunds",
                        json=body,
                        headers=self._headers,
                    )
                if resp.status_code >= 400:
                    raise HTTPException(status_code=502, detail=f"Cashfree refund API error: {resp.text}")
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail=f"Cashfree refund API error: {exc}") from exc

        await self.db.execute(
            update(Payment)
            .where(Payment.id == payment.id)
            .values(status=PaymentStatus.REFUNDED)
        )

        if payment.subscription_id:
            now = datetime.now(timezone.utc)
            await self.db.execute(
                update(Subscription)
                .where(
                    Subscription.id == payment.subscription_id,
                    Subscription.status == SubscriptionStatus.ACTIVE,
                )
                .values(status=SubscriptionStatus.CANCELLED, deactivated_at=now)
            )

        await self.db.flush()
        return {
            "payment_id": str(payment.id),
            "refund_id": refund_id,
            "status": "refunded",
            "subscription_cancelled": payment.subscription_id is not None,
        }

    # ── Retry failed payment ───────────────────────────────────────────────────

    async def retry_payment(
        self, payment_id: uuid.UUID, user_id: uuid.UUID
    ) -> dict:
        result = await self.db.execute(
            select(Payment).where(
                Payment.id == payment_id,
                Payment.user_id == user_id,
            )
        )
        payment = result.scalar_one_or_none()
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")

        if payment.status == PaymentStatus.CAPTURED:
            raise HTTPException(status_code=400, detail="Payment already captured")

        new_order_id = f"order_{uuid.uuid4().hex[:20]}"

        if is_test_mode():
            payment_session_id = f"session_test_{uuid.uuid4().hex[:24]}"
        else:
            plan = await self._get_active_plan(payment.plan_key) if payment.plan_key else None
            currency = plan.currency if plan else payment.currency
            body = {
                "order_id": new_order_id,
                "order_amount": round(payment.amount_paise / 100, 2),
                "order_currency": currency,
                "customer_details": {
                    "customer_id": str(user_id).replace("-", ""),
                    "customer_email": "student@edulearn.app",
                    "customer_phone": "9999999999",
                },
                "order_meta": {
                    "return_url": f"{settings.FRONTEND_URL}/payment-return?order_id={{order_id}}",
                    "notify_url": f"{settings.APP_BASE_URL}/api/v1/payments/webhook",
                },
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(f"{base_url()}/orders", json=body, headers=self._headers)
            if resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Cashfree API error: {resp.text}")
            payment_session_id = resp.json()["payment_session_id"]

        await self.db.execute(
            update(Payment)
            .where(Payment.id == payment.id)
            .values(
                cashfree_order_id=new_order_id,
                cashfree_payment_id=None,
                status=PaymentStatus.CREATED,
                error_description=None,
            )
        )
        await self.db.flush()

        return {
            "order_id": new_order_id,
            "payment_session_id": payment_session_id,
            "amount": payment.amount_paise,
            "currency": payment.currency,
            "key": "test_mode" if is_test_mode() else settings.CASHFREE_ENV,
            "payment_id": str(payment.id),
            "discount_amount": payment.discount_amount_paise,
            "original_amount": payment.amount_paise + payment.discount_amount_paise,
        }
