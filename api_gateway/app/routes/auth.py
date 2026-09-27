from fastapi import APIRouter, Request, Response, status

from app.core.rest_router import rest_router
from app.services import auth_svc
from app.schemas import (
    LoginRequest, TokenResponse, RefreshRequest,
    UserResponse, ForgotPasswordRequest, ResetPasswordRequest,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


# ── Public endpoints (no auth required) ──────────────────────────────────────

# Email/password registration and email-OTP verification (/register,
# /verify-otp, /resend-otp, /verify-email) have been removed entirely, at
# both the gateway and auth_service — student/parent sign-up is Mobile
# Number + OTP only (/otp/send + /otp/verify below). No proxy stub for any
# of them, so a call 404s cleanly instead of hitting this proxy's own
# request validation for a route the backend no longer has anyway.

@rest_router(router.post, path="/login", proxy=auth_svc,
    response_model=TokenResponse, summary="Login with email/phone + password")
async def login(request: Request, response: Response, data: LoginRequest):
    pass

@rest_router(router.post, path="/refresh", proxy=auth_svc,
    response_model=TokenResponse, summary="Exchange a refresh token for a new access token")
async def refresh(request: Request, response: Response, data: RefreshRequest):
    pass

@rest_router(router.post, path="/otp/send", proxy=auth_svc,
    summary="Send a login OTP via SMS to a phone number (students & parents)")
async def send_phone_otp(request: Request, response: Response):
    pass

@rest_router(router.post, path="/otp/verify", proxy=auth_svc,
    summary="Verify a phone-login OTP — logs in or creates the account")
async def verify_phone_otp(request: Request, response: Response):
    pass

@rest_router(router.get, path="/ping", proxy=auth_svc,
    summary="Auth service health probe")
async def ping(request: Request, response: Response):
    pass


# ── Protected endpoints (requires Bearer token) ───────────────────────────────

@rest_router(router.get, path="/me", proxy=auth_svc,
    response_model=UserResponse, summary="Get the currently authenticated user's profile")
async def me(request: Request, response: Response):
    pass

@rest_router(router.get, path="/profile-status", proxy=auth_svc,
    summary="Real backend check: does the authenticated user need to complete their profile?")
async def profile_status(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/me", proxy=auth_svc,
    summary="Soft-delete the authenticated user's account")
async def delete_account(request: Request, response: Response):
    pass

@rest_router(router.put, path="/profile", proxy=auth_svc,
    summary="Update phone / avatar_url on the auth user record")
async def update_auth_profile(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/role", proxy=auth_svc,
    summary="One-time role choice (student/parent) for a brand-new phone-OTP account")
async def set_role(request: Request, response: Response):
    pass

@rest_router(router.get, path="/users", proxy=auth_svc,
    summary="[Admin] List all users with optional role/status filter")
async def list_users(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/users/{user_id}", proxy=auth_svc,
    summary="[Admin] Toggle user active status or update role")
async def patch_user(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/admin/teachers", proxy=auth_svc,
    summary="[Admin] Create a teacher account")
async def create_teacher(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/audit-logs", proxy=auth_svc,
    summary="[Admin] List auth_service audit log entries")
async def list_auth_audit_logs(request: Request, response: Response):
    pass

@rest_router(router.post, path="/logout", proxy=auth_svc,
    summary="Invalidate the current refresh token")
async def logout(request: Request, response: Response, data: RefreshRequest):
    pass

@rest_router(router.post, path="/logout-all", proxy=auth_svc,
    summary="Invalidate ALL refresh tokens for the current user")
async def logout_all(request: Request, response: Response):
    pass

# Disabled along with email/password login itself — only admin accounts use
# a password now, and this pair was never wired into the admin panel's UI.
# @rest_router(router.post, path="/forgot-password", proxy=auth_svc,
#     summary="Send password reset link to email")
# async def forgot_password(request: Request, response: Response, data: ForgotPasswordRequest):
#     pass

# @rest_router(router.post, path="/reset-password", proxy=auth_svc,
#     summary="Reset password using token from email")
# async def reset_password(request: Request, response: Response, data: ResetPasswordRequest):
#     pass

@rest_router(router.post, path="/change-password", proxy=auth_svc,
    summary="Change password for the currently authenticated user (requires Bearer token)")
async def change_password(request: Request, response: Response):
    pass

@rest_router(router.post, path="/token", proxy=auth_svc,
    summary="OAuth2 form login for Swagger UI (username = email or phone)")
async def token_form(request: Request, response: Response):
    pass

@rest_router(router.post, path="/google/disconnect", proxy=auth_svc,
    summary="Unlink Google account from current user")
async def google_disconnect(request: Request, response: Response):
    pass

@rest_router(router.post, path="/google/verify", proxy=auth_svc,
    summary="Verify Google ID token (client-side GIS flow)")
async def google_verify(request: Request, response: Response):
    pass

@rest_router(router.get, path="/google", proxy=auth_svc,
    summary="Get Google OAuth2 redirect URL")
async def google_start(request: Request, response: Response):
    pass

@rest_router(router.get, path="/google/callback", proxy=auth_svc,
    summary="Google OAuth2 callback")
async def google_callback(request: Request, response: Response):
    pass

@rest_router(router.post, path="/oauth/exchange", proxy=auth_svc,
    summary="Redeem a one-time OAuth exchange code for real tokens")
async def oauth_exchange(request: Request, response: Response):
    pass

@rest_router(router.get, path="/sessions", proxy=auth_svc,
    summary="List active device sessions")
async def list_sessions(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/sessions/{session_id}", proxy=auth_svc,
    summary="Revoke a device session")
async def revoke_session(request: Request, response: Response, session_id: str):
    pass
