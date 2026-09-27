"""add performance indexes

Revision ID: 9b4e6f2d0c83
Revises:
Create Date: 2026-06-16

Adds indexes to improve query performance:
  - user_xp:         index on total_xp DESC (leaderboard queries)
  - xp_transactions: composite index on (user_id, created_at)
"""
from typing import Sequence, Union

from alembic import op

revision: str = "9b4e6f2d0c83"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # Postgres rejects it outright. autocommit_block() ends Alembic's
    # normally-open transaction for the duration of this block so each
    # statement runs and commits on its own.
    with op.get_context().autocommit_block():
        # user_xp: index on total_xp DESC for leaderboard queries
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_user_xp_total_xp_desc ON user_xp (total_xp DESC)"
        )

        # xp_transactions: composite index on (user_id, created_at)
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_xp_transactions_user_id_created_at ON xp_transactions (user_id, created_at)"
        )


def downgrade() -> None:
    op.drop_index("ix_user_xp_total_xp_desc", table_name="user_xp")
    op.drop_index("ix_xp_transactions_user_id_created_at", table_name="xp_transactions")
