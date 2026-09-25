"""Shared route helpers for payment_service.

`verify_parent_link` and `require_internal` are used by more than one of the
split route modules, so they live here rather than being duplicated. Both are
security guards — preserved verbatim from the original single routes file,
including their fail-closed semantics.
"""
import hmac
import uuid

import httpx
from fastapi import HTTPException, Request

from app.core.config import settings

# Phase 11: Restricted to Docker-internal network IPs only.
# The gateway and other microservices call this on edtech_net (172.x.x.x).
# Requests from external IPs (not RFC-1918) are rejected with 404.
INTERNAL_NETS = ("127.", "10.", "172.", "192.168.")


def require_internal(request: Request) -> None:
    """Allow only requests originating from Docker-internal or loopback
    addresses AND presenting the shared X-Internal-Secret header. The IP
    check alone is not a real trust boundary (any container on the Docker
    network can spoof it), so it's kept only as defense-in-depth alongside
    the secret check below, which fails closed if INTERNAL_SERVICE_SECRET
    is unset."""
    client_ip = request.client.host if request.client else ""
    if not any(client_ip.startswith(prefix) for prefix in INTERNAL_NETS):
        # Return 404 rather than 403 to avoid leaking that the endpoint exists
        raise HTTPException(status_code=404, detail="Not found")
    provided = request.headers.get("x-internal-secret", "")
    expected = settings.INTERNAL_SERVICE_SECRET
    if not expected or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=404, detail="Not found")


async def verify_parent_link(parent_id: uuid.UUID, child_id: uuid.UUID) -> None:
    """Call user_service's internal parent-link-check endpoint and raise 403
    unless the link is confirmed. This service owns no parent/child data of
    its own, so relationship checks must go over the network.

    Fails CLOSED: any non-200 response, malformed body, timeout, or network
    error is treated as "not linked" (403) rather than silently allowing
    the request through.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parent-link-check",
                params={"parent_id": str(parent_id), "child_id": str(child_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        linked = resp.status_code == 200 and resp.json().get("linked") is True
    except Exception:
        linked = False

    if not linked:
        raise HTTPException(
            status_code=403,
            detail="Access denied: no parent-child link found between the given users.",
        )


PARENT_APPROVAL_REQUIRED_DETAIL = (
    "Parent approval required before purchasing. "
    "Ask your parent to approve this plan from their dashboard."
)
PARENT_APPROVAL_UNAVAILABLE_DETAIL = "Could not verify parent approval right now. Please try again."


async def require_purchase_approval(student_id: uuid.UUID, reference: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/purchase-approval",
                params={"student_id": str(student_id), "reference": reference},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=403, detail=PARENT_APPROVAL_UNAVAILABLE_DETAIL)
        data = resp.json()
        required = data.get("required") is True
        approved = data.get("approved") is True
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail=PARENT_APPROVAL_UNAVAILABLE_DETAIL)

    if required and not approved:
        raise HTTPException(
            status_code=403,
            detail=PARENT_APPROVAL_REQUIRED_DETAIL,
            headers={"X-Error-Code": "PARENT_APPROVAL_REQUIRED"},
        )


async def consume_purchase_approval(student_id: uuid.UUID, reference: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/purchase-approval/consume",
                json={"student_id": str(student_id), "reference": reference},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass
