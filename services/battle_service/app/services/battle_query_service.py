"""
Read-only battle queries — admin dashboards, open-battle listings, a
user's own battles, scheduled-battle reminders, single-battle fetches,
per-user stats, history and the global leaderboard.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import query_crud
from app.models.battle import Battle, BattleStatus
from app.models.participant import BattleParticipant
from app.services._common import battle_to_dict, get_battle_or_raise

logger = logging.getLogger(__name__)


def _aggregate_by_subject(recent: list[dict]) -> list[dict]:
    """Roll the already-built `recent` rows up per subject; battles with no
    subject (solo/open battles leave it null) are skipped."""
    buckets: dict[str, list[dict]] = {}
    for row in recent:
        if row["subject"]:
            buckets.setdefault(row["subject"], []).append(row)

    return [
        {
            "subject": subject,
            "played":  len(rows),
            "won":     sum(1 for r in rows if r["won"]),
            "avg_accuracy": round(sum(r["accuracy"] for r in rows) / len(rows), 1),
        }
        for subject, rows in buckets.items()
    ]


class BattleQueryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Admin / listing queries ───────────────────────────────────────────────

    async def get_admin_stats(self) -> dict:
        """Admin: aggregate battle stats — total, by status, by type, plus
        real duration/XP/win-loss metrics computed from actual battle rows
        (not estimated or hardcoded)."""
        rows = await query_crud.get_admin_stats_rows(self.db)

        completed = rows["by_status"].get(BattleStatus.COMPLETED.value, 0)
        cancelled = rows["by_status"].get(BattleStatus.CANCELLED.value, 0) + rows["by_status"].get(BattleStatus.ABANDONED.value, 0)

        played_sum = rows["played_sum"]
        won_sum = rows["won_sum"]

        return {
            "total": rows["total"],
            "by_status": rows["by_status"],
            "by_type": rows["by_type"],
            "completed_battles": completed,
            "cancelled_battles": cancelled,
            "avg_duration_sec": round(rows["avg_duration_sec"], 1) if rows["avg_duration_sec"] else None,
            "total_xp_exchanged": int(rows["total_xp_exchanged"]),
            "total_participants": rows["total_participants"],
            "win_loss": {
                "battles_played": played_sum,
                "battles_won": won_sum,
                "battles_lost": max(0, played_sum - won_sum),
            },
        }

    async def list_battles_admin(
        self,
        status: str | None,
        battle_type: str | None,
        page: int,
        limit: int,
    ) -> dict:
        """Admin: list all battles with optional filters."""
        battles, parts_by_battle, total = await query_crud.list_battles_admin_rows(
            self.db, status, battle_type, page, limit
        )

        result = []
        for b in battles:
            parts = parts_by_battle.get(b.id, [])
            result.append({
                "id":           str(b.id),
                "battle_type":  b.battle_type.value,
                "mode":         b.battle_type.value,
                "status":       b.status.value,
                "subject":      b.subject,
                "topic":        b.topic,
                "difficulty":   b.difficulty,
                "question_count": b.question_count,
                "max_players":  b.max_players,
                "players":      len(parts),
                "current_players": len(parts),
                "created_at":   b.created_at.isoformat(),
                "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
            })

        return {"battles": result, "total": total, "page": page, "limit": limit}

    async def list_open_battles(
        self,
        subject: str | None,
        battle_type: str | None,
        class_num: int | None,
        limit: int,
    ) -> dict:
        """List battles open for joining (waiting/starting) or spectating (active).

        `online_players` is set to 0 here — the route overwrites it per-row
        with the live WebSocket player count from the in-process connection
        manager, since that state lives outside the DB layer.
        """
        battles, parts_by_battle = await query_crud.list_open_battles_rows(
            self.db, subject, battle_type, class_num, limit
        )
        if not battles:
            return {"battles": [], "total": 0}

        result = []
        for b in battles:
            parts = parts_by_battle.get(b.id, [])
            result.append({
                "id":             str(b.id),
                "battle_type":    b.battle_type.value,
                "status":         b.status.value,
                "subject":        b.subject,
                "topic":          b.topic,
                "board":          b.board,
                "class_num":      b.class_num,
                "difficulty":     b.difficulty,
                "question_count": b.question_count,
                "time_limit_sec": b.time_limit_sec,
                "max_players":    b.max_players,
                # No invite_code here — this listing is the PUBLIC discovery
                # feed (private ONE_V_ONE/GROUP battles are excluded above);
                # a battle that needs an invite code to join has no business
                # being in a feed anyone can browse without one. Clients
                # join public battle types by id, not by code.
                "current_players": len(parts),
                "online_players":  0,
                "participants":   [
                    {"display_name": p.display_name, "avatar_url": p.avatar_url, "is_ai": p.is_ai}
                    for p in parts if not p.is_ai
                ],
                "created_at": b.created_at.isoformat(),
                "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
            })
        return {"battles": result, "total": len(result)}

    async def get_battle_by_id_or_none(self, battle_id: uuid.UUID) -> Battle | None:
        """Plain lookup by primary key, no 404 raised — callers decide."""
        return await query_crud.get_battle_by_id(self.db, battle_id)

    async def get_my_battles(self, host_user_id: uuid.UUID, limit: int, offset: int) -> dict:
        """Return battles created by `host_user_id`, newest first, paginated."""
        rows = await query_crud.get_my_battles_rows(self.db, host_user_id, limit, offset)
        battles = rows["battles"]
        if not battles:
            return {"battles": [], "total": 0, "limit": limit, "offset": offset}

        counts = rows["counts"]
        host_parts = rows["host_parts"]
        all_parts_by_battle = rows["all_parts_by_battle"]

        return {
            "battles": [
                {
                    "id":               str(b.id),
                    "battle_type":      b.battle_type.value,
                    "status":           b.status.value,
                    "subject":          b.subject,
                    "topic":            b.topic,
                    "difficulty":       b.difficulty,
                    "question_count":   b.question_count,
                    "time_limit_sec":   b.time_limit_sec,
                    "max_players":      b.max_players,
                    "invite_code":      b.invite_code,
                    "participant_count": counts.get(b.id, 1),
                    "created_at":       b.created_at.isoformat(),
                    "scheduled_at":     b.scheduled_at.isoformat() if b.scheduled_at else None,
                    # Host's own stats
                    "my_score":    host_parts[b.id].score    if b.id in host_parts else 0,
                    "my_correct":  host_parts[b.id].correct  if b.id in host_parts else 0,
                    "my_wrong":    host_parts[b.id].wrong    if b.id in host_parts else 0,
                    "my_accuracy": round(host_parts[b.id].accuracy, 1) if b.id in host_parts else 0.0,
                    "my_rank":     host_parts[b.id].rank     if b.id in host_parts else None,
                    "my_xp":       host_parts[b.id].xp_earned if b.id in host_parts else 0,
                    # Final standings (top 5)
                    "standings": [
                        {
                            "display_name": p.display_name,
                            "score":        p.score,
                            "correct":      p.correct,
                            "wrong":        p.wrong,
                            "accuracy":     round(p.accuracy, 1),
                            "rank":         p.rank,
                            "is_ai":        p.is_ai,
                        }
                        for p in all_parts_by_battle.get(b.id, [])[:5]
                    ],
                }
                for b in battles
            ],
            "total":  rows["total"],
            "limit":  limit,
            "offset": offset,
        }

    async def get_battles_starting_soon(self, lead_minutes: int) -> list[dict]:
        """[Internal] Battle Reminder feed — battles scheduled to start within
        `lead_minutes` that haven't been reminded yet, with their joined
        participants' user_ids. Atomically marks each returned battle as
        reminded (reminder_sent_at) in the same call, so a repeat poll never
        double-notifies."""
        battles = await query_crud.get_battles_starting_soon_rows(self.db, lead_minutes)
        if not battles:
            return []

        now = datetime.now(timezone.utc)
        out = []
        for battle in battles:
            participants = await query_crud.get_non_spectator_participants(self.db, battle.id)
            out.append({
                "battle_id": str(battle.id),
                "subject": battle.subject,
                "battle_type": battle.battle_type.value,
                "scheduled_at": battle.scheduled_at.isoformat(),
                "participant_user_ids": [str(p.user_id) for p in participants if p.user_id],
            })

        await query_crud.mark_battles_reminded(self.db, [b.id for b in battles], now)
        return out

    async def get_participant_for_user(
        self, battle_id: uuid.UUID, user_id: uuid.UUID
    ) -> BattleParticipant | None:
        """Plain lookup of a battle's participant row for `user_id` (any
        spectator status), no exception raised — callers decide."""
        return await query_crud.get_participant_for_user(self.db, battle_id, user_id)

    async def get_spectator_for_user(
        self, battle_id: uuid.UUID, user_id: uuid.UUID
    ) -> BattleParticipant | None:
        """Plain lookup of a battle's spectator row for `user_id`, no
        exception raised — callers decide."""
        return await query_crud.get_spectator_for_user(self.db, battle_id, user_id)

    # ── Queries ────────────────────────────────────────────────────────────────

    async def get_battle(self, battle_id: uuid.UUID) -> dict:
        battle = await get_battle_or_raise(self.db, battle_id)
        participants = await query_crud.get_participants_for_battle(self.db, battle_id)
        return battle_to_dict(battle, participants)

    async def get_user_stats(self, user_id: uuid.UUID) -> dict:
        stats = await query_crud.get_user_stats_row(self.db, user_id)
        if not stats:
            return {
                "user_id": str(user_id), "battles_played": 0, "battles_won": 0,
                "win_rate": 0.0, "total_score": 0, "total_xp_earned": 0,
                "win_streak": 0, "best_win_streak": 0,
            }
        win_rate = (stats.battles_won / stats.battles_played * 100) if stats.battles_played > 0 else 0
        return {
            "user_id":         str(user_id),
            "battles_played":  stats.battles_played,
            "battles_won":     stats.battles_won,
            "win_rate":        round(win_rate, 1),
            "total_score":     stats.total_score,
            "total_xp_earned": stats.total_xp_earned,
            "win_streak":      stats.win_streak,
            "best_win_streak": stats.best_win_streak,
        }

    async def get_history(self, user_id: uuid.UUID, limit: int = 20) -> list[dict]:
        rows = await query_crud.get_history_rows(self.db, user_id, limit)
        if not rows:
            return []

        history = []
        for part, battle, co_parts in rows:
            human_parts = [p for p in co_parts if not p.is_ai]
            if len(human_parts) <= 1:
                result = "won" if (part.rank == 1) else "lost"
            else:
                top_score = max(p.score for p in human_parts)
                if part.score == top_score:
                    result = "won" if sum(1 for p in human_parts if p.score == top_score) == 1 else "draw"
                else:
                    result = "lost"

            history.append({
                "battle_id":   str(battle.id),
                "battle_type": battle.battle_type.value,
                "subject":     battle.subject,
                "difficulty":  battle.difficulty,
                "score":       part.score,
                "rank":        part.rank,
                "xp_earned":   part.xp_earned,
                "result":      result,
                "played_at":   battle.ended_at.isoformat() if battle.ended_at else None,
            })
        return history

    async def get_student_summary(self, user_id: uuid.UUID, days: int, limit: int) -> dict:
        """[Internal] Parent-RAG feed — lifetime BattleStats plus this
        student's finished battles in the last `days`, aggregated by subject.
        Always returns a payload: zeros and empty lists when there's no data."""
        stats = await query_crud.get_user_stats_row(self.db, user_id)
        rows, counts = await query_crud.get_summary_rows(self.db, user_id, days, limit)

        recent = [
            {
                "battle_id":  str(battle.id),
                "subject":    battle.subject,
                "topic":      battle.topic,
                "difficulty": battle.difficulty,
                "class_num":  battle.class_num,
                "score":      part.score,
                "correct":    part.correct,
                "wrong":      part.wrong,
                "accuracy":   round(part.accuracy, 1),
                "rank":       part.rank,
                "xp_earned":  part.xp_earned,
                "time_taken_sec": part.time_taken_sec,
                "participant_count": counts.get(battle.id, 1),
                "won":        part.rank == 1,
                "ended_at":   battle.ended_at.isoformat() if battle.ended_at else None,
            }
            for part, battle in rows
        ]

        return {
            "user_id": str(user_id),
            "stats": {
                "battles_played":  stats.battles_played if stats else 0,
                "battles_won":     stats.battles_won if stats else 0,
                "total_score":     stats.total_score if stats else 0,
                "total_xp_earned": stats.total_xp_earned if stats else 0,
                "win_streak":      stats.win_streak if stats else 0,
                "best_win_streak": stats.best_win_streak if stats else 0,
            },
            "recent": recent,
            "by_subject": _aggregate_by_subject(recent),
        }

    async def get_leaderboard(self, limit: int = 20) -> list[dict]:
        rows = await query_crud.get_leaderboard_rows(self.db, limit)
        return [
            {
                "user_id":        str(s.user_id),
                "battles_played": s.battles_played,
                "battles_won":    s.battles_won,
                "total_xp_earned": s.total_xp_earned,
                "win_streak":     s.best_win_streak,
            }
            for s in rows
        ]
