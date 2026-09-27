"""CRUD helpers for real-time chat: friend requests, chat rooms/members,
messages, read receipts, reactions, and parent-monitoring audit logs
(app/routes/chat.py) plus the WebSocket sibling (app/routes/chat_ws.py)."""
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import (
    ChatMessage,
    ChatMute,
    ChatRoom,
    ChatRoomMember,
    ContentReport,
    FriendRequest,
    MessageReaction,
    MessageReadReceipt,
    MsgStatus,
    ParentAuditLog,
    ReportStatus,
    RequestStatus,
    RoomType,
)
from app.models.user_profile import ParentProfile, UserProfile


async def get_room_member_ids(db: AsyncSession, room_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(ChatRoomMember.user_id).where(ChatRoomMember.room_id == room_id)
    )
    return [str(row[0]) for row in result]


async def mark_message_read(db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Set a ChatMessage's status to READ and upsert a read receipt row for `user_id`."""
    await db.execute(
        update(ChatMessage)
        .where(ChatMessage.id == message_id)
        .values(status=MsgStatus.READ)
    )
    stmt = pg_insert(MessageReadReceipt).values(
        message_id=message_id, user_id=user_id
    ).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()


# ── Directory search (GET /chat/search) ────────────────────────────────────

async def get_user_profiles_page_and_total(
    db: AsyncSession, q_norm: str, offset: int, limit: int
) -> tuple[int, list[UserProfile]]:
    """Total matching UserProfile count plus one page of rows — the two
    queries the directory cache miss path always runs together. Empty
    `q_norm` means the unfiltered DISCOVER list."""
    filters = []
    if q_norm:
        pattern = f"%{q_norm}%"
        filters.append(or_(
            UserProfile.full_name.ilike(pattern),
            UserProfile.school_name.ilike(pattern),
        ))
    base = select(UserProfile).where(*filters) if filters else select(UserProfile)
    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()
    result = await db.execute(
        base.order_by(UserProfile.created_at.desc(), UserProfile.id)
        .offset(offset)
        .limit(limit)
    )
    return int(total), list(result.scalars().all())


async def get_friend_requests_between(
    db: AsyncSession, caller_uid: uuid.UUID, target_ids: list[uuid.UUID]
) -> list[FriendRequest]:
    result = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(
                    FriendRequest.from_user_id == caller_uid,
                    FriendRequest.to_user_id.in_(target_ids),
                ),
                and_(
                    FriendRequest.to_user_id == caller_uid,
                    FriendRequest.from_user_id.in_(target_ids),
                ),
            )
        )
    )
    return list(result.scalars().all())


# ── Friend requests ─────────────────────────────────────────────────────────

async def find_active_friend_link(
    db: AsyncSession, from_uid: uuid.UUID, to_uid: uuid.UUID
) -> FriendRequest | None:
    """Existing PENDING/ACCEPTED FriendRequest between the two users, either direction."""
    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(
                    FriendRequest.from_user_id == from_uid,
                    FriendRequest.to_user_id == to_uid,
                    FriendRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED]),
                ),
                and_(
                    FriendRequest.from_user_id == to_uid,
                    FriendRequest.to_user_id == from_uid,
                    FriendRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED]),
                ),
            )
        )
    )
    return existing.scalar_one_or_none()


async def find_rejected_friend_link(
    db: AsyncSession, from_uid: uuid.UUID, to_uid: uuid.UUID
) -> FriendRequest | None:
    """A previously-REJECTED edge (either direction) between the two users, if any."""
    rejected_row = await db.execute(
        select(FriendRequest).where(
            and_(
                FriendRequest.status == RequestStatus.REJECTED,
                or_(
                    and_(FriendRequest.from_user_id == from_uid, FriendRequest.to_user_id == to_uid),
                    and_(FriendRequest.from_user_id == to_uid, FriendRequest.to_user_id == from_uid),
                ),
            )
        )
    )
    return rejected_row.scalars().first()


