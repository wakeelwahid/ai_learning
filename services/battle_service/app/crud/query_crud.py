import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.battle import Battle, BattleStatus, BattleType
from app.models.participant import BattleParticipant, ParticipantStatus
from app.models.stats import BattleStats


async def get_battle_by_id(db: AsyncSession, battle_id: uuid.UUID) -> Battle | None:
    res = await db.execute(select(Battle).where(Battle.id == battle_id))
    return res.scalar_one_or_none()


async def get_participants_for_battle(db: AsyncSession, battle_id: uuid.UUID) -> list[BattleParticipant]:
    parts_res = await db.execute(
        select(BattleParticipant).where(BattleParticipant.battle_id == battle_id)
    )
    return list(parts_res.scalars().all())


async def has_completed_specific_battle(db: AsyncSession, user_id: uuid.UUID, battle_id: uuid.UUID) -> bool:
    """True if this user finished THIS specific battle (participant row with
    status="finished"). Used by the internal
    /battles/internal/completed/{user_id}/{battle_id} route —
    gamification_service's Challenge Programs feature calls this to verify
    a battle-type challenge task server-side. No "any battle" precedent
    exists in this service (unlike content_service/quiz_service), so this
    is the first completion-check endpoint added here."""
    result = await db.execute(
        select(BattleParticipant.id).where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.user_id == user_id,
            BattleParticipant.status == ParticipantStatus.FINISHED,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_admin_stats_rows(db: AsyncSession) -> dict:
    """All the raw aggregate queries behind the admin stats dashboard."""
    total = await db.scalar(select(func.count(Battle.id))) or 0

    status_res = await db.execute(
        select(Battle.status, func.count(Battle.id)).group_by(Battle.status)
    )
    by_status = {row[0].value: row[1] for row in status_res.all()}

    type_res = await db.execute(
        select(Battle.battle_type, func.count(Battle.id)).group_by(Battle.battle_type)
    )
    by_type = {row[0].value: row[1] for row in type_res.all()}

    avg_duration_sec = await db.scalar(
        select(func.avg(func.extract("epoch", Battle.ended_at - Battle.started_at)))
        .where(
            Battle.status == BattleStatus.COMPLETED,
            Battle.started_at.is_not(None),
            Battle.ended_at.is_not(None),
        )
    )

    total_xp_exchanged = await db.scalar(
        select(func.sum(func.abs(BattleParticipant.xp_earned)))
        .where(BattleParticipant.is_ai.is_(False), BattleParticipant.user_id.is_not(None))
    ) or 0

    total_participants = await db.scalar(select(func.count(BattleParticipant.id))) or 0
    wins_losses = await db.execute(
        select(func.sum(BattleStats.battles_played), func.sum(BattleStats.battles_won))
    )
    played_sum, won_sum = wins_losses.first() or (0, 0)

    return {
        "total": total,
        "by_status": by_status,
        "by_type": by_type,
        "avg_duration_sec": avg_duration_sec,
        "total_xp_exchanged": total_xp_exchanged,
        "total_participants": total_participants,
        "played_sum": played_sum or 0,
        "won_sum": won_sum or 0,
    }


async def list_battles_admin_rows(
    db: AsyncSession, status: str | None, battle_type: str | None, page: int, limit: int,
) -> tuple[list[Battle], dict, int]:
    q = select(Battle)
    if status:
        try:
            q = q.where(Battle.status == BattleStatus[status.upper()])
        except KeyError:
            pass
    if battle_type:
        try:
            q = q.where(Battle.battle_type == BattleType[battle_type.upper()])
        except KeyError:
            pass
    q = q.order_by(Battle.created_at.desc()).offset((page - 1) * limit).limit(limit)
    res = await db.execute(q)
    battles = list(res.scalars().all())

    parts_res = await db.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id.in_([b.id for b in battles])
        )
    )
    all_parts = parts_res.scalars().all()
    parts_by_battle: dict = {}
    for p in all_parts:
        parts_by_battle.setdefault(p.battle_id, []).append(p)

    total_res = await db.execute(select(Battle))
    total = len(total_res.scalars().all())

    return battles, parts_by_battle, total


