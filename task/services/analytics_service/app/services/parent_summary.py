"""Builds the computed section of ParentStudentSummaryResponse from
daily_activity, quiz_attempt_log and StudentProgress, plus three best-effort
internal lookups (user profile → class, quiz leaderboard rank, subject names).
Every lookup fails soft: the field it feeds becomes null with a reason."""
import asyncio
import uuid
from datetime import date, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import activity_crud
from app.models.student_progress import StudentProgress
from app.schemas.dashboard import (
    ActivityDayItem,
    ActivityToday,
    DashboardResponse,
    MonthlyTrends,
    WeeklyReport,
)

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

REASON_RANK = "Student is not on any class leaderboard yet (no scored quiz attempts), so no rank percentile can be computed."
REASON_EXAM = "No quiz attempts with a recorded subject in the selected window, so exam readiness cannot be scored."
REASON_OVERALL = "No single 'overall score' metric is computed anywhere — would need a defined weighting across subjects/quizzes/videos."


async def _get_json(url: str, params: dict | None = None) -> dict | list | None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                url, params=params, headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


async def fetch_profile(student_id: uuid.UUID) -> dict:
    data = await _get_json(f"{settings.USER_SERVICE_URL}/api/v1/users/internal/profile/{student_id}")
    return data if isinstance(data, dict) else {}


async def fetch_rank(student_id: uuid.UUID, class_num: int | None) -> dict:
    params = {"class_num": class_num} if class_num else None
    data = await _get_json(
        f"{settings.QUIZ_SERVICE_URL}/api/v1/quizzes/internal/leaderboard-rank/{student_id}", params
    )
    return data if isinstance(data, dict) else {}


async def fetch_subject_names(board: str | None, class_num: int | None, subject_ids: list[str]) -> dict[str, str]:
    params: dict = {}
    if board and class_num:
        params.update({"board": board, "class_num": class_num})
    if subject_ids:
        params["ids"] = ",".join(subject_ids)
    if not params:
        return {}
    data = await _get_json(f"{settings.CONTENT_SERVICE_URL}/api/v1/content/internal/subjects-for", params)
    if not isinstance(data, list):
        return {}
    return {str(r.get("id")): r.get("name") for r in data if r.get("id") and r.get("name")}


async def subject_completion(db: AsyncSession, student_id: uuid.UUID) -> dict[str, float]:
    """Mean chapter completion per subject, over chapters that have any
    content-progress signal (rows created only by quiz events sit at 0 and
    would otherwise drag the mean down)."""
    rows = (await db.execute(
        select(StudentProgress.subject_id, func.avg(StudentProgress.completion_percentage))
        .where(StudentProgress.user_id == student_id, StudentProgress.completion_percentage > 0)
        .group_by(StudentProgress.subject_id)
    )).all()
    return {str(sid): float(avg) for sid, avg in rows}


def _month_starts(today: date, n: int = 6) -> list[date]:
    y, m = today.year, today.month
    starts: list[date] = []
    for _ in range(n):
        starts.append(date(y, m, 1))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(starts))


def _inactive_streak(by_day: dict[date, activity_crud.DailyActivity], today: date, window: int) -> int:
    streak = 0
    for i in range(window):
        d = today - timedelta(days=i)
        row = by_day.get(d)
        if row and (row.logged_in or row.study_minutes > 0 or row.videos_watched > 0 or row.quizzes_completed > 0):
            break
        streak += 1
    return streak