async def get_user_profile(db: AsyncSession, user_id: uuid.UUID) -> UserProfile | None:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    return result.scalar_one_or_none()


async def reactivate_rejected_request(
    db: AsyncSession, fr: FriendRequest, from_uid: uuid.UUID, to_uid: uuid.UUID
) -> FriendRequest:
    """Facebook-style re-request: reuse a REJECTED row (unique (from,to)
    constraint) rather than inserting a duplicate. Commits so the caller can
    safely serialize server-generated columns (updated_at) right after."""
    fr.from_user_id = from_uid
    fr.to_user_id = to_uid
    fr.status = RequestStatus.PENDING
    await db.commit()
    # UPDATE flush/commit expires server-onupdate columns (updated_at) —
    # refresh before the sync serializer reads them, or it raises MissingGreenlet.
    await db.refresh(fr)
    return fr


async def create_friend_request(
    db: AsyncSession, from_uid: uuid.UUID, to_uid: uuid.UUID
) -> FriendRequest:
    """Note: intentionally does NOT refresh() after commit, matching the
    original route behavior (only the reuse-a-rejected-row path refreshes) —
    `fr.created_at`/`updated_at` may serialize as None here, same as before."""
    fr = FriendRequest(from_user_id=from_uid, to_user_id=to_uid)
    db.add(fr)
    await db.commit()
    return fr


async def count_pending_incoming_requests(db: AsyncSession, uid: uuid.UUID) -> int:
    count = (await db.execute(
        select(func.count()).select_from(FriendRequest).where(
            and_(
                FriendRequest.to_user_id == uid,
                FriendRequest.status == RequestStatus.PENDING,
            )
        )
    )).scalar_one()
    return int(count)


async def get_pending_requests_by_side(
    db: AsyncSession, own_side_col, uid: uuid.UUID
) -> list[FriendRequest]:
    result = await db.execute(
        select(FriendRequest)
        .where(and_(own_side_col == uid, FriendRequest.status == RequestStatus.PENDING))
        .order_by(FriendRequest.created_at.desc())
    )
    return list(result.scalars().all())


async def get_user_profiles_by_ids(
    db: AsyncSession, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, UserProfile]:
    profiles_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id.in_(user_ids))
    )
    return {p.user_id: p for p in profiles_result.scalars().all()}


async def get_friend_request_by_id(
    db: AsyncSession, request_id: uuid.UUID
) -> FriendRequest | None:
    result = await db.execute(select(FriendRequest).where(FriendRequest.id == request_id))
    return result.scalar_one_or_none()


async def delete_friend_request(db: AsyncSession, fr: FriendRequest) -> None:
    await db.delete(fr)
    await db.commit()


async def update_friend_request_status(
    db: AsyncSession, fr: FriendRequest, status: RequestStatus
) -> ChatRoom | None:
    """Set `fr.status` and, when accepting, create a DIRECT chat room between
    the two users plus both membership rows — all as ONE transaction with a
    single commit at the end (matching the original route, where the status
    change and the conditional room/member writes shared one trailing
    db.flush()). Returns the created room, or None when not accepting."""
    fr.status = status

    room: ChatRoom | None = None
    if status == RequestStatus.ACCEPTED:
        room = ChatRoom(type=RoomType.DIRECT, created_by=fr.from_user_id)
        db.add(room)
        await db.flush()

        for uid_val in (fr.from_user_id, fr.to_user_id):
            stmt = (
                pg_insert(ChatRoomMember)
                .values(room_id=room.id, user_id=uid_val, is_admin=False)
                .on_conflict_do_nothing(index_elements=["room_id", "user_id"])
            )
            await db.execute(stmt)

    await db.commit()
    await db.refresh(fr)
    return room


# ── Rooms ────────────────────────────────────────────────────────────────────

async def get_memberships_for_user(db: AsyncSession, uid: uuid.UUID) -> list[ChatRoomMember]:
    result = await db.execute(select(ChatRoomMember).where(ChatRoomMember.user_id == uid))
    return list(result.scalars().all())


