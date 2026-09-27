"""
EduLearn — Data Seeder for Load Tests
=======================================
Seeds realistic data volumes before running load tests:
  - Users (default 10,000)
  - Content hierarchy (boards → classes → subjects → chapters → topics → videos)
  - Quizzes + Questions (default 500 quizzes, 15 questions each)
  - Qdrant vectors (random 768-dim vectors for content chunks)
  - Pre-created battle rooms
  - Subscription records (70% free, 20% basic, 10% premium)

Usage:
    # Full seed (all entities)
    python seed_data.py full --users 10000 --base-url http://localhost:9000

    # Quick seed for quick tests
    python seed_data.py quick --users 1000 --base-url http://localhost:9000

    # Seed only Qdrant vectors (for RAG tests)
    python seed_data.py qdrant --vectors 50000

    # Print token for seeded test user
    python seed_data.py token --email loadtest@edulearn.test

Requirements:
    pip install httpx asyncio faker
    Optional: pip install qdrant-client (for direct Qdrant seeding)
"""

import argparse
import asyncio
import json
import math
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

try:
    from faker import Faker
    fake = Faker("en_IN")
    HAVE_FAKER = True
except ImportError:
    HAVE_FAKER = False
    class _FakeFaker:
        def name(self): return f"Student {random.randint(1000, 9999)}"
        def email(self): return f"user{random.randint(1,999999)}@test.com"
        def phone_number(self): return f"+91{random.randint(7000000000, 9999999999)}"
    fake = _FakeFaker()

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, PointStruct, VectorParams
    HAVE_QDRANT = True
except ImportError:
    HAVE_QDRANT = False

# ── Config ───────────────────────────────────────────────────────────────────

BASE_URL     = "http://localhost:9000"
ADMIN_EMAIL  = "admin@edulearn.test"
ADMIN_PASS   = "Admin@12345"
QDRANT_URL   = "http://localhost:6334"
QDRANT_KEY   = ""  # from .env QDRANT_API_KEY
COLLECTION   = "content_chunks"
VECTOR_DIM   = 768  # matches ai_service embedding model

BOARDS   = ["CBSE", "ICSE", "Maharashtra State Board"]
SUBJECTS = {
    9:  ["Mathematics", "Science", "English", "Social Science", "Hindi"],
    10: ["Mathematics", "Science", "English", "Social Science", "Hindi"],
    11: ["Physics", "Chemistry", "Mathematics", "Biology", "English"],
    12: ["Physics", "Chemistry", "Mathematics", "Biology", "English"],
}
CHAPTER_TEMPLATES = {
    "Physics":      ["Motion", "Force and Laws", "Gravitation", "Work and Energy", "Sound", "Light", "Electricity", "Magnetism"],
    "Chemistry":    ["Matter", "Atoms and Molecules", "Chemical Reactions", "Acids and Bases", "Metals", "Carbon Compounds"],
    "Mathematics":  ["Real Numbers", "Polynomials", "Linear Equations", "Triangles", "Coordinate Geometry", "Trigonometry", "Statistics"],
    "Biology":      ["Cell", "Tissues", "Life Processes", "Reproduction", "Heredity", "Our Environment"],
    "Science":      ["Matter", "Atoms", "Motion", "Force", "Tissues", "Natural Resources"],
    "English":      ["Literature 1", "Literature 2", "Grammar", "Writing Skills"],
    "Social Science": ["History 1", "History 2", "Geography", "Civics", "Economics"],
    "Hindi":        ["Gadya", "Padya", "Vyakaran", "Lekhan"],
}

# ── Result Tracker ───────────────────────────────────────────────────────────

@dataclass
class SeedStats:
    entity:    str
    total:     int = 0
    success:   int = 0
    failed:    int = 0
    start:     float = field(default_factory=time.monotonic)
    errors:    list  = field(default_factory=list)

    def ok(self): self.total += 1; self.success += 1
    def fail(self, e: str):
        self.total += 1
        self.failed += 1
        if len(self.errors) < 20:
            self.errors.append(e[:100])

    def summary(self) -> str:
        elapsed = time.monotonic() - self.start
        return (
            f"  [{self.entity}] {self.success}/{self.total} seeded "
            f"in {elapsed:.1f}s ({self.total/max(elapsed,1):.1f}/s) "
            f"failed={self.failed}"
        )


