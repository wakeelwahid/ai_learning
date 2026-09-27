"""Fetch a student's activity from the owning services and turn it into
natural-language "fact cards" for the parent RAG index.

Each service owns its own database, so everything here comes over the
internal service-to-service API. Every fetch fails soft: one slow or broken
service degrades the answer instead of breaking the parent's chat.

The `text` of a card is what the LLM actually reads, so it is written as a
plain English sentence with the date spelled out and the comparison that
makes the number meaningful ("below his 68% average"). Bare key=value lines
embed poorly and read worse.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import httpx

from app.core.config import settings

TIMEOUT = 5.0


@dataclass
class FactCard:
    """One indexable fact about a student."""
    source_id: str          # stable dedupe key, e.g. "quiz_attempt:<uuid>"
    domain: str             # quiz | battle | gamification | analytics
    card_type: str          # event | summary_week | summary_month | profile
    text: str
    day: str                # YYYY-MM-DD
    period: str = "day"
    subject: str | None = None
    metric: dict = field(default_factory=dict)


def _fmt_date(value: str | None) -> str:
    """'2026-09-12T11:47:46Z' -> '12 Sep 2026'. Falls back to the raw value."""
    if not value:
        return "an unknown date"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%d %b %Y")
    except ValueError:
        return value


def _day_of(value: str | None) -> str:
    if not value:
        return date.today().isoformat()
    return value[:10]


def _newest_first(activity: list[dict]) -> list[dict]:
    """Sort daily-activity rows newest-first. The analytics range arrives
    oldest-first, and every caller below slices "the last N days"."""
    return sorted(activity, key=lambda d: d.get("day") or "", reverse=True)


def _within_days(activity: list[dict], days: int) -> list[dict]:
    """Rows falling inside the last `days` calendar days."""
    cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
    return [d for d in activity if (d.get("day") or "") >= cutoff]


async def _get(client: httpx.AsyncClient, url: str, params: dict | None = None) -> dict | list | None:
    try:
        resp = await client.get(
            url, params=params,
            headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


# ── fetch ─────────────────────────────────────────────────────────────────────

async def fetch_all(student_id: uuid.UUID, days: int = 90) -> dict:
    """Pull every domain concurrently. Missing domains come back as {}."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        profile, quiz, battle, gami, analytics, learning, career, referral = await asyncio.gather(
            _get(client, f"{settings.USER_SERVICE_URL}/api/v1/users/internal/profile/{student_id}"),
            _get(client, f"{settings.QUIZ_SERVICE_URL}/api/v1/quizzes/internal/student/{student_id}/attempts",
                 {"days": days, "limit": 200}),
            _get(client, f"{settings.BATTLE_SERVICE_URL}/api/v1/battles/internal/student/{student_id}/summary",
                 {"days": days, "limit": 100}),
            _get(client, f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/student/{student_id}/profile"),
            _get(client, f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/student/{student_id}/full",
                 {"days": days}),
            _get(client, f"{settings.CONTENT_SERVICE_URL}/api/v1/content/internal/student/{student_id}/learning",
                 {"days": days}),
            _get(client, f"{settings.CAREER_SERVICE_URL}/api/v1/careers/internal/student/{student_id}/profile"),
            _get(client, f"{settings.REFERRAL_SERVICE_URL}/api/v1/referrals/internal/student/{student_id}/summary"),
        )
        # Practice papers, previous-year papers and revision sessions. Split
        # from the gather above only to keep each call list readable.
        papers, pyp, revision = await asyncio.gather(
            _get(client, f"{settings.AI_SELF_URL}/api/v1/ai/internal/student/{student_id}/papers",
                 {"days": days, "limit": 50}),
            _get(client, f"{settings.CONTENT_SERVICE_URL}/api/v1/content/internal/student/{student_id}/pyp",
                 {"days": days, "limit": 50}),
            _get(client, f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/student/{student_id}/revision",
                 {"days": days, "limit": 50}),
        )
    return {
        "profile": profile or {},
        "quiz": quiz or {},
        "battle": battle or {},
        "gamification": gami or {},
        "analytics": analytics or {},
        "learning": learning or {},
        "career": career or {},
        "referral": referral or {},
        "papers": papers or {},
        "pyp": pyp or {},
        "revision": revision or {},
    }


# ── live stats (authoritative numbers) ────────────────────────────────────────

