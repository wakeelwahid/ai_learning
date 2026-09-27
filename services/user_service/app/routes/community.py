"""
Community API — simplified public-facing routes for friends, direct messages, and groups.

These are thin adapters over the chat/message DB models, exposing a simpler
interface than the full chat.py room-based API.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud.community_crud import (
    accept_friend_request_and_create_room,
    create_friend_request,
    create_group_room,
    create_message,
    find_existing_friend_link,
    get_accepted_friend_ids_and_profiles,
    get_conversation_messages,
    get_group_rooms_for_member,
    get_messages_for_conversations,
    get_pending_request_from,
    get_pending_requests_for,
)
from app.database.session import get_db
from app.schemas.community import AcceptFriendBody, CreateGroupBody, FriendRequestBody, SendMessageBody

router = APIRouter(prefix="/community", tags=["community"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse(val: str | uuid.UUID, field: str = "id") -> uuid.UUID:
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(val)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid UUID for '{field}': {val!r}")


# ── Friends ───────────────────────────────────────────────────────────────────

@router.post("/friends/request", status_code=201)
async def send_friend_request(
    body: FriendRequestBody,
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    to_uid = parse(body.to_user_id, "to_user_id")
    existing = await find_existing_friend_link(db, caller, to_uid)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Friend request already exists or already friends.")

    fr = await create_friend_request(db, caller, to_uid)
    return {"id": str(fr.id), "from_user_id": str(caller), "to_user_id": str(to_uid), "status": "pending"}


@router.get("/friends/requests")
async def list_friend_requests(
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = await get_pending_requests_for(db, caller)
    return [{"id": str(r.id), "from_user_id": str(r.from_user_id), "status": r.status.value} for r in rows]


@router.post("/friends/accept")
async def accept_friend_request(
    body: AcceptFriendBody,
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from_uid = parse(body.from_user_id, "from_user_id")
    fr = await get_pending_request_from(db, from_uid, caller)
    if fr is None:
        raise HTTPException(status_code=404, detail="Pending friend request not found.")

    room = await accept_friend_request_and_create_room(db, fr)
    return {"id": str(fr.id), "status": "accepted", "room_id": str(room.id)}


@router.get("/friends")
async def list_friends(
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    other_ids, profile_map = await get_accepted_friend_ids_and_profiles(db, caller)
    # Batch-fetch profiles (was an N+1 loop) and include the fields the
    # group-creation friend picker renders.
    friends = []
    for other_id in other_ids:
        profile = profile_map.get(other_id)
        friends.append({
            "user_id": str(other_id),
            "full_name": profile.full_name if profile else None,
            "school_name": profile.school_name if profile else None,
            "class_number": profile.class_number if profile else None,
            "avatar_url": profile.avatar_url if profile else None,
        })
    return friends


# ── Direct Messages ───────────────────────────────────────────────────────────

@router.get("/messages/conversations")
async def list_conversations(
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    messages = await get_messages_for_conversations(db, caller)

    seen: dict[uuid.UUID, dict[str, Any]] = {}
    for msg in messages:
        other = msg.recipient_id if msg.sender_id == caller else msg.sender_id
        if other not in seen:
            seen[other] = {
                "other_user_id": str(other),
                "last_message": msg.content,
                "last_message_time": msg.created_at.isoformat() if msg.created_at else None,
                "unread_count": 0,
            }
        if msg.recipient_id == caller and not msg.is_read:
            seen[other]["unread_count"] += 1

    return list(seen.values())


@router.get("/messages/{user_id}")
async def get_conversation(
    user_id: str,
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    other_uid = parse(user_id, "user_id")
    messages = await get_conversation_messages(db, caller, other_uid)
    return [
        {
            "id": str(m.id),
            "sender_id": str(m.sender_id),
            "content": m.content,
            "is_read": m.is_read,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


@router.post("/messages", status_code=201)
async def send_message(
    body: SendMessageBody,
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    to_uid = parse(body.to_user_id, "to_user_id")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")
    msg = await create_message(db, caller, to_uid, body.content.strip())
    return {
        "id": str(msg.id),
        "sender_id": str(caller),
        "recipient_id": str(to_uid),
        "content": msg.content,
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


# ── Groups ────────────────────────────────────────────────────────────────────

@router.post("/groups", status_code=201)
async def create_group(
    body: CreateGroupBody,
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    room = await create_group_room(db, caller, body.name)
    return {
        "id": str(room.id),
        "name": room.name,
        "description": body.description,
        "subject": body.subject,
        "created_by": str(caller),
        "created_at": room.created_at.isoformat() if room.created_at else None,
    }


@router.get("/groups")
async def list_groups(
    caller: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    rooms = await get_group_rooms_for_member(db, caller)
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "created_by": str(r.created_by),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rooms
    ]
