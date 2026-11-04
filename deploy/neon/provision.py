"""Provision the hosted demo database, from a workstation. See docs/DEPLOYMENT.md.

Runs inside the production image, with the repository mounted at /work:

    docker run --rm -v "${PWD}:/work" iknowserviceai:local python /work/deploy/neon/provision.py

It reads NEON_OWNER_DATABASE_URL and DEMO_PASSWORD from /work/.env. It creates app_user or rotates
its password, migrates, seeds twice, enables the daily reset, checks what app_user can and cannot
do, then writes /work/.env.render and adds NEON_APP_DATABASE_URL to /work/.env, both git-ignored.

Safe to repeat. A repeat rotates the app_user password and JWT secret, so paste .env.render into the
host again. It only ever prints versions, names, counts and pass or fail: never a URL or password.
"""

import os
import re
import secrets
import string
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql

WORK = Path("/work")
APP_ROLE = "app_user"
ALPHABET = string.ascii_letters + string.digits


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Z0-9_]+)=(.*)$", line)
        if match:
            values[match.group(1)] = match.group(2).strip().strip("\"'")
    return values


def plain_url(url: str) -> str:
    """What libpq expects, whichever scheme the URL arrived with."""
    return re.sub(r"^postgres(ql)?(\+\w+)?://", "postgresql://", url)


def sqlalchemy_url(url: str, *, user: str | None = None, password: str | None = None) -> str:
    parts = urlsplit(plain_url(url))
    netloc = parts.netloc
    if user is not None:
        netloc = f"{user}:{password}@{parts.hostname}"
        if parts.port:
            netloc += f":{parts.port}"
    return urlunsplit(("postgresql+psycopg", netloc, parts.path, parts.query, ""))


def generate(length: int) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def report(name: str, passed: bool) -> bool:
    print(f"  {'pass' if passed else 'FAIL'}: {name}")
    return passed


def show_connection(owner_url: str) -> None:
    host = urlsplit(plain_url(owner_url)).hostname or ""
    suffix = ".".join(host.split(".")[1:])
    with psycopg.connect(plain_url(owner_url), connect_timeout=30) as connection:
        row = connection.execute(
            "SELECT current_setting('server_version_num')::int / 10000, current_database(),"
            " current_user"
        ).fetchone()
    print(f"Connected: host suffix ...{suffix}, server {row[0]}, database {row[1]}, role {row[2]}")
    if row[0] < 17:
        raise SystemExit("PostgreSQL 17 or newer is required.")
    if row[0] != 17:
        print(f"  Note: development and CI use PostgreSQL 17, and this server is {row[0]} (ADR-054).")


def create_or_rotate_role(owner_url: str, password: str) -> None:
    with psycopg.connect(plain_url(owner_url), autocommit=True) as connection:
        exists = connection.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s", (APP_ROLE,)
        ).fetchone()
        attributes = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS"
        verb = "ALTER" if exists else "CREATE"
        # Neon refuses pre-hashed passwords, so this cannot use encrypt_password.
        connection.execute(
            sql.SQL(f"{verb} ROLE {{}} {attributes} PASSWORD {{}}").format(
                sql.Identifier(APP_ROLE), sql.Literal(password)
            )
        )
        print(f"Role {APP_ROLE}: {'password rotated' if exists else 'created'}")


def run_quietly(label: str, command: list[str], env: dict[str, str]) -> str:
    """Run a one-off command. Its output stays hidden unless asked for, because it could hold a URL."""
    result = subprocess.run(  # noqa: S603 - fixed commands
        command, cwd="/app", env=env, capture_output=True, text=True, check=False
    )
    print(f"{label}: exit {result.returncode}")
    if result.returncode != 0:
        raise SystemExit(f"{label} failed. Run it by hand to see why.")
    return result.stdout + result.stderr


def verify_app_role(app_url: str) -> bool:
    print(f"As {APP_ROLE}:")
    ok = True
    with psycopg.connect(plain_url(app_url), autocommit=True) as connection:
        row = connection.execute(
            "SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit,"
            " pg_has_role(current_user, 'neon_superuser', 'MEMBER')"
            " FROM pg_roles WHERE rolname = current_user"
            if connection.execute(
                "SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser'"
            ).fetchone()
            else "SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls,"
            " rolinherit, false FROM pg_roles WHERE rolname = current_user"
        ).fetchone()
        ok &= report("connects as app_user", row[0] == APP_ROLE)
        ok &= report(
            "no superuser, createdb, createrole or bypassrls", row[1:5] == (False,) * 4
        )
        ok &= report("no inherited rights", row[5] is False)
        ok &= report("not a member of neon_superuser", row[6] is False)
        owned = connection.execute(
            "SELECT count(*) FROM pg_tables WHERE tableowner = current_user"
        ).fetchone()[0]
        ok &= report("owns no tables", owned == 0)

        for statement in (
            "UPDATE audit_logs SET action = 'tampered'",
            "DELETE FROM audit_logs",
            "UPDATE request_events SET event_type = 'tampered'",
            "DELETE FROM request_events",
            "TRUNCATE audit_logs",
            "TRUNCATE service_requests CASCADE",
            "CREATE TABLE sneaky (id int)",
            "DROP TABLE audit_logs",
            "ALTER TABLE users ADD COLUMN sneaky text",
            "UPDATE alembic_version SET version_num = 'x'",
            "UPDATE demo_state SET reset_enabled = false",
        ):
            try:
                connection.execute(statement)
                ok &= report(f"refused: {statement}", False)
            except psycopg.errors.InsufficientPrivilege:
                ok &= report(f"refused: {statement}", True)

        # What it must be able to do, rolled back so nothing stays.
        connection.autocommit = False
        try:
            users = connection.execute("SELECT count(*) FROM users").fetchone()[0]
            ok &= report("can read users", users > 0)
            connection.execute(
                "INSERT INTO audit_logs (entity_type, action) VALUES ('auth', 'provision.check')"
            )
            connection.execute("UPDATE service_requests SET updated_at = updated_at")
            ok &= report("can insert history and update requests", True)
        except psycopg.Error:
            ok &= report("can insert history and update requests", False)
        connection.rollback()
    return ok


