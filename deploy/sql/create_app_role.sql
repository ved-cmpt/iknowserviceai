-- Hosted databases: run once as the owner role, BEFORE the first `alembic upgrade head`.
-- Then migration 0006 grants the access. Replace the placeholder with a generated password,
-- and do not save the edited file.
CREATE ROLE app_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '<replace-with-a-generated-password>';
