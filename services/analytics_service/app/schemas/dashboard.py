from typing import List

from pydantic import BaseModel, Field

from app.schemas.activity import ActivityDayResponse
from app.schemas.weak_topic import WeakTopicItem


class DashboardResponse(BaseModel):
    total_videos_watched: int
    total_quizzes_completed: int
    avg_quiz_score: float
    chapters_in_progress: int
    weak_topics: List[WeakTopicItem]


class RevisionResponse(BaseModel):
    weak_topics: List[WeakTopicItem]
    total_videos_watched: int
    total_quizzes_completed: int
    saved_videos: List[str] = Field(default_factory=list)
    bookmarked_questions: List[str] = Field(default_factory=list)
    saved_notes: List[str] = Field(default_factory=list)


class SubjectScoreItem(BaseModel):
    subject_id: str
    avg_score: float
    quizzes_completed: int


class ChildSummaryItem(BaseModel):
    """One row of the parent's multi-child rollup — deliberately lighter
    than ParentStudentSummaryResponse (no monthly trends, no AI insights, no
    exam readiness): this view is a side-by-side comparison across children,
    not a per-child deep-dive (that's what clicking into one child's own
    summary is for)."""
    student_id: str
    total_videos_watched: int
    total_quizzes_completed: int
    avg_quiz_score: float
    attendance: float
    weak_topic_count: int


class ChildrenSummaryResponse(BaseModel):
    days: int
    children: List[ChildSummaryItem]


class CohortSubjectScoreItem(BaseModel):
    subject_id: str
    avg_score: float
    quizzes_completed: int
    students_attempted: int


class CohortWeakTopicItem(BaseModel):
    topic_id: str
    students_struggling: int
    avg_accuracy: float


class TeacherCohortResponse(BaseModel):
    """Aggregate view for a teacher's board+class cohort — there is no
    teacher-student roster in this platform, so "cohort" means every
    student profile set to this exact board & class (see user_service's
    internal /students-by-curriculum). No individual student is
    identifiable from this response; it is all cohort-level counts and
    averages."""
    board: str
    class_number: int
    cohort_size: int
    active_students: int
    total_videos_watched: int
    total_quizzes_completed: int
    avg_quiz_score: float
    subjects: List[CohortSubjectScoreItem]
    weak_topics: List[CohortWeakTopicItem]


class StudentProgressResponse(BaseModel):
    user_id: str
    total_videos_watched: int
    total_quizzes_completed: int
    avg_quiz_score: float
    subjects: List[SubjectScoreItem]
    weak_topics: List[WeakTopicItem]


class StudentFullResponse(BaseModel):
    """Everything analytics_service knows about one student, in one call —
    for ai_service's parent-RAG indexer. Each field is the verbatim payload
    of an existing route, so callers see exactly the same shapes."""

    user_id: str
    dashboard: DashboardResponse
    activity_range: List[ActivityDayResponse]
    weak_topics: List[WeakTopicItem]
    progress: StudentProgressResponse


class WeeklySummaryResponse(BaseModel):
    videos_watched: int
    quizzes_completed: int
    avg_score: float
    total_xp: int | None
    xp_earned: int | None = Field(description="Deprecated alias for total_xp — kept for existing callers")
    level: int | None
    rank: int | None
    streak: int | None
    weak_topics: List[WeakTopicItem]


class ActivityDayItem(BaseModel):
    day: str = Field(description='Weekday label "Mon".."Sun"')
    minutes: int


class ActivityToday(BaseModel):
    videos_watched: int
    quizzes_completed: int
    study_minutes: int


class WeeklyReport(BaseModel):
    study_hours: float
    videos_watched: int
    notes_read: int = Field(default=0, description="Always 0 — the platform has no notes-read tracking.")
    quiz_score_avg: float
    rank_percentile: float | None = None


class MonthlyTrends(BaseModel):
    """Last 6 calendar months, oldest→newest; lists are index-aligned with `months`."""

    months: List[str]
    study_hours: List[float]
    quiz_scores: List[float]


class ParentStudentSummaryResponse(BaseModel):
    """Populated from daily_activity (login/study/video/quiz counters written by
    the auth/content/quiz hooks + student heartbeats), quiz_attempt_log
    (per-attempt scores) and StudentProgress (per-chapter counters).

    Field derivations, scaled to the `days` query param on
    GET /parent/student/{id}/summary (default 7, allowed 1/7/30/90/365)
    EXCEPT weak_topics, which is always all-time — WeakTopicAnalysis has no
    date column to window by, only a running per-topic counter:
    - total_videos_watched/total_quizzes_completed/avg_quiz_score: real sums
      /average over the selected window, from daily_activity + quiz_attempt_log
      (the only two tables with per-day granularity).
    - subjects: per-subject avg score over the selected window, from
      quiz_attempt_log (only attempts logged with a subject_id count — older
      attempts recorded before subject tagging existed are correctly
      excluded, not mis-attributed). Empty when nothing was logged with a
      subject_id in the window, even if StudentProgress has all-time data.
    - attendance: % of the selected window's days with logged_in or
      study_minutes>0.
    - study_hours_week: sum(study_minutes over the selected window)/60 (the
      field name is a kept API contract, not a literal "7 days" claim).
    - activity_week: the selected window's days [{day, minutes}]
      oldest→newest, capped at 31 points.
    - activity_today: today's counters.
    - weekly_report.quiz_score_avg: avg of attempts in the last 7 days
      specifically (not the outer `days` filter — see the field's own name),
      else all-time avg.  notes_read is a constant 0 (no notes tracking exists).
    - rank_percentile: rank/total*100 from the class leaderboard ("top X%").
    - monthly_trends: last 6 months; a month with no attempts repeats the
      all-time avg.
    - exam_readiness: {subject_name: score} with
      score = round(0.6*avg_quiz_score + 0.4*chapter_completion_pct). The
      avg_quiz_score half is windowed (from `subjects` above); the
      chapter_completion_pct half is always all-time — StudentProgress's
      completion_percentage is a lifetime "how much of this chapter is
      done" figure, not a per-period metric, so it can't be windowed and
      isn't meant to be. Falls back to avg_quiz_score when no completion
      data exists. Null (with a reason) when `subjects` is empty for the
      selected window. Keyed by subject_id when the name cannot be resolved
      from content_service.
    - ai_insights: rule-based plain-English strings (no LLM).
    Anything still null has its reason in insufficient_data_fields."""

    total_videos_watched: int
    total_quizzes_completed: int
    avg_quiz_score: float
    subjects: List[SubjectScoreItem]
    weak_topics: List[WeakTopicItem]

    overall_performance: float | None = None
    attendance: float | None = None
    study_hours_week: float | None = None
    rank_percentile: float | None = None
    activity_week: List[ActivityDayItem] | None = None
    activity_today: ActivityToday | None = None
    weekly_report: WeeklyReport | None = None
    monthly_trends: MonthlyTrends | None = None
    ai_insights: List[str] | None = None
    exam_readiness: dict[str, int] | None = None
    insufficient_data_fields: dict[str, str]
    removed_fields_note: str = Field(
        default="achievements/notifications previously returned here were entirely "
        "hardcoded fake data and have been removed rather than kept as placeholders.",
        alias="_removed_fields_note",
    )

    model_config = {"populate_by_name": True}