def build_stats(data: dict) -> dict:
    """The numbers the LLM is told to trust. Vector search is unreliable for
    counting, so every total/average/rank the answer quotes comes from here."""
    quiz = data.get("quiz") or {}
    battle = data.get("battle") or {}
    gami = data.get("gamification") or {}
    analytics = data.get("analytics") or {}

    totals = quiz.get("totals") or {}
    bstats = battle.get("stats") or {}
    dash = analytics.get("dashboard") or {}
    # Inactive days have no row at all, so "the last N days" must be sliced by
    # calendar date — taking the first N rows would silently reach back weeks
    # for a student who has been idle, and report an idle week as a busy one.
    activity = _newest_first(analytics.get("activity_range") or [])
    last30 = _within_days(activity, 30)
    active_days = sum(1 for d in last30 if d.get("logged_in") or d.get("study_minutes"))
    minutes30 = sum(d.get("study_minutes") or 0 for d in last30)
    minutes7 = sum(d.get("study_minutes") or 0 for d in _within_days(activity, 7))

    subjects = sorted(
        quiz.get("by_subject") or [],
        key=lambda s: s.get("avg_percentage") or 0,
    )

    return {
        "quiz_attempts": totals.get("attempts", 0),
        "quiz_average_pct": totals.get("avg_percentage"),
        "strongest_subject": subjects[-1]["subject_name"] if subjects else None,
        "strongest_subject_pct": subjects[-1]["avg_percentage"] if subjects else None,
        "weakest_subject": subjects[0]["subject_name"] if subjects else None,
        "weakest_subject_pct": subjects[0]["avg_percentage"] if subjects else None,
        # Every subject's average, so "how is he doing in X?" is answered from
        # the authoritative block instead of by eyeballing individual attempts.
        "subject_averages": {
            s["subject_name"]: s["avg_percentage"] for s in subjects if s.get("subject_name")
        },
        "battles_played": bstats.get("battles_played", 0),
        "battles_won": bstats.get("battles_won", 0),
        "total_xp": (gami.get("xp") or {}).get("total_xp", 0),
        "level": (gami.get("xp") or {}).get("level", 0),
        "current_streak_days": (gami.get("streak") or {}).get("current_streak", 0),
        "longest_streak_days": (gami.get("streak") or {}).get("longest_streak", 0),
        "badges_earned": len(gami.get("badges") or []),
        "edupoints_balance": (gami.get("edupoints") or {}).get("balance", 0),
        "study_minutes_last_7_days": minutes7,
        "study_minutes_last_30_days": minutes30,
        "active_days_last_30": active_days,
        "attendance_pct_last_30": round(active_days / 30 * 100, 1) if last30 else 0.0,
        "videos_watched_total": dash.get("total_videos_watched", 0),
        "quizzes_completed_total": dash.get("total_quizzes_completed", 0),
        **_learning_stats(data.get("learning") or {}),
        "career_goal": (data.get("career") or {}).get("primary_career"),
        **_practice_stats(data),
    }


def _practice_stats(data: dict) -> dict:
    """Practice papers, previous-year papers and revision."""
    papers = (data.get("papers") or {}).get("totals") or {}
    pyp = (data.get("pyp") or {}).get("totals") or {}
    revision = (data.get("revision") or {}).get("totals") or {}
    return {
        "papers_generated": papers.get("generated_count", 0),
        "papers_attempted": papers.get("attempts", 0),
        "papers_avg_pct": papers.get("avg_percentage"),
        "papers_best_pct": papers.get("best_percentage"),
        "pyp_attempted": pyp.get("attempts", 0),
        "pyp_avg_pct": pyp.get("avg_percentage"),
        "revision_sessions": revision.get("sessions", 0),
        "revision_completed": revision.get("completed", 0),
        "revision_minutes": revision.get("total_minutes", 0),
    }


def _learning_stats(learning: dict) -> dict:
    videos = learning.get("videos") or {}
    completion = learning.get("completion") or {}
    chapters = sum(s.get("chapters_completed") or 0 for s in completion.get("by_subject") or [])
    return {
        "videos_started": videos.get("total_watched", 0),
        "videos_completed": videos.get("completed", 0),
        "chapters_completed": chapters,
        "saved_items": len(learning.get("bookmarks") or []),
        "certificates_earned": len(learning.get("certificates") or []),
        "assignments_pending": (learning.get("assignments") or {}).get("pending", 0),
    }


