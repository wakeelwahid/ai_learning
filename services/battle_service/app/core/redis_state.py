"""
Live battle state in Redis — zero DB calls during active gameplay.

Key schema
----------
battle:{id}:state          HASH  — status, q_index, start_time, end_time, total_questions
battle:{id}:questions      STRING (JSON array) — full question list, loaded at start
battle:{id}:scores         ZSET  — user_id → cumulative score (O(log n) update + ranking)
battle:{id}:pstats:{uid}   HASH  — correct, wrong per player (for accuracy)
battle:{id}:q_answers:{q}  HASH  — user_id → answer JSON per question
battle:{id}:events         Pub/Sub channel for WebSocket broadcasting
"""
import json
import logging
import time

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

BATTLE_TTL = 7_200  # 2 hours in seconds


class RedisBattleState:

    # ── Key helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _state_key(bid: str)         -> str: return f"battle:{bid}:state"
    @staticmethod
    def _questions_key(bid: str)     -> str: return f"battle:{bid}:questions"
    @staticmethod
    def _scores_key(bid: str)        -> str: return f"battle:{bid}:scores"
    @staticmethod
    def _pstats_key(bid: str, uid: str) -> str: return f"battle:{bid}:pstats:{uid}"
    @staticmethod
    def _qanswers_key(bid: str, q: int) -> str: return f"battle:{bid}:q_answers:{q}"
    @staticmethod
    def events_channel(bid: str)     -> str: return f"battle:{bid}:events"

    # ── Init ────────────────────────────────────────────────────────────────────

    @classmethod
    async def init_battle(
        cls,
        battle_id: str,
        questions: list[dict],
        time_limit_sec: int,
        players: list[dict],          # [{user_id, display_name, avatar_url}]
    ) -> None:
        """Load battle into Redis at start time. Called from start_battle."""
        r = get_redis()
        now = time.time()
        end_time = now + time_limit_sec

        pipe = r.pipeline()
        pipe.hset(cls._state_key(battle_id), mapping={
            "status":          "active",
            "q_index":         "0",
            "total_questions": str(len(questions)),
            "start_time":      str(now),
            "end_time":        str(end_time),
            "time_limit_sec":  str(time_limit_sec),
        })
        pipe.expire(cls._state_key(battle_id), BATTLE_TTL)

        # Store questions (answers included — only server reads this)
        pipe.set(cls._questions_key(battle_id), json.dumps(questions), ex=BATTLE_TTL)

        # Seed each player's score at 0 so leaderboard shows them from start
        for p in players:
            uid = str(p["user_id"])
            pipe.zadd(cls._scores_key(battle_id), {uid: 0}, nx=True)
            pipe.hset(cls._pstats_key(battle_id, uid), mapping={"correct": 0, "wrong": 0, "display_name": p.get("display_name", ""), "avatar_url": p.get("avatar_url") or ""})
            pipe.expire(cls._pstats_key(battle_id, uid), BATTLE_TTL)
        pipe.expire(cls._scores_key(battle_id), BATTLE_TTL)
        await pipe.execute()
        logger.info("Redis state initialised for battle %s (%d players)", battle_id, len(players))

    # ── Question access ─────────────────────────────────────────────────────────

    @classmethod
    async def get_question(cls, battle_id: str, q_idx: int) -> dict | None:
        r = get_redis()
        raw = await r.get(cls._questions_key(battle_id))
        if not raw:
            return None
        questions: list = json.loads(raw)
        if q_idx >= len(questions):
            return None
        return questions[q_idx]

    @classmethod
    async def get_all_questions(cls, battle_id: str) -> list[dict]:
        r = get_redis()
        raw = await r.get(cls._questions_key(battle_id))
        return json.loads(raw) if raw else []

    # ── Answer submission (zero DB) ─────────────────────────────────────────────

    @classmethod
    async def submit_answer(
        cls,
        battle_id: str,
        user_id: str,
        question_idx: int,
        answer: str,
        correct_answer: str,
        time_taken_ms: int,
    ) -> dict:
        r = get_redis()
        qkey = cls._qanswers_key(battle_id, question_idx)

        # Idempotent — reject duplicate answers atomically. Re-derive the
        # full response shape (not just already_answered/score) from the
        # originally-stored answer payload, so a resubmit (e.g. a WS
        # reconnect resending a pending answer) gets the same complete
        # shape a first-time submission does — the route handler
        # unconditionally reads correct/accuracy/correct_answer off this
        # return value and has no fallback for a partial shape.
        if await r.hexists(qkey, user_id):
            score_raw = await r.zscore(cls._scores_key(battle_id), user_id)
            stored_raw = await r.hget(qkey, user_id)
            stored = json.loads(stored_raw) if stored_raw else {}
            pstats_key = cls._pstats_key(battle_id, user_id)
            stats = await r.hmget(pstats_key, "correct", "wrong")
            correct_cnt = int(stats[0] or 0)
            wrong_cnt = int(stats[1] or 0)
            total = correct_cnt + wrong_cnt
            accuracy = round(correct_cnt / total * 100, 1) if total > 0 else 0.0
            return {
                "already_answered": True,
                "is_correct":       stored.get("correct", False),
                "correct":          stored.get("correct", False),
                "correct_answer":   correct_answer,
                "points":           stored.get("points", 0),
                "score":            int(score_raw or 0),
                "accuracy":         accuracy,
            }

        is_correct = answer.strip().lower() == correct_answer.strip().lower()
        speed_bonus = max(0, 50 - (time_taken_ms // 100)) if is_correct else 0
        points = (100 + speed_bonus) if is_correct else 0

        ans_payload = json.dumps({
            "answer":    answer,
            "correct":   is_correct,
            "time_ms":   time_taken_ms,
            "points":    points,
        })

        pipe = r.pipeline()
        pipe.hset(qkey, user_id, ans_payload)
        pipe.expire(qkey, BATTLE_TTL)
        if points > 0:
            pipe.zincrby(cls._scores_key(battle_id), points, user_id)
        # Update per-player stats
        pstats_key = cls._pstats_key(battle_id, user_id)
        if is_correct:
            pipe.hincrby(pstats_key, "correct", 1)
        else:
            pipe.hincrby(pstats_key, "wrong", 1)
        await pipe.execute()

        # Read back current score
        score_raw = await r.zscore(cls._scores_key(battle_id), user_id)
        current_score = int(score_raw or 0)

        # Compute accuracy
        stats = await r.hmget(pstats_key, "correct", "wrong")
        correct_cnt = int(stats[0] or 0)
        wrong_cnt   = int(stats[1] or 0)
        total = correct_cnt + wrong_cnt
        accuracy = round(correct_cnt / total * 100, 1) if total > 0 else 0.0

        return {
            "already_answered": False,
            "is_correct":       is_correct,
            "correct":          is_correct,
            "correct_answer":   correct_answer,
            "points":           points,
            "score":            current_score,
            "accuracy":         accuracy,
        }

    # ── Live leaderboard ────────────────────────────────────────────────────────

    @classmethod
    async def get_leaderboard(cls, battle_id: str) -> list[dict]:
        """Return ranked list from Redis ZSET — O(n log n), ~<1ms."""
        r = get_redis()
        entries = await r.zrevrange(cls._scores_key(battle_id), 0, -1, withscores=True)
        result = []
        for rank, (uid, score) in enumerate(entries, start=1):
            stats = await r.hmget(cls._pstats_key(battle_id, uid), "correct", "wrong", "display_name", "avatar_url")
            correct = int(stats[0] or 0)
            wrong   = int(stats[1] or 0)
            total   = correct + wrong
            accuracy = round(correct / total * 100, 1) if total > 0 else 0.0
            result.append({
                "user_id":      uid,
                "score":        int(score),
                "rank":         rank,
                "correct":      correct,
                "wrong":        wrong,
                "accuracy":     accuracy,
                "display_name": stats[2] or "",
                "avatar_url":   stats[3] or None,
                "is_ai":        False,
            })
        return result

    @classmethod
    async def get_scores(cls, battle_id: str) -> dict[str, int]:
        """Dict of user_id → score. Used when flushing to DB."""
        r = get_redis()
        entries = await r.zrange(cls._scores_key(battle_id), 0, -1, withscores=True)
        return {uid: int(score) for uid, score in entries}

    @classmethod
    async def get_player_answers(cls, battle_id: str, total_questions: int) -> dict[str, list[dict]]:
        """Per-player answer map for all questions. Used in finish_battle."""
        r = get_redis()
        result: dict[str, list[dict]] = {}
        for q_idx in range(total_questions):
            answers = await r.hgetall(cls._qanswers_key(battle_id, q_idx))
            for uid, raw in answers.items():
                data = json.loads(raw)
                result.setdefault(uid, []).append({str(q_idx): data})
        return result

    # ── State queries ───────────────────────────────────────────────────────────

    @classmethod
    async def get_state(cls, battle_id: str) -> dict | None:
        r = get_redis()
        state = await r.hgetall(cls._state_key(battle_id))
        return state if state else None

    @classmethod
    async def is_active(cls, battle_id: str) -> bool:
        r = get_redis()
        status = await r.hget(cls._state_key(battle_id), "status")
        return status == "active"

    # ── Pub/Sub publishing ──────────────────────────────────────────────────────

    @classmethod
    async def publish(
        cls, battle_id: str, origin_instance: str, message: dict,
        exclude_user: str | None = None, only_user: str | None = None,
    ) -> None:
        r = get_redis()
        try:
            await r.publish(
                cls.events_channel(battle_id),
                json.dumps({
                    "origin": origin_instance, "msg": message,
                    "exclude": exclude_user, "only": only_user,
                }),
            )
        except Exception as exc:
            logger.warning("Redis publish failed for battle %s: %s", battle_id, exc)

    # ── Cleanup ─────────────────────────────────────────────────────────────────

    @classmethod
    async def cleanup(cls, battle_id: str) -> None:
        """Delete all Redis keys for a finished battle."""
        r = get_redis()
        pattern = f"battle:{battle_id}:*"
        keys = await r.keys(pattern)
        if keys:
            await r.delete(*keys)
        logger.info("Redis state cleaned up for battle %s", battle_id)
