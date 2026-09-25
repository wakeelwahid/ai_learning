#!/usr/bin/env python3
"""Companion seeder for the two DBs tools/seed/seed.py doesn't cover:
career_service and ai_service.

Follows the same conventions as seed.py — deterministic uuid5 ids, seeded RNG,
ON CONFLICT DO NOTHING (idempotent, safe to re-run), applied via
`docker exec <svc>_service_postgres psql`.

Career ids are read live from career_db (the catalog self-seeds with random
uuid4 ids on service startup), and chapter ids for ai_content are read live
from content_db, so run this AFTER the stack is up and seed.py has run.

Usage:
    python3 tools/seed/seed_career_ai.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
OUT = Path(__file__).parent / "out"
REPO = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 7, 3, 12, 0, 0, tzinfo=timezone.utc)  # same anchor as seed.py
rng = random.Random(42)


def u5(*parts: object) -> str:
    return str(uuid.uuid5(NS, "edulearn-seed:" + ":".join(str(p) for p in parts)))


def q(val: object) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, (datetime, date)):
        return f"'{val.isoformat()}'"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def jd(val: object) -> str:
    """JSON-dump for a JSONB column."""
    return json.dumps(val)


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

    def write(self) -> Path:
        self.stmts.append("COMMIT;")
        path = OUT / f"{self.name}.sql"
        path.write_text("\n".join(self.stmts))
        return path


def db_env(service: str) -> dict:
    envf = REPO / "services" / f"{service}_service" / ".env"
    return dict(l.split("=", 1) for l in envf.read_text().splitlines()
                if "=" in l and not l.startswith("#"))


def db_query(service: str, sql: str) -> list[list[str]]:
    env = db_env(service)
    r = subprocess.run(
        ["docker", "exec", f"{service}_service_postgres", "psql",
         "-U", env["POSTGRES_USER"].strip(), "-d", env["POSTGRES_DB"].strip(),
         "-t", "-A", "-F", "|", "-c", sql],
        capture_output=True, text=True)
    if r.returncode != 0:
        print(f"query failed on {service}: {r.stderr}", file=sys.stderr)
        sys.exit(1)
    return [line.split("|") for line in r.stdout.strip().splitlines() if line.strip()]


def apply(service: str, path: Path) -> None:
    env = db_env(service)
    r = subprocess.run(
        ["docker", "exec", "-i", f"{service}_service_postgres", "psql",
         "-U", env["POSTGRES_USER"].strip(), "-d", env["POSTGRES_DB"].strip(),
         "-v", "ON_ERROR_STOP=1", "-q"],
        stdin=path.open(), capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  !! {service} FAILED:\n{r.stderr[-2000:]}", file=sys.stderr)
        sys.exit(1)


OPPORTUNITIES = [
    # (category enum NAME, subcategory, title, organization, posts, qualification,
    #  age_min, age_max, sal_min, sal_max, fee, last_in_days, exam_in_days, featured,
    #  selection_process, url)
    ("GOVERNMENT_JOBS", "defence", "NDA & NA Examination (II) 2026", "UPSC", 400,
     "Class 12 pass (PCM for Air Force/Navy)", 16, 19, 56100, 177500, 100, 45, 90, True,
     ["Written Exam", "SSB Interview", "Medical Examination"], "https://upsc.gov.in"),
    ("GOVERNMENT_JOBS", "ssc", "SSC CHSL 2026 (10+2 Level)", "Staff Selection Commission", 3712,
     "Class 12 pass from a recognised board", 18, 27, 25500, 81100, 100, 60, 120, True,
     ["Tier-I CBT", "Tier-II CBT", "Document Verification"], "https://ssc.nic.in"),
    ("GOVERNMENT_JOBS", "railways", "RRB NTPC Under Graduate 2026", "Railway Recruitment Board", 3445,
     "Class 12 pass", 18, 30, 19900, 63200, 250, 75, 150, False,
     ["CBT-1", "CBT-2", "Typing Skill Test", "Medical"], "https://rrbapply.gov.in"),
    ("SCHOLARSHIPS", "merit", "NTSE Stage-1 2026", "NCERT", None,
     "Class 10 students with 60%+ in Class 9", None, None, None, None, 0, 50, 95, True,
     ["MAT + SAT Written", "Stage-2 National"], "https://ncert.nic.in"),
    ("SCHOLARSHIPS", "research", "INSPIRE Scholarship (SHE) 2026", "DST, Govt of India", 12000,
     "Top 1% in Class 12 board, pursuing BSc/BS", 17, 22, 80000, 80000, 0, 80, None, False,
     ["Merit-based shortlist", "Document Verification"], "https://online-inspire.gov.in"),
    ("SCHOLARSHIPS", "minority", "National Means-cum-Merit Scholarship", "MoE", 100000,
     "Class 8 students, family income < 3.5L", None, None, 12000, 12000, 0, 40, 85, False,
     ["State-level MAT + SAT"], "https://scholarships.gov.in"),
    ("ENTRANCE_EXAMS", "engineering", "JEE Main 2027 Session 1", "NTA", None,
     "Class 12 (PCM) appearing/passed", None, None, None, None, 1000, 100, 160, True,
     ["Computer Based Test", "JoSAA Counselling"], "https://jeemain.nta.nic.in"),
    ("ENTRANCE_EXAMS", "medical", "NEET-UG 2027", "NTA", None,
     "Class 12 (PCB) appearing/passed", 17, None, None, None, 1700, 110, 170, True,
     ["Pen & Paper Test", "MCC Counselling"], "https://neet.nta.nic.in"),
    ("ENTRANCE_EXAMS", "law", "CLAT 2027", "Consortium of NLUs", None,
     "Class 12 with 45%+", None, None, None, None, 4000, 95, 155, False,
     ["Computer Based Test", "Centralised Counselling"], "https://consortiumofnlus.ac.in"),
    ("INTERNSHIPS", "research", "ISRO Young Scientist Programme (YUVIKA)", "ISRO", 350,
     "Class 9 students", 13, 16, None, None, 0, 35, None, True,
     ["Online Application", "Merit Shortlist"], "https://isro.gov.in"),
    ("INTERNSHIPS", "tech", "Google Code-in Style Winter Internship", "EduLearn Partners", 50,
     "Class 11-12, basic Python", 15, 18, 5000, 15000, 0, 55, None, False,
     ["Coding Challenge", "Interview"], "https://example.org/winter-internship"),
    ("OLYMPIADS", "maths", "International Mathematical Olympiad — INMO Stage", "HBCSE", None,
     "Qualified IOQM candidates", None, None, None, None, 0, 65, 120, True,
     ["IOQM", "INMO", "IMOTC Camp"], "https://olympiads.hbcse.tifr.res.in"),
    ("OLYMPIADS", "science", "National Science Olympiad 2026", "SOF", None,
     "Classes 1-12", None, None, None, None, 150, 70, 125, False,
     ["School Round", "Zonal Round", "International Round"], "https://sofworld.org"),
    ("OLYMPIADS", "informatics", "Zonal Informatics Olympiad 2027", "IARCS", None,
     "School students up to Class 12", None, None, None, None, 200, 85, 140, False,
     ["ZIO/ZCO", "INOI", "IOITC"], "https://www.iarcs.org.in"),
    ("GOVERNMENT_JOBS", "banking", "IBPS Clerk CRP-XVI", "IBPS", 6128,
     "Graduate in any discipline", 20, 28, 19900, 47920, 850, 52, 105, False,
     ["Prelims", "Mains", "Provisional Allotment"], "https://ibps.in"),
]

AI_QUESTION_BANK = [
    ("Which mirror is used as a rear-view mirror in vehicles?",
     ["a) Plane mirror", "b) Concave mirror", "c) Convex mirror", "d) Parabolic mirror"], "c",
     "Convex mirrors give an erect, diminished image with a wide field of view."),
    ("The focal length of a spherical mirror of radius of curvature 30 cm is:",
     ["a) 60 cm", "b) 30 cm", "c) 15 cm", "d) 7.5 cm"], "c",
     "f = R/2 = 30/2 = 15 cm."),
    ("Light bends towards the normal when it travels from:",
     ["a) Rarer to denser medium", "b) Denser to rarer medium", "c) Any two media", "d) It never bends"], "a",
     "Speed decreases in the denser medium, bending the ray towards the normal."),
    ("The SI unit of power of a lens is:",
     ["a) Watt", "b) Dioptre", "c) Metre", "d) Candela"], "b",
     "Power = 1/f(in metres), measured in dioptres (D)."),
    ("An object placed at 2F of a convex lens forms an image that is:",
     ["a) Same size, real, inverted", "b) Magnified, virtual", "c) Diminished, real", "d) No image"], "a",
     "At 2F the image forms at 2F on the other side, same size, real and inverted."),
    ("x² - 5x + 6 = 0 has roots:",
     ["a) 2 and 3", "b) -2 and -3", "c) 1 and 6", "d) -1 and -6"], "a",
     "Factorise: (x-2)(x-3) = 0."),
    ("The sum of first 10 natural numbers is:",
     ["a) 45", "b) 50", "c) 55", "d) 60"], "c",
     "n(n+1)/2 = 10×11/2 = 55."),
    ("The distance between points (0,0) and (3,4) is:",
     ["a) 5", "b) 7", "c) 12", "d) 25"], "a",
     "√(3² + 4²) = √25 = 5."),
    ("HCF of 12 and 18 is:",
     ["a) 2", "b) 3", "c) 6", "d) 36"], "c",
     "12 = 2²×3, 18 = 2×3² → HCF = 2×3 = 6."),
    ("If sin θ = 3/5, then cos θ equals:",
     ["a) 4/5", "b) 3/4", "c) 5/4", "d) 5/3"], "a",
     "cos θ = √(1 - 9/25) = 4/5."),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    students = [dict(id=u5("student", i)) for i in range(500)]  # medium-scale ids from seed.py

    # ── career_db ─────────────────────────────────────────────────────────────
    careers = db_query("career", "SELECT id, slug FROM careers WHERE is_active ORDER BY slug")
    if not careers:
        print("No careers found — is career_service running?", file=sys.stderr)
        sys.exit(1)

    car = SqlFile("career")

    opp_rows = []
    for (cat, sub, title, org, posts, qual, amin, amax, smin, smax, fee,
         last_d, exam_d, featured, process, url) in OPPORTUNITIES:
        opp_rows.append((
            u5("opp", title), cat, sub, title, org,
            f"{title} — official notification released by {org}. Apply online before the last date.",
            posts, qual, amin, amax, smin, smax, fee,
            (NOW + timedelta(days=last_d)).date(),
            (NOW + timedelta(days=exam_d)).date() if exam_d else None,
            jd(process), url, True, featured, NOW - timedelta(days=10),
        ))
    car.insert("opportunities",
               ["id", "category", "subcategory", "title", "organization", "description",
                "total_posts", "qualification", "age_min", "age_max", "salary_min",
                "salary_max", "application_fee", "last_date", "exam_date",
                "selection_process", "official_url", "is_active", "is_featured", "created_at"],
               opp_rows)

    goal_rows, assess_rows = [], []
    for i, s in enumerate(students[:80]):
        picks = rng.sample(careers, k=rng.randint(1, 2))
        for j, (cid, slug) in enumerate(picks):
            goal_rows.append((
                u5("cgoal", s["id"], cid), s["id"], cid,
                round(rng.uniform(5, 85), 1), j == 0,
                f"Working towards {slug.replace('-', ' ')}" if j == 0 else None,
                NOW - timedelta(days=rng.uniform(1, 120)), NOW - timedelta(days=rng.uniform(0, 5)),
            ))
        # skill assessment on the primary career for the first 50 students
        if i < 50:
            cid, slug = picks[0]
            score = round(rng.uniform(30, 90), 1)
            assess_rows.append((
                u5("assess", s["id"], cid), s["id"], cid, score,
                jd({"aptitude": round(rng.uniform(30, 95)), "subject_knowledge": round(rng.uniform(30, 95)),
                    "problem_solving": round(rng.uniform(30, 95)), "communication": round(rng.uniform(30, 95))}),
                jd(["Advanced problem solving", "Time management"] if score < 60 else ["Mock-test consistency"]),
                jd([f"Practice {slug.replace('-', ' ')} aptitude sets weekly",
                    "Complete the recommended chapter quizzes"]),
                jd([{"step": 1, "title": "Master core subjects", "done": score > 50},
                    {"step": 2, "title": "Attempt mock tests", "done": score > 70},
                    {"step": 3, "title": "Apply for entrance exams", "done": False}]),
                NOW - timedelta(days=rng.uniform(0, 30)),
            ))
    car.insert("career_goals",
               ["id", "user_id", "career_id", "progress", "is_primary", "notes",
                "created_at", "updated_at"], goal_rows)
    car.insert("skill_assessments",
               ["id", "user_id", "career_id", "ready_score", "skill_scores", "gaps",
                "recommendations", "learning_path", "assessed_at"], assess_rows)

    # ── ai_db ─────────────────────────────────────────────────────────────────
    chapters = db_query(
        "content",
        "SELECT ch.id, ch.title, s.name, cl.number, b.name FROM chapters ch "
        "JOIN subjects s ON s.id = ch.subject_id JOIN classes cl ON cl.id = s.class_id "
        "JOIN boards b ON b.id = cl.board_id WHERE s.name IN ('Science','Mathematics') "
        "AND cl.number = 10 ORDER BY ch.title LIMIT 6")

    ai = SqlFile("ai")

    paper_rows, item_rows = [], []
    paper_specs = [
        ("quiz_paper",     "quiz",      "Quiz Paper", "medium", 20, 30),
        ("revision_paper", "questions", "Revision Paper", "mixed", 40, 60),
        ("practice_paper", "questions", "Practice Paper", "easy", 25, 45),
        ("mock_test",      "custom",    "Mock Test", "hard", 80, 180),
    ]
    for ch_id, ch_title, subj, cls, board in chapters[:4]:
        for ptype, feature, label, diff, marks, dur in paper_specs:
            pid = u5("paper", ch_id, ptype)
            qs = rng.sample(AI_QUESTION_BANK, k=5)
            content = {"sections": [{
                "name": "Section A — MCQ",
                "questions": [
                    {"question": t, "options": opts, "correct_option": c, "explanation": e, "marks": marks // 5}
                    for t, opts, c, e in qs
                ],
            }]}
            paper_rows.append((
                pid, ptype, board, int(cls), subj, ch_title, None,
                f"{label}: {ch_title} (Class {cls} {subj})", diff, marks, dur,
                jd(content), "ollama_local", None, "PUBLISHED", True,
                NOW - timedelta(days=rng.uniform(1, 20)),
            ))
            for t, opts, c, e in qs:
                item_rows.append((
                    u5("qitem", pid, t), feature, t, jd(opts), c,
                    next(o for o in opts if o.startswith(f"{c})")), e,
                    board, int(cls), subj, ch_title, pid,
                    NOW - timedelta(days=rng.uniform(1, 20)),
                ))
    ai.insert("generated_papers",
              ["id", "paper_type", "board", "class_num", "subject", "chapter", "topic",
               "title", "difficulty", "total_marks", "duration_min", "content",
               "generated_by", "source_job_id", "status", "verified", "created_at"],
              paper_rows)
    ai.insert("question_items",
              ["id", "feature", "question", "options", "correct_option", "answer",
               "explanation", "board", "class_num", "subject", "chapter", "paper_id",
               "created_at"], item_rows)

    content_rows = []
    for ch_id, ch_title, subj, cls, board in chapters:
        for ctype, title, body in [
            ("notes", f"AI Notes — {ch_title}",
             f"# {ch_title}\n\nKey concepts for Class {cls} {subj}:\n\n"
             "1. Core definitions and laws with worked examples.\n"
             "2. Common exam patterns and mistakes to avoid.\n"
             "3. Quick-revision formula sheet."),
            ("questions", f"Important Questions — {ch_title}",
             "\n".join(f"Q{n + 1}. {t}" for n, (t, *_rest) in enumerate(rng.sample(AI_QUESTION_BANK, k=5)))),
            ("practice", f"Practice Set — {ch_title}",
             "\n".join(f"{n + 1}. {t} [Ans: {c}]" for n, (t, _o, c, _e) in enumerate(rng.sample(AI_QUESTION_BANK, k=5)))),
        ]:
            content_rows.append((
                u5("aicontent", ch_id, ctype), ch_id, ctype, title, body,
                rng.choice(["easy", "medium", "hard"]), False, 0,
                NOW - timedelta(days=rng.uniform(1, 15)), NOW - timedelta(days=rng.uniform(0, 1)),
            ))
    ai.insert("ai_content",
              ["id", "chapter_id", "content_type", "title", "content", "difficulty",
               "qdrant_indexed", "chunks_indexed", "created_at", "updated_at"], content_rows)

    usage_rows = []
    for i, s in enumerate(students[:40]):
        for feature in rng.sample(["questions", "quiz", "paper", "custom"], k=rng.randint(1, 3)):
            d = (NOW - timedelta(days=rng.randint(0, 6))).date()
            usage_rows.append((
                u5("aiusage", s["id"], feature, d.isoformat()), s["id"], feature, d,
                jd({"subject": rng.choice(["Science", "Mathematics"]), "class": 10}),
                NOW - timedelta(days=rng.uniform(0, 6)),
            ))
    ai.insert("ai_usage_log",
              ["id", "user_id", "feature", "used_date", "request_params", "created_at"],
              usage_rows)

    job_rows = [
        (u5("ingest", 0), "cbse10_science_light.pdf", "https://files.edulearn.test/cbse10_science_light.pdf",
         "pdf", 2_411_000, "syllabus", "school_subjects", "CBSE", 10, "Science",
         "Light - Reflection and Refraction", None, "pdf", "COMPLETED", 48, "seed-worker",
         NOW - timedelta(days=12), NOW - timedelta(days=12, hours=-1), NOW - timedelta(days=12, hours=-2)),
        (u5("ingest", 1), "cbse10_maths_quadratics.docx", "https://files.edulearn.test/cbse10_maths_quadratics.docx",
         "docx", 894_000, "syllabus", "school_subjects", "CBSE", 10, "Mathematics",
         "Quadratic Equations", None, "notes", "COMPLETED", 22, "seed-worker",
         NOW - timedelta(days=8), NOW - timedelta(days=8, hours=-1), NOW - timedelta(days=8, hours=-2)),
        (u5("ingest", 2), "current_affairs_july.pdf", "https://files.edulearn.test/current_affairs_july.pdf",
         "pdf", 1_204_000, "current_affairs", "general_knowledge", None, None, None,
         None, None, "question_bank", "PENDING", 0, None,
         NOW - timedelta(days=1), None, None),
    ]
    ai.insert("ingestion_jobs",
              ["id", "file_name", "file_url", "file_type", "file_size", "content_type",
               "collection", "board", "class_num", "subject", "chapter", "topic",
               "document_type", "status", "chunks_indexed", "worker_id",
               "created_at", "started_at", "completed_at"], job_rows)

    # ── content_db: video_progress (Continue Watching / resume points) ────────
    # The main seeder skips this table; without it Continue Watching is empty
    # on the web + mobile dashboards and no video has a resume position.
    videos = db_query("content", "SELECT id, duration_seconds FROM videos WHERE is_active LIMIT 40")
    con = SqlFile("content_progress")
    vp_rows = []
    for s in students[:60]:
        for vid, dur in rng.sample(videos, k=min(rng.randint(2, 5), len(videos))):
            dur = int(dur or 300)
            done = rng.random() < 0.4
            watched = dur if done else int(dur * rng.uniform(0.1, 0.85))
            vp_rows.append((
                u5("vprog", s["id"], vid), s["id"], vid, watched, watched, done,
                round(100.0 if done else watched * 100.0 / dur, 1),
                "completed" if done else "paused", 0 if done else watched,
                None if done else NOW - timedelta(days=rng.uniform(0, 10)),
                None, NOW - timedelta(days=rng.uniform(0, 10)),
            ))
    con.insert("video_progress",
               ["id", "user_id", "video_id", "watched_seconds", "actual_watched_seconds",
                "is_completed", "completion_percentage", "status", "last_position_seconds",
                "paused_at", "resumed_at", "updated_at"], vp_rows)

    # ── write + apply ─────────────────────────────────────────────────────────
    for svc, f in (("career", car), ("ai", ai), ("content", con)):
        path = f.write()
        n = sum(s.count("),\n(") + 1 for s in f.stmts if s.startswith("INSERT"))
        print(f"  {svc:8s} → {path.name:12s} ({n} rows)")
        if not args.dry_run:
            apply(svc, path)
    print("Done — career + ai seeded (idempotent, re-run safe).")


if __name__ == "__main__":
    main()