def _insights(
    *,
    subjects: list[dict],
    names: dict[str, str],
    by_day: dict,
    today: date,
    this_week_min: int,
    prev_week_min: int,
    videos_week: int,
    quizzes_week: int,
    avg7: float | None,
    all_time_avg: float,
    attendance: float,
    total_quizzes: int,
) -> list[str]:
    out: list[str] = []
    label = lambda sid: names[sid]  # noqa: E731
    named = [s for s in subjects if s["subject_id"] in names]

    if len(named) >= 2:
        weakest = min(named, key=lambda s: s["avg_score"])
        strongest = max(named, key=lambda s: s["avg_score"])
        if weakest["avg_score"] < 60:
            out.append(f"{label(weakest['subject_id'])} is the weakest subject at {weakest['avg_score']:.0f}% — extra revision there will pay off most.")
        if strongest["avg_score"] >= 70 and strongest is not weakest:
            out.append(f"Strongest in {label(strongest['subject_id'])} with a {strongest['avg_score']:.0f}% quiz average.")

    streak = _inactive_streak(by_day, today, 30)
    if streak >= 3:
        out.append(f"No study activity for the last {streak} days — a short daily session helps keep the habit.")

    if prev_week_min > 0:
        change = (this_week_min - prev_week_min) / prev_week_min * 100
        if abs(change) >= 10:
            direction = "up" if change > 0 else "down"
            out.append(f"Study time is {direction} {abs(change):.0f}% compared with last week ({this_week_min} vs {prev_week_min} min).")
    elif this_week_min > 0:
        out.append(f"Studied {this_week_min} minutes this week after no logged time the week before.")

    if videos_week > 0 and quizzes_week == 0:
        out.append(f"Watched {videos_week} video(s) this week but attempted no quizzes — a quick quiz would check understanding.")
    elif quizzes_week > 0 and videos_week == 0:
        out.append(f"Completed {quizzes_week} quiz(zes) this week without watching any videos — lessons may help with weak topics.")

    if avg7 is not None and abs(avg7 - all_time_avg) >= 5:
        direction = "above" if avg7 > all_time_avg else "below"
        out.append(f"Recent quiz scores ({avg7:.0f}%) are {direction} the all-time average ({all_time_avg:.0f}%).")

    if len(out) < 2:
        out.append(f"Completed {total_quizzes} quiz(zes) so far with an average score of {all_time_avg:.0f}%.")
    if len(out) < 2:
        out.append(f"Active on {attendance:.0f}% of the last 30 days.")
    return out[:4]


