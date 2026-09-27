import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgresUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class AIUsageLog(Base):
    """One row per user per AI feature use. Used to enforce daily per-feature limits."""
    __tablename__ = "ai_usage_log"

    id:            Mapped[uuid.UUID] = mapped_column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:       Mapped[str]       = mapped_column(String(36), nullable=False, index=True)
    feature:       Mapped[str]       = mapped_column(String(20), nullable=False, index=True)  # questions|quiz|paper|custom
    used_date:     Mapped[date]      = mapped_column(Date, nullable=False, index=True)
    request_params: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at:    Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow)
