"""
CRUD helpers for the community API — friend requests, direct messages, and
groups (app/routes/community.py) plus the internal friends-list lookup
(app/routes/internal.py) that shares the same "accepted friends" query.

Kept separate from user_crud.py because it owns a different model surface
(ChatRoom, ChatRoomMember, FriendRequest, Message) than user_crud.py's
UserProfile/ParentProfile/StudyTimeLimit scope.
"""
from __future__ import annotations

import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import (
    ChatRoom,
    ChatRoomMember,
    FriendRequest,
    RequestStatus,
    RoomType,
)
from app.models.message import Message
from app.models.user_profile import UserProfile


# ── Friends ───────────────────────────────────────────────────────────────────

async def find_existing_friend_link(
    db: AsyncSession, caller: uuid.UUID, to_uid: uuid.UUID
) -> FriendRequest | None:
    """Return an existing pending/accepted FriendRequest between the two
    users (in either direction), or None."""
    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(
                    FriendRequest.from_user_id == caller,
                    FriendRequest.to_user_id == to_uid,
                    FriendRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED]),
                ),
                and_(
                    FriendRequest.from_user_id == to_uid,
                    FriendRequest.to_user_id == caller,
                    FriendRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED]),
                ),
            )
        )
    )
    return existing.scalar_one_or_none()


async def create_friend_request(
    db: AsyncSession, caller: uuid.UUID, to_uid: uuid.UUID
) -> FriendRequest:
    fr = FriendRequest(from_user_id=caller, to_user_id=to_uid)
    db.add(fr)
    await db.commit()
    await db.refresh(fr)
    return fr


async def get_pending_requests_for(
    db: AsyncSession, caller: uuid.UUID
) -> list[FriendRequest]:
    result = await db.execute(
        select(FriendRequest).where(
            and_(FriendRequest.to_user_id == caller, FriendRequest.status == RequestStatus.PENDING)
        )
    )
    return list(result.scalars().all())


async def get_pending_request_from(
    db: AsyncSession, from_uid: uuid.UUID, caller: uuid.UUID
) -> FriendRequest | None:
    result = await db.execute(
        select(FriendRequest).where(
            and_(
                FriendRequest.from_user_id == from_uid,
                FriendRequest.to_user_id == caller,
                FriendRequest.status == RequestStatus.PENDING,
            )
        )
    )
    return result.scalar_one_or_none()


async def accept_friend_request_and_create_room(
    db: AsyncSession, fr: FriendRequest
) -> ChatRoom:
    """Mark the FriendRequest accepted, create a DIRECT chat room for the two
    users, and add both as members — all in one transaction, one commit.

    If any write fails, nothing is committed (matches the original
    route-level behavior where all three writes shared a single db.commit()).
    """
    fr.status = RequestStatus.ACCEPTED

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
    return room


async def get_accepted_friend_ids_and_profiles(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[list[uuid.UUID], dict[uuid.UUID, UserProfile]]:
    """Shared read logic for both the JWT-gated GET /community/friends and
    the internal (no-auth) GET /users/internal/friends: fetch accepted
    FriendRequest rows involving `user_id`, then batch-fetch profiles for
    the other party on each row.

    Each call site formats its own response shape (internal.py returns
    full_name+avatar_url only; community.py additionally returns
    school_name+class_number) from the (other_ids, profile_map) returned
    here — read-only, no commit needed.
    """
    result = await db.execute(
        select(FriendRequest).where(
            and_(
                FriendRequest.status == RequestStatus.ACCEPTED,
                or_(FriendRequest.from_user_id == user_id, FriendRequest.to_user_id == user_id),
            )
        )
    )
    rows = result.scalars().all()
    other_ids = [r.to_user_id if r.from_user_id == user_id else r.from_user_id for r in rows]
    if not other_ids:
        return [], {}
    # Single batched lookup instead of one query per friend.
    profiles_result = await db.execute(select(UserProfile).where(UserProfile.user_id.in_(other_ids)))
    profile_map = {p.user_id: p for p in profiles_result.scalars().all()}
    return other_ids, profile_map


# ── Direct Messages ───────────────────────────────────────────────────────────

async def get_messages_for_conversations(
    db: AsyncSession, caller: uuid.UUID
) -> list[Message]:
    result = await db.execute(
        select(Message).where(
            or_(Message.sender_id == caller, Message.recipient_id == caller)
        ).order_by(Message.created_at.desc())
    )
    return list(result.scalars().all())


async def get_conversation_messages(
    db: AsyncSession, caller: uuid.UUID, other_uid: uuid.UUID
) -> list[Message]:
    result = await db.execute(
        select(Message).where(
            or_(
                and_(Message.sender_id == caller, Message.recipient_id == other_uid),
                and_(Message.sender_id == other_uid, Message.recipient_id == caller),
            )
        ).order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def create_message(
    db: AsyncSession, caller: uuid.UUID, to_uid: uuid.UUID, content: str
) -> Message:
    msg = Message(sender_id=caller, recipient_id=to_uid, content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


# ── Groups ────────────────────────────────────────────────────────────────────

async def create_group_room(
    db: AsyncSession, caller: uuid.UUID, name: str
) -> ChatRoom:
    room = ChatRoom(type=RoomType.GROUP, name=name, created_by=caller)
    db.add(room)
    await db.flush()
    db.add(ChatRoomMember(room_id=room.id, user_id=caller, is_admin=True))
    await db.commit()
    await db.refresh(room)
    return room


async def get_group_rooms_for_member(
    db: AsyncSession, caller: uuid.UUID
) -> list[ChatRoom]:
    memberships = await db.execute(
        select(ChatRoomMember).where(ChatRoomMember.user_id == caller)
    )
    room_ids = [m.room_id for m in memberships.scalars().all()]
    if not room_ids:
        return []
    rooms_result = await db.execute(
        select(ChatRoom).where(
            and_(ChatRoom.id.in_(room_ids), ChatRoom.type == RoomType.GROUP)
        )
    )
    return list(rooms_result.scalars().all())
