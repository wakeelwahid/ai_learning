import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import SubscriptionStatus


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    # Free-text plan_key (references Plan.plan_key) instead of a fixed Python
    # enum — lets admins add/remove/rename plan tiers via the Plans admin UI
    # without a code deploy. Legacy rows may hold "basic"/"premium" even
    # though no active Plan with that key exists any more; display code
    # falls back to the raw value when no Plan match is found.
    plan: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[SubscriptionStatus] = mapped_column(Enum(SubscriptionStatus), default=SubscriptionStatus.PENDING)
    starts_at:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
