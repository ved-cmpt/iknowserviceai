"""A deterministic agent with no network access, for tests, demos and CI."""

import re

from app.db.models.enums import AiMode, Category, Priority
from app.services.ai.base import AgentArticle, AgentInput, TriageResult
from app.services.policy import asks_for_credentials, scan_article_text, scan_request_text
from app.services.text import markdown_to_plain_text

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
_ORDERED_STEP = re.compile(r"^\s*\d+[.)]\s+(.+)$", re.MULTILINE)

SECOND_CITATION_MIN_RANK_RATIO = 0.7
MAX_REPLY_STEPS = 3
MAX_STEP_LENGTH = 220
NO_SOURCES_REPLY = (
    "We could not find a published article that matches this request. "
    "A member of the support team will review it."
)
ESCALATION_LINE = (
    "If this doesn't help, add a comment and our team will follow up. Never share your password."
)
CAUTIOUS_REPLY = (
    "This request may involve account security or another sensitive issue, so a member of the "
    "support team will review it before any steps are shared. Please do not share your password, "
    "recovery codes or one-time codes with anyone. If you have more details, add a comment and "
    "our team will follow up."
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
    """Cite the top-ranked article, plus the next one only if it is close and in the same category.

    Articles arrive in rank order. Only IDs received here can be cited.
    """
    if not articles:
        return []
    top, *others = articles
    for article in others[:1]:
        if article.rank >= top.rank * SECOND_CITATION_MIN_RANK_RATIO and (
            article.category == category.value
        ):
            return [top, article]
    return [top]


def _steps(article: AgentArticle) -> list[str]:
    """The first few steps of the article's ordered list, as plain text.

    Article text is untrusted, so a step that reads like an instruction to the system or asks for
    a secret is left out. Policy still holds any reply from such an article for review.
    """
    steps = []
    for match in _ORDERED_STEP.finditer(article.body_markdown):
        step = markdown_to_plain_text(match.group(1))[:MAX_STEP_LENGTH].strip()
        if step and not scan_article_text(step) and not asks_for_credentials(step):
            steps.append(step)
        if len(steps) == MAX_REPLY_STEPS:
            break
    return steps


def _reply_from_article(article: AgentArticle) -> str:
    steps = _steps(article)
    if not steps:
        return (
            f'The article "{article.title}" may help, so please check the guidance there.\n'
            f"{ESCALATION_LINE}"
        )
    numbered = "\n".join(f"{number}. {step}" for number, step in enumerate(steps, start=1))
    return f'These steps from "{article.title}" may help:\n{numbered}\n{ESCALATION_LINE}'


def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


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
            # A sensitive request is held for review anyway, so its draft offers no procedure.
            sensitive = bool(scan_request_text(text))
            reply = CAUTIOUS_REPLY if sensitive else _reply_from_article(cited[0])
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
                    f"Matched {_plural(hits, f'{category.value} keyword')} "
                    f"and {_plural(len(cited), 'article')}."
                ),
            },
            strict=False,
        )
