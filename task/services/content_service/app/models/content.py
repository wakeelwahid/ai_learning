import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey,
    Integer, LargeBinary, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Board(str, enum.Enum):
    CBSE = "cbse"
    HBSE = "hbse"
    UP_BOARD = "up_board"
    ICSE = "icse"
    RBSE = "rbse"
    BIHAR = "bihar"


class DifficultyLevel(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class ContentBoard(Base):
    __tablename__ = "boards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    classes: Mapped[list["ContentClass"]] = relationship(back_populates="board")


class ContentClass(Base):
    __tablename__ = "classes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    board_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boards.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    board: Mapped["ContentBoard"] = relationship(back_populates="classes")
    subjects: Mapped[list["Subject"]] = relationship(back_populates="class_")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("classes.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    class_: Mapped["ContentClass"] = relationship(back_populates="subjects")
    chapters: Mapped[list["Chapter"]] = relationship(back_populates="subject")


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    subject: Mapped["Subject"] = relationship(back_populates="chapters")
    topics: Mapped[list["Topic"]] = relationship(back_populates="chapter")
    notes: Mapped[list["Note"]] = relationship(back_populates="chapter")
    exercises: Mapped[list["Exercise"]] = relationship(back_populates="chapter")
    questions: Mapped[list["Question"]] = relationship(back_populates="chapter")


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chapters.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    difficulty: Mapped[DifficultyLevel] = mapped_column(Enum(DifficultyLevel), default=DifficultyLevel.MEDIUM)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    chapter: Mapped["Chapter"] = relationship(back_populates="topics")
    videos: Mapped[list["Video"]] = relationship(back_populates="topic")


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    question_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    youtube_id: Mapped[str] = mapped_column(String(50), nullable=False)
    youtube_id_hi: Mapped[str | None] = mapped_column(String(50), nullable=True)
    youtube_id_pa: Mapped[str | None] = mapped_column(String(50), nullable=True)
    youtube_id_bho: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    thumbnail_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Optional visibility filter, independent of each other and of the topic's
    # own board/class (which is fixed by the FK chain). NULL on either means
    # "no restriction on that axis" — both NULL means visible to everyone.
    # Set together they narrow to one board+class; set alone they narrow to
    # just that board (any class) or just that class (any board).
    target_board: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_class: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    topic: Mapped["Topic | None"] = relationship(back_populates="videos", foreign_keys=[topic_id])
    question: Mapped["Question | None"] = relationship(back_populates="videos", foreign_keys=[question_id])


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chapters.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    note_type: Mapped[str] = mapped_column(String(50), nullable=False)  # pdf, formula_sheet, revision
    s3_key: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # See Video.target_board/target_class above — same independent-optional semantics.
    target_board: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_class: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    chapter: Mapped["Chapter"] = relationship(back_populates="notes")


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    number: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    chapter: Mapped["Chapter"] = relationship(back_populates="exercises")
    questions: Mapped[list["Question"]] = relationship(back_populates="exercise", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True)
    question_number: Mapped[str] = mapped_column(String(20), nullable=False)
    question_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    chapter: Mapped["Chapter"] = relationship(back_populates="questions")
    exercise: Mapped["Exercise | None"] = relationship(back_populates="questions")
    videos: Mapped[list["Video"]] = relationship(back_populates="question", foreign_keys="[Video.question_id]", cascade="all, delete-orphan")
    practice_questions: Mapped[list["PracticeQuestion"]] = relationship(back_populates="question", cascade="all, delete-orphan")


class PracticeQuestion(Base):
    __tablename__ = "practice_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(String(500), nullable=False)
    option_b: Mapped[str] = mapped_column(String(500), nullable=False)
    option_c: Mapped[str | None] = mapped_column(String(500), nullable=True)
    option_d: Mapped[str | None] = mapped_column(String(500), nullable=True)
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[DifficultyLevel] = mapped_column(Enum(DifficultyLevel), default=DifficultyLevel.MEDIUM)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    question: Mapped["Question"] = relationship(back_populates="practice_questions")


class VideoProgress(Base):
    __tablename__ = "video_progress"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    video_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False)
    watched_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual_watched_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # skip-resistant real watch time
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completion_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Resume + pause/resume tracking
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_progress")  # in_progress | paused | completed
    last_position_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)   # resume point
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserLearningProgress(Base):
    """Production-level tracking: exercise / chapter / subject completion per user."""
    __tablename__ = "user_learning_progress"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)   # 'video','exercise','chapter','subject'
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="started")  # started|in_progress|completed
    score: Mapped[float | None] = mapped_column(Float, nullable=True)        # percentage 0-100
    time_spent_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_user_entity_progress"),
    )


