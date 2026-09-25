"""
Declarative route registration for gateway passthrough endpoints.

`rest_router` decorates a stub function whose body is never executed — the
stub only supplies the signature (path/query params, request body schema)
that FastAPI uses to build accurate OpenAPI docs. The actual work is
forwarding the request verbatim to the owning microservice via the existing
`ServiceProxy` (circuit breaker, pooling, retries all still apply).
"""
import inspect
from typing import Any, Callable, Optional

from fastapi import Request, Response

from app.proxy import ServiceProxy


def rest_router(
    method: Callable,
    path: str,
    proxy: ServiceProxy,
    response_model: Optional[type] = None,
    status_code: int = 200,
    forward_path: Optional[Callable[[str], str]] = None,
    **route_kwargs: Any,
):
    """`forward_path`, if given, rewrites the incoming request path before
    forwarding upstream (e.g. a flat gateway path that maps to a nested
    path on the owning service)."""

    def decorator(func: Callable):
        async def endpoint(request: Request, response: Response, **_: Any) -> Response:
            # `**_` absorbs whatever FastAPI resolves for the stub's other
            # declared params (body/path/query) — they exist only so
            # inspect.signature(func) below produces accurate OpenAPI docs
            # and validation; the actual values are never used here because
            # the raw request is forwarded verbatim to the owning service.
            target_path = forward_path(request.url.path) if forward_path else request.url.path
            return await proxy.forward(request, target_path)

        endpoint.__signature__ = inspect.signature(func)
        method(path, response_model=response_model, status_code=status_code, **route_kwargs)(endpoint)
        return func

    return decorator
