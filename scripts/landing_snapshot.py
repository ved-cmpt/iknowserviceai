"""Writes or checks the website's data snapshot (ADR-064).

    python scripts/landing_snapshot.py           # Write frontend/public/data/landing-snapshot.json
    python scripts/landing_snapshot.py --check   # Fail if it differs from a fresh run

The work is done by backend/app/scripts/landing_snapshot.py: real mock-mode runs of the real
pipeline on a fresh demo seed, inside a transaction that is rolled back. This wrapper runs it in
this Python when the backend's dependencies and DATABASE_URL are available, as in CI, and otherwise
in the development stack's backend container.
"""

import argparse
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "frontend" / "public" / "data" / "landing-snapshot.json"
MODULE = "app.scripts.landing_snapshot"


def commit() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return (result.stdout.strip() or None) if result.returncode == 0 else None


def in_process(args: list[str]) -> int:
    sys.path.insert(0, str(ROOT / "backend"))
    # Imported here, because it needs the path above.
    from app.scripts.landing_snapshot import main

    return main(args)


def in_container(args: list[str], stdin: bytes | None = None) -> subprocess.CompletedProcess:
    command = ["docker", "compose", "exec", "-T", "backend", "python", "-m", MODULE, *args]
    env = {**os.environ, "MSYS_NO_PATHCONV": "1"}
    return subprocess.run(command, cwd=ROOT, input=stdin, capture_output=True, env=env, check=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="Compare with a fresh run")
    check = parser.parse_args().check
    local = os.environ.get("DATABASE_URL") and importlib.util.find_spec("sqlalchemy")

    if check:
        if local:
            return in_process(["--check", str(SNAPSHOT)])
        result = in_container(["--check", "/dev/stdin"], stdin=SNAPSHOT.read_bytes())
        sys.stdout.write(result.stdout.decode())
        sys.stderr.write(result.stderr.decode())
        return result.returncode

    args = ["--commit", commit() or "unknown"]
    if local:
        return in_process(["--out", str(SNAPSHOT), *args])
    result = in_container(["--out", "-", *args])
    if result.returncode != 0:
        sys.stderr.write(result.stderr.decode())
        return result.returncode
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_bytes(result.stdout)
    print(f"Wrote {SNAPSHOT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