def format_stats(name: str, stats: dict) -> str:
    """Render the stats block that goes into the prompt verbatim."""
    def pct(v):
        return f"{v:.0f}%" if isinstance(v, (int, float)) else "no data"

    lines = [
        f"Quizzes attempted: {stats['quiz_attempts']} (this is the ONLY quiz count; "
        f"average score {pct(stats['quiz_average_pct'])})",
        f"Strongest subject (the school subject with the HIGHEST quiz average — "
        f"this is a subject name, never a streak or habit): "
        f"{stats['strongest_subject'] or 'no data'} ({pct(stats['strongest_subject_pct'])})",
        f"Weakest subject (the school subject with the LOWEST quiz average — "
        f"this is a subject name, never a streak or habit): "
        f"{stats['weakest_subject'] or 'no data'} ({pct(stats['weakest_subject_pct'])})",
        # Spelled out as two labelled facts: "14 played, 9 won" was being read
        # back as though either number were the wins.
        f"Battles played (total): {stats['battles_played']}. "
        f"Battles WON (out of those): {stats['battles_won']}",
        f"Study time: {stats['study_minutes_last_7_days']} min in the last 7 days, "
        f"{stats['study_minutes_last_30_days']} min in the last 30",
        # Say "on this platform" explicitly: parents ask about school attendance,
        # and the model would otherwise offer this figure as if it were that.
        f"Active on this learning platform on {stats['active_days_last_30']} of the "
        f"last 30 days ({stats['attendance_pct_last_30']}% of days). This is app "
        f"usage only — the platform has no access to school attendance records",
        f"Streak: {stats['current_streak_days']} days current, "
        f"{stats['longest_streak_days']} days best",
        f"XP (experience points, NOT the same as EduPoints below): "
        f"{stats['total_xp']} (level {stats['level']}), {stats['badges_earned']} badges",
        f"EduPoints (a separate spendable balance, NOT the same as XP above): "
        f"{stats['edupoints_balance']}",
        # Deliberately NOT restating a quiz count here: analytics keeps its own
        # rollup which can disagree with quiz_service's, and giving the model
        # two different totals for one thing makes it pick either at random.
        # quiz_service is the source of truth, stated once in the line above.
        f"Videos watched: {stats['videos_watched_total']}",
        f"Lessons: {stats.get('videos_completed', 0)} finished of "
        f"{stats.get('videos_started', 0)} started; "
        f"{stats.get('chapters_completed', 0)} chapters completed",
        f"Saved items: {stats.get('saved_items', 0)}, "
        f"certificates: {stats.get('certificates_earned', 0)}, "
        f"assignments pending: {stats.get('assignments_pending', 0)}",
    ]
    lines.append(
        f"Practice papers (NOT the same as previous-year board papers below): "
        f"{stats.get('papers_attempted', 0)} attempted, "
        f"{pct(stats.get('papers_avg_pct'))} average, "
        f"best score {pct(stats.get('papers_best_pct'))}, "
        f"{stats.get('papers_generated', 0)} generated"
    )
    lines.append(
        f"Previous-year board papers: {stats.get('pyp_attempted', 0)} attempted "
        f"({pct(stats.get('pyp_avg_pct'))} average)"
    )
    lines.append(
        f"Revision: {stats.get('revision_completed', 0)} of "
        f"{stats.get('revision_sessions', 0)} sessions completed, "
        f"{stats.get('revision_minutes', 0)} minutes total"
    )
    for subject, avg in (stats.get("subject_averages") or {}).items():
        lines.append(f"{subject} quiz average: {pct(avg)}")
    if stats.get("career_goal"):
        lines.append(f"Career goal: {stats['career_goal']}")
    return f"CURRENT STATS for {name} (authoritative):\n" + "\n".join(f"- {ln}" for ln in lines)


# ── fact cards ────────────────────────────────────────────────────────────────

