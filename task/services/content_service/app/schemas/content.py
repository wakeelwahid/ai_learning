import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.content import DifficultyLevel


class BoardResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    model_config = {"from_attributes": True}


class ClassResponse(BaseModel):
    id: uuid.UUID
    name: str
    number: int
    model_config = {"from_attributes": True}


class SubjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    icon_url: str | None
    model_config = {"from_attributes": True}


class ChapterResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    sequence: int
    model_config = {"from_attributes": True}


class TopicResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    sequence: int
    difficulty: DifficultyLevel
    model_config = {"from_attributes": True}


class VideoResponse(BaseModel):
    id: uuid.UUID
    title: str
    youtube_id: str
    youtube_id_hi: str | None = None
    youtube_id_pa: str | None = None
    youtube_id_bho: str | None = None
    duration_seconds: int
    thumbnail_url: str | None = None
    notes_url: str | None = None
    is_premium: bool
    sequence: int
    target_board: str | None = None
    target_class: int | None = None
    model_config = {"from_attributes": True}


class NoteResponse(BaseModel):
    id: uuid.UUID
    title: str
    note_type: str
    is_premium: bool
    download_url: str | None = None
    target_board: str | None = None
    target_class: int | None = None
    model_config = {"from_attributes": True}


class VideoProgressUpdate(BaseModel):
    watched_seconds: int = Field(ge=0, le=86400)
    is_completed: bool = False
    # Resume + pause/resume tracking (optional — older clients still work)
    position_seconds: int | None = Field(default=None, ge=0, le=86400)   # current playhead (resume point)
    status: Literal["playing", "paused", "completed"] | None = None


class VideoProgressResponse(BaseModel):
    video_id: uuid.UUID
    watched_seconds: int
    actual_watched_seconds: int = 0
    is_completed: bool
    completion_percentage: float
    notes_unlocked: bool = False
    status: str = "in_progress"
    last_position_seconds: int = 0
    model_config = {"from_attributes": True}


class ChapterCreate(BaseModel):
    subject_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)  # matches Chapter.title String(200)
    description: str | None = None                    # Chapter.description is Text (unbounded)
    sequence: int = Field(default=0, ge=0)


class TopicCreate(BaseModel):
    chapter_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)  # matches Topic.title String(200)
    description: str | None = None                    # Topic.description is Text (unbounded)
    sequence: int = Field(default=0, ge=0)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM


class VideoCreate(BaseModel):
    topic_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)          # Video.title String(200)
    youtube_id: str = Field(min_length=1, max_length=50)      # Video.youtube_id String(50)
    youtube_id_hi: str | None = Field(default=None, max_length=50)
    youtube_id_pa: str | None = Field(default=None, max_length=50)
    youtube_id_bho: str | None = Field(default=None, max_length=50)
    duration_seconds: int = Field(default=0, ge=0, le=86400)  # cap at 24h to catch garbage input
    thumbnail_url: str | None = Field(default=None, max_length=512)   # Video.thumbnail_url String(512)
    notes_url: str | None = Field(default=None, max_length=1024)      # Video.notes_url String(1024)
    sequence: int = Field(default=0, ge=0)
    is_premium: bool = False
    # Independent optional visibility filter — both left as None means "for
    # everyone", regardless of the topic's own class. See Video.target_board.
    target_board: str | None = Field(default=None, max_length=100)
    target_class: int | None = Field(default=None, ge=1, le=12)


class ChapterVideoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    youtube_id: str = Field(min_length=1, max_length=50)
    youtube_id_hi: str | None = Field(default=None, max_length=50)
    youtube_id_pa: str | None = Field(default=None, max_length=50)
    youtube_id_bho: str | None = Field(default=None, max_length=50)
    duration_seconds: int = Field(default=0, ge=0, le=86400)
    thumbnail_url: str | None = Field(default=None, max_length=512)
    notes_url: str | None = Field(default=None, max_length=1024)
    sequence: int = Field(default=0, ge=0)
    is_premium: bool = False
    target_board: str | None = Field(default=None, max_length=100)
    target_class: int | None = Field(default=None, ge=1, le=12)


class BoardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)  # ContentBoard.name String(100)
    code: str = Field(min_length=1, max_length=20)    # ContentBoard.code String(20)


class ClassCreate(BaseModel):
    board_id: uuid.UUID
    name: str = Field(min_length=1, max_length=50)    # ContentClass.name String(50)
    number: int = Field(ge=1, le=12)                  # school classes 1-12 (admin UI enforces same range)


