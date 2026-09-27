"""daily goals v2: 3 fixed slots/day (video/quiz/ai_doubt) instead of 1 random goal

Revision ID: 5e9a2c74b1d6
Revises: 3a7c1d5e8f21
Create Date: 2026-09-23

Adds the GoalSlot enum + a `slot` column to both `goal_templates` and
`user_daily_goals`, adds `assigned_video_ids`/`assigned_quiz_id` to
`user_daily_goals` for personalized content pinning, and moves the unique
constraint on `user_daily_goals` from (user_id, goal_date) to
(user_id, goal_date, slot) so a user can hold up to 3 rows per day (one per
slot) instead of just 1.

Non-destructive: existing `goal_templates`/`user_daily_goals` rows are
backfilled with `slot` derived from their existing `goal_type` (quiz/
questions -> quiz slot, ai_doubt -> ai_doubt slot, everything else
(video/practice_minutes) -> video slot) rather than dropped or reset — no
row is deleted and no historical XP/EP/completion state is touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "5e9a2c74b1d6"
down_revision: Union[str, None] = "3a7c1d5e8f21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

goal_slot_enum = postgresql.ENUM("VIDEO", "QUIZ", "AI_DOUBT", name="goalslot")


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
    # older Postgres versions and, even where it can, must be committed
    # before the new label is usable in the SAME migration's later
    # statements (the backfill below compares goal_type against 'AI_DOUBT').
    # autocommit_block() ends Alembic's normally-open transaction so this
    # commits immediately, mirroring the existing pattern in
    # add_award_dedup_indexes.py for CONCURRENTLY.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE goaltype ADD VALUE IF NOT EXISTS 'AI_DOUBT'")

    goal_slot_enum.create(op.get_bind(), checkfirst=True)

    # ── goal_templates: add slot, backfill from goal_type, drop the default ──
    # NOTE: existing goal_type values are stored as the Python Enum MEMBER
    # NAME (e.g. 'QUIZ'), not its .value ('quiz') — SQLAlchemy's Enum()
    # column type does this by default with no values_callable configured
    # here, confirmed against the live DB before writing this migration.
    # The new goalslot enum follows the same (uppercase-name) convention for
    # consistency with every other Enum column already in this schema.
    op.add_column(
        "goal_templates",
        sa.Column("slot", goal_slot_enum, nullable=True),
    )
    op.execute(
        """
        UPDATE goal_templates
        SET slot = CASE
            WHEN goal_type IN ('QUIZ', 'QUESTIONS') THEN 'QUIZ'
            WHEN goal_type = 'AI_DOUBT' THEN 'AI_DOUBT'
            ELSE 'VIDEO'
        END::goalslot
        """
    )
    op.alter_column("goal_templates", "slot", nullable=False)

    # ── user_daily_goals: add slot + personalization columns ────────────────
    op.add_column(
        "user_daily_goals",
        sa.Column("slot", goal_slot_enum, nullable=True),
    )
    op.execute(
        """
        UPDATE user_daily_goals
        SET slot = CASE
            WHEN goal_type IN ('QUIZ', 'QUESTIONS') THEN 'QUIZ'
            WHEN goal_type = 'AI_DOUBT' THEN 'AI_DOUBT'
            ELSE 'VIDEO'
        END::goalslot
        """
    )
    op.alter_column("user_daily_goals", "slot", nullable=False)

    op.add_column(
        "user_daily_goals",
        sa.Column("assigned_video_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "user_daily_goals",
        sa.Column("assigned_quiz_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # ── Swap the unique constraint: (user_id, goal_date) -> (user_id, goal_date, slot) ──
    op.drop_constraint("uq_daily_goal_user_date", "user_daily_goals", type_="unique")
    op.create_unique_constraint(
        "uq_daily_goal_user_date_slot", "user_daily_goals", ["user_id", "goal_date", "slot"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_daily_goal_user_date_slot", "user_daily_goals", type_="unique")
    # Downgrade path assumes a fresh (user_id, goal_date) is unique again —
    # only safe if, by the time anyone downgrades, at most one row/day/user
    # exists (e.g. a rollback shortly after upgrading, before 3-slot rows
    # accumulated). We do NOT delete extra rows here; if duplicates exist,
    # re-creating this constraint will fail loudly rather than silently drop
    # data, which is the correct failure mode.
    op.create_unique_constraint(
        "uq_daily_goal_user_date", "user_daily_goals", ["user_id", "goal_date"],
    )
    op.drop_column("user_daily_goals", "assigned_quiz_id")
    op.drop_column("user_daily_goals", "assigned_video_ids")
    op.drop_column("user_daily_goals", "slot")
    op.drop_column("goal_templates", "slot")
    goal_slot_enum.drop(op.get_bind(), checkfirst=True)
