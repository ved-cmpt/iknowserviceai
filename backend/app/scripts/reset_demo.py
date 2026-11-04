"""Delete all data and reseed: python -m app.scripts.reset_demo --yes

Refuses unless ALLOW_DEMO_RESET=true. Refuses in production unless --allow-production is passed.
"""

import argparse
import sys

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import Base
from app.db.session import SessionLocal
from app.scripts.seed_demo import seed_demo


def reset_refusal(settings: Settings, *, confirmed: bool, allow_production: bool) -> str | None:
    """Return why the reset must not run, or None if it may."""
    if not confirmed:
        return "Refusing to reset without --yes."
    if not settings.allow_demo_reset:
        return "Refusing to reset: ALLOW_DEMO_RESET is not true."
    if settings.is_production and not allow_production:
        return "Refusing to reset in production without --allow-production."
    return None


def reset_demo(db: Session, password: str) -> None:
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} CASCADE"))
    seed_demo(db, password)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Delete all demo data and reseed it.")
    parser.add_argument("--yes", action="store_true", help="confirm deleting all data")
    parser.add_argument("--allow-production", action="store_true", help="permit APP_ENV=production")
    args = parser.parse_args(argv)

    settings = get_settings()
    refusal = reset_refusal(settings, confirmed=args.yes, allow_production=args.allow_production)
    if refusal:
        print(refusal, file=sys.stderr)
        return 1
    if not settings.demo_password:
        print("DEMO_PASSWORD is not set.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        reset_demo(db, settings.demo_password)
    print("Demo data reset complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
