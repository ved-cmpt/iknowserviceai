#!/bin/sh
# Runs once, when the database volume is first initialized. Creates the least-privilege role the
# app connects as (ADR-047). Migration 0006 grants its access. On a hosted database, use
# deploy/sql/create_app_role.sql instead.
set -eu

psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE app_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'app_password';
SQL
