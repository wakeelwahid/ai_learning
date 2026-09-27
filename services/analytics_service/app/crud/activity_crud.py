import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_activity import DailyActivity, QuizAttemptLog


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def activity_row_dict(row: DailyActivity | None, day: date | None = None) -> dict:
    if row is None:
        return {
            "day": str(day or today_utc()),
            "study_minutes": 0,
            "videos_watched": 0,
            "quizzes_completed": 0,
            "logged_in": False,
        }
    return {
        "day": str(row.day),
        "study_minutes": row.study_minutes,
        "videos_watched": row.videos_watched,
        "quizzes_completed": row.quizzes_completed,
        "logged_in": row.logged_in,
    }


async def upsert_increment(
    db: AsyncSession,
    user_id: uuid.UUID,
    day: date | None = None,
    study_minutes: int = 0,
    videos_watched: int = 0,
    quizzes_completed: int = 0,
    logged_in: bool = False,
) -> DailyActivity:
    day = day or today_utc()
    stmt = insert(DailyActivity).values(
        id=uuid.uuid4(),
        user_id=user_id,
        day=day,
        study_minutes=max(0, study_minutes),
        videos_watched=max(0, videos_watched),
        quizzes_completed=max(0, quizzes_completed),
        logged_in=bool(logged_in),
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_daily_activity_user_day",
        set_={
            "study_minutes": DailyActivity.study_minutes + stmt.excluded.study_minutes,
            "videos_watched": DailyActivity.videos_watched + stmt.excluded.videos_watched,
            "quizzes_completed": DailyActivity.quizzes_completed + stmt.excluded.quizzes_completed,
            "logged_in": DailyActivity.logged_in | stmt.excluded.logged_in,
            "updated_at": func.now(),
        },
    ).returning(DailyActivity)
    row = (await db.execute(stmt)).scalar_one()
    await db.commit()
    return row


async def get_day(db: AsyncSession, user_id: uuid.UUID, day: date | None = None) -> DailyActivity | None:
    day = day or today_utc()
    return (await db.execute(
        select(DailyActivity).where(DailyActivity.user_id == user_id, DailyActivity.day == day)
    )).scalar_one_or_none()


async def get_range(db: AsyncSession, user_id: uuid.UUID, days: int) -> list[DailyActivity]:
    """Rows for the last `days` days including today, oldest first. Days with
    no row are absent — callers fill zeros as needed."""
    since = today_utc() - timedelta(days=days - 1)
    return list((await db.execute(
        select(DailyActivity)
        .where(DailyActivity.user_id == user_id, DailyActivity.day >= since)
        .order_by(DailyActivity.day)
    )).scalars().all())


async def get_attendance_for_users(
    db: AsyncSession, user_ids: list[uuid.UUID], days: int,
) -> dict[uuid.UUID, float]:
    """Batched % of the last `days` days with logged_in or study_minutes>0,
    per student — backs the parent multi-child summary. A single GROUP BY
    over one query instead of one get_range() call per child."""
    if not user_ids:
        return {}
    since = today_utc() - timedelta(days=days - 1)
    rows = (await db.execute(
        select(DailyActivity.user_id, func.count())
        .where(
            DailyActivity.user_id.in_(user_ids),
            DailyActivity.day >= since,
            (DailyActivity.logged_in.is_(True)) | (DailyActivity.study_minutes > 0),
        )
        .group_by(DailyActivity.user_id)
    )).all()
    active_days = {uid: 0 for uid in user_ids}
    active_days.update({uid: n for uid, n in rows})
    return {uid: round(n / days * 100, 1) for uid, n in active_days.items()}


async def log_quiz_attempt(
    db: AsyncSession, user_id: uuid.UUID, score: float, subject_id: uuid.UUID | None
) -> None:
    db.add(QuizAttemptLog(user_id=user_id, day=today_utc(), score=score, subject_id=subject_id))


async def quiz_avg_since(db: AsyncSession, user_id: uuid.UUID, since: date) -> float | None:
    return await db.scalar(
        select(func.avg(QuizAttemptLog.score))
        .where(QuizAttemptLog.user_id == user_id, QuizAttemptLog.day >= since)
    )


