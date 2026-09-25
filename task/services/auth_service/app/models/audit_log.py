import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class AuditLog(Base):
    """Append-only security/business audit trail for auth_service.

    Never updated or deleted after insert — that's what makes it useful as
    an audit trail rather than just another mutable table. Each row is one
    event: who did what, to what, when, and whether it succeeded. Every
    service that needs auditing gets its OWN copy of this same shape
    (rather than one shared cross-service audit service) — consistent with
    the platform's existing per-service-database architecture, and it means
    an audit write can never fail because a DIFFERENT service's audit
    dependency is down.

    Never write passwords, tokens, secrets, or full payment credentials into
    `metadata` — see write_audit_log()'s docstring for what's safe.
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Who. NULL actor_id is valid and meaningful — e.g. a failed login before
    # any user could be identified (wrong identifier entirely).
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # What. A short, greppable event name (e.g. "login", "login_failed",
    # "role_changed", "password_changed") — not a free-text sentence.
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    # To what. resource_type is the kind of thing acted on ("user",
    # "session"); resource_id is its id, as text (not FK — a resource can
    # outlive or predate this row, and may live in another service's table
    # entirely, e.g. resource_type="user" for a role change).
    resource_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Outcome — "success" | "failure" | "denied". A failed login is exactly
    # as important to have logged as a successful one.
    result: Mapped[str] = mapped_column(String(20), nullable=False, default="success")

    # Context, never secrets: ip/user_agent for security review, plus a
    # small JSON bag of event-specific detail (e.g. {"old_role": "student",
    # "new_role": "parent"}). See write_audit_log()'s docstring for the
    # exact denylist enforced before anything lands in this column.
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        # The dashboard's two real query shapes: "everything this actor did"
        # and "everything that happened to this resource" — both ordered by
        # recency, so the composite index carries created_at as its second
        # column rather than needing a separate sort.
        Index("ix_audit_logs_actor_created", "actor_id", "created_at"),
        Index("ix_audit_logs_resource_created", "resource_type", "resource_id", "created_at"),
    )
