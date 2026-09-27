#!/usr/bin/env python3
"""EduLearn cross-service database seeder.

Generates a realistic school ecosystem across all 12 microservice databases
with CONSISTENT UUIDs (the same student id appears in auth_db, user_db,
gamification_db, ...). Data is deterministic (uuid5 + seeded RNG), and every
INSERT carries ON CONFLICT DO NOTHING, so the seeder is safe to re-run.

Usage:
    python3 tools/seed/seed.py --scale small|medium|full [--only auth,user,...]
    python3 tools/seed/seed.py --scale medium --dry-run   # write SQL, don't apply

Output: one .sql file per service DB under tools/seed/out/, then applied via
`docker exec -i <svc>_service_postgres psql` (no host ports needed).

Every seeded account logs in with password  Seed@123
    students: seed.student<N>@edulearn.test
    parents:  seed.parent<N>@edulearn.test
    teachers: seed.teacher<N>@edulearn.test
    admins:   seed.admin<N>@edulearn.test  (+ seed.superadmin@edulearn.test)

Scale profiles (full mirrors the E2E plan's targets):
                      small   medium    full
    students             50      500    5000
    parents              10       50     500
    teachers              5       20     100
    flagship chapters/subj 3       8      20
    videos/chapter        2        5      10
    practice Qs/chapter  10       40     100
    quizzes              30      200    1000
    DM chat rooms        60      800   10000
    group chats          10      200    2000
    notifications       500    10000  100000
    battles              20      100     500
"""
from __future__ import annotations

import argparse
import random
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # uuid5 namespace
OUT = Path(__file__).parent / "out"
REPO = Path(__file__).resolve().parents[2]
BCRYPT_SEED_HASH = "$2b$12$eA5e.xa4f1cDXtq75XA6veaiDxj82TlzvXlemY/PCkBOoKZW6.DRm"  # Seed@123
NOW = datetime(2026, 7, 3, 12, 0, 0, tzinfo=timezone.utc)  # fixed anchor → deterministic output

rng = random.Random(42)

SCALES = {
    "small":  dict(students=50,  parents=10,  teachers=5,  chapters=3,  videos=2,  pq=10,
                   quizzes=30,  dms=60,   groups=10,  notifs=500,    battles=20,  articles=40),
    "medium": dict(students=500, parents=50,  teachers=20, chapters=8,  videos=5,  pq=40,
                   quizzes=200, dms=800,  groups=200, notifs=10000,  battles=100, articles=120),
    "full":   dict(students=5000, parents=500, teachers=100, chapters=20, videos=10, pq=100,
                   quizzes=1000, dms=10000, groups=2000, notifs=100000, battles=500, articles=500),
}

SCHOOLS = ["Delhi Public School", "Ryan International", "DAV Public School",
           "Kendriya Vidyalaya", "Modern School"]
CITIES = [("New Delhi", "Delhi"), ("Mumbai", "Maharashtra"), ("Bengaluru", "Karnataka"),
          ("Jaipur", "Rajasthan"), ("Lucknow", "Uttar Pradesh"), ("Chandigarh", "Punjab"),
          ("Patna", "Bihar"), ("Kolkata", "West Bengal")]
BOARDS = [("CBSE", "CBSE"), ("ICSE", "ICSE"), ("State Board", "STATE")]
CLASSES = [6, 7, 8, 9, 10, 11, 12]
SUBJECTS = ["Math", "Science", "Physics", "Chemistry", "Biology",
            "English", "History", "Geography", "Computer"]

FIRST_M = ["Rahul", "Mohit", "Aman", "Arjun", "Vikram", "Rohan", "Karan", "Aditya", "Sanjay",
           "Deepak", "Nikhil", "Suresh", "Rajesh", "Varun", "Harsh", "Yash", "Kunal", "Manish"]
FIRST_F = ["Anjali", "Priya", "Sneha", "Pooja", "Neha", "Kavya", "Riya", "Divya", "Shreya",
           "Meera", "Isha", "Tanvi", "Aisha", "Nidhi", "Swati", "Ritu", "Sakshi", "Ananya"]
LAST = ["Sharma", "Singh", "Kumar", "Gupta", "Verma", "Patel", "Reddy", "Mehta", "Joshi",
        "Chauhan", "Yadav", "Mishra", "Nair", "Das", "Khan", "Kaur", "Bose", "Rao"]

GROUP_NAMES = ["Math Lovers", "Science Club", "NEET Aspirants", "JEE Warriors",
               "School Friends", "Physics Masters", "Chem Wizards", "Bio Buddies",
               "History Buffs", "Geo Explorers", "Code Ninjas", "Quiz Champs"]

CHAT_LINES = ["Did you finish the homework?", "That quiz was tough 😅", "Battle tonight at 7?",
              "Can you share your notes?", "I got 92% in the Physics quiz!", "Same here!",
              "Let's revise chapter 4 together", "Who's joining the study party?",
              "The new video on trigonometry is really good", "Good luck for tomorrow!",
              "Thanks! You too 🎯", "What did you get for Q7?", "I think it's option B",
              "Streak day 12 🔥", "Just claimed my daily reward 🎁"]


