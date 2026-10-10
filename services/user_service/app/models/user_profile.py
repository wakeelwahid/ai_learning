import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Uploaded profile photo, served via GET /users/avatar/{user_id}. Stored
    # in-row (≤2 MB, resized client-side) so no external object store is needed;
    # avatar_url points at the serving endpoint with a ?v= cache-buster.
    avatar_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    avatar_mime: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender, values_callable=lambda x: [e.value for e in x]), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    school_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    class_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    board: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Curriculum-change throttle: board/class/school may be changed at most
    # three times; the third change locks further changes for 90 days.
    curriculum_changes_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    curriculum_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ParentProfile(Base):
    __tablename__ = "parent_profiles"
    # One link row per (parent, student) pair — the application-level
    # duplicate check in UserService.link_student is a read-then-write and
    # two concurrent requests could both pass it; the constraint is what
    # actually guarantees uniqueness (IntegrityError is mapped to 409).
    __table_args__ = (UniqueConstraint("parent_user_id", "student_user_id", name="uq_parent_student_link"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    student_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    relationship: Mapped[str] = mapped_column(String(50), nullable=False, default="parent")
    father_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mother_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # "Approval Mode": when on, the student's self-purchases need this
    # parent's sign-off (see routes/parent_features.py). Off by default so
    # approving a link never silently gates the student's purchases.
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # server_default too, so a raw-SQL insert (seed scripts, psql) can never
    # create a silently pre-approved link — every link starts unapproved.
    is_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
