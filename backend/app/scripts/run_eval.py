"""Evaluate the analysis pipeline: python -m app.scripts.run_eval --mode mock|gemini

Each case goes through the real orchestrator: redaction, retrieval against the seeded articles, the
provider, output validation and policy. Everything happens inside one transaction that is rolled
back, with a savepoint per case, so nothing is ever written to the database. It needs seeded data.

Results hold metadata only: no replies, summaries or request text, and never a key.

Live mode spends the owner's free-tier quota, so it is capped. Every HTTP call is counted, the run
refuses to go past LIVE_CALL_CAP, and the first provider failure stops it.
"""

import argparse
import json
import math
import sys
import time
import uuid
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from itertools import zip_longest
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models import AiRun, AiSuggestion, KnowledgeArticle, ServiceRequest, User
from app.db.models.enums import ArticleStatus, ReviewState, Role
from app.db.session import engine
from app.services.ai import orchestrator
from app.services.ai.base import AgentInput, AgentProvider, TriageResult
from app.services.ai.mock import MockAgent
from app.services.ai.prompts import PROMPT_VERSION

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"
LIVE_CALL_CAP = 12


@dataclass
class CaseResult:
    id: str
    group: str
    expected_category: str
    predicted_category: str | None = None
    category_correct: bool | None = None
    category_exact: bool | None = None
    must_hold: bool = False
    held: bool | None = None
    review_state: str | None = None
    risk_flags: list[str] = field(default_factory=list)
    retrieved: list[str] = field(default_factory=list)
    cited: list[str] = field(default_factory=list)
    invented_raw: int = 0
    invented_persisted: int = 0
    ineligible_cited: int = 0
    eligible_cited: int = 0
    latency_ms: float = 0.0
    error_code: str | None = None
    tokens: dict[str, int] | None = None


class RecordingProvider:
    """Passes calls to a provider, and keeps what it was offered and what it claimed to cite."""

    def __init__(self, provider: AgentProvider) -> None:
        self._provider = provider
        self.mode = provider.mode
        self.model_id = provider.model_id
        self.offered: set[uuid.UUID] = set()
        self.claimed: list[uuid.UUID] = []

    @property
    def token_counts(self) -> dict[str, int] | None:
        return self._provider.token_counts

    def start_case(self) -> None:
        self.offered = set()
        self.claimed = []

    def analyze(self, agent_input: AgentInput) -> TriageResult:
        self.offered = {article.id for article in agent_input.articles}
        result = self._provider.analyze(agent_input)
        self.claimed = list(result.citation_article_ids)
        return result


class BudgetExhausted(Exception):
    """Refuses a provider call past the cap. The provider treats it as a non-retryable failure."""


class _CountingInteractions:
    def __init__(self, interactions: Any, budget: "CallBudget") -> None:
        self._interactions = interactions
        self._budget = budget

    def create(self, **kwargs: Any) -> Any:
        self._budget.spend()
        return self._interactions.create(**kwargs)


class CallBudget:
    """Wraps a provider client, so every real HTTP call counts, including provider retries."""

    def __init__(self, cap: int) -> None:
        self.cap = cap
        self.used = 0

    def spend(self) -> None:
        if self.used >= self.cap:
            raise BudgetExhausted
        self.used += 1

    @property
    def exhausted(self) -> bool:
        return self.used >= self.cap

    def wrap(self, client: Any) -> Any:
        budget = self

        class _CountingClient:
            interactions = _CountingInteractions(client.interactions, budget)

        return _CountingClient()


def load_cases(path: Path = EVAL_DIR / "cases.json") -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


def select_cases(cases: list[dict[str, Any]], limit: int | None) -> list[dict[str, Any]]:
    """Take cases in turn from each group, so a small sample still covers every kind of case."""
    if limit is None or limit >= len(cases):
        return cases
    groups: dict[str, list[dict[str, Any]]] = {}
    for case in cases:
        groups.setdefault(case["group"], []).append(case)
    ordered = [
        case for round_ in zip_longest(*groups.values()) for case in round_ if case is not None
    ]
    return ordered[:limit]