def _quiz_cards(name: str, quiz: dict) -> list[FactCard]:
    cards: list[FactCard] = []
    overall = (quiz.get("totals") or {}).get("avg_percentage")

    for a in (quiz.get("attempts") or [])[:80]:
        pct = a.get("percentage") or 0
        subject = a.get("subject_name") or "an unknown subject"
        chapter = f" covering {a['chapter_name']}" if a.get("chapter_name") else ""
        when = _fmt_date(a.get("completed_at"))

        compare = ""
        if isinstance(overall, (int, float)) and abs(pct - overall) >= 8:
            side = "above" if pct > overall else "below"
            compare = f", {side} their {overall:.0f}% overall average"

        correct, wrong = a.get("correct_count") or 0, a.get("wrong_count") or 0
        detail = f" They answered {correct} of {correct + wrong} questions correctly." if correct + wrong else ""
        minutes = (a.get("time_taken_seconds") or 0) // 60
        detail += f" It took {minutes} minutes." if minutes else ""

        cards.append(FactCard(
            source_id=f"quiz_attempt:{a['attempt_id']}",
            domain="quiz", card_type="event",
            text=f"On {when}, {name} scored {pct:.0f}% on a {subject} quiz{chapter}{compare}.{detail}",
            day=_day_of(a.get("completed_at")),
            subject=a.get("subject_name"),
            metric={"score": pct, "count": correct + wrong},
        ))

    for s in quiz.get("by_subject") or []:
        avg = s.get("avg_percentage") or 0
        verdict = ("a strong subject" if avg >= 75 else
                   "an area that needs work" if avg < 50 else "an average subject")
        cards.append(FactCard(
            source_id=f"quiz_subject:{s['subject_name']}",
            domain="quiz", card_type="summary_month",
            text=(f"Across {s['attempts']} {s['subject_name']} quizzes, {name} averages "
                  f"{avg:.0f}%, ranging from {s.get('worst_percentage', 0):.0f}% to "
                  f"{s.get('best_percentage', 0):.0f}%. {s['subject_name']} is {verdict} for them."),
            day=date.today().isoformat(), period="all",
            subject=s["subject_name"],
            metric={"score": avg, "count": s.get("attempts")},
        ))
    return cards


def _battle_cards(name: str, battle: dict) -> list[FactCard]:
    cards: list[FactCard] = []
    stats = battle.get("stats") or {}

    if stats.get("battles_played"):
        played, won = stats["battles_played"], stats.get("battles_won", 0)
        rate = won / played * 100 if played else 0
        cards.append(FactCard(
            source_id="battle:stats",
            domain="battle", card_type="profile",
            text=(f"{name} has played {played} quiz battles against other students and won "
                  f"{won} of them ({rate:.0f}% win rate), earning "
                  f"{stats.get('total_xp_earned', 0)} XP. Their best winning streak is "
                  f"{stats.get('best_win_streak', 0)} battles."),
            day=date.today().isoformat(), period="all",
            metric={"count": played, "accuracy": rate},
        ))

    for b in (battle.get("recent") or [])[:40]:
        outcome = "won" if b.get("won") else "did not win"
        subject = b.get("subject") or "a general"
        cards.append(FactCard(
            source_id=f"battle:{b['battle_id']}",
            domain="battle", card_type="event",
            text=(f"On {_fmt_date(b.get('ended_at'))}, {name} {outcome} a {subject} quiz battle, "
                  f"answering {b.get('correct', 0)} correct and {b.get('wrong', 0)} wrong "
                  f"({b.get('accuracy', 0):.0f}% accuracy) and finishing rank "
                  f"{b.get('rank', '-')} of {b.get('participant_count', '-')}."),
            day=_day_of(b.get("ended_at")),
            subject=b.get("subject"),
            metric={"accuracy": b.get("accuracy"), "score": b.get("score")},
        ))

    for s in battle.get("by_subject") or []:
        cards.append(FactCard(
            source_id=f"battle_subject:{s['subject']}",
            domain="battle", card_type="summary_month",
            text=(f"In {s['subject']} battles, {name} has played {s['played']} and won "
                  f"{s['won']}, averaging {s.get('avg_accuracy', 0):.0f}% accuracy."),
            day=date.today().isoformat(), period="all",
            subject=s["subject"],
            metric={"accuracy": s.get("avg_accuracy"), "count": s.get("played")},
        ))
    return cards


