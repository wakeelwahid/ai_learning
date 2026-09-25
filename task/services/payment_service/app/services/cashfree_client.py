"""Low-level Cashfree gateway primitives: environment/mode detection, base URL
resolution and the authenticated request headers.

Separated from cashfree_service.py (which holds the DB-orchestrating business
logic — coupon application, carry-over, receipts) because this module is the
only place that knows how to talk to Cashfree itself. Nothing here touches the
database. Behavior is byte-for-byte identical to the original inline
definitions — do not "clean up" the test-mode fallback or the header set.
"""
from app.core.config import settings

CASHFREE_BASE = {
    "sandbox":    "https://sandbox.cashfree.com/pg",
    "production": "https://api.cashfree.com/pg",
}


def is_test_mode() -> bool:
    """True only when no real Cashfree app id is configured — mirrors the old
    Razorpay integration's test_mode fallback so local/dev environments work
    end-to-end without real gateway credentials. Orders are mocked locally
    and /verify auto-succeeds for mock order ids."""
    app_id = settings.CASHFREE_APP_ID or ""
    return not app_id or app_id == "test"


def base_url() -> str:
    return CASHFREE_BASE.get(settings.CASHFREE_ENV, CASHFREE_BASE["sandbox"])


def build_headers() -> dict:
    """Authenticated Cashfree API headers — identical to the dict the
    CashfreeService constructor built inline."""
    return {
        "x-client-id": settings.CASHFREE_APP_ID,
        "x-client-secret": settings.CASHFREE_SECRET_KEY,
        "x-api-version": settings.CASHFREE_API_VERSION,
        "Content-Type": "application/json",
    }
