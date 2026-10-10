"""
REST API routes for EdTech chat: friend requests, rooms, messages, and
parent monitoring.

WebSocket notifications are fire-and-forget (asyncio.create_task) so HTTP
responses are never delayed by slow or absent connections.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, get_current_user_id_and_role, get_redis, is_admin_role, require_admin, require_parent
from app.crud import chat_crud
from app.crud.user_crud import get_profile, verify_parent_child_link
from app.database.session import get_db
from app.models.chat import (
    ChatMessage,
    ChatRoom,
    ChatRoomMember,
    ContentReport,
    FriendRequest,
    MsgStatus,
    ReportStatus,
    RequestStatus,
    RoomType,
)
from app.models.user_profile import UserProfile
from app.routes.chat_ws import manager
from app.schemas.chat import (
    AddMemberBody,
    CreateGroupBody,
    CreateReportBody,
    MarkReadBody,
    ReactBody,
    RenameGroupBody,
    ReportResponse,
    ResolveReportBody,
    SendFriendRequestBody,
    SendMessageBody,
    UpdateRequestBody,
)
from app.utils.moderation import moderate_content

router = APIRouter(prefix="/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# UUID parsing helper
# ---------------------------------------------------------------------------

def parse_uuid(value: str | uuid.UUID, field_name: str = "id") -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid UUID for '{field_name}': {value!r}")


async def check_feature_quota(user_id: uuid.UUID, feature_key: str) -> None:
    """Admin-configurable daily quota (see gamification_service's
    FeatureUsageService) for chat_message / chat_group_create /
    friend_request. Fails open (never blocks) if gamification_service is
    unreachable, same trade-off used by every other gated service."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/usage/check-and-log",
                json={"user_id": str(user_id), "feature_key": feature_key},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        return
    if resp.status_code == 429:
        # Forward gamification_service's ready-to-show message verbatim —
        # never invent wording here.
        detail = resp.json().get("detail", {})
        message = detail.get("message") if isinstance(detail, dict) else None
        raise HTTPException(status_code=429, detail=message)


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def profile_dict(p: UserProfile) -> dict[str, Any]:
    return {
        "user_id": str(p.user_id),
        "full_name": p.full_name,
        "school_name": p.school_name,
        "class_number": p.class_number,
        "board": p.board,
    }


def message_dict(
    m: ChatMessage,
    read_by: list[str] | None = None,
    reply_to_preview: dict[str, Any] | None = None,
    reactions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "room_id": str(m.room_id),
        "sender_id": str(m.sender_id),
        "content": m.content,
        "msg_type": m.msg_type,
        "status": m.status.value if m.status else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "expires_at": m.expires_at.isoformat() if m.expires_at else None,
        "read_by": read_by or [],
        "reply_to_id": str(m.reply_to_id) if m.reply_to_id else None,
        "reply_to_preview": reply_to_preview,
        "reactions": reactions or {},
    }


def request_dict(r: FriendRequest, from_profile: UserProfile | None = None) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": str(r.id),
        "from_user_id": str(r.from_user_id),
        "to_user_id": str(r.to_user_id),
        "status": r.status.value,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }
    if from_profile is not None:
        d["from_profile"] = profile_dict(from_profile)
    return d


# ---------------------------------------------------------------------------
# Room-membership guard
# ---------------------------------------------------------------------------