def _gamification_cards(name: str, gami: dict) -> list[FactCard]:
    cards: list[FactCard] = []
    xp = gami.get("xp") or {}
    streak = gami.get("streak") or {}
    points = gami.get("edupoints") or {}

    if xp.get("total_xp"):
        cards.append(FactCard(
            source_id="gamification:profile",
            domain="gamification", card_type="profile",
            text=(f"{name} has earned {xp['total_xp']} XP and reached level "
                  f"{xp.get('level', 1)}, with {points.get('balance', 0)} EduPoints available "
                  f"to spend."),
            day=date.today().isoformat(), period="all",
            metric={"count": xp["total_xp"]},
        ))

    if streak.get("longest_streak"):
        current = streak.get("current_streak", 0)
        state = (f"They are on a {current}-day streak right now"
                 if current else "They are not on a streak right now")
        cards.append(FactCard(
            source_id="gamification:streak",
            domain="gamification", card_type="profile",
            text=(f"{state}. {name}'s longest study streak is "
                  f"{streak['longest_streak']} days, and they were last active on "
                  f"{_fmt_date(streak.get('last_activity_date'))}."),
            day=date.today().isoformat(), period="all",
            metric={"count": current},
        ))

    badges = gami.get("badges") or []
    if badges:
        names = ", ".join(b["badge_type"].replace("_", " ").title() for b in badges[:10])
        cards.append(FactCard(
            source_id="gamification:badges",
            domain="gamification", card_type="profile",
            text=f"{name} has earned {len(badges)} badges: {names}.",
            day=date.today().isoformat(), period="all",
            metric={"count": len(badges)},
        ))

    goals = [g for g in (gami.get("daily_goals_recent") or []) if g.get("completed")]
    if gami.get("daily_goals_recent"):
        total = len(gami["daily_goals_recent"])
        cards.append(FactCard(
            source_id="gamification:goals",
            domain="gamification", card_type="summary_week",
            text=(f"Over the last two weeks {name} completed {len(goals)} of {total} "
                  f"daily study goals."),
            day=date.today().isoformat(), period="week",
            metric={"count": len(goals)},
        ))
    return cards


def _analytics_cards(name: str, analytics: dict) -> list[FactCard]:
    cards: list[FactCard] = []
    activity = _newest_first(analytics.get("activity_range") or [])
    dash = analytics.get("dashboard") or {}

    # Weekly study rhythm — the shape parents ask about most. Bucketed by
    # calendar week, since inactive days have no row to slice on.
    today = date.today()
    by_day = {d["day"]: d for d in activity}
    for week in range(4):
        start = today - timedelta(days=(week + 1) * 7 - 1)
        chunk = [by_day[(start + timedelta(days=i)).isoformat()]
                 for i in range(7)
                 if (start + timedelta(days=i)).isoformat() in by_day]
        minutes = sum(d.get("study_minutes") or 0 for d in chunk)
        active = sum(1 for d in chunk if (d.get("study_minutes") or 0) > 0 or d.get("logged_in"))
        label = "In the last 7 days" if week == 0 else f"{week} week(s) before that"
        videos = sum(d.get("videos_watched") or 0 for d in chunk)
        quizzes = sum(d.get("quizzes_completed") or 0 for d in chunk)
        cards.append(FactCard(
            source_id=f"analytics:week:{start.isoformat()}",
            domain="analytics", card_type="summary_week",
            text=(f"{label} (week of {_fmt_date(start.isoformat())}), {name} studied "
                  f"{minutes} minutes across {active} active days, watching {videos} "
                  f"videos and completing {quizzes} quizzes."),
            day=start.isoformat(), period="week",
            metric={"minutes": minutes, "count": active},
        ))

    # Days with no activity have no row at all, so the gap is measured
    # against the calendar, not against the number of rows returned.
    last_active = next(
        (d["day"] for d in activity
         if (d.get("study_minutes") or 0) > 0 or d.get("logged_in")),
        None,
    )
    if last_active:
        gap = (date.today() - date.fromisoformat(last_active)).days
        if gap >= 3:
            cards.append(FactCard(
                source_id="analytics:inactivity",
                domain="analytics", card_type="profile",
                text=(f"{name} has had no recorded study activity for {gap} days. "
                      f"Their last active day was {_fmt_date(last_active)}."),
                day=date.today().isoformat(), period="all",
                metric={"count": gap},
            ))

    for topic in (analytics.get("weak_topics") or [])[:10]:
        cards.append(FactCard(
            source_id=f"analytics:weak_topic:{topic['topic_id']}",
            domain="analytics", card_type="profile",
            text=(f"{name} is struggling with one topic, scoring "
                  f"{topic.get('accuracy', 0):.0f}% accuracy over "
                  f"{topic.get('attempts', 0)} attempts."),
            day=date.today().isoformat(), period="all",
            metric={"accuracy": topic.get("accuracy")},
        ))

    if dash.get("total_videos_watched") or dash.get("total_quizzes_completed"):
        cards.append(FactCard(
            source_id="analytics:overview",
            domain="analytics", card_type="profile",
            text=(f"In total {name} has watched {dash.get('total_videos_watched', 0)} videos "
                  f"and completed {dash.get('total_quizzes_completed', 0)} quizzes, with an "
                  f"overall quiz average of {dash.get('avg_quiz_score', 0):.0f}% across "
                  f"{dash.get('chapters_in_progress', 0)} chapters in progress."),
            day=date.today().isoformat(), period="all",
            metric={"score": dash.get("avg_quiz_score")},
        ))
    return cards


