"""Idempotent demo seed: python -m app.scripts.seed_demo

Rows are keyed by email, slug or a stable UUID. Existing rows are left alone, so running the seed
twice changes nothing and any edits made through the app survive. Nothing runs this automatically,
and with APP_ENV=production it also needs --allow-production.
"""

import argparse
import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import hash_password
from app.db.models import KnowledgeArticle, RequestComment, RequestEvent, ServiceRequest, User
from app.db.models.enums import ArticleStatus, EventType, RequestStatus
from app.db.session import SessionLocal
from app.scripts import seed_data

SEED_NAMESPACE = uuid.UUID("6f1d2c1e-8a44-4f60-9a53-3d1f7b2e9c10")
MIN_DEMO_PASSWORD_LENGTH = 8


def stable_id(kind: str, key: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"{kind}:{key}")


def _seed_users(db: Session, password: str) -> dict[str, User]:
    users = {}
    for spec in seed_data.USERS:
        user = db.scalar(select(User).where(func.lower(User.email) == spec["email"]))
        if user is None:
            user = User(
                id=stable_id("user", spec["key"]),
                email=spec["email"],
                display_name=spec["display_name"],
                role=spec["role"].value,
                password_hash=hash_password(password),
            )
            db.add(user)
        users[spec["key"]] = user
    db.flush()
    return users


def _seed_article(db: Session, spec: dict, status: ArticleStatus, updated_by: uuid.UUID) -> None:
    exists = db.scalar(select(KnowledgeArticle.id).where(KnowledgeArticle.slug == spec["slug"]))
    if exists is not None:
        return
    db.add(
        KnowledgeArticle(
            id=stable_id("article", spec["slug"]),
            slug=spec["slug"],
            title=spec["title"],
            body_markdown=spec["body"] + seed_data.DEMO_LABEL,
            category=spec["category"].value,
            tags=spec["tags"],
            status=status.value,
            updated_by=updated_by,
        )
    )


def _seed_request(db: Session, spec: dict, users: dict[str, User], now: datetime) -> None:
    request_id = stable_id("request", spec["key"])
    if db.get(ServiceRequest, request_id) is not None:
        return

    created_at = now - timedelta(days=spec["days_ago"])
    requester = users[spec["requester"]]
    path = spec["path"]
    status = path[-1] if path else RequestStatus.NEW
    assignee = users[spec["assignee"]] if spec.get("assignee") else None
    resolved_at = (
        created_at + timedelta(hours=len(path))
        if status in (RequestStatus.RESOLVED, RequestStatus.CLOSED)
        else None
    )

    db.add(
        ServiceRequest(
            id=request_id,
            requester_id=requester.id,
            assigned_agent_id=assignee.id if assignee else None,
            title=spec["title"],
            description=spec["description"],
            category=spec["category"].value,
            priority=spec["priority"].value,
            status=status.value,
            created_at=created_at,
            updated_at=created_at + timedelta(hours=len(path)),
            resolved_at=resolved_at,
        )
    )
    db.flush()

    db.add(
        RequestEvent(
            id=stable_id("event", f"{spec['key']}:created"),
            request_id=request_id,
            actor_id=requester.id,
            event_type=EventType.REQUEST_CREATED.value,
            details={},
            created_at=created_at,
        )
    )
    previous = RequestStatus.NEW
    staff = assignee or users["alex"]
    for step, next_status in enumerate(path, start=1):
        db.add(
            RequestEvent(
                id=stable_id("event", f"{spec['key']}:status:{step}"),
                request_id=request_id,
                # The AI service owns ANALYZING, so that system step has no human actor.
                actor_id=None if next_status == RequestStatus.ANALYZING else staff.id,
                event_type=EventType.STATUS_CHANGED.value,
                details={"from": previous.value, "to": next_status.value},
                created_at=created_at + timedelta(hours=step),
            )
        )
        previous = next_status
    if assignee:
        db.add(
            RequestEvent(
                id=stable_id("event", f"{spec['key']}:assigned"),
                request_id=request_id,
                actor_id=assignee.id,
                event_type=EventType.ASSIGNED.value,
                details={"assignee_id": str(assignee.id)},
                created_at=created_at + timedelta(minutes=30),
            )
        )


def _seed_comment(db: Session, spec: dict, users: dict[str, User], now: datetime) -> None:
    comment_id = stable_id("comment", spec["key"])
    if db.get(RequestComment, comment_id) is not None:
        return

    request_id = stable_id("request", spec["request"])
    request = db.get(ServiceRequest, request_id)
    author = users[spec["author"]]
    is_internal = spec.get("is_internal", False)
    # Keep the comment before the request's last update and before "now".
    created_at = min(request.updated_at, now) - timedelta(minutes=10)

    db.add(
        RequestComment(
            id=comment_id,
            request_id=request_id,
            author_id=author.id,
            body=spec["body"],
            is_internal=is_internal,
            created_at=created_at,
        )
    )
    db.add(
        RequestEvent(
            id=stable_id("event", f"comment:{spec['key']}"),
            request_id=request_id,
            actor_id=author.id,
            event_type=EventType.COMMENT_ADDED.value,
            details={"comment_id": str(comment_id), "is_internal": is_internal},
            created_at=created_at,
        )
    )


def seed_demo(db: Session, password: str) -> None:
    """Insert any missing demo rows. Commits."""
    if len(password) < MIN_DEMO_PASSWORD_LENGTH:
        raise ValueError(f"DEMO_PASSWORD must be at least {MIN_DEMO_PASSWORD_LENGTH} characters")

    now = datetime.now(UTC)
    users = _seed_users(db, password)
    admin_id = users["jordan"].id

    for spec in seed_data.ARTICLES:
        _seed_article(db, spec, ArticleStatus.PUBLISHED, admin_id)
    _seed_article(db, seed_data.DRAFT_ARTICLE, ArticleStatus.DRAFT, admin_id)

    for spec in seed_data.REQUESTS:
        _seed_request(db, spec, users, now)
    db.flush()
    for spec in seed_data.COMMENTS:
        _seed_comment(db, spec, users, now)

    db.commit()


def seed_refusal(settings: Settings, *, allow_production: bool) -> str | None:
    """Return why the seed must not run, or None if it may."""
    if settings.is_production and not allow_production:
        return "Refusing to seed in production without --allow-production."
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Insert any missing demo rows.")
    parser.add_argument("--allow-production", action="store_true", help="permit APP_ENV=production")
    args = parser.parse_args(argv)

    settings = get_settings()
    refusal = seed_refusal(settings, allow_production=args.allow_production)
    if refusal:
        print(refusal, file=sys.stderr)
        return 1
    password = settings.demo_password
    if not password:
        print("DEMO_PASSWORD is not set.", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        seed_demo(db, password)
        users = db.scalar(select(func.count()).select_from(User))
        articles = db.scalar(select(func.count()).select_from(KnowledgeArticle))
        requests = db.scalar(select(func.count()).select_from(ServiceRequest))
    print(f"Seed complete: {users} users, {articles} articles, {requests} requests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
