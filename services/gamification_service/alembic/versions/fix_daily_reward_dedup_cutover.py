"""fix QBG-013: cutover-scoped dedup indexes for daily-reward reference_id

Revision ID: 3a7c1d5e8f21
Revises: 6d3f8a1c9e42
Create Date: 2026-09-18

Background (QBG-013)
---------------------
add_award_dedup_indexes.py (6d3f8a1c9e42) tried to add:

    CREATE UNIQUE INDEX uq_xp_txn_user_event_ref
        ON xp_transactions (user_id, event, reference_id)
        WHERE reference_id IS NOT NULL

    CREATE UNIQUE INDEX uq_ep_txn_user_event_ref
        ON edupoint_transactions (user_id, event, reference_id)
        WHERE event IS NOT NULL AND reference_id IS NOT NULL

Both statements fail against the live DB today. Investigation found 7 rows
across 3 (user_id, event, reference_id) groups in xp_transactions, all
event=DAILY_LOGIN with reference_id like 'daily_reward_day_1' /
'daily_reward_day_2'. Cross-referencing user_daily_rewards confirms every one
of these 7 rows is a DISTINCT, LEGITIMATE claim on a different claim_date
(e.g. user 7f0f9332-... claimed "day 1" on 2026-07-03, 2026-07-07 and
2026-09-08 — three separate real streak cycles). These are NOT duplicates in
the business sense and MUST NOT be deleted/merged/modified — doing so would
erase XP a real user legitimately earned.

The true bug was in the application code: GamificationService.claim() (see
app/services/gamification_service.py) built reference_id from `day`, the
day-IN-CYCLE (1..DAILY_REWARD_CYCLE_LEN), not the calendar claim_date. `day`
is designed to repeat every cycle, so "daily_reward_day_{day}" was never a
valid global anti-replay key — it was guaranteed to collide as soon as a user
completed 2+ cycles. That code has now been fixed to key off the actual
claim_date instead: reference_id=f"daily_reward_{today.isoformat()}". That
value is genuinely unique per user per real claim, consistent with (and
redundant to, in a good way) the pre-existing uq_daily_reward_user_date
UniqueConstraint on UserDailyReward(user_id, claim_date), which is — and
remains — the actual backstop that guarantees at most one claim per user per
calendar day.

The code fix only prevents *future* collisions. It does nothing for the 7
existing rows, which were written under the old (day-in-cycle) scheme and
genuinely do collide with each other under (user_id, event, reference_id) as
the schema stands today — that collision is the literal QBG-013 symptom, and
a plain unqualified CREATE UNIQUE INDEX would still fail against them.

Chosen fix: cutover-scoped partial unique index
------------------------------------------------
We replace the two indexes with versions scoped to `created_at >=
DAILY_REWARD_DEDUP_CUTOVER` (this migration's deploy time, fixed below as a
literal timestamp chosen at authoring time). Rows written before the cutover
(including all 7 legitimate historical collisions, and any other pre-fix
row) are simply outside the index's predicate and are never evaluated against
the uniqueness constraint — they are not touched, not deleted, not rewritten.
Every row written at/after the cutover was written by the fixed claim() (and
by every other call site of _apply_xp_amount / EduPointTransaction, which
never used the cyclic scheme to begin with) and is therefore guaranteed
unique by construction, so the constraint is fully enforced for all new
activity going forward.

Why this option over the alternatives considered:
  - A new dedicated "unique-safe" column with the real UNIQUE constraint,
    backed by a plain non-unique btree for history: adds a new column and a
    dual-index scheme for a problem that a predicate on an existing,
    already-indexed column (created_at) solves with zero schema change.
  - A non-unique btree index relying solely on the app-level check-then-insert
    for dedup going forward: this was explicitly the gap the original
    migration was trying to close (check-then-insert has a TOCTOU race under
    concurrent requests); dropping the DB-level guarantee entirely would
    reopen that race for all future rows, not just the 7 historical ones.
  - Backfilling/rewriting the 7 rows' reference_id to the new scheme: the
    ticket instructs never to rewrite historical rows, and it isn't necessary
    — the cutover predicate makes it moot.

This keeps the same table, same columns, same index names' *intent* (values
differ below because they now encode the cutover), the same query the app
already relies on via `_apply_xp_amount` / EduPointsService's existing-row
check, and is a single, reversible, well-scoped change.

Cutover timestamp
------------------
DAILY_REWARD_DEDUP_CUTOVER is fixed to this migration's authored deploy time
(UTC). It must not be changed after this migration has been applied anywhere
— moving it later would silently exclude newly-written rows from protection;
moving it earlier could pull pre-fix historical rows back into scope and
reintroduce the exact collision this migration exists to avoid.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "3a7c1d5e8f21"
down_revision: Union[str, None] = "6d3f8a1c9e42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Fixed cutover instant (UTC). Rows created at or after this timestamp were
# written by the claim_date-keyed reference_id scheme (or never used the
# cyclic scheme at all) and are therefore safe to enforce uniqueness on.
# Rows before it are historical/pre-fix and are excluded from the predicate,
# not deleted or modified.
DAILY_REWARD_DEDUP_CUTOVER = "2026-09-18T00:00:00+00:00"


def upgrade() -> None:
    # Drop the two indexes the earlier migration attempted (IF EXISTS is
    # defensive: on a DB where they failed to create, as diagnosed by
    # QBG-013, there is nothing to drop; on one where they somehow did
    # succeed, we replace them with the cutover-scoped version below so both
    # environments converge on the same schema).
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS uq_xp_txn_user_event_ref")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS uq_ep_txn_user_event_ref")

    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # autocommit_block() ends Alembic's normally-open transaction so each
    # statement runs and commits on its own, same pattern as
    # add_award_dedup_indexes.py.
    with op.get_context().autocommit_block():
        # xp_transactions: dedup on (user_id, event, reference_id), but only
        # for rows written at/after the cutover. Historical rows predating
        # the claim_date-based reference_id fix (including the 7 known
        # legitimate daily-reward collisions from QBG-013) fall outside this
        # predicate and are never evaluated for uniqueness — they are kept
        # exactly as-is.
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "uq_xp_txn_user_event_ref ON xp_transactions "
            "(user_id, event, reference_id) "
            f"WHERE reference_id IS NOT NULL AND created_at >= '{DAILY_REWARD_DEDUP_CUTOVER}'"
        )

        # edupoint_transactions: same dedup and same cutover scoping, still
        # excluding spend rows (event IS NULL) which legitimately reuse
        # reference_id for an unrelated purpose (e.g. chapter_id).
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "uq_ep_txn_user_event_ref ON edupoint_transactions "
            "(user_id, event, reference_id) "
            f"WHERE event IS NOT NULL AND reference_id IS NOT NULL "
            f"AND created_at >= '{DAILY_REWARD_DEDUP_CUTOVER}'"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS uq_xp_txn_user_event_ref")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS uq_ep_txn_user_event_ref")

        # Restore the original (unscoped) indexes so downgrade returns to the
        # prior migration's intended schema. Note: this will fail again with
        # the same QBG-013 symptom if the 7 legitimate historical collisions
        # are still present — that is expected and matches the pre-fix state.
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "uq_xp_txn_user_event_ref ON xp_transactions (user_id, event, reference_id) "
            "WHERE reference_id IS NOT NULL"
        )
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "uq_ep_txn_user_event_ref ON edupoint_transactions (user_id, event, reference_id) "
            "WHERE event IS NOT NULL AND reference_id IS NOT NULL"
        )