def _learning_cards(name: str, learning: dict) -> list[FactCard]:
    """Videos watched, chapter/subject completion, saved items, certificates
    and assignments — the 'is he actually getting through the course' side."""
    cards: list[FactCard] = []
    videos = learning.get("videos") or {}
    completion = learning.get("completion") or {}
    today = date.today().isoformat()

    if videos.get("total_watched"):
        watched, done = videos["total_watched"], videos.get("completed", 0)
        hours = (videos.get("total_watch_seconds") or 0) / 3600
        cards.append(FactCard(
            source_id="learning:videos",
            domain="learning", card_type="profile",
            text=(f"{name} has started {watched} lesson videos and finished {done} of them, "
                  f"spending about {hours:.1f} hours watching."),
            day=today, period="all",
            metric={"count": watched, "minutes": int(hours * 60)},
        ))

    for v in (videos.get("recent") or [])[:25]:
        state = "finished" if v.get("is_completed") else f"watched {v.get('completion_percentage', 0):.0f}% of"
        subject = f" ({v['subject']})" if v.get("subject") else ""
        cards.append(FactCard(
            source_id=f"learning:video:{v.get('video_id')}",
            domain="learning", card_type="event",
            text=(f"On {_fmt_date(v.get('updated_at'))}, {name} {state} the lesson "
                  f"\"{v.get('title') or 'a video'}\"{subject}."),
            day=_day_of(v.get("updated_at")),
            subject=v.get("subject"),
            metric={"score": v.get("completion_percentage")},
        ))

    for s in completion.get("by_subject") or []:
        label = s.get("subject_name") or "a subject"
        total = s.get("chapters_total")
        done = s.get("chapters_completed", 0)
        of_total = f" of {total}" if total else ""
        avg = s.get("avg_score")
        score = f" Their average score there is {avg:.0f}%." if isinstance(avg, (int, float)) else ""
        cards.append(FactCard(
            source_id=f"learning:subject_completion:{s.get('subject_id')}",
            domain="learning", card_type="summary_month",
            text=f"In {label}, {name} has completed {done}{of_total} chapters.{score}",
            day=today, period="all", subject=s.get("subject_name"),
            metric={"count": done, "score": avg},
        ))

    for e in completion.get("by_entity_type") or []:
        if not e.get("total"):
            continue
        cards.append(FactCard(
            source_id=f"learning:entity_completion:{e.get('entity_type')}",
            domain="learning", card_type="profile",
            text=(f"{name} has completed {e.get('completed', 0)} of {e['total']} "
                  f"{e.get('entity_type')} items on the platform."),
            day=today, period="all",
            metric={"count": e.get("completed")},
        ))

    saved = learning.get("bookmarks") or []
    if saved:
        titles = ", ".join(b.get("title") or b.get("entity_type", "item") for b in saved[:8])
        cards.append(FactCard(
            source_id="learning:bookmarks",
            domain="learning", card_type="profile",
            text=(f"{name} has saved {len(saved)} items for later, including: {titles}."),
            day=today, period="all", metric={"count": len(saved)},
        ))

    for c in (learning.get("certificates") or [])[:15]:
        cards.append(FactCard(
            source_id=f"learning:certificate:{c.get('certificate_number')}",
            domain="learning", card_type="event",
            text=(f"On {_fmt_date(c.get('issued_at'))}, {name} earned a completion "
                  f"certificate for {c.get('chapter_name') or 'a chapter'} in "
                  f"{c.get('subject_name') or 'a subject'}."),
            day=_day_of(c.get("issued_at")), subject=c.get("subject_name"),
        ))

    assignments = learning.get("assignments") or {}
    if assignments.get("assigned"):
        cards.append(FactCard(
            source_id="learning:assignments",
            domain="learning", card_type="profile",
            text=(f"{name} has been given {assignments['assigned']} assignments, of which "
                  f"{assignments.get('pending', 0)} are still pending."),
            day=today, period="all",
            metric={"count": assignments.get("pending")},
        ))
    return cards


