"""Seed realistic activity for wakeel's family — a real, manually-created
parent account used for Parent-UI testing, with two linked students:

  Parent:  wakeel   (+919999999999, id 367fa151-db13-477d-8b8c-31e5f78d2c92)
  Student: saqib    (+919999999997, id d45f3d57-bda1-4e8a-b22b-aaa276d774e8,
                      CBSE class 10) — strong Math, weak History, consistent
  Student: vikash   (+919999999998, id d94d31aa-3b43-4ecf-9b7f-490be10594c2,
                      CBSE class 10) — strong Science, weak English, erratic

Both parent_profiles links (parent_user_id -> student_user_id, approved)
were created explicitly by this project's own tooling before this script —
see the link INSERT this script also re-asserts idempotently below, so a
fresh run never depends on it having been run by hand beforehand.

This student's quiz_attempts started at zero (unlike seed_parent_rag_demo.py's
family, which already had base-seeded attempts to re-score) — attempts are
created from scratch here. Also seeds `student_progress` (analytics_service),
which neither this script's earlier version nor seed_parent_rag_demo.py
populated — that table is the sole backend source for the Parent Dashboard's
"Exam Readiness Score" tab (services/analytics_service/app/services/
parent_summary.py's exam_readiness computation reads student_progress.
avg_quiz_score and .completion_percentage, keyed by subject_id + chapter_id
resolved against content_service's real CBSE-class-10 curriculum).

Writes to five databases (user, quiz, battle, gamification, analytics) over
psql — seed tooling, not application code, so the no-raw-SQL rule
(services/*/app only) doesn't apply here.

Idempotent: every insert is keyed on a deterministic uuid5 (or a real unique
constraint), so re-running updates instead of duplicating.

Usage:  python3 tools/seed/seed_saqib_family.py
"""
from __future__ import annotations

import random
import subprocess
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

NS = uuid.UUID("6f1d1b1e-9a1b-4c3d-8e5f-saqibfamily0".replace("saqibfamily0", "a1b2c3d4e5f6"))

PARENT_ID = "367fa151-db13-477d-8b8c-31e5f78d2c92"
BOARD = "CBSE"           # quiz_service's own board string (quizzes.board) — unrelated to content_service's board rows below
CLASS_NUM = 10

# quiz_service's quizzes.subject_name taxonomy ("Math", "Science", ...) — used
# for picking real quizzes so quiz_attempts (and the Quiz stats / battle
# subjects) stay realistic. Kept distinct from CONTENT_SUBJECT_CHAPTER below
# on purpose: they are two independent, unrelated subject taxonomies (quiz_
# service has no FK to content_service's subjects table), confirmed by psql —
# quiz_service's "Math"/"History"/etc. do not correspond 1:1 to content_
# service's subject rows or ids in this dataset.
QUIZ_SUBJECTS = ["Math", "Science", "English", "Physics", "Chemistry", "Biology", "History", "Geography", "Computer"]

# content_service's REAL subject_id -> chapter_id for the CBSE-class-10 tree
# the mobile app actually resolves against (ParentDashboardScreen.tsx's
# subjectNameById chain: getBoards -> match board.code, then getClasses ->
# match class.number, then getSubjects(classId)). There were TWO different
# "CBSE" board rows in content_service with different codes ("cbse" vs
# "CBSE") and completely separate class/subject trees — confirmed by psql;
# the mobile app's case-insensitive code match resolves to the "cbse"
# (lowercase) board, so subject_progress rows MUST use ITS subject tree
# (Mathematics/Science/Social Science/English/Hindi), not the other CBSE
# board's Math/Physics/Chemistry/... tree quiz_service happens to share a
# board string with. A previous version of this script used the wrong tree,
# which silently emptied the Subject Performance / Exam Readiness cards —
# subjectNameById[subj.subject_id] simply never matched, so resolvedSubjects
# filtered everything out with no error.
#
# Social Science / English / Hindi had zero chapters in this dataset — this
# script creates one placeholder "Chapter 1" for each so student_progress's
# NOT NULL chapter_id has something real to point at (see ensure_chapters()).
CONTENT_SUBJECT_CHAPTER: dict[str, str] = {
    "Mathematics":     "f1635712-7f4a-488a-b353-9589f5fff1a8",
    "Science":         "ac8c8b2a-feea-4dee-b7b4-c9e03624f75b",
    "Social Science":  "2fc4f637-4596-4958-8892-7be606306d85",
    "English":         "4d7dde49-6ecd-43f2-b67f-1f5aaad5f947",
    "Hindi":           "fc42e747-62f4-461d-b02b-7cd1280df60c",
}
# Maps each content_service subject name onto the closest quiz_service
# subject name, so a student's "strong"/"weak" quiz-score profile (computed
# against QUIZ_SUBJECTS) still lines up sensibly with their Subject
# Performance / Exam Readiness card (computed against CONTENT_SUBJECT_CHAPTER).
CONTENT_TO_QUIZ_SUBJECT = {
    "Mathematics": "Math", "Science": "Science", "Social Science": "History",
    "English": "English", "Hindi": "English",
}


