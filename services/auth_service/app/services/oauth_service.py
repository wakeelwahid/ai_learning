"""
Google OAuth2 handler.
Uses httpx for token exchange — no heavy OAuth libraries needed.
"""
import json
import secrets
import httpx
from app.core.config import settings
from app.core.redis import get_redis

OAUTH_STATE_TTL = 600  # 10 minutes — must complete OAuth flow within this window
OAUTH_CODE_TTL = 60  # one-time exchange code, redeemed within seconds of the redirect


async def store_oauth_code(access_token: str, refresh_token: str, expires_in: int) -> str:
    """Mint a short-lived, single-use exchange code and stash the real tokens
    in Redis under it. The OAuth callback redirects the browser with only
    this opaque code in the URL — never the tokens themselves, which would
    otherwise leak via browser history, Referer headers, and server access
    logs. The frontend immediately POSTs the code back to redeem it."""
    code = secrets.token_urlsafe(32)
    r = await get_redis()
    await r.setex(
        f"oauth_code:{code}",
        OAUTH_CODE_TTL,
        json.dumps({"access_token": access_token, "refresh_token": refresh_token, "expires_in": expires_in}),
    )
    return code


async def consume_oauth_code(code: str) -> dict | None:
    """Atomically redeem a one-time exchange code for the real tokens.
    Returns None if the code is missing, expired, or already used — unlike
    consume_state's CSRF check, this must fail closed (no Redis, no login)
    rather than fail open, since a code stands in for real credentials."""
    r = await get_redis()
    pipe = r.pipeline()
    pipe.get(f"oauth_code:{code}")
    pipe.delete(f"oauth_code:{code}")
    raw, _ = await pipe.execute()
    if not raw:
        return None
    return json.loads(raw)


async def store_state(state: str) -> None:
    """Persist CSRF state token in Redis for one-time use."""
    try:
        r = await get_redis()
        await r.setex(f"oauth_state:{state}", OAUTH_STATE_TTL, "1")
    except Exception:
        pass  # Redis unavailable — degrade gracefully


async def consume_state(state: str) -> bool:
    """Verify and atomically delete CSRF state. Returns False if not found/expired."""
    try:
        r = await get_redis()
        deleted = await r.delete(f"oauth_state:{state}")
        return deleted > 0
    except Exception:
        return True  # Redis unavailable — fail open to avoid locking out users


# ── Google ─────────────────────────────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_SCOPE = "openid email profile"


async def google_redirect_url(mobile: bool = False) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    # Encode client type in state so callback knows where to redirect
    platform = "mobile" if mobile else "web"
    state = f"google:{platform}:{token}"
    await store_state(state)
    redirect_uri = f"{settings.OAUTH_REDIRECT_BASE_URL}/api/v1/auth/google/callback"
    params = (
        f"client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope={GOOGLE_SCOPE.replace(' ', '%20')}"
        f"&state={state}"
        f"&access_type=offline"
        f"&prompt=select_account"
    )
    return f"{GOOGLE_AUTH_URL}?{params}", state


async def google_exchange_code(code: str) -> dict:
    redirect_uri = f"{settings.OAUTH_REDIRECT_BASE_URL}/api/v1/auth/google/callback"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        r.raise_for_status()
        tokens = r.json()

        userinfo_r = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        userinfo_r.raise_for_status()
        return userinfo_r.json()
    # Returns: {id, email, name, picture, verified_email}


async def google_verify_id_token(id_token: str) -> dict:
    """Verify a Google ID token returned by the client-side GIS / expo-auth-session.
    Uses Google's tokeninfo endpoint — no client secret required."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
        r.raise_for_status()
        data = r.json()

    if "error" in data:
        raise ValueError(f"Invalid Google token: {data['error']}")
    if not data.get("email_verified") or data.get("email_verified") == "false":
        raise ValueError("Google account email is not verified")
    if settings.GOOGLE_CLIENT_ID and data.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise ValueError("Token audience does not match client ID")

    return {
        "id": data["sub"],
        "email": data["email"],
        "name": data.get("name"),
        "picture": data.get("picture"),
    }