def _career_cards(name: str, career: dict) -> list[FactCard]:
    cards: list[FactCard] = []

    for g in career.get("goals") or []:
        label = g.get("career_name") or "a career"
        primary = " This is their primary career goal." if g.get("is_primary") else ""
        cards.append(FactCard(
            source_id=f"career:goal:{g.get('career_id')}",
            domain="career", card_type="profile",
            text=(f"{name} set a career goal of {label} on "
                  f"{_fmt_date(g.get('created_at'))} and is "
                  f"{g.get('progress', 0):.0f}% of the way towards it.{primary}"),
            day=_day_of(g.get("created_at")), period="all",
            metric={"score": g.get("progress")},
        ))

    for a in (career.get("assessments") or [])[:5]:
        label = a.get("career_name") or "a career"
        # gaps are objects like {"subject": "Accountancy", "gap_label": "..."} —
        # str() on the dict would put raw JSON in front of the parent.
        gaps = [
            g.get("subject") or g.get("skill") or g.get("name")
            for g in (a.get("gaps") or [])[:5]
            if isinstance(g, dict)
        ]
        gap_text = f" Weakest areas for it: {', '.join(g for g in gaps if g)}." if any(gaps) else ""
        cards.append(FactCard(
            source_id=f"career:assessment:{a.get('career_id')}:{_day_of(a.get('assessed_at'))}",
            domain="career", card_type="event",
            text=(f"On {_fmt_date(a.get('assessed_at'))}, {name} took a skill assessment for "
                  f"{label} and scored {a.get('ready_score', 0):.0f}% readiness.{gap_text}"),
            day=_day_of(a.get("assessed_at")),
            metric={"score": a.get("ready_score")},
        ))
    return cards


def _referral_cards(name: str, referral: dict) -> list[FactCard]:
    if not referral.get("total_referrals"):
        return []
    claimed = sum(1 for r in (referral.get("rewards") or []) if r.get("is_claimed"))
    return [FactCard(
        source_id="referral:summary",
        domain="referral", card_type="profile",
        text=(f"{name} has referred {referral['total_referrals']} friends to the platform, "
              f"{referral.get('qualified_referrals', 0)} of whom qualified, and has claimed "
              f"{claimed} referral rewards."),
        day=date.today().isoformat(), period="all",
        metric={"count": referral["total_referrals"]},
    )]


def _paper_cards(name: str, papers: dict) -> list[FactCard]:
    """Practice / generated papers the student sat."""
    cards: list[FactCard] = []
    totals = papers.get("totals") or {}

    if totals.get("attempts"):
        avg = totals.get("avg_percentage")
        best = totals.get("best_percentage")
        avg_txt = f", averaging {avg:.0f}%" if isinstance(avg, (int, float)) else ""
        best_txt = f" with a best of {best:.0f}%" if isinstance(best, (int, float)) else ""
        cards.append(FactCard(
            source_id="papers:totals",
            domain="papers", card_type="profile",
            text=(f"{name} has attempted {totals['attempts']} practice papers"
                  f"{avg_txt}{best_txt}."),
            day=date.today().isoformat(), period="all",
            metric={"count": totals["attempts"], "score": avg},
        ))
    elif totals.get("generated_count"):
        cards.append(FactCard(
            source_id="papers:generated_only",
            domain="papers", card_type="profile",
            text=(f"{name} has generated {totals['generated_count']} practice papers but has "
                  f"not attempted any of them yet."),
            day=date.today().isoformat(), period="all",
            metric={"count": totals["generated_count"]},
        ))

    for a in (papers.get("attempts") or [])[:30]:
        if a.get("status") != "completed":
            continue
        subject = a.get("subject") or "a general"
        chapter = f" on {a['chapter']}" if a.get("chapter") else ""
        minutes = (a.get("time_taken_sec") or 0) // 60
        time_txt = f" in {minutes} minutes" if minutes else ""
        cards.append(FactCard(
            source_id=f"paper_attempt:{a.get('attempt_id')}",
            domain="papers", card_type="event",
            text=(f"On {_fmt_date(a.get('completed_at'))}, {name} attempted a {subject} "
                  f"practice paper{chapter} and scored {a.get('percentage', 0):.0f}% "
                  f"({a.get('correct_count', 0)} correct, {a.get('wrong_count', 0)} "
                  f"wrong){time_txt}."),
            day=_day_of(a.get("completed_at")), subject=a.get("subject"),
            metric={"score": a.get("percentage")},
        ))
    return cards


