"""Consistent error handling for auth_service.

Registers handlers that give this service's error responses a predictable
shape for validation failures (422) and unhandled exceptions (500).

This module is intentionally self-contained (no imports from outside this
service) — every backend service in this platform owns an identical copy so
each remains independently deployable with no shared code repository.

Response shapes:
    422 (validation failure):
        {"detail": "...", "error_code": "VALIDATION_ERROR", "errors": [...]}
    Any other unhandled exception:
        {"detail": "An unexpected error occurred. Please try again.", "error_code": "INTERNAL_ERROR"}
        (logged server-side with a full traceback; never echoed to the client)

Plain `HTTPException` (and this service's own app/core/exceptions.py classes,
which subclass it) are left to FastAPI's default handler, which already
returns a clean `{"detail": ...}` shape.
"""
import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

FIELD_LABELS = {
    "email": "Email address",
    "phone": "Phone number",
    "password": "Password",
    "full_name": "Full name",
    "user_id": "User ID",
    "role": "Role",
    "otp": "OTP code",
    "token": "Token",
    "new_password": "New password",
    "refresh_token": "Refresh token",
}

PYDANTIC_MSG_CLEANUP = {
    "value is not a valid email address": "Please enter a valid email address.",
    "field required": "This field is required.",
    "Field required": "This field is required.",
    "value is not a valid uuid": "Must be a valid ID.",
    "Input should be a valid UUID": "Must be a valid ID.",
}


def humanize_error(loc: tuple, msg: str, field_labels: dict) -> tuple[str, str]:
    field = str(loc[-1]) if loc else "input"
    label = field_labels.get(field, field.replace("_", " ").capitalize())
    clean_msg = PYDANTIC_MSG_CLEANUP.get(msg, msg)
    clean_msg = clean_msg.replace("Value error, ", "").replace("String should ", "Should ")
    clean_msg = clean_msg.rstrip(".")
    return field, f"{label}: {clean_msg}."


def register_error_handlers(app: FastAPI, *, extra_field_labels: dict | None = None) -> None:
    field_labels = {**FIELD_LABELS, **(extra_field_labels or {})}

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        structured = []
        messages = []
        for e in errors:
            field, message = humanize_error(e.get("loc", ()), e.get("msg", "Invalid value"), field_labels)
            structured.append({"field": field, "message": message, "type": e.get("type", "invalid")})
            messages.append(message)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": " | ".join(messages) if messages else "Invalid request.",
                "error_code": "VALIDATION_ERROR",
                "errors": structured,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "An unexpected error occurred. Please try again.",
                "error_code": "INTERNAL_ERROR",
            },
        )
