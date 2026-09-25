"""
WebSocket endpoint with Redis pub/sub for real-time chat.

Enhancements over v1:
  - Redis presence system (SET presence:{user_id} EX 300, HSET user_meta)
  - Cross-instance typing indicators via Redis pub/sub (typing:{room_id})
  - Offline message queue via Redis Streams (pending:{user_id})
  - Unread count tracking in Redis (HINCRBY unread:{user_id} room_id)
  - Graceful degradation when Redis is unavailable

Exposes:
  manager  - module-level ConnectionManager singleton
  router   - APIRouter with the /ws WebSocket endpoint
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import verify_token
from app.crud.chat_crud import get_room_member_ids, mark_message_read
from app.database.session import get_db

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PRESENCE_TTL = 300          # seconds
STREAM_MAXLEN = 500         # max pending messages per user
STREAM_DRAIN_COUNT = 100    # max entries to drain on connect
PRESENCE_CHECK_LIMIT = 50   # max user_ids in a single presence_check

# ---------------------------------------------------------------------------
# Timestamp helper
# ---------------------------------------------------------------------------

def now_iso() -> str:
    """Return current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# ConnectionManager
# ---------------------------------------------------------------------------

class ConnectionManager:
    """
    Manages active WebSocket connections and Redis pub/sub fan-out so that
    messages can reach users connected to any service instance.

    New in v2:
      - Presence tracking in Redis
      - Cross-instance typing indicators via Redis Streams / pub/sub
      - Offline message queue via Redis Streams
      - Unread count tracking
    """

    def __init__(self) -> None:
        # user_id (str) -> WebSocket
        self.connections: dict[str, WebSocket] = {}
        # Redis async client — wired up via setup()
        self.redis: aioredis.Redis | None = None
        # user_id -> asyncio.Task running _redis_subscriber
        self._subscriber_tasks: dict[str, asyncio.Task[None]] = {}
        # room_id -> asyncio.Task running _typing_subscriber
        self._typing_tasks: dict[str, asyncio.Task[None]] = {}
        # room_id -> set of local user_ids currently in that room
        self._room_members: dict[str, set[str]] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def setup(self, redis_url: str) -> None:
        """Connect to Redis.  Failures are non-fatal; the manager continues
        without pub/sub (single-instance mode)."""
        try:
            client = aioredis.from_url(redis_url, decode_responses=True)
            await client.ping()
            self.redis = client
            logger.info("ConnectionManager: Redis connected at %s", redis_url)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "ConnectionManager: could not connect to Redis (%s); "
                "running in single-instance mode without pub/sub.",
                exc,
            )
            self.redis = None

    # ------------------------------------------------------------------
    # Presence helpers
    # ------------------------------------------------------------------

    async def _set_online(self, user_id: str) -> None:
        """Mark user as online in Redis with a TTL."""
        if self.redis is None:
            return
        try:
            await self.redis.set(f"presence:{user_id}", "online", ex=PRESENCE_TTL)
            await self.redis.hset(f"user_meta:{user_id}", "last_seen", now_iso())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis _set_online failed for %s: %s", user_id, exc)

    async def _set_offline(self, user_id: str) -> None:
        """Clear presence key and record last_seen on disconnect."""
        if self.redis is None:
            return
        try:
            await self.redis.delete(f"presence:{user_id}")
            await self.redis.hset(f"user_meta:{user_id}", "last_seen", now_iso())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis _set_offline failed for %s: %s", user_id, exc)

    async def _refresh_presence(self, user_id: str) -> None:
        """Refresh the presence TTL on any activity (heartbeat)."""
        if self.redis is None:
            return
        try:
            await self.redis.expire(f"presence:{user_id}", PRESENCE_TTL)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis _refresh_presence failed for %s: %s", user_id, exc)

    async def is_online(self, user_id: str) -> bool:
        """Return True if user is online — local check first, then Redis."""
        if user_id in self.connections:
            return True
        if self.redis is None:
            return False
        try:
            result = await self.redis.get(f"presence:{user_id}")
            return result == "online"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis is_online check failed for %s: %s", user_id, exc)
            return False

    async def get_last_seen(self, user_id: str) -> str | None:
        """Return the last_seen ISO timestamp for a user, or None."""
        if self.redis is None:
            return None
        try:
            return await self.redis.hget(f"user_meta:{user_id}", "last_seen")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis get_last_seen failed for %s: %s", user_id, exc)
            return None

    # ------------------------------------------------------------------
    # Unread count helpers
    # ------------------------------------------------------------------

    async def increment_unread(self, user_id: str, room_id: str) -> None:
        """Increment the unread count for a user/room pair."""
        if self.redis is None:
            return
        try:
            await self.redis.hincrby(f"unread:{user_id}", room_id, 1)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis increment_unread failed for %s/%s: %s", user_id, room_id, exc)

    async def clear_unread(self, user_id: str, room_id: str) -> None:
        """Reset the unread count for a user/room pair to zero."""
        if self.redis is None:
            return
        try:
            await self.redis.hset(f"unread:{user_id}", room_id, 0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis clear_unread failed for %s/%s: %s", user_id, room_id, exc)

    # ------------------------------------------------------------------
    # Offline message queue (Redis Streams)
    # ------------------------------------------------------------------

    async def _enqueue_pending(self, user_id: str, data: dict[str, Any]) -> None:
        """Push a message to the pending stream for an offline user."""
        if self.redis is None:
            return
        try:
            stream_key = f"pending:{user_id}"
            await self.redis.xadd(
                stream_key,
                {
                    "type": data.get("type", "message"),
                    "payload": json.dumps(data),
                },
                maxlen=STREAM_MAXLEN,
                approximate=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis _enqueue_pending failed for %s: %s", user_id, exc)

    async def _drain_pending(self, user_id: str, websocket: WebSocket) -> int:
        """
        Drain the pending stream for user_id, sending each message over the
        just-accepted WebSocket.  Returns the number of messages delivered.
        """
        if self.redis is None:
            return 0
        stream_key = f"pending:{user_id}"
        delivered = 0
        try:
            entries: list[tuple[str, dict[str, str]]] = await self.redis.xrange(
                stream_key, "-", "+", count=STREAM_DRAIN_COUNT
            )
            if not entries:
                return 0

            entry_ids: list[str] = []
            for entry_id, fields in entries:
                try:
                    payload = json.loads(fields.get("payload", "{}"))
                    await websocket.send_json(payload)
                    delivered += 1
                    entry_ids.append(entry_id)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Failed to deliver pending entry %s to %s: %s",
                        entry_id, user_id, exc,
                    )
                    break

            # Delete delivered entries; trim any remainder to 0 if all done
            if entry_ids:
                await self.redis.xdel(stream_key, *entry_ids)
            # If we got fewer than DRAIN_COUNT, the stream is now empty
            if len(entries) < STREAM_DRAIN_COUNT:
                await self.redis.xtrim(stream_key, maxlen=0)

        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis _drain_pending failed for %s: %s", user_id, exc)

        return delivered

    # ------------------------------------------------------------------
    # Typing indicators (cross-instance via Redis pub/sub)
    # ------------------------------------------------------------------

    async def publish_typing(
        self, room_id: str, user_id: str, is_typing: bool
    ) -> None:
        """Publish a typing event to the Redis typing channel for a room."""
        if self.redis is None:
            return
        try:
            payload = json.dumps(
                {
                    "type": "typing",
                    "user_id": user_id,
                    "room_id": room_id,
                    "is_typing": is_typing,
                }
            )
            await self.redis.publish(f"typing:{room_id}", payload)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Redis publish_typing failed for room %s user %s: %s",
                room_id, user_id, exc,
            )

    def _ensure_typing_subscriber(self, room_id: str) -> None:
        """Start a typing subscriber task for room_id if not already running."""
        existing = self._typing_tasks.get(room_id)
        if existing and not existing.done():
            return
        if self.redis is None:
            return
        task = asyncio.create_task(
            self._typing_subscriber(room_id),
            name=f"typing-sub-{room_id}",
        )
        self._typing_tasks[room_id] = task

    def _maybe_cancel_typing_subscriber(self, room_id: str) -> None:
        """Cancel the typing subscriber for a room if no members remain."""
        members = self._room_members.get(room_id, set())
        if members:
            return
        task = self._typing_tasks.pop(room_id, None)
        if task and not task.done():
            task.cancel()

    async def _typing_subscriber(self, room_id: str) -> None:
        """
        Subscribe to typing:{room_id} and forward events to all local members
        of that room.
        """
        if self.redis is None:
            return
        channel = f"typing:{room_id}"
        pubsub = self.redis.pubsub()
        try:
            await pubsub.subscribe(channel)
            async for raw in pubsub.listen():
                if raw.get("type") != "message":
                    continue

                # Stop if no local members remain
                members = self._room_members.get(room_id, set())
                if not members:
                    break

                try:
                    payload = json.loads(raw["data"])
                except json.JSONDecodeError:
                    continue

                # Forward to every locally connected room member
                for member_id in list(members):
                    ws = self.connections.get(member_id)
                    if ws is None:
                        continue
                    try:
                        await ws.send_json(payload)
                    except Exception:  # noqa: BLE001
                        pass
        except asyncio.CancelledError:
            pass
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """
        Accept the WebSocket, evict any stale connection, store it, start the
        Redis subscriber, set presence, and drain any pending offline messages.
        """
        await websocket.accept()

        # Evict previous connection for this user (e.g. tab refresh)
        if user_id in self.connections:
            old_ws = self.connections[user_id]
            try:
                await old_ws.close()
            except Exception:  # noqa: BLE001
                pass
            self._cancel_subscriber(user_id)

        self.connections[user_id] = websocket

        # Start personal Redis subscriber
        if self.redis is not None:
            task = asyncio.create_task(
                self._redis_subscriber(user_id),
                name=f"redis-sub-{user_id}",
            )
            self._subscriber_tasks[user_id] = task

        # Mark presence
        await self._set_online(user_id)

        # Drain offline message queue
        pending_count = await self._drain_pending(user_id, websocket)
        try:
            await websocket.send_json(
                {"type": "sync_complete", "pending_count": pending_count}
            )
        except Exception:  # noqa: BLE001
            pass

    def disconnect(self, user_id: str) -> None:
        """Remove the user's connection and stop its subscriber task."""
        self.connections.pop(user_id, None)
        self._cancel_subscriber(user_id)

        # Remove from all room memberships and clean up typing subscribers
        rooms_to_check: list[str] = []
        for room_id, members in self._room_members.items():
            members.discard(user_id)
            rooms_to_check.append(room_id)
        for room_id in rooms_to_check:
            self._maybe_cancel_typing_subscriber(room_id)

    def _cancel_subscriber(self, user_id: str) -> None:
        task = self._subscriber_tasks.pop(user_id, None)
        if task and not task.done():
            task.cancel()

    # ------------------------------------------------------------------
    # Delivery
    # ------------------------------------------------------------------

    async def deliver(
        self,
        user_id: str,
        data: dict[str, Any],
        room_id: str | None = None,
        transient: bool = False,
    ) -> bool:
        """
        Deliver *data* to *user_id*.

        Strategy:
          1. If this instance holds the connection, send directly.
          2. Otherwise publish to Redis so another instance can forward it
             AND push to the pending stream for true offline delivery.
          3. If delivery was offline and room_id provided, increment unread.
          4. Return True when delivered locally, False otherwise.
        """
        delivered_local = False
        websocket = self.connections.get(user_id)
        if websocket is not None:
            try:
                await websocket.send_json(data)
                delivered_local = True
            except Exception:  # noqa: BLE001
                # Stale connection — clean up
                self.disconnect(user_id)

        # ALWAYS fan out via Redis as well (multi-worker deployment): a stale
        # not-yet-reaped local socket for this user_id can otherwise swallow
        # the frame while their live connection sits on another worker.
        # Duplicates are possible (at-least-once); clients dedupe by message
        # id and the status/typing events are idempotent.
        if self.redis is not None:
            try:
                channel = f"chat:user:{user_id}"
                await self.redis.publish(channel, json.dumps(data))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis publish failed for user %s: %s", user_id, exc)

            # Enqueue to the pending stream ONLY for genuinely offline users —
            # transient events (typing) never queue, and queueing for users who
            # are online on ANOTHER worker (already served by the publish
            # above) made every cross-worker delivery replay as a stale
            # duplicate on their next reconnect.
            is_online_now = await self.is_online(user_id)
            if not transient and not is_online_now:
                await self._enqueue_pending(user_id, data)

        # Track unread count for offline delivery
        if room_id and not transient and not delivered_local:
            await self.increment_unread(user_id, room_id)

        return delivered_local

    # ------------------------------------------------------------------
    # Redis subscriber (background task per connected user)
    # ------------------------------------------------------------------

    async def _redis_subscriber(self, user_id: str) -> None:
        """Subscribe to *chat:user:{user_id}* and forward messages to the
        WebSocket.  Exits automatically when the user disconnects."""
        if self.redis is None:
            return

        channel = f"chat:user:{user_id}"
        pubsub = self.redis.pubsub()
        try:
            await pubsub.subscribe(channel)
            async for raw_message in pubsub.listen():
                if user_id not in self.connections:
                    break

                if raw_message.get("type") != "message":
                    continue

                websocket = self.connections.get(user_id)
                if websocket is None:
                    break

                try:
                    payload = json.loads(raw_message["data"])
                    await websocket.send_json(payload)
                except Exception:  # noqa: BLE001
                    break
        except asyncio.CancelledError:
            pass
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------------
    # Room membership helpers (for typing subscriber lifecycle)
    # ------------------------------------------------------------------

    def _join_room(self, user_id: str, room_id: str) -> None:
        self._room_members.setdefault(room_id, set()).add(user_id)

    def _leave_room(self, user_id: str, room_id: str) -> None:
        members = self._room_members.get(room_id, set())
        members.discard(user_id)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

