import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Plan(Base):
    """Admin-managed subscription plan — full dynamic replacement for the old
    hardcoded _PLANS constant. `features` is a free-text bullet list the admin
    can edit without a schema change; `limits` is an arbitrary key→number dict
    (e.g. {"ai_queries_per_day": 50}) for any plan-gated numeric quota other
    services may want to read via GET /plans."""
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_key: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # e.g. "monthly" — stored on Subscription/Payment
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    badge: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    features: Mapped[list] = mapped_column(JSONB, default=list)   # list[str] bullet points shown in UI
    limits: Mapped[dict] = mapped_column(JSONB, default=dict)     # arbitrary numeric quotas, e.g. {"ai_queries_per_day": 50}
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