class SubjectCreate(BaseModel):
    class_id: uuid.UUID
    name: str = Field(min_length=1, max_length=100)   # Subject.name String(100)
    code: str = Field(min_length=1, max_length=20)    # Subject.code String(20)
    icon_url: str | None = Field(default=None, max_length=512)  # Subject.icon_url String(512)


class ChapterUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    sequence: Optional[int] = Field(default=None, ge=0)


class NoteBookmarkRequest(BaseModel):
    user_id: uuid.UUID


class BookmarkToggleRequest(BaseModel):
    entity_type: Literal["video", "note"]
    entity_id: uuid.UUID


class BookmarkToggleResponse(BaseModel):
    bookmarked: bool
    entity_type: str
    entity_id: uuid.UUID


class BookmarkedVideoItem(BaseModel):
    bookmark_id: uuid.UUID
    bookmarked_at: datetime
    video_id: uuid.UUID
    title: str
    youtube_id: str
    duration_seconds: int
    thumbnail_url: str | None = None
    topic_name: str | None = None
    chapter_name: str | None = None
    subject_name: str | None = None
    subject_id: uuid.UUID | None = None
    class_number: int | None = None
    board_name: str | None = None


class BookmarkedNoteItem(BaseModel):
    bookmark_id: uuid.UUID
    bookmarked_at: datetime
    note_id: uuid.UUID
    title: str
    note_type: str
    s3_key: str
    is_premium: bool
    chapter_name: str | None = None
    subject_name: str | None = None


class UserBookmarksResponse(BaseModel):
    videos: list[BookmarkedVideoItem]
    notes: list[BookmarkedNoteItem]


# ── Assignments ──────────────────────────────────────────────────────────────────

class AssignmentCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    entity_type: Literal["chapter", "exercise"]
    entity_id: uuid.UUID
    student_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    due_at: Optional[datetime] = None

    @field_validator("due_at")
    @classmethod
    def _validate_due_at(cls, v: datetime | None) -> datetime | None:
        if v is not None:
            now = datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow()
            if v < now:
                raise ValueError("due_at cannot be in the past")
        return v


class AssignmentResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    entity_type: str
    entity_id: uuid.UUID
    assigned_by: uuid.UUID
    due_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    student_count: int = 0


class StudentAssignmentItem(BaseModel):
    """One assignment as seen from the assigned student's (or their
    parent's) side — completion is real, derived from UserLearningProgress,
    never a client-reported flag."""
    assignment_id: uuid.UUID
    title: str
    description: Optional[str] = None
    entity_type: str
    entity_id: uuid.UUID
    entity_title: Optional[str] = None
    subject_name: Optional[str] = None
    due_at: Optional[datetime] = None
    is_completed: bool
    completed_at: Optional[datetime] = None
    is_overdue: bool


class StudentAssignmentsResponse(BaseModel):
    assignments: list[StudentAssignmentItem]
    total: int
    completed: int


# ── Exercise / Question / Practice Question schemas ─────────────────────────────

class ExerciseCreate(BaseModel):
    chapter_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)          # Exercise.name String(200)
    number: str = Field(default="", max_length=50)           # Exercise.number String(50)
    sequence: int = Field(default=0, ge=0)


class QuestionCreate(BaseModel):
    chapter_id: uuid.UUID
    exercise_id: Optional[uuid.UUID] = None
    question_number: str = Field(min_length=1, max_length=20)  # Question.question_number String(20)
    question_text: Optional[str] = None                        # Question.question_text is Text (unbounded)
    sequence: int = Field(default=0, ge=0)


class QuestionVideoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)                 # Video.title String(200)
    youtube_id: str = Field(min_length=1, max_length=50)              # Video.youtube_id String(50)
    youtube_id_hi: Optional[str] = Field(default=None, max_length=50)
    youtube_id_pa: Optional[str] = Field(default=None, max_length=50)
    youtube_id_bho: Optional[str] = Field(default=None, max_length=50)
    duration_seconds: int = Field(default=0, ge=0, le=86400)
    thumbnail_url: Optional[str] = Field(default=None, max_length=512)
    notes_url: Optional[str] = Field(default=None, max_length=1024)
    is_premium: bool = False


class PracticeQuestionCreate(BaseModel):
    question_id: uuid.UUID
    text: str = Field(min_length=1)                                    # PracticeQuestion.text is Text (unbounded)
    option_a: str = Field(min_length=1, max_length=500)                # PracticeQuestion.option_a String(500)
    option_b: str = Field(min_length=1, max_length=500)
    option_c: Optional[str] = Field(default=None, max_length=500)
    option_d: Optional[str] = Field(default=None, max_length=500)
    correct_option: str = Field(pattern="^[ABCDabcd]$")                # PracticeQuestion.correct_option String(1)
    explanation: Optional[str] = None
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    sequence: int = Field(default=0, ge=0)


