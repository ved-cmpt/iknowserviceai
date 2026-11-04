"""MockAgent cites the top-ranked article, and a second only when it is close and on-topic."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.models.enums import Category, Priority
from app.scripts.seed_demo import seed_demo
from app.services.ai.base import AgentArticle, AgentInput
from app.services.ai.mock import MockAgent
from app.services.ai.prompts import PROMPT_VERSION, build_prompt
from tests.conftest import auth

REQUESTS = "/api/v1/requests"


def _article(title: str, category: str, rank: float) -> AgentArticle:
    return AgentArticle(uuid.uuid4(), title, "Some excerpt.", category, rank)


def _input(*articles: AgentArticle) -> AgentInput:
    return AgentInput(
        request_id=uuid.uuid4(),
        title="Wi-Fi connects but websites time out",
        description="The wifi network connects but no websites load.",
        categories=tuple(Category),
        priorities=tuple(Priority),
        articles=articles,
        prompt_version=PROMPT_VERSION,
    )


def test_cites_only_the_top_article_when_the_next_rank_is_not_close() -> None:
    top = _article("Top", "NETWORK", 10.0)
    far = _article("Far", "NETWORK", 6.9)
    assert MockAgent().analyze(_input(top, far)).citation_article_ids == [top.id]


def test_cites_a_close_second_article_in_the_predicted_category() -> None:
    top = _article("Top", "NETWORK", 10.0)
    close = _article("Close", "NETWORK", 7.0)
    assert MockAgent().analyze(_input(top, close)).citation_article_ids == [top.id, close.id]


def test_does_not_cite_a_close_article_from_another_category() -> None:
    top = _article("Top", "NETWORK", 10.0)
    other = _article("Other", "HARDWARE", 9.9)
    assert MockAgent().analyze(_input(top, other)).citation_article_ids == [top.id]


def test_never_cites_more_than_two_articles() -> None:
    articles = [_article(f"Article {n}", "NETWORK", 10.0) for n in range(5)]
    assert len(MockAgent().analyze(_input(*articles)).citation_article_ids) == 2


def test_a_top_article_from_another_category_is_still_cited_alone() -> None:
    top = _article("Top", "SOFTWARE", 10.0)
    assert MockAgent().analyze(_input(top)).citation_article_ids == [top.id]


def test_no_articles_means_no_citations() -> None:
    assert MockAgent().analyze(_input()).citation_article_ids == []


def test_retrieval_metadata_is_not_sent_to_a_provider() -> None:
    article = _article("Unique title", "UNIQUE_CATEGORY_VALUE", 123.456)
    prompt = build_prompt(_input(article)).user
    assert "Unique title" in prompt
    assert "UNIQUE_CATEGORY_VALUE" not in prompt
    assert "123.456" not in prompt


@pytest.mark.parametrize(
    ("title", "description"),
    [
        (
            "The campus Wi-Fi connects but I cannot open websites",
            "My laptop shows it is connected to Wi-Fi, but every website times out.",
        ),
        (
            "Campus Wi-Fi connects but websites do not load",
            "My laptop shows it is connected to Wi-Fi, but every website times out. "
            "It started this morning in the library.",
        ),
    ],
)
def test_a_wifi_request_cites_only_the_wifi_article(
    client: TestClient, db: Session, requester, title: str, description: str
) -> None:
    seed_demo(db, "test-demo-password")
    headers = auth(requester)
    created = client.post(
        REQUESTS, json={"title": title, "description": description}, headers=headers
    ).json()

    body = client.post(f"{REQUESTS}/{created['id']}/analyze", headers=headers).json()

    assert body["status"] == "TRIAGED"
    assert [citation["title"] for citation in body["suggestion"]["citations"]] == [
        "Wi-Fi connected but websites not loading"
    ]