def _slugs(db: Session, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, str]:
    ids = list(ids)
    if not ids:
        return {}
    rows = db.execute(
        select(KnowledgeArticle.id, KnowledgeArticle.slug).where(KnowledgeArticle.id.in_(ids))
    )
    return {row[0]: row[1] for row in rows}


def _evaluate_case(
    db: Session, case: dict[str, Any], provider: RecordingProvider, user: User
) -> CaseResult:
    expected = case["expected_category"]
    result = CaseResult(
        id=case["id"],
        group=case["group"],
        expected_category=expected,
        must_hold=case["must_hold_for_review"],
    )
    fixture = case.get("fixture_article")
    if fixture:
        db.add(
            KnowledgeArticle(
                slug=fixture["slug"],
                title=fixture["title"],
                body_markdown=fixture["body"],
                category=fixture["category"],
                tags=[],
                status=ArticleStatus.PUBLISHED.value,
            )
        )
    request = ServiceRequest(
        requester_id=user.id, title=case["title"], description=case["description"]
    )
    db.add(request)
    db.commit()

    provider.start_case()
    started = time.perf_counter()
    try:
        orchestrator.analyze_request(db, user, request.id, provider)
    except AppError:
        run = db.scalar(select(AiRun).where(AiRun.request_id == request.id))
        result.error_code = run.error_code if run else "UNKNOWN"
    result.latency_ms = round((time.perf_counter() - started) * 1000, 1)
    result.tokens = provider.token_counts

    known = _slugs(db, provider.offered)
    result.retrieved = sorted(known.values())
    result.invented_raw = sum(1 for item in provider.claimed if item not in provider.offered)
    if result.error_code:
        return result

    suggestion = db.scalar(select(AiSuggestion).where(AiSuggestion.request_id == request.id))
    cited_ids = [uuid.UUID(value) for value in suggestion.citation_article_ids]
    eligible = set(case["eligible_citations"])
    acceptable = {expected, *case.get("also_acceptable", [])}
    cited = [_slugs(db, [item]).get(item, str(item)) for item in cited_ids]

    result.predicted_category = suggestion.proposed_category
    result.category_exact = suggestion.proposed_category == expected
    result.category_correct = suggestion.proposed_category in acceptable
    result.review_state = suggestion.review_state
    result.held = suggestion.review_state == ReviewState.PENDING_REVIEW
    result.risk_flags = list(suggestion.risk_flags)
    result.cited = cited
    result.invented_persisted = sum(1 for item in cited_ids if item not in provider.offered)
    result.eligible_cited = sum(1 for slug in cited if slug in eligible)
    result.ineligible_cited = len(cited) - result.eligible_cited
    return result


def run_cases(
    connection: Connection,
    cases: list[dict[str, Any]],
    provider: AgentProvider,
    *,
    sleep_seconds: float = 0,
    stop_on_failure: bool = False,
    should_stop: Callable[[], bool] = lambda: False,
    sleep: Callable[[float], None] = time.sleep,
) -> list[CaseResult]:
    """Run cases inside the caller's open transaction. Each case's writes are rolled back."""
    recording = RecordingProvider(provider)
    results: list[CaseResult] = []
    for index, case in enumerate(cases):
        if should_stop():
            break
        if index and sleep_seconds:
            sleep(sleep_seconds)
        savepoint = connection.begin_nested()
        session = Session(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            user = User(
                email=f"eval-{uuid.uuid4().hex}@example.test",
                password_hash="not-a-real-hash",  # noqa: S106 - no one can sign in with this
                display_name="Evaluation requester",
                role=Role.USER.value,
            )
            session.add(user)
            session.commit()
            result = _evaluate_case(session, case, recording, user)
        finally:
            session.close()
            savepoint.rollback()
        results.append(result)
        if stop_on_failure and result.error_code:
            break
    return results


def _percentile(values: list[float], percent: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(percent / 100 * len(ordered)) - 1)]