# ── Auth Helper ──────────────────────────────────────────────────────────────

async def get_admin_token(client: httpx.AsyncClient) -> str:
    resp = await client.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
    )
    if resp.status_code == 200:
        return resp.json().get("access_token", "")
    raise RuntimeError(f"Admin login failed: {resp.status_code} {resp.text[:200]}")


# ── User Seeder ──────────────────────────────────────────────────────────────

async def seed_users(client: httpx.AsyncClient, count: int, concurrency: int = 30) -> list[dict]:
    """Register `count` student users. Returns list of {id, email, password}."""
    stats     = SeedStats("users")
    semaphore = asyncio.Semaphore(concurrency)
    results   = []

    async def register_one(i: int):
        async with semaphore:
            email    = f"loadtest.user.{i:06d}@edulearn.test"
            password = "LoadTest@123"
            payload  = {
                "name":     f"Load Test User {i:06d}",
                "email":    email,
                "password": password,
                "role":     "student",
                "class_num": random.choice([9, 10, 11, 12]),
                "board":     random.choice(BOARDS),
            }
            try:
                resp = await client.post(f"{BASE_URL}/api/v1/auth/register", json=payload, timeout=15)
                if resp.status_code in (200, 201):
                    data = resp.json()
                    results.append({
                        "id":       data.get("user_id") or data.get("id"),
                        "email":    email,
                        "password": password,
                        "token":    data.get("access_token", ""),
                    })
                    stats.ok()
                elif resp.status_code == 409:
                    stats.ok()  # already exists — fine
                else:
                    stats.fail(f"HTTP {resp.status_code}")
            except Exception as e:
                stats.fail(str(e))

    await asyncio.gather(*[register_one(i) for i in range(count)])

    print(stats.summary())
    return results


# ── Content Hierarchy Seeder ─────────────────────────────────────────────────

async def seed_content(client: httpx.AsyncClient, token: str) -> dict:
    """
    Create boards → classes → subjects → chapters → topics → videos.
    Returns IDs for later reference.
    Returns: {"chapter_ids": [...], "topic_ids": [...], "video_ids": [...]}
    """
    stats  = SeedStats("content")
    ids    = {"board_ids": [], "class_ids": [], "subject_ids": [],
              "chapter_ids": [], "topic_ids": [], "video_ids": []}
    h      = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Boards
    for board_name in BOARDS:
        try:
            resp = await client.post(
                f"{BASE_URL}/api/v1/content/boards",
                json={"name": board_name, "description": f"{board_name} curriculum"},
                headers=h, timeout=10,
            )
            if resp.status_code in (200, 201):
                ids["board_ids"].append(resp.json().get("id"))
                stats.ok()
            elif resp.status_code == 409:
                # Exists — fetch ID
                stats.ok()
        except Exception as e:
            stats.fail(str(e))

    # Classes (use first board)
    board_id = ids["board_ids"][0] if ids["board_ids"] else None
    for class_num in [9, 10, 11, 12]:
        try:
            resp = await client.post(
                f"{BASE_URL}/api/v1/content/classes",
                json={"board_id": str(board_id), "class_num": class_num,
                      "name": f"Class {class_num}"},
                headers=h, timeout=10,
            )
            if resp.status_code in (200, 201):
                ids["class_ids"].append((class_num, resp.json().get("id")))
                stats.ok()
        except Exception as e:
            stats.fail(str(e))

    # Subjects
    for class_num, class_id in ids["class_ids"]:
        for subj_name in SUBJECTS.get(class_num, []):
            try:
                resp = await client.post(
                    f"{BASE_URL}/api/v1/content/subjects",
                    json={"class_id": str(class_id), "name": subj_name},
                    headers=h, timeout=10,
                )
                if resp.status_code in (200, 201):
                    ids["subject_ids"].append((subj_name, resp.json().get("id")))
                    stats.ok()
            except Exception as e:
                stats.fail(str(e))

    # Chapters
    for subj_name, subj_id in ids["subject_ids"]:
        chapters = CHAPTER_TEMPLATES.get(subj_name, ["Chapter 1", "Chapter 2", "Chapter 3"])
        for i, chap_name in enumerate(chapters, 1):
            try:
                resp = await client.post(
                    f"{BASE_URL}/api/v1/content/chapters",
                    json={"subject_id": str(subj_id), "name": chap_name,
                          "order": i, "description": f"{chap_name} — detailed study material"},
                    headers=h, timeout=10,
                )
                if resp.status_code in (200, 201):
                    chap_id = resp.json().get("id")
                    ids["chapter_ids"].append(chap_id)
                    stats.ok()

                    # Topics (3 per chapter)
                    for j in range(1, 4):
                        try:
                            tr = await client.post(
                                f"{BASE_URL}/api/v1/content/topics",
                                json={"chapter_id": str(chap_id),
                                      "name": f"{chap_name} — Part {j}",
                                      "order": j},
                                headers=h, timeout=10,
                            )
                            if tr.status_code in (200, 201):
                                topic_id = tr.json().get("id")
                                ids["topic_ids"].append(topic_id)
                                stats.ok()

                                # Videos (2 per topic)
                                for k in range(1, 3):
                                    try:
                                        vr = await client.post(
                                            f"{BASE_URL}/api/v1/content/videos",
                                            json={
                                                "topic_id":    str(topic_id),
                                                "title":       f"{chap_name} P{j} — Video {k}",
                                                "youtube_url": f"https://www.youtube.com/watch?v=LOADTEST{topic_id}_{k}",
                                                "duration":    random.randint(300, 1800),
                                                "order":       k,
                                            },
                                            headers=h, timeout=10,
                                        )
                                        if vr.status_code in (200, 201):
                                            ids["video_ids"].append(vr.json().get("id"))
                                            stats.ok()
                                    except Exception as e:
                                        stats.fail(str(e))
                        except Exception as e:
                            stats.fail(str(e))
            except Exception as e:
                stats.fail(str(e))

    print(stats.summary())
    print(
        f"    Chapters: {len(ids['chapter_ids'])}, "
        f"Topics: {len(ids['topic_ids'])}, "
        f"Videos: {len(ids['video_ids'])}"
    )
    return ids


