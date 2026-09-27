"""Seed realistic per-student activity for the parent-RAG demo family.

Parent: Pooja Patel (seed.parent1@edulearn.test) with three approved children.
Each child gets a deliberately DIFFERENT profile so a parent asking "who needs
help?" or "compare my children" has a verifiably correct answer:

  Rahul Patel  — strong in Math, weak in History, very consistent (daily study)
  Pooja Kumar  — strong in Biology, weak in Physics, erratic (long gaps)
  Swati Rao    — middling everywhere, went inactive ~2 weeks ago

Writes to four databases (quiz, battle, gamification, analytics) over psql,
because each service owns its own DB and there is no cross-service write API.
This is seed tooling, not application code — the no-raw-SQL rule covers
services/*/app, not one-off fixtures like this.

Idempotent: every insert is keyed on a deterministic uuid5, so re-running
updates instead of duplicating.

Usage:  python3 tools/seed/seed_parent_rag_demo.py
"""
from __future__ import annotations

import random
import subprocess
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

NS = uuid.UUID("6f1d1b1e-0000-4000-8000-parentrag00".replace("parentrag00", "9a1b2c3d4e5f"))

PARENT_ID = "130fa14a-8b0b-531c-b821-012876dd2b8c"


@dataclass
class Child:
    user_id: str
    name: str
    class_num: int
    board: str
    strong: str
    weak: str
    # mean quiz % for strong / weak / other subjects
    strong_avg: int
    weak_avg: int
    other_avg: int
    study_days: int          # of the last 60, how many were active
    daily_minutes: tuple[int, int]
    battles: int
    win_rate: float
    inactive_tail: int = 0   # days at the end with no activity at all
    subjects: list[str] = field(default_factory=lambda: [
        "Math", "Science", "English", "History", "Geography",
    ])


CHILDREN = [
    Child(
        user_id="b6bad9bb-350c-5fdd-ba06-cb0040dc321c",
        name="Rahul Patel", class_num=8, board="CBSE",
        strong="Math", weak="History",
        strong_avg=86, weak_avg=41, other_avg=68,
        study_days=48, daily_minutes=(35, 75),
        battles=14, win_rate=0.64,
        subjects=["Math", "Science", "English", "History", "Geography"],
    ),
    Child(
        user_id="b433f871-9499-5a72-90bd-bd769a2e13a8",
        name="Pooja Kumar", class_num=8, board="ICSE",
        strong="Biology", weak="Physics",
        strong_avg=82, weak_avg=38, other_avg=61,
        study_days=26, daily_minutes=(20, 110),
        battles=6, win_rate=0.33,
        subjects=["Biology", "Physics", "Chemistry", "English", "Math"],
    ),
    Child(
        user_id="0b8b64dc-a380-5944-81f0-047e07e401eb",
        name="Swati Rao", class_num=6, board="STATE",
        strong="English", weak="Math",
        strong_avg=71, weak_avg=52, other_avg=60,
        study_days=18, daily_minutes=(15, 40),
        battles=3, win_rate=0.33,
        inactive_tail=13,
        subjects=["English", "Math", "Science", "Computer", "Geography"],
    ),
]


def seed_parent_link(child: Child) -> None:
    """Explicit, idempotent parent<->child link — previously this family's
    entire premise depended on seed.py's round-robin parent-assignment
    coincidentally pairing seed.parent1 with these three specific students.
    That's fine for a one-off demo but not "permanent": a differently-scaled
    or re-shuffled seed.py run could silently break the pairing. This makes
    the link a first-class, explicit part of THIS script instead."""
    psql("user_service_postgres", rows_sql(
        "parent_profiles",
        ["id", "parent_user_id", "student_user_id", "relationship",
         "approval_required", "is_approved", "created_at"],
        [(det_id("plink", PARENT_ID, child.user_id), PARENT_ID, child.user_id,
          "mother", True, True, datetime.now(timezone.utc).isoformat())],
        "(parent_user_id, student_user_id)",
        ["is_approved", "approval_required"],
    ))


def psql(db_container: str, sql: str) -> str:
    """Run one SQL statement against a service's Postgres container."""
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
    """Quote a value for inline SQL (seed fixtures only)."""
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


def score_for(child: Child, subject: str, rng: random.Random) -> int:
    if subject == child.strong:
        mean = child.strong_avg
    elif subject == child.weak:
        mean = child.weak_avg
    else:
        mean = child.other_avg
    return max(5, min(100, int(rng.gauss(mean, 9))))


def active_days(child: Child, today: date, rng: random.Random) -> list[date]:
    """Pick which of the last 60 days the child was active."""
    pool = [today - timedelta(days=i) for i in range(child.inactive_tail, 60)]
    return sorted(rng.sample(pool, min(child.study_days, len(pool))))


