"""
WebSocket connection manager — local delivery + Redis pub/sub for horizontal scaling.

Architecture:
  • Local dict:  battle_id → {user_id: WebSocket}   (fast direct delivery on same instance)
  • Redis pub/sub: battle:{id}:events channel         (cross-instance sync)

Broadcast flow:
  1. Send directly to every WebSocket on this instance (< 1ms)
  2. Publish to Redis channel so other instances relay to their connections

The Redis listener (started at app startup) subscribes to ALL battle channels via
psubscribe("battle:*:events"). On receiving a message from ANOTHER instance it
delivers to any locally-connected users — ensuring every player sees the event
regardless of which server they're connected to.

Messages from THIS instance are already delivered in step 1, so we skip them
in the Redis listener to avoid double-delivery (identified by INSTANCE_ID).
"""
import asyncio
import json
import logging
import uuid

from fastapi import WebSocket

from app.core.redis_client import get_redis
from app.core.redis_state import RedisBattleState

logger = logging.getLogger(__name__)

INSTANCE_ID: str = str(uuid.uuid4())


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, WebSocket]] = {}
        self._lock = asyncio.Lock()
        self._pubsub_task: asyncio.Task | None = None

    # ── Connection lifecycle ─────────────────────────────────────────────────────

    async def connect(self, battle_id: str, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._rooms.setdefault(battle_id, {})[user_id] = ws
        logger.info("WS connect: battle=%s user=%s", battle_id, user_id)

    async def disconnect(self, battle_id: str, user_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(battle_id, {})
            room.pop(user_id, None)
            if not room:
                self._rooms.pop(battle_id, None)
        logger.info("WS disconnect: battle=%s user=%s", battle_id, user_id)

    # ── Messaging ────────────────────────────────────────────────────────────────

    async def send_personal(self, battle_id: str, user_id: str, message: dict) -> None:
        # With multiple uvicorn workers (each its own process, its own
        # independent _rooms dict), the WebSocket for `user_id` very often
        # lives on a DIFFERENT worker than the one handling this REST
        # request — a plain local-dict lookup then silently no-ops (no
        # exception, no log), dropping the message outright. This was a
        # live, reproduced bug: answer_result was missing on ~half of
        # /battles/{id}/answer calls under the service's real --workers 4
        # deployment, while broadcast() (which already had this same-shape
        # fallback) never dropped a frame.
        #
        # Fix: try local delivery first (covers the case where this worker
        # happens to hold the connection), then ALWAYS also publish a
        # single-recipient ("only_user") event over the same Redis channel
        # broadcast() uses — the pub/sub listener on whichever worker
        # actually holds the connection picks it up via _deliver_local's
        # only_user lookup. The listener's origin-echo skip only suppresses
        # THIS worker re-delivering its own publish, which is correct: this
        # worker already did the direct-delivery attempt above.
        ws = self._rooms.get(battle_id, {}).get(user_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                await self.disconnect(battle_id, user_id)
        try:
            await RedisBattleState.publish(battle_id, INSTANCE_ID, message, only_user=user_id)
        except Exception as exc:
            logger.debug("Redis send_personal publish skipped: %s", exc)

    async def broadcast(
        self,
        battle_id: str,
        message: dict,
        exclude_user: str | None = None,
    ) -> None:
        # Step 1: direct to local connections (ultra-low latency)
        room = dict(self._rooms.get(battle_id, {}))
        dead: list[str] = []
        for uid, ws in room.items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            await self.disconnect(battle_id, uid)

        # Step 2: publish to Redis for other service instances
        try:
            await RedisBattleState.publish(battle_id, INSTANCE_ID, message, exclude_user)
        except Exception as exc:
            logger.debug("Redis broadcast publish skipped: %s", exc)

    async def _deliver_local(
        self,
        battle_id: str,
        message: dict,
        exclude_user: str | None = None,
        only_user: str | None = None,
    ) -> None:
        """Deliver a cross-instance Redis event to local WebSocket connections.

        `only_user` (send_personal's targeted publish) restricts delivery to
        that single connection if this worker happens to hold it — every
        other worker's lookup naturally misses and does nothing, which is
        how a personal message reaches whichever one worker actually holds
        the target's WebSocket without also re-broadcasting it to everyone
        else in the room.
        """
        room = dict(self._rooms.get(battle_id, {}))
        if only_user is not None:
            ws = room.get(only_user)
            if ws:
                try:
                    await ws.send_json(message)
                except Exception:
                    await self.disconnect(battle_id, only_user)
            return
        dead: list[str] = []
        for uid, ws in room.items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            await self.disconnect(battle_id, uid)

    # ── Redis pub/sub listener ───────────────────────────────────────────────────

    async def start_pubsub_listener(self) -> None:
        if self._pubsub_task and not self._pubsub_task.done():
            return
        self._pubsub_task = asyncio.create_task(
            self._listen_redis(), name="redis-pubsub-listener"
        )
        logger.info("Redis pub/sub listener started (instance=%s)", INSTANCE_ID)

    async def _listen_redis(self) -> None:
        r = get_redis()
        pubsub = r.pubsub()
        try:
            await pubsub.psubscribe("battle:*:events")
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                try:
                    data = json.loads(message["data"])
                    if data.get("origin") == INSTANCE_ID:
                        continue  # already sent locally
                    channel: str = message["channel"]
                    # channel = "battle:{id}:events"
                    parts = channel.split(":")
                    if len(parts) >= 2:
                        battle_id = parts[1]
                        await self._deliver_local(
                            battle_id, data["msg"], data.get("exclude"), data.get("only"),
                        )
                except Exception as exc:
                    logger.warning("Pub/sub message error: %s", exc)
        except asyncio.CancelledError:
            pass
        finally:
            try:
                await pubsub.punsubscribe("battle:*:events")
                await pubsub.aclose()
            except Exception:
                pass

    # ── Info ─────────────────────────────────────────────────────────────────────

    def player_count(self, battle_id: str) -> int:
        return len(self._rooms.get(battle_id, {}))

    def connected_users(self, battle_id: str) -> list[str]:
        return list(self._rooms.get(battle_id, {}).keys())


# ── Global singleton ──────────────────────────────────────────────────────────────

manager = ConnectionManager()


# ── Message factory helpers ───────────────────────────────────────────────────────

def player_joined_msg(participant: dict) -> dict:
    return {"type": "player_joined", "payload": {"participant": participant}}


def battle_starting_msg(countdown: int = 3) -> dict:
    return {"type": "battle_starting", "payload": {"countdown_sec": countdown}}


def battle_started_msg(question: dict, question_idx: int, total: int, time_limit: int) -> dict:
    return {
        "type": "battle_started",
        "payload": {
            "question":     question,
            "question_idx": question_idx,
            "total":        total,
            "time_limit":   time_limit,
        },
    }


def question_msg(question: dict, question_idx: int, total: int) -> dict:
    return {
        "type": "question",
        "payload": {
            "question":     question,
            "question_idx": question_idx,
            "total":        total,
        },
    }


def answer_result_msg(correct: bool, score: int, accuracy: float) -> dict:
    return {
        "type": "answer_result",
        "payload": {"correct": correct, "score": score, "accuracy": accuracy},
    }


def leaderboard_msg(participants: list[dict]) -> dict:
    ranked = sorted(participants, key=lambda p: -p.get("score", 0))
    return {"type": "leaderboard_update", "payload": {"leaderboard": ranked}}


def battle_finished_msg(result: dict) -> dict:
    return {"type": "battle_finished", "payload": result}


def player_left_msg(user_id: str, display_name: str) -> dict:
    return {"type": "player_left", "payload": {"user_id": user_id, "display_name": display_name}}


def error_msg(detail: str) -> dict:
    return {"type": "error", "payload": {"detail": detail}}
