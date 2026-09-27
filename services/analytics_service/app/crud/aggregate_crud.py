import uuid
from datetime import date, timedelta

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.student_progress import StudentProgress
from app.models.weak_topic import WeakTopicAnalysis
from app.schemas.admin import AdminOverviewResponse


async def get_admin_overview(db: AsyncSession) -> AdminOverviewResponse:
    """Return aggregated platform-wide stats."""
    total_students = await db.scalar(
        select(func.count(StudentProgress.user_id.distinct()))
    )
    total_videos_watched = await db.scalar(
        select(func.sum(StudentProgress.videos_watched))
    )
    total_quizzes = await db.scalar(
        select(func.sum(StudentProgress.quizzes_completed))
    )
    return AdminOverviewResponse(
        total_active_students=total_students or 0,
        total_videos_watched=total_videos_watched or 0,
        total_quizzes_completed=total_quizzes or 0,
    )


async def get_daily_active_counts(db: AsyncSession, cutoff: date) -> dict[str, int]:
    """Return {date_str: distinct_student_count} for StudentProgress activity since `cutoff`."""
    result = await db.execute(
        select(
            cast(StudentProgress.updated_at, Date).label("day"),
            func.count(StudentProgress.user_id.distinct()).label("students"),
        )
        .where(StudentProgress.updated_at >= cutoff)
        .group_by(cast(StudentProgress.updated_at, Date))
        .order_by(cast(StudentProgress.updated_at, Date))
    )
    rows = result.all()
    return {str(r.day): r.students for r in rows}


async def get_total_tracked_students(db: AsyncSession) -> int:
    return await db.scalar(select(func.count(StudentProgress.id)))


async def get_subject_scores(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Real per-subject average quiz score, aggregated across every chapter
    row this student has for that subject. Returns subject_id (not a display
    name — analytics_service doesn't own subject metadata; the caller/frontend
    resolves the name from content_service) and only includes subjects with
    at least one recorded quiz attempt."""
    rows = (await db.execute(
        select(
            StudentProgress.subject_id,
            func.avg(StudentProgress.avg_quiz_score).label("avg_score"),
            func.sum(StudentProgress.quizzes_completed).label("quizzes"),
        )
        .where(StudentProgress.user_id == user_id, StudentProgress.quizzes_completed > 0)
        .group_by(StudentProgress.subject_id)
    )).all()
    return [
        {"subject_id": str(r.subject_id), "avg_score": round(r.avg_score, 1), "quizzes_completed": r.quizzes}
        for r in rows
    ]


async def get_engagement_stats(db: AsyncSession, trend_days: int = 7) -> dict:
    """Real DAU/WAU + activity trend from StudentProgress.updated_at — the
    timestamp genuinely advances on every real video/quiz completion event
    now that content_service/quiz_service call /progress-event (see
    record_progress_event). Session duration and true per-day watch/quiz
    COUNTS (as opposed to this cumulative-counter table) are NOT computed
    here — this platform has no session-duration tracking and StudentProgress
    stores running totals per chapter, not a daily event log, so those two
    fields are explicitly reported as unavailable rather than estimated."""
    today = date.today()
    week_ago = today - timedelta(days=6)

    dau = await db.scalar(
        select(func.count(StudentProgress.user_id.distinct()))
        .where(cast(StudentProgress.updated_at, Date) == today)
    ) or 0
    wau = await db.scalar(
        select(func.count(StudentProgress.user_id.distinct()))
        .where(cast(StudentProgress.updated_at, Date) >= week_ago)
    ) or 0

    cutoff = today - timedelta(days=trend_days - 1)
    day_map = await get_daily_active_counts(db, cutoff)
    trend = []
    for i in range(trend_days):
        d = cutoff + timedelta(days=i)
        trend.append({"date": str(d), "active_students": day_map.get(str(d), 0)})

    return {
        "daily_active_users": dau,
        "weekly_active_users": wau,
        "trend": trend,
    }


async def get_cohort_overview(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict:
    """Aggregate stats for a teacher's board+class cohort: how many of these
    students have any tracked activity, total videos/quizzes across the
    cohort, and the cohort's average quiz score (averaged per-student first,
    then across students, so one very active student can't dominate the
    average — same "average of averages" approach get_student_dashboard uses
    for a single student's own chapters)."""
    if not user_ids:
        return {
            "cohort_size": 0, "active_students": 0, "total_videos_watched": 0,
            "total_quizzes_completed": 0, "avg_quiz_score": 0.0,
        }

    rows = (
        await db.execute(
            select(StudentProgress).where(StudentProgress.user_id.in_(user_ids))
        )
    ).scalars().all()

    active_students = len({r.user_id for r in rows})
    total_videos = sum(r.videos_watched for r in rows)
    total_quizzes = sum(r.quizzes_completed for r in rows)

    per_student_avgs: dict[uuid.UUID, list[float]] = {}
    for r in rows:
        if r.quizzes_completed > 0:
            per_student_avgs.setdefault(r.user_id, []).append(r.avg_quiz_score)
    student_means = [sum(v) / len(v) for v in per_student_avgs.values()]
    avg_quiz_score = round(sum(student_means) / len(student_means), 2) if student_means else 0.0

    return {
        "cohort_size": len(user_ids),
        "active_students": active_students,
        "total_videos_watched": total_videos,
        "total_quizzes_completed": total_quizzes,
        "avg_quiz_score": avg_quiz_score,
    }


async def get_cohort_subject_scores(db: AsyncSession, user_ids: list[uuid.UUID]) -> list[dict]:
    """Per-subject cohort average score, mirroring get_subject_scores' single-
    student shape but grouped across the whole cohort instead."""
    if not user_ids:
        return []
    rows = (
        await db.execute(
            select(
                StudentProgress.subject_id,
                func.avg(StudentProgress.avg_quiz_score).label("avg_score"),
                func.sum(StudentProgress.quizzes_completed).label("quizzes"),
                func.count(StudentProgress.user_id.distinct()).label("students"),
            )
            .where(StudentProgress.user_id.in_(user_ids), StudentProgress.quizzes_completed > 0)
            .group_by(StudentProgress.subject_id)
        )
    ).all()
    return [
        {
            "subject_id": str(r.subject_id),
            "avg_score": round(float(r.avg_score or 0), 2),
            "quizzes_completed": int(r.quizzes or 0),
            "students_attempted": int(r.students or 0),
        }
        for r in rows
    ]


async def get_cohort_weak_topics(
    db: AsyncSession, user_ids: list[uuid.UUID], max_accuracy: float = 60.0, limit: int = 10
) -> list[dict]:
    """Topics most commonly weak across the cohort — ranked by how many
    distinct students are struggling with each topic, not by any one
    student's accuracy, since a teacher cares about "how many of my
    students need help with X" more than any individual's number."""
    if not user_ids:
        return []
    rows = (
        await db.execute(
            select(
                WeakTopicAnalysis.topic_id,
                func.count(WeakTopicAnalysis.user_id.distinct()).label("students_struggling"),
                func.avg(WeakTopicAnalysis.accuracy).label("avg_accuracy"),
            )
            .where(
                WeakTopicAnalysis.user_id.in_(user_ids),
                WeakTopicAnalysis.accuracy < max_accuracy,
            )
            .group_by(WeakTopicAnalysis.topic_id)
            .order_by(func.count(WeakTopicAnalysis.user_id.distinct()).desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "topic_id": str(r.topic_id),
            "students_struggling": int(r.students_struggling or 0),
            "avg_accuracy": round(float(r.avg_accuracy or 0), 2),
        }
        for r in rows
    ]
