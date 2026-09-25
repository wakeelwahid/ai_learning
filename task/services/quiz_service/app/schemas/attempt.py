import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class StartAttemptRequest(BaseModel):
    quiz_id: uuid.UUID
    # NOTE: user_id is intentionally NOT accepted here — the attempt owner is
    # always derived from the caller's JWT (see routes/attempts.py::start_attempt)
    # to prevent creating attempts on behalf of another user (IDOR).


class SubmitAnswerRequest(BaseModel):
    attempt_id:  uuid.UUID
    question_id: uuid.UUID
    user_answer: str


class SubmitQuizRequest(BaseModel):
    attempt_id: uuid.UUID
    # NOTE: accepted for backward compatibility but NOT trusted — the route
    # verifies attempt ownership using the caller's JWT id instead (IDOR fix).
    user_id:    uuid.UUID | None = None


class BatchSubmitRequest(BaseModel):
    """Redis-first batch submission: all answers in one call."""
    attempt_id: uuid.UUID
    # NOTE: accepted for backward compatibility but NOT trusted — the route
    # always uses the caller's JWT id and verifies attempt ownership against
    # it instead (IDOR fix).
    user_id:    uuid.UUID
    # No quiz has anywhere near 500 questions, and no legitimate answer
    # (including subjective free-text) needs more than a couple thousand
    # characters — a 2001-entry map with a 10,000-char answer was accepted
    # with no complaint before this, an unbounded storage-bloat vector.
    answers:    dict[str, str] = Field(
        description="Map of question_id (str) → student_answer",
        max_length=500,
    )

    @field_validator("answers")
    @classmethod
    def _validate_answer_lengths(cls, v: dict[str, str]) -> dict[str, str]:
        for qid, ans in v.items():
            if len(ans) > 5000:
                raise ValueError(f"answer for {qid} exceeds 5000 characters")
        return v

    class_num:  int | None = Field(
        default=None,
        description="Used to update leaderboard:classN sorted set"
    )


class AttemptResponse(BaseModel):
    id:                 uuid.UUID
    quiz_id:            uuid.UUID
    user_id:            uuid.UUID
    status:             str
    score:              float
    total_marks:        int
    percentage:         float
    passed:             bool = False
    answered_count:     int = 0
    unanswered_count:   int = 0
    weak_topics:        list[str] = []
    time_taken_seconds: int | None
    started_at:         datetime
    completed_at:       datetime | None
    model_config = {"from_attributes": True, "populate_by_name": True}


class BatchSubmitResponse(BaseModel):
    attempt_id:      uuid.UUID
    score:           float
    total_marks:     int
    percentage:      float
    correct_count:   int
    wrong_count:     int
    skipped_count:   int
    weak_topics:     list[str]
    time_taken_seconds: int | None


class StudentAttemptItem(BaseModel):
    """One completed attempt, with its quiz's subject/chapter labels."""
    attempt_id:   uuid.UUID
    quiz_id:      uuid.UUID
    quiz_title:   str | None
    subject_name: str | None
    chapter_name: str | None
    quiz_type:    str | None
    board:        str | None
    class_num:    int | None
    score:        float
    total_marks:  int
    percentage:   float
    time_taken_seconds: int | None
    completed_at: datetime | None
    correct_count: int
    wrong_count:   int


class StudentSubjectStats(BaseModel):
    subject_name:    str
    attempts:        int
    avg_percentage:  float
    best_percentage: float
    worst_percentage: float


class StudentAttemptTotals(BaseModel):
    attempts:           int
    avg_percentage:     float
    total_time_seconds: int
    first_attempt_at:   datetime | None
    last_attempt_at:    datetime | None


class StudentAttemptsResponse(BaseModel):
    """Payload of the internal /internal/student/{user_id}/attempts route —
    consumed by ai_service's parent RAG indexer."""
    user_id:    uuid.UUID
    attempts:   list[StudentAttemptItem]
    by_subject: list[StudentSubjectStats]
    totals:     StudentAttemptTotals