def _pyp_cards(name: str, pyp: dict) -> list[FactCard]:
    """Previous-year board papers — the closest thing to real exam practice."""
    cards: list[FactCard] = []
    totals = pyp.get("totals") or {}

    if totals.get("attempts"):
        avg = totals.get("avg_percentage")
        avg_txt = f", averaging {avg:.0f}%" if isinstance(avg, (int, float)) else ""
        cards.append(FactCard(
            source_id="pyp:totals",
            domain="pyp", card_type="profile",
            text=(f"{name} has attempted {totals['attempts']} previous-year board papers"
                  f"{avg_txt}. These are real past exam papers, so they are the best "
                  f"available signal for exam readiness."),
            day=date.today().isoformat(), period="all",
            metric={"count": totals["attempts"], "score": avg},
        ))

    for a in (pyp.get("attempts") or [])[:30]:
        if a.get("status") != "completed":
            continue
        year = f" {a['year']}" if a.get("year") else ""
        minutes = (a.get("time_taken_sec") or 0) // 60
        time_txt = f", taking {minutes} minutes" if minutes else ""
        cards.append(FactCard(
            source_id=f"pyp_attempt:{a.get('attempt_id')}",
            domain="pyp", card_type="event",
            text=(f"On {_fmt_date(a.get('completed_at'))}, {name} attempted the"
                  f"{year} {a.get('subject') or ''} previous-year paper and scored "
                  f"{a.get('percentage', 0):.0f}% ({a.get('correct_count', 0)} of "
                  f"{a.get('questions_total', 0)} correct){time_txt}."),
            day=_day_of(a.get("completed_at")), subject=a.get("subject"),
            metric={"score": a.get("percentage")},
        ))
    return cards


def _revision_cards(name: str, revision: dict) -> list[FactCard]:
    """Whether the student actually goes back over weak material."""
    cards: list[FactCard] = []
    totals = revision.get("totals") or {}

    if totals.get("sessions"):
        completed = totals.get("completed", 0)
        cards.append(FactCard(
            source_id="revision:totals",
            domain="revision", card_type="profile",
            text=(f"{name} has started {totals['sessions']} revision sessions and finished "
                  f"{completed} of them, spending {totals.get('total_minutes', 0)} minutes "
                  f"revising across {totals.get('topics_revised', 0)} topics."),
            day=date.today().isoformat(), period="all",
            metric={"count": totals["sessions"], "minutes": totals.get("total_minutes")},
        ))

    kinds = {"weak_topics": "weak-topic", "chapter": "chapter", "manual": "self-directed"}
    for s in (revision.get("sessions") or [])[:30]:
        minutes = (s.get("duration_sec") or 0) // 60
        state = "completed" if s.get("is_completed") else "started but did not finish"
        kind = kinds.get(s.get("source") or "", "")
        cards.append(FactCard(
            source_id=f"revision_session:{s.get('session_id') or s.get('id')}",
            domain="revision", card_type="event",
            text=(f"On {_fmt_date(s.get('started_at'))}, {name} {state} a {kind} revision "
                  f"session lasting {minutes} minutes."),
            day=_day_of(s.get("started_at")),
            metric={"minutes": minutes},
        ))
    return cards


def build_cards(name: str, data: dict) -> list[FactCard]:
    """All fact cards for one student, across every domain."""
    return (
        _quiz_cards(name, data.get("quiz") or {})
        + _battle_cards(name, data.get("battle") or {})
        + _gamification_cards(name, data.get("gamification") or {})
        + _analytics_cards(name, data.get("analytics") or {})
        + _learning_cards(name, data.get("learning") or {})
        + _career_cards(name, data.get("career") or {})
        + _referral_cards(name, data.get("referral") or {})
        + _paper_cards(name, data.get("papers") or {})
        + _pyp_cards(name, data.get("pyp") or {})
        + _revision_cards(name, data.get("revision") or {})
    )
