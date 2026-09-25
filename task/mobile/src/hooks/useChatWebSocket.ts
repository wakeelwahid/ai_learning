import { useEffect, useRef, useCallback, useState } from "react";
import { getAccessToken } from "@/api/secureStorage";
import { BASE_URL } from "@/api/client";
import { toChatMessage, ChatMessage, Reaction } from "@/api/chat";

// Derive WebSocket URL from the HTTP base URL
// e.g. "http://10.0.2.2:3002/api" -> "ws://10.0.2.2:3002/ws"
function buildWsUrl(token: string): string {
  const base = BASE_URL.replace(/\/api$/, "").replace(/^http/, "ws");
  return `${base}/ws?token=${encodeURIComponent(token)}`;
}

export type WsIncomingMessage =
  | { type: "new_message";       payload: ChatMessage }
  | { type: "typing";            payload: { room_id: string; user_id: string } }
  | { type: "typing_stop";       payload: { room_id: string; user_id: string } }
  | { type: "messages_read";     payload: { room_id: string; read_by: string; up_to_message_id: string } }
  | { type: "reaction_update";   payload: { message_id: string; reactions: Reaction[] } }
  | { type: "friend_event";      payload: Record<string, unknown> };

// The server sends FLAT frames (no {type, payload} envelope) whose message
// rows use the backend field names. normalizeFrame() is the single adapter
// from the wire contract (verified live by tools/api-tests/ws_chat_test.py)
// to the app-facing union above:
//   {type:"new_message", room_id, message:{id,...}}          -> payload: ChatMessage
//   {type:"messages_read", room_id, read_by, up_to_message_id}
//   {type:"typing", room_id, user_id, is_typing:boolean}     -> typing | typing_stop
//   {type:"reaction_update", message_id, reactions:{emoji:{count,reacted_by}}}
//   {type:"friend_request"|"friend_accepted"|"friend_request_cancelled"} -> friend_event
function normalizeFrame(raw: any): WsIncomingMessage | null {
  switch (raw?.type) {
    case "new_message":
      return raw.message
        ? { type: "new_message", payload: toChatMessage(raw.message) }
        : null;
    case "messages_read":
      return {
        type: "messages_read",
        payload: {
          room_id: raw.room_id,
          read_by: raw.read_by,
          up_to_message_id: raw.up_to_message_id,
        },
      };
    case "typing":
      return {
        type: raw.is_typing === false ? "typing_stop" : "typing",
        payload: { room_id: raw.room_id, user_id: raw.user_id },
      };
    case "reaction_update": {
      const reactions: Reaction[] = Array.isArray(raw.reactions)
        ? raw.reactions
        : Object.entries(raw.reactions ?? {}).map(([emoji, v]: [string, any]) => ({
            emoji,
            count: v?.count ?? 0,
            user_ids: v?.reacted_by ?? v?.user_ids ?? [],
          }));
      return { type: "reaction_update", payload: { message_id: raw.message_id, reactions } };
    }
    case "friend_request":
    case "friend_accepted":
    case "friend_request_cancelled":
      return { type: "friend_event", payload: raw };
    default:
      return null; // pong / error / unknown — not surfaced to screens
  }
}

interface UseChatWebSocketReturn {
  send:        (data: Record<string, unknown>) => void;
  connected:   boolean;
  lastMessage: WsIncomingMessage | null;
}

const MAX_RETRIES       = 10;
const HEARTBEAT_MS      = 30_000;
const BASE_BACKOFF_MS   = 1_000;

export function useChatWebSocket(): UseChatWebSocketReturn {
  const wsRef          = useRef<WebSocket | null>(null);
  const heartbeatRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef  = useRef(0);
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef     = useRef(true);

  const [connected,   setConnected]   = useState(false);
  const [lastMessage, setLastMessage] = useState<WsIncomingMessage | null>(null);

  const clearHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    const token = await getAccessToken();
    if (!token) return;

    const url = buildWsUrl(token);
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      retryCountRef.current = 0;
      setConnected(true);

      // Heartbeat ping every 30 s
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const normalized = normalizeFrame(JSON.parse(event.data));
        if (normalized) setLastMessage(normalized);
      } catch {
        // ignore unparseable frames
      }
    };

    ws.onerror = () => {
      // onclose fires right after onerror, handle reconnect there
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      clearHeartbeat();
      setConnected(false);

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_BACKOFF_MS * 2 ** retryCountRef.current, 30_000);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearHeartbeat();
      clearRetryTimer();
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  return { send, connected, lastMessage };
}
