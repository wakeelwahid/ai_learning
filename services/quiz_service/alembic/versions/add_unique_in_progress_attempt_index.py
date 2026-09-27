"""add unique in_progress attempt partial index

Revision ID: 7b1e9a4c2f03
Revises: 3f8a2c1d7e94
Create Date: 2026-09-18

DB-level backstop for the application-level "one in_progress attempt per
(user_id, quiz_id)" check in AttemptService.start_attempt(). The app-level
check-then-insert has a TOCTOU race under true concurrency (two requests can
both pass the SELECT before either INSERTs). This partial unique index
enforces the invariant at the database level regardless of application
timing: at most one row with status = 'in_progress' may exist per
(user_id, quiz_id) pair.

A losing concurrent INSERT will raise IntegrityError (unique_violation),
which start_attempt() catches and translates into the same 409 response as
the application-level check.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "7b1e9a4c2f03"
down_revision: Union[str, None] = "3f8a2c1d7e94"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # Postgres rejects it outright. autocommit_block() ends Alembic's
    # normally-open transaction for the duration of this block so each
    # statement runs and commits on its own.
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "ux_quiz_attempts_user_quiz_in_progress "
            "ON quiz_attempts (user_id, quiz_id) "
            "WHERE status = 'in_progress'"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "ux_quiz_attempts_user_quiz_in_progress"
        )
