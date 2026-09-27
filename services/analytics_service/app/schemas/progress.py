import uuid

from pydantic import BaseModel, Field


class UpdateProgressRequest(BaseModel):
    """Full-state upsert for a student's chapter progress.

    The CRUD layer overwrites every counter/score field unconditionally on
    update (see progress_crud.upsert_progress), so these fields must always
    be supplied by the caller — a default of 0 would silently zero out a
    student's existing progress if the field were ever omitted.
    """

    user_id: uuid.UUID
    subject_id: uuid.UUID
    chapter_id: uuid.UUID
    videos_watched: int = Field(ge=0, le=100_000)
    quizzes_completed: int = Field(ge=0, le=100_000)
    avg_quiz_score: float = Field(ge=0, le=100)
    completion_percentage: float = Field(ge=0, le=100)


class RecordProgressEventRequest(BaseModel):
    """Partial, additive progress signal from a real platform event (a video
    completed, a quiz attempt finished). Unlike UpdateProgressRequest (a full
    state overwrite meant for a single caller that owns the whole row), this
    is safe for MULTIPLE services to call independently for the same
    (user_id, chapter_id) — content_service reports video events, quiz_service
    reports quiz events, and each only increments/sets the fields it actually
    owns. See progress_crud.record_progress_event."""

    user_id: uuid.UUID
    subject_id: uuid.UUID
    chapter_id: uuid.UUID
    video_completed: bool = False
    quiz_score: float | None = Field(default=None, ge=0, le=100)
    completion_percentage: float | None = Field(default=None, ge=0, le=100)


class ProgressResponse(BaseModel):
    queued: bool