def u5(*parts: object) -> str:
    return str(uuid.uuid5(NS, "edulearn-seed:" + ":".join(str(p) for p in parts)))


def q(val: object) -> str:
    """SQL-literal-ize a python value."""
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, datetime):
        return f"'{val.isoformat()}'"
    s = str(val).replace("'", "''")
    return f"'{s}'"


class SqlFile:
    def __init__(self, name: str):
        self.name = name
        self.stmts: list[str] = ["BEGIN;"]

    def insert(self, table: str, cols: list[str], rows: list[tuple], conflict: str = ""):
        if not rows:
            return
        target = f" {conflict}" if conflict else " ON CONFLICT DO NOTHING"
        for i in range(0, len(rows), 500):
            batch = rows[i:i + 500]
            values = ",\n".join("(" + ",".join(q(v) for v in row) + ")" for row in batch)
            self.stmts.append(
                f"INSERT INTO {table} ({','.join(cols)}) VALUES\n{values}{target};"
            )

    def raw(self, stmt: str):
        self.stmts.append(stmt)

    def write(self) -> Path:
        self.stmts.append("COMMIT;")
        path = OUT / f"{self.name}.sql"
        path.write_text("\n".join(self.stmts))
        return path


def days_ago(n: float) -> datetime:
    return NOW - timedelta(days=n)