async def build_parent_summary(
    db: AsyncSession,
    student_id: uuid.UUID,
    dashboard: DashboardResponse,
    subjects: list[dict],
    days: int = 30,
) -> tuple[dict, dict[str, str]]:
    """Returns (computed_fields, reasons_for_fields_still_null).

    `days` drives the attendance/activity window (7/30/90 — see
    ALLOWED_SUMMARY_DAYS in routes/parent.py). The 6-month trend chart
    (`monthly_trends`) is intentionally independent of it — a "last 7 days"
    filter narrows the daily activity view, not the long-range trend."""
    today = activity_crud.today_utc()
    month_starts = _month_starts(today)
    span_days = max((today - month_starts[0]).days + 1, days)

    profile = await fetch_profile(student_id)
    class_num = profile.get("class_number")
    board = profile.get("board")
    subject_ids = [s["subject_id"] for s in subjects]

    # Only the HTTP lookups run concurrently — one AsyncSession must not serve
    # overlapping queries.
    rank_data, names = await asyncio.gather(
        fetch_rank(student_id, class_num),
        fetch_subject_names(board, class_num, subject_ids),
    )
    rows = await activity_crud.get_range(db, student_id, span_days)
    completion = await subject_completion(db, student_id)
    by_day = {r.day: r for r in rows}

    def day_rows(n: int, end: date):
        return [by_day.get(end - timedelta(days=i)) for i in range(n - 1, -1, -1)]

    window = day_rows(days, today)
    active_days = sum(1 for r in window if r and (r.logged_in or r.study_minutes > 0))
    attendance = round(active_days / days * 100, 1)

    # "Period" = the selected filter window (7/30/90 days), scaling every
    # figure below to it instead of a hardcoded 7 days — a parent picking
    # "Last 30 days" should see 30 days of activity/insights, not a week's
    # worth silently clipped. The line-chart day list is capped at 31 points
    # (activity_week's name is kept for API compatibility; it now means
    # "activity over the selected period", not literally one week) so a
    # 90-day selection doesn't try to render 90 individual points — the
    # frontend already groups by week past that many, but the model here
    # just returns daily granularity up to 31 and lets the caller choose.
    period_minutes = [r.study_minutes if r else 0 for r in window]
    this_period_min = sum(period_minutes)
    prev_period_min = sum(r.study_minutes for r in day_rows(days, today - timedelta(days=days)) if r)
    videos_period = sum(r.videos_watched for r in window if r)
    quizzes_period = sum(r.quizzes_completed for r in window if r)
    study_hours_period = round(this_period_min / 60, 1)
    chart_days = min(days, 31)
    chart_window = window[-chart_days:]
    activity_week = [
        ActivityDayItem(
            day=WEEKDAYS[(today - timedelta(days=chart_days - 1 - i)).weekday()],
            minutes=(r.study_minutes if r else 0),
        )
        for i, r in enumerate(chart_window)
    ]
    # Kept for the _insights() call below, which still reasons in "this
    # week vs last week" terms regardless of the filter window.
    this_week_min = sum(period_minutes[-7:])
    prev_week_min = sum(r.study_minutes for r in day_rows(7, today - timedelta(days=7)) if r)
    videos_week = sum(r.videos_watched for r in window[-7:] if r)
    quizzes_week = sum(r.quizzes_completed for r in window[-7:] if r)

    today_row = by_day.get(today)
    activity_today = ActivityToday(
        videos_watched=today_row.videos_watched if today_row else 0,
        quizzes_completed=today_row.quizzes_completed if today_row else 0,
        study_minutes=today_row.study_minutes if today_row else 0,
    )

    all_time_avg = round(float(dashboard.avg_quiz_score), 1)
    avg7_raw = await activity_crud.quiz_avg_since(db, student_id, today - timedelta(days=6))
    avg7 = round(float(avg7_raw), 1) if avg7_raw is not None else None
    quiz_score_avg = avg7 if avg7 is not None else all_time_avg

    rank_percentile = None
    if rank_data.get("rank") and rank_data.get("total"):
        rank_percentile = round(rank_data["rank"] / rank_data["total"] * 100, 1)

    weekly_report = WeeklyReport(
        study_hours=study_hours_period,
        videos_watched=videos_period,
        notes_read=0,
        quiz_score_avg=quiz_score_avg,
        rank_percentile=rank_percentile,
    )

    monthly_quiz = await activity_crud.quiz_monthly_avgs(db, student_id, month_starts[0])
    minutes_by_month: dict[str, int] = {}
    for r in rows:
        key = r.day.strftime("%Y-%m")
        minutes_by_month[key] = minutes_by_month.get(key, 0) + r.study_minutes
    monthly_trends = MonthlyTrends(
        months=[MONTHS[d.month - 1] for d in month_starts],
        study_hours=[round(minutes_by_month.get(d.strftime("%Y-%m"), 0) / 60, 1) for d in month_starts],
        quiz_scores=[round(monthly_quiz.get(d.strftime("%Y-%m"), all_time_avg), 1) for d in month_starts],
    )

    exam_readiness: dict[str, int] | None = None
    if subjects:
        exam_readiness = {}
        for s in subjects:
            sid = s["subject_id"]
            # A subject_id with quiz history but no content row is stale data
            # from a different curriculum context — showing a parent a raw
            # UUID as a "subject" is worse than omitting the row.
            key = names.get(sid)
            if not key:
                continue
            avg = float(s["avg_score"])
            completion_pct = completion.get(sid, avg)
            if key in exam_readiness:
                key = f"{key} ({sid[:8]})"
            exam_readiness[key] = int(round(0.6 * avg + 0.4 * completion_pct))
        if not exam_readiness:
            exam_readiness = None

    ai_insights = _insights(
        subjects=subjects, names=names, by_day=by_day, today=today,
        this_week_min=this_week_min, prev_week_min=prev_week_min,
        videos_week=videos_week, quizzes_week=quizzes_week,
        avg7=avg7, all_time_avg=all_time_avg, attendance=attendance,
        total_quizzes=dashboard.total_quizzes_completed,
    )

    reasons = {"overall_performance": REASON_OVERALL}
    if rank_percentile is None:
        reasons["rank_percentile"] = REASON_RANK
    if exam_readiness is None:
        reasons["exam_readiness"] = REASON_EXAM

    return {
        "attendance": attendance,
        "study_hours_week": study_hours_period,
        "rank_percentile": rank_percentile,
        "activity_week": activity_week,
        "activity_today": activity_today,
        "weekly_report": weekly_report,
        "monthly_trends": monthly_trends,
        "ai_insights": ai_insights,
        "exam_readiness": exam_readiness,
    }, reasons
