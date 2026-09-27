import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class UserRole(str, enum.Enum):
    STUDENT = "student"
    PARENT = "parent"
    TEACHER = "teacher"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"
    # A brand-new phone-OTP account has no role yet — the client shows a
    # Student/Parent picker after OTP verify, which calls PATCH /auth/role to
    # move out of this state exactly once (see routes/registration.py). Never
    # settable directly by anything else; every role-gated dependency should
    # treat it as "not yet a real role" (i.e. it should never match any
    # require_role check for student/parent/teacher/admin).
    PENDING = "pending"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nullable: a phone-OTP-only user (see /auth/otp/* routes) has no email at
    # all until they optionally add one later. Postgres allows multiple NULLs
    # in a UNIQUE column (NULL <> NULL), so this doesn't relax the "no two
    # accounts share an email" guarantee for accounts that do have one.
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    school_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.STUDENT)

    # Social auth
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    facebook_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    terms_accepted: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