async def get_rooms_by_ids(db: AsyncSession, room_ids: list[uuid.UUID]) -> dict[uuid.UUID, ChatRoom]:
    result = await db.execute(select(ChatRoom).where(ChatRoom.id.in_(room_ids)))
    return {r.id: r for r in result.scalars().all()}


async def get_last_messages_by_room(
    db: AsyncSession, room_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ChatMessage]:
    last_msg_subq = (
        select(
            ChatMessage.room_id,
            func.max(ChatMessage.created_at).label("last_at"),
        )
        .where(ChatMessage.room_id.in_(room_ids))
        .group_by(ChatMessage.room_id)
        .subquery()
    )
    last_msgs_result = await db.execute(
        select(ChatMessage).join(
            last_msg_subq,
            and_(
                ChatMessage.room_id == last_msg_subq.c.room_id,
                ChatMessage.created_at == last_msg_subq.c.last_at,
            ),
        )
    )
    return {m.room_id: m for m in last_msgs_result.scalars().all()}


async def get_unread_counts_by_room(
    db: AsyncSession, room_ids: list[uuid.UUID], uid: uuid.UUID
) -> dict[uuid.UUID, int]:
    unread_result = await db.execute(
        select(ChatMessage.room_id, func.count(ChatMessage.id).label("cnt"))
        .where(
            and_(
                ChatMessage.room_id.in_(room_ids),
                ChatMessage.sender_id != uid,
                ChatMessage.status != MsgStatus.READ,
                ~ChatMessage.id.in_(
                    select(MessageReadReceipt.message_id).where(
                        MessageReadReceipt.user_id == uid
                    )
                ),
            )
        )
        .group_by(ChatMessage.room_id)
    )
    return {row.room_id: row.cnt for row in unread_result}


async def get_members_by_rooms(
    db: AsyncSession, room_ids: list[uuid.UUID]
) -> list[ChatRoomMember]:
    result = await db.execute(
        select(ChatRoomMember).where(ChatRoomMember.room_id.in_(room_ids))
    )
    return list(result.scalars().all())


async def get_group_creation_count(db: AsyncSession, creator_uid: uuid.UUID) -> int:
    existing_groups_result = await db.execute(
        select(func.count(ChatRoom.id)).where(
            and_(
                ChatRoom.created_by == creator_uid,
                ChatRoom.type == RoomType.GROUP,
            )
        )
    )
    return existing_groups_result.scalar_one()


async def create_group_room(
    db: AsyncSession, creator_uid: uuid.UUID, group_name: str, member_uids: list[uuid.UUID]
) -> ChatRoom:
    """Create a GROUP room, add the creator as admin, and add every other
    member — one transaction, one commit for the whole sequence."""
    room = ChatRoom(type=RoomType.GROUP, name=group_name, created_by=creator_uid)
    db.add(room)
    await db.flush()

    db.add(ChatRoomMember(room_id=room.id, user_id=creator_uid, is_admin=True))

    for mid in member_uids:
        stmt = (
            pg_insert(ChatRoomMember)
            .values(room_id=room.id, user_id=mid, is_admin=False)
            .on_conflict_do_nothing(index_elements=["room_id", "user_id"])
        )
        await db.execute(stmt)

    await db.commit()
    # Load server-generated defaults (created_at) before serializing —
    # without this the response's created_at can be null pre-commit.
    await db.refresh(room)
    return room


async def get_room_by_id(db: AsyncSession, room_id: uuid.UUID) -> ChatRoom | None:
    result = await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))
    return result.scalar_one_or_none()


async def get_room_membership(
    db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID
) -> ChatRoomMember | None:
    result = await db.execute(
        select(ChatRoomMember).where(
            and_(
                ChatRoomMember.room_id == room_id,
                ChatRoomMember.user_id == user_id,
            )
        )
    )
    return result.scalar_one_or_none()


