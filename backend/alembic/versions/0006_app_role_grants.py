"""least-privilege grants for the app_user role

The role itself is created outside migrations, because its password must not be in the repository:
by db/init locally, and by deploy/sql/create_app_role.sql on a hosted database. If the role does not
exist yet, this does nothing. deploy/sql/grant_app_role.sql applies the same grants later.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
            RAISE NOTICE 'Role app_user does not exist, so no grants were applied';
            RETURN;
          END IF;
          GRANT USAGE ON SCHEMA public TO app_user;
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
          -- History can be added to and read, never changed (defense in depth with ADR-025).
          REVOKE UPDATE, DELETE ON audit_logs, request_events FROM app_user;
          -- Readiness reads the revision. Only migrations may change it.
          REVOKE ALL ON alembic_version FROM app_user;
          GRANT SELECT ON alembic_version TO app_user;
          -- Tables from later migrations get ordinary access, as the migrating role creates them.
          ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
            RETURN;
          END IF;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public
            REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_user;
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user;
          REVOKE USAGE ON SCHEMA public FROM app_user;
        END
        $$;
        """
    )
