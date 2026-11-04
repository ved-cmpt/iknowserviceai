-- Only needed if app_user was created after migration 0006 ran. Run as the owner role.
-- These are the same statements as that migration, and they are safe to repeat.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
REVOKE UPDATE, DELETE ON audit_logs, request_events FROM app_user;
REVOKE ALL ON alembic_version FROM app_user;
GRANT SELECT ON alembic_version TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
-- From migration 0007: the app role can read the demo switch, and call the narrow reset function.
REVOKE ALL ON demo_state FROM app_user;
GRANT SELECT ON demo_state TO app_user;
GRANT EXECUTE ON FUNCTION demo_reset_begin(integer) TO app_user;