async def count_room_members(db: AsyncSession, room_id: uuid.UUID) -> int:
    count_result = await db.execute(
        select(func.count(ChatRoomMember.id)).where(ChatRoomMember.room_id == room_id)
    )
    return count_result.scalar_one()


async def add_room_member(db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID) -> None:
    stmt = (
        pg_insert(ChatRoomMember)
        .values(room_id=room_id, user_id=user_id, is_admin=False)
        .on_conflict_do_nothing(index_elements=["room_id", "user_id"])
    )
    await db.execute(stmt)
    await db.commit()


async def rename_room(db: AsyncSession, room: ChatRoom, new_name: str) -> None:
    room.name = new_name
    await db.commit()


async def delete_room(db: AsyncSession, room: ChatRoom) -> None:
    await db.delete(room)  # chat_messages + chat_room_members cascade
    await db.commit()


async def delete_room_member(db: AsyncSession, member_row: ChatRoomMember) -> None:
    await db.delete(member_row)
    await db.commit()


# ── Messages ─────────────────────────────────────────────────────────────────

async def get_messages_page(
    db: AsyncSession, conditions: list, order_clause, limit: int
) -> list[ChatMessage]:
    msgs_result = await db.execute(
        select(ChatMessage)
        .where(and_(*conditions))
        .order_by(order_clause)
        .limit(limit)
    )
    return list(msgs_result.scalars().all())


async def mark_messages_delivered(db: AsyncSession, msg_ids: list[uuid.UUID]) -> None:
    await db.execute(
        update(ChatMessage)
        .where(
            and_(
                ChatMessage.id.in_(msg_ids),
                ChatMessage.status == MsgStatus.SENT,
            )
        )
        .values(status=MsgStatus.DELIVERED)
    )
    await db.commit()


async def get_read_receipts_for_messages(
    db: AsyncSession, msg_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[str]]:
    receipts_result = await db.execute(
        select(MessageReadReceipt).where(MessageReadReceipt.message_id.in_(msg_ids))
    )
    receipts_by_msg: dict[uuid.UUID, list[str]] = {}
    for receipt in receipts_result.scalars().all():
        receipts_by_msg.setdefault(receipt.message_id, []).append(str(receipt.user_id))
    return receipts_by_msg


async def get_messages_by_ids(db: AsyncSession, msg_ids: list[uuid.UUID]) -> list[ChatMessage]:
    result = await db.execute(select(ChatMessage).where(ChatMessage.id.in_(msg_ids)))
    return list(result.scalars().all())


async def get_reactions_for_messages(
    db: AsyncSession, msg_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, Any]]:
    reactions_result = await db.execute(
        select(MessageReaction).where(MessageReaction.message_id.in_(msg_ids))
    )
    reactions_by_msg: dict[uuid.UUID, dict[str, Any]] = {}
    for reaction in reactions_result.scalars().all():
        entry = reactions_by_msg.setdefault(reaction.message_id, {})
        emoji_entry = entry.setdefault(reaction.emoji, {"count": 0, "reacted_by": []})
        emoji_entry["count"] += 1
        emoji_entry["reacted_by"].append(str(reaction.user_id))
    return reactions_by_msg


async def get_room_messages_desc(
    db: AsyncSession, room_id: uuid.UUID, limit: int
) -> list[ChatMessage]:
    msgs_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    return list(msgs_result.scalars().all())


async def get_message_by_id(db: AsyncSession, message_id: uuid.UUID) -> ChatMessage | None:
    result = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))
    return result.scalar_one_or_none()


