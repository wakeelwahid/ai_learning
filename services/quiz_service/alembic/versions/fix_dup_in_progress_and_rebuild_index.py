"""deduplicate stale in_progress attempts and rebuild the unique index

Revision ID: 9d4f2b7a1c56
Revises: 7b1e9a4c2f03
Create Date: 2026-09-18

The previous migration (7b1e9a4c2f03) tried to CREATE UNIQUE INDEX
CONCURRENTLY over quiz_attempts(user_id, quiz_id) WHERE status =
'in_progress', but the table already contained 162 groups (2128 rows total)
of pre-existing duplicate in_progress attempts for the same (user_id,
quiz_id) — accumulated before this constraint existed, or via the exact
concurrency race QBG-007 describes. CREATE INDEX CONCURRENTLY cannot build
over data that violates the uniqueness it's enforcing: it failed, but
because it runs outside the normal transaction (autocommit_block), the
failure never propagated as an upgrade error, and alembic silently marked
7b1e9a4c2f03 as applied anyway — leaving an INVALID, inert index that
enforces nothing (confirmed live: pg_index.indisvalid = false, and a plain
INSERT of a 4th duplicate row succeeded with no constraint violation).

This migration does NOT delete any data. An in_progress attempt has not been
scored and has not triggered any XP/completion side effect, so the safe,
non-destructive resolution is to keep exactly one attempt per (user_id,
quiz_id) group as "in_progress" (the most recently started one — the one a
real user would actually still be sitting on) and relabel every older
duplicate in that group to "abandoned", a new but harmless status value (the
status column is a plain unconstrained String(20), and no existing query
anywhere filters on an exhaustive status enum that this would break —
existing code only ever checks for "in_progress" or "completed"
specifically). No row is removed, so history/audit is fully preserved.

Once the duplicates are resolved, the invalid index is dropped and rebuilt.
A final verification step queries pg_index.indisvalid directly and raises a
hard error if the rebuild did not succeed — the exact silent-failure gap
that let 7b1e9a4c2f03 go unnoticed is closed here for good.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9d4f2b7a1c56"
down_revision: Union[str, None] = "7b1e9a4c2f03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: relabel every duplicate in_progress row EXCEPT the most
    # recently started one per (user_id, quiz_id) group. No deletes.
    result = conn.execute(sa.text("""
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY user_id, quiz_id
                       ORDER BY started_at DESC
                   ) AS rn
            FROM quiz_attempts
            WHERE status = 'in_progress'
        )
        UPDATE quiz_attempts
        SET status = 'abandoned'
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    """))
    abandoned_count = result.rowcount

    # Step 2: drop the invalid index left behind by 7b1e9a4c2f03, then
    # rebuild it cleanly now that no duplicates remain.
    with op.get_context().autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "ux_quiz_attempts_user_quiz_in_progress"
        )
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY "
            "ux_quiz_attempts_user_quiz_in_progress "
            "ON quiz_attempts (user_id, quiz_id) "
            "WHERE status = 'in_progress'"
        )

    # Step 3: verify the rebuild actually succeeded and is valid — do not
    # silently continue as if the constraint exists when it does not. This
    # is the exact check that would have caught 7b1e9a4c2f03's failure.
    is_valid = conn.execute(sa.text(
        "SELECT indisvalid FROM pg_index "
        "WHERE indexrelid = 'ux_quiz_attempts_user_quiz_in_progress'::regclass"
    )).scalar()
    if not is_valid:
        raise RuntimeError(
            "ux_quiz_attempts_user_quiz_in_progress failed to build as a "
            "VALID index after deduplication — refusing to silently "
            f"continue. {abandoned_count} rows were relabeled 'abandoned' "
            "in this migration; investigate remaining duplicates with: "
            "SELECT user_id, quiz_id, count(*) FROM quiz_attempts "
            "WHERE status = 'in_progress' GROUP BY 1, 2 HAVING count(*) > 1;"
        )


def downgrade() -> None:
    # Data relabeling (in_progress -> abandoned) is not reversed — it was a
    # safe, non-destructive dedup of pre-existing bad state, not a schema
    # change, and reversing it would resurrect the exact duplicate-attempt
    # condition this migration exists to fix.
    with op.get_context().autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "ux_quiz_attempts_user_quiz_in_progress"
        )
