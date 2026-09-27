"""
Battle gameplay — answer scoring (Redis-first with a DB fallback), final
ranking and XP payout, AI opponent simulation, spectators, question
regeneration and the post-battle replay payload.
"""
import logging
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_state import RedisBattleState
from app.crud import gameplay_crud, lifecycle_crud, query_crud
from app.models.battle import Battle, BattleStatus
from app.models.participant import BattleParticipant, ParticipantStatus
from app.services._common import XP_TABLE, get_battle_or_raise, part_to_dict
from app.services.battle_gamification_client import BattleGamificationClient
from app.services.battle_lifecycle_service import BattleLifecycleService

logger = logging.getLogger(__name__)


class BattleGameplayService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gamification = BattleGamificationClient(db)
        self.lifecycle = BattleLifecycleService(db)

    # ── Answer Submission ──────────────────────────────────────────────────────

    async def submit_answer(
        self,
        battle_id: uuid.UUID,
        user_id: uuid.UUID,
        question_idx: int,
        answer: str,
        time_taken_ms: int,
    ) -> dict:
        # Try Redis-first (zero DB during active gameplay)
        try:
            if await RedisBattleState.is_active(str(battle_id)):
                # Get correct answer from Redis (authoritative during gameplay)
                q = await RedisBattleState.get_question(str(battle_id), question_idx)
                if q is None:
                    raise ValueError("Invalid question index")
                correct_answer = q.get("correct_answer", "")
                return await RedisBattleState.submit_answer(
                    battle_id=str(battle_id),
                    user_id=str(user_id),
                    question_idx=question_idx,
                    answer=answer,
                    correct_answer=correct_answer,
                    time_taken_ms=time_taken_ms,
                )
        except ValueError:
            raise
        except Exception as exc:
            logger.warning("Redis submit_answer failed, falling back to DB: %s", exc)

        # DB fallback (Redis unavailable or battle not yet seeded)
        battle = await get_battle_or_raise(self.db, battle_id)
        if battle.status != BattleStatus.ACTIVE:
            raise ValueError("Battle is not active")

        questions = battle.questions or []
        if question_idx >= len(questions):
            raise ValueError("Invalid question index")

        q = questions[question_idx]
        correct = q.get("correct_answer", "")
        is_correct = answer.strip().lower() == correct.strip().lower()

        participant = await lifecycle_crud.get_participant_by_battle_and_user(self.db, battle_id, user_id)
        if not participant:
            raise ValueError("Participant not found")

        answers = participant.answers or {}
        if str(question_idx) in answers:
            return {"already_answered": True, "correct": is_correct, "score": participant.score, "accuracy": participant.accuracy}

        speed_bonus = max(0, 50 - (time_taken_ms // 100)) if is_correct else 0
        points = (100 + speed_bonus) if is_correct else 0
        answers[str(question_idx)] = {"answer": answer, "correct": is_correct, "time_ms": time_taken_ms, "points": points}
        participant.answers = answers

        if is_correct:
            participant.score   += points
            participant.correct += 1
        else:
            participant.wrong += 1

        total = participant.correct + participant.wrong
        participant.accuracy = (participant.correct / total * 100) if total > 0 else 0
        await gameplay_crud.commit_only(self.db)

        return {
            "is_correct":     is_correct,
            "correct":        is_correct,
            "correct_answer": correct,
            "score":          participant.score,
            "accuracy":       participant.accuracy,
            "points":         points,
        }

    async def finish_battle(self, battle_id: uuid.UUID) -> dict:
        battle = await get_battle_or_raise(self.db, battle_id)

        # Idempotency guard — every client calls /finish when it runs out of
        # questions, so a 1v1 finishes twice (and 20-player battles 20 times).
        # Re-running would re-rank, re-award stats and, for stake battles,
        # double-settle the XP transfer. Return the recorded result instead.
        if battle.status == BattleStatus.COMPLETED:
            participants = await query_crud.get_participants_for_battle(self.db, battle_id)
            done = sorted(participants, key=lambda p: (p.rank or 999))
            return {
                "battle_id":    str(battle_id),
                "battle_type":  battle.battle_type.value,
                "subject":      battle.subject,
                "winners":      [part_to_dict(p) for p in done if p.rank == 1 and not p.is_ai],
                "participants": [part_to_dict(p) for p in done],
                "xp_awarded":   {str(p.user_id): p.xp_earned for p in done if not p.is_ai and p.user_id},
                "duration_sec": int((battle.ended_at - battle.started_at).total_seconds())
                                if battle.started_at and battle.ended_at else 0,
                "already_finished": True,
            }

        # Flush Redis live scores → DB before computing rankings
        try:
            leaderboard = await RedisBattleState.get_leaderboard(str(battle_id))
            await gameplay_crud.bulk_update_participant_scores(self.db, battle_id, leaderboard)
        except Exception as exc:
            logger.warning("Redis→DB flush skipped: %s", exc)

        participants = await query_crud.get_participants_for_battle(self.db, battle_id)

        # Flush each human player's per-question answers (question/correct/
        # time_ms/points) from Redis into participant.answers — without this,
        # build_battle_replay has nothing to show per question for any battle
        # played through the normal Redis-first gameplay path.
        try:
            player_answers = await RedisBattleState.get_player_answers(str(battle_id), len(battle.questions or []))
            for part in participants:
                if part.is_ai or not part.user_id:
                    continue
                per_q = player_answers.get(str(part.user_id))
                if per_q:
                    part.answers = {k: v for entry in per_q for k, v in entry.items()}
        except Exception as exc:
            logger.warning("Redis answers flush skipped: %s", exc)

        # Handle AI opponent — simulate answers
        ai_parts = [p for p in participants if p.is_ai]
        for ai_p in ai_parts:
            await self._simulate_ai_answers(ai_p, battle)

        # Sort by score desc, then accuracy, then time
        ranked = sorted(
            participants,
            key=lambda p: (-p.score, -p.accuracy, p.time_taken_sec),
        )
        xp_awarded: dict[str, int] = {}

        # Friend-challenge stake battle: fixed win/loss amounts replace the
        # rank-based table — winner +CHALLENGE_WIN_XP (+EduPoints), loser
        # forfeits the stake. Only applies to a genuine 2-human 1v1.
        humans = [p for p in ranked if not p.is_ai and p.user_id]
        is_stake = (battle.stake_xp or 0) > 0 and len(humans) == 2

        for rank_idx, part in enumerate(ranked):
            rank = rank_idx + 1
            part.rank = rank
            part.status = ParticipantStatus.FINISHED
            part.finished_at = datetime.now(timezone.utc)

            if not part.is_ai and part.user_id:
                if is_stake:
                    # Winner takes the stake, loser pays it (chosen at challenge
                    # time, min 50) — gamification floors the loser at 0.
                    xp = battle.stake_xp if rank == 1 else -battle.stake_xp
                else:
                    xp = self._calculate_xp(rank, len(ranked), part.accuracy)
                part.xp_earned = xp
                xp_awarded[str(part.user_id)] = xp

        battle.status = BattleStatus.COMPLETED
        battle.ended_at = datetime.now(timezone.utc)

        await gameplay_crud.commit_only(self.db)

        # Update battle stats + fire XP to gamification
        for part in ranked:
            if not part.is_ai and part.user_id:
                await self.gamification.update_stats(part.user_id, part)

        if is_stake:
            # One settlement call moves XP on both sides (winner +stake +50 EP,
            # loser −stake, floored at 0 by gamification). Idempotent server-side
            # via the XP transaction log keyed on this battle id.
            winner = next(p for p in humans if p.rank == 1)
            loser = next(p for p in humans if p is not winner)
            await self.gamification.settle_challenge(winner.user_id, loser.user_id, battle.stake_xp, str(battle_id))
        else:
            for part in ranked:
                if not part.is_ai and part.user_id and part.xp_earned > 0:
                    await self.gamification.award_xp(part.user_id, part.xp_earned, str(battle_id))

        # Cleanup Redis state after flush
        try:
            await RedisBattleState.cleanup(str(battle_id))
        except Exception as exc:
            logger.warning("Redis cleanup failed (non-critical): %s", exc)

        winners = [p for p in ranked if p.rank == 1 and not p.is_ai]
        for w in winners:
            await self.gamification.record_activity(w.user_id, battle.subject, w.xp_earned or 0)

        # Challenge Program task progress — every finishing human participant
        # (not just the winner) counts as "completed this battle" for a
        # battle-type challenge task, matching how a quiz/video task is
        # unconditional on score.
        for part in ranked:
            if not part.is_ai and part.user_id:
                await self.gamification.notify_challenge_task_progress(part.user_id, battle_id)

        return {
            "battle_id":    str(battle_id),
            "battle_type":  battle.battle_type.value,
            "subject":      battle.subject,
            "winners":      [part_to_dict(p) for p in winners],
            "participants": [part_to_dict(p) for p in ranked],
            "xp_awarded":   xp_awarded,
            "duration_sec": int((battle.ended_at - battle.started_at).total_seconds()) if battle.started_at else 0,
        }

    # ── Questions / spectators / replay ───────────────────────────────────────

    async def regenerate_questions(self, battle: Battle) -> list[dict]:
        """Generate and persist a fresh question set for `battle` (same
        subject/topic/difficulty), committing the change. Caller is
        responsible for the host/status checks before calling this."""
        questions = await self.lifecycle._generate_questions(
            subject=battle.subject, topic=battle.topic, board=battle.board,
            class_num=battle.class_num, difficulty=battle.difficulty,
            count=battle.question_count,
        )
        await gameplay_crud.save_battle_questions(self.db, battle, questions)
        return questions

    async def add_spectator(
        self, battle: Battle, user_id: uuid.UUID, display_name: str
    ) -> None:
        """Add `user_id` as a spectator to `battle` and bump its
        spectator_count, in one commit. Caller has already verified the
        battle is joinable and the user isn't already a spectator."""
        await gameplay_crud.add_spectator_row(self.db, battle, user_id, display_name)

    async def build_battle_replay(self, battle: Battle, participant: BattleParticipant) -> dict:
        """Build a full question-by-question replay payload for an already
        fetched, already-validated (completed battle + matching participant)
        battle/participant pair. The route performs the fetches (via
        `get_battle_by_id_or_none` / `get_participant_for_user`) and the
        not-found/not-completed checks; this only shapes the response."""
        battle_id = battle.id
        questions_raw = battle.questions or []
        answers_by_idx: dict = participant.answers or {}

        replay_questions = []
        for idx, q in enumerate(questions_raw):
            answer_entry = answers_by_idx.get(str(idx)) or answers_by_idx.get(idx)
            if isinstance(answer_entry, dict):
                your_answer = answer_entry.get("answer")
                points_earned = answer_entry.get("points", 0)
                is_correct = answer_entry.get("correct", False)
            else:
                # answer_entry may be just the answer string, or None if not answered
                your_answer = answer_entry
                correct_answer = q.get("correct_answer") or q.get("answer")
                is_correct = (your_answer == correct_answer) if your_answer is not None else False
                points_earned = 0

            replay_questions.append({
                "question_text":  q.get("text", ""),
                "options":        q.get("options", []),
                "correct_answer": q.get("correct_answer") or q.get("answer"),
                "your_answer":    your_answer,
                "is_correct":     is_correct,
                "points_earned":  points_earned,
                "explanation":    q.get("explanation"),  # null if not stored
            })

        return {
            "battle_id":    str(battle_id),
            "subject":      battle.subject,
            "type":         battle.battle_type.value,
            "completed_at": battle.ended_at.isoformat() if battle.ended_at else None,
            "questions":    replay_questions,
            "score":        participant.score,
            "accuracy":     participant.accuracy,
            "rank":         participant.rank,
            "xp_earned":    participant.xp_earned,
        }

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _simulate_ai_answers(self, ai_part: BattleParticipant, battle: Battle) -> None:
        """Simulate AI opponent answering based on difficulty."""
        accuracy_map = {"easy": 0.5, "medium": 0.7, "hard": 0.85}
        accuracy = accuracy_map.get(battle.difficulty, 0.7)
        questions = battle.questions or []
        answers: dict = {}
        score = 0
        correct_count = 0
        for i, q in enumerate(questions):
            if random.random() < accuracy:
                q_points = 100 + random.randint(0, 30)
                answers[str(i)] = {"answer": q.get("correct_answer", ""), "correct": True, "time_ms": random.randint(800, 4000), "points": q_points}
                score += q_points
                correct_count += 1
            else:
                wrong_opts = [o for o in q.get("options", []) if o != q.get("correct_answer")]
                answers[str(i)] = {"answer": random.choice(wrong_opts) if wrong_opts else "wrong", "correct": False, "time_ms": random.randint(2000, 8000), "points": 0}
        total = len(questions)
        ai_part.answers       = answers
        ai_part.score         = score
        ai_part.correct       = correct_count
        ai_part.wrong         = total - correct_count
        ai_part.accuracy      = (correct_count / total * 100) if total > 0 else 0
        lower = min(10, battle.time_limit_sec)
        upper = max(lower, battle.time_limit_sec - 10)
        ai_part.time_taken_sec = random.randint(lower, upper)

    def _calculate_xp(self, rank: int, total_players: int, accuracy: float) -> int:
        if total_players <= 2:
            xp = XP_TABLE["win"] if rank == 1 else XP_TABLE["loss"]
        else:
            xp = XP_TABLE.get(rank, XP_TABLE["loss"])
        if accuracy >= 100.0:
            xp += XP_TABLE["perfect"]
        return xp