# ── Info Pages (CMS) ─────────────────────────────────────────────────────────────

class InfoPageBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)  # InfoPage.title String(200)
    content: str = ""                                  # InfoPage.content is Text (unbounded)
    data: dict | None = None
    is_published: bool = True


# ── Completion Certificates ───────────────────────────────────────────────────

class CertificateIssueRequest(BaseModel):
    user_id: uuid.UUID
    entity_type: str = Field(..., pattern="^(chapter|subject)$")
    entity_id: uuid.UUID
    student_name: str = Field(..., min_length=1, max_length=200)


class CertificateResponse(BaseModel):
    id: uuid.UUID
    certificate_number: str
    user_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    student_name: str
    chapter_name: str | None
    subject_name: str
    board: str
    class_num: int
    issued_at: str
    share_url: str

    model_config = {"from_attributes": True}


# ─── Previous Year Papers ──────────────────────────────────────────────────────

class PYPCreate(BaseModel):
    # Independent optional visibility filter — either left as None means "for
    # everyone" on that axis (any board / any class). See PreviousYearPaper.board.
    board: str | None = Field(default=None, min_length=1, max_length=30)     # PreviousYearPaper.board String(30)
    class_num: int | None = Field(default=None, ge=1, le=12)
    subject: str = Field(min_length=1, max_length=100)  # PreviousYearPaper.subject String(100)
    year: int = Field(ge=1990, le=2100)
    # exam_type real values in the wild ("annual"/"midterm"/"sample"/"compartment"/
    # "supplementary" per admin/src/pages/content/ContentManagerPage.tsx) don't match
    # a fixed enum, so this stays a length-bounded free-text field, not a Literal/Enum.
    exam_type: str = Field(default="board_exam", max_length=30)
    title: str = Field(min_length=1, max_length=200)    # PreviousYearPaper.title String(200)
    description: str | None = None                      # Text (unbounded)
    file_url: str | None = Field(default=None, max_length=512)
    thumbnail_url: str | None = Field(default=None, max_length=512)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    tags: dict | None = None
    videos: list | None = None

class PYPUpdate(BaseModel):
    board: str | None = Field(default=None, min_length=1, max_length=30)
    class_num: int | None = Field(default=None, ge=1, le=12)
    subject: str | None = Field(default=None, min_length=1, max_length=100)
    year: int | None = Field(default=None, ge=1990, le=2100)
    exam_type: str | None = Field(default=None, max_length=30)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    file_url: str | None = Field(default=None, max_length=512)
    thumbnail_url: str | None = Field(default=None, max_length=512)
    difficulty: DifficultyLevel | None = None
    tags: dict | None = None
    videos: list | None = None
    is_active: bool | None = None


# ─── Knowledge Hub ─────────────────────────────────────────────────────────────

class KnowledgeCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)   # KnowledgeCategory.name String(100)
    icon: str = Field(default="📚", max_length=20)     # KnowledgeCategory.icon String(20)
    color: str = Field(default="from-blue-400 to-blue-600", max_length=50)  # String(50)
    description: str | None = None                     # Text (unbounded)
    sequence: int = Field(default=0, ge=0)

class KnowledgeArticleCreate(BaseModel):
    category_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)   # KnowledgeArticle.title String(200)
    description: str = Field(min_length=1)             # Text (unbounded)
    content: str = ""                                   # Text (unbounded)
    cover_image_url: str | None = Field(default=None, max_length=512)
    duration_min: int = Field(default=5, ge=1, le=600)
    is_trending: bool = False
    is_published: bool = True
    author: str | None = Field(default=None, max_length=100)  # KnowledgeArticle.author String(100)
    content_type: str = Field(default="article", pattern="^(article|video)$")
    video_url: str | None = Field(default=None, max_length=512)
    external_url: str | None = Field(default=None, max_length=512)

class KnowledgeArticleUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    content: str | None = None
    cover_image_url: str | None = Field(default=None, max_length=512)
    duration_min: int | None = Field(default=None, ge=1, le=600)
    is_trending: bool | None = None
    is_published: bool | None = None
    author: str | None = Field(default=None, max_length=100)
    content_type: str | None = Field(default=None, pattern="^(article|video)$")
    video_url: str | None = Field(default=None, max_length=512)
    external_url: str | None = Field(default=None, max_length=512)


