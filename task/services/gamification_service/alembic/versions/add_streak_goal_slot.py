"""daily goals: add STREAK as a 4th slot (auto-completes on app open)

Revision ID: 7c3f9a2e5d81
Revises: 5e9a2c74b1d6
Create Date: 2026-09-22

Adds 'STREAK' to both the `goaltype` and `goalslot` Postgres enums so admins
can author a GoalTemplate with slot=STREAK, goal_type=STREAK. No column or
constraint changes — GoalService.get_or_create_today already creates a 4th
row for any user once an active STREAK-slot template exists; existing users
simply pick up the new slot on their next read, same as every other
non-destructive goal-template addition.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "7c3f9a2e5d81"
down_revision: Union[str, None] = "5e9a2c74b1d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction and must be
    # committed before any later statement in this same deploy references
    # the new label — same autocommit_block() pattern as
    # add_multi_slot_daily_goals.py's AI_DOUBT addition.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE goaltype ADD VALUE IF NOT EXISTS 'STREAK'")
        op.execute("ALTER TYPE goalslot ADD VALUE IF NOT EXISTS 'STREAK'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for enums. A real downgrade would require
    # rebuilding both enum types (rename -> create old-shape type -> cast
    # every column -> drop renamed type), which is unsafe to do blindly if
    # any goal_templates/user_daily_goals row has already been created with
    # slot/goal_type = STREAK by the time someone downgrades. Fail loudly
    # instead of silently corrupting or losing those rows.
    raise NotImplementedError(
        "Cannot downgrade: Postgres enums have no DROP VALUE. Manually verify "
        "no goal_templates/user_daily_goals row uses STREAK before rebuilding "
        "the goaltype/goalslot enum types by hand."
    )
