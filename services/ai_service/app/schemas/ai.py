import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Query / Chat ──────────────────────────────────────────────────────────────

class StudyQueryRequest(BaseModel):
    query:      str = Field(min_length=1, max_length=2000)
    chapter_id: uuid.UUID | None = None
    subject_id: uuid.UUID | None = None
    user_id:    uuid.UUID | None = None
    # New filter-aware fields for school_subjects collection
    board:      str | None = Field(default=None, max_length=50)
    class_num:  int | None = Field(default=None, ge=1, le=12)
    subject:    str | None = Field(default=None, max_length=100)
    chapter:    str | None = Field(default=None, max_length=200)


class GeneralQueryRequest(BaseModel):
    query:   str = Field(min_length=1, max_length=2000)
    # Required when the caller is a parent: the APPROVED linked child the
    # question is about (verified against user_service). Ignored otherwise.
    student_id: uuid.UUID | None = None
    # Bounded so a client can't send an unbounded conversation history into
    # every LLM call (cost/resource abuse) — items stay plain dicts since the
    # service only ever does dict.get("role")/dict.get("content") on them.
    history: list[dict] | None = Field(default=None, max_length=50)


class ParentChatRequest(BaseModel):
    """A parent asking about one of their approved linked children.

    The parent is always the authenticated caller — there is deliberately no
    parent_id field, so a caller cannot ask on another parent's behalf.
    """
    query:      str = Field(min_length=1, max_length=2000)
    student_id: uuid.UUID
    history:    list[dict] | None = Field(default=None, max_length=50)


class ParentChatResponse(BaseModel):
    answer:     str
    mode:       str = "parent"
    from_cache: bool = False
    llm:        str | None = None
    # The fact cards the answer drew on, so the UI can show its working.
    sources:    list[dict] = Field(default_factory=list)
    # The authoritative numbers the model was given, for the UI to render.
    stats_used: dict = Field(default_factory=dict)


class AIResponse(BaseModel):
    answer:     str
    sources:    list[dict] | None = None
    from_cache: bool = False
    mode:       str
    llm:        str | None = None


class IngestChunk(BaseModel):
    """
    One chunk pushed to Qdrant via POST /ai/ingest or /ai/ingest/content.

    `text` is required — RAGService.ingest_content previously did a bare
    `c["text"]` lookup that would raise an unhandled KeyError (→ raw 500) for
    a malformed chunk. Other metadata keys (board/subject/chapter/topic/...)
    vary by ingestion source and are stored as opaque Qdrant payload, so extra
    fields are tolerated rather than whitelisted.
    """
    model_config = {"extra": "allow"}

    text: str = Field(min_length=1, max_length=20_000)


class IngestRequest(BaseModel):
    chunks: list[IngestChunk] = Field(min_length=1, max_length=2000)


class IngestResponse(BaseModel):
    ingested: int
    message:  str


# ── AI Content Upload (existing) ──────────────────────────────────────────────

class ContentUploadRequest(BaseModel):
    chapter_id:    uuid.UUID
    title:         str = Field(min_length=1, max_length=255)
    content:       str = Field(min_length=10, max_length=200_000)
    ingest_qdrant: bool = True
    difficulty: Literal["easy", "medium", "hard", "mixed"] | None = "medium"


class ContentUploadResponse(BaseModel):
    id:             str
    chapter_id:     str
    title:          str
    content_type:   str
    chunks_indexed: int | None = None
    message:        str


# ── Ingestion Jobs ─────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    id:            uuid.UUID
    file_name:     str
    file_url:      str
    file_type:     str
    content_type:  str | None = "syllabus"
    collection:    str | None = "school_subjects"
    board:         str | None
    class_num:     int | None
    subject:       str | None
    chapter:       str | None
    topic:         str | None
    status:        str
    chunks_indexed: int | None = None
    error_message: str | None = None
    created_at:    datetime
    model_config = {"from_attributes": True}


class JobStartRequest(BaseModel):
    worker_id: str = Field(default="local_worker", min_length=1, max_length=100)