# ── Quiz Seeder ──────────────────────────────────────────────────────────────

SAMPLE_QUESTIONS = [
    {"text": "What is the SI unit of force?", "options": ["Newton", "Joule", "Watt", "Pascal"], "correct": "A"},
    {"text": "Who proposed the theory of evolution?", "options": ["Darwin", "Mendel", "Lamarck", "Newton"], "correct": "A"},
    {"text": "What is H₂O?", "options": ["Hydrogen peroxide", "Water", "Oxygen", "Hydrogen"], "correct": "B"},
    {"text": "Speed of light in vacuum?", "options": ["3×10⁸ m/s", "3×10⁶ m/s", "3×10¹⁰ m/s", "3×10⁴ m/s"], "correct": "A"},
    {"text": "Area of a circle with radius r?", "options": ["πr²", "2πr", "πr", "2πr²"], "correct": "A"},
    {"text": "Chemical formula of common salt?", "options": ["NaCl", "KCl", "CaCl₂", "NaOH"], "correct": "A"},
    {"text": "Which gas do plants absorb?", "options": ["CO₂", "O₂", "N₂", "H₂"], "correct": "A"},
    {"text": "Unit of electric current?", "options": ["Ampere", "Volt", "Ohm", "Watt"], "correct": "A"},
    {"text": "Largest planet in our solar system?", "options": ["Jupiter", "Saturn", "Uranus", "Neptune"], "correct": "A"},
    {"text": "What is the powerhouse of the cell?", "options": ["Mitochondria", "Nucleus", "Ribosome", "Lysosome"], "correct": "A"},
    {"text": "Acid turns litmus paper?", "options": ["Red", "Blue", "Green", "Yellow"], "correct": "A"},
    {"text": "First element in the periodic table?", "options": ["Hydrogen", "Helium", "Lithium", "Carbon"], "correct": "A"},
    {"text": "Value of π (approx)?", "options": ["3.14", "2.71", "1.73", "1.41"], "correct": "A"},
    {"text": "Who wrote Romeo and Juliet?", "options": ["Shakespeare", "Dickens", "Tolkien", "Austen"], "correct": "A"},
    {"text": "CPU stands for?", "options": ["Central Processing Unit", "Core Power Unit", "Computer Processing Unit", "Central Program Unit"], "correct": "A"},
]


