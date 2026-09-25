import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.battle import Battle, BattleStatus
from app.models.participant import BattleParticipant, ParticipantStatus


async def insert_battle(db: AsyncSession, battle: Battle) -> Battle:
    db.add(battle)
    await db.flush()
    return battle


async def insert_participant(db: AsyncSession, participant: BattleParticipant) -> BattleParticipant:
    db.add(participant)
    return participant


async def commit_and_refresh(db: AsyncSession, battle: Battle) -> Battle:
    await db.commit()
    await db.refresh(battle)
    return battle


async def get_battle_by_invite_code(db: AsyncSession, invite_code: str) -> Battle | None:
    result = await db.execute(
        select(Battle).where(
            Battle.invite_code == invite_code.upper(),
            Battle.status.in_([BattleStatus.WAITING, BattleStatus.STARTING]),
        )
    )
    return result.scalar_one_or_none()


async def get_participant_by_battle_and_user(
    db: AsyncSession, battle_id: uuid.UUID, user_id: uuid.UUID
) -> BattleParticipant | None:
    existing = await db.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.user_id == user_id,
        )
    )
    return existing.scalar_one_or_none()


async def count_participants(db: AsyncSession, battle_id: uuid.UUID) -> int:
    count_res = await db.execute(
        select(BattleParticipant).where(BattleParticipant.battle_id == battle_id)
    )
    return len(count_res.scalars().all())


async def set_battle_active(db: AsyncSession, battle: Battle) -> Battle:
    battle.status = BattleStatus.ACTIVE
    battle.started_at = datetime.now(timezone.utc)
    await db.execute(
        sql_update(BattleParticipant)
        .where(BattleParticipant.battle_id == battle.id)
        .values(status=ParticipantStatus.ACTIVE)
    )
    await db.commit()
    await db.refresh(battle)
    return battle
