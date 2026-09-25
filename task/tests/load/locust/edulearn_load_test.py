"""
EduLearn EdTech Platform — Production Load Test
================================================
Target: 50,000 registered users, ~6,000 concurrent VUs (10-15% peak)
Stack:  Locust 2.x — async HTTP, weighted task sets, staged phases

Usage:
  # Baseline (single user, establish floor latency):
  locust -f edulearn_load_test.py --headless -u 1 -r 1 --run-time 2m \
         --host http://localhost:9000 --csv reports/baseline

  # Ramp phase (step to 6000 VUs over 10 min):
  locust -f edulearn_load_test.py --headless -u 6000 -r 100 --run-time 30m \
         --host http://localhost:9000 --csv reports/ramp

  # Soak phase (hold 6000 VUs for 60 min):
  locust -f edulearn_load_test.py --headless -u 6000 -r 50 --run-time 60m \
         --host http://localhost:9000 --csv reports/soak

  # Spike phase (3x jump: 2000 → 6000 → 18000):
  # Use locust shape class below: SpikeShape

  # Breakpoint (ramp indefinitely until error rate >5%):
  locust -f edulearn_load_test.py --headless -u 20000 -r 200 --run-time 30m \
         --host http://localhost:9000 --csv reports/breakpoint

Environment variables (set before running):
  BASE_URL     = http://localhost:9000
  JWT_TOKEN    = <valid test user JWT>    # pre-seeded staging account
  ADMIN_TOKEN  = <admin JWT>             # for admin endpoints
  TEST_USER_ID = <uuid>                  # matching JWT sub
  TEST_QUIZ_ID = <uuid>                  # seeded quiz
"""

import os
import random
import uuid
import time
import json
from locust import HttpUser, TaskSet, task, between, events, LoadTestShape
from locust.exception import RescheduleTask

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL     = os.getenv("BASE_URL",     "http://localhost:9000")
JWT_TOKEN    = os.getenv("JWT_TOKEN",    "REPLACE_WITH_TEST_JWT")
ADMIN_TOKEN  = os.getenv("ADMIN_TOKEN",  "REPLACE_WITH_ADMIN_JWT")
TEST_USER_ID = os.getenv("TEST_USER_ID", str(uuid.uuid4()))
TEST_QUIZ_ID = os.getenv("TEST_QUIZ_ID", str(uuid.uuid4()))

# Pre-seeded IDs — replace with actual staging data
SEEDED_VIDEO_IDS  = [f"video-{i:04d}" for i in range(1, 201)]   # 200 videos
SEEDED_CHAPTER_IDS = [f"ch-{i:04d}" for i in range(1, 51)]       # 50 chapters
SEEDED_QUIZ_IDS   = [f"quiz-{i:04d}" for i in range(1, 101)]     # 100 quizzes
SEEDED_BOARDS     = ["CBSE", "ICSE", "HBSE", "UP Board"]
SEEDED_SUBJECTS   = ["Physics", "Chemistry", "Mathematics", "Biology", "English"]
SEEDED_CLASSES    = list(range(8, 13))

# Cache-hit RAG queries (repeat these to test Redis cache hit path)
CACHED_RAG_QUERIES = [
    "Explain Newton's second law of motion",
    "What is photosynthesis and how does it work?",
    "Explain the Pythagorean theorem",
    "What are the laws of thermodynamics?",
    "Describe mitosis vs meiosis",
]

# Cache-miss RAG queries (unique per call — tests cold path)
def unique_rag_query() -> str:
    uid = uuid.uuid4().hex[:8]
    templates = [
        f"Explain topic {uid} in detail with examples",
        f"What is the significance of {uid} in chemistry?",
        f"Derive the formula for {uid} step by step",
    ]
    return random.choice(templates)


def auth_headers(token: str = JWT_TOKEN) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Task Sets ─────────────────────────────────────────────────────────────────

