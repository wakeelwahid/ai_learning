"""
Message routes — parent-to-student real-time messaging (HTTP polling).

All endpoints receive `user_id` as a query parameter (the caller is the
API gateway which extracts the JWT-authenticated user and injects user_id).
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud.messages_crud import (
    create_message,
    get_messages_between,
    get_messages_for_user,
    get_profiles_by_ids,
    get_unread_count as crud_get_unread_count,
    mark_messages_read,
)
from app.database.session import get_db
from app.models.message import Message
from app.schemas.messages import MessageResponse, SendMessageRequest, ThreadSummary, UnreadCountResponse

router = APIRouter(prefix="/messages", tags=["messages"])


def msg_to_dict(msg: Message) -> dict:
    return {
        "id": str(msg.id),
        "sender_id": str(msg.sender_id),
        "recipient_id": str(msg.recipient_id),
        "content": msg.content,
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/thread/{other_user_id}", response_model=list[MessageResponse])
async def get_thread(
    other_user_id: str,
    user_id: str = Query(..., description="Authenticated user's ID"),
    since: Optional[str] = Query(None, description="ISO timestamp — return only messages after this time"),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return all messages between user_id and other_user_id.
    If `since` is provided only messages newer than that timestamp are returned
    (used for polling delta updates). Incoming messages are marked read.
    """
    try:
        uid = uuid.UUID(user_id)
        oid = uuid.UUID(other_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid `since` timestamp format")

    messages = await get_messages_between(db, uid, oid, since=since_dt)

    # Mark messages sent TO current user as read
    unread_ids = [m.id for m in messages if m.recipient_id == uid and not m.is_read]
    await mark_messages_read(db, unread_ids)

    return [MessageResponse(**msg_to_dict(m)) for m in messages]


@router.post("/send", response_model=MessageResponse, status_code=201)
async def send_message(
    body: SendMessageRequest,
    user_id: str = Query(..., description="Authenticated user's ID (sender)"),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new message from user_id to body.recipient_id."""
    try:
        sender_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    # body.recipient_id is already a validated uuid.UUID (Pydantic-parsed)
    recipient_uuid = body.recipient_id

    if sender_uuid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    msg = await create_message(db, sender_uuid, recipient_uuid, body.content.strip())

    return MessageResponse(**msg_to_dict(msg))


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    user_id: str = Query(..., description="Authenticated user's ID"),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return the number of unread messages for user_id."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    count = await crud_get_unread_count(db, uid)
    return UnreadCountResponse(count=count)


@router.get("/threads", response_model=list[ThreadSummary])
async def get_threads(
    user_id: str = Query(..., description="Authenticated user's ID"),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return a list of conversation threads for user_id.
    Each thread represents a unique conversation partner, with the latest
    message preview and unread count.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    # Fetch all messages involving this user
    all_messages = await get_messages_for_user(db, uid)

    # Group by the other party
    threads: dict[uuid.UUID, dict] = {}
    for msg in all_messages:
        other_id = msg.recipient_id if msg.sender_id == uid else msg.sender_id
        if other_id not in threads:
            threads[other_id] = {
                "last_message": msg,
                "unread_count": 0,
            }
        threads[other_id]["last_message"] = msg
        if msg.recipient_id == uid and not msg.is_read:
            threads[other_id]["unread_count"] += 1

    if not threads:
        return []

    # Fetch profiles for all conversation partners
    other_ids = list(threads.keys())
    profiles = await get_profiles_by_ids(db, other_ids)

    summaries: list[ThreadSummary] = []
    for other_id, data in threads.items():
        profile = profiles.get(other_id)
        other_name = profile.full_name if profile else str(other_id)[:8]
        # Role is not stored in user_profile in this service — default to "user"
        # The frontend can override display based on context
        other_role = "user"

        last_msg: Message = data["last_message"]
        summaries.append(
            ThreadSummary(
                other_user_id=str(other_id),
                other_user_name=other_name,
                other_user_role=other_role,
                last_message=last_msg.content,
                last_message_time=last_msg.created_at.isoformat() if last_msg.created_at else "",
                unread_count=data["unread_count"],
            )
        )

    # Sort most-recent first
    summaries.sort(key=lambda s: s.last_message_time, reverse=True)
    return summaries