async def seed_quizzes(
    client: httpx.AsyncClient,
    token: str,
    chapter_ids: list,
    count: int,
    concurrency: int = 20,
) -> list[str]:
    """Create `count` quizzes with questions. Returns list of quiz IDs."""
    stats     = SeedStats("quizzes")
    semaphore = asyncio.Semaphore(concurrency)
    quiz_ids  = []
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def create_one(i: int):
        async with semaphore:
            chapter_id = random.choice(chapter_ids) if chapter_ids else None
            class_num  = random.choice([9, 10, 11, 12])
            subject    = random.choice(list(CHAPTER_TEMPLATES.keys()))
            questions  = random.sample(SAMPLE_QUESTIONS, min(15, len(SAMPLE_QUESTIONS)))

            payload = {
                "title":       f"Chapter Quiz {i:04d} — {subject}",
                "quiz_type":   random.choice(["chapter", "mock_test"]),
                "class_num":   class_num,
                "subject":     subject,
                "chapter_id":  str(chapter_id) if chapter_id else None,
                "time_limit":  random.choice([900, 1800, 3600]),
                "questions": [
                    {
                        "text":            q["text"],
                        "question_type":   "MCQ",
                        "options":         q["options"],
                        "correct_answer":  q["correct"],
                        "explanation":     f"The correct answer is {q['options'][ord(q['correct'])-65]}.",
                        "marks":           1,
                        "subject":         subject,
                        "class_num":       class_num,
                        "difficulty":      random.choice(["EASY", "MEDIUM", "HARD"]),
                    }
                    for q in questions
                ],
            }
            try:
                resp = await client.post(
                    f"{BASE_URL}/api/v1/quizzes",
                    json=payload,
                    headers=h,
                    timeout=20,
                )
                if resp.status_code in (200, 201):
                    qid = resp.json().get("id") or resp.json().get("quiz_id")
                    if qid:
                        quiz_ids.append(str(qid))
                    stats.ok()
                else:
                    stats.fail(f"HTTP {resp.status_code}: {resp.text[:60]}")
            except Exception as e:
                stats.fail(str(e))

    await asyncio.gather(*[create_one(i) for i in range(count)])
    print(stats.summary())
    return quiz_ids


# ── Qdrant Vector Seeder ─────────────────────────────────────────────────────

async def seed_qdrant_vectors(count: int):
    """
    Seed `count` random 768-dim vectors into the content_chunks collection.
    Tests: Qdrant write throughput, index rebuild time, and memory usage.
    """
    if not HAVE_QDRANT:
        print("  [SKIP] qdrant-client not installed. pip install qdrant-client")
        print(f"  Would seed {count} vectors into collection '{COLLECTION}'")
        return

    print(f"\n  Seeding {count} vectors into Qdrant collection '{COLLECTION}'...")
    stats = SeedStats("qdrant_vectors")

    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_KEY or None, timeout=30)

    # Ensure collection exists
    try:
        collections = [c.name for c in client.get_collections().collections]
        if COLLECTION not in collections:
            client.create_collection(
                collection_name=COLLECTION,
                vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
            )
            print(f"  Created Qdrant collection '{COLLECTION}'")
    except Exception as e:
        print(f"  Failed to create collection: {e}")
        return

    BATCH_SIZE = 256
    batches    = math.ceil(count / BATCH_SIZE)

    for b in range(batches):
        start_id = b * BATCH_SIZE
        end_id   = min(start_id + BATCH_SIZE, count)
        points   = [
            PointStruct(
                id=start_id + j,
                vector=[random.gauss(0, 0.3) for _ in range(VECTOR_DIM)],
                payload={
                    "content_id": str(uuid.uuid4()),
                    "chunk_text": f"Sample educational content chunk {start_id + j}",
                    "subject":    random.choice(list(CHAPTER_TEMPLATES.keys())),
                    "class_num":  random.choice([9, 10, 11, 12]),
                    "chapter":    f"Chapter {random.randint(1, 10)}",
                    "board":      random.choice(BOARDS),
                },
            )
            for j in range(end_id - start_id)
        ]
        try:
            t0 = time.monotonic()
            client.upsert(collection_name=COLLECTION, points=points, wait=True)
            latency = (time.monotonic() - t0) * 1000
            for _ in points:
                stats.ok()
            if b % 10 == 0:
                print(f"    Batch {b+1}/{batches}: {end_id}/{count} vectors "
                      f"({latency:.0f}ms for {len(points)} points)")
        except Exception as e:
            for _ in points:
                stats.fail(str(e))

    print(stats.summary())

    # Verify
    try:
        info = client.get_collection(COLLECTION)
        print(f"  Qdrant collection '{COLLECTION}': {info.vectors_count} vectors indexed")
        if info.vectors_count < count * 0.95:
            print(f"  WARNING: Only {info.vectors_count}/{count} vectors indexed — possible write failures")
    except Exception as e:
        print(f"  Could not verify: {e}")