@dataclass
class Student:
    user_id: str
    name: str
    strong: str
    weak: str
    strong_avg: int
    weak_avg: int
    other_avg: int
    study_days: int          # of the last 45, how many were active
    daily_minutes: tuple[int, int]
    battles: int
    win_rate: float
    subjects: list[str] = field(default_factory=lambda: list(QUIZ_SUBJECTS))


STUDENTS = [
    Student(
        user_id="d45f3d57-bda1-4e8a-b22b-aaa276d774e8", name="saqib",
        strong="Math", weak="History",
        strong_avg=84, weak_avg=44, other_avg=65,
        study_days=32, daily_minutes=(25, 90),
        battles=9, win_rate=0.56,
    ),
    Student(
        user_id="d94d31aa-3b43-4ecf-9b7f-490be10594c2", name="vikash",
        strong="Science", weak="English",
        strong_avg=79, weak_avg=36, other_avg=58,
        study_days=19, daily_minutes=(15, 70),
        battles=5, win_rate=0.4,
    ),
]


def psql(db_container: str, sql: str) -> str:
    proc = subprocess.run(
        ["docker", "exec", "-i", db_container,
         "psql", "-U", "edtech_user", "-d", "edtech_user", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{db_container}: {proc.stderr.strip()}")
    return proc.stdout


def det_id(*parts: str) -> str:
    return str(uuid.uuid5(NS, ":".join(parts)))


def q(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def rows_sql(table: str, cols: list[str], rows: list[tuple], conflict: str, update: list[str]) -> str:
    values = ",\n".join("(" + ",".join(q(v) for v in row) + ")" for row in rows)
    sets = ", ".join(f"{c}=EXCLUDED.{c}" for c in update)
    return (f"INSERT INTO {table} ({','.join(cols)}) VALUES\n{values}\n"
            f"ON CONFLICT {conflict} DO UPDATE SET {sets};")


def seed_parent_link(student: Student) -> None:
    """Explicit, idempotent parent<->child link so a fresh run of this script
    never depends on the link having been created by hand beforehand."""
    psql("user_service_postgres", rows_sql(
        "parent_profiles",
        ["id", "parent_user_id", "student_user_id", "relationship",
         "approval_required", "is_approved", "created_at"],
        [(det_id("plink", PARENT_ID, student.user_id), PARENT_ID, student.user_id,
          "father", False, True, datetime.now(timezone.utc).isoformat())],
        "(parent_user_id, student_user_id)",
        ["is_approved", "approval_required"],
    ))


def score_for(student: Student, subject: str, rng: random.Random) -> int:
    mean = (student.strong_avg if subject == student.strong
            else student.weak_avg if subject == student.weak
            else student.other_avg)
    return max(5, min(100, int(rng.gauss(mean, 9))))


def active_days(student: Student, today: date, rng: random.Random) -> list[date]:
    pool = [today - timedelta(days=i) for i in range(0, 45)]
    return sorted(rng.sample(pool, min(student.study_days, len(pool))))


_chapter_cache: dict[str, str] = {}


def ensure_chapter(subject_id: str) -> str:
    """Return a real chapter_id for this content_service subject, creating a
    placeholder "Chapter 1" if the subject currently has none (Social
    Science, English, and Hindi had zero chapters in this dataset — confirmed
    via psql). Idempotent: re-running finds the existing chapter instead of
    creating a duplicate, whether from this script's own earlier insert or a
    real chapter an admin added later."""
    if subject_id in _chapter_cache:
        return _chapter_cache[subject_id]
    out = psql("content_service_postgres",
               f"SELECT id FROM chapters WHERE subject_id = {q(subject_id)} "
               f"ORDER BY sequence LIMIT 1;")
    existing = next((line.strip() for line in out.splitlines() if len(line.strip()) == 36 and "-" in line.strip()), None)
    if existing:
        _chapter_cache[subject_id] = existing
        return existing
    chapter_id = det_id("chapter", subject_id)
    psql("content_service_postgres", rows_sql(
        "chapters", ["id", "subject_id", "title", "sequence", "is_active", "created_at"],
        [(chapter_id, subject_id, "Chapter 1", 1, True, datetime.now(timezone.utc).isoformat())],
        "(id)", ["title"],
    ))
    _chapter_cache[subject_id] = chapter_id
    return chapter_id


def quiz_pool(student: Student) -> dict[str, list[str]]:
    subjects = ",".join(q(s) for s in student.subjects)
    out = psql("quiz_service_postgres",
               f"SELECT id, subject_name FROM quizzes "
               f"WHERE board = {q(BOARD)} AND class_num = {CLASS_NUM} "
               f"AND subject_name IN ({subjects}) ORDER BY subject_name, id;")
    pool: dict[str, list[str]] = {}
    for line in out.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 2 and "-" in parts[0]:
            pool.setdefault(parts[1], []).append(parts[0])
    return pool


def seed_analytics(student: Student, days: list[date], rng: random.Random) -> None:
    activity, logs = [], []
    for day in days:
        minutes = rng.randint(*student.daily_minutes)
        quizzes = rng.choice([0, 1, 1, 2])
        activity.append((
            det_id(student.user_id, "activity", day.isoformat()),
            student.user_id, day.isoformat(), minutes,
            rng.choice([0, 1, 1, 2, 3]), quizzes, True,
        ))
        for n in range(quizzes):
            subject = rng.choice(student.subjects)
            logs.append((
                det_id(student.user_id, "quizlog", day.isoformat(), str(n)),
                student.user_id, day.isoformat(),
                float(score_for(student, subject, rng)), None,
            ))

    psql("analytics_service_postgres", rows_sql(
        "daily_activity",
        ["id", "user_id", "day", "study_minutes", "videos_watched", "quizzes_completed", "logged_in"],
        activity, "(user_id, day)",
        ["study_minutes", "videos_watched", "quizzes_completed", "logged_in"],
    ))
    if logs:
        psql("analytics_service_postgres", rows_sql(
            "quiz_attempt_log", ["id", "user_id", "day", "score", "subject_id"],
            logs, "(id)", ["score", "day"],
        ))
    print(f"  analytics: {len(activity)} active days, {len(logs)} quiz logs")


def seed_quizzes(student: Student, days: list[date], rng: random.Random, n_attempts: int = 30) -> None:
    """Create fresh completed quiz attempts from scratch — this student had
    zero to begin with, spread across subjects weighted toward the strong/
    weak ones so per-subject stats are statistically meaningful."""
    pool = quiz_pool(student)
    weighted = ([student.strong] * 3 + [student.weak] * 3 +
                [s for s in student.subjects if s not in (student.strong, student.weak)] * 2)
    weighted = [s for s in weighted if pool.get(s)]
    if not weighted:
        print("  quiz: WARNING — no quizzes found for this board/class, skipping")
        return

    rows = []
    for i in range(n_attempts):
        subject = weighted[i % len(weighted)]
        quiz_id = rng.choice(pool[subject])
        pct = score_for(student, subject, rng)
        total = 20
        day = days[i % len(days)] if days else date.today()
        started = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=rng.randint(15, 21))
        completed = started + timedelta(minutes=rng.randint(4, 25))
        rows.append((
            det_id(student.user_id, "attempt", str(i)), student.user_id, quiz_id, "completed",
            round(total * pct / 100, 1), total, pct,
            rng.randint(240, 1500), started.isoformat(), completed.isoformat(),
        ))

    psql("quiz_service_postgres", rows_sql(
        "quiz_attempts",
        ["id", "user_id", "quiz_id", "status", "score", "total_marks", "percentage",
         "time_taken_seconds", "started_at", "completed_at"],
        rows, "(id)",
        ["status", "score", "percentage", "time_taken_seconds", "completed_at"],
    ))
    print(f"  quiz: created {len(rows)} completed attempts across {len(set(weighted))} subjects")


def seed_student_progress(student: Student, rng: random.Random) -> None:
    """Backs BOTH the Overview tab's "Subject Performance" card
    (summary.subjects, filtered through subjectNameById — ParentDashboardScreen.
    tsx:289-292) and the "Exam Readiness Score" tab (computed as
    round(0.6*avg_quiz_score + 0.4*completion_percentage) in parent_summary.
    py) — both read this table and nothing else. One row per real
    content_service subject in CONTENT_SUBJECT_CHAPTER (the tree the mobile
    app's own board/class lookup actually resolves to — see that dict's
    comment), scored via the quiz-taxonomy subject it maps onto so the
    strong/weak profile stays consistent with the Quiz stats card."""
    rows = []
    for subject, subject_id in CONTENT_SUBJECT_CHAPTER.items():
        chapter_id = ensure_chapter(subject_id)
        quiz_subject = CONTENT_TO_QUIZ_SUBJECT[subject]
        avg = score_for(student, quiz_subject, rng)
        completion = max(10, min(100, avg + rng.randint(-10, 15)))
        quizzes = rng.randint(2, 6)
        videos = rng.randint(1, 8)
        rows.append((
            det_id(student.user_id, "progress", subject_id), student.user_id,
            subject_id, chapter_id, videos, quizzes, float(avg), float(completion), None,
        ))

    psql("analytics_service_postgres", rows_sql(
        "student_progress",
        ["id", "user_id", "subject_id", "chapter_id", "videos_watched",
         "quizzes_completed", "avg_quiz_score", "completion_percentage", "weak_topics"],
        rows, "(id)",
        ["videos_watched", "quizzes_completed", "avg_quiz_score", "completion_percentage"],
    ))
    print(f"  student_progress: {len(rows)} subject rows (Subject Performance + Exam Readiness)")


def seed_battles(student: Student, days: list[date], rng: random.Random) -> None:
    battles, participants = [], []
    played = won = total_score = total_xp = 0

    target_wins = round(student.battles * student.win_rate)
    outcomes = [True] * target_wins + [False] * (student.battles - target_wins)
    rng.shuffle(outcomes)

    for i in range(student.battles):
        day = days[-(i * 2 + 1)] if days and i * 2 + 1 <= len(days) else date.today() - timedelta(days=i * 3)
        ended = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=rng.randint(16, 21))
        subject = rng.choice(student.subjects)
        battle_id = det_id(student.user_id, "battle", str(i))
        is_win = outcomes[i]
        correct = rng.randint(6, 10) if is_win else rng.randint(2, 6)
        wrong = 10 - correct
        score = correct * 10
        xp = 50 if is_win else 20

        battles.append((
            battle_id, "ONE_V_ONE", "COMPLETED", subject,
            f"{subject} practice", BOARD, CLASS_NUM, "medium",
            10, 300, 2, student.user_id, 0, 0, 0,
            (ended - timedelta(minutes=6)).isoformat(), ended.isoformat(),
        ))
        participants.append((
            det_id(student.user_id, "bp", str(i)), battle_id, student.user_id,
            False, False, student.name, "FINISHED",
            score, correct, wrong, round(correct / 10 * 100, 1),
            rng.randint(120, 300), 1 if is_win else 2, xp, ended.isoformat(),
        ))
        participants.append((
            det_id(student.user_id, "bp-ai", str(i)), battle_id, None,
            True, False, "AI Opponent", "FINISHED",
            (10 - correct) * 10, wrong, correct, round(wrong / 10 * 100, 1),
            rng.randint(120, 300), 2 if is_win else 1, 0, ended.isoformat(),
        ))
        played += 1
        won += 1 if is_win else 0
        total_score += score
        total_xp += xp

    if battles:
        psql("battle_service_postgres", rows_sql(
            "battles",
            ["id", "battle_type", "status", "subject", "topic", "board", "class_num",
             "difficulty", "question_count", "time_limit_sec", "max_players", "host_user_id",
             "team_a_score", "team_b_score", "spectator_count", "started_at", "ended_at"],
            battles, "(id)", ["status", "subject", "topic", "started_at", "ended_at"],
        ))
        psql("battle_service_postgres", rows_sql(
            "battle_participants",
            ["id", "battle_id", "user_id", "is_ai", "is_spectator", "display_name", "status",
             "score", "correct", "wrong", "accuracy", "time_taken_sec", "rank", "xp_earned",
             "finished_at"],
            participants, "(id)",
            ["score", "correct", "wrong", "accuracy", "rank", "xp_earned", "finished_at"],
        ))
        psql("battle_service_postgres", rows_sql(
            "battle_stats",
            ["id", "user_id", "battles_played", "battles_won", "total_score",
             "total_xp_earned", "win_streak", "best_win_streak"],
            [(det_id(student.user_id, "stats"), student.user_id, played, won,
              total_score, total_xp, 0, max(1, won // 2))],
            "(user_id)",
            ["battles_played", "battles_won", "total_score", "total_xp_earned", "best_win_streak"],
        ))
    print(f"  battle: {played} battles, {won} won")


def seed_gamification(student: Student, days: list[date]) -> None:
    total_xp = student.study_days * 30 + student.battles * 35
    level = max(1, total_xp // 500)

    psql("gamification_service_postgres", rows_sql(
        "user_xp", ["id", "user_id", "total_xp", "level"],
        [(det_id(student.user_id, "xp"), student.user_id, total_xp, level)],
        "(user_id)", ["total_xp", "level"],
    ))
    psql("gamification_service_postgres", rows_sql(
        "user_edupoints", ["id", "user_id", "balance", "total_earned", "total_spent"],
        [(det_id(student.user_id, "ep"), student.user_id,
          total_xp // 10, total_xp // 8, total_xp // 40)],
        "(user_id)", ["balance", "total_earned", "total_spent"],
    ))

    streak = 0
    if days:
        cursor = days[-1]
        active = set(days)
        while cursor in active:
            streak += 1
            cursor -= timedelta(days=1)
    psql("gamification_service_postgres", rows_sql(
        "user_streaks",
        ["id", "user_id", "current_streak", "longest_streak", "last_activity_date", "freeze_count"],
        [(det_id(student.user_id, "streak"), student.user_id,
          streak, max(streak, 4), days[-1].isoformat() if days else None, 0)],
        "(user_id)", ["current_streak", "longest_streak", "last_activity_date"],
    ))

    badges = ["FIRST_VIDEO", "QUIZ_WARRIOR"]
    if student.strong_avg >= 80:
        badges.append("QUIZ_ACE")
    if streak >= 7:
        badges.append("STREAK_7")
    if student.battles >= 5:
        badges.append("BATTLE_CHAMPION")
    rows = [
        (det_id(student.user_id, "badge", b), student.user_id, b,
         (days[i % len(days)] if days else date.today()).isoformat())
        for i, b in enumerate(badges)
    ]
    psql("gamification_service_postgres", rows_sql(
        "user_badges", ["id", "user_id", "badge_type", "earned_at"],
        rows, "(id)", ["earned_at"],
    ))

    xp_events = [
        (det_id(student.user_id, "xptx", day.isoformat()), student.user_id,
         "QUIZ_COMPLETED", 30, day.isoformat())
        for day in days[-20:]
    ]
    if xp_events:
        psql("gamification_service_postgres", rows_sql(
            "xp_transactions", ["id", "user_id", "event", "xp_awarded", "created_at"],
            xp_events, "(id)", ["xp_awarded"],
        ))
    print(f"  gamification: {total_xp} XP, level {level}, {len(badges)} badges, streak {streak}")


def main() -> None:
    today = date.today()
    print(f"Seeding wakeel's family (parent {PARENT_ID}, +919999999999)\n")
    for student in STUDENTS:
        rng = random.Random(student.user_id)
        days = active_days(student, today, rng)
        print(f"{student.name} ({BOARD} class {CLASS_NUM}) — "
              f"strong={student.strong} weak={student.weak}")
        seed_parent_link(student)
        seed_analytics(student, days, rng)
        seed_quizzes(student, days, rng)
        seed_student_progress(student, rng)
        seed_battles(student, days, rng)
        seed_gamification(student, days)
        print()
    print("Done.")


if __name__ == "__main__":
    main()