async def get_windowed_subject_scores(db: AsyncSession, user_id: uuid.UUID, days: int) -> list[dict]:
    """Real per-subject average score for exactly the last `days` days, from
    quiz_attempt_log (which has subject_id + day, unlike StudentProgress's
    all-time running counters). Only attempts logged with a subject_id count
    — older/legacy attempts recorded before subject tagging existed are
    correctly excluded rather than mis-attributed. Returns [] (not an error)
    when nothing was logged in the window, same "insufficient data" contract
    as get_windowed_totals."""
    since = today_utc() - timedelta(days=days - 1)
    rows = (await db.execute(
        select(
            QuizAttemptLog.subject_id,
            func.avg(QuizAttemptLog.score).label("avg_score"),
            func.count().label("quizzes"),
        )
        .where(
            QuizAttemptLog.user_id == user_id,
            QuizAttemptLog.day >= since,
            QuizAttemptLog.subject_id.is_not(None),
        )
        .group_by(QuizAttemptLog.subject_id)
    )).all()
    return [
        {"subject_id": str(r.subject_id), "avg_score": round(float(r.avg_score), 1), "quizzes_completed": r.quizzes}
        for r in rows
    ]


async def get_windowed_totals(db: AsyncSession, user_id: uuid.UUID, days: int) -> dict:
    """Real videos/quizzes/avg-score totals for exactly the last `days` days,
    from the day-bucketed tables (daily_activity, quiz_attempt_log) — unlike
    StudentProgress's all-time running counters, these genuinely change with
    the caller's days filter. avg_quiz_score falls back to None (not 0) when
    no quiz was logged in the window, so the caller can report it as
    insufficient data rather than a fake zero."""
    since = today_utc() - timedelta(days=days - 1)
    totals = (await db.execute(
        select(
            func.coalesce(func.sum(DailyActivity.videos_watched), 0),
            func.coalesce(func.sum(DailyActivity.quizzes_completed), 0),
        )
        .where(DailyActivity.user_id == user_id, DailyActivity.day >= since)
    )).one()
    avg_score = await db.scalar(
        select(func.avg(QuizAttemptLog.score))
        .where(QuizAttemptLog.user_id == user_id, QuizAttemptLog.day >= since)
    )
    return {
        "videos_watched": int(totals[0]),
        "quizzes_completed": int(totals[1]),
        "avg_quiz_score": round(float(avg_score), 1) if avg_score is not None else None,
    }


async def get_windowed_totals_for_users(
    db: AsyncSession, user_ids: list[uuid.UUID], days: int,
) -> dict[uuid.UUID, dict]:
    """Batched form of get_windowed_totals — one GROUP BY for all requested
    users instead of one query per child, backing the parent multi-child
    summary the same way get_attendance_for_users does."""
    if not user_ids:
        return {}
    since = today_utc() - timedelta(days=days - 1)
    activity_rows = (await db.execute(
        select(
            DailyActivity.user_id,
            func.sum(DailyActivity.videos_watched),
            func.sum(DailyActivity.quizzes_completed),
        )
        .where(DailyActivity.user_id.in_(user_ids), DailyActivity.day >= since)
        .group_by(DailyActivity.user_id)
    )).all()
    score_rows = (await db.execute(
        select(QuizAttemptLog.user_id, func.avg(QuizAttemptLog.score))
        .where(QuizAttemptLog.user_id.in_(user_ids), QuizAttemptLog.day >= since)
        .group_by(QuizAttemptLog.user_id)
    )).all()
    scores = {uid: float(avg) for uid, avg in score_rows}
    result = {uid: {"videos_watched": 0, "quizzes_completed": 0, "avg_quiz_score": None} for uid in user_ids}
    for uid, videos, quizzes in activity_rows:
        result[uid]["videos_watched"] = int(videos or 0)
        result[uid]["quizzes_completed"] = int(quizzes or 0)
    for uid in user_ids:
        if uid in scores:
            result[uid]["avg_quiz_score"] = round(scores[uid], 1)
    return result


async def quiz_monthly_avgs(db: AsyncSession, user_id: uuid.UUID, since: date) -> dict[str, float]:
    """{"YYYY-MM": avg score} for months with at least one logged attempt."""
    month = func.to_char(QuizAttemptLog.day, "YYYY-MM")
    rows = (await db.execute(
        select(month.label("month"), func.avg(QuizAttemptLog.score).label("avg"))
        .where(QuizAttemptLog.user_id == user_id, QuizAttemptLog.day >= since)
        .group_by(month)
    )).all()
    return {r.month: float(r.avg) for r in rows}
