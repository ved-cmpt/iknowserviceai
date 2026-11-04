import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import (
    Base,
    KnowledgeArticle,
    RequestComment,
    RequestEvent,
    ServiceRequest,
    User,
)
from app.db.models.enums import ArticleStatus, RequestStatus, Role
from app.scripts.reset_demo import reset_demo, reset_refusal
from app.scripts.seed_data import USERS
from app.scripts.seed_demo import seed_demo

DEMO_PASSWORD = "test-demo-password"


def _counts(db: Session) -> dict[str, int]:
    return {
        table.name: db.scalar(select(func.count()).select_from(table))
        for table in Base.metadata.sorted_tables
    }


def test_seed_twice_gives_identical_counts(db: Session) -> None:
    seed_demo(db, DEMO_PASSWORD)
    first = _counts(db)
    seed_demo(db, DEMO_PASSWORD)
    assert _counts(db) == first


def test_seed_contents_meet_requirements(db: Session) -> None:
    seed_demo(db, DEMO_PASSWORD)

    roles = db.scalars(select(User.role).where(User.email.like("%@demo.iknowservice.test"))).all()
    assert sorted(roles) == sorted(
        [Role.USER.value, Role.USER.value, Role.AGENT.value, Role.ADMIN.value]
    )

    statuses = db.scalars(select(KnowledgeArticle.status)).all()
    assert statuses.count(ArticleStatus.PUBLISHED) >= 12
    assert statuses.count(ArticleStatus.DRAFT) == 1

    categories = set(
        db.scalars(
            select(KnowledgeArticle.category).where(
                KnowledgeArticle.status == ArticleStatus.PUBLISHED
            )
        )
    )
    assert categories == {"ACCOUNT_ACCESS", "SOFTWARE", "HARDWARE", "NETWORK", "OTHER"}

    requests = db.scalars(select(ServiceRequest)).all()
    assert len(requests) >= 8
    assert {request.status for request in requests} == {status.value for status in RequestStatus}
    assert len({request.requester_id for request in requests}) == 2

    comments = db.scalars(select(RequestComment)).all()
    assert sum(comment.is_internal for comment in comments) == 1
    assert sum(not comment.is_internal for comment in comments) >= 2

    for request in requests:
        events = db.scalar(
            select(func.count())
            .select_from(RequestEvent)
            .where(RequestEvent.request_id == request.id)
        )
        assert events >= 1


def test_published_articles_are_labelled_demonstration_content(db: Session) -> None:
    seed_demo(db, DEMO_PASSWORD)
    for article in db.scalars(select(KnowledgeArticle)):
        assert "Demonstration content" in article.body_markdown
        assert "http://" not in article.body_markdown
        assert "https://" not in article.body_markdown


def test_all_demo_accounts_can_log_in(client: TestClient, db: Session) -> None:
    seed_demo(db, DEMO_PASSWORD)
    for spec in USERS:
        response = client.post(
            "/api/v1/auth/login", json={"email": spec["email"], "password": DEMO_PASSWORD}
        )
        assert response.status_code == 200
        assert response.json()["user"]["role"] == spec["role"].value


def test_seed_rejects_short_password(db: Session) -> None:
    with pytest.raises(ValueError, match="at least"):
        seed_demo(db, "short")


def test_reset_restores_seed_state(db: Session) -> None:
    seed_demo(db, DEMO_PASSWORD)
    expected = _counts(db)
    db.delete(db.scalar(select(RequestComment)))
    db.commit()
    assert _counts(db) != expected

    reset_demo(db, DEMO_PASSWORD)
    assert _counts(db) == expected


def _settings(**overrides: object) -> Settings:
    values = {
        "database_url": "postgresql+psycopg://x@y/z",
        "jwt_secret": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    }
    return Settings(**{**values, **overrides})


@pytest.mark.parametrize(
    ("settings", "confirmed", "allow_production", "refused"),
    [
        ({"allow_demo_reset": True}, True, False, False),
        ({"allow_demo_reset": True}, False, False, True),
        ({"allow_demo_reset": False}, True, False, True),
        ({"allow_demo_reset": True, "app_env": "production"}, True, False, True),
        ({"allow_demo_reset": True, "app_env": "production"}, True, True, False),
        ({"allow_demo_reset": False, "app_env": "production"}, True, True, True),
    ],
)
def test_reset_guards(
    settings: dict, confirmed: bool, allow_production: bool, refused: bool
) -> None:
    refusal = reset_refusal(
        _settings(**settings), confirmed=confirmed, allow_production=allow_production
    )
    assert (refusal is not None) is refused