# ─── Generation ────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", choices=SCALES, default="medium")
    ap.add_argument("--only", help="comma-separated service list (default: all)")
    ap.add_argument("--dry-run", action="store_true", help="write SQL files but don't apply")
    args = ap.parse_args()
    S = SCALES[args.scale]
    OUT.mkdir(parents=True, exist_ok=True)

    # ── Users (shared identity across every DB) ──────────────────────────────
    students, parents, teachers, admins = [], [], [], []
    for i in range(S["students"]):
        male = rng.random() < 0.5
        first = rng.choice(FIRST_M if male else FIRST_F)
        name = f"{first} {rng.choice(LAST)}"
        city, state = rng.choice(CITIES)
        students.append(dict(
            id=u5("student", i), email=f"seed.student{i}@edulearn.test", name=name,
            gender="male" if male else "female", school=rng.choice(SCHOOLS),
            cls=rng.choice(CLASSES), board=rng.choice(BOARDS)[1], city=city, state=state,
            created=days_ago(rng.uniform(1, 365)),
        ))
    for i in range(S["parents"]):
        name = f"{rng.choice(FIRST_M + FIRST_F)} {rng.choice(LAST)}"
        parents.append(dict(id=u5("parent", i), email=f"seed.parent{i}@edulearn.test",
                            name=name, created=days_ago(rng.uniform(1, 300))))
    for i in range(S["teachers"]):
        name = f"{rng.choice(FIRST_M + FIRST_F)} {rng.choice(LAST)}"
        teachers.append(dict(id=u5("teacher", i), email=f"seed.teacher{i}@edulearn.test",
                             name=name, created=days_ago(rng.uniform(30, 400))))
    for i in range(4):
        admins.append(dict(id=u5("admin", i), email=f"seed.admin{i}@edulearn.test",
                           name=f"Admin {i + 1}", role="ADMIN", created=days_ago(400)))
    admins.append(dict(id=u5("superadmin"), email="seed.superadmin@edulearn.test",
                       name="Seed SuperAdmin", role="SUPER_ADMIN", created=days_ago(400)))

    # auth_db ------------------------------------------------------------------
    auth = SqlFile("auth")
    rows = []
    for s in students:
        rows.append((s["id"], s["email"], s["name"], s["school"], BCRYPT_SEED_HASH,
                     "STUDENT", True, True, True, s["created"]))
    for p in parents:
        rows.append((p["id"], p["email"], p["name"], None, BCRYPT_SEED_HASH,
                     "PARENT", True, True, True, p["created"]))
    for t in teachers:
        rows.append((t["id"], t["email"], t["name"], None, BCRYPT_SEED_HASH,
                     "TEACHER", True, True, True, t["created"]))
    for a in admins:
        rows.append((a["id"], a["email"], a["name"], None, BCRYPT_SEED_HASH,
                     a.get("role", "ADMIN"), True, True, True, a["created"]))
    auth.insert("users",
                ["id", "email", "full_name", "school_name", "hashed_password",
                 "role", "terms_accepted", "is_active", "is_verified", "created_at"],
                rows)

    # user_db ------------------------------------------------------------------
    usr = SqlFile("user")
    prof_rows = []
    for s in students:
        prof_rows.append((u5("profile", s["id"]), s["id"], s["name"], s["gender"],
                          s["city"], s["state"], s["school"], s["cls"], s["board"], s["created"]))
    for grp in (parents, teachers, admins):
        for p in grp:
            prof_rows.append((u5("profile", p["id"]), p["id"], p["name"], None,
                              None, None, None, None, None, p["created"]))
    usr.insert("user_profiles",
               ["id", "user_id", "full_name", "gender", "city", "state",
                "school_name", "class_number", "board", "created_at"],
               prof_rows)

    # parent-child links: each parent 1-3 students
    link_rows, si = [], 0
    for p in parents:
        for _ in range(rng.randint(1, 3)):
            child = students[si % len(students)]
            si += 1
            link_rows.append((u5("plink", p["id"], child["id"]), p["id"], child["id"],
                              rng.choice(["father", "mother"]), True, True, p["created"]))
    usr.insert("parent_profiles",
               ["id", "parent_user_id", "student_user_id", "relationship",
                "approval_required", "is_approved", "created_at"],
               link_rows)

    # friendships: ring + random edges → ~10 (medium) / ~30 (full) accepted per student
    per = {"small": 6, "medium": 10, "full": 30}[args.scale]
    pend = {"small": 2, "medium": 4, "full": 10}[args.scale]
    fr_rows, friend_pairs, seen = [], [], set()

    def add_edge(a: int, b: int, status: str):
        if a == b:
            return
        key = (min(a, b), max(a, b))
        if key in seen:
            return
        seen.add(key)
        sa, sb = students[a], students[b]
        fr_rows.append((u5("friend", key[0], key[1]), sa["id"], sb["id"], status,
                        days_ago(rng.uniform(0, 200))))
        if status == "accepted":
            friend_pairs.append((sa, sb))

    n = len(students)
    for i in range(n):
        for k in range(1, per // 2 + 1):
            add_edge(i, (i + k) % n, "accepted")
        for _ in range(pend // 2):
            add_edge(i, rng.randrange(n), rng.choice(["pending", "rejected"]))
    usr.insert("friend_requests",
               ["id", "from_user_id", "to_user_id", "status", "created_at"], fr_rows)

    # chats: DMs over friendships + groups
    room_rows, member_rows, msg_rows = [], [], []
    dm_count = min(S["dms"], len(friend_pairs))
    for idx in range(dm_count):
        a, b = friend_pairs[idx % len(friend_pairs)]
        rid = u5("dm", a["id"], b["id"])
        created = days_ago(rng.uniform(1, 90))
        room_rows.append((rid, "direct", None, a["id"], created))
        member_rows.append((u5("mem", rid, a["id"]), rid, a["id"], False, created))
        member_rows.append((u5("mem", rid, b["id"]), rid, b["id"], False, created))
        for m in range(rng.randint(2, 8)):
            sender = a if m % 2 == 0 else b
            ts = days_ago(rng.uniform(0, 2.5))
            msg_rows.append((u5("msg", rid, m), rid, sender["id"], rng.choice(CHAT_LINES),
                             "text", "read", ts, ts + timedelta(days=7)))
    for g in range(S["groups"]):
        creator = students[rng.randrange(n)]
        name = GROUP_NAMES[g % len(GROUP_NAMES)] if g < len(GROUP_NAMES) \
            else f"Class {rng.choice(CLASSES)}{rng.choice('ABCD')} Group {g}"
        rid = u5("group", g)
        created = days_ago(rng.uniform(1, 120))
        room_rows.append((rid, "group", name, creator["id"], created))
        member_rows.append((u5("mem", rid, creator["id"]), rid, creator["id"], True, created))
        for mem_i in range(rng.randint(3, 9)):
            m = students[(hash(rid) + mem_i * 37) % n]
            if m["id"] != creator["id"]:
                member_rows.append((u5("mem", rid, m["id"]), rid, m["id"], False, created))
        for m in range(rng.randint(3, 12)):
            sender = students[(hash(rid) + m * 13) % n]
            ts = days_ago(rng.uniform(0, 2.5))
            msg_rows.append((u5("msg", rid, m), rid, sender["id"], rng.choice(CHAT_LINES),
                             "text", "read", ts, ts + timedelta(days=7)))
    usr.insert("chat_rooms", ["id", "type", "name", "created_by", "created_at"], room_rows)
    usr.insert("chat_room_members",
               ["id", "room_id", "user_id", "is_admin", "joined_at"], member_rows)
    usr.insert("chat_messages",
               ["id", "room_id", "sender_id", "content", "msg_type", "status",
                "created_at", "expires_at"], msg_rows)

    # content_db ---------------------------------------------------------------
    # Flagship: CBSE Class 10 gets all 9 subjects at full depth (the plan's
    # 9 × chapters × videos totals). Other board/class combos get a light
    # catalog so every drill-down path works.
    con = SqlFile("content")
    board_rows, class_rows, subj_rows = [], [], []
    chap_rows, topic_rows, video_rows = [], [], []
    q_rows, pq_rows, note_rows, ex_rows = [], [], [], []
    all_chapters, all_topics, all_subject_ids = [], [], []

    for bname, bcode in BOARDS:
        bid = u5("board", bcode)
        board_rows.append((bid, bname, bcode, True))
        for cnum in CLASSES:
            cid = u5("class", bcode, cnum)
            class_rows.append((cid, bid, f"Class {cnum}", cnum, True))
            flagship = (bcode == "CBSE" and cnum == 10)
            subj_list = SUBJECTS if flagship else SUBJECTS[:2]
            depth = S["chapters"] if flagship else 3
            vids = S["videos"] if flagship else 2
            pqs = S["pq"] if flagship else 6
            for sname in subj_list:
                sid = u5("subject", bcode, cnum, sname)
                subj_rows.append((sid, cid, sname, sname[:3].upper(), True))
                all_subject_ids.append((sid, bcode, cnum, sname))
                for ch in range(1, depth + 1):
                    chid = u5("chapter", sid, ch)
                    chap_rows.append((chid, sid, f"{sname} Chapter {ch}",
                                      f"Chapter {ch} of {sname} for Class {cnum} ({bname})",
                                      ch, True, days_ago(200)))
                    all_chapters.append((chid, sid, bcode, cnum, sname, ch))
                    note_rows.append((u5("note", chid), chid, f"{sname} Ch.{ch} Notes", "pdf",
                                      f"seed/notes/{bcode}/{cnum}/{sname}/ch{ch}.pdf",
                                      250_000 + ch * 1000, False, True, days_ago(180)))
                    ex_id = u5("exercise", chid)
                    ex_rows.append((ex_id, chid, f"Exercise {ch}.1", f"{ch}.1", 1, True))
                    for t in range(1, 3):
                        tid = u5("topic", chid, t)
                        topic_rows.append((tid, chid, f"{sname} Ch.{ch} Topic {t}",
                                           None, t, "MEDIUM", True))
                        all_topics.append(tid)
                        for v in range(vids // 2 + (vids % 2 if t == 1 else 0)):
                            vid = u5("video", tid, v)
                            video_rows.append((vid, tid, f"{sname} Ch.{ch}.{t} Lesson {v + 1}",
                                               f"seedYT{abs(hash(vid)) % 10**9}",
                                               rng.randint(300, 1200), v + 1,
                                               False, True, days_ago(rng.uniform(5, 150))))
                    # content questions + MCQ practice questions
                    n_q = max(1, pqs // 10)
                    for qq in range(1, n_q + 1):
                        qid = u5("cq", chid, qq)
                        q_rows.append((qid, chid, ex_id, f"Q{qq}",
                                       f"{sname} Ch.{ch} exercise question {qq}", qq, True))
                        for p in range(pqs // n_q):
                            correct = rng.choice("ABCD")
                            pq_rows.append((u5("pq", qid, p), qid,
                                            f"Practice: {sname} Ch.{ch} Q{qq}.{p + 1} — pick the correct option.",
                                            "Option A", "Option B", "Option C", "Option D",
                                            correct, f"The answer is {correct}.",
                                            rng.choice(["EASY", "MEDIUM", "HARD"]), p + 1, True))
    con.insert("boards", ["id", "name", "code", "is_active"], board_rows)
    con.insert("classes", ["id", "board_id", "name", "number", "is_active"], class_rows)
    con.insert("subjects", ["id", "class_id", "name", "code", "is_active"], subj_rows)
    con.insert("chapters",
               ["id", "subject_id", "title", "description", "sequence", "is_active", "created_at"],
               chap_rows)
    con.insert("notes",
               ["id", "chapter_id", "title", "note_type", "s3_key", "file_size_bytes",
                "is_premium", "is_active", "created_at"], note_rows)
    con.insert("exercises", ["id", "chapter_id", "name", "number", "sequence", "is_active"], ex_rows)
    con.insert("topics",
               ["id", "chapter_id", "title", "description", "sequence", "difficulty", "is_active"],
               topic_rows)
    con.insert("videos",
               ["id", "topic_id", "title", "youtube_id", "duration_seconds", "sequence",
                "is_premium", "is_active", "created_at"], video_rows)
    con.insert("questions",
               ["id", "chapter_id", "exercise_id", "question_number", "question_text",
                "sequence", "is_active"], q_rows)
    con.insert("practice_questions",
               ["id", "question_id", "text", "option_a", "option_b", "option_c", "option_d",
                "correct_option", "explanation", "difficulty", "sequence", "is_active"], pq_rows)

    # PYPs: 10 years × 3 boards × 3 subjects
    pyp_rows = []
    for bname, bcode in BOARDS:
        for sname in ["Math", "Science", "English"]:
            for year in range(NOW.year - 10, NOW.year):
                pyp_rows.append((u5("pyp", bcode, sname, year), bcode, 10, sname, year, "board",
                                 f"{bname} Class 10 {sname} {year}",
                                 f"Official {year} board paper", "medium", True, days_ago(300)))
    con.insert("previous_year_papers",
               ["id", "board", "class_num", "subject", "year", "exam_type", "title",
                "description", "difficulty", "is_active", "created_at"], pyp_rows)

    # CMS info pages — every slug the web/mobile/admin clients request.
    # Without these, SiteFooter / About / Contact / FAQ silently fall back to
    # static copy (and log 404s), and the admin's Info Pages editor starts
    # from empty pages.
    info_pages = {
        "footer": ("Footer Text", "© 2026 EduLearn. All rights reserved. Built for the future of learning."),
        "faq": ("Frequently Asked Questions", "How do I start learning?\nPick your board and class on the Learn tab.\n\nHow do quizzes and XP work?\nEvery quiz earns XP and EduPoints; keep your streak for bonus rewards."),
        "about": ("About EduLearn", "EduLearn is a gamified learning platform for CBSE, ICSE and State board students, classes 6-12."),
        "contact": ("Contact Us", "Support: support@edulearn.test\nOr use the in-app Feedback form."),
        "about-us": ("About Us", "EduLearn is a gamified learning platform for CBSE, ICSE and State board students, classes 6-12."),
        "contact-us": ("Contact Us", "Support: support@edulearn.test\nOr use the in-app Feedback form."),
        "privacy-policy": ("Privacy Policy", "We collect only what is needed to run your account and never sell personal data."),
        "terms": ("Terms & Conditions", "Use chat and groups respectfully; subscriptions renew per your chosen plan and can be cancelled anytime."),
        "refund-policy": ("Refund Policy", "Subscription payments are refundable within 7 days if premium features were not used."),
        "courses": ("Courses", "Complete syllabus coverage for CBSE, ICSE and State boards, classes 6-12."),
        "features": ("Features", "Video lessons, quizzes, real-time battles, streaks, leaderboards, AI tutor and a parent dashboard."),
        "pricing": ("Pricing", "Start free; upgrade to Premium for the AI tutor and revision tools — see the Subscription page for live plans."),
        "docs": ("Documentation", "Getting started guides and FAQs for students, parents and teachers."),
    }
    con.insert("info_pages",
               ["id", "slug", "title", "content", "is_published", "updated_at"],
               [(u5("infopage", slug), slug, title, content, True, days_ago(30))
                for slug, (title, content) in info_pages.items()])

    # knowledge hub
    kcat_rows, kart_rows = [], []
    cats = ["Space", "Technology", "Nature", "History", "Sports", "Health", "Culture", "Science"]
    for i, cat in enumerate(cats):
        kcat_rows.append((u5("kcat", cat), cat, "📚", "from-indigo-500 to-purple-600",
                          f"Articles about {cat.lower()}", i + 1, True))
    for i in range(S["articles"]):
        cat = cats[i % len(cats)]
        kart_rows.append((u5("kart", i), u5("kcat", cat), f"{cat} Deep Dive #{i + 1}",
                          f"An interesting exploration of {cat.lower()} topic {i + 1}.",
                          f"Long-form seeded article content for {cat} #{i + 1}. " * 20,
                          rng.randint(3, 12), rng.randint(0, 5000), i % 17 == 0, True,
                          "EduLearn Editorial", days_ago(rng.uniform(1, 200)), days_ago(1)))
    con.insert("knowledge_categories",
               ["id", "name", "icon", "color", "description", "sequence", "is_active"], kcat_rows)
    con.insert("knowledge_articles",
               ["id", "category_id", "title", "description", "content", "duration_min",
                "view_count", "is_trending", "is_published", "author", "created_at", "updated_at"],
               kart_rows)

    # quiz_db ------------------------------------------------------------------
    qz = SqlFile("quiz")
    quiz_rows, qq_rows = [], []
    flagship_chaps = [c for c in all_chapters if c[2] == "CBSE" and c[3] == 10] or all_chapters
    for i in range(S["quizzes"]):
        chid, sid, bcode, cnum, sname, chnum = flagship_chaps[i % len(flagship_chaps)]
        quiz_id = u5("quiz", i)
        n_q = rng.choice([10, 20, 20, 20, 50] if args.scale != "small" else [5, 10])
        quiz_rows.append((quiz_id, f"{sname} Ch.{chnum} Quiz #{i + 1}", chid, sid, "CHAPTER",
                          max(10, n_q), n_q, max(1, n_q // 3), False, True,
                          days_ago(rng.uniform(5, 180)), bcode, cnum, sname,
                          f"{sname} Chapter {chnum}"))
        for s_i in range(n_q):
            typ = rng.choices(["MCQ", "TRUE_FALSE", "FILL_BLANK", "SUBJECTIVE"],
                              weights=[60, 20, 10, 10])[0]
            if typ == "MCQ":
                correct = rng.choice(["A", "B", "C", "D"])
                opts = '{"A":"Option A","B":"Option B","C":"Option C","D":"Option D"}'
                answer = correct
            elif typ == "TRUE_FALSE":
                opts = '{"A":"True","B":"False"}'
                answer = rng.choice(["True", "False"])
            elif typ == "FILL_BLANK":
                opts, answer = None, f"answer{s_i}"
            else:
                opts, answer = None, f"model answer {s_i}"
            qq_rows.append((u5("quizq", quiz_id, s_i), quiz_id,
                            f"{sname} question {s_i + 1} for quiz {i + 1}?", typ, opts, answer,
                            f"Explanation for question {s_i + 1}.", 1,
                            rng.choice([0.0, 0.25]), s_i + 1))
    qz.insert("quizzes",
              ["id", "title", "chapter_id", "subject_id", "quiz_type", "duration_minutes",
               "total_marks", "passing_marks", "is_premium", "is_active", "created_at",
               "board", "class_num", "subject_name", "chapter_name"], quiz_rows)
    qz.insert("questions",
              ["id", "quiz_id", "text", "question_type", "options", "correct_answer",
               "explanation", "marks", "negative_marks", "sequence"], qq_rows)
    qz.raw("UPDATE questions SET options = options::jsonb WHERE options IS NOT NULL;")

    # gamification_db ----------------------------------------------------------
    # XP distribution per the plan: ~most users low level, few high.
    gam = SqlFile("gamification")
    xp_rows, streak_rows, ep_rows, badge_rows, act_rows = [], [], [], [], []
    thresholds = [0, 100, 300, 700, 1200, 2000, 3000, 4500, 6000, 8000]
    for idx, s in enumerate(students):
        r = rng.random()
        level = 1 if r < 0.45 else (rng.randint(2, 4) if r < 0.75 else
                                    (rng.randint(5, 7) if r < 0.95 else rng.randint(8, 10)))
        xp = thresholds[level - 1] + rng.randint(0, 90)
        # season_start must be the CURRENT season (quarterly, e.g. Jul 1) — the
        # service's _maybe_reset_season wipes total_xp to 0 the first time it
        # touches a row whose season_start predates the running season.
        season_start = datetime(NOW.year, (NOW.month - 1) // 3 * 3 + 1, 1, tzinfo=timezone.utc)
        xp_rows.append((u5("xp", s["id"]), s["id"], xp, level, season_start, days_ago(1)))
        streak = rng.choice([0, 1, 2, 3, 5, 8, 12, 20, 35])
        streak_rows.append((u5("streak", s["id"]), s["id"], streak, max(streak, rng.randint(0, 60)),
                            days_ago(0 if streak else rng.uniform(2, 30)).date(),
                            rng.choice([0, 0, 1, 2]), None))
        ep_earned = rng.randint(0, 900)
        ep_spent = rng.randint(0, ep_earned) if ep_earned else 0
        ep_rows.append((u5("ep", s["id"]), s["id"], ep_earned - ep_spent, ep_earned,
                        ep_spent, days_ago(1)))
        if level >= 5:
            badge_rows.append((u5("badge", s["id"], "LEVEL_5"), s["id"], "LEVEL_5", days_ago(20)))
        if level >= 10:
            badge_rows.append((u5("badge", s["id"], "LEVEL_10"), s["id"], "LEVEL_10", days_ago(5)))
        if streak >= 7:
            badge_rows.append((u5("badge", s["id"], "STREAK_7"), s["id"], "STREAK_7", days_ago(10)))
        # recent activity events power the friend feed
        for a in range(rng.randint(0, 3)):
            kind = rng.choice(["QUIZ_COMPLETED", "BATTLE_WON", "LEVEL_UP", "DAILY_GOAL_COMPLETED"])
            title = {"QUIZ_COMPLETED": f"{rng.choice(SUBJECTS)} Quiz",
                     "BATTLE_WON": "Battle", "LEVEL_UP": f"Level {level}",
                     "DAILY_GOAL_COMPLETED": "Complete 5 Questions"}[kind]
            act_rows.append((u5("act", s["id"], a), s["id"], kind, title,
                             rng.choice(SUBJECTS) if kind in ("QUIZ_COMPLETED", "BATTLE_WON") else None,
                             rng.randint(60, 100) if kind == "QUIZ_COMPLETED" else None,
                             rng.choice([10, 15, 20, 25]), days_ago(rng.uniform(0, 3))))
    gam.insert("user_xp", ["id", "user_id", "total_xp", "level", "season_start", "updated_at"], xp_rows)
    gam.insert("user_streaks",
               ["id", "user_id", "current_streak", "longest_streak", "last_activity_date",
                "freeze_count", "freeze_used_date"], streak_rows)
    gam.insert("user_edupoints",
               ["id", "user_id", "balance", "total_earned", "total_spent", "updated_at"], ep_rows)
    gam.insert("user_badges", ["id", "user_id", "badge_type", "earned_at"], badge_rows)
    gam.insert("activity_feed",
               ["id", "user_id", "activity_type", "title", "subject", "score_pct",
                "xp_earned", "created_at"], act_rows)

    # notification_db ----------------------------------------------------------
    noti = SqlFile("notification")
    templates = [
        ("streak_reminder", "🔥 Don't lose your streak", "You are one quiz away from your streak."),
        ("daily_goal_reminder", "🎯 Today's Goal", "Complete 5 Questions to earn 15 XP!"),
        ("friend_activity", "👀 {name} scored 95% in Biology Quiz", "Tap to see the leaderboard."),
        ("battle_reminder", "⚔️ Battle starting soon", "Your Physics battle starts in a few minutes."),
        ("revision_reminder", "📚 Revision time", "Revise today's chapter to stay ahead!"),
        ("quiz_result", "Quiz scored!", "You scored 85% in your Science quiz."),
        ("badge_unlocked", "🏅 Badge unlocked", "You earned the Streak 7 badge!"),
        ("weekly_report", "Your weekly report is ready!", "See how you performed this week."),
        ("payment_success", "Payment successful", "Your Premium subscription is now active."),
        ("announcement", "📢 New feature", "Study Parties are live — watch and quiz together!"),
    ]
    notif_rows = []
    for i in range(S["notifs"]):
        s = students[i % len(students)]
        tpl, title, body = templates[i % len(templates)]
        title = title.replace("{name}", rng.choice(FIRST_M + FIRST_F))
        notif_rows.append((u5("notif", i), s["id"], "PUSH", title, body,
                           rng.choice(["PENDING", "SENT", "SENT"]), tpl,
                           rng.random() < 0.6, days_ago(rng.uniform(0, 30))))
    noti.insert("notifications",
                ["id", "user_id", "type", "title", "body", "status", "template",
                 "is_read", "created_at"], notif_rows)
    pref_rows = [(u5("pref", s["id"]), s["id"]) + (True,) * 18 + (days_ago(30), True, True, True)
                 for s in students]
    noti.insert("notification_preferences",
                ["id", "user_id",
                 "in_app_new_video", "in_app_quiz_result", "in_app_battle_invite",
                 "in_app_streak_reminder", "in_app_badge_unlocked", "in_app_promotional",
                 "email_new_video", "email_quiz_result", "email_battle_invite",
                 "email_streak_reminder", "email_badge_unlocked", "email_promotional",
                 "whatsapp_new_video", "whatsapp_quiz_result", "whatsapp_battle_invite",
                 "whatsapp_streak_reminder", "whatsapp_badge_unlocked", "whatsapp_promotional",
                 "updated_at",
                 "in_app_daily_goal_reminder", "in_app_friend_activity", "in_app_revision_reminder"],
                pref_rows)

    # referral_db ---------------------------------------------------------------
    ref = SqlFile("referral")
    code_rows, ref_rows = [], []
    n_codes = max(10, len(students) // 5)
    for i in range(n_codes):
        s = students[i]
        code_rows.append((u5("refcode", s["id"]), s["id"], f"SEED{i:05d}", 0, 0, s["created"]))
    n_refs = max(5, len(students) // 10)
    for i in range(n_refs):
        referrer = students[i % n_codes]
        referred = students[(i * 7 + n_codes) % len(students)]
        if referrer["id"] == referred["id"]:
            continue
        qualified = i % 2 == 0
        ref_rows.append((u5("ref", i), referrer["id"], referred["id"], f"SEED{i % n_codes:05d}",
                         "QUALIFIED" if qualified else "PENDING", True, True, qualified, qualified,
                         days_ago(rng.uniform(1, 60)) if qualified else None,
                         days_ago(rng.uniform(1, 90))))
    ref.insert("referral_codes",
               ["id", "user_id", "code", "total_referrals", "qualified_referrals", "created_at"],
               code_rows)
    ref.insert("referrals",
               ["id", "referrer_id", "referred_id", "referral_code", "status",
                "signup_completed", "email_verified", "video_watched", "quiz_completed",
                "qualified_at", "created_at"], ref_rows)
    ref.raw("UPDATE referral_codes rc SET total_referrals = sub.c, qualified_referrals = sub.q "
            "FROM (SELECT referral_code, COUNT(*) c, COUNT(*) FILTER (WHERE status='QUALIFIED') q "
            "FROM referrals GROUP BY referral_code) sub WHERE rc.code = sub.referral_code;")

    # battle_db ------------------------------------------------------------------
    bat = SqlFile("battle")
    b_rows, bp_rows, bs_rows = [], [], []
    for i in range(S["battles"]):
        creator = students[(i * 11) % len(students)]
        btype = rng.choice(["SOLO", "ONE_V_ONE", "GROUP", "PUBLIC", "SUBJECT"])
        bid = u5("battle", i)
        finished = days_ago(rng.uniform(0.5, 60))
        n_players = {"SOLO": 1, "ONE_V_ONE": 2}.get(btype, rng.randint(3, 6))
        b_rows.append((bid, btype, "COMPLETED", rng.choice(SUBJECTS), "medium", 10, 300,
                       max(2, n_players), creator["id"], f"SEED{i:04d}"[:8], 0, 0, 0,
                       finished - timedelta(minutes=15), finished - timedelta(minutes=12),
                       finished))
        for p_i in range(n_players):
            player = students[(i * 11 + p_i * 3) % len(students)]
            score = rng.randint(200, 950)
            bp_rows.append((u5("bp", bid, p_i), bid, player["id"], player["name"], False, False,
                            "FINISHED", score, rng.randint(3, 10), rng.randint(0, 5),
                            round(rng.uniform(40, 100), 1), rng.randint(60, 280), p_i + 1,
                            rng.choice([20, 40, 60]), finished))
    bat.insert("battles",
               ["id", "battle_type", "status", "subject", "difficulty", "question_count",
                "time_limit_sec", "max_players", "host_user_id", "invite_code",
                "team_a_score", "team_b_score", "spectator_count",
                "created_at", "started_at", "ended_at"], b_rows)
    bat.insert("battle_participants",
               ["id", "battle_id", "user_id", "display_name", "is_ai", "is_spectator",
                "status", "score", "correct", "wrong", "accuracy", "time_taken_sec",
                "rank", "xp_earned", "finished_at"], bp_rows)
    for idx, s in enumerate(students[:max(20, len(students) // 5)]):
        played = rng.randint(1, 40)
        won = rng.randint(0, played)
        bs_rows.append((u5("bstat", s["id"]), s["id"], played, won, rng.randint(0, 3000),
                        won * 40, rng.randint(0, min(won, 5)), rng.randint(0, min(won, 8)),
                        days_ago(1)))
    bat.insert("battle_stats",
               ["id", "user_id", "battles_played", "battles_won", "total_score",
                "total_xp_earned", "win_streak", "best_win_streak", "updated_at"], bs_rows)

    # analytics_db ----------------------------------------------------------------
    ana = SqlFile("analytics")
    prog_rows, weak_rows = [], []
    flagship_subjects = [x for x in all_subject_ids if x[1] == "CBSE" and x[2] == 10]
    for s in students[:min(len(students), 1000)]:
        for (sid, _, _, sname) in rng.sample(flagship_subjects, k=min(3, len(flagship_subjects))):
            chaps = [c for c in flagship_chaps if c[1] == sid][:3]
            for (chid, *_rest) in [(c[0],) for c in chaps]:
                prog_rows.append((u5("prog", s["id"], chid), s["id"], sid, chid,
                                  rng.randint(0, 10), rng.randint(0, 5),
                                  round(rng.uniform(30, 98), 1), round(rng.uniform(5, 100), 1),
                                  days_ago(rng.uniform(0, 20))))
    for s in students[:min(len(students), 500)]:
        for tid in rng.sample(all_topics, k=min(4, len(all_topics))):
            attempts = rng.randint(2, 20)
            correct = rng.randint(0, attempts)
            weak_rows.append((u5("weak", s["id"], tid), s["id"], tid, attempts, correct,
                              round(correct / attempts * 100, 1), days_ago(rng.uniform(0, 20))))
    ana.insert("student_progress",
               ["id", "user_id", "subject_id", "chapter_id", "videos_watched",
                "quizzes_completed", "avg_quiz_score", "completion_percentage", "updated_at"],
               prog_rows)
    ana.insert("weak_topic_analysis",
               ["id", "user_id", "topic_id", "attempts", "correct_answers", "accuracy",
                "updated_at"], weak_rows)

    # payment_db (coupons only — plans are service-seeded) -------------------------
    pay = SqlFile("payment")
    coupon_rows = [
        (u5("coupon", "WELCOME50"), "WELCOME50", "percent", 50, '["monthly"]', 1000, 0,
         NOW + timedelta(days=90), True, days_ago(30)),
        (u5("coupon", "FIRST100"), "FIRST100", "flat", 100, '["monthly","quarterly"]', 500, 0,
         NOW + timedelta(days=60), True, days_ago(30)),
        (u5("coupon", "SUMMER25"), "SUMMER25", "percent", 25, '["quarterly","annual"]', 2000, 0,
         NOW + timedelta(days=45), True, days_ago(10)),
        (u5("coupon", "REFER200"), "REFER200", "flat", 200, '["annual"]', 300, 0,
         NOW + timedelta(days=120), True, days_ago(5)),
    ]
    pay.insert("coupons",
               ["id", "code", "discount_type", "discount_value", "applicable_plans",
                "max_uses", "used_count", "expires_at", "is_active", "created_at"], coupon_rows)
    pay.raw("UPDATE coupons SET applicable_plans = applicable_plans::jsonb;")

    # ── Write + apply ─────────────────────────────────────────────────────────
    files = {
        "auth": auth, "user": usr, "content": con, "quiz": qz, "gamification": gam,
        "notification": noti, "referral": ref, "battle": bat, "analytics": ana, "payment": pay,
    }
    only = set(args.only.split(",")) if args.only else set(files)
    total_rows = 0
    for name, f in files.items():
        if name not in only:
            continue
        path = f.write()
        n_rows = sum(s.count("\n(") + (1 if s.startswith("INSERT") else 0) - (1 if s.startswith("INSERT") else 0)
                     for s in f.stmts)
        n_vals = sum(s.count("),\n(") + 1 for s in f.stmts if s.startswith("INSERT"))
        total_rows += n_vals
        print(f"  {name:14s} → {path.name:18s} ({n_vals} rows)")
        if not args.dry_run:
            envf = REPO / "services" / f"{name}_service" / ".env"
            env = dict(l.split("=", 1) for l in envf.read_text().splitlines()
                       if "=" in l and not l.startswith("#"))
            r = subprocess.run(
                ["docker", "exec", "-i", f"{name}_service_postgres", "psql",
                 "-U", env["POSTGRES_USER"].strip(), "-d", env["POSTGRES_DB"].strip(),
                 "-v", "ON_ERROR_STOP=1", "-q"],
                stdin=path.open(), capture_output=True, text=True)
            if r.returncode != 0:
                print(f"  !! {name} FAILED:\n{r.stderr[-2000:]}", file=sys.stderr)
                sys.exit(1)
    print(f"Done — ~{total_rows} rows {'generated' if args.dry_run else 'applied'} "
          f"at scale '{args.scale}'. All seeded accounts use password Seed@123")


if __name__ == "__main__":
    main()