async def list_open_battles_rows(
    db: AsyncSession, subject: str | None, battle_type: str | None, class_num: int | None, limit: int,
) -> tuple[list[Battle], dict]:
    # Exclude every type battle-creation itself treats as invite-only (see
    # `private_types` in battle_lifecycle_service.py's create_battle — 1v1,
    # group, class_battle, school_battle, team, study_party all get a real
    # invite_code generated specifically because they're NOT meant to be
    # publicly discoverable). Listing them here would let a stranger find
    # and pre-empt a friend's private challenge before the intended
    # recipient joins it — only genuinely open types belong in this feed.
    OPEN_TYPES = [
        BattleType.PUBLIC, BattleType.SUBJECT, BattleType.CHAPTER,
    ]
    q = select(Battle).where(
        Battle.status.in_([BattleStatus.WAITING, BattleStatus.STARTING, BattleStatus.ACTIVE]),
        Battle.battle_type.in_(OPEN_TYPES),
    )
    if subject:
        q = q.where(Battle.subject.ilike(f"%{subject}%"))
    if battle_type:
        q = q.where(Battle.battle_type == battle_type)
    if class_num:
        q = q.where(Battle.class_num == class_num)
    q = q.order_by(Battle.created_at.desc()).limit(limit)

    res = await db.execute(q)
    battles = list(res.scalars().all())
    if not battles:
        return [], {}

    battle_ids = [b.id for b in battles]
    parts_res = await db.execute(
        select(BattleParticipant).where(BattleParticipant.battle_id.in_(battle_ids))
    )
    all_parts = parts_res.scalars().all()
    parts_by_battle: dict = {}
    for p in all_parts:
        parts_by_battle.setdefault(p.battle_id, []).append(p)
    return battles, parts_by_battle


async def get_my_battles_rows(db: AsyncSession, host_user_id: uuid.UUID, limit: int, offset: int) -> dict:
    uid = host_user_id
    total_res = await db.execute(
        select(func.count(Battle.id)).where(Battle.host_user_id == uid)
    )
    total = total_res.scalar_one()

    res = await db.execute(
        select(Battle)
        .where(Battle.host_user_id == uid)
        .order_by(Battle.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    battles = list(res.scalars().all())

    if not battles:
        return {"battles": [], "total": 0, "limit": limit, "offset": offset, "counts": {}, "host_parts": {}, "all_parts_by_battle": {}}

    battle_ids = [b.id for b in battles]

    counts_res = await db.execute(
        select(BattleParticipant.battle_id, func.count(BattleParticipant.id))
        .where(
            BattleParticipant.battle_id.in_(battle_ids),
            BattleParticipant.is_ai == False,  # noqa: E712
            BattleParticipant.is_spectator == False,  # noqa: E712
        )
        .group_by(BattleParticipant.battle_id)
    )
    counts = {row[0]: row[1] for row in counts_res.all()}

    host_parts_res = await db.execute(
        select(BattleParticipant)
        .where(
            BattleParticipant.battle_id.in_(battle_ids),
            BattleParticipant.user_id == uid,
            BattleParticipant.is_spectator == False,  # noqa: E712
        )
    )
    host_parts = {p.battle_id: p for p in host_parts_res.scalars().all()}

    all_parts_res = await db.execute(
        select(BattleParticipant)
        .where(
            BattleParticipant.battle_id.in_(battle_ids),
            BattleParticipant.is_spectator == False,  # noqa: E712
        )
        .order_by(BattleParticipant.battle_id, BattleParticipant.score.desc())
    )
    all_parts_by_battle: dict = {}
    for p in all_parts_res.scalars().all():
        all_parts_by_battle.setdefault(p.battle_id, []).append(p)

    return {
        "battles": battles, "total": total, "limit": limit, "offset": offset,
        "counts": counts, "host_parts": host_parts, "all_parts_by_battle": all_parts_by_battle,
    }


async def get_battles_starting_soon_rows(db: AsyncSession, lead_minutes: int) -> list[Battle]:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(minutes=lead_minutes)

    result = await db.execute(
        select(Battle).where(
            and_(
                Battle.scheduled_at.isnot(None),
                Battle.scheduled_at >= now,
                Battle.scheduled_at <= window_end,
                Battle.reminder_sent_at.is_(None),
                Battle.status == BattleStatus.WAITING,
            )
        )
    )
    return list(result.scalars().all())


async def get_non_spectator_participants(db: AsyncSession, battle_id: uuid.UUID) -> list[BattleParticipant]:
    parts_result = await db.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.is_ai == False,  # noqa: E712
            BattleParticipant.is_spectator == False,  # noqa: E712
        )
    )
    return list(parts_result.scalars().all())


