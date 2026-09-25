"""add optional target_board/target_class visibility filter

Revision ID: 2a7c1f5e9b04
Revises: 1d0e9a6b4f37
Create Date: 2026-09-18

Adds an independent, optional (board, class) visibility filter to videos and
notes, and relaxes previous_year_papers.board/class_num from required to
optional, so admins can mark any of these "for everyone" (both NULL), scoped
to one board only, one class only, or a specific board+class pair. NULL on
either axis means no restriction on that axis.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "2a7c1f5e9b04"
down_revision: Union[str, None] = "1d0e9a6b4f37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("target_board", sa.String(length=100), nullable=True))
    op.add_column("videos", sa.Column("target_class", sa.Integer(), nullable=True))
    op.add_column("notes", sa.Column("target_board", sa.String(length=100), nullable=True))
    op.add_column("notes", sa.Column("target_class", sa.Integer(), nullable=True))

    op.alter_column("previous_year_papers", "board", existing_type=sa.String(length=30), nullable=True)
    op.alter_column("previous_year_papers", "class_num", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.drop_column("videos", "target_board")
    op.drop_column("videos", "target_class")
    op.drop_column("notes", "target_board")
    op.drop_column("notes", "target_class")

    # Existing rows are guaranteed non-NULL from before this migration, but a
    # row created while board/class were nullable would violate the
    # downgrade's NOT NULL — that's an accepted risk of reverting a schema
    # relaxation, not something this migration can resolve automatically.
    op.alter_column("previous_year_papers", "board", existing_type=sa.String(length=30), nullable=False)
    op.alter_column("previous_year_papers", "class_num", existing_type=sa.Integer(), nullable=False)
