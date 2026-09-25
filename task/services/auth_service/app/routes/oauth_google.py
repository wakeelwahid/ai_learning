import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import get_db
from app.schemas.oauth import GoogleTokenRequest, OAuthExchangeRequest, OAuthRedirectResponse
from app.schemas.session import TokenResponse
from app.services.oauth_service import (
    consume_oauth_code,
    consume_state,
    google_exchange_code,
    google_redirect_url,
    google_verify_id_token,
    store_oauth_code,
)
from app.services.social_login_service import SocialLoginService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Google OAuth2 ─────────────────────────────────────────────────────────────

@router.get("/google", response_model=OAuthRedirectResponse, summary="Get Google OAuth2 redirect URL")
async def google_oauth_start(mobile: int = 0):
    """Returns the Google OAuth2 authorization URL. Pass ?mobile=1 for app deep-link redirect."""
    if not settings.GOOGLE_CLIENT_ID or settings.GOOGLE_CLIENT_ID.startswith("your-"):
        raise HTTPException(status_code=501, detail="Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID in auth_service/.env")
    url, state = await google_redirect_url(mobile=bool(mobile))
    return {"redirect_url": url, "provider": "google"}


@router.post("/google/verify", response_model=TokenResponse, summary="Verify Google ID token (client-side GIS flow)")
async def google_verify_token(
    body: GoogleTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Accept a Google ID token from the browser's GIS popup or expo-auth-session
    and exchange it for platform JWT tokens. Works without a client secret."""
    try:
        userinfo = await google_verify_id_token(body.id_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Google token: {e}")

    service = SocialLoginService(db)
    return await service.social_login(
        provider="google",
        social_id=userinfo["id"],
        email=userinfo["email"],
        name=userinfo.get("name"),
        avatar_url=userinfo.get("picture"),
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )


@router.post("/oauth/exchange", response_model=TokenResponse, summary="Redeem a one-time OAuth exchange code for real tokens")
async def oauth_exchange(body: OAuthExchangeRequest):
    """The OAuth callback (Google) redirects the browser/app with
    only an opaque, single-use code in the URL — never the actual tokens.
    The client calls this immediately to redeem that code over a normal
    request body, so access/refresh tokens never appear in a URL, browser
    history, Referer header, or server access log."""
    tokens = await consume_oauth_code(body.code)
    if tokens is None:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth code")
    return TokenResponse(**tokens)


@router.get("/google/callback", summary="Google OAuth2 callback (used by Google)")
async def google_oauth_callback(
    code: str,
    state: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Determine if request originated from mobile app (state = "google:mobile:token")
    is_mobile = state.startswith("google:mobile:")
    error_dest = "eduai://auth/error" if is_mobile else f"{settings.FRONTEND_URL}/auth/error?reason=google_failed"

    # CSRF: verify state was issued by us
    if not await consume_state(state):
        return RedirectResponse(url=error_dest)

    try:
        userinfo = await google_exchange_code(code)
    except Exception:
        return RedirectResponse(url=error_dest)

    service = SocialLoginService(db)
    tokens = await service.social_login(
        provider="google",
        social_id=userinfo["id"],
        email=userinfo["email"],
        name=userinfo.get("name"),
        avatar_url=userinfo.get("picture"),
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )

    # The redirect carries only a short-lived, single-use exchange code —
    # never the real tokens — so they never end up in browser history,
    # Referer headers, or server access logs. The client POSTs the code to
    # /auth/oauth/exchange to redeem it for the actual TokenResponse.
    exchange_code = await store_oauth_code(tokens.access_token, tokens.refresh_token, tokens.expires_in)

    if is_mobile:
        # Redirect to app deep link — WebBrowser.openAuthSessionAsync captures this
        redirect = f"eduai://auth/callback?code={exchange_code}"
    else:
        redirect = f"{settings.FRONTEND_URL}/auth/callback?code={exchange_code}"

    return RedirectResponse(url=redirect)
