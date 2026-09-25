"""
Shared battle-service helpers: the by-id lookup that raises, and the
row → dict serializers. These are used by every one of the split battle
service classes (lifecycle / gameplay / query), so they live here as plain
module-level functions rather than being duplicated or owned by one class.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import query_crud
from app.models.battle import Battle
from app.models.participant import BattleParticipant

# XP reward table
XP_TABLE = {
    1: 500,   # 1st place
    2: 300,   # 2nd place
    3: 200,   # 3rd place
    "win":    100,  # win (solo / 1v1)
    "loss":    25,  # consolation
    "perfect": 50,  # bonus: 100% accuracy
}

# Friend-challenge stake bounds — the actual stake is chosen per battle by
# the challenger (Battle.stake_xp); winner takes it, loser pays it. Both
# players must hold >= the stake (see join_battle / the /challenge route).
CHALLENGE_MIN_STAKE_XP = 50
CHALLENGE_WIN_EDUPOINTS = 50


async def get_battle_or_raise(db: AsyncSession, battle_id: uuid.UUID) -> Battle:
    battle = await query_crud.get_battle_by_id(db, battle_id)
    if not battle:
        raise ValueError(f"Battle {battle_id} not found")
    return battle


def part_to_dict(p: BattleParticipant) -> dict:
    return {
        "user_id":      str(p.user_id) if p.user_id else None,
        "display_name": p.display_name,
        "avatar_url":   p.avatar_url,
        "is_ai":        p.is_ai,
        "score":        p.score,
        "correct":      p.correct,
        "wrong":        p.wrong,
        "accuracy":     round(p.accuracy, 1),
        "rank":         p.rank,
        "xp_earned":    p.xp_earned,
        "status":       p.status.value if p.status else "finished",
    }


def battle_to_dict(battle: Battle, participants: list[BattleParticipant]) -> dict:
    return {
        "id":           str(battle.id),
        "battle_type":  battle.battle_type.value,
        "status":       battle.status.value,
        "subject":      battle.subject,
        "topic":        battle.topic,
        "board":        battle.board,
        "class_num":    battle.class_num,
        "difficulty":   battle.difficulty,
        "question_count": battle.question_count,
        "time_limit_sec": battle.time_limit_sec,
        "max_players":  battle.max_players,
        "invite_code":   battle.invite_code,
        "share_code":    battle.share_code,
        "team_a_name":   battle.team_a_name,
        "team_b_name":   battle.team_b_name,
        "team_a_score":  battle.team_a_score,
        "team_b_score":  battle.team_b_score,
        "class_a":       battle.class_a,
        "class_b":       battle.class_b,
        "school_a":      battle.school_a,
        "school_b":      battle.school_b,
        "spectator_count": battle.spectator_count,
        "participants":  [part_to_dict(p) for p in participants if not p.is_spectator],
        "scheduled_at":  battle.scheduled_at.isoformat() if battle.scheduled_at else None,
        "started_at":    battle.started_at.isoformat() if battle.started_at else None,
        "ended_at":      battle.ended_at.isoformat() if battle.ended_at else None,
        "created_at":    battle.created_at.isoformat(),
    }
