import hmac
import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import is_jti_blacklisted
from app.core.security import decode_access_token
from app.database.session import get_db
from app.models.user import User, UserRole
from app.crud.user_crud import UserRepository

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate token",
        )

    user_id = payload.get("sub")
    jti = payload.get("jti")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Reject tokens that were explicitly revoked on logout
    if jti and await is_jti_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
        )

    repo = UserRepository(db)
    user = await repo.get_by_id(uuid.UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def require_roles(*roles: UserRole):
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return checker


require_admin = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
require_super_admin = require_roles(UserRole.SUPER_ADMIN)
require_teacher = require_roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)


INTERNAL_NETS = ("127.", "10.", "172.", "192.168.")


def require_internal(request: Request) -> None:
    """Allow only requests originating from Docker-internal or loopback
    addresses AND presenting the shared X-Internal-Secret header — mirrors
    gamification_service's/analytics_service's/etc. identical pattern. Used
    for endpoints meant to be called only by other trusted backend processes
    on the private network (or, here, the local API test harness), never by
    a browser/app client. The IP check alone is not a real trust boundary
    (any container on the Docker network can spoof it), so it's kept only
    as defense-in-depth alongside the secret check, which fails closed if
    INTERNAL_SERVICE_SECRET is unset."""
    client_ip = request.client.host if request.client else ""
    if not any(client_ip.startswith(prefix) for prefix in INTERNAL_NETS):
        # Return 404 rather than 403 to avoid leaking that the endpoint exists
        raise HTTPException(status_code=404, detail="Not found")
    provided = request.headers.get("x-internal-secret", "")
    expected = settings.INTERNAL_SERVICE_SECRET
    if not expected or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=404, detail="Not found")
