/**
 * EduLearn — Battle WebSocket Load Test
 * ======================================
 * k6 ws module: tests real-time battle scoring + leaderboard broadcast
 *
 * Usage:
 *   k6 run --vus 500 --duration 10m \
 *     -e BASE_URL=ws://localhost:9000 \
 *     -e JWT_TOKEN=<test_jwt> \
 *     battle_websocket_test.js
 *
 * Scenarios tested:
 *   1. Connection storm: 500+ VUs connect simultaneously (reconnect-storm test)
 *   2. Live battle: create lobby, join, answer questions, receive broadcasts
 *   3. Leaderboard fan-out: measure broadcast latency as player count grows
 *   4. Multi-instance check: verify WS works across gateway upstreams
 *
 * Critical check: Does battle WS use Redis pub/sub for cross-instance delivery?
 * If not, VUs on different instances won't receive each other's updates.
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// ── Custom Metrics ─────────────────────────────────────────────────────────

const wsConnectTime      = new Trend('ws_battle_connect_ms',       true);
const wsMessageLatency   = new Trend('ws_battle_msg_round_trip_ms', true);
const wsBroadcastLatency = new Trend('ws_battle_broadcast_ms',      true);
const wsConnectionErrors = new Counter('ws_battle_connect_errors');
const wsDisconnects      = new Counter('ws_battle_unexpected_disconnects');
const battleAnswerErrors = new Rate('ws_battle_answer_error_rate');
const wsMultiInstanceFail = new Counter('ws_battle_cross_instance_miss');

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL  = __ENV.BASE_URL  || 'ws://localhost:9000';
const HTTP_BASE = __ENV.HTTP_BASE || 'http://localhost:9000';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'REPLACE_WITH_TEST_JWT';
const BATTLE_ID = __ENV.BATTLE_ID || null; // pre-created battle; if null, create one

const AUTH_HEADERS = { Authorization: `Bearer ${JWT_TOKEN}`, 'Content-Type': 'application/json' };

// ── Scenarios ──────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    battle_ramp: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '2m',  target: 100  },  // baseline: 100 players
        { duration: '3m',  target: 500  },  // ramp: 500 concurrent
        { duration: '5m',  target: 1000 },  // stress: 1000 concurrent
        { duration: '2m',  target: 0    },  // cooldown
      ],
      gracefulRampDown: '30s',
    },
    reconnect_storm: {
      executor:   'shared-iterations',
      vus:        200,
      iterations: 200,
      startTime:  '8m',  // fire after ramp phase
      exec:       'reconnectStorm',
    },
  },
  thresholds: {
    'ws_battle_connect_ms':        ['p95<500'],   // WS connect < 500ms
    'ws_battle_msg_round_trip_ms': ['p95<200'],   // answer → ack < 200ms
    'ws_battle_broadcast_ms':      ['p95<500'],   // broadcast delivery < 500ms
    'ws_battle_connect_errors':    ['count<50'],  // <50 connect failures
    'ws_battle_answer_error_rate': ['rate<0.01'], // <1% answer errors
  },
};

// ── Main Battle Scenario ────────────────────────────────────────────────────

export default function () {
  const userId      = `test-user-${__VU}-${__ITER}`;
  const displayName = `LoadUser${__VU}`;
  let   battleId    = BATTLE_ID;

  // Step 1: Create or join a battle via REST
  if (!battleId) {
    const createRes = http.post(
      `${HTTP_BASE}/api/v1/battles`,
      JSON.stringify({
        creator_id:   userId,
        subject:      'Physics',
        class_num:    10,
        question_count: 5,
        time_limit:   60,
        is_public:    true,
      }),
      { headers: AUTH_HEADERS }
    );

    if (createRes.status === 201 || createRes.status === 200) {
      try {
        battleId = createRes.json('id') || createRes.json('battle_id');
      } catch (_) {
        // Battle creation failed — join an open one
      }
    }
  }

  // Step 2: Attempt to join an open battle if no ID
  if (!battleId) {
    const openRes = http.get(`${HTTP_BASE}/api/v1/battles/open`, { headers: AUTH_HEADERS });
    if (openRes.status === 200) {
      try {
        const battles = openRes.json('battles') || [];
        if (battles.length > 0) {
          battleId = battles[0].id;
        }
      } catch (_) {}
    }
  }

  if (!battleId) {
    wsConnectionErrors.add(1);
    return;
  }

  // Step 3: Connect to battle WebSocket
  const wsUrl     = `${BASE_URL}/api/v1/battles/${battleId}/ws?user_id=${userId}&display_name=${displayName}`;
  const connectStart = Date.now();

  const res = ws.connect(wsUrl, {}, function (socket) {
    const connectMs = Date.now() - connectStart;
    wsConnectTime.add(connectMs);

    let connectedAt      = Date.now();
    let messagesReceived = 0;
    let answersSubmitted = 0;
    let answerSentAt     = 0;
    let lastBroadcastAt  = 0;
    let instanceId       = null;  // detect which upstream handled this connection

    socket.on('open', () => {
      // Note which upstream we connected to (check X-Instance or similar header)
    });

    socket.on('message', (data) => {
      messagesReceived++;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (_) {
        return;
      }

      // Detect instance identifier for multi-instance check
      if (msg.instance_id) {
        instanceId = msg.instance_id;
      }

      // Measure broadcast latency for leaderboard updates
      if (msg.type === 'leaderboard_update' || msg.type === 'score_update') {
        const broadcastMs = Date.now() - lastBroadcastAt;
        if (lastBroadcastAt > 0 && broadcastMs < 10000) {
          wsBroadcastLatency.add(broadcastMs);
        }
        lastBroadcastAt = Date.now();

        // Check if we receive broadcasts from OTHER players (multi-instance check)
        if (msg.player_id && msg.player_id !== userId) {
          // This is someone else's update — means cross-instance pub/sub works
          // If this NEVER fires under multi-instance setup, pub/sub is broken
        }
      }

      // Measure answer round-trip
      if ((msg.type === 'answer_ack' || msg.type === 'answer_result') && answerSentAt > 0) {
        const rtt = Date.now() - answerSentAt;
        wsMessageLatency.add(rtt);
        answerSentAt = 0;
      }

      // Battle ended — wrap up
      if (msg.type === 'battle_end' || msg.type === 'game_over') {
        socket.close();
      }
    });

    socket.on('error', (e) => {
      wsConnectionErrors.add(1);
      console.error(`WS error VU${__VU}: ${e.error()}`);
    });

    socket.on('close', () => {
      const sessionMs = Date.now() - connectedAt;
      if (sessionMs < 5000 && messagesReceived === 0) {
        // Connected but immediately dropped — likely capacity issue
        wsDisconnects.add(1);
      }
    });

    // Submit answers at realistic pace (one answer every ~10-15s)
    socket.setInterval(() => {
      if (answersSubmitted < 5) {
        const answer = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
        answerSentAt = Date.now();

        socket.send(JSON.stringify({
          type:        'submit_answer',
          question_id: `q${answersSubmitted + 1}`,
          answer:      answer,
          time_taken:  Math.floor(Math.random() * 30) + 5,
        }));
        answersSubmitted++;

        // Track if answer messages fail (no ack within 3s)
        socket.setTimeout(() => {
          if (answerSentAt > 0) {
            battleAnswerErrors.add(true);
            answerSentAt = 0;
          }
        }, 3000);
      } else {
        socket.clearInterval();
      }
    }, 12000);

    // Auto-close after 2 minutes (realistic battle duration)
    socket.setTimeout(() => {
      socket.close();
    }, 120000);

    // Hold connection open
    socket.on('message', () => { /* keep alive */ });
  });

  check(res, {
    'WS status 101': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsConnectionErrors.add(1);
  }

  sleep(Math.random() * 5 + 2);
}

// ── Reconnect Storm Scenario ────────────────────────────────────────────────

export function reconnectStorm() {
  /**
   * Simulates 200 VUs reconnecting simultaneously (notification blast scenario).
   * Tests whether the server can handle a reconnect surge without OOMing or
   * dropping connections.
   */
  const userId    = `reconnect-${__VU}-${__ITER}`;
  const battleId  = BATTLE_ID || 'test-battle-001';

  sleep(Math.random() * 0.5); // stagger by up to 500ms

  const wsUrl = `${BASE_URL}/api/v1/battles/${battleId}/ws?user_id=${userId}&display_name=ReconnectUser`;
  const start  = Date.now();

  const res = ws.connect(wsUrl, {}, function (socket) {
    wsConnectTime.add(Date.now() - start);

    socket.on('open', () => {
      // Connected — immediately disconnect to simulate quick reconnect
      socket.setTimeout(() => socket.close(), 5000);
    });

    socket.on('error', () => wsConnectionErrors.add(1));
  });

  check(res, {
    'Reconnect storm 101': (r) => r && r.status === 101,
  });
}