def verify_reset(owner_url: str, app_url: str, demo_password: str) -> bool:
    """Runs the real reset as app_user. The backdated timestamp makes it due."""
    os.environ.update(
        DATABASE_URL=sqlalchemy_url(app_url),
        JWT_SECRET=generate(48),
        APP_ENV="production",
        DEMO_MODE="true",
        DEMO_PASSWORD=demo_password,
        AI_MODE="mock",
    )
    sys.path.insert(0, "/app")
    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.services.demo import reset_if_due

    settings = get_settings()
    print("Demo reset:")
    with psycopg.connect(plain_url(owner_url), autocommit=True) as owner:
        owner.execute("INSERT INTO audit_logs (entity_type, action) VALUES ('auth', 'clutter')")
        owner.execute(
            "UPDATE demo_state SET last_reset_at = clock_timestamp() - interval '25 hours'"
        )
        ok = report("runs as app_user when due", reset_if_due(settings, SessionLocal) is True)
        ok &= report("skips when not due", reset_if_due(settings, SessionLocal) is False)
        clutter = owner.execute(
            "SELECT count(*) FROM audit_logs WHERE action = 'clutter'"
        ).fetchone()[0]
        ok &= report("removed the added row", clutter == 0)
        users = owner.execute("SELECT count(*) FROM users").fetchone()[0]
        ok &= report("reseeded", users == 4)
    return ok


def write_secret_files(app_url: str, jwt_secret: str) -> None:
    render = WORK / ".env.render"
    render.write_text(
        "# Do not commit or share. Paste into Render -> Environment -> Add from .env.\n"
        f"DATABASE_URL={app_url}\n"
        f"JWT_SECRET={jwt_secret}\n"
        "GEMINI_API_KEY=\n",
        encoding="utf-8",
    )
    env_path = WORK / ".env"
    text = env_path.read_text(encoding="utf-8")
    newline = "\r\n" if "\r\n" in text else "\n"
    line = f"NEON_APP_DATABASE_URL={app_url}"
    if re.search(r"^NEON_APP_DATABASE_URL=.*$", text, flags=re.M):
        text = re.sub(r"^NEON_APP_DATABASE_URL=[^\r\n]*", lambda _: line, text, flags=re.M)
    else:
        text = text.rstrip("\r\n") + newline + line + newline
    env_path.write_text(text, encoding="utf-8", newline="")
    print("Wrote .env.render, and NEON_APP_DATABASE_URL in .env")


def main() -> int:
    env = read_env(WORK / ".env")
    owner_url = env.get("NEON_OWNER_DATABASE_URL")
    demo_password = env.get("DEMO_PASSWORD")
    if not owner_url or not demo_password:
        raise SystemExit("NEON_OWNER_DATABASE_URL and DEMO_PASSWORD must be set in .env")

    show_connection(owner_url)
    password = generate(40)
    jwt_secret = generate(64)
    app_url = sqlalchemy_url(owner_url, user=APP_ROLE, password=password)
    create_or_rotate_role(owner_url, password)

    command_env = {
        "PATH": os.environ["PATH"],
        "APP_ENV": "production",
        "AI_MODE": "mock",
        "DATABASE_URL": app_url,
        "MIGRATION_DATABASE_URL": sqlalchemy_url(owner_url),
        "JWT_SECRET": jwt_secret,
        "DEMO_PASSWORD": demo_password,
        "PYTHONPATH": "/app",
    }
    run_quietly("alembic upgrade head", ["alembic", "upgrade", "head"], command_env)
    grants = (WORK / "deploy/sql/grant_app_role.sql").read_text(encoding="utf-8")
    with psycopg.connect(plain_url(owner_url), autocommit=True) as connection:
        connection.execute(grants)
        head = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    print(f"Grants applied. Database revision: {head}")
    run_quietly("alembic check", ["alembic", "check"], command_env)

    seed = ["python", "-m", "app.scripts.seed_demo", "--allow-production"]
    for attempt in (1, 2):
        output = run_quietly(f"seed {attempt}", seed, command_env)
        counts = re.search(r"Seed complete: [\d\w ,]+\.", output)
        print(f"  {counts.group(0) if counts else 'no counts reported'}")

    enable = (WORK / "deploy/sql/enable_demo_reset.sql").read_text(encoding="utf-8")
    with psycopg.connect(plain_url(owner_url), autocommit=True) as connection:
        connection.execute(enable)
    print("Daily demo reset enabled on this database.")

    ok = verify_app_role(app_url)
    ok &= verify_reset(owner_url, app_url, demo_password)
    if not ok:
        print("Some checks failed, so no secret files were written.")
        return 1
    write_secret_files(app_url, jwt_secret)
    print("Provisioning complete.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except psycopg.Error as error:
        # The class name only: a driver message can quote connection details.
        print(f"Database error: {type(error).__name__}", file=sys.stderr)
        sys.exit(1)