class ContentBrowseTaskSet(TaskSet):
    """40% of traffic — video browse + progress writes."""

    @task(3)
    def list_content(self):
        board    = random.choice(SEEDED_BOARDS)
        class_n  = random.choice(SEEDED_CLASSES)
        subject  = random.choice(SEEDED_SUBJECTS)
        with self.client.get(
            f"/api/v1/content?board={board}&class_num={class_n}&subject={subject}&limit=20",
            headers=auth_headers(),
            name="/content?board&class&subject",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Unexpected {resp.status_code}")

    @task(2)
    def get_video_detail(self):
        vid = random.choice(SEEDED_VIDEO_IDS)
        with self.client.get(
            f"/api/v1/content/videos/{vid}",
            headers=auth_headers(),
            name="/content/videos/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Unexpected {resp.status_code}")

    @task(4)
    def update_video_progress(self):
        """PUT video progress — high frequency write, hits analytics + Redis."""
        vid      = random.choice(SEEDED_VIDEO_IDS)
        progress = random.randint(10, 95)
        with self.client.put(
            f"/api/v1/content/videos/{vid}/progress",
            json={
                "user_id":           TEST_USER_ID,
                "progress_percent":  progress,
                "time_watched_secs": progress * 18,
                "completed":         progress >= 90,
            },
            headers=auth_headers(),
            name="/content/videos/:id/progress",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201, 202, 404):
                resp.failure(f"Video progress write failed: {resp.status_code}")

    @task(1)
    def get_chapter_notes(self):
        ch = random.choice(SEEDED_CHAPTER_IDS)
        with self.client.get(
            f"/api/v1/content/chapters/{ch}/notes",
            headers=auth_headers(),
            name="/content/chapters/:id/notes",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Unexpected {resp.status_code}")

    @task(1)
    def knowledge_hub(self):
        with self.client.get(
            "/api/v1/content/hub-summary",
            headers=auth_headers(),
            name="/content/hub-summary",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Unexpected {resp.status_code}")


class QuizTaskSet(TaskSet):
    """20% of traffic — start → answer (Redis-first) → state save → batch-submit."""

    def on_start(self):
        self.attempt_id   = None
        self.quiz_id      = random.choice(SEEDED_QUIZ_IDS)
        self.questions    = []
        self.answers      = {}
        self.start_quiz()

    def start_quiz(self):
        with self.client.post(
            "/api/v1/quizzes/attempts/start",
            json={"quiz_id": self.quiz_id, "user_id": TEST_USER_ID},
            headers=auth_headers(),
            name="/quizzes/attempts/start",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201):
                data = resp.json()
                self.attempt_id = data.get("attempt_id") or data.get("id")
                self.questions  = data.get("questions", [])
                if not self.questions:
                    # Fallback: generate dummy question IDs
                    self.questions = [{"id": str(uuid.uuid4()), "options": ["A","B","C","D"]} for _ in range(10)]
            elif resp.status_code == 404:
                resp.success()
                raise RescheduleTask
            else:
                resp.failure(f"Quiz start failed: {resp.status_code}")
                raise RescheduleTask

    @task(5)
    def answer_question(self):
        if not self.attempt_id or not self.questions:
            return
        q = random.choice(self.questions)
        qid = q.get("id", str(uuid.uuid4()))
        ans = random.choice(["A", "B", "C", "D"])
        self.answers[qid] = ans

        with self.client.post(
            f"/api/v1/quizzes/attempts/answer",
            json={"attempt_id": self.attempt_id, "question_id": qid, "answer": ans},
            headers=auth_headers(),
            name="/quizzes/attempts/answer",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201, 202):
                if resp.status_code == 404:
                    resp.success()
                else:
                    resp.failure(f"Answer failed: {resp.status_code}")

    @task(2)
    def save_state(self):
        """Periodic state checkpoint — tests quiz:attempt:state:{user}:{attempt} Redis key."""
        if not self.attempt_id:
            return
        with self.client.put(
            f"/api/v1/quizzes/attempts/{self.attempt_id}/state",
            json={"answers": self.answers, "time_remaining": random.randint(60, 600)},
            headers=auth_headers(),
            name="/quizzes/attempts/:id/state",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201, 204, 404):
                resp.failure(f"State save failed: {resp.status_code}")

    @task(1)
    def batch_submit(self):
        """Batch submit — tests quiz batch path + ZINCRBY leaderboard hot key."""
        if not self.attempt_id or not self.answers:
            return
        answers_list = [
            {"question_id": qid, "answer": ans}
            for qid, ans in list(self.answers.items())[:10]
        ]
        with self.client.post(
            "/api/v1/quizzes/attempts/batch-submit",
            json={"attempt_id": self.attempt_id, "answers": answers_list},
            headers=auth_headers(),
            name="/quizzes/attempts/batch-submit",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201, 202, 404):
                resp.failure(f"Batch submit failed: {resp.status_code}")
            else:
                # Reset for next quiz cycle
                self.attempt_id = None
                self.answers    = {}
                self.quiz_id    = random.choice(SEEDED_QUIZ_IDS)
                time.sleep(random.uniform(1, 3))
                self.start_quiz()


class AIRagTaskSet(TaskSet):
    """
    15% of traffic — RAG AI queries.
    Deliberately mixes:
      - 60% repeated cache-hit queries (same query → Redis cache hit after first)
      - 40% unique cache-miss queries (cold RAG path through embedding + Qdrant + LLM)
    This ratio tests both Redis hit performance and cold RAG pipeline throughput.
    """

    @task(6)
    def rag_cache_hit(self):
        """Repeat a small set of queries — should hit Redis after first call."""
        query   = random.choice(CACHED_RAG_QUERIES)
        board   = random.choice(SEEDED_BOARDS)
        class_n = random.choice(SEEDED_CLASSES)
        subject = random.choice(SEEDED_SUBJECTS)

        with self.client.post(
            "/api/v1/ai/study",
            json={
                "query":     query,
                "board":     board,
                "class_num": class_n,
                "subject":   subject,
            },
            headers=auth_headers(),
            name="/ai/study [cache-hit]",
            catch_response=True,
            timeout=10,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if data.get("from_cache"):
                    resp.success()
                # Cache miss on first call is fine; log it differently
            elif resp.status_code == 403:
                resp.failure("Subscription gate blocking test user — check JWT plan claim")
            elif resp.status_code not in (200, 202):
                resp.failure(f"RAG failed: {resp.status_code} — {resp.text[:200]}")

    @task(4)
    def rag_cache_miss(self):
        """Unique queries — forces cold RAG path (embed + Qdrant + LLM). SLO: <5s."""
        query = unique_rag_query()
        with self.client.post(
            "/api/v1/ai/study",
            json={
                "query":     query,
                "board":     "CBSE",
                "class_num": random.choice(SEEDED_CLASSES),
                "subject":   random.choice(SEEDED_SUBJECTS),
            },
            headers=auth_headers(),
            name="/ai/study [cache-miss]",
            catch_response=True,
            timeout=15,
        ) as resp:
            if resp.status_code == 200:
                elapsed = resp.elapsed.total_seconds()
                if elapsed > 5.0:
                    resp.failure(f"RAG cold path exceeded 5s SLO: {elapsed:.2f}s")
            elif resp.status_code == 403:
                resp.failure("Subscription gate — test JWT needs basic/premium plan")
            else:
                resp.failure(f"RAG cache-miss failed: {resp.status_code}")

    @task(1)
    def rag_thundering_herd(self):
        """
        Thundering-herd test: same exact cold query fired concurrently.
        With no single-flight lock, ALL concurrent callers will hit embedding+Qdrant+LLM
        simultaneously, then all write to the same Redis key.
        Look for: multiple concurrent 5s+ calls for the SAME query.
        """
        # Same fixed query every time — tests thundering herd on first cold hit
        query = "Explain the complete derivation of the Schrodinger wave equation for hydrogen atom"
        with self.client.post(
            "/api/v1/ai/study",
            json={"query": query, "board": "CBSE", "class_num": 12, "subject": "Physics"},
            headers=auth_headers(),
            name="/ai/study [thundering-herd]",
            catch_response=True,
            timeout=20,
        ) as resp:
            if resp.status_code not in (200, 202):
                resp.failure(f"Thundering herd query failed: {resp.status_code}")


class GamificationTaskSet(TaskSet):
    """5% of traffic — leaderboard reads + analytics dashboard."""

    @task(3)
    def leaderboard(self):
        class_n = random.choice(SEEDED_CLASSES)
        with self.client.get(
            f"/api/v1/gamification/leaderboard?class_num={class_n}&top=50",
            headers=auth_headers(),
            name="/gamification/leaderboard",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Leaderboard failed: {resp.status_code}")

    @task(2)
    def student_dashboard(self):
        with self.client.get(
            f"/api/v1/analytics/student/{TEST_USER_ID}/dashboard",
            headers=auth_headers(),
            name="/analytics/student/:id/dashboard",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Dashboard failed: {resp.status_code}")

    @task(2)
    def gamification_profile(self):
        with self.client.get(
            f"/api/v1/gamification/profile/{TEST_USER_ID}",
            headers=auth_headers(),
            name="/gamification/profile/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Gamification profile failed: {resp.status_code}")

    @task(1)
    def xp_award_internal(self):
        """Test internal XP award endpoint — should be unprotected (internal only)."""
        with self.client.post(
            "/api/v1/gamification/xp/award",
            json={"user_id": TEST_USER_ID, "xp": 10, "event": "quiz_complete", "source": "test"},
            name="/gamification/xp/award [internal]",
            catch_response=True,
        ) as resp:
            # This endpoint SHOULD be accessible without auth (internal Docker network)
            # If it returns 401, it means it's properly blocked at gateway — document either way
            if resp.status_code == 401:
                resp.success()  # Expected if gateway blocks it
            elif resp.status_code in (200, 201, 202):
                resp.failure("SECURITY: /xp/award accessible from public gateway without auth — IDOR risk")
            elif resp.status_code == 404:
                resp.success()


class AdminTaskSet(TaskSet):
    """Admin endpoints — should require admin JWT, test RBAC enforcement."""

    @task(1)
    def admin_overview(self):
        with self.client.get(
            "/api/v1/analytics/admin/overview",
            headers=auth_headers(ADMIN_TOKEN),
            name="/analytics/admin/overview [admin]",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Admin overview: {resp.status_code}")

    @task(1)
    def admin_user_jwt_bypass(self):
        """SECURITY: try to hit admin endpoint with regular user JWT — must return 403."""
        with self.client.get(
            "/api/v1/analytics/admin/overview",
            headers=auth_headers(JWT_TOKEN),
            name="/analytics/admin/overview [non-admin-403-expected]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.failure("SECURITY DEFECT: admin endpoint returned 200 for non-admin JWT")
            elif resp.status_code == 403:
                resp.success()
            elif resp.status_code == 404:
                resp.success()
            else:
                resp.success()  # 401 also acceptable

    @task(1)
    def admin_subscriptions(self):
        with self.client.get(
            "/api/v1/payments/admin/subscriptions",
            headers=auth_headers(ADMIN_TOKEN),
            name="/payments/admin/subscriptions [admin]",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 404):
                resp.failure(f"Admin subs: {resp.status_code}")


# ── Main User Classes (weighted) ─────────────────────────────────────────────

class ContentUser(HttpUser):
    """40% weight — content browse + video progress."""
    tasks    = [ContentBrowseTaskSet]
    weight   = 40
    wait_time = between(1, 4)

    def on_start(self):
        self.client.headers.update(auth_headers())


class QuizUser(HttpUser):
    """20% weight — full quiz journey."""
    tasks    = [QuizTaskSet]
    weight   = 20
    wait_time = between(2, 8)

    def on_start(self):
        self.client.headers.update(auth_headers())


class AIUser(HttpUser):
    """15% weight — RAG AI queries (cache-hit + cache-miss mix)."""
    tasks    = [AIRagTaskSet]
    weight   = 15
    wait_time = between(5, 20)  # AI users think longer between queries

    def on_start(self):
        self.client.headers.update(auth_headers())


class GamificationUser(HttpUser):
    """5% weight — leaderboard + analytics reads."""
    tasks    = [GamificationTaskSet]
    weight   = 5
    wait_time = between(3, 10)

    def on_start(self):
        self.client.headers.update(auth_headers())


# Note: Battle (10%) and Chat (10%) WebSocket users are in the k6 WS test suite.
# Locust's WS support is limited; k6 handles those scenarios better.


# ── Load Shape: Spike ─────────────────────────────────────────────────────────

class SpikeShape(LoadTestShape):
    """
    Simulates a spike: steady load → sudden 3x spike → back to steady.
    Represents a notification blast or class starting simultaneously.

    Timeline:
      0–5min:  2,000 VUs (pre-spike baseline)
      5–6min:  ramp to 6,000 VUs
      6–12min: hold 6,000 VUs
      12–13min: SPIKE to 18,000 VUs
      13–18min: hold 18,000 VUs (observe SLO degradation)
      18–20min: ramp back down to 2,000 VUs
    """
    stages = [
        {"duration": 300,  "users": 2000,  "spawn_rate": 100},
        {"duration": 360,  "users": 6000,  "spawn_rate": 200},
        {"duration": 720,  "users": 6000,  "spawn_rate": 100},
        {"duration": 780,  "users": 18000, "spawn_rate": 2000},
        {"duration": 1080, "users": 18000, "spawn_rate": 100},
        {"duration": 1200, "users": 2000,  "spawn_rate": 500},
    ]

    def tick(self):
        run_time = self.get_run_time()
        for stage in self.stages:
            if run_time < stage["duration"]:
                tick_data = (stage["users"], stage["spawn_rate"])
                return tick_data
        return None


# ── Custom Metrics ────────────────────────────────────────────────────────────

@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    """Flag SLO violations in real-time output."""
    slo_ms = {
        "/ai/study [cache-hit]":   200,
        "/ai/study [cache-miss]":  5000,
        "/quizzes/attempts/batch-submit": 500,
        "/gamification/leaderboard": 200,
        "/analytics/student/:id/dashboard": 200,
    }
    for pattern, limit in slo_ms.items():
        if pattern in name and response_time > limit and not exception:
            print(f"⚠ SLO BREACH: {name} took {response_time:.0f}ms > {limit}ms SLO")
            break
