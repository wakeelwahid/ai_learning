"""CORS configuration for the API gateway.

Environment-aware origin allowlist, selected by the `ENV` env var:
    ENV=production   -> ONLY origins from CORS_ORIGINS_PRODUCTION (a JSON
                         array of real HTTPS domains you must set explicitly).
                         Empty/unset means NO origins are allowed — this
                         fails closed, never falls back to a wildcard or to
                         dev/localhost origins.
    ENV=development   -> the fixed localhost allowlist below, PLUS any extra
                         origins from CORS_ORIGINS_DEVELOPMENT (for a shared
                         staging deployment reachable by a real domain).
    anything else / unset -> the fixed localhost allowlist only ("Localhost").

No cookie-based credentials are used anywhere in this platform (auth is
entirely Bearer-token via the Authorization header, which CORS `credentials`
mode does not gate), so `allow_credentials` defaults to False.

This module is intentionally self-contained (no imports from outside this
service) — every service in this platform owns an identical copy so each
remains independently deployable with no shared code repository.
"""
import json
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

LOCALHOST_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://localhost:8081",  # Expo web / dev-tools
    # Vite's own dev server (frontend/admin `npm run dev`, ports 5173+ — Vite
    # auto-increments if one is taken, so a small contiguous range is covered).
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]

ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_HEADERS = ["Authorization", "Content-Type", "Accept", "X-Requested-With"]
EXPOSE_HEADERS = ["X-Request-ID"]


def _parse_origin_list(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    raw = raw.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(o) for o in parsed]
    except (json.JSONDecodeError, TypeError):
        pass
    return [o.strip() for o in raw.split(",") if o.strip()]


def get_cors_origins() -> list[str]:
    """Return the environment-appropriate CORS origin allowlist. Never '*'."""
    env = os.getenv("ENV", "development").strip().lower()

    if env == "production":
        return _parse_origin_list(os.getenv("CORS_ORIGINS_PRODUCTION"))

    if env in ("development", "staging", "dev"):
        origins = list(LOCALHOST_ORIGINS)
        origins += _parse_origin_list(os.getenv("CORS_ORIGINS_DEVELOPMENT"))
        return list(dict.fromkeys(origins))

    return list(LOCALHOST_ORIGINS)


def add_cors(app: FastAPI, *, allow_credentials: bool = False) -> None:
    """Attach a consistently-configured CORSMiddleware to `app`. Must be
    added first so preflight OPTIONS short-circuits before other middleware."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_origins(),
        allow_credentials=allow_credentials,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
        expose_headers=EXPOSE_HEADERS,
    )