# ── Subscription Seeder ──────────────────────────────────────────────────────

async def seed_subscriptions(
    client: httpx.AsyncClient,
    token: str,
    user_ids: list[str],
    basic_pct: float  = 0.20,
    premium_pct: float = 0.10,
):
    """
    Assign subscriptions to a fraction of users.
    Distribution: 70% free (no subscription), 20% basic, 10% premium.
    """
    stats   = SeedStats("subscriptions")
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    random.shuffle(user_ids)
    n_basic   = int(len(user_ids) * basic_pct)
    n_premium = int(len(user_ids) * premium_pct)

    basic_users   = user_ids[:n_basic]
    premium_users = user_ids[n_basic:n_basic + n_premium]

    async def assign(uid: str, plan: str):
        # Simulate a Cashfree webhook that marks subscription active
        try:
            resp = await client.post(
                f"{BASE_URL}/api/v1/payments/admin/grant-subscription",
                json={"user_id": uid, "plan": plan, "duration_days": 30},
                headers=h,
                timeout=10,
            )
            if resp.status_code in (200, 201):
                stats.ok()
            else:
                stats.fail(f"HTTP {resp.status_code}")
        except Exception as e:
            stats.fail(str(e))

    semaphore = asyncio.Semaphore(30)

    async def _limited(uid, plan):
        async with semaphore:
            await assign(uid, plan)

    tasks = (
        [_limited(uid, "basic")   for uid in basic_users] +
        [_limited(uid, "premium") for uid in premium_users]
    )
    await asyncio.gather(*tasks)

    print(stats.summary())
    print(f"    Basic: {len(basic_users)}, Premium: {len(premium_users)}, "
          f"Free: {len(user_ids) - len(basic_users) - len(premium_users)}")


# ── Battle Room Seeder ───────────────────────────────────────────────────────

async def seed_battle_rooms(
    client: httpx.AsyncClient,
    tokens: list[str],
    count: int = 20,
) -> list[str]:
    """Create `count` open battle rooms for WS load tests to join."""
    stats    = SeedStats("battles")
    room_ids = []
    h_base   = {"Content-Type": "application/json"}

    for i in range(min(count, len(tokens))):
        token   = tokens[i]
        user_id = str(uuid.uuid4())
        h = {**h_base, "Authorization": f"Bearer {token}"}
        try:
            resp = await client.post(
                f"{BASE_URL}/api/v1/battles",
                json={
                    "creator_id":     user_id,
                    "subject":        random.choice(list(CHAPTER_TEMPLATES.keys())),
                    "class_num":      random.choice([9, 10, 11, 12]),
                    "question_count": 5,
                    "time_limit":     60,
                    "is_public":      True,
                },
                headers=h,
                timeout=10,
            )
            if resp.status_code in (200, 201):
                bid = resp.json().get("id") or resp.json().get("battle_id")
                if bid:
                    room_ids.append(str(bid))
                stats.ok()
            else:
                stats.fail(f"HTTP {resp.status_code}")
        except Exception as e:
            stats.fail(str(e))

    print(stats.summary())
    return room_ids


# ── Save Seed Manifest ───────────────────────────────────────────────────────

def save_manifest(data: dict, path: str = "seed_manifest.json"):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"\n  Seed manifest saved to: {path}")
    print(f"  Load this file in your Locust/k6 tests for realistic IDs.")


# ── Full Seed Flow ───────────────────────────────────────────────────────────

