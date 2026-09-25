import uuid

from sqlalchemy import select
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.battle import Battle
from app.models.participant import BattleParticipant, ParticipantStatus
from app.models.stats import BattleStats


async def bulk_update_participant_scores(db: AsyncSession, battle_id: uuid.UUID, leaderboard: list[dict]) -> None:
    """Flush Redis live scores → DB for every entry in `leaderboard`."""
    for entry in leaderboard:
        await db.execute(
            sql_update(BattleParticipant)
            .where(
                BattleParticipant.battle_id == battle_id,
                BattleParticipant.user_id == uuid.UUID(entry["user_id"]),
            )
            .values(
                score=entry["score"],
                correct=entry["correct"],
                wrong=entry["wrong"],
                accuracy=entry["accuracy"],
            )
        )
    if leaderboard:
        await db.flush()


async def commit_only(db: AsyncSession) -> None:
    await db.commit()


async def save_battle_questions(db: AsyncSession, battle: Battle, questions: list[dict]) -> None:
    battle.questions = questions
    await db.commit()


async def add_spectator_row(db: AsyncSession, battle: Battle, user_id: uuid.UUID, display_name: str) -> None:
    spectator = BattleParticipant(
        battle_id=battle.id,
        user_id=user_id,
        display_name=display_name,
        is_spectator=True,
        status=ParticipantStatus.JOINED,
    )
    db.add(spectator)
    battle.spectator_count = (battle.spectator_count or 0) + 1
    await db.commit()


async def upsert_battle_stats(db: AsyncSession, user_id: uuid.UUID, part: BattleParticipant) -> None:
    res = await db.execute(select(BattleStats).where(BattleStats.user_id == user_id))
    stats = res.scalar_one_or_none()
    won = part.rank == 1
    if not stats:
        stats = BattleStats(
            user_id=user_id,
            battles_played=1, battles_won=1 if won else 0,
            total_score=part.score, total_xp_earned=part.xp_earned,
            win_streak=1 if won else 0, best_win_streak=1 if won else 0,
        )
        db.add(stats)
    else:
        stats.battles_played  += 1
        stats.total_score     += part.score
        stats.total_xp_earned += part.xp_earned
        if won:
            stats.battles_won  += 1
            stats.win_streak   += 1
            if stats.win_streak > stats.best_win_streak:
                stats.best_win_streak = stats.win_streak
        else:
            stats.win_streak = 0
    await db.flush()