async def verify_room_member(
    db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """Raise 403 unless user_id is a member of room_id (ChatRoomMember)."""
    if await chat_crud.get_room_membership(db, room_id, user_id) is None:
        raise HTTPException(status_code=403, detail="User is not a member of this room.")


# ---------------------------------------------------------------------------
# 1. GET /chat/search
# ---------------------------------------------------------------------------

@router.get("/search")
async def search_users(
    q: str = Query("", max_length=100),
    page: int = Query(1, ge=1, le=1000),
    limit: int = Query(20, ge=1, le=50),
    caller_uid: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Student directory + search, paginated.

    With an empty `q` this is the DISCOVER list — every registered student,
    newest first — so the Find Students screen shows real people before the
    user types anything. With `q` it's a case-insensitive name/school search.

    Response envelope: {results, page, limit, total, has_more}.

    Caching strategy (production note): the expensive, shared part — a page of
    the directory plus its total — is cached in Redis for 120s under
    (q, page, limit), WITHOUT any caller-specific data. The caller-specific
    parts (dropping the caller's own row, per-user friend_status) are overlaid
    per request from one indexed friend_requests query, so one cache entry
    serves every user. Dropping self can shorten a page by one row — an
    accepted trade for a shareable cache.
    """
    q_norm = q.strip().lower()

    # Scope the directory to the caller's own board + class (classmates only).
    # Without this, any account can page through every student's name/school/
    # class and enumerate the whole roster. A caller with no board/class set
    # yet (e.g. a parent/teacher, or a student mid-onboarding) sees an empty
    # directory rather than everyone.
    caller_profile = await get_profile(db, caller_uid)
    caller_board = (caller_profile.board if caller_profile else None)
    caller_class = (caller_profile.class_number if caller_profile else None)
    if not caller_board or caller_class is None:
        return {"results": [], "page": page, "limit": limit, "total": 0, "has_more": False}

    cache_key = f"student_directory:v2:{caller_board.lower()}:{caller_class}:{q_norm}:{page}:{limit}"

    redis = await get_redis()
    cached_page: dict | None = None
    if redis is not None:
        try:
            raw = await redis.get(cache_key)
            if raw:
                cached_page = json.loads(raw)
        except Exception:
            pass

    if cached_page is None:
        total, page_rows = await chat_crud.get_user_profiles_page_and_total(
            db, q_norm, (page - 1) * limit, limit,
            board=caller_board, class_number=caller_class,
        )
        cached_page = {
            "total": total,
            "rows": [
                {
                    "user_id": str(p.user_id),
                    "full_name": p.full_name,
                    # school_name intentionally omitted — a minor's school is
                    # not needed to send a friend request and should not be
                    # broadcast to every classmate.
                    "class_number": p.class_number,
                    "board": p.board,
                    "avatar_url": p.avatar_url,
                }
                for p in page_rows
            ],
        }
        if redis is not None:
            try:
                await redis.set(cache_key, json.dumps(cached_page), ex=120)
            except Exception:
                pass

    # Per-caller overlay: drop self, attach friend_status
    rows = [r for r in cached_page["rows"] if r["user_id"] != str(caller_uid)]
    total = cached_page["total"]

    if not rows:
        return {"results": [], "page": page, "limit": limit, "total": total,
                "has_more": page * limit < total}

    # Fetch all FriendRequests between caller and this page's users in one query
    target_ids = [uuid.UUID(r["user_id"]) for r in rows]
    friend_requests = await chat_crud.get_friend_requests_between(db, caller_uid, target_ids)

    # Build a lookup: other_user_id -> FriendRequest
    fr_map: dict[str, FriendRequest] = {}
    for fr in friend_requests:
        other = fr.to_user_id if fr.from_user_id == caller_uid else fr.from_user_id
        fr_map[str(other)] = fr

    output = []
    for r in rows:
        fr = fr_map.get(r["user_id"])
        if fr is None:
            friend_status = "none"
        elif fr.status == RequestStatus.ACCEPTED:
            friend_status = "friends"
        elif fr.status == RequestStatus.PENDING:
            if fr.from_user_id == caller_uid:
                friend_status = "pending_sent"
            else:
                friend_status = "pending_received"
        else:
            friend_status = "none"
        output.append({**r, "friend_status": friend_status})

    return {"results": output, "page": page, "limit": limit, "total": total,
            "has_more": page * limit < total}


# ---------------------------------------------------------------------------
# 2. POST /chat/friend-requests
# ---------------------------------------------------------------------------

@router.post("/friend-requests", status_code=201)
async def send_friend_request(
    body: SendFriendRequestBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from_uid = parse_uuid(body.from_user_id, "from_user_id")
    if from_uid != caller_id:
        raise HTTPException(status_code=403, detail="from_user_id does not match authenticated user")
    to_uid = parse_uuid(body.to_user_id, "to_user_id")
    await check_feature_quota(caller_id, "friend_request")

    # Check for existing request (either direction, pending or accepted)
    if await chat_crud.find_active_friend_link(db, from_uid, to_uid) is not None:
        raise HTTPException(status_code=409, detail="Friend request already exists or users are already friends.")

    # A previously-REJECTED edge (either direction) still occupies the unique
    # (from,to) constraint — Facebook-style re-requests must work, so reuse
    # that row instead of inserting a duplicate.
    fr = await chat_crud.find_rejected_friend_link(db, from_uid, to_uid)
    if fr is not None:
        fr = await chat_crud.reactivate_rejected_request(db, fr, from_uid, to_uid)
    else:
        fr = await chat_crud.create_friend_request(db, from_uid, to_uid)

    # Fetch sender profile for notification
    sender_profile = await chat_crud.get_user_profile(db, from_uid)
    from_name = sender_profile.full_name if sender_profile else str(from_uid)

    # Non-blocking WebSocket notification to recipient (live badge/list update)
    notification: dict[str, Any] = {
        "type": "friend_request",
        "from_user_id": str(from_uid),
        "from_name": from_name,
    }
    asyncio.create_task(notify(str(to_uid), notification))
    # Durable in-app notification + queued push (Celery/RabbitMQ) for the recipient
    asyncio.create_task(notify_persistent(
        str(to_uid), "👋 New friend request",
        f"{from_name} sent you a friend request.", "friend_request",
    ))
    # The recipient's pending-request badge count changed
    asyncio.create_task(invalidate_fr_count(to_uid))

    return request_dict(fr)


# ---------------------------------------------------------------------------
# 3. GET /chat/friend-requests
# ---------------------------------------------------------------------------

@router.get("/friend-requests/count")
async def count_friend_requests(
    user_id: str = Query(...),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """Pending incoming request count — powers the Requests badge. Cheap to
    poll: Redis-cached (30s TTL) and explicitly invalidated on every
    send/accept/reject/cancel, so badges update immediately after actions."""
    uid = parse_uuid(user_id, "user_id")
    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    redis = await get_redis()
    key = fr_count_key(uid)
    if redis is not None:
        try:
            cached = await redis.get(key)
            if cached is not None:
                return {"count": int(cached)}
        except Exception:  # noqa: BLE001
            pass

    count = await chat_crud.count_pending_incoming_requests(db, uid)

    if redis is not None:
        try:
            await redis.set(key, int(count), ex=FR_COUNT_TTL)
        except Exception:  # noqa: BLE001
            pass
    return {"count": int(count)}


@router.get("/friend-requests")
async def list_friend_requests(
    user_id: str = Query(...),
    direction: str = Query("incoming", pattern="^(incoming|outgoing)$"),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Pending friend requests. `direction=incoming` (default) lists requests
    sent TO this user (Confirm/Delete); `direction=outgoing` lists requests
    this user has sent (Cancel). Each row carries the other party's profile
    and a Facebook-style `mutual_friends_count`."""
    uid = parse_uuid(user_id, "user_id")
    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    own_side = FriendRequest.to_user_id if direction == "incoming" else FriendRequest.from_user_id
    requests = await chat_crud.get_pending_requests_by_side(db, own_side, uid)

    if not requests:
        return []

    # Batch-fetch the other party's profiles + mutual-friend counts
    other_ids = [
        (r.from_user_id if direction == "incoming" else r.to_user_id) for r in requests
    ]
    profile_map = await chat_crud.get_user_profiles_by_ids(db, other_ids)
    mutual_map = await mutual_counts(db, uid, other_ids)

    out = []
    for r in requests:
        other_id = r.from_user_id if direction == "incoming" else r.to_user_id
        d = request_dict(r, profile_map.get(other_id))
        # `from_profile` historically names the profile key on incoming rows —
        # keep it for compatibility, and expose the same object as
        # `other_profile` so outgoing consumers read one consistent key.
        if d.get("from_profile") is None and profile_map.get(other_id) is not None:
            d["from_profile"] = profile_dict(profile_map[other_id])
        d["other_profile"] = d.get("from_profile")
        d["direction"] = direction
        d["mutual_friends_count"] = mutual_map.get(other_id, 0)
        out.append(d)
    return out


@router.delete("/friend-requests/{request_id}")
async def cancel_friend_request(
    request_id: str,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Cancel a PENDING request you sent (Facebook's 'Cancel request').
    Hard-deletes the row so the pair can be re-requested later; the recipient
    is WS-notified so their Requests list live-updates, and both badge counts
    are invalidated."""
    req_uid = parse_uuid(request_id, "request_id")
    fr = await chat_crud.get_friend_request_by_id(db, req_uid)
    if fr is None:
        raise HTTPException(status_code=404, detail="Friend request not found.")
    if fr.from_user_id != caller_id:
        raise HTTPException(status_code=403, detail="Only the sender can cancel this request.")
    if fr.status != RequestStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only pending requests can be cancelled.")

    to_uid = fr.to_user_id
    await chat_crud.delete_friend_request(db, fr)

    asyncio.create_task(notify(str(to_uid), {
        "type": "friend_request_cancelled",
        "from_user_id": str(caller_id),
    }))
    asyncio.create_task(invalidate_fr_count(to_uid))

    return {"cancelled": True, "request_id": str(req_uid)}


# ---------------------------------------------------------------------------
# 4. PATCH /chat/friend-requests/{request_id}
# ---------------------------------------------------------------------------

@router.patch("/friend-requests/{request_id}")
async def update_friend_request(
    request_id: str,
    body: UpdateRequestBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    req_uid = parse_uuid(request_id, "request_id")
    parse_uuid(body.user_id, "user_id")  # validate format

    fr = await chat_crud.get_friend_request_by_id(db, req_uid)
    if fr is None:
        raise HTTPException(status_code=404, detail="Friend request not found.")

    if fr.to_user_id != caller_id:
        raise HTTPException(
            status_code=403,
            detail="Only the request recipient can accept or reject this request.",
        )

    # Status change and (if accepting) DIRECT-room + membership creation are
    # one transaction with a single commit inside crud.
    await chat_crud.update_friend_request_status(db, fr, body.status)

    if body.status == RequestStatus.ACCEPTED:
        # Fetch acceptor profile for notification
        acceptor = await chat_crud.get_user_profile(db, fr.to_user_id)
        acceptor_name = acceptor.full_name if acceptor else str(fr.to_user_id)

        notification: dict[str, Any] = {
            "type": "friend_accepted",
            "user_id": str(fr.to_user_id),
            "user_name": acceptor_name,
        }
        asyncio.create_task(notify(str(fr.from_user_id), notification))
        # Durable + queued-push notification for the original sender —
        # Facebook's "X accepted your friend request"
        asyncio.create_task(notify_persistent(
            str(fr.from_user_id), "🎉 Friend request accepted",
            f"{acceptor_name} accepted your friend request. Say hi!", "friend_accepted",
        ))

    # Accept and reject both change the recipient's pending badge count
    asyncio.create_task(invalidate_fr_count(fr.to_user_id, fr.from_user_id))

    return request_dict(fr)


# ---------------------------------------------------------------------------
# 5. GET /chat/rooms
# ---------------------------------------------------------------------------

async def _get_rooms_for_user(db: AsyncSession, uid: uuid.UUID) -> list[dict[str, Any]]:
    """The actual room-list query, with no self-ownership check — shared by
    /rooms (which enforces uid == caller_id below) and the parent-monitor
    route (which authorizes via verify_parent_link against the PARENT's
    identity instead, since uid there is the CHILD being viewed, not the
    caller). /rooms used to call this route handler directly as a plain
    function for the parent case, which re-ran this same uid != caller_id
    check against the parent's own JWT identity — comparing the child's id
    to the parent's id, which can never match, 403ing on every legitimate
    parent-monitor call."""
    # Get rooms where user is a member
    memberships = await chat_crud.get_memberships_for_user(db, uid)
    if not memberships:
        return []

    room_ids = [m.room_id for m in memberships]

    # Fetch rooms
    rooms_map = await chat_crud.get_rooms_by_ids(db, room_ids)

    # Last message per room (subquery: max created_at per room_id)
    last_msg_map = await chat_crud.get_last_messages_by_room(db, room_ids)

    # Unread count per room for this user
    unread_map = await chat_crud.get_unread_counts_by_room(db, room_ids, uid)

    # All members of these rooms
    all_members = await chat_crud.get_members_by_rooms(db, room_ids)
    members_by_room: dict[uuid.UUID, list[ChatRoomMember]] = {}
    for m in all_members:
        members_by_room.setdefault(m.room_id, []).append(m)

    # Fetch profiles for EVERY member of every room — DM counterparts need
    # them for other_user, and group rooms need them for the members list
    # (previously groups shipped with no member data at all, so clients
    # rendered "0 members" and empty member lists).
    all_member_ids: set[uuid.UUID] = {
        m.user_id for members in members_by_room.values() for m in members
    }
    profiles_map = await chat_crud.get_user_profiles_by_ids(db, list(all_member_ids))

    mgr = manager

    output: list[dict[str, Any]] = []
    for room_id in room_ids:
        room = rooms_map.get(room_id)
        if room is None:
            continue

        last_msg = last_msg_map.get(room_id)
        unread_count = unread_map.get(room_id, 0)

        members = members_by_room.get(room_id, [])
        room_dict: dict[str, Any] = {
            "id": str(room.id),
            "type": room.type.value,
            "name": room.name,
            "created_by": str(room.created_by),
            "created_at": room.created_at.isoformat() if room.created_at else None,
            "unread_count": unread_count,
            "last_message": message_dict(last_msg) if last_msg else None,
            "other_user": None,
            "is_other_online": False,
            "members": [
                {
                    "user_id": str(m.user_id),
                    "full_name": (
                        profiles_map[m.user_id].full_name
                        if m.user_id in profiles_map else "Student"
                    ),
                    "avatar_url": (
                        profiles_map[m.user_id].avatar_url
                        if m.user_id in profiles_map else None
                    ),
                    "is_admin": m.is_admin,
                }
                for m in members
            ],
        }

        if room.type == RoomType.DIRECT:
            other_member = next((m for m in members if m.user_id != uid), None)
            if other_member:
                other_profile = profiles_map.get(other_member.user_id)
                if other_profile:
                    room_dict["other_user"] = profile_dict(other_profile)
                room_dict["is_other_online"] = await mgr.is_online(str(other_member.user_id))

        output.append(room_dict)

    # Sort by last message time DESC, nulls last
    output.sort(
        key=lambda r: (
            r["last_message"]["created_at"] if r["last_message"] else ""
        ),
        reverse=True,
    )
    return output


@router.get("/rooms")
async def list_rooms(
    user_id: str = Query(...),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return all chat rooms for a user, sorted by last message time DESC."""
    uid = parse_uuid(user_id, "user_id")
    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")
    return await _get_rooms_for_user(db, uid)


# ---------------------------------------------------------------------------
# 6. POST /chat/rooms/group
# ---------------------------------------------------------------------------

@router.post("/rooms/group", status_code=201)
async def create_group_room(
    body: CreateGroupBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    creator_uid = parse_uuid(body.created_by, "created_by")
    # The creator is always the authenticated caller — never trusted from the
    # body alone (every other mutating chat endpoint already works this way).
    if creator_uid != caller_id:
        raise HTTPException(status_code=403, detail="created_by does not match authenticated user")

    group_name = (body.name or "").strip()
    if not group_name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    await check_feature_quota(caller_id, "chat_group_create")

    # Normalize members: dedupe, and tolerate clients that include the creator
    # in member_ids (web does, mobile doesn't) — the creator is always added
    # separately as admin, so strip them here to keep counts consistent.
    member_uids: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for i, mid in enumerate(body.member_ids):
        parsed = parse_uuid(mid, f"member_ids[{i}]")
        if parsed != creator_uid and parsed not in seen:
            seen.add(parsed)
            member_uids.append(parsed)

    if not member_uids:
        raise HTTPException(status_code=400, detail="A group needs at least one member besides you.")

    if len(member_uids) > 10:
        raise HTTPException(
            status_code=400,
            detail=f"A group can have at most 10 friends (you selected {len(member_uids)}).",
        )
    total = len(member_uids) + 1  # +1 for creator

    # Groups are FRIENDS-ONLY: every member must be an ACCEPTED friend of the
    # creator — you can't pull strangers into a group. (This also implies the
    # member exists, replacing the earlier existence-only check.)
    creator_friends = await friend_ids_of(db, creator_uid)
    strangers = [m for m in member_uids if m not in creator_friends]
    if strangers:
        stranger_profiles = await chat_crud.get_user_profiles_by_ids(db, strangers)
        names = [p.full_name for p in stranger_profiles.values() if p.full_name]
        who = ", ".join(names) if names else f"{len(strangers)} selected user(s)"
        raise HTTPException(
            status_code=400,
            detail=f"You can only add your friends to a group. Not friends yet: {who}.",
        )

    # Count creator's existing groups
    existing_count = await chat_crud.get_group_creation_count(db, creator_uid)
    if existing_count >= 3:
        raise HTTPException(
            status_code=400,
            detail="You have reached the maximum of 3 group rooms.",
        )

    room = await chat_crud.create_group_room(db, creator_uid, group_name, member_uids)

    return {
        "id": str(room.id),
        # Both spellings — web reads nothing, mobile reads room_id; keeping
        # both means neither client needs a follow-up fetch to open the room.
        "room_id": str(room.id),
        "type": room.type.value,
        "name": room.name,
        "created_by": str(room.created_by),
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "member_count": total,
    }


# ---------------------------------------------------------------------------
# 7. POST /chat/rooms/{room_id}/members
# ---------------------------------------------------------------------------

@router.post("/rooms/{room_id}/members", status_code=201)
async def add_room_member(
    room_id: str,
    body: AddMemberBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    r_uid = parse_uuid(room_id, "room_id")
    new_uid = parse_uuid(body.user_id, "user_id")
    parse_uuid(body.added_by, "added_by")

    room = await chat_crud.get_room_by_id(db, r_uid)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    if room.type != RoomType.GROUP:
        raise HTTPException(status_code=400, detail="Members can only be added to GROUP rooms.")

    await verify_room_member(db, r_uid, caller_id)

    # Friends-only, matching group creation: the person being added must be
    # an accepted friend of whoever is adding them.
    adder_friends = await friend_ids_of(db, caller_id)
    if new_uid not in adder_friends:
        raise HTTPException(
            status_code=400,
            detail="You can only add your own friends to a group.",
        )

    # Count current members (cap = creator + 10 friends = 11 rows)
    current_count = await chat_crud.count_room_members(db, r_uid)
    if current_count >= 11:
        raise HTTPException(status_code=400, detail="This group already has the maximum of 10 friends.")

    await chat_crud.add_room_member(db, r_uid, new_uid)

    return {
        "room_id": str(r_uid),
        "user_id": str(new_uid),
        "added": True,
    }


# ---------------------------------------------------------------------------
# 7b. PATCH /chat/rooms/{room_id}  (rename — group admin only)
# ---------------------------------------------------------------------------

async def require_group_admin(
    db: AsyncSession, room_id: uuid.UUID, caller_id: uuid.UUID
) -> ChatRoom:
    """Return the GROUP room after verifying the caller is one of its admins."""
    room = await chat_crud.get_room_by_id(db, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    if room.type != RoomType.GROUP:
        raise HTTPException(status_code=400, detail="Only group rooms can be managed.")
    member = await chat_crud.get_room_membership(db, room_id, caller_id)
    if member is None:
        raise HTTPException(status_code=403, detail="You are not a member of this group.")
    if not member.is_admin:
        raise HTTPException(status_code=403, detail="Only the group admin can do this.")
    return room


async def room_member_ids(db: AsyncSession, room_id: uuid.UUID) -> list[str]:
    return await chat_crud.get_room_member_ids(db, room_id)


@router.patch("/rooms/{room_id}")
async def rename_group(
    room_id: str,
    body: RenameGroupBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Rename a group — admin only. Members get a live `room_updated` frame."""
    r_uid = parse_uuid(room_id, "room_id")
    room = await require_group_admin(db, r_uid, caller_id)

    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    await chat_crud.rename_room(db, room, new_name)

    event = {"type": "room_updated", "room_id": str(r_uid), "name": new_name}
    for member_id in await room_member_ids(db, r_uid):
        if member_id != str(caller_id):
            asyncio.create_task(notify(member_id, event))

    return {"room_id": str(r_uid), "name": new_name}


# ---------------------------------------------------------------------------
# 7b2. DELETE /chat/rooms/{room_id}  (delete group — group admin OR platform admin)
# ---------------------------------------------------------------------------

@router.delete("/rooms/{room_id}")
async def delete_group(
    room_id: str,
    identity: tuple = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete a group room entirely. Allowed for the GROUP's admin (its
    creator's is_admin membership row) or a PLATFORM admin/super_admin
    (moderation). Messages and membership rows go with it (FK CASCADE);
    every member gets a live `room_deleted` frame first."""
    caller_id, caller_role = identity
    r_uid = parse_uuid(room_id, "room_id")

    room = await chat_crud.get_room_by_id(db, r_uid)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    if room.type != RoomType.GROUP:
        raise HTTPException(status_code=400, detail="Only group rooms can be deleted.")

    if not is_admin_role(caller_role):
        member = await chat_crud.get_room_membership(db, r_uid, caller_id)
        if member is None or not member.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only the group admin (or a platform admin) can delete this group.",
            )

    member_ids = await room_member_ids(db, r_uid)
    room_name = room.name

    await chat_crud.delete_room(db, room)  # chat_messages + chat_room_members cascade

    event = {"type": "room_deleted", "room_id": str(r_uid), "room_name": room_name}
    for mid in member_ids:
        asyncio.create_task(notify(mid, event))

    return {"deleted": True, "room_id": str(r_uid)}


# ---------------------------------------------------------------------------
# 7c. DELETE /chat/rooms/{room_id}/members/{member_id}  (remove / leave)
# ---------------------------------------------------------------------------

@router.delete("/rooms/{room_id}/members/{member_id}")
async def remove_group_member(
    room_id: str,
    member_id: str,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Remove a member from a group.

    - Admin can remove any non-admin member.
    - Any member can remove THEMSELVES (leave group) — except the admin,
      who would orphan the group (transfer/delete flows don't exist yet).
    The removed user gets a `removed_from_group` frame; remaining members get
    `member_removed` so their rosters live-update.
    """
    r_uid = parse_uuid(room_id, "room_id")
    target_uid = parse_uuid(member_id, "member_id")

    room = await chat_crud.get_room_by_id(db, r_uid)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    if room.type != RoomType.GROUP:
        raise HTTPException(status_code=400, detail="Members can only be removed from group rooms.")

    caller_row = await chat_crud.get_room_membership(db, r_uid, caller_id)
    if caller_row is None:
        raise HTTPException(status_code=403, detail="You are not a member of this group.")

    target_row = await chat_crud.get_room_membership(db, r_uid, target_uid)
    if target_row is None:
        raise HTTPException(status_code=404, detail="That user is not a member of this group.")

    if target_uid == caller_id:
        if caller_row.is_admin:
            raise HTTPException(
                status_code=400,
                detail="Admins can't leave their own group.",
            )
    else:
        if not caller_row.is_admin:
            raise HTTPException(status_code=403, detail="Only the group admin can remove members.")
        if target_row.is_admin:
            raise HTTPException(status_code=400, detail="The group admin can't be removed.")

    await chat_crud.delete_room_member(db, target_row)

    left = target_uid == caller_id
    asyncio.create_task(notify(str(target_uid), {
        "type": "removed_from_group", "room_id": str(r_uid),
        "room_name": room.name, "left": left,
    }))
    member_event = {"type": "member_removed", "room_id": str(r_uid), "user_id": str(target_uid)}
    for mid in await room_member_ids(db, r_uid):
        asyncio.create_task(notify(mid, member_event))

    return {"room_id": str(r_uid), "removed": str(target_uid), "left": left}


# ---------------------------------------------------------------------------
# 8. GET /chat/rooms/{room_id}/messages  (with cursor pagination + reply previews + reactions)
# ---------------------------------------------------------------------------

@router.get("/rooms/{room_id}/messages")
async def get_room_messages(
    room_id: str,
    user_id: str = Query(...),
    before: Optional[str] = Query(default=None),
    direction: str = Query(default="before", regex="^(before|after)$"),
    limit: int = Query(default=50, ge=1, le=200),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    r_uid = parse_uuid(room_id, "room_id")
    uid = parse_uuid(user_id, "user_id")
    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    await verify_room_member(db, r_uid, caller_id)

    # Build base query with cursor
    conditions = [ChatMessage.room_id == r_uid]
    if before is not None:
        try:
            cursor_dt = datetime.fromisoformat(before)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid ISO timestamp for 'before' cursor.")
        if direction == "before":
            conditions.append(ChatMessage.created_at < cursor_dt)
        else:  # after
            conditions.append(ChatMessage.created_at > cursor_dt)

    if direction == "before":
        order_clause = ChatMessage.created_at.desc()
    else:
        order_clause = ChatMessage.created_at.asc()

    rows = await chat_crud.get_messages_page(db, conditions, order_clause, limit + 1)

    has_more = len(rows) > limit
    messages = list(rows[:limit])

    # Return in ascending order for display
    if direction == "before":
        messages_asc = list(reversed(messages))
    else:
        messages_asc = messages

    # Mark fetched messages as DELIVERED where user is recipient and status == SENT
    msg_ids = [m.id for m in messages_asc if m.sender_id != uid and m.status == MsgStatus.SENT]
    if msg_ids:
        await chat_crud.mark_messages_delivered(db, msg_ids)

    all_msg_ids = [m.id for m in messages_asc]

    # Fetch read_by per message
    receipts_by_msg = await chat_crud.get_read_receipts_for_messages(db, all_msg_ids)

    # Fetch reply_to previews in batch
    reply_to_ids = [m.reply_to_id for m in messages_asc if m.reply_to_id is not None]
    reply_preview_map: dict[uuid.UUID, dict[str, Any]] = {}
    if reply_to_ids:
        reply_msgs = await chat_crud.get_messages_by_ids(db, reply_to_ids)
        for rm in reply_msgs:
            reply_preview_map[rm.id] = {
                "id": str(rm.id),
                "content": rm.content,
                "sender_id": str(rm.sender_id),
            }

    # Fetch reactions for all messages in batch
    reactions_by_msg = await chat_crud.get_reactions_for_messages(db, all_msg_ids)

    return {
        "messages": [
            message_dict(
                m,
                receipts_by_msg.get(m.id, []),
                reply_preview_map.get(m.reply_to_id) if m.reply_to_id else None,
                reactions_by_msg.get(m.id, {}),
            )
            for m in messages_asc
        ],
        "has_more": has_more,
    }


# ---------------------------------------------------------------------------
# 9. POST /chat/rooms/{room_id}/messages  (with moderation + reply_to_id)
# ---------------------------------------------------------------------------

@router.post("/rooms/{room_id}/messages", status_code=201)
async def send_message(
    room_id: str,
    body: SendMessageBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    r_uid = parse_uuid(room_id, "room_id")
    sender_uid = parse_uuid(body.sender_id, "sender_id")
    if sender_uid != caller_id:
        raise HTTPException(status_code=403, detail="sender_id does not match authenticated user")

    # Content moderation check
    is_ok, reason = moderate_content(body.content)
    if not is_ok:
        raise HTTPException(status_code=400, detail=reason)

    mute = await chat_crud.get_active_mute(db, caller_id)
    if mute is not None:
        raise HTTPException(
            status_code=403,
            detail=f"Your chat access is temporarily restricted until {mute.muted_until.isoformat()} due to a reported violation.",
        )

    await check_feature_quota(caller_id, "chat_message")

    # Verify room exists
    if await chat_crud.get_room_by_id(db, r_uid) is None:
        raise HTTPException(status_code=404, detail="Room not found.")

    # Verify sender is a member of the room
    await verify_room_member(db, r_uid, sender_uid)

    # Parse optional reply_to_id
    reply_to_uuid: uuid.UUID | None = None
    if body.reply_to_id is not None:
        reply_to_uuid = parse_uuid(body.reply_to_id, "reply_to_id")
        # Verify referenced message exists
        if await chat_crud.get_message_by_id(db, reply_to_uuid) is None:
            raise HTTPException(status_code=404, detail="reply_to_id message not found.")

    msg = await chat_crud.create_message(db, r_uid, sender_uid, body.content, reply_to_uuid)

    # Get all room members except sender
    members = await chat_crud.get_room_members_excluding(db, r_uid, sender_uid)

    msg_event: dict[str, Any] = {
        "type": "new_message",
        "room_id": str(r_uid),
        "message": message_dict(msg),
    }

    # Fetch sender profile for push notification title
    sender_profile = await chat_crud.get_user_profile(db, sender_uid)
    sender_name = sender_profile.full_name if sender_profile else str(sender_uid)

    mgr = manager
    for member in members:
        member_id_str = str(member.user_id)
        asyncio.create_task(notify(member_id_str, msg_event))
        # Send FCM push for offline members (non-blocking)
        if not await mgr.is_online(member_id_str):
            asyncio.create_task(
                send_offline_push(
                    user_id=member_id_str,
                    title=f"{sender_name} sent a message",
                    body=body.content[:100],
                    data={"room_id": str(r_uid), "type": "new_message"},
                )
            )

    return message_dict(msg)


# ---------------------------------------------------------------------------
# 10. POST /chat/rooms/{room_id}/read
# ---------------------------------------------------------------------------

@router.post("/rooms/{room_id}/read")
async def mark_messages_read(
    room_id: str,
    body: MarkReadBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    r_uid = parse_uuid(room_id, "room_id")
    uid = parse_uuid(body.user_id, "user_id")
    if uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    # last_message_id is optional — mobile may send None or empty string
    last_msg_id_raw = body.last_message_id if body.last_message_id else None
    last_msg: ChatMessage | None = None

    if last_msg_id_raw:
        last_msg_uid = parse_uuid(last_msg_id_raw, "last_message_id")
        last_msg = await chat_crud.get_message_by_id(db, last_msg_uid)
        if last_msg is None:
            raise HTTPException(status_code=404, detail="last_message_id not found.")

    # All unread messages in this room up to and including last_message_id (or all if not provided)
    up_to_created_at = last_msg.created_at if last_msg is not None else None
    unread_messages = await chat_crud.get_unread_messages_up_to(db, r_uid, uid, up_to_created_at)

    if not unread_messages:
        return {"marked": 0}

    # Insert read receipts (ignore conflicts) and flip status to READ —
    # one transaction, one commit.
    unread_ids = [um.id for um in unread_messages]
    await chat_crud.mark_room_messages_read(db, unread_ids, uid)

    # Notify each unique sender via WebSocket
    sender_ids: set[uuid.UUID] = {um.sender_id for um in unread_messages}
    # Determine the highest message id marked (for notification)
    up_to_id = str(last_msg.id) if last_msg is not None else str(unread_ids[-1])
    read_notification: dict[str, Any] = {
        "type": "messages_read",
        "room_id": str(r_uid),
        "read_by": str(uid),
        "up_to_message_id": up_to_id,
    }
    for sid in sender_ids:
        asyncio.create_task(notify(str(sid), read_notification))

    return {"marked": len(unread_messages)}


# ---------------------------------------------------------------------------
# 11. POST /chat/messages/{message_id}/reactions  (toggle reaction)
# ---------------------------------------------------------------------------

VALID_EMOJI_NAMES = {"like", "love", "haha", "wow", "sad", "angry", "thumbsup", "clap"}


@router.post("/messages/{message_id}/reactions")
async def toggle_reaction(
    message_id: str,
    body: ReactBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Toggle a reaction on a message. Same user+emoji toggles off; different emoji upserts."""
    msg_uid = parse_uuid(message_id, "message_id")
    user_uid = parse_uuid(body.user_id, "user_id")
    if user_uid != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")

    # Validate emoji: named set OR single unicode character
    emoji = body.emoji.strip()
    if emoji not in VALID_EMOJI_NAMES and len(emoji) != 1:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid emoji. Must be one of {sorted(VALID_EMOJI_NAMES)} or a single emoji character.",
        )

    # Verify message exists and fetch room_id
    msg = await chat_crud.get_message_by_id(db, msg_uid)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found.")

    # Verify user is a member of the message's room
    if await chat_crud.get_room_membership(db, msg.room_id, user_uid) is None:
        raise HTTPException(status_code=403, detail="User is not a member of this room.")

    # Check if reaction already exists (toggle)
    existing_reaction = await chat_crud.get_reaction(db, msg_uid, user_uid, emoji)

    if existing_reaction is not None:
        # Toggle off: delete existing reaction
        await chat_crud.delete_reaction(db, existing_reaction.id)
    else:
        # Insert new reaction
        await chat_crud.add_reaction(db, msg_uid, user_uid, emoji)

    # Fetch updated reactions summary for this message
    reactions = await chat_crud.get_reactions_summary(db, msg_uid)

    # Broadcast reaction update to all room members
    all_members = await chat_crud.get_members_by_rooms(db, [msg.room_id])

    reaction_event: dict[str, Any] = {
        "type": "reaction_update",
        "message_id": str(msg_uid),
        "reactions": reactions,
    }
    for member in all_members:
        asyncio.create_task(notify(str(member.user_id), reaction_event))

    return {"message_id": str(msg_uid), "reactions": reactions}


# ---------------------------------------------------------------------------
# 12. GET /chat/messages/{message_id}/reactions
# ---------------------------------------------------------------------------

@router.get("/messages/{message_id}/reactions")
async def get_message_reactions(
    message_id: str,
    user_id: str = Query(...),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return reactions for a message grouped by emoji."""
    msg_uid = parse_uuid(message_id, "message_id")
    parse_uuid(user_id, "user_id")  # validate format

    # Verify message exists
    msg = await chat_crud.get_message_by_id(db, msg_uid)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found.")

    await verify_room_member(db, msg.room_id, caller_id)

    reactions = await chat_crud.get_reactions_summary(db, msg_uid)
    return {"message_id": str(msg_uid), "reactions": reactions}


# ---------------------------------------------------------------------------
# Abuse / moderation reports
# ---------------------------------------------------------------------------

@router.post("/reports", status_code=201, response_model=ReportResponse)
async def create_content_report(
    body: CreateReportBody,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> ContentReport:
    """File an abuse report against a chat message, a room, a battle
    opponent, or a user profile. A snapshot of the reported message content
    is captured at report time, since ChatMessage rows expire after 7 days
    (see models/chat.py) and would otherwise be gone before an admin
    reviews the report."""
    if body.target_user_id == caller_id:
        raise HTTPException(status_code=400, detail="You cannot report yourself.")

    content_snapshot: str | None = None
    if body.target_type.value == "chat_message" and body.target_ref_id is not None:
        content_snapshot = await chat_crud.get_message_content(db, body.target_ref_id)

    report = await chat_crud.create_report(
        db,
        reporter_id=caller_id,
        target_type=body.target_type,
        target_user_id=body.target_user_id,
        target_ref_id=body.target_ref_id,
        reason=body.reason,
        details=body.details,
        content_snapshot=content_snapshot,
    )
    return report


@router.get("/admin/reports", response_model=list[ReportResponse])
async def admin_list_reports(
    status: Optional[ReportStatus] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ContentReport]:
    reports, _total = await chat_crud.list_reports(db, status, page, limit)
    return reports


@router.post("/admin/reports/{report_id}/resolve", response_model=ReportResponse)
async def admin_resolve_report(
    report_id: str,
    body: ResolveReportBody,
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ContentReport:
    """Action a pending report: dismiss, warn (logged only, no restriction),
    mute (temporary chat-send block, this service), or deactivate (delegates
    to auth_service's existing account is_active flag — the same mechanism
    admin/src's UsersPage already uses)."""
    report_uid = parse_uuid(report_id, "report_id")
    report = await chat_crud.get_report(db, report_uid)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.status != ReportStatus.PENDING:
        raise HTTPException(status_code=409, detail="This report has already been resolved.")

    if body.action == "mute":
        muted_until = datetime.now(timezone.utc) + timedelta(hours=body.mute_hours)
        await chat_crud.set_chat_mute(db, report.target_user_id, muted_until, body.note, admin_id)
    elif body.action == "deactivate":
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{settings.AUTH_SERVICE_URL}/api/v1/auth/internal/deactivate",
                    json={
                        "user_id": str(report.target_user_id),
                        "actioned_by": str(admin_id),
                        "reason": body.note,
                    },
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail=f"Could not deactivate the reported account: {exc}"
            )

    return await chat_crud.resolve_report(db, report, admin_id, body.action, body.note)


# ---------------------------------------------------------------------------
# 13. GET /chat/parent/monitor/{child_user_id}  (with audit logging)
# ---------------------------------------------------------------------------

@router.get("/parent/monitor/{child_user_id}")
async def parent_monitor_rooms(
    child_user_id: str,
    parent_user_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(require_parent),
) -> list[dict[str, Any]]:
    """Return the child's room list (read-only, parent-verified)."""
    child_uid = parse_uuid(child_user_id, "child_user_id")
    parent_uid = _monitoring_parent(caller_id, parent_user_id)

    await verify_parent_link(db, parent_uid, child_uid)

    # Audit log: parent viewed child's rooms
    await chat_crud.add_parent_audit_log(db, parent_uid, child_uid, "view_rooms")

    return await _get_rooms_for_user(db, child_uid)


# ---------------------------------------------------------------------------
# 14. GET /chat/parent/monitor/{child_user_id}/rooms/{room_id}  (with audit logging)
# ---------------------------------------------------------------------------

@router.get("/parent/monitor/{child_user_id}/rooms/{room_id}")
async def parent_monitor_room_messages(
    child_user_id: str,
    room_id: str,
    parent_user_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(require_parent),
) -> dict[str, Any]:
    """Return messages for a child's room (read-only, no delivery marking)."""
    child_uid = parse_uuid(child_user_id, "child_user_id")
    parent_uid = _monitoring_parent(caller_id, parent_user_id)
    r_uid = parse_uuid(room_id, "room_id")

    await verify_parent_link(db, parent_uid, child_uid)

    # Fetch messages without marking delivery status
    messages = list(reversed(await chat_crud.get_room_messages_desc(db, r_uid, 50)))

    # Audit log: parent viewed room messages
    await chat_crud.add_parent_audit_log(db, parent_uid, child_uid, "view_room_messages", room_id=r_uid)

    all_msg_ids = [m.id for m in messages]
    receipts_by_msg = await chat_crud.get_read_receipts_for_messages(db, all_msg_ids)

    # Fetch reply_to previews in batch
    reply_to_ids = [m.reply_to_id for m in messages if m.reply_to_id is not None]
    reply_preview_map: dict[uuid.UUID, dict[str, Any]] = {}
    if reply_to_ids:
        reply_msgs = await chat_crud.get_messages_by_ids(db, reply_to_ids)
        for rm in reply_msgs:
            reply_preview_map[rm.id] = {
                "id": str(rm.id),
                "content": rm.content,
                "sender_id": str(rm.sender_id),
            }

    # Fetch reactions in batch
    reactions_by_msg = await chat_crud.get_reactions_for_messages(db, all_msg_ids)

    return {
        "messages": [
            message_dict(
                m,
                receipts_by_msg.get(m.id, []),
                reply_preview_map.get(m.reply_to_id) if m.reply_to_id else None,
                reactions_by_msg.get(m.id, {}),
            )
            for m in messages
        ],
        "has_more": False,
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _monitoring_parent(caller_id: uuid.UUID, parent_user_id: Optional[str]) -> uuid.UUID:
    """The parent being verified is ALWAYS the authenticated caller.

    The parent_user_id query param is kept only for client compatibility
    and must match the caller. It used to be trusted as-is, so any
    parent-role user could pass another parent's id plus that parent's
    child's id and read the child's rooms and messages (and the audit log
    recorded the spoofed parent, not the real caller).
    """
    if parent_user_id is not None and parse_uuid(parent_user_id, "parent_user_id") != caller_id:
        raise HTTPException(status_code=403, detail="parent_user_id does not match the authenticated user")
    return caller_id


async def verify_parent_link(
    db: AsyncSession,
    parent_uid: uuid.UUID,
    child_uid: uuid.UUID,
) -> None:
    # Approved links only — chat_crud.get_parent_link matched any row, so a
    # stranger's still-pending link request already granted read access to
    # the student's private chats.
    if not await verify_parent_child_link(db, parent_uid, child_uid):
        raise HTTPException(
            status_code=403,
            detail="No verified parent-child link between the given users.",
        )


async def notify(user_id: str, payload: dict[str, Any]) -> None:
    """Fire-and-forget WebSocket delivery; errors are silently swallowed."""
    try:
        mgr = manager
        await mgr.deliver(user_id, payload)
    except Exception:  # noqa: BLE001
        pass


async def notify_persistent(user_id: str, title: str, body: str, template: str) -> None:
    """Fire-and-forget durable notification: notification_service persists an
    in-app Notification row for the target user AND enqueues real push
    delivery over Celery/RabbitMQ when they have a registered device token.
    (The older send_offline_push path was dead code — wrong default port and
    a JWT-gated endpoint that can only push to the CALLER's own devices.)"""
    try:
        notification_url = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification_service:8000")
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                notification_url + "/api/v1/notifications/internal/notify",
                json={"user_id": user_id, "title": title, "body": body, "template": template},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:  # noqa: BLE001
        pass


FR_COUNT_TTL = 30  # seconds — short TTL backstop; mutations invalidate explicitly


def fr_count_key(uid: uuid.UUID | str) -> str:
    return f"fr_count:{uid}"


async def invalidate_fr_count(*user_ids: uuid.UUID | str) -> None:
    """Drop the Redis-cached pending-request badge count for these users —
    called on every send/accept/reject/cancel so badges update immediately."""
    redis = await get_redis()
    if redis is None:
        return
    try:
        await redis.delete(*[fr_count_key(u) for u in user_ids])
    except Exception:  # noqa: BLE001
        pass


async def friend_ids_of(db: AsyncSession, uid: uuid.UUID) -> set[uuid.UUID]:
    return await chat_crud.friend_ids_of(db, uid)


async def mutual_counts(
    db: AsyncSession, caller: uuid.UUID, others: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Facebook-style 'N mutual friends' per candidate, in two queries total:
    the caller's friend set once, then every accepted edge touching any
    candidate (intersected per-candidate in Python)."""
    if not others:
        return {}
    caller_set = await friend_ids_of(db, caller)
    if not caller_set:
        return {o: 0 for o in others}
    accepted = await chat_crud.get_accepted_friend_requests_touching(db, others)
    per_other: dict[uuid.UUID, set[uuid.UUID]] = {o: set() for o in others}
    for fr in accepted:
        if fr.from_user_id in per_other:
            per_other[fr.from_user_id].add(fr.to_user_id)
        if fr.to_user_id in per_other:
            per_other[fr.to_user_id].add(fr.from_user_id)
    return {o: len(friends & caller_set) for o, friends in per_other.items()}


async def send_offline_push(user_id: str, title: str, body: str, data: dict[str, Any]) -> None:
    """Send FCM push notification via notification_service for an offline user."""
    try:
        notification_url = os.getenv(
            "NOTIFICATION_SERVICE_URL", "http://notification_service:8003"
        )
        async with httpx.AsyncClient() as client:
            await client.post(
                notification_url + "/api/v1/notifications/push/send",
                json={"user_id": user_id, "title": title, "body": body, "data": data},
                timeout=5.0,
            )
    except Exception:  # noqa: BLE001
        pass
