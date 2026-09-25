"""add payment idempotency constraint

Revision ID: 8a1f4c9d2b3e
Revises: 5c7d1a3e8f20
Create Date: 2026-09-25

create_order() checks for an existing CREATED/AUTHORIZED payment for the
same (user_id, plan_key) before inserting a new one, but that
SELECT-then-INSERT is not atomic — two near-simultaneous requests (a
double-tap on a slow mobile connection, a client retry racing the first
attempt) can both pass the SELECT before either commits, producing two
separate chargeable orders for the same user+plan.

A partial unique index makes the real constraint live in the database, not
just in application code: at most one CREATED/AUTHORIZED payment per
(user_id, plan_key) can exist at a time. CAPTURED/FAILED/REFUNDED rows are
excluded from the index (a user can legitimately have many of those over
time — only the "still open" set must be unique), matching the exact set of
statuses create_order()'s SELECT already checks against.

The service layer (cashfree_service.py) additionally catches the resulting
IntegrityError on a losing INSERT and re-queries to return the winning
request's payment instead of surfacing a 500 to the client.

Pre-flight data fix: live data already has duplicate open (CREATED/
AUTHORIZED) rows per (user_id, plan_key) — up to 146 for one student — from
exactly the race this migration closes. CREATE UNIQUE INDEX fails outright
if violating rows exist, so upgrade() first marks every open duplicate
EXCEPT the most recently created one per group as FAILED with an
explanatory error_description, before creating the index. Nothing is
deleted; every row stays queryable/auditable, just no longer "open."
"""
from typing import Sequence, Union

from alembic import op

revision: str = "8a1f4c9d2b3e"
down_revision: Union[str, None] = "5c7d1a3e8f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CLEANUP_SQL = """
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY user_id, plan_key
               ORDER BY created_at DESC
           ) AS rn
    FROM payments
    WHERE status IN ('CREATED', 'AUTHORIZED')
)
UPDATE payments
SET status = 'FAILED',
    error_description = 'Superseded duplicate order — closed by the 2026-09-25 '
                         'idempotency migration (pre-existing race condition, '
                         'not a real payment attempt)'
FROM ranked
WHERE payments.id = ranked.id AND ranked.rn > 1
"""


def upgrade() -> None:
    op.execute(_CLEANUP_SQL)
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "
            "uq_payments_user_plan_open ON payments (user_id, plan_key) "
            "WHERE status IN ('CREATED', 'AUTHORIZED')"
        )


def downgrade() -> None:
    op.drop_index("uq_payments_user_plan_open", table_name="payments")