def _rate(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None


def compute_metrics(results: list[CaseResult]) -> dict[str, Any]:
    completed = [result for result in results if not result.error_code]
    must_hold = [result for result in completed if result.must_hold]
    ordinary = [result for result in completed if result.group == "ordinary"]
    sensitive = [result for result in must_hold if result.group in ("sensitive", "injection")]
    cited = sum(result.eligible_cited + result.ineligible_cited for result in completed)
    no_match = [result for result in completed if result.group == "no_match"]
    groups: dict[str, dict[str, int]] = {}
    for result in completed:
        group = groups.setdefault(result.group, {"cases": 0, "held": 0, "category_ok": 0})
        group["cases"] += 1
        group["held"] += int(bool(result.held))
        group["category_ok"] += int(bool(result.category_correct))
    return {
        "cases_run": len(results),
        "cases_completed": len(completed),
        "failure_count": len(results) - len(completed),
        "failures": [
            {"id": result.id, "error_code": result.error_code}
            for result in results
            if result.error_code
        ],
        "category_accuracy": _rate(
            sum(1 for result in completed if result.category_correct), len(completed)
        ),
        "category_accuracy_exact": _rate(
            sum(1 for result in completed if result.category_exact), len(completed)
        ),
        "must_hold_recall": _rate(sum(1 for result in must_hold if result.held), len(must_hold)),
        "must_hold_cases": len(must_hold),
        "sensitive_hold_recall": _rate(
            sum(1 for result in sensitive if result.held), len(sensitive)
        ),
        "sensitive_cases": len(sensitive),
        "missed_holds": [result.id for result in must_hold if not result.held],
        "false_hold_rate_ordinary": _rate(
            sum(1 for result in ordinary if result.held), len(ordinary)
        ),
        "ordinary_cases": len(ordinary),
        "false_holds_ordinary": [result.id for result in ordinary if result.held],
        "invented_citations_raw": sum(result.invented_raw for result in results),
        "invented_citations_persisted": sum(result.invented_persisted for result in results),
        "citations_total": cited,
        "citation_eligibility_rate": _rate(
            sum(result.eligible_cited for result in completed), cited
        ),
        "no_match_cases_with_retrieval": [result.id for result in no_match if result.retrieved],
        "latency_p50_ms": _percentile([result.latency_ms for result in completed], 50),
        "latency_p95_ms": _percentile([result.latency_ms for result in completed], 95),
        "groups": groups,
    }


def _percent(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def to_markdown(report: dict[str, Any]) -> str:
    metrics = report["metrics"]
    lines = [
        f"# Evaluation results: {report['mode']}",
        "",
        f"Date: {report['date']}. Model: {report['model'] or 'none (mock)'}. "
        f"Prompt: {report['prompt_version']}. Provider HTTP calls: {report['provider_calls']}.",
        "",
        "| Metric | Result |",
        "|---|---|",
        f"| Cases run, completed | {metrics['cases_run']}, {metrics['cases_completed']} |",
        f"| Failures | {metrics['failure_count']} |",
        f"| Category accuracy (accepting listed alternatives) | "
        f"{_percent(metrics['category_accuracy'])} |",
        f"| Category accuracy (exact) | {_percent(metrics['category_accuracy_exact'])} |",
        f"| Sensitive and injection cases held | {_percent(metrics['sensitive_hold_recall'])} "
        f"of {metrics['sensitive_cases']} |",
        f"| All must-hold cases held | {_percent(metrics['must_hold_recall'])} "
        f"of {metrics['must_hold_cases']} |",
        f"| False holds on ordinary cases | {_percent(metrics['false_hold_rate_ordinary'])} "
        f"of {metrics['ordinary_cases']} |",
        f"| Invented citations: returned by the provider | {metrics['invented_citations_raw']} |",
        f"| Invented citations: kept in a suggestion | {metrics['invented_citations_persisted']} |",
        f"| Citation eligibility | {_percent(metrics['citation_eligibility_rate'])} "
        f"of {metrics['citations_total']} |",
        f"| Latency p50, p95 | {metrics['latency_p50_ms']} ms, {metrics['latency_p95_ms']} ms |",
        "",
        "| Case | Group | Expected | Predicted | Must hold | Held | Citations | Flags | Error |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for result in report["results"]:
        lines.append(
            f"| {result['id']} | {result['group']} | {result['expected_category']} "
            f"| {result['predicted_category'] or '-'} | {'yes' if result['must_hold'] else 'no'} "
            f"| {'-' if result['held'] is None else ('yes' if result['held'] else 'no')} "
            f"| {', '.join(result['cited']) or '-'} | {', '.join(result['risk_flags']) or '-'} "
            f"| {result['error_code'] or '-'} |"
        )
    return "\n".join(lines) + "\n"


def write_report(
    results: list[CaseResult],
    *,
    mode: str,
    model: str | None,
    provider_calls: int,
    output_dir: Path,
    stem: str,
) -> dict[str, Any]:
    report = {
        "mode": mode,
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "date": datetime.now(UTC).date().isoformat(),
        "provider_calls": provider_calls,
        "metrics": compute_metrics(results),
        "results": [asdict(result) for result in results],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / f"{stem}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (output_dir / f"{stem}.md").write_text(to_markdown(report), encoding="utf-8")
    return report


def _published_count(connection: Connection) -> int:
    return (
        connection.scalar(
            select(func.count())
            .select_from(KnowledgeArticle)
            .where(KnowledgeArticle.status == ArticleStatus.PUBLISHED.value)
        )
        or 0
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate the analysis pipeline.")
    parser.add_argument("--mode", choices=["mock", "gemini"], required=True)
    parser.add_argument("--limit", type=int, default=None, help="how many cases, across all groups")
    parser.add_argument("--sleep", type=float, default=0, help="seconds to wait between cases")
    parser.add_argument("--output-dir", type=Path, default=EVAL_DIR / "results")
    args = parser.parse_args(argv)

    if args.mode == "gemini" and (args.limit is None or not 1 <= args.limit <= LIVE_CALL_CAP):
        print(f"Live mode needs --limit from 1 to {LIVE_CALL_CAP}.", file=sys.stderr)
        return 2

    budget = CallBudget(LIVE_CALL_CAP)
    provider: AgentProvider
    if args.mode == "gemini":
        settings = get_settings()
        if settings.gemini_api_key is None or not settings.gemini_model:
            print("Live mode needs GEMINI_API_KEY and GEMINI_MODEL.", file=sys.stderr)
            return 2
        # Imported here so that mock mode never loads the provider SDK.
        from app.services.ai.gemini import GeminiAgent, build_client

        client = build_client(
            settings.gemini_api_key.get_secret_value().strip(),
            settings.ai_request_timeout_seconds,
        )
        provider = GeminiAgent.from_settings(settings, client=budget.wrap(client))
    else:
        provider = MockAgent()

    cases = select_cases(load_cases(), args.limit)
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            if not _published_count(connection):
                print("No published articles. Run the demo seed first.", file=sys.stderr)
                return 2
            results = run_cases(
                connection,
                cases,
                provider,
                sleep_seconds=args.sleep,
                stop_on_failure=args.mode == "gemini",
                should_stop=lambda: budget.exhausted,
            )
        finally:
            transaction.rollback()

    report = write_report(
        results,
        mode=args.mode,
        model=provider.model_id,
        provider_calls=budget.used,
        output_dir=args.output_dir,
        stem=f"{args.mode}-sample" if args.limit else args.mode,
    )
    metrics = report["metrics"]
    summary_keys = (
        "cases_run",
        "failure_count",
        "failures",
        "category_accuracy",
        "category_accuracy_exact",
        "sensitive_hold_recall",
        "must_hold_recall",
        "missed_holds",
        "false_hold_rate_ordinary",
        "false_holds_ordinary",
        "invented_citations_raw",
        "invented_citations_persisted",
        "citation_eligibility_rate",
        "no_match_cases_with_retrieval",
        "latency_p50_ms",
        "latency_p95_ms",
    )
    print(json.dumps({key: metrics[key] for key in summary_keys}, indent=2))
    print(f"provider_http_calls: {budget.used}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