class JobCompleteRequest(BaseModel):
    chunks_indexed: int = Field(ge=0, le=1_000_000)


class JobFailRequest(BaseModel):
    # crud.fail_job already truncates to 2000 chars before persisting —
    # enforce the same bound at the API boundary instead of silently
    # truncating a much larger payload after it's crossed the wire.
    error_message: str = Field(min_length=1, max_length=2000)


class JobListResponse(BaseModel):
    jobs:  list[JobResponse]
    total: int


# ── Qdrant Batch Upsert (worker → live server) ────────────────────────────────

class QdrantChunk(BaseModel):
    text:       str = Field(min_length=1, max_length=20_000)
    board:      str | None = Field(default=None, max_length=50)
    class_num:  int | None = Field(default=None, ge=1, le=12)
    subject:    str | None = Field(default=None, max_length=100)
    chapter:    str | None = Field(default=None, max_length=200)
    topic:      str | None = Field(default=None, max_length=200)
    job_id:     uuid.UUID | None = None
    # Pre-computed embedding from Ollama (mxbai-embed-large = 1024 dims;
    # bounded generously above common embedding-model dimensions to stop a
    # client from sending an absurdly long fake "vector").
    embedding:  list[float] = Field(min_length=1, max_length=4096)


class QdrantUpsertRequest(BaseModel):
    chunks:     list[QdrantChunk] = Field(min_length=1, max_length=5000)
    collection: str = Field(default="school_subjects", max_length=100)


class QdrantUpsertResponse(BaseModel):
    upserted: int
    collection: str


# ── Learning Loop: Mistake Analysis ──────────────────────────────────────────

class MistakeItem(BaseModel):
    question:       str = Field(min_length=1, max_length=3000)
    user_answer:    str = Field(max_length=3000)
    correct_answer: str = Field(min_length=1, max_length=3000)
    topic:          str | None = Field(default=None, max_length=200)
    subject:        str | None = Field(default=None, max_length=100)


class MistakeAnalysisRequest(BaseModel):
    mistakes:  list[MistakeItem] = Field(min_length=1, max_length=100)
    board:     str | None = Field(default=None, max_length=50)
    class_num: int | None = Field(default=None, ge=1, le=12)


class MistakeExplanation(BaseModel):
    question:       str
    correct_answer: str
    explanation:    str
    tip:            str
    concept:        str


class MistakeAnalysisResponse(BaseModel):
    explanations: list[MistakeExplanation]
    weak_topics:  list[str]


# ── Learning Loop: Flashcards / Revision Plan ─────────────────────────────────

class FlashcardsRequest(BaseModel):
    topic:     str = Field(min_length=1, max_length=200)
    subject:   str | None = Field(default=None, max_length=100)
    chapter:   str | None = Field(default=None, max_length=200)
    board:     str | None = Field(default=None, max_length=50)
    class_num: int | None = Field(default=None, ge=1, le=12)
    count:     int = Field(default=5, ge=1, le=20)


class RevisionPlanRequest(BaseModel):
    # Items are either a plain topic string or a {"topic": ..., "subject": ...,
    # "accuracy": ...} dict — kept as dict|str (not a strict nested model) since
    # the handler branches on `isinstance(t, dict)` and both shapes are real
    # client inputs; only the list length/field lengths are bounded here.
    weak_topics: list[dict | str] = Field(default_factory=list, max_length=50)
    board:       str | None = Field(default=None, max_length=50)
    class_num:   int | None = Field(default=None, ge=1, le=12)
    days:        int = Field(default=7, ge=1, le=30)


# ── Generated Papers ──────────────────────────────────────────────────────────

class PaperGenerateRequest(BaseModel):
    paper_type:  Literal["quiz_paper", "revision_paper", "practice_paper", "mock_test", "custom"] = "quiz_paper"
    board:       str | None = Field(default=None, max_length=50)
    class_num:   int | None = Field(default=None, ge=1, le=12)
    subject:     str | None = Field(default=None, max_length=100)
    chapter:     str | None = Field(default=None, max_length=200)
    topic:       str | None = Field(default=None, max_length=200)
    difficulty:  Literal["easy", "medium", "hard", "mixed"] = "medium"
    # Admin UI clamps this to 25-50 depending on generator; bounded server-side
    # too so "generate N questions" can't be used as an LLM-cost/DoS vector.
    count:       int = Field(default=10, ge=1, le=50)
    title:       str | None = Field(default=None, max_length=300)


