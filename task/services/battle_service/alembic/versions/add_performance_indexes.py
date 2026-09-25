"""add performance indexes

Revision ID: 7a2f5c8b3e61
Revises:
Create Date: 2026-06-16

Adds indexes to improve query performance:
  - battle_stats:        index on total_score DESC (leaderboard queries)
  - battle_participants: composite index on (user_id, status)
"""
from typing import Sequence, Union

from alembic import op

revision: str = "7a2f5c8b3e61"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # Postgres rejects it outright. autocommit_block() ends Alembic's
    # normally-open transaction for the duration of this block so each
    # statement runs and commits on its own.
    with op.get_context().autocommit_block():
        # battle_stats: index on total_score DESC for leaderboard queries
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_battle_stats_total_score_desc ON battle_stats (total_score DESC)"
        )

        # battle_participants: composite index on (user_id, status)
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_battle_participants_user_id_status ON battle_participants (user_id, status)"
        )


def downgrade() -> None:
    op.drop_index("ix_battle_stats_total_score_desc", table_name="battle_stats")
    op.drop_index("ix_battle_participants_user_id_status", table_name="battle_participants")
