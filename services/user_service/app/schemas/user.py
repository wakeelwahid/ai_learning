import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.user_profile import Gender


class CreateProfileRequest(BaseModel):
    user_id: uuid.UUID
    full_name: str = Field(min_length=1, max_length=200)
    class_number: int | None = Field(default=None, ge=1, le=12)
    board: str | None = Field(default=None, max_length=50)
    school_name: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    gender: Gender | None = None


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    bio: str | None = None
    school_name: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    class_number: int | None = Field(default=None, ge=1, le=12)
    board: str | None = Field(default=None, max_length=50)
    avatar_url: str | None = Field(default=None, max_length=512)


class ProfileResponse(BaseModel):
    user_id: uuid.UUID
    full_name: str | None
    bio: str | None
    class_number: int | None
    board: str | None
    school_name: str | None
    city: str | None
    state: str | None
    gender: Gender | None
    avatar_url: str | None = None
    # Curriculum-change throttle (board/class/school): 3 changes allowed,
    # then locked for 90 days — clients use these to warn before saving.
    curriculum_changes_count: int = 0
    curriculum_locked_until: datetime | None = None
    model_config = {"from_attributes": True}


# ── Parent schemas ─────────────────────────────────────────────────────────────

class ParentStudentLinkCreate(BaseModel):
    student_user_id: uuid.UUID
    relationship: str = Field(default="parent", max_length=50)
    father_name: str | None = Field(default=None, max_length=200)
    mother_name: str | None = Field(default=None, max_length=200)
    # approval_required/is_approved are NOT client-settable — every new link
    # is server-forced to approval_required=True, is_approved=False. See
    # create_parent_student_link() in crud/user_crud.py.


class ParentStudentLinkResponse(BaseModel):
    id: uuid.UUID
    parent_user_id: uuid.UUID
    student_user_id: uuid.UUID
    relationship: str
    father_name: str | None = None
    mother_name: str | None = None
    approval_required: bool
    is_approved: bool
    student_name: str | None = None
    student_class: int | None = None
    student_board: str | None = None
    # Populated only in the student-facing listing (GET
    # /students/{id}/parents) so a student reviewing a pending link can see
    # who is requesting it — parent-facing listings leave this null.
    parent_name: str | None = None
    created_at: datetime
    approved_at: datetime | None = None
    model_config = {"from_attributes": True}


class UpdateParentLinkRequest(BaseModel):
    relationship: str | None = Field(default=None, max_length=50)
    father_name: str | None = Field(default=None, max_length=200)
    mother_name: str | None = Field(default=None, max_length=200)
    # "Approval Mode" — only the parent of the link (or an admin) may set it;
    # enforced in routes/user.py update_parent_link.
    approval_required: bool | None = None
    is_approved: bool | None = None


# ── Study time limit schemas ───────────────────────────────────────────────────

class StudyTimeLimitUpsert(BaseModel):
    daily_limit_minutes: int = Field(default=120, ge=0, le=480)
    is_enabled: bool = True


class StudyTimeLimitResponse(BaseModel):
    id: uuid.UUID
    parent_user_id: uuid.UUID
    child_user_id: uuid.UUID
    daily_limit_minutes: int
    is_enabled: bool
    updated_at: datetime
    used_today_minutes: int = 0
    limit_reached: bool = False
    model_config = {"from_attributes": True}


class StudyTimeStatusResponse(BaseModel):
    """Child-perspective view of the limit that applies to them today."""

    user_id: uuid.UUID
    daily_limit_minutes: int | None = None
    is_enabled: bool = False
    used_today_minutes: int = 0
    limit_reached: bool = False
    id: uuid.UUID | None = None
    parent_user_id: uuid.UUID | None = None
    child_user_id: uuid.UUID | None = None
    updated_at: datetime | None = None


class LinkStudentRequest(BaseModel):
    student_id: uuid.UUID


class StudyLimitRequest(BaseModel):
    daily_limit_minutes: int = Field(ge=0, le=480)