manager = ConnectionManager()

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter()


@router.websocket("/ws")
async def chat_websocket(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    WebSocket endpoint for real-time chat.

    Connect:  ws://<host>/ws?token=<jwt>

    Incoming message shapes (JSON):
      {"type": "ping"}
      {"type": "heartbeat"}
      {"type": "typing",         "room_id": "<other_user_id>"}
      {"type": "typing_stop",    "room_id": "<other_user_id>"}
      {"type": "mark_read",      "message_id": "<uuid>", "sender_id": "<uuid>", "room_id": "<room_id>"}
      {"type": "presence_check", "user_ids": ["<uid>", ...]}   (max 50)
    """
    # ── 1. Validate token (auth_service is the single authentication ───────────
    #      authority — this service holds no signing secret and never decodes
    #      JWTs locally; verify_token() calls auth_service's /api/v1/auth/verify
    #      API, the same helper the HTTP routes use via get_current_user_id).
    try:
        data = await verify_token(token)
    except HTTPException as exc:
        await websocket.close(code=1008, reason=exc.detail)
        return

    uid: str = data["user_id"]

    # ── 2. Connect (accept + drain pending + set presence) ─────────────────────
    await manager.connect(uid, websocket)

    try:
        # ── 3. Receive loop ────────────────────────────────────────────────────
        while True:
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                break

            # Refresh presence TTL on every received message
            await manager._refresh_presence(uid)

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "invalid JSON"})
                continue

            msg_type: str = msg.get("type", "")

            # -- ping / pong ---------------------------------------------------
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            # -- heartbeat (explicit presence refresh) -------------------------
            elif msg_type == "heartbeat":
                # Presence TTL already refreshed above; just reply
                await websocket.send_json({"type": "pong"})

            # -- typing indicators --------------------------------------------
            elif msg_type in ("typing", "typing_stop"):
                room_id: str = msg.get("room_id", "")
                is_typing: bool = msg_type == "typing"

                if not room_id:
                    await websocket.send_json(
                        {"type": "error", "detail": "room_id required"}
                    )
                    continue

                # Resolve the room's members from DB and deliver through
                # manager.deliver() — the same local-or-cross-worker path
                # new_message/messages_read use (transient: no offline queue).
                # The previous design only forwarded to users who had
                # THEMSELVES typed, and its "local DM fallback" looked up a
                # connection keyed by the ROOM id — typing never arrived.
                try:
                    room_uuid = uuid.UUID(room_id)
                except ValueError:
                    await websocket.send_json(
                        {"type": "error", "detail": "invalid room_id UUID"}
                    )
                    continue
                member_ids = await get_room_member_ids(db, room_uuid)
                typing_payload: dict[str, Any] = {
                    "type": "typing",
                    "user_id": uid,
                    "room_id": room_id,
                    "is_typing": is_typing,
                }
                for member_id in member_ids:
                    if member_id != uid:
                        asyncio.create_task(
                            manager.deliver(member_id, typing_payload, transient=True)
                        )

            # -- mark_read -----------------------------------------------------
            elif msg_type == "mark_read":
                message_id_str: str = msg.get("message_id", "")
                sender_id_str: str = msg.get("sender_id", "")
                read_room_id: str = msg.get("room_id", "")

                if not message_id_str:
                    await websocket.send_json(
                        {"type": "error", "detail": "message_id required"}
                    )
                    continue

                try:
                    message_uuid = uuid.UUID(message_id_str)
                except ValueError:
                    await websocket.send_json(
                        {"type": "error", "detail": "invalid message_id UUID"}
                    )
                    continue

                try:
                    uid_uuid = uuid.UUID(uid)
                except ValueError:
                    await websocket.send_json(
                        {"type": "error", "detail": "invalid user UUID in token"}
                    )
                    continue

                await mark_message_read(db, message_uuid, uid_uuid)

                # Clear unread count in Redis for this room
                if read_room_id:
                    await manager.clear_unread(uid, read_room_id)

                # Notify the original sender that their message was read
                if sender_id_str:
                    read_receipt: dict[str, Any] = {
                        "type": "message_read",
                        "message_id": message_id_str,
                        "read_by": uid,
                    }
                    await manager.deliver(sender_id_str, read_receipt)

            # -- presence_check -----------------------------------------------
            elif msg_type == "presence_check":
                raw_user_ids = msg.get("user_ids", [])
                if not isinstance(raw_user_ids, list):
                    await websocket.send_json(
                        {"type": "error", "detail": "user_ids must be a list"}
                    )
                    continue

                # Cap at PRESENCE_CHECK_LIMIT
                check_ids: list[str] = [
                    str(u) for u in raw_user_ids[:PRESENCE_CHECK_LIMIT]
                ]

                presence_map: dict[str, str] = {}
                for check_uid in check_ids:
                    if await manager.is_online(check_uid):
                        presence_map[check_uid] = "online"
                    else:
                        last_seen = await manager.get_last_seen(check_uid)
                        presence_map[check_uid] = (
                            last_seen if last_seen is not None else "offline"
                        )

                await websocket.send_json(
                    {"type": "presence_list", "users": presence_map}
                )

            else:
                await websocket.send_json(
                    {"type": "error", "detail": f"unknown message type: {msg_type}"}
                )

    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Unexpected error in chat WebSocket for user %s: %s", uid, exc
        )
    finally:
        # Set offline presence asynchronously — create a task so we don't block
        # the finally block on a potentially slow Redis call
        asyncio.create_task(cleanup_presence(uid))
        manager.disconnect(uid)


async def cleanup_presence(user_id: str) -> None:
    """Fire-and-forget coroutine to mark presence offline on disconnect."""
    await manager._set_offline(user_id)