async def full_seed(base_url: str, user_count: int, quiz_count: int):
    global BASE_URL
    BASE_URL = base_url

    print(f"\n{'='*60}")
    print(f"EduLearn Full Seed: {user_count} users, {quiz_count} quizzes")
    print(f"Target: {base_url}")
    print(f"{'='*60}\n")

    start = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=30) as client:
        # Admin token
        print("Step 1/6: Admin login")
        try:
            admin_token = await get_admin_token(client)
            print(f"  Admin token acquired: {admin_token[:20]}...")
        except Exception as e:
            print(f"  [WARN] Admin login failed: {e}. Using empty token — some steps may fail.")
            admin_token = ""

        # Users
        print(f"\nStep 2/6: Seeding {user_count} users")
        users = await seed_users(client, user_count, concurrency=50)
        user_ids  = [u["id"] for u in users if u.get("id")]
        tokens    = [u["token"] for u in users if u.get("token")]

        # Subscriptions
        print(f"\nStep 3/6: Assigning subscriptions")
        if user_ids and admin_token:
            await seed_subscriptions(client, admin_token, user_ids)
        else:
            print("  [SKIP] No users or admin token")

        # Content
        print(f"\nStep 4/6: Seeding content hierarchy")
        content_ids = await seed_content(client, admin_token)

        # Quizzes
        print(f"\nStep 5/6: Seeding {quiz_count} quizzes")
        chapter_ids = content_ids.get("chapter_ids", [])
        quiz_ids = await seed_quizzes(client, admin_token, chapter_ids, quiz_count)

        # Battle rooms
        print(f"\nStep 6/6: Creating battle rooms")
        battle_ids = []
        if tokens:
            battle_ids = await seed_battle_rooms(client, tokens[:20], count=20)

    # Qdrant vectors (outside httpx context)
    print(f"\nBonus: Seeding Qdrant vectors")
    await seed_qdrant_vectors(count=10000)

    elapsed = time.monotonic() - start

    # Save manifest
    manifest = {
        "seeded_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base_url":    base_url,
        "user_count":  len(users),
        "user_sample": users[:10],          # first 10 for test use
        "user_ids":    user_ids[:500],      # cap to keep file small
        "tokens":      tokens[:50],         # 50 tokens for test VUs
        "chapter_ids": content_ids.get("chapter_ids", [])[:100],
        "topic_ids":   content_ids.get("topic_ids", [])[:100],
        "video_ids":   content_ids.get("video_ids", [])[:100],
        "quiz_ids":    quiz_ids[:100],
        "battle_ids":  battle_ids,
        "admin_token": admin_token if 'admin_token' in locals() else "",
    }
    save_manifest(manifest, "tests/load/scripts/seed_manifest.json")

    print(f"\n{'='*60}")
    print(f"Seed complete in {elapsed:.1f}s")
    print(f"  Users: {len(users)}, Quizzes: {len(quiz_ids)}, Battles: {len(battle_ids)}")
    print(f"{'='*60}\n")


async def quick_seed(base_url: str, user_count: int):
    """Minimal seed: just users + admin token. Skip content/quizzes."""
    global BASE_URL
    BASE_URL = base_url

    print(f"Quick seed: {user_count} users → {base_url}")
    async with httpx.AsyncClient(base_url=base_url, timeout=30) as client:
        users = await seed_users(client, user_count, concurrency=50)
        tokens = [u["token"] for u in users if u.get("token")]
        manifest = {
            "seeded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "base_url":  base_url,
            "user_count": len(users),
            "tokens":    tokens[:50],
        }
    save_manifest(manifest, "tests/load/scripts/seed_manifest.json")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="EduLearn Data Seeder")
    sub    = parser.add_subparsers(dest="cmd")

    p_full = sub.add_parser("full", help="Full seed (users + content + quizzes + battles)")
    p_full.add_argument("--base-url", default="http://localhost:9000")
    p_full.add_argument("--users",    type=int, default=10000)
    p_full.add_argument("--quizzes",  type=int, default=500)

    p_q = sub.add_parser("quick", help="Quick seed (users only)")
    p_q.add_argument("--base-url", default="http://localhost:9000")
    p_q.add_argument("--users",    type=int, default=1000)

    p_qd = sub.add_parser("qdrant", help="Seed Qdrant vectors only")
    p_qd.add_argument("--vectors", type=int, default=50000)

    args = parser.parse_args()

    if args.cmd == "full":
        asyncio.run(full_seed(args.base_url, args.users, args.quizzes))
    elif args.cmd == "quick":
        asyncio.run(quick_seed(args.base_url, args.users))
    elif args.cmd == "qdrant":
        asyncio.run(seed_qdrant_vectors(args.vectors))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
