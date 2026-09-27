"""
Fire-and-forget side effects fired after a quiz attempt is finalized —
gamification activity feed, daily-goal progress, per-topic accuracy
recording, analytics progress events. Every function here follows the same
never-raise pattern: a quiz submission must succeed even when a downstream
service is down or slow. Called from BOTH AttemptService.submit_quiz() and
AttemptService.batch_submit() — see the comments on those methods for why
that duplication (rather than one shared call site) matters.
"""
import uuid

import httpx

from app.core.config import settings
from app.models.quiz import Quiz, QuizAnswer


class QuizSideEffects:
    def __init__(self, db):
        self.db = db

    async def record_activity_feed(self, user_id: uuid.UUID, quiz: Quiz | None, percentage: float) -> None:
        """Best-effort, fire-and-forget POST to gamification_service so this
        completion can appear in the user's friends' Friend Activity feed.
        Never raises — a quiz submission must succeed even if
        gamification_service is down or slow."""
        title = quiz.subject_name or quiz.title if quiz else "a quiz"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/activity/record",
                    json={
                        "user_id": str(user_id),
                        "activity_type": "quiz_completed",
                        "title": f"{title} Quiz" if quiz and quiz.subject_name else title,
                        "subject": quiz.subject_name if quiz else None,
                        "score_pct": max(0, min(100, round(percentage))),
                    },
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass

    async def award_quiz_xp(self, user_id: uuid.UUID, attempt_id: uuid.UUID, percentage: float) -> None:
        """Best-effort, fire-and-forget POST to gamification_service so a real
        quiz completion actually grants the QUIZ_COMPLETED/QUIZ_SCORE_80/
        QUIZ_PERFECT XP defined in XP_REWARDS (previously dead: nothing ever
        called award_xp with these events, so quiz completions granted zero
        direct XP). reference_id=attempt_id makes a retried submit a safe
        no-op via gamification_service's own dedup. Never raises."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/quiz-xp/award",
                    json={
                        "user_id": str(user_id),
                        "percentage": max(0.0, min(100.0, percentage)),
                        "reference_id": str(attempt_id),
                    },
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass

    async def record_goal_progress(self, user_id: uuid.UUID, goal_type: str, increment: int) -> None:
        """Best-effort, fire-and-forget POST to gamification_service so a
        "Complete N Quiz(zes)" / "Complete N Questions" daily goal advances.
        Never raises."""
        if increment <= 0:
            return
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/goals/progress",
                    json={"user_id": str(user_id), "goal_type": goal_type, "increment": increment},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass

    async def record_topic_attempts(self, user_id: uuid.UUID, answers: list[QuizAnswer], get_question_meta_cached) -> None:
        """Real, per-question topic-level accuracy — the actual write that
        keeps WeakTopicAnalysis (and everything downstream that reads it:
        the dashboard weak-topics widget, personalized video recommendations)
        live instead of frozen at seed-time values. Also queues at most ONE
        delayed "practice this" nudge per quiz if any topic-tagged question
        was answered wrong — not one per wrong question, which would spam.
        Fire-and-forget, same never-raise pattern as record_analytics_progress;
        called from BOTH submit_quiz() and batch_submit() so neither quiz-
        finish path silently skips it.

        `get_question_meta_cached` is AttemptService's Redis-first question
        metadata lookup, passed in rather than duplicated here."""
        missed_a_topic = False
        for a in answers:
            if a.user_answer is None:
                continue  # unanswered — not a real attempt at the topic
            meta = await get_question_meta_cached(a.question_id)
            topic_id = meta.get("topic") if meta else None
            if not topic_id:
                continue  # question has no topic tag — nothing to attribute
            if not a.is_correct:
                missed_a_topic = True
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    await client.post(
                        f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/topic-attempt",
                        json={"user_id": str(user_id), "topic_id": topic_id, "correct": bool(a.is_correct)},
                        headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    )
            except Exception:
                pass

        if missed_a_topic:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    await client.post(
                        f"{settings.NOTIFICATION_SERVICE_URL}/api/v1/notifications/internal/schedule-nudge",
                        json={
                            "user_id": str(user_id),
                            "nudge_type": "weak_topic_practice",
                            "title": "📚 Ready for a quick practice?",
                            "body": "You found a topic tricky in your last quiz — a short revision now will help it stick.",
                            "delay_hours": 4,
                        },
                        headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    )
            except Exception:
                pass

    async def record_analytics_progress(self, user_id: uuid.UUID, quiz: Quiz | None, percentage: float) -> None:
        """Best-effort, fire-and-forget POST to analytics_service on real quiz
        completion — same never-raise pattern as record_goal_progress. Only
        fires when the quiz is tagged to a chapter/subject (some quizzes are
        ad-hoc/untagged); called from BOTH submit_quiz() and batch_submit()
        so neither quiz-finish path silently skips this (see the comment on
        submit_quiz's post-completion side effects for why that duplication
        matters here)."""
        if not quiz or not quiz.chapter_id or not quiz.subject_id:
            return
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/progress-event",
                    json={
                        "user_id": str(user_id),
                        "subject_id": str(quiz.subject_id),
                        "chapter_id": str(quiz.chapter_id),
                        "quiz_score": max(0.0, min(100.0, percentage)),
                    },
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass

    async def record_daily_activity(self, user_id: uuid.UUID, time_taken_seconds: int | None) -> None:
        """Best-effort POST to analytics_service's daily_activity upsert:
        quizzes_completed+1 and study_minutes += attempt duration. Called from
        BOTH submit_quiz() and batch_submit(). Duration is capped because
        started_at can be days old for an abandoned-then-finished attempt."""
        minutes = 0
        if time_taken_seconds:
            minutes = min(120, max(0, round(time_taken_seconds / 60)))
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/activity",
                    json={"user_id": str(user_id), "quizzes_completed": 1, "study_minutes": minutes},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass

    async def notify_referral_quiz_completed(self, user_id: uuid.UUID) -> None:
        """Best-effort, fire-and-forget POST to referral_service on a real
        quiz completion, so a referred user's "complete a quiz"
        qualification step re-checks itself server-side (see
        referral_service's tracking_service.update_qualification — it
        re-derives the real answer from this service's own QuizAttempt
        data via the internal /attempts/internal/completed/{user_id}
        route; this call is purely the trigger, not a source of truth).
        A no-op if the user was never referred. Called from BOTH
        submit_quiz() and batch_submit() — same duplication-matters
        reasoning as every other side effect in this class."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.REFERRAL_SERVICE_URL}/api/v1/referrals/internal/qualify",
                    json={"referred_user_id": str(user_id)},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass

    async def notify_challenge_task_progress(self, user_id: uuid.UUID, quiz_id: uuid.UUID) -> None:
        """Best-effort, fire-and-forget POST to gamification_service on a
        real quiz completion, so any Challenge Program task referencing
        this quiz_id re-checks itself server-side. task_type is omitted —
        a Quiz row backs BOTH "quiz" and "practice" task types (practice is
        just quiz_type="practice" on the same table), so gamification_service
        matches on content_ref against either task_type rather than trusting
        a single label from this call site. A no-op if the user isn't
        enrolled in any challenge referencing this quiz."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/challenge-programs/internal/task-progress",
                    json={"user_id": str(user_id), "task_content_ref": str(quiz_id), "task_type": None},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception:
            pass
