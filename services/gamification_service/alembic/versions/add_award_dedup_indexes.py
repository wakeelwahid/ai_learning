"""add XP/EduPoints award dedup partial unique indexes

Revision ID: 6d3f8a1c9e42
Revises: 9b4e6f2d0c83
Create Date: 2026-09-18

These two partial unique indexes are the real backstop against a retried or
malicious repeat call double-crediting the same (user_id, event, reference_id)
award — the service layer checks for an existing row before inserting, but
this index is what actually prevents a race from slipping through. They were
declared on XPTransaction/EduPointTransaction's __table_args__
(app/models/gamification.py) but never shipped as a migration, so any
database created before that model change — or one whose schema drifted from
create_all()'s current definition — has no anti-replay protection at the DB
level despite the application code assuming it does.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "6d3f8a1c9e42"
down_revision: Union[str, None] = "9b4e6f2d0c83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # Postgres rejects it outright. autocommit_block() ends Alembic's
    # normally-open transaction for the duration of this block so each
    # statement runs and commits on its own.
    with op.get_context().autocommit_block():
        # xp_transactions: one row per (user_id, event, reference_id) where a
        # reference_id was given (daily_login has none and isn't constrained).
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "uq_xp_txn_user_event_ref ON xp_transactions (user_id, event, reference_id) "
            "WHERE reference_id IS NOT NULL"
        )

        # edupoint_transactions: same dedup, but only for earning rows
        # (event IS NOT NULL) — spend rows reuse reference_id for an
        # unrelated purpose (e.g. chapter_id) and can legitimately repeat.
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "uq_ep_txn_user_event_ref ON edupoint_transactions (user_id, event, reference_id) "
            "WHERE event IS NOT NULL AND reference_id IS NOT NULL"
        )


def downgrade() -> None:
    op.drop_index("uq_xp_txn_user_event_ref", table_name="xp_transactions")
    op.drop_index("uq_ep_txn_user_event_ref", table_name="edupoint_transactions")
