import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class AuditLog(Base):
    """Append-only security/business audit trail for payment_service.

    Same shape as every other service's audit_logs table (see
    auth_service/app/models/audit_log.py for the full design rationale) —
    each service owns its own copy rather than a shared cross-service audit
    service, consistent with the platform's per-service-database
    architecture. For payment_service specifically this is the durable
    "who did what to whose money" trail: coupon create/toggle/delete,
    refunds, and subscription changes — compliance-relevant events that
    must never be silently unrecorded.

    Never write raw card numbers, CVVs, or full payment-gateway secrets into
    `metadata` — see write_audit_log()'s docstring for the exact denylist.
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)

    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    resource_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    result: Mapped[str] = mapped_column(String(20), nullable=False, default="success")

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        Index("ix_audit_logs_actor_created", "actor_id", "created_at"),
        Index("ix_audit_logs_resource_created", "resource_type", "resource_id", "created_at"),
    )
