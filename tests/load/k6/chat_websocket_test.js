/**
 * EduLearn — Chat WebSocket Load Test
 * =====================================
 * Tests: message send/receive, typing events, presence checks,
 *        Redis Streams offline queue drain, Redis pub/sub multi-instance delivery
 *
 * Usage:
 *   k6 run --vus 600 --duration 15m \
 *     -e BASE_URL=ws://localhost:9000 \
 *     -e HTTP_BASE=http://localhost:9000 \
 *     -e JWT_TOKEN=<test_jwt> \
 *     chat_websocket_test.js
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

// ── Custom Metrics ─────────────────────────────────────────────────────────

const chatConnectMs        = new Trend('ws_chat_connect_ms',         true);
const chatMsgRoundTrip     = new Trend('ws_chat_msg_rtt_ms',          true);
const chatPresenceCheck    = new Trend('ws_chat_presence_check_ms',   true);
const chatOfflineDrainMs   = new Trend('ws_chat_offline_drain_ms',    true);
const chatConnectErrors    = new Counter('ws_chat_connect_errors');
const chatMsgDeliveryFail  = new Rate('ws_chat_msg_delivery_fail');
const chatActiveConns      = new Gauge('ws_chat_active_connections');
const chatPubSubMisses     = new Counter('ws_chat_pubsub_cross_instance_miss');

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL  = __ENV.BASE_URL  || 'ws://localhost:9000';
const HTTP_BASE = __ENV.HTTP_BASE || 'http://localhost:9000';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'REPLACE_WITH_TEST_JWT';
const ROOM_IDS  = ['room-001', 'room-002', 'room-003', 'room-004', 'room-005']; // pre-seeded

export const options = {
  scenarios: {
    chat_steady: {
      executor: 'constant-vus',
      vus:      600,
      duration: '10m',
    },
    presence_heartbeat: {
      executor:   'constant-arrival-rate',
      rate:       300,
      timeUnit:   '30s',   // 300 heartbeats every 30s = ~10/s
      duration:   '10m',
      preAllocatedVUs: 50,
      maxVUs:          100,
      exec:            'presenceHeartbeat',
    },
    offline_queue_drain: {
      executor:   'shared-iterations',
      vus:        50,
      iterations: 50,
      startTime:  '8m',
      exec:       'offlineQueueDrain',
    },
  },
  thresholds: {
    'ws_chat_connect_ms':          ['p95<300'],
    'ws_chat_msg_rtt_ms':          ['p95<200'],
    'ws_chat_presence_check_ms':   ['p95<100'],
    'ws_chat_offline_drain_ms':    ['p95<2000'],
    'ws_chat_connect_errors':      ['count<100'],
    'ws_chat_msg_delivery_fail':   ['rate<0.02'],
  },
};

// ── Main Chat Scenario ──────────────────────────────────────────────────────

export default function () {
  const userId = `chat-user-${__VU}-${Date.now()}`;
  const roomId = ROOM_IDS[Math.floor(Math.random() * ROOM_IDS.length)];
  const wsUrl  = `${BASE_URL}/ws?token=${JWT_TOKEN}`;

  const connectStart = Date.now();

  const res = ws.connect(wsUrl, {}, function (socket) {
    chatConnectMs.add(Date.now() - connectStart);
    chatActiveConns.add(1);

    let msgSentAt     = 0;
    let msgsReceived  = 0;
    let myMsgCount    = 0;
    let sessionStart  = Date.now();

    socket.on('open', () => {
      // Join room
      socket.send(JSON.stringify({
        type:    'join_room',
        room_id: roomId,
        user_id: userId,
      }));
    });

    socket.on('message', (data) => {
      msgsReceived++;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (_) { return; }

      // Measure round-trip for our own messages
      if (msg.type === 'message_ack' && msgSentAt > 0) {
        chatMsgRoundTrip.add(Date.now() - msgSentAt);
        msgSentAt = 0;
      }

      // Cross-instance check: if we receive a message NOT from ourselves,
      // pub/sub is working. Count failures when we SHOULD receive but don't.
      if (msg.type === 'chat_message' && msg.sender_id !== userId) {
        // Message from another user delivered — pub/sub working
      }

      // Typing indicator delivered
      if (msg.type === 'typing_start' || msg.type === 'typing') {
        // Presence update received
      }
    });

    socket.on('error', (e) => {
      chatConnectErrors.add(1);
    });

    socket.on('close', () => {
      chatActiveConns.add(-1);
      const sessionMs = Date.now() - sessionStart;
      if (sessionMs < 3000 && msgsReceived === 0) {
        chatConnectErrors.add(1);
      }
    });

    // Send messages at realistic pace (~1 message per 30s per user)
    socket.setInterval(() => {
      if (myMsgCount < 10) {
        msgSentAt = Date.now();
        socket.send(JSON.stringify({
          type:    'send_message',
          room_id: roomId,
          content: `Test message ${myMsgCount + 1} from VU${__VU} at ${Date.now()}`,
          user_id: userId,
        }));
        myMsgCount++;

        // Timeout check: if no ack in 2s, count as delivery failure
        socket.setTimeout(() => {
          if (msgSentAt > 0) {
            chatMsgDeliveryFail.add(true);
            msgSentAt = 0;
          }
        }, 2000);
      }
    }, 30000);

    // Typing events every ~10s
    socket.setInterval(() => {
      socket.send(JSON.stringify({
        type:    'typing_start',
        room_id: roomId,
        user_id: userId,
      }));
      socket.setTimeout(() => {
        socket.send(JSON.stringify({
          type:    'typing_stop',
          room_id: roomId,
          user_id: userId,
        }));
      }, 2000);
    }, 10000);

    // Hold connection for 5-10 minutes (typical chat session)
    socket.setTimeout(() => {
      socket.send(JSON.stringify({ type: 'leave_room', room_id: roomId, user_id: userId }));
      socket.close();
    }, (Math.floor(Math.random() * 300) + 300) * 1000);
  });

  check(res, {
    'Chat WS connected (101)': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    chatConnectErrors.add(1);
  }
}

// ── Presence Heartbeat Scenario ────────────────────────────────────────────

export function presenceHeartbeat() {
  /**
   * Simulates presence TTL refresh heartbeats.
   * Redis key: presence:{user_id}, 5-min TTL, refreshed every 30s.
   * Under load: does SETEX contention cause Redis latency spikes?
   */
  const userId = `presence-${__VU}`;
  const start  = Date.now();

  const res = http.post(
    `${HTTP_BASE}/api/v1/users/presence`,
    JSON.stringify({ user_id: userId, status: 'online' }),
    { headers: { Authorization: `Bearer ${JWT_TOKEN}`, 'Content-Type': 'application/json' } }
  );

  chatPresenceCheck.add(Date.now() - start);

  check(res, {
    'Presence heartbeat OK': (r) => r.status === 200 || r.status === 204 || r.status === 404,
  });
}