# ─── Admin Catalog Endpoints (/admin/boards, /admin/classes, etc.) ─────────────

class BoardUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    is_active: Optional[bool] = None


class ClassUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    number: Optional[int] = Field(default=None, ge=1, le=12)
    is_active: Optional[bool] = None


class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    icon_url: Optional[str] = Field(None, max_length=512)
    is_active: Optional[bool] = None


class TopicUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    sequence: Optional[int] = Field(default=None, ge=0)
    difficulty: Optional[DifficultyLevel] = None
    is_active: Optional[bool] = None


# ── PYP Practice Questions ────────────────────────────────────────────────────

class PypPracticeQuestionCreate(BaseModel):
    topic_name: str = Field(..., min_length=1, max_length=100)   # PypPracticeQuestion.topic_name String(100)
    text: str = Field(..., min_length=1)                          # Text (unbounded)
    option_a: str = Field(..., min_length=1, max_length=500)      # PypPracticeQuestion.option_a String(500)
    option_b: str = Field(..., min_length=1, max_length=500)
    option_c: str | None = Field(default=None, max_length=500)
    option_d: str | None = Field(default=None, max_length=500)
    correct_option: str = Field(..., pattern="^[ABCDabcd]$")      # PypPracticeQuestion.correct_option String(1)
    explanation: str | None = None
    difficulty: str = "medium"
    sequence: int = Field(default=0, ge=0)

    @field_validator("difficulty")
    @classmethod
    def _validate_difficulty(cls, v: str) -> str:
        # Case-insensitive (route historically accepted "Medium"/"HARD" etc. via
        # .lower() before comparing) but now rejected with 422 instead of being
        # silently coerced to "medium" on an invalid value.
        try:
            return DifficultyLevel(v.lower()).value
        except ValueError:
            raise ValueError("must be one of: easy, medium, hard")


# ── Parent RAG: one student's learning footprint (internal) ───────────────────

class StudentVideoItem(BaseModel):
    video_id: uuid.UUID
    title: str | None = None
    subject: str | None = None
    chapter: str | None = None
    completion_percentage: float
    is_completed: bool
    updated_at: datetime


class StudentVideos(BaseModel):
    total_watched: int
    completed: int
    total_watch_seconds: int
    recent: list[StudentVideoItem]


class StudentSubjectCompletion(BaseModel):
    subject_id: uuid.UUID
    subject_name: str | None = None
    chapters_total: int | None = None
    chapters_completed: int
    avg_score: float | None = None


class StudentEntityCompletion(BaseModel):
    entity_type: str
    total: int
    completed: int
    avg_score: float | None = None


class StudentCompletion(BaseModel):
    by_subject: list[StudentSubjectCompletion]
    by_entity_type: list[StudentEntityCompletion]


class StudentBookmarkItem(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    title: str | None = None
    subject: str | None = None
    created_at: datetime


class StudentCertificateItem(BaseModel):
    certificate_number: str
    chapter_name: str | None = None
    subject_name: str
    board: str
    class_num: int
    issued_at: datetime


class StudentAssignmentBrief(BaseModel):
    title: str
    due_at: datetime | None = None
    entity_type: str


class StudentAssignments(BaseModel):
    assigned: int
    pending: int
    recent: list[StudentAssignmentBrief]


class StudentLearningResponse(BaseModel):
    user_id: uuid.UUID
    videos: StudentVideos
    completion: StudentCompletion
    bookmarks: list[StudentBookmarkItem]
    certificates: list[StudentCertificateItem]
    assignments: StudentAssignments


# ── PYP attempts ──────────────────────────────────────────────────────────────

class PypAttemptSubmit(BaseModel):
    """Submit body. `answers` maps question_id -> chosen option ("A".."D");
    scoring is server-side from PypPracticeQuestion.correct_option."""
    answers: dict[str, str] = Field(default_factory=dict)
    time_taken_sec: Optional[int] = Field(default=None, ge=0)


class PypAttemptItem(BaseModel):
    attempt_id: uuid.UUID
    pyp_id: uuid.UUID
    subject: str | None = None
    board: str | None = None
    class_num: int | None = None
    year: int | None = None
    exam_type: str | None = None
    questions_total: int
    correct_count: int
    wrong_count: int
    percentage: float
    time_taken_sec: int | None = None
    status: str
    started_at: datetime | None = None
    completed_at: datetime | None = None


class PypTotals(BaseModel):
    attempts: int
    avg_percentage: float | None = None
    papers_opened: int


class StudentPypResponse(BaseModel):
    user_id: uuid.UUID
    attempts: list[PypAttemptItem]
    totals: PypTotals
