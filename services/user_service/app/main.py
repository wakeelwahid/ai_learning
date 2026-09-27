from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import delete, func
from sqlalchemy.exc import IntegrityError
from app.routes.router import api_router
from app.core.config import settings
from app.database.session import engine
from app.database.base import Base
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
# Import models so Base.metadata.create_all picks them up
from app.models.user_profile import UserProfile, ParentProfile  # noqa: F401
from app.models.parent_settings import StudyTimeLimit  # noqa: F401
from app.models.parent_features import MeetingRequest, ParentApprovalRequest, ParentLinkDecline  # noqa: F401
from app.models.message import Message  # noqa: F401
from app.models.chat import ChatRoom, ChatRoomMember, ChatMessage, MessageReadReceipt, FriendRequest, MessageReaction, ParentAuditLog  # noqa: F401
from app.routes.chat_ws import manager as ws_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            # Advisory lock (transaction-scoped — auto-released at commit/
            # rollback) serializes schema creation across concurrent uvicorn
            # workers, closing the race the IntegrityError catch below used
            # to just paper over.
            await conn.execute(func.pg_advisory_xact_lock(991003).select())
            await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
    except IntegrityError:
        # Kept as a defensive fallback; the advisory lock above should make
        # this unreachable in normal operation.
        pass
    try:
        async with engine.begin() as _c2:
            await _c2.execute(delete(ChatMessage).where(ChatMessage.expires_at < func.now()))
    except Exception:
        pass
    # Wire Redis into the WebSocket ConnectionManager
    await ws_manager.setup(settings.REDIS_URL)
    yield
    await engine.dispose()

if settings.SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        release=settings.APP_NAME,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, docs_url="/docs" if settings.DEBUG else None, redoc_url=None)
Instrumentator(should_group_status_codes=False, should_ignore_untemplated=True).instrument(app).expose(app, include_in_schema=False, tags=["observability"])
add_cors(app)
register_error_handlers(app)
app.include_router(api_router)

@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.APP_NAME}
