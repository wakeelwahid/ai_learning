import logging

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.core.dependencies import decode_ws_user_id
from app.core.websocket_manager import error_msg, manager, player_joined_msg, player_left_msg

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/battles", tags=["battles"])


# ── WebSocket: Real-time Battle Room ──────────────────────────────────────────

@router.websocket("/{battle_id}/ws")
async def battle_ws(
    websocket: WebSocket,
    battle_id: str,
    token: str = Query(...),
    display_name: str = Query(...),
    spectator: bool = Query(default=False),
):
    """
    WebSocket endpoint for real-time battle participation and spectating.

    Auth: browsers can't attach an `Authorization` header to a WebSocket
    handshake, so the client must pass its JWT access token as `?token=`.
    The token is verified with the SAME decode/verify logic used by the REST
    `get_current_user_id` dependency (see `app.core.dependencies.decode_ws_user_id`)
    and the connection's identity is ALWAYS the verified `sub` claim — never
    a client-supplied id. If the token is missing/invalid the connection is
    rejected (closed) before it is accepted, so it never occupies a
    `ConnectionManager._rooms` slot under a spoofed identity.

    Client messages (players only):
      {"type": "ready"}
      {"type": "answer", "payload": {"question_idx": 0, "answer": "B", "time_ms": 1200}}
      {"type": "next_question", "payload": {"question_idx": 1}}
      {"type": "leave"}

    Client messages (spectators):
      {"type": "ping"}

    Server broadcasts:
      player_joined, spectator_joined, battle_starting, battle_started, question,
      answer_result, leaderboard_update, battle_finished, player_left, error
    """
    try:
        user_id = str(await decode_ws_user_id(token))
    except HTTPException:
        # Reject before accept() — never fall back to a client-supplied id.
        await websocket.close(code=1008, reason="Invalid or missing authentication token")
        return

    ws_user_id = f"spectator:{user_id}" if spectator else user_id
    await manager.connect(battle_id, ws_user_id, websocket)
    try:
        if spectator:
            # Spectators receive a welcome message with current battle state
            await manager.send_personal(
                battle_id, ws_user_id,
                {"type": "spectator_connected", "payload": {"display_name": display_name, "battle_id": battle_id}},
            )
        else:
            # Announce player join to others
            await manager.broadcast(
                battle_id,
                player_joined_msg({"user_id": user_id, "display_name": display_name, "score": 0, "correct": 0, "accuracy": 0}),
                exclude_user=ws_user_id,
            )

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")
            payload = data.get("payload", {})

            if spectator:
                # Spectators can only ping
                if msg_type == "ping":
                    await manager.send_personal(battle_id, ws_user_id, {"type": "pong"})
                continue

            if msg_type == "ready":
                await manager.broadcast(
                    battle_id,
                    {"type": "player_ready", "payload": {"user_id": user_id, "display_name": display_name}},
                )

            elif msg_type == "next_question":
                q_idx = payload.get("question_idx", 0)
                await manager.broadcast(
                    battle_id,
                    {"type": "question_requested", "payload": {"question_idx": q_idx, "requested_by": user_id}},
                    exclude_user=ws_user_id,
                )

            elif msg_type == "leave":
                await manager.broadcast(
                    battle_id,
                    player_left_msg(user_id, display_name),
                    exclude_user=ws_user_id,
                )
                break

            elif msg_type == "ping":
                await manager.send_personal(battle_id, ws_user_id, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(battle_id, ws_user_id)
        if not spectator:
            await manager.broadcast(
                battle_id,
                player_left_msg(user_id, display_name),
            )
    except Exception as e:
        logger.error("WS error battle=%s user=%s: %s", battle_id, user_id, e)
        await manager.send_personal(battle_id, ws_user_id, error_msg(str(e)))
        await manager.disconnect(battle_id, ws_user_id)
