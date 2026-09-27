"""Cashfree webhook receiver.

SECURITY-CRITICAL: this endpoint has NO end-user authentication — it is
authenticated solely by the HMAC-SHA256 signature check below. The
verification block, the fail-closed behavior when the secret is unset, and the
idempotency guard around PAYMENT_SUCCESS_WEBHOOK are reproduced EXACTLY as
they were in the original single routes file. Do not reorder, refactor or
"clean up" anything in this module.
"""
import base64
import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import webhook_crud
from app.database.session import get_db
from app.services.cashfree_client import is_test_mode

router = APIRouter(prefix="/payments", tags=["payments"])


# ── Webhook ────────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def cashfree_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Cashfree webhook receiver — https://docs.cashfree.com/docs/webhooks

    Verifies the HMAC-SHA256 signature (base64 of timestamp+rawBody signed
    with CASHFREE_WEBHOOK_SECRET), then processes:
      - PAYMENT_SUCCESS_WEBHOOK → mark Payment CAPTURED, activate Subscription
        (only if /verify hasn't already done so — this is a durable backstop
        for cases where the client never calls /verify, e.g. app killed mid-flow)
      - PAYMENT_FAILED_WEBHOOK  → mark Payment FAILED, record error description
    """
    raw_body = await request.body()

    # ── Signature verification ──────────────────────────────────────────────
    # Fail CLOSED: an unconfigured secret must never be treated as "skip
    # verification" — that would let anyone POST forged payment events.
    # (Skipped only in test_mode, where there is no real Cashfree account to
    # configure a webhook secret for in the first place.)
    if not is_test_mode():
        webhook_secret = settings.CASHFREE_WEBHOOK_SECRET
        if not webhook_secret:
            raise HTTPException(status_code=503, detail="Webhook signature verification is not configured")
        timestamp = request.headers.get("x-webhook-timestamp", "")
        received_sig = request.headers.get("x-webhook-signature", "")
        expected_sig = base64.b64encode(
            hmac.new(webhook_secret.encode(), (timestamp + raw_body.decode()).encode(), hashlib.sha256).digest()
        ).decode()
        if not hmac.compare_digest(expected_sig, received_sig):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        body = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = body.get("type", "")
    data = body.get("data", {})
    order = data.get("order", {})
    cf_payment = data.get("payment", {})
    order_id = order.get("order_id")

    if not order_id:
        return {"status": "received", "type": event_type}

    payment = await webhook_crud.get_payment_by_order_id(db, order_id)
    if not payment:
        return {"status": "received", "type": event_type}

    if event_type == "PAYMENT_SUCCESS_WEBHOOK":
        # Idempotency guard: atomically claim this payment for processing
        # (UPDATE...WHERE status != CAPTURED). Two concurrent deliveries of
        # the same event can no longer both pass a plain read-then-write
        # check — only the one whose claim actually matched a row proceeds.
        if await webhook_crud.claim_payment_for_success_webhook(db, payment.id):
            await webhook_crud.process_payment_success_webhook(db, payment, cf_payment)

    elif event_type == "PAYMENT_FAILED_WEBHOOK":
        error_desc = cf_payment.get("payment_message") or "Payment failed"
        await webhook_crud.process_payment_failed_webhook(db, payment, error_desc)

    return {"status": "received", "type": event_type}
