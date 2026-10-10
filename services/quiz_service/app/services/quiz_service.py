"""
AttemptService — Redis-first quiz execution layer.

Read path:
  1. Try Redis (question:{id} or quiz:{quiz_id})
  2. On miss: query PostgreSQL, populate cache, continue

Write path (batch submit):
  1. Validate answers from Redis → fallback PostgreSQL
  2. Calculate score + identify weak topics
  3. Write QuizAttempt + QuizAnswer rows to PostgreSQL
  4. Update Redis: student:{id}:weak_topics, student:{id}:progress, leaderboard:class{n}
  5. Publish quiz.cache_rebuild event if cache was cold

Fire-and-forget post-completion side effects (activity feed, daily-goal
progress, topic-attempt recording, analytics events) live in
QuizSideEffects — this class calls into it but doesn't own that logic.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import (
    TTL_PROGRESS, TTL_QUESTION, TTL_QUIZ,
    cache_get, cache_set,
    leaderboard_key, question_key, quiz_id_key,
    student_progress_key, student_weak_topics_key,
    subject_leaderboard_key,
    zincrby,
)
from app.models.quiz import Question, Quiz, QuizAnswer, QuizAttempt
from app.schemas.attempt import BatchSubmitResponse
from app.services.quiz_side_effects import QuizSideEffects

# Server-side quiz-timer enforcement grace period: the client-side countdown
# was the only thing preventing a late submission (a manipulated client
# clock, or simply refreshing the browser, could submit with full credit
# arbitrarily late — the server only ever computed elapsed time for the
# RECORD, never checked it against quiz.duration_minutes). A small grace
# window absorbs real network latency / a brief disconnect right at the
# buzzer without materially reopening the bypass.
QUIZ_SUBMIT_GRACE_SECONDS = 120


class AttemptService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.side_effects = QuizSideEffects(db)

    # ── Redis helpers ─────────────────────────────────────────────────────────

    async def _get_quiz_cached(self, quiz_id: uuid.UUID) -> dict | None:
        """Return quiz JSON dict from Redis; populate cache on miss."""
        cached = await cache_get(quiz_id_key(str(quiz_id)))
        if cached:
            return cached

        quiz = await self.db.get(Quiz, quiz_id)
        if not quiz:
            return None
        result = await self.db.execute(
            select(Question).where(Question.quiz_id == quiz.id).order_by(Question.sequence)
        )
        questions = result.scalars().all()

        q_list = [
            {
                "id":             str(q.id),
                "question":       q.text,
                "options":        q.options,
                "correct_answer": q.correct_answer,
                "marks":          q.marks,
                "negative_marks": q.negative_marks,
                "topic":          str(q.topic_id) if q.topic_id else None,
                "sequence":       q.sequence,
            }
            for q in questions
        ]
        payload = {
            "quiz_id":         str(quiz.id),
            "title":           quiz.title,
            "total_questions": len(q_list),
            "duration_minutes": quiz.duration_minutes,
            "total_marks":     quiz.total_marks,
            "questions":       q_list,
        }
        await cache_set(quiz_id_key(str(quiz_id)), payload, TTL_QUIZ)
        return payload

    async def _get_question_meta_cached(self, question_id: uuid.UUID) -> dict | None:
        """Return question metadata (incl. correct_answer) from Redis; populate on miss."""
        cached = await cache_get(question_key(str(question_id)))
        if cached:
            return cached

        q = await self.db.get(Question, question_id)
        if not q:
            return None

        meta = {
            "question_id":    str(q.id),
            "quiz_id":        str(q.quiz_id),
            "topic":          str(q.topic_id) if q.topic_id else None,
            "correct_answer": q.correct_answer,
            "marks":          q.marks,
            "negative_marks": q.negative_marks,
        }
        await cache_set(question_key(str(question_id)), meta, TTL_QUESTION)
        return meta

    # ── Attempt lifecycle ─────────────────────────────────────────────────────

    async def start_attempt(self, quiz_id: uuid.UUID, user_id: uuid.UUID) -> QuizAttempt:
        quiz = await self.db.get(Quiz, quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        # Prevent starting a duplicate concurrent attempt: a user should not be
        # able to have more than one unfinished (in_progress) attempt on the
        # same quiz at once (e.g. rapid-fire repeated start calls). Completed/
        # abandoned attempts are unaffected — this only blocks stacking up
        # multiple simultaneous in-progress attempts on the same quiz.
        existing = await self.db.execute(
            select(QuizAttempt).where(
                QuizAttempt.user_id == user_id,
                QuizAttempt.quiz_id == quiz_id,
                QuizAttempt.status == "in_progress",
            )
        )
        if existing.scalars().first():
            raise HTTPException(
                status_code=409,
                detail="An attempt for this quiz is already in progress",
            )

        attempt = QuizAttempt(user_id=user_id, quiz_id=quiz_id, total_marks=quiz.total_marks)
        self.db.add(attempt)
        try:
            await self.db.flush()
        except IntegrityError as exc:
            # DB-level backstop: ux_quiz_attempts_user_quiz_in_progress (partial
            # unique index on (user_id, quiz_id) WHERE status = 'in_progress').
            # The SELECT-then-INSERT check above is a TOCTOU race under true
            # concurrency — two requests can both pass the check before either
            # commits. If we lost that race, the unique index raises here;
            # roll back and surface the same 409 the app-level check would.
            await self.db.rollback()
            raise HTTPException(
                status_code=409,
                detail="An attempt for this quiz is already in progress",
            ) from exc
        await self.db.refresh(attempt)
        return attempt

    async def submit_answer(
        self,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        user_answer: str,
        caller_id: uuid.UUID,
    ) -> QuizAnswer:
        """Single-answer submit; validates against Redis (falls back to PostgreSQL)."""
        attempt = await self.db.get(QuizAttempt, attempt_id)
        if not attempt:
            raise HTTPException(status_code=404, detail="Attempt not found")
        if attempt.user_id != caller_id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this attempt")
        # Reject answers to an attempt that's already finished — otherwise a
        # student could re-answer after seeing their score and then re-submit
        # to overwrite it.
        if attempt.status != "in_progress":
            raise HTTPException(status_code=409, detail="This attempt is already submitted.")

        meta = await self._get_question_meta_cached(question_id)
        if not meta:
            raise HTTPException(status_code=404, detail="Question not found")
        # Reject questions that don't belong to this attempt's quiz — a caller
        # must not be able to inject answers to arbitrary questions and have
        # them scored into their attempt. (quiz_id is absent on pre-existing
        # cached meta; it refreshes within the cache TTL and is enforced then.)
        if meta.get("quiz_id") and meta["quiz_id"] != str(attempt.quiz_id):
            raise HTTPException(status_code=400, detail="Question does not belong to this quiz.")

        is_correct   = user_answer.strip().lower() == meta["correct_answer"].strip().lower()
        marks_awarded = meta["marks"] if is_correct else -meta["negative_marks"]

        result = await self.db.execute(
            select(QuizAnswer).where(
                QuizAnswer.attempt_id  == attempt_id,
                QuizAnswer.question_id == question_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.user_answer  = user_answer
            existing.is_correct   = is_correct
            existing.marks_awarded = marks_awarded
            return existing

        answer = QuizAnswer(
            attempt_id=attempt_id,
            question_id=question_id,
            user_answer=user_answer,
            is_correct=is_correct,
            marks_awarded=marks_awarded,
        )
        self.db.add(answer)
        await self.db.flush()
        return answer

    async def submit_quiz(self, attempt_id: uuid.UUID, caller_id: uuid.UUID) -> dict:
        """Finalize an attempt that used the per-question submit_answer flow.

        Returns an enriched dict with: score, total, percentage, passed,
        answered_count, unanswered_count, time_taken_seconds, weak_topics.
        """
        attempt = await self.db.get(QuizAttempt, attempt_id)
        if not attempt:
            raise HTTPException(status_code=404, detail="Attempt not found")
        if attempt.user_id != caller_id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this attempt")

        # Idempotency guard: a retried/double-tapped submit must return the
        # already-computed result WITHOUT re-running the side effects below —
        # otherwise a network retry would double-count daily-goal progress
        # and leaderboard points. (batch_submit has the same guard.)
        already_completed = attempt.status == "completed"

        # Fetch the quiz to know passing_marks
        quiz = await self.db.get(Quiz, attempt.quiz_id)

        # Server-side timer enforcement: only for a genuinely fresh
        # submission — an already-completed attempt still returns its
        # cached result below even if this call itself arrives late.
        if not already_completed and quiz:
            deadline = attempt.started_at.replace(tzinfo=timezone.utc) + timedelta(
                minutes=quiz.duration_minutes, seconds=QUIZ_SUBMIT_GRACE_SECONDS
            )
            if datetime.now(timezone.utc) > deadline:
                raise HTTPException(status_code=409, detail="Quiz time limit has expired for this attempt")

        result = await self.db.execute(
            select(QuizAnswer).where(QuizAnswer.attempt_id == attempt_id)
        )
        answers = result.scalars().all()

        total_questions_result = await self.db.execute(
            select(Question).where(Question.quiz_id == attempt.quiz_id)
        )
        total_questions  = len(total_questions_result.scalars().all())

        answered_count   = sum(1 for a in answers if a.user_answer is not None)
        unanswered_count = total_questions - answered_count
        total_score      = sum(a.marks_awarded for a in answers)
        pct              = (total_score / attempt.total_marks * 100) if attempt.total_marks > 0 else 0.0
        pct              = max(0.0, min(100.0, pct))  # clamp: never let a tampered score feed >100% into leaderboards/reports
        passing_marks    = quiz.passing_marks if quiz else 0
        passed           = total_score >= passing_marks if passing_marks > 0 else pct >= 40.0
        now              = datetime.now(timezone.utc)
        secs             = int((now - attempt.started_at.replace(tzinfo=timezone.utc)).total_seconds())

        # Collect weak topics: topics of incorrectly answered questions
        weak_topics: list[str] = []
        for a in answers:
            if not a.is_correct:
                meta = await self._get_question_meta_cached(a.question_id)
                if meta and meta.get("topic"):
                    weak_topics.append(meta["topic"])
        unique_weak = list(dict.fromkeys(weak_topics))

        attempt.score      = max(0.0, total_score)
        attempt.percentage = max(0.0, pct)
        if not already_completed:
            # Only advance completion bookkeeping on the FIRST finalize — a
            # retried/double-tapped submit must not overwrite the original
            # completion time or re-run the side effects below.
            attempt.status             = "completed"
            attempt.completed_at       = now
            attempt.time_taken_seconds = secs

        await self.db.flush()
        await self.db.refresh(attempt)

        # Post-completion side effects — this is THE quiz-finish path used by
        # both real frontends (per-question submit_answer, then this call to
        # finalize). batch_submit() is a separate, Redis-first all-at-once
        # flow that already had these; submit_quiz() was missing them
        # entirely, so daily-goal progress ("Complete N Quiz(zes)"), the
        # friends activity feed, and the class leaderboard never updated for
        # anyone using the standard quiz flow. class_num comes from the quiz
        # record itself (more reliable than a client-supplied value).
        # Gated on already_completed so a retry can't double-count any of this.
        if not already_completed:
            await self._update_redis_after_submit(
                user_id=caller_id,
                score=attempt.score,
                total_marks=attempt.total_marks,
                percentage=pct,
                weak_topics=unique_weak,
                class_num=quiz.class_num if quiz else None,
                board=quiz.board if quiz else None,
                subject_id=quiz.subject_id if quiz else None,
            )
            await self.side_effects.record_activity_feed(caller_id, quiz, pct)
            await self.side_effects.award_quiz_xp(caller_id, attempt.id, pct)
            await self.side_effects.record_goal_progress(caller_id, "quiz", 1)
            await self.side_effects.record_goal_progress(caller_id, "questions", answered_count)
            await self.side_effects.record_analytics_progress(caller_id, quiz, pct)
            await self.side_effects.record_daily_activity(caller_id, secs)
            await self.side_effects.record_topic_attempts(caller_id, answers, self._get_question_meta_cached)
            await self.side_effects.notify_referral_quiz_completed(caller_id)
            await self.side_effects.notify_challenge_task_progress(caller_id, attempt.quiz_id)

        return {
            "id":                 str(attempt.id),
            "quiz_id":            str(attempt.quiz_id),
            "user_id":            str(attempt.user_id),
            "status":             attempt.status,
            "score":              attempt.score,
            "total_marks":        attempt.total_marks,
            "percentage":         round(attempt.percentage, 2),
            "passed":             passed,
            "answered_count":     answered_count,
            "unanswered_count":   unanswered_count,
            "weak_topics":        unique_weak,
            "time_taken_seconds": attempt.time_taken_seconds,
            "started_at":         attempt.started_at.isoformat(),
            "completed_at":       attempt.completed_at.isoformat() if attempt.completed_at else None,
        }

    # ── Redis-first batch submit ──────────────────────────────────────────────

    async def batch_submit(
        self,
        attempt_id: uuid.UUID,
        user_id:    uuid.UUID,
        answers:    dict[str, str],
        class_num:  int | None = None,
    ) -> BatchSubmitResponse:
        """
        Redis-first full quiz submission.

        Flow:
          1. Validate each answer using Redis question cache (fallback: PostgreSQL)
          2. Write QuizAttempt + all QuizAnswer rows in one transaction
          3. Update Redis: student weak_topics, progress, leaderboard
          4. Return detailed scoring breakdown

        `user_id` must be the caller's own JWT-derived id (see routes/quiz.py::batch_submit) —
        it is used both to verify attempt ownership and to key the Redis progress/leaderboard
        updates, never a client-supplied value.
        """
        attempt = await self.db.get(QuizAttempt, attempt_id)
        if not attempt:
            raise HTTPException(status_code=404, detail="Attempt not found")
        if attempt.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this attempt")

        # Server-side timer enforcement — checked BEFORE the atomic claim
        # below, so a timed-out submission is rejected without ever
        # mutating attempt.status (an already-completed attempt is instead
        # caught by the claim's own rowcount==0 check just after).
        if attempt.status != "completed":
            quiz_for_deadline = await self.db.get(Quiz, attempt.quiz_id)
            if quiz_for_deadline:
                deadline = attempt.started_at.replace(tzinfo=timezone.utc) + timedelta(
                    minutes=quiz_for_deadline.duration_minutes, seconds=QUIZ_SUBMIT_GRACE_SECONDS
                )
                if datetime.now(timezone.utc) > deadline:
                    raise HTTPException(status_code=409, detail="Quiz time limit has expired for this attempt")

        # Atomically claim the attempt before any scoring/side-effects run, so
        # two concurrent batch-submit calls for the same attempt can't both
        # pass a plain status check and both award XP (QUIZ-046).
        claim = await self.db.execute(
            update(QuizAttempt)
            .where(QuizAttempt.id == attempt_id, QuizAttempt.status != "completed")
            .values(status="completed")
        )
        if claim.rowcount == 0:
            raise HTTPException(status_code=409, detail="Attempt already submitted")
        await self.db.refresh(attempt)

        # Fetched here (not just after, as before) so the real board/subject_id
        # from the quiz record — never a client-supplied value — are available
        # for the subject-leaderboard write below.
        quiz = await self.db.get(Quiz, attempt.quiz_id)

        correct_count = wrong_count = skipped_count = 0
        total_score   = 0.0
        weak_topics:  list[str] = []
        answer_rows:  list[QuizAnswer] = []

        for q_id_str, user_answer in answers.items():
            try:
                q_uuid = uuid.UUID(q_id_str)
            except ValueError:
                continue

            meta = await self._get_question_meta_cached(q_uuid)
            if not meta:
                skipped_count += 1
                continue
            # Ignore questions that aren't part of this attempt's quiz — a
            # caller must not pad their score with answers to foreign questions.
            if meta.get("quiz_id") and meta["quiz_id"] != str(attempt.quiz_id):
                skipped_count += 1
                continue

            if not user_answer or not user_answer.strip():
                skipped_count += 1
                answer_rows.append(QuizAnswer(
                    attempt_id=attempt_id,
                    question_id=q_uuid,
                    user_answer=None,
                    is_correct=False,
                    marks_awarded=0.0,
                ))
                continue

            is_correct    = user_answer.strip().lower() == meta["correct_answer"].strip().lower()
            marks_awarded = float(meta["marks"]) if is_correct else -float(meta["negative_marks"])
            total_score  += marks_awarded

            if is_correct:
                correct_count += 1
            else:
                wrong_count += 1
                if meta.get("topic"):
                    weak_topics.append(meta["topic"])

            answer_rows.append(QuizAnswer(
                attempt_id=attempt_id,
                question_id=q_uuid,
                user_answer=user_answer,
                is_correct=is_correct,
                marks_awarded=marks_awarded,
            ))

        # Finalize attempt
        now  = datetime.now(timezone.utc)
        pct  = (total_score / attempt.total_marks * 100) if attempt.total_marks > 0 else 0.0
        pct  = max(0.0, min(100.0, pct))  # clamp 0-100
        secs = int((now - attempt.started_at.replace(tzinfo=timezone.utc)).total_seconds())

        attempt.score              = max(0.0, total_score)
        attempt.percentage         = max(0.0, pct)
        attempt.completed_at       = now
        attempt.time_taken_seconds = secs

        for row in answer_rows:
            self.db.add(row)
        await self.db.flush()

        # Deduplicate and persist weak topics in Redis
        unique_weak = list(dict.fromkeys(weak_topics))
        await self._update_redis_after_submit(
            user_id=user_id,
            score=attempt.score,
            total_marks=attempt.total_marks,
            percentage=pct,
            weak_topics=unique_weak,
            # Prefer the quiz's own real class_num over the client-supplied
            # param (kept only for backward compatibility with older
            # clients) — same trust boundary as board/subject_id below.
            class_num=quiz.class_num if quiz and quiz.class_num is not None else class_num,
            board=quiz.board if quiz else None,
            subject_id=quiz.subject_id if quiz else None,
        )

        await self.side_effects.record_activity_feed(user_id, quiz, pct)
        await self.side_effects.award_quiz_xp(user_id, attempt_id, pct)
        await self.side_effects.record_goal_progress(user_id, "quiz", 1)
        await self.side_effects.record_goal_progress(user_id, "questions", correct_count + wrong_count)
        await self.side_effects.record_analytics_progress(user_id, quiz, pct)
        await self.side_effects.record_daily_activity(user_id, secs)
        await self.side_effects.record_topic_attempts(user_id, answer_rows, self._get_question_meta_cached)
        await self.side_effects.notify_referral_quiz_completed(user_id)
        await self.side_effects.notify_challenge_task_progress(user_id, attempt.quiz_id)

        return BatchSubmitResponse(
            attempt_id=attempt_id,
            score=attempt.score,
            total_marks=attempt.total_marks,
            percentage=round(attempt.percentage, 2),
            correct_count=correct_count,
            wrong_count=wrong_count,
            skipped_count=skipped_count,
            weak_topics=unique_weak,
            time_taken_seconds=secs,
        )

    async def _update_redis_after_submit(
        self,
        user_id:     uuid.UUID,
        score:       float,
        total_marks: int,
        percentage:  float,
        weak_topics: list[str],
        class_num:   int | None,
        board:       str | None = None,
        subject_id:  uuid.UUID | None = None,
    ) -> None:
        uid = str(user_id)

        # student:{id}:weak_topics  — merge with existing list
        existing_wt = await cache_get(student_weak_topics_key(uid)) or []
        merged = list(dict.fromkeys(existing_wt + weak_topics))
        await cache_set(student_weak_topics_key(uid), merged, TTL_PROGRESS)

        # student:{id}:progress — increment quizzes_completed, add XP
        progress = await cache_get(student_progress_key(uid)) or {
            "completed_chapters": 0,
            "completed_videos":   0,
            "completed_quizzes":  0,
            "xp":                 0,
        }
        progress["completed_quizzes"] = int(progress.get("completed_quizzes", 0)) + 1
        progress["xp"] = int(progress.get("xp", 0)) + max(0, int(score))
        await cache_set(student_progress_key(uid), progress, TTL_PROGRESS)

        # leaderboard:class{n} — add percentage score
        if class_num is not None:
            await zincrby(leaderboard_key(class_num), uid, percentage)

        # leaderboard:subject:{board}:{class}:{subject_id} — same accumulation,
        # scoped to one subject within one board+class (e.g. "CBSE Class 10
        # Physics Champions") rather than everything the student has taken.
        if board and class_num is not None and subject_id is not None:
            await zincrby(subject_leaderboard_key(board, class_num, str(subject_id)), uid, percentage)

        # popular_questions — increment sorted set (uses question IDs from weak topics later)
        # This is updated by individual question fetches via zincrby in the route handler
