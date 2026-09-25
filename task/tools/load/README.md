# Load Test Harness

Drives realistic concurrent traffic through the API gateway using accounts
created by `tools/seed/seed.py` (run the seeder first).

```bash
python3 tools/load/load_test.py --users 200 --duration 90
```

Each virtual user logs in once, then loops a weighted scenario mix:
dashboard reads (profile, chat rooms, leaderboard, daily-reward status,
friends activity) 55%, content browsing 25%, quiz attempt flow
(start → batch-submit) 20%.

## Interpreting results / known interactions

- **Gateway rate limit**: `api_gateway/.env` `RATE_LIMIT_PER_MINUTE=120` is
  per-IP. A load test from one machine IS one IP — raise it temporarily for
  capacity runs and restore afterwards, or you are testing the limiter, not
  the backend.
- **auth.login is bcrypt-bound**: expect ~15–20 logins/sec on a 4-worker
  auth_service; concurrent login storms queue into multi-second latencies and
  additionally trip auth_service's own per-IP limiter (60 req/min). This is a
  genuine capacity characteristic, not harness noise.
- **quiz.batch-submit 429s are business quotas**: seeded students are
  free-tier; the free-tier daily quiz cap correctly rejects excess submits.
- WebSocket scenario (`--ws N`) requires `pip install websockets`; skipped
  silently when absent.

## Baseline (this dev sandbox, single machine, all 12 services + gateway)

200 virtual users, 90s, rate limit lifted → **~283 req/s aggregate, 0 5xx**:

| endpoint | p50 | p95 | p99 |
|---|---|---|---|
| chat.rooms | 74ms | 127ms | 178ms |
| gam.profile | 63ms | 137ms | 251ms |
| gam.leaderboard | 52ms | 107ms | 164ms |
| gam.daily-reward | 59ms | 125ms | 195ms |
| gam.friends-activity | 137ms | 243ms | 339ms |
| content.boards / knowledge | 34–42ms | 66–70ms | 93–96ms |
| quiz.start | 49ms | 94ms | 126ms |
| quiz.batch-submit | 28ms | 263ms | 378ms |
| auth.login | 2.6s | 8.8s | 9.5s |

Errors: 4.7%, all 429 (auth limiter + free-tier quota) — zero 5xx.
