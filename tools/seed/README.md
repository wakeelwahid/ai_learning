# Database Seeder

Generates a realistic school ecosystem across all 12 microservice databases
with consistent UUIDs (the same student exists in auth_db, user_db,
gamification_db, ...). Deterministic (uuid5 + seeded RNG) and idempotent
(`ON CONFLICT DO NOTHING`) — safe to re-run any time.

```bash
python3 tools/seed/seed.py --scale medium          # default; ~45k rows
python3 tools/seed/seed.py --scale full            # E2E-plan scale (~400k rows)
python3 tools/seed/seed.py --scale small --dry-run # write SQL to out/, don't apply
python3 tools/seed/seed.py --only content,quiz     # subset of services
```

SQL is written to `tools/seed/out/*.sql` and applied via
`docker exec <svc>_service_postgres psql` — no host ports or extra deps needed.
The stack must be running (each service's `docker compose up -d`).

## What gets seeded

| Area | Contents |
|---|---|
| Users | students/parents/teachers/admins + super admin, Indian names, 5 schools, 8 cities. **All log in with `Seed@123`** (`seed.student0@edulearn.test`, `seed.parent0@...`, `seed.admin0@...`, `seed.superadmin@...`) |
| Profiles & links | user_profiles (class/board/school/city/gender), parent→child links (1–3 children each) |
| Friends | accepted-friend ring per student + pending/rejected requests |
| Chat | DM rooms over friendships + group chats (Math Lovers, NEET Aspirants, ...), recent messages |
| Content | Boards CBSE/ICSE/State → classes 6–12 → subjects → chapters → topics → videos, notes, exercises, practice MCQs. CBSE Class 10 is the flagship (all 9 subjects at full depth — the plan's 9×20×10 totals); other combos get a light catalog so every drill-down works |
| PYPs | 10 years × 3 boards × 3 subjects |
| Knowledge Hub | 8 categories + articles |
| Quizzes | chapter quizzes on flagship chapters, mixed MCQ/TF/fill/subjective, negative marking |
| Gamification | XP/level distribution (~45% L1 … ~5% L8-10), streaks, EduPoints, badges, friend-feed activity events |
| Notifications | realistic template mix (streak/goal/battle/friend/payment/announcement) + full preference rows |
| Referrals | codes + funnel-state referrals, counters reconciled |
| Battles | completed battle history + participants + per-user stats |
| Analytics | student_progress rollups + weak-topic accuracy rows |
| Payment | coupons WELCOME50 / FIRST100 / SUMMER25 / REFER200 (plans are service-seeded) |

Scale profiles: `small` (50 students, smoke), `medium` (500 students — dev
default), `full` (5000 students / 1800 flagship videos / 18k practice
questions / 100k notifications / 10k DMs / 2000 groups — the E2E plan's
numbers).

Caveats: two service-level caches can lag fresh seed data — the content
catalog cache (1h TTL) and the leaderboard materialized view (5-min refresh).
