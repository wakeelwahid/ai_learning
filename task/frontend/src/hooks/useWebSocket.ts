import { useEffect, useRef, useState, useCallback } from "react";

const BASE_WS_URL = (() => {
  const apiUrl = import.meta.env.VITE_API_URL ?? "";
  // Absolute API base (e.g. "http://host:9000/api") → swap scheme to ws/wss and drop the
  // trailing "/api", because the gateway serves the chat socket at "/ws" (not "/api/ws").
  if (apiUrl.startsWith("http")) {
    return apiUrl.replace(/^http/, "ws").replace(/\/api\/?$/, "");
  }
  // Relative API base (e.g. "/api"): connect to the page host root so the URL becomes
  // "ws://host/ws" and matches the dev "/ws" proxy that forwards to the gateway.
  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}`;
})();

const MAX_RETRIES = 15;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;
const PRESENCE_INTERVAL_MS = 60000;

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketReturn {
  send: (data: object) => void;
  connected: boolean;
  connecting: boolean;
  reconnectCount: number;
}

export function useWebSocket(
  token: string | null,
  onMessage?: (msg: WsMessage) => void,
  _userId?: string,
  roomMemberIds?: string[]
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const roomMemberIdsRef = useRef(roomMemberIds);
  roomMemberIdsRef.current = roomMemberIds;

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const clearPresence = useCallback(() => {
    if (presenceIntervalRef.current) {
      clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = null;
    }
  }, []);

  const sendRaw = useCallback((data: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return;

    setConnecting(true);
    const url = `${BASE_WS_URL}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      retryCountRef.current = 0;
      setConnected(true);
      setConnecting(false);
      setReconnectCount(0);

      // Start heartbeat every 30s
      clearHeartbeat();
      heartbeatIntervalRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Start presence check every 60s
      clearPresence();
      presenceIntervalRef.current = setInterval(() => {
        const memberIds = roomMemberIdsRef.current;
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN &&
          memberIds &&
          memberIds.length > 0
        ) {
          wsRef.current.send(
            JSON.stringify({ type: "presence_check", user_ids: memberIds })
          );
        }
      }, PRESENCE_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const parsed: WsMessage = JSON.parse(event.data as string);
        onMessageRef.current?.(parsed);
      } catch {
        // Ignore non-JSON frames
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — handle reconnect there
      console.error("[useWebSocket] WebSocket error");
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      setConnecting(false);
      wsRef.current = null;
      clearHeartbeat();
      clearPresence();

      if (retryCountRef.current < MAX_RETRIES) {
        const backoff = Math.min(
          BASE_BACKOFF_MS * Math.pow(2, retryCountRef.current),
          MAX_BACKOFF_MS
        );
        retryCountRef.current += 1;
        setReconnectCount(retryCountRef.current);
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, backoff);
      }
    };
  }, [token, clearHeartbeat, clearPresence]);

  useEffect(() => {
    mountedRef.current = true;

    if (token) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      clearHeartbeat();
      clearPresence();
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional teardown
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  const send = useCallback((data: object) => {
    sendRaw(data);
  }, [sendRaw]);

  return { send, connected, connecting, reconnectCount };
}