class PaperQuestionContent(BaseModel):
    """
    One question inside content.sections[].questions[] of a generated paper.

    This is LLM (Ollama) output, not a rigid internal contract — every field
    is optional and unknown keys are tolerated (extra="allow") so validation
    catches genuinely malformed payloads (e.g. a question that isn't an
    object) without rejecting minor shape drift between quiz/revision papers.
    """
    model_config = {"extra": "allow"}

    q_no:           int | None = None
    question:       str | None = Field(default=None, max_length=3000)
    text:           str | None = Field(default=None, max_length=3000)
    options:        list[str] | None = Field(default=None, max_length=20)
    answer:         str | None = Field(default=None, max_length=3000)
    correct_option: str | None = Field(default=None, max_length=10)
    explanation:    str | None = Field(default=None, max_length=3000)


class PaperSectionContent(BaseModel):
    model_config = {"extra": "allow"}

    section_name:       str | None = Field(default=None, max_length=200)
    marks_per_question: float | None = None
    questions:          list[PaperQuestionContent] = Field(default_factory=list, max_length=200)


class PaperContent(BaseModel):
    model_config = {"extra": "allow"}

    sections: list[PaperSectionContent] = Field(default_factory=list, max_length=50)


class PaperCreate(BaseModel):
    paper_type:   Literal["quiz_paper", "revision_paper", "practice_paper", "mock_test"]
    board:        str | None = Field(default=None, max_length=50)
    class_num:    int | None = Field(default=None, ge=1, le=12)
    subject:      str | None = Field(default=None, max_length=100)
    chapter:      str | None = Field(default=None, max_length=200)
    topic:        str | None = Field(default=None, max_length=200)
    title:        str = Field(min_length=1, max_length=300)
    difficulty:   Literal["easy", "medium", "hard", "mixed"] | None = "medium"
    total_marks:  int | None = Field(default=None, ge=0, le=1000)
    duration_min: int | None = Field(default=None, ge=0, le=600)
    content:      PaperContent          # full structured JSON from Ollama
    generated_by: str = Field(default="ollama_local", max_length=50)
    source_job_id: uuid.UUID | None = None


class PaperBulkCreate(BaseModel):
    papers: list[PaperCreate] = Field(min_length=1, max_length=100)


class PaperResponse(BaseModel):
    id:           uuid.UUID
    paper_type:   str
    board:        str | None
    class_num:    int | None
    subject:      str | None
    chapter:      str | None
    topic:        str | None
    title:        str
    difficulty:   str | None
    total_marks:  int | None
    duration_min: int | None
    content:      dict
    generated_by: str
    status:       str
    verified:     bool = False
    created_at:   datetime | None = None
    model_config = {"from_attributes": True}


# ── Paper attempts ────────────────────────────────────────────────────────────

class PaperAttemptSubmit(BaseModel):
    """Submit body. No user_id — the attempt's owner is the authenticated
    caller. `score` is only honoured when the paper has no answer key."""
    answers:        dict | None = None   # {question_index: given_answer}
    score:          float | None = Field(default=None, ge=0)
    time_taken_sec: int | None = Field(default=None, ge=0)


class PaperAttemptResponse(BaseModel):
    id:             uuid.UUID
    user_id:        uuid.UUID
    paper_id:       uuid.UUID
    paper_type:     str | None
    subject:        str | None
    chapter:        str | None
    board:          str | None
    class_num:      int | None
    total_marks:    int | None
    score:          float
    percentage:     float
    correct_count:  int
    wrong_count:    int
    time_taken_sec: int | None
    status:         str
    answers:        dict | None
    started_at:     datetime | None
    completed_at:   datetime | None
    created_at:     datetime | None
    model_config = {"from_attributes": True}