# ── analytics_service ─────────────────────────────────────────────────────────

def seed_analytics(child: Child, days: list[date], rng: random.Random) -> None:
    activity, logs = [], []
    for day in days:
        minutes = rng.randint(*child.daily_minutes)
        quizzes = rng.choice([0, 1, 1, 2])
        activity.append((
            det_id(child.user_id, "activity", day.isoformat()),
            child.user_id, day.isoformat(), minutes,
            rng.choice([0, 1, 1, 2, 3]), quizzes, True,
        ))
        for n in range(quizzes):
            subject = rng.choice(child.subjects)
            logs.append((
                det_id(child.user_id, "quizlog", day.isoformat(), str(n)),
                child.user_id, day.isoformat(),
                float(score_for(child, subject, rng)), None,
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


# ── quiz_service ──────────────────────────────────────────────────────────────

def _quiz_pool(child: Child) -> dict[str, list[str]]:
    """Quiz ids per subject the child studies, so attempts can be spread
    across subjects instead of all sitting on Math."""
    subjects = ",".join(q(s) for s in child.subjects)
    out = psql("quiz_service_postgres",
               f"SELECT id, subject_name FROM quizzes "
               f"WHERE subject_name IN ({subjects}) ORDER BY subject_name, id;")
    pool: dict[str, list[str]] = {}
    for line in out.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 2 and "-" in parts[0]:
            pool.setdefault(parts[1], []).append(parts[0])
    return pool


def seed_quizzes(child: Child, days: list[date], rng: random.Random) -> None:
    """Re-point and re-score the child's attempts so subject strengths are real.

    The existing seed put every attempt on a Math quiz at ~0.6%, which makes
    "which subject is weak" unanswerable. Attempts are redistributed across
    the child's subjects (weighted toward their strong and weak ones) and
    scored from that subject's profile.
    """
    out = psql("quiz_service_postgres",
               f"SELECT a.id FROM quiz_attempts a "
               f"WHERE a.user_id = {q(child.user_id)} AND a.status = 'completed';")
    attempt_ids = [line.strip() for line in out.splitlines()
                   if "-" in line and len(line.strip()) == 36]

    if not attempt_ids:
        print(f"  quiz: WARNING — no existing completed attempts for {child.name} "
              f"({child.user_id}) to re-score. Run tools/seed/seed.py first so this "
              f"student has base quiz attempts, then re-run this script.")
        return

    # Weight the spread so strong/weak subjects carry enough attempts to be
    # statistically meaningful to a parent asking about them.
    pool = _quiz_pool(child)
    weighted = ([child.strong] * 3 + [child.weak] * 3 +
                [s for s in child.subjects if s not in (child.strong, child.weak)] * 2)
    weighted = [s for s in weighted if pool.get(s)]

    attempts, repoint = [], []
    for i, attempt_id in enumerate(attempt_ids):
        subject = weighted[i % len(weighted)] if weighted else child.strong
        quiz_ids = pool.get(subject)
        if quiz_ids:
            repoint.append(f"WHEN {q(attempt_id)} THEN {q(rng.choice(quiz_ids))}::uuid")
        attempts.append((attempt_id, subject))

    if repoint:
        ids_r = ",".join(q(a) for a, _ in attempts)
        psql("quiz_service_postgres",
             f"UPDATE quiz_attempts SET quiz_id = CASE id {' '.join(repoint)} END "
             f"WHERE id IN ({ids_r});")

    cases_pct, cases_score, cases_time, cases_done = [], [], [], []
    for i, (attempt_id, subject) in enumerate(attempts):
        pct = score_for(child, subject, rng)
        total = 20
        day = days[i % len(days)] if days else date.today()
        completed = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=rng.randint(15, 21))
        cases_pct.append(f"WHEN {q(attempt_id)} THEN {pct}")
        cases_score.append(f"WHEN {q(attempt_id)} THEN {round(total * pct / 100, 1)}")
        cases_time.append(f"WHEN {q(attempt_id)} THEN {rng.randint(240, 1500)}")
        cases_done.append(f"WHEN {q(attempt_id)} THEN {q(completed.isoformat())}::timestamptz")

    ids = ",".join(q(a) for a, _ in attempts)
    psql("quiz_service_postgres", f"""
        UPDATE quiz_attempts SET
          percentage = CASE id {' '.join(cases_pct)} END,
          score = CASE id {' '.join(cases_score)} END,
          total_marks = 20,
          time_taken_seconds = CASE id {' '.join(cases_time)} END,
          completed_at = CASE id {' '.join(cases_done)} END
        WHERE id IN ({ids});""")
    print(f"  quiz: re-scored {len(attempts)} attempts")


# ── battle_service ────────────────────────────────────────────────────────────

def seed_battles(child: Child, days: list[date], rng: random.Random) -> None:
    battles, participants = [], []
    played = won = total_score = total_xp = 0

    # Fixed win/loss pattern rather than per-battle rng, so the seeded record
    # actually matches the child's intended win rate.
    target_wins = round(child.battles * child.win_rate)
    outcomes = [True] * target_wins + [False] * (child.battles - target_wins)
    rng.shuffle(outcomes)

    for i in range(child.battles):
        day = days[-(i * 2 + 1)] if days and i * 2 + 1 <= len(days) else date.today() - timedelta(days=i * 3)
        ended = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=rng.randint(16, 21))
        subject = rng.choice(child.subjects)
        battle_id = det_id(child.user_id, "battle", str(i))
        is_win = outcomes[i]
        correct = rng.randint(6, 10) if is_win else rng.randint(2, 6)
        wrong = 10 - correct
        score = correct * 10
        xp = 50 if is_win else 20

        battles.append((
            battle_id, "ONE_V_ONE", "COMPLETED", subject,
            f"{subject} practice", child.board, child.class_num, "medium",
            10, 300, 2, child.user_id, 0, 0, 0,
            (ended - timedelta(minutes=6)).isoformat(), ended.isoformat(),
        ))
        participants.append((
            det_id(child.user_id, "bp", str(i)), battle_id, child.user_id,
            False, False, child.name, "FINISHED",
            score, correct, wrong, round(correct / 10 * 100, 1),
            rng.randint(120, 300), 1 if is_win else 2, xp, ended.isoformat(),
        ))
        # An AI opponent so participant_count is realistic.
        participants.append((
            det_id(child.user_id, "bp-ai", str(i)), battle_id, None,
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
            [(det_id(child.user_id, "stats"), child.user_id, played, won,
              total_score, total_xp, 0, max(1, won // 2))],
            "(user_id)",
            ["battles_played", "battles_won", "total_score", "total_xp_earned", "best_win_streak"],
        ))
    print(f"  battle: {played} battles, {won} won")


# ── gamification_service ──────────────────────────────────────────────────────

def seed_gamification(child: Child, days: list[date], rng: random.Random) -> None:
    total_xp = child.study_days * 30 + child.battles * 35
    level = max(1, total_xp // 500)

    psql("gamification_service_postgres", rows_sql(
        "user_xp", ["id", "user_id", "total_xp", "level"],
        [(det_id(child.user_id, "xp"), child.user_id, total_xp, level)],
        "(user_id)", ["total_xp", "level"],
    ))
    psql("gamification_service_postgres", rows_sql(
        "user_edupoints", ["id", "user_id", "balance", "total_earned", "total_spent"],
        [(det_id(child.user_id, "ep"), child.user_id,
          total_xp // 10, total_xp // 8, total_xp // 40)],
        "(user_id)", ["balance", "total_earned", "total_spent"],
    ))

    # Streak: consecutive active days ending at the child's last active day.
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
        [(det_id(child.user_id, "streak"), child.user_id,
          0 if child.inactive_tail else streak, max(streak, 4),
          days[-1].isoformat() if days else None, 0)],
        "(user_id)", ["current_streak", "longest_streak", "last_activity_date"],
    ))

    badges = ["FIRST_VIDEO", "QUIZ_WARRIOR"]
    if child.strong_avg >= 80:
        badges.append("QUIZ_ACE")
    if streak >= 7:
        badges.append("STREAK_7")
    if child.battles >= 10:
        badges.append("BATTLE_CHAMPION")
    rows = [
        (det_id(child.user_id, "badge", b), child.user_id, b,
         (days[i % len(days)] if days else date.today()).isoformat())
        for i, b in enumerate(badges)
    ]
    psql("gamification_service_postgres", rows_sql(
        "user_badges", ["id", "user_id", "badge_type", "earned_at"],
        rows, "(id)", ["earned_at"],
    ))

    xp_events = [
        (det_id(child.user_id, "xptx", day.isoformat()), child.user_id,
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
    print(f"Seeding parent-RAG demo data for parent {PARENT_ID}\n")
    for child in CHILDREN:
        rng = random.Random(child.user_id)   # deterministic per child
        days = active_days(child, today, rng)
        print(f"{child.name} ({child.board} class {child.class_num}) — "
              f"strong={child.strong} weak={child.weak}")
        seed_parent_link(child)
        seed_analytics(child, days, rng)
        seed_quizzes(child, days, rng)
        seed_battles(child, days, rng)
        seed_gamification(child, days, rng)
        print()
    print("Done.")


if __name__ == "__main__":
    main()