async def create_message(
    db: AsyncSession,
    room_id: uuid.UUID,
    sender_id: uuid.UUID,
    content: str,
    reply_to_id: uuid.UUID | None,
) -> ChatMessage:
    msg = ChatMessage(
        room_id=room_id,
        sender_id=sender_id,
        content=content,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def get_room_members_excluding(
    db: AsyncSession, room_id: uuid.UUID, exclude_user_id: uuid.UUID
) -> list[ChatRoomMember]:
    members_result = await db.execute(
        select(ChatRoomMember).where(
            and_(
                ChatRoomMember.room_id == room_id,
                ChatRoomMember.user_id != exclude_user_id,
            )
        )
    )
    return list(members_result.scalars().all())


# ── Mark-as-read ─────────────────────────────────────────────────────────────

async def get_unread_messages_up_to(
    db: AsyncSession,
    room_id: uuid.UUID,
    uid: uuid.UUID,
    up_to_created_at: datetime | None,
) -> list[ChatMessage]:
    """Unread = sent by others, not yet in read_receipts for `uid`, optionally
    bounded to messages created at or before `up_to_created_at`."""
    already_read_subq = select(MessageReadReceipt.message_id).where(
        MessageReadReceipt.user_id == uid
    )
    conditions = [
        ChatMessage.room_id == room_id,
        ChatMessage.sender_id != uid,
        ~ChatMessage.id.in_(already_read_subq),
    ]
    if up_to_created_at is not None:
        conditions.append(ChatMessage.created_at <= up_to_created_at)

    unread_result = await db.execute(select(ChatMessage).where(and_(*conditions)))
    return list(unread_result.scalars().all())


async def mark_room_messages_read(
    db: AsyncSession, unread_ids: list[uuid.UUID], uid: uuid.UUID
) -> None:
    """Insert read receipts (ignore conflicts) for every unread message and
    flip their status to READ — one transaction, one commit."""
    for mid in unread_ids:
        stmt = (
            pg_insert(MessageReadReceipt)
            .values(message_id=mid, user_id=uid)
            .on_conflict_do_nothing(index_elements=["message_id", "user_id"])
        )
        await db.execute(stmt)

    await db.execute(
        update(ChatMessage)
        .where(ChatMessage.id.in_(unread_ids))
        .values(status=MsgStatus.READ)
    )
    await db.commit()


# ── Reactions ────────────────────────────────────────────────────────────────

async def get_reaction(
    db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID, emoji: str
) -> MessageReaction | None:
    existing_result = await db.execute(
        select(MessageReaction).where(
            and_(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user_id,
                MessageReaction.emoji == emoji,
            )
        )
    )
    return existing_result.scalar_one_or_none()


async def delete_reaction(db: AsyncSession, reaction_id: uuid.UUID) -> None:
    await db.execute(delete(MessageReaction).where(MessageReaction.id == reaction_id))
    await db.commit()


async def add_reaction(
    db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID, emoji: str
) -> None:
    new_reaction = MessageReaction(
        message_id=message_id,
        user_id=user_id,
        emoji=emoji,
    )
    db.add(new_reaction)
    await db.commit()


async def get_reactions_summary(
    db: AsyncSession, message_id: uuid.UUID
) -> dict[str, Any]:
    """Return reactions grouped by emoji: {emoji: {"count": int, "reacted_by": [user_id, ...]}}"""
    result = await db.execute(
        select(MessageReaction).where(MessageReaction.message_id == message_id)
    )
    rows = result.scalars().all()
    summary: dict[str, Any] = {}
    for row in rows:
        entry = summary.setdefault(row.emoji, {"count": 0, "reacted_by": []})
        entry["count"] += 1
        entry["reacted_by"].append(str(row.user_id))
    return summary


# ── Parent monitoring ────────────────────────────────────────────────────────

async def get_parent_link(
    db: AsyncSession, parent_uid: uuid.UUID, child_uid: uuid.UUID
) -> ParentProfile | None:
    result = await db.execute(
        select(ParentProfile).where(
            and_(
                ParentProfile.parent_user_id == parent_uid,
                ParentProfile.student_user_id == child_uid,
            )
        )
    )
    return result.scalar_one_or_none()


async def add_parent_audit_log(
    db: AsyncSession,
    parent_user_id: uuid.UUID,
    child_user_id: uuid.UUID,
    action: str,
    room_id: uuid.UUID | None = None,
) -> None:
    audit = ParentAuditLog(
        parent_user_id=parent_user_id,
        child_user_id=child_user_id,
        action=action,
        room_id=room_id,
    )
    db.add(audit)
    await db.commit()


# ── Friends helpers (shared) ─────────────────────────────────────────────────

async def friend_ids_of(db: AsyncSession, uid: uuid.UUID) -> set[uuid.UUID]:
    res = await db.execute(
        select(FriendRequest).where(
            and_(
                FriendRequest.status == RequestStatus.ACCEPTED,
                or_(FriendRequest.from_user_id == uid, FriendRequest.to_user_id == uid),
            )
        )
    )
    out: set[uuid.UUID] = set()
    for fr in res.scalars().all():
        out.add(fr.to_user_id if fr.from_user_id == uid else fr.from_user_id)
    return out


async def get_accepted_friend_requests_touching(
    db: AsyncSession, user_ids: list[uuid.UUID]
) -> list[FriendRequest]:
    res = await db.execute(
        select(FriendRequest).where(
            and_(
                FriendRequest.status == RequestStatus.ACCEPTED,
                or_(
                    FriendRequest.from_user_id.in_(user_ids),
                    FriendRequest.to_user_id.in_(user_ids),
                ),
            )
        )
    )
    return list(res.scalars().all())


# ── Moderation: content reports ─────────────────────────────────────────────

async def create_report(
    db: AsyncSession,
    reporter_id: uuid.UUID,
    target_type,
    target_user_id: uuid.UUID,
    target_ref_id: uuid.UUID | None,
    reason: str,
    details: str | None,
    content_snapshot: str | None,
) -> ContentReport:
    report = ContentReport(
        reporter_id=reporter_id,
        target_type=target_type,
        target_user_id=target_user_id,
        target_ref_id=target_ref_id,
        reason=reason,
        details=details,
        content_snapshot=content_snapshot,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


async def get_message_content(db: AsyncSession, message_id: uuid.UUID) -> str | None:
    res = await db.execute(select(ChatMessage.content).where(ChatMessage.id == message_id))
    row = res.first()
    return row[0] if row else None


async def list_reports(
    db: AsyncSession, status: ReportStatus | None, page: int, limit: int
) -> tuple[list[ContentReport], int]:
    stmt = select(ContentReport)
    count_stmt = select(func.count()).select_from(ContentReport)
    if status is not None:
        stmt = stmt.where(ContentReport.status == status)
        count_stmt = count_stmt.where(ContentReport.status == status)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(ContentReport.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_report(db: AsyncSession, report_id: uuid.UUID) -> ContentReport | None:
    return await db.get(ContentReport, report_id)


async def resolve_report(
    db: AsyncSession,
    report: ContentReport,
    resolved_by: uuid.UUID,
    action: str,
    note: str | None,
) -> ContentReport:
    report.status = ReportStatus.DISMISSED if action == "dismiss" else ReportStatus.ACTIONED
    report.resolved_by = resolved_by
    report.resolution_action = action
    report.resolution_note = note
    report.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(report)
    return report


async def set_chat_mute(
    db: AsyncSession, user_id: uuid.UUID, muted_until: datetime, reason: str | None, set_by: uuid.UUID
) -> None:
    stmt = pg_insert(ChatMute).values(
        user_id=user_id, muted_until=muted_until, reason=reason, set_by=set_by
    ).on_conflict_do_update(
        index_elements=[ChatMute.user_id],
        set_={"muted_until": muted_until, "reason": reason, "set_by": set_by},
    )
    await db.execute(stmt)
    await db.commit()


async def get_active_mute(db: AsyncSession, user_id: uuid.UUID) -> ChatMute | None:
    mute = await db.get(ChatMute, user_id)
    if mute and mute.muted_until > datetime.now(timezone.utc):
        return mute
    return None
