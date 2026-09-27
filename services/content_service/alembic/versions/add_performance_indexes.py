"""add performance indexes

Revision ID: 1d0e9a6b4f37
Revises:
Create Date: 2026-06-16

Adds indexes to improve query performance:
  - user_learning_progress: composite index on (user_id, entity_id) for chapter progress lookups
  - video_progress:         composite index on (user_id, video_id)

Note: the content_service tracks chapter progress via the user_learning_progress table
(entity_type='chapter', entity_id=chapter_id). A unique constraint already exists on
(user_id, entity_type, entity_id); the additional index below targets the common
lookup pattern of filtering by user_id + entity_id without the entity_type filter.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "1d0e9a6b4f37"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # Postgres rejects it outright. autocommit_block() ends Alembic's
    # normally-open transaction for the duration of this block so each
    # statement runs and commits on its own.
    with op.get_context().autocommit_block():
        # user_learning_progress: composite index on (user_id, entity_id)
        # covers chapter / subject / video progress lookups by user
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_user_learning_progress_user_entity ON user_learning_progress (user_id, entity_id)"
        )

        # video_progress: composite index on (user_id, video_id)
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_video_progress_user_id_video_id ON video_progress (user_id, video_id)"
        )


def downgrade() -> None:
    op.drop_index("ix_user_learning_progress_user_entity", table_name="user_learning_progress")
    op.drop_index("ix_video_progress_user_id_video_id", table_name="video_progress")
