"""A deterministic agent with no network access, for tests, demos and CI."""

import re

from app.db.models.enums import AiMode, Category, Priority
from app.services.ai.base import AgentArticle, AgentInput, TriageResult

_CATEGORY_KEYWORDS: dict[Category, re.Pattern[str]] = {
    Category.NETWORK: re.compile(
        r"\b(wi-?fi|wireless|vpn|network|internet|ethernet|dns|router|websites?|web pages?)\b"
    ),
    Category.ACCOUNT_ACCESS: re.compile(
        r"\b(password|passwords|login|log in|sign in|sign-in|account|accounts|mfa|2fa"
        r"|locked out|credentials|authenticator)\b"
    ),
    Category.SOFTWARE: re.compile(
        r"\b(software|install|installing|application|licen[sc]e|update|program|package)\b"
    ),
    Category.HARDWARE: re.compile(
        r"\b(printer|laptop|monitor|keyboard|mouse|speakers?|audio|sound|battery|screen|slow)\b"
    ),
}
_URGENT = re.compile(r"\b(outage|everyone|whole building|entire (?:floor|building|campus))\b")
_HIGH = re.compile(r"\b(urgent|deadline|exam|cannot work|hacked|compromised)\b")
_LOW = re.compile(r"\b(question|how do i|when is|minor|whenever|not urgent)\b")

MAX_CITATIONS = 3
NO_SOURCES_REPLY = (
    "We could not find a published article that matches this request. "
    "A member of the support team will review it."
)


def _category(text: str) -> tuple[Category, int]:
    best, best_hits = Category.OTHER, 0
    for category, pattern in _CATEGORY_KEYWORDS.items():
        hits = len(pattern.findall(text))
        if hits > best_hits:
            best, best_hits = category, hits
    return best, best_hits


def _priority(text: str) -> Priority:
    if _URGENT.search(text):
        return Priority.URGENT
    if _HIGH.search(text):
        return Priority.HIGH
    if _LOW.search(text):
        return Priority.LOW
    return Priority.MEDIUM


def _citations(articles: tuple[AgentArticle, ...], category: Category) -> list[AgentArticle]:
    """Cite on-topic articles, or else the best-ranked one. Only IDs it received, in rank order."""
    pattern = _CATEGORY_KEYWORDS.get(category)
    on_topic = [
        article
        for article in articles
        if pattern and pattern.search(f"{article.title} {article.snippet}".lower())
    ]
    return on_topic[:MAX_CITATIONS] or list(articles[:1])


class MockAgent:
    mode = AiMode.MOCK
    model_id = None
    token_counts = None

    def analyze(self, agent_input: AgentInput) -> TriageResult:
        text = f"{agent_input.title}\n{agent_input.description}".lower()
        category, hits = _category(text)
        cited = _citations(agent_input.articles, category)

        reply = NO_SOURCES_REPLY
        confidence = 0.4
        if cited:
            titles = ", ".join(f'"{article.title}"' for article in cited)
            reply = (
                f"These knowledge base articles may help: {titles}. Check the steps there, and "
                "add a comment to this request if the problem continues."
            )
            # More keyword evidence and more sources raise confidence.
            confidence = 0.5 + 0.15 * min(hits, 2) + 0.05 * min(len(cited), 2)

        return TriageResult.model_validate(
            {
                "summary": agent_input.title[:200],
                "category": category,
                "priority": _priority(text),
                "confidence": round(confidence, 2),
                "risk_flags": [],
                "recommended_reply": reply[:1200],
                "citation_article_ids": [article.id for article in cited],
                "requires_human_review": not cited,
                "rationale_short": (
                    f"Matched {hits} {category.value} keywords and {len(cited)} articles."
                ),
            },
            strict=False,
        )