class Assignment(Base):
    """An admin-created assignment: a chapter or exercise a student is asked
    to complete by a due date. Completion is derived (not a separate
    submission flow) by checking UserLearningProgress for the same
    (entity_type, entity_id) on the assignee — the same completion signal
    every other progress view in this platform already trusts."""
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'chapter' | 'exercise'
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    assigned_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # admin user_id
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AssignmentTarget(Base):
    """Who an assignment was given to — one row per (assignment, student).
    Kept separate from Assignment so one assignment can target many
    students (a whole class) without duplicating the assignment row."""
    __tablename__ = "assignment_targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_assignment_student"),
    )


class Bookmark(Base):
    """A user's saved-for-later video or note. Generic entity_type/entity_id
    (mirrors UserLearningProgress's pattern) so one table covers both kinds
    without a join table per content type."""
    __tablename__ = "bookmarks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'video' | 'note'
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_user_bookmark"),
    )


class CompletionCertificate(Base):
    """Issued when a user completes 100% of a chapter or subject.
    certificate_number is public-facing and used in share URLs.
    """
    __tablename__ = "completion_certificates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Unique, short, human-readable — CERT-2026-06-A3B7F2
    certificate_number: Mapped[str] = mapped_column(String(30), nullable=False, unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)   # "chapter" | "subject"
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    student_name: Mapped[str] = mapped_column(String(200), nullable=False)
    chapter_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    subject_name: Mapped[str] = mapped_column(String(200), nullable=False)
    board: Mapped[str] = mapped_column(String(50), nullable=False)
    class_num: Mapped[int] = mapped_column(Integer, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_cert_user_entity"),
    )


class InfoPage(Base):
    """Admin-editable CMS pages (About Us, Contact Us, FAQ, Privacy, Terms, Refund, footer)."""
    __tablename__ = "info_pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(60), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Flexible structured payload: FAQ items, contact fields + predefined_message, etc.
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LoginBackground(Base):
    """Admin-uploaded background images for the login screen (mobile + web).
    Up to 4 rows expected; exactly one may have is_active=True at a time.
    Image bytes live in Postgres (same convention as user_service's avatar
    upload) rather than object storage — no MinIO/S3 is actually deployed in
    this stack, and a handful of small shared images doesn't need one."""
    __tablename__ = "login_backgrounds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    image_mime: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PreviousYearPaper(Base):
    __tablename__ = "previous_year_papers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nullable = "for everyone" on that axis (no board restriction / no class
    # restriction) — same independent-optional semantics as Video/Note's
    # target_board/target_class.
    board: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)      # "CBSE", "ICSE", "HBSE"; NULL = any board
    class_num: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)     # 10, 12; NULL = any class
    subject: Mapped[str] = mapped_column(String(100), nullable=False, index=True)   # "Science", "Maths"
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)          # 2024, 2025
    exam_type: Mapped[str] = mapped_column(String(30), nullable=False, default="board_exam")  # board_exam | sample | mock
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(512), nullable=True)        # PDF download link
    thumbnail_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    tags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)                 # {"topics":["Force","Motion"]}
    videos: Mapped[dict | None] = mapped_column(JSONB, nullable=True)               # [{youtube_id, title, duration_seconds, topic}]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KnowledgeCategory(Base):
    __tablename__ = "knowledge_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str] = mapped_column(String(20), nullable=False, default="📚")     # emoji
    color: Mapped[str] = mapped_column(String(50), nullable=False, default="from-blue-400 to-blue-600")  # tailwind gradient
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    articles: Mapped[list["KnowledgeArticle"]] = relationship(back_populates="category", cascade="all, delete-orphan")


class KnowledgeArticle(Base):
    __tablename__ = "knowledge_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cover_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_trending: Mapped[bool] = mapped_column(Boolean, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    author: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # "video" | "article" — both the web and mobile clients already branch on
    # this (badge, Watch vs Read button) and on video_url/external_url below,
    # but until these columns existed every article was silently treated as
    # "article" since the field was always None — that UI path was dead code.
    content_type: Mapped[str] = mapped_column(String(20), nullable=False, default="article")
    video_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    category: Mapped["KnowledgeCategory"] = relationship(back_populates="articles")


class PypPracticeQuestion(Base):
    """Standalone MCQ practice questions for PYP paper videos, keyed by topic name."""
    __tablename__ = "pyp_practice_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(String(500), nullable=False)
    option_b: Mapped[str] = mapped_column(String(500), nullable=False)
    option_c: Mapped[str | None] = mapped_column(String(500), nullable=True)
    option_d: Mapped[str | None] = mapped_column(String(500), nullable=True)
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False)  # "A","B","C","D"
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[DifficultyLevel] = mapped_column(Enum(DifficultyLevel), default=DifficultyLevel.MEDIUM)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PypAttempt(Base):
    """One student's sitting of a previous-year paper. Board/class/subject/year
    are denormalised from the paper so a parent's history survives the paper
    being deleted from the catalog."""
    __tablename__ = "pyp_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    pyp_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    subject: Mapped[str | None] = mapped_column(String(100), nullable=True)
    board: Mapped[str | None] = mapped_column(String(50), nullable=True)
    class_num: Mapped[int | None] = mapped_column(Integer, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exam_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    questions_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    time_taken_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
