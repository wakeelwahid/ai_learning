"""add performance indexes

Revision ID: 3f8a2c1d7e94
Revises:
Create Date: 2026-06-16

Adds indexes to improve query performance:
  - quiz_answers: index on attempt_id
  - questions:   index on quiz_id
"""
from typing import Sequence, Union

from alembic import op

revision: str = "3f8a2c1d7e94"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block —
    # Postgres rejects it outright. autocommit_block() ends Alembic's
    # normally-open transaction for the duration of this block so each
    # statement runs and commits on its own.
    with op.get_context().autocommit_block():
        # quiz_answers: index on attempt_id
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_quiz_answers_attempt_id ON quiz_answers (attempt_id)"
        )

        # questions: index on quiz_id
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_questions_quiz_id ON questions (quiz_id)"
        )


def downgrade() -> None:
    op.drop_index("ix_quiz_answers_attempt_id", table_name="quiz_answers")
    op.drop_index("ix_questions_quiz_id", table_name="questions")
