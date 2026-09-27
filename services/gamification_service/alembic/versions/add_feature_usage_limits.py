"""feature usage limits: admin-configurable cross-service quotas

Revision ID: 9f4d6c8a1b2e
Revises: 7c3f9a2e5d81
Create Date: 2026-09-22

Adds `feature_limits` (admin-editable free/premium daily limit per feature
key — video watching, quiz attempts, battle play, chat, and every AI
feature) and `feature_usage_log` (durable per-user-per-feature-per-day
count, DB fallback for the Redis-first counter in FeatureUsageService).

Replaces `free_tier_usage`, confirmed empty in production (nothing ever
called POST /gamification/free-tier/increment — see
FreeTierService.increment's sole caller graph, which was dead) — dropped
here rather than migrated, since there is no data to preserve.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "9f4d6c8a1b2e"
down_revision: Union[str, None] = "7c3f9a2e5d81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrors app/models/gamification.py's FEATURE_LIMIT_SEED — kept in sync by
# hand since Alembic migrations must not import application code (the
# model file can change after this migration is written and applied).
FEATURE_LIMIT_SEED = {
    "ai_questions":      {"free": 3,  "premium": None},
    "ai_quiz":           {"free": 3,  "premium": None},
    "ai_paper":          {"free": 3,  "premium": None},
    "ai_custom":         {"free": 3,  "premium": None},
    "flashcards":        {"free": 3,  "premium": None},
    "revision_plan":     {"free": 1,  "premium": None},
    "ai_chat":           {"free": 5,  "premium": None},
    "mistake_analysis":  {"free": 3,  "premium": None},
    "video_watch":       {"free": 5,  "premium": None},
    "quiz_attempt":      {"free": 3,  "premium": None},
    "battle_play":       {"free": 3,  "premium": None},
    "chat_message":      {"free": 50, "premium": None},
    "chat_group_create": {"free": 1,  "premium": None},
    "friend_request":    {"free": 10, "premium": None},
}


def upgrade() -> None:
    op.create_table(
        "feature_limits",
        sa.Column("feature_key", sa.String(length=50), primary_key=True),
        sa.Column("free_daily_limit", sa.Integer(), nullable=True),
        sa.Column("premium_daily_limit", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "feature_usage_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feature_key", sa.String(length=50), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_feature_usage_log_user_id", "feature_usage_log", ["user_id"])
    op.create_index("ix_feature_usage_log_feature_key", "feature_usage_log", ["feature_key"])
    op.create_index("ix_feature_usage_log_usage_date", "feature_usage_log", ["usage_date"])
    op.create_unique_constraint(
        "uq_feature_usage_user_feature_date", "feature_usage_log",
        ["user_id", "feature_key", "usage_date"],
    )

    # Seed every known feature so the admin page shows real rows (with
    # real updated_at timestamps) from the first load, not just in-memory
    # defaults — FeatureLimitService.get_all() falls back to the same seed
    # values anyway, so this is a convenience, not a correctness requirement.
    feature_limits_table = sa.table(
        "feature_limits",
        sa.column("feature_key", sa.String),
        sa.column("free_daily_limit", sa.Integer),
        sa.column("premium_daily_limit", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(feature_limits_table, [
        {
            "feature_key": key,
            "free_daily_limit": limits["free"],
            "premium_daily_limit": limits["premium"],
            "is_active": True,
        }
        for key, limits in FEATURE_LIMIT_SEED.items()
    ])

    op.drop_table("free_tier_usage")


def downgrade() -> None:
    op.create_table(
        "free_tier_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("ai_queries", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_starts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quiz_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "usage_date", name="uq_free_tier_usage_user_date"),
    )
    op.drop_table("feature_usage_log")
    op.drop_table("feature_limits")
