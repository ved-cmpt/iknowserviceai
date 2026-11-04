"""demo_state table, and the narrow function that lets the app role start a demo reset

The app role must not be able to truncate (ADR-047), but the public demo resets itself (ADR-051).
demo_reset_begin() runs as the migrating role, and only empties the demo tables when the owner has
set demo_state.reset_enabled, the interval has passed, and it wins an advisory lock. The caller
then reseeds in the same transaction, so a failed reseed rolls the whole reset back.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "demo_state",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("reset_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name="ck_demo_state_single_row"),
    )
    op.execute("INSERT INTO demo_state (id, reset_enabled) VALUES (1, false)")

    op.execute(
        """
        CREATE FUNCTION demo_reset_begin(min_interval_hours integer) RETURNS boolean
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public, pg_temp
        SET lock_timeout = '5s'
        AS $$
        DECLARE
          enabled boolean;
          last_reset timestamptz;
        BEGIN
          -- Held until the caller commits, so only one reset can ever be in progress.
          IF NOT pg_try_advisory_xact_lock(7262501) THEN
            RETURN false;
          END IF;
          SELECT reset_enabled, last_reset_at INTO enabled, last_reset
            FROM demo_state WHERE id = 1;
          IF enabled IS NOT TRUE THEN
            RETURN false;
          END IF;
          -- The floor stops a compromised app role from wiping the demo repeatedly.
          IF last_reset IS NOT NULL AND clock_timestamp() - last_reset
               < make_interval(hours => GREATEST(min_interval_hours, 1)) THEN
            RETURN false;
          END IF;
          TRUNCATE ai_runs, ai_suggestions, audit_logs, knowledge_articles, refresh_tokens,
            request_comments, request_events, request_feedback, service_requests, users CASCADE;
          UPDATE demo_state SET last_reset_at = clock_timestamp() WHERE id = 1;
          RETURN true;
        END
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION demo_reset_begin(integer) FROM PUBLIC")
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
            RETURN;
          END IF;
          -- Read-only: otherwise the default privileges would let the role enable resets.
          REVOKE ALL ON demo_state FROM app_user;
          GRANT SELECT ON demo_state TO app_user;
          GRANT EXECUTE ON FUNCTION demo_reset_begin(integer) TO app_user;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION demo_reset_begin(integer)")
    op.drop_table("demo_state")
