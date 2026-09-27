"""add performance indexes

Revision ID: 5c7d1a3e8f20
Revises:
Create Date: 2026-06-16

Adds indexes to improve query performance:
  - subscriptions: composite index on (user_id, status)
  - subscriptions: index on expires_at
"""
from typing import Sequence, Union

from alembic import op

revision: str = "5c7d1a3e8f20"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # Postgres rejects it outright. autocommit_block() ends Alembic's
    # normally-open transaction for the duration of this block so each
    # statement runs and commits on its own.
    with op.get_context().autocommit_block():
        # subscriptions: composite index on (user_id, status)
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_subscriptions_user_id_status ON subscriptions (user_id, status)"
        )

        # subscriptions: index on expires_at
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_subscriptions_expires_at ON subscriptions (expires_at)"
        )


def downgrade() -> None:
    op.drop_index("ix_subscriptions_user_id_status", table_name="subscriptions")
    op.drop_index("ix_subscriptions_expires_at", table_name="subscriptions")
