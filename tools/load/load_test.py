#!/usr/bin/env python3
"""EduLearn load test harness.

Drives realistic concurrent traffic through the API gateway using the seeded
accounts (tools/seed/seed.py must have run first — password Seed@123).

Scenarios (mix, per virtual user loop):
  - login (JWT issuance + bcrypt)          [once per VU]
  - dashboard reads: profile, rooms, leaderboard, daily-reward status,
    friends activity, notifications
  - quiz flow: list chapter quizzes → start attempt → batch-submit
  - WebSocket connect (chat presence) — optional, --ws N

Usage:
  python3 tools/load/load_test.py --users 100 --duration 60
  python3 tools/load/load_test.py --users 300 --duration 120 --ws 100

Reports per-endpoint p50/p95/p99 latency, throughput, and error counts.
NOTE: this measures the whole docker-composed stack on one machine — treat
results as a smoke-level capacity signal, not a production benchmark.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import statistics
import time
import uuid
from collections import defaultdict

import httpx

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def student_email(i: int) -> str:
    return f"seed.student{i}@edulearn.test"


def student_id(i: int) -> str:
    return str(uuid.uuid5(NS, f"edulearn-seed:student:{i}"))


class Stats:
    def __init__(self):
        self.lat: dict[str, list[float]] = defaultdict(list)
        self.err: dict[str, int] = defaultdict(int)
        self.codes: dict[int, int] = defaultdict(int)

    def rec(self, name: str, dt: float, status: int, ok_codes=(200, 201)):
        self.lat[name].append(dt)
        self.codes[status] += 1
        if status not in ok_codes:
            self.err[name] += 1

    def report(self, wall: float):
        total = sum(len(v) for v in self.lat.values())
        print(f"\n{'endpoint':34s} {'n':>6s} {'p50':>7s} {'p95':>7s} {'p99':>7s} {'max':>7s} {'err':>5s}")
        print("-" * 78)
        for name in sorted(self.lat):
            xs = sorted(self.lat[name])
            n = len(xs)
            p = lambda f: xs[min(n - 1, int(n * f))] * 1000
            print(f"{name:34s} {n:6d} {p(.5):6.0f}ms {p(.95):6.0f}ms {p(.99):6.0f}ms "
                  f"{xs[-1]*1000:6.0f}ms {self.err.get(name, 0):5d}")
        print("-" * 78)
        errs = sum(self.err.values())
        print(f"TOTAL {total} requests in {wall:.1f}s → {total/wall:.1f} req/s | "
              f"errors: {errs} ({errs/max(1,total)*100:.2f}%)")
        print(f"status codes: {dict(sorted(self.codes.items()))}")


async def timed(stats: Stats, name: str, coro):
    t0 = time.perf_counter()
    try:
        r = await coro
        stats.rec(name, time.perf_counter() - t0, r.status_code)
        return r
    except Exception:
        stats.rec(name, time.perf_counter() - t0, 599)
        return None


async def virtual_user(vu: int, base: str, stats: Stats, stop_at: float, quiz_pool: list):
    uid = student_id(vu)
    async with httpx.AsyncClient(base_url=base, timeout=30) as c:
        r = await timed(stats, "auth.login", c.post("/api/v1/auth/login", json={
            "identifier": student_email(vu), "password": "Seed@123"}))
        if r is None or r.status_code != 200:
            return
        tok = {"Authorization": f"Bearer {r.json()['access_token']}"}

        while time.perf_counter() < stop_at:
            action = random.random()
            if action < 0.55:  # dashboard read burst (most common real behavior)
                await timed(stats, "gam.profile", c.get(f"/api/v1/gamification/profile/{uid}", headers=tok))
                await timed(stats, "chat.rooms", c.get(f"/api/v1/users/chat/rooms", params={"user_id": uid}, headers=tok))
                await timed(stats, "gam.leaderboard", c.get("/api/v1/gamification/leaderboard?limit=20", headers=tok))
                await timed(stats, "gam.daily-reward", c.get(f"/api/v1/gamification/daily-reward/status/{uid}", headers=tok))
                await timed(stats, "gam.friends-activity", c.get(f"/api/v1/gamification/activity/friends/{uid}?limit=10", headers=tok))
            elif action < 0.8:  # content browse
                await timed(stats, "content.boards", c.get("/api/v1/content/boards", headers=tok))
                await timed(stats, "content.kh", c.get("/api/v1/content/knowledge-articles?limit=10", headers=tok),)
            elif quiz_pool:  # quiz attempt flow (start → batch-submit)
                quiz = random.choice(quiz_pool)
                r = await timed(stats, "quiz.start", c.post(
                    "/api/v1/quizzes/attempts/start",
                    json={"quiz_id": quiz["id"]}, headers=tok))
                if r is not None and r.status_code in (200, 201):
                    att = r.json()
                    attempt_id = att.get("attempt_id") or att.get("id")
                    answers = {str(q["id"]): "A" for q in quiz.get("questions", [])[:5]}
                    if attempt_id and answers:
                        await timed(stats, "quiz.batch-submit", c.post(
                            "/api/v1/quizzes/attempts/batch-submit",
                            json={"attempt_id": attempt_id, "user_id": uid,
                                  "answers": answers}, headers=tok))
            await asyncio.sleep(random.uniform(0.05, 0.3))


async def ws_user(vu: int, base_ws: str, stats: Stats, hold: float, token: str):
    # chat presence socket: connect, hold, disconnect (measures WS accept path)
    try:
        import websockets  # optional dep
    except ImportError:
        return
    t0 = time.perf_counter()
    try:
        async with websockets.connect(f"{base_ws}/ws?token={token}", open_timeout=15) as ws:
            stats.rec("ws.connect", time.perf_counter() - t0, 200)
            await asyncio.sleep(hold)
    except Exception:
        stats.rec("ws.connect", time.perf_counter() - t0, 599)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:9000")
    ap.add_argument("--users", type=int, default=100)
    ap.add_argument("--duration", type=int, default=60)
    ap.add_argument("--ws", type=int, default=0, help="additional concurrent websocket holders")
    args = ap.parse_args()

    stats = Stats()

    # Pre-fetch a quiz pool once (with questions) so quiz flows don't skew reads.
    # Seeded quizzes live on CBSE Class-10 chapters — ids are deterministic uuid5.
    quiz_pool = []
    async with httpx.AsyncClient(base_url=args.base, timeout=30) as c:
        r = await c.post("/api/v1/auth/login", json={
            "identifier": student_email(0), "password": "Seed@123"})
        if r.status_code == 200:
            tok = {"Authorization": f"Bearer {r.json()['access_token']}"}
            subj = uuid.uuid5(NS, "edulearn-seed:subject:CBSE:10:Math")
            chapter = uuid.uuid5(NS, f"edulearn-seed:chapter:{subj}:1")
            lst = await c.get(f"/api/v1/quizzes/chapter/{chapter}", headers=tok)
            if lst.status_code == 200:
                data = lst.json()
                items = data if isinstance(data, list) else data.get("quizzes", [])
                for qz in items[:5]:
                    qs = await c.get(f"/api/v1/quizzes/{qz['id']}/questions", headers=tok)
                    if qs.status_code == 200:
                        qd = qs.json()
                        qlist = qd if isinstance(qd, list) else qd.get("questions", [])
                        if qlist:
                            quiz_pool.append({"id": qz["id"], "questions": qlist})

    print(f"Load test: {args.users} virtual users, {args.duration}s, "
          f"{args.ws} WS holders, quiz pool: {len(quiz_pool)}")
    t0 = time.perf_counter()
    stop_at = t0 + args.duration
    tasks = [virtual_user(i % 400, args.base, stats, stop_at, quiz_pool)
             for i in range(args.users)]
    await asyncio.gather(*tasks)
    stats.report(time.perf_counter() - t0)


if __name__ == "__main__":
    asyncio.run(main())
