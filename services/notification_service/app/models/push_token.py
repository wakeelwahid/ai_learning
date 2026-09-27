import uuid
from datetime import datetime
from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database.base import Base

class PushToken(Base):
    __tablename__ = "push_tokens"
    # Keyed on (user_id, device_id), NOT (user_id, platform) — the old
    # platform-keyed constraint meant a second Android device silently
    # evicted the first device's token on every registration (both upserted
    # into the same row). device_id defaults to the token's own value for
    # any legacy row that predates this column (via the backfill below),
    # which preserves old single-device-per-platform behavior for anyone
    # who hasn't re-registered yet, while a real client-supplied device_id
    # (Expo's installationId / a persisted per-install UUID) lets multiple
    # devices of the same platform coexist going forward.
    __table_args__ = (UniqueConstraint("user_id", "device_id"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(500), nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False, server_default="web")
    device_id: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