async def mark_battles_reminded(db: AsyncSession, battle_ids: list[uuid.UUID], reminded_at: datetime) -> None:
    await db.execute(
        sql_update(Battle)
        .where(Battle.id.in_(battle_ids))
        .values(reminder_sent_at=reminded_at)
    )
    await db.commit()


async def get_participant_for_user(
    db: AsyncSession, battle_id: uuid.UUID, user_id: uuid.UUID
) -> BattleParticipant | None:
    res = await db.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.user_id == user_id,
        )
    )
    return res.scalar_one_or_none()


async def get_spectator_for_user(
    db: AsyncSession, battle_id: uuid.UUID, user_id: uuid.UUID
) -> BattleParticipant | None:
    res = await db.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.user_id == user_id,
            BattleParticipant.is_spectator == True,  # noqa: E712
        )
    )
    return res.scalar_one_or_none()


async def get_user_stats_row(db: AsyncSession, user_id: uuid.UUID) -> BattleStats | None:
    res = await db.execute(
        select(BattleStats).where(BattleStats.user_id == user_id)
    )
    return res.scalar_one_or_none()


async def get_history_rows(db: AsyncSession, user_id: uuid.UUID, limit: int) -> list:
    parts_res = await db.execute(
        select(BattleParticipant, Battle)
        .join(Battle, Battle.id == BattleParticipant.battle_id)
        .where(
            BattleParticipant.user_id == user_id,
            Battle.status == BattleStatus.COMPLETED,
        )
        .order_by(Battle.ended_at.desc())
        .limit(limit)
    )
    rows = parts_res.all()
    if not rows:
        return []

    battle_ids = [battle.id for _, battle in rows]
    co_parts_res = await db.execute(
        select(BattleParticipant).where(BattleParticipant.battle_id.in_(battle_ids))
    )
    all_co_parts = co_parts_res.scalars().all()
    co_parts_by_battle: dict = {}
    for p in all_co_parts:
        co_parts_by_battle.setdefault(p.battle_id, []).append(p)

    return [(part, battle, co_parts_by_battle.get(battle.id, [])) for part, battle in rows]


async def get_summary_rows(
    db: AsyncSession, user_id: uuid.UUID, days: int, limit: int,
) -> tuple[list, dict[uuid.UUID, int]]:
    """[Internal] A user's finished battles in the last `days`, newest first,
    plus a {battle_id: non-spectator participant count} map built by ONE
    grouped query (never a per-battle lookup)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    res = await db.execute(
        select(BattleParticipant, Battle)
        .join(Battle, Battle.id == BattleParticipant.battle_id)
        .where(
            BattleParticipant.user_id == user_id,
            BattleParticipant.is_ai == False,  # noqa: E712
            BattleParticipant.is_spectator == False,  # noqa: E712
            Battle.ended_at.is_not(None),
            Battle.ended_at >= since,
        )
        .order_by(Battle.ended_at.desc())
        .limit(limit)
    )
    rows = res.all()
    if not rows:
        return [], {}

    counts_res = await db.execute(
        select(BattleParticipant.battle_id, func.count(BattleParticipant.id))
        .where(
            BattleParticipant.battle_id.in_([battle.id for _, battle in rows]),
            BattleParticipant.is_spectator == False,  # noqa: E712
        )
        .group_by(BattleParticipant.battle_id)
    )
    return rows, {row[0]: row[1] for row in counts_res.all()}


async def get_leaderboard_rows(db: AsyncSession, limit: int) -> list[BattleStats]:
    res = await db.execute(
        select(BattleStats)
        .order_by(BattleStats.total_xp_earned.desc(), BattleStats.battles_won.desc())
        .limit(limit)
    )
    return list(res.scalars().all())
