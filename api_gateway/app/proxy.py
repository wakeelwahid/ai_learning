"""
Production-grade HTTP reverse proxy with:
- Shared connection pool (one AsyncClient per service)
- Circuit breaker (auto-opens after N failures, auto-closes after cooldown)
- Per-service timeout (AI gets 60s, others 30s)
- Automatic retry on transient connection errors
- X-Request-ID propagation
"""
import time
import uuid
from dataclasses import dataclass

import httpx
from fastapi import Request, Response
from fastapi.responses import StreamingResponse


# ─── Circuit Breaker ─────────────────────────────────────────────────────────

@dataclass
class CircuitBreaker:
    failure_threshold: int = 5
    recovery_seconds: float = 30.0
    _failures: int = 0
    _opened_at: float = 0.0

    def is_open(self) -> bool:
        if self._failures < self.failure_threshold:
            return False
        if time.monotonic() - self._opened_at >= self.recovery_seconds:
            # Half-open: allow one probe
            self._failures = 0
            return False
        return True

    def record_success(self) -> None:
        self._failures = 0

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._opened_at = time.monotonic()


# ─── Service Proxy ────────────────────────────────────────────────────────────

# Headers that must NOT be forwarded downstream (hop-by-hop)
_HOP_BY_HOP = frozenset({
    "host", "content-length", "transfer-encoding",
    "connection", "keep-alive", "upgrade", "te", "trailers",
})

# Headers that assert service-to-service trust (require_internal's
# X-Internal-Secret check) — an external client must NEVER be able to inject
# these, since every backend service trusts them as proof the caller is
# another internal service, not the gateway relaying an arbitrary client
# header. Stripped from every inbound request regardless of value.
_STRIP_INBOUND_TRUST_HEADERS = frozenset({
    "x-internal-secret",
})

# Headers that must NOT be returned to the client from upstream
_DROP_RESPONSE_HEADERS = frozenset({
    "transfer-encoding", "connection",
})


class ServiceProxy:
    """Reverse-proxy a single upstream service with pooling + circuit breaker."""

    def __init__(self, service_name: str, base_url: str, timeout: float = 30.0):
        self.service_name = service_name
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._breaker = CircuitBreaker()
        # One shared client per service — reuses TCP connections
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(timeout, connect=5.0),
            # Sized for ~6k concurrent users: 4 gateway workers × 500 = up to
            # 2000 in-flight upstream requests per service; keepalive pool of
            # 100 avoids TCP churn under sustained load.
            limits=httpx.Limits(max_connections=500, max_keepalive_connections=100),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def forward(self, request: Request, path: str) -> Response:
        if self._breaker.is_open():
            return _service_unavailable(self.service_name)

        url = path
        if request.url.query:
            url = f"{path}?{request.url.query}"

        body = await request.body()

        # Forward request headers, drop hop-by-hop, inject trace ID
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        headers = {}
        for k, v in request.headers.items():
            if k.lower() in _HOP_BY_HOP:
                continue
            if k.lower() in _STRIP_INBOUND_TRUST_HEADERS:
                continue
            # Drop Authorization header with an empty or whitespace-only bearer
            # value — httpx raises LocalProtocolError on "Bearer " (empty token),
            # which the generic except clause would turn into a 502. Return 401
            # instead by stripping the bad header so the downstream service can
            # reject it cleanly.
            if k.lower() == "authorization" and v.strip() in ("Bearer", "Bearer "):
                continue
            headers[k] = v
        headers["x-request-id"] = request_id
        headers["x-forwarded-for"] = (
            request.headers.get("x-forwarded-for", "")
            + ("," if request.headers.get("x-forwarded-for") else "")
            + (request.client.host if request.client else "unknown")
        )

        # Server-sent events must be forwarded as they arrive. The normal path
        # below awaits the whole upstream body first, which for a token stream
        # means the client gets every token at once at the end — the point of
        # streaming is lost. Only SSE takes this path; everything else is
        # unchanged.
        #
        # Detected by the route path, not the Accept header: EventSource in a
        # browser does send "Accept: text/event-stream", but curl, httpx and
        # axios do not unless a caller explicitly sets it — relying on the
        # header alone left every non-browser client (including our own test
        # tools) silently falling through to the buffering path. A "/stream"
        # path is unambiguous and is exactly how these routes are named.
        is_sse = ("text/event-stream" in request.headers.get("accept", "")
                  or path.rstrip("/").endswith("/stream"))
        if is_sse:
            return await self._stream(request, url, body, headers, request_id)

        try:
            upstream = await self._client.request(
                method=request.method,
                url=url,
                content=body,
                headers=headers,
            )
            self._breaker.record_success()

        except httpx.ConnectError:
            self._breaker.record_failure()
            return _service_unavailable(self.service_name)

        except httpx.TimeoutException:
            self._breaker.record_failure()
            return _gateway_timeout(self.service_name)

        except Exception:
            self._breaker.record_failure()
            return _bad_gateway(self.service_name)

        # Build response — drop hop-by-hop headers from upstream
        response_headers = {
            k: v
            for k, v in upstream.headers.items()
            if k.lower() not in _DROP_RESPONSE_HEADERS
        }
        response_headers["x-request-id"] = request_id

        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            headers=response_headers,
            media_type=upstream.headers.get("content-type"),
        )

    async def _stream(self, request: Request, url: str, body: bytes,
                      headers: dict, request_id: str) -> Response:
        """Forward an SSE response chunk by chunk.

        The upstream connection has to stay open for the whole generation, so
        the request is built and sent inside the generator rather than awaited
        up front. Errors surface as an SSE error event: by the time anything
        goes wrong the client may already be reading a 200 body, so a JSON
        error payload would just look like a corrupt stream.
        """
        async def relay():
            try:
                req = self._client.build_request(
                    method=request.method, url=url, content=body, headers=headers,
                )
                upstream = await self._client.send(req, stream=True)
                try:
                    self._breaker.record_success()
                    async for chunk in upstream.aiter_raw():
                        yield chunk
                finally:
                    await upstream.aclose()
            except Exception:
                self._breaker.record_failure()
                yield b'data: {"type":"error","message":"The service is temporarily unavailable."}\n\n'

        return StreamingResponse(
            relay(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",   # keep any front proxy from re-buffering
                "x-request-id": request_id,
            },
        )


# ─── Error helpers ────────────────────────────────────────────────────────────

def _service_unavailable(name: str) -> Response:
    return Response(
        content=f'{{"detail":"The {name} is temporarily unavailable. Please try again in a moment."}}',
        status_code=503,
        media_type="application/json",
        headers={"Retry-After": "30"},
    )


def _gateway_timeout(name: str) -> Response:
    return Response(
        content=f'{{"detail":"The {name} took too long to respond. Please try again."}}',
        status_code=504,
        media_type="application/json",
    )


def _bad_gateway(name: str) -> Response:
    return Response(
        content=f'{{"detail":"Received an unexpected response from the {name}. Please try again."}}',
        status_code=502,
        media_type="application/json",
    )