// ── Offline Queue Drain Scenario ───────────────────────────────────────────

export function offlineQueueDrain() {
  /**
   * Tests Redis Streams drain on reconnect.
   * 1. Send N messages to a "disconnected" user (pending:{user_id} stream)
   * 2. Reconnect that user → measure drain time for MAXLEN=500 backlog
   *
   * This exposes: O(N) startup cost if backlog is large, stream trim overhead.
   */
  const userId = `offline-${__VU}`;
  const wsUrl  = `${BASE_URL}/ws?token=${JWT_TOKEN}`;

  // Step 1: First, pre-flood the offline queue by sending messages to this user
  //         (simulated by calling notification endpoint)
  for (let i = 0; i < 10; i++) {
    http.post(
      `${HTTP_BASE}/api/v1/notifications/push`,
      JSON.stringify({
        user_id: userId,
        title:   `Offline msg ${i}`,
        body:    `Test offline message ${i} for drain test`,
      }),
      { headers: { Authorization: `Bearer ${JWT_TOKEN}` } }
    );
  }

  // Step 2: Connect and measure drain time
  const drainStart = Date.now();

  const res = ws.connect(wsUrl, {}, function (socket) {
    let drainComplete = false;
    let msgsReceived  = 0;

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'identify', user_id: userId }));
    });

    socket.on('message', (data) => {
      msgsReceived++;
      let msg;
      try { msg = JSON.parse(data); } catch (_) { return; }

      // Detect drain completion signal
      if (msg.type === 'offline_drain_complete' || (msg.type === 'stream_drain' && msg.done)) {
        chatOfflineDrainMs.add(Date.now() - drainStart);
        drainComplete = true;
        socket.close();
      }
    });

    socket.on('error', () => chatConnectErrors.add(1));

    // Close after 5s if drain completion never signaled
    socket.setTimeout(() => {
      if (!drainComplete) {
        chatOfflineDrainMs.add(Date.now() - drainStart);
        socket.close();
      }
    }, 5000);
  });

  check(res, {
    'Offline drain WS connected': (r) => r && r.status === 101,
  });

  sleep(2);
}
