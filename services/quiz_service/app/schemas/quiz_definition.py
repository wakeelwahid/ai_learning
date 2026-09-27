import uuid

from pydantic import BaseModel, Field, model_validator

from app.models.quiz import QuestionType, QuizType


# ── Read responses ────────────────────────────────────────────────────────────

class QuizResponse(BaseModel):
    id:               uuid.UUID
    title:            str
    quiz_type:        QuizType
    duration_minutes: int
    total_marks:      int
    is_premium:       bool
    board:            str | None = None
    class_num:        int | None = None
    subject_name:     str | None = None
    chapter_name:     str | None = None
    model_config = {"from_attributes": True}


class QuestionResponse(BaseModel):
    id:            uuid.UUID
    text:          str
    question_type: QuestionType
    options:       dict | None
    marks:         int
    sequence:      int
    model_config = {"from_attributes": True}


class QuestionWithAnswerResponse(QuestionResponse):
    correct_answer: str
    explanation:    str | None


# ── Create / write ────────────────────────────────────────────────────────────

class QuizCreate(BaseModel):
    title:            str = Field(min_length=1, max_length=200)  # Quiz.title String(200)
    chapter_id:       uuid.UUID | None = None
    subject_id:       uuid.UUID | None = None
    quiz_type:        QuizType
    duration_minutes: int   = Field(default=30, ge=1, le=600)   # up to 10h
    total_marks:      int   = Field(default=0, ge=0, le=1000)
    passing_marks:    int   = Field(default=0, ge=0, le=1000)
    is_premium:       bool  = False
    # Cache routing metadata
    board:            str | None = Field(default=None, max_length=50)   # Quiz.board String(50)
    class_num:        int | None = Field(default=None, ge=1, le=12)
    subject_name:     str | None = Field(default=None, max_length=100)  # Quiz.subject_name String(100)
    chapter_name:     str | None = Field(default=None, max_length=200)  # Quiz.chapter_name String(200)


class QuestionCreate(BaseModel):
    quiz_id:        uuid.UUID
    text:           str = Field(min_length=1, max_length=10_000)   # Question.text is Text (unbounded)
    question_type:  QuestionType
    options:        dict | None = None
    correct_answer: str = Field(min_length=1, max_length=5_000)    # Question.correct_answer is Text (unbounded)
    explanation:    str | None  = None
    marks:          int         = Field(default=1, ge=0, le=1000)
    negative_marks: float       = Field(default=0.0, ge=0, le=100)
    sequence:       int         = Field(default=0, ge=0)
    topic_id:       uuid.UUID | None = None

    @model_validator(mode="after")
    def _validate_mcq_options(self) -> "QuestionCreate":
        # Previously accepted an MCQ with zero/one option (unanswerable) or
        # a correct_answer that names no real option key (unwinnable) — both
        # confirmed live as a 201 with no complaint.
        if self.question_type == QuestionType.MCQ:
            if not self.options or len(self.options) < 2:
                raise ValueError("An MCQ question needs at least 2 options")
            if self.correct_answer not in self.options:
                raise ValueError("correct_answer must be one of the option keys")
        return self


class BulkQuestionCreate(BaseModel):
    """Create multiple questions for a quiz in one request."""
    quiz_id:   uuid.UUID
    questions: list[QuestionCreate] = Field(min_length=1)


class QuizAdminUpdate(BaseModel):
    """[Admin] Partial update for PATCH /quizzes/admin/{quiz_id}.

    Explicit allowlist of client-settable quiz fields — replaces the previous
    raw `dict` body (mass-assignment risk: any Quiz column could be set via
    the request body, including ones that should never be client-controlled,
    e.g. id/created_at). `extra="forbid"` rejects unrecognized fields instead
    of silently dropping them, so client bugs surface as a 422 instead of a
    silent no-op.

    NOTE: `chapter_id` is included because the real admin panel
    (admin/src/pages/quiz/QuizManagementPage.tsx) submits it on every edit,
    even though it wasn't previously in quiz_crud.patch_quiz's allowlist.
    """
    title:            str | None = Field(default=None, min_length=1, max_length=200)
    chapter_id:       uuid.UUID | None = None
    quiz_type:        QuizType | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    total_marks:      int | None = Field(default=None, ge=0, le=1000)
    passing_marks:    int | None = Field(default=None, ge=0, le=1000)
    is_premium:       bool | None = None
    is_active:        bool | None = None
    # Visibility filter — explicitly sending null clears that axis to "for
    # everyone" (see quiz_crud.patch_quiz, which distinguishes an omitted
    # field from one explicitly set to null via model_fields_set).
    board:            str | None = Field(default=None, max_length=50)
    class_num:        int | None = Field(default=None, ge=1, le=12)

    model_config = {"extra": "forbid"}
