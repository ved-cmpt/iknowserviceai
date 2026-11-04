# Agent handoff

Last updated: 2026-11-04
Current phase and exact objective: Chunk 3, Phases 5 and 6: AI orchestration and review gates.
Repo branch and last verified commit: `main`; run `git log --oneline`. Phases 0 to 4 passed a clean-state verification.
Implemented and verified: see `docs/IMPLEMENTATION_STATUS.md` and `docs/RUN_REPORTS/RUN_01.md`.
Environment/service state: compose stack running, migrated at `0002`, freshly seeded. `AI_MODE=mock`.
Known bugs / incomplete tests: none known. Limitations are listed in the status doc.
Decisions and assumptions made: ADR-000 to ADR-023.
What the next agent must read: `AGENTS.md`, the status doc, the ADR log, `docs/API.md`, and blueprint sections 3, 4.3, 5.4, 6, 7, 10 (Phases 5 and 6), 11 and 14.
Next 3 concrete actions: build redaction and deterministic risk scanning with unit tests; build `AgentProvider`, `MockAgent` and `POST /requests/{id}/analyze`; build the review endpoint and role-safe suggestion serialization.
Owner-only actions needed: a Gemini API key is needed only for the optional live smoke test. Nothing else.

## Things that will catch you out

- **Pydantic constraint order.** Write `Annotated[str, StringConstraints(...), NoNul]`. Wrapping an already-validated type in `StringConstraints` silently drops strip and length rules.
- **Validate before mutating in services.** Raise errors before changing ORM objects, so a rejected request changes nothing. Tests share one session across calls, so a dirty object would hide or cause bugs.
- **Requester events are an allowlist.** A new `EventType` is hidden from requesters until added to `REQUESTER_EVENT_DETAILS` in `services/requests.py`. AI events probably should stay hidden, or expose very little.
- **Requester schemas are separate classes.** Add suggestion fields deliberately. `proposed_reply`, `redacted_input`, `error_code` and pending or rejected text must never reach requesters.
- **Search spelling.** `wifi` and `Wi-Fi` are different lexemes in the `english` configuration. New articles must include both.
- **Relevance floor.** `KnowledgeRetriever` applies `KB_MIN_RANK=0.5` (ADR-016). An empty result means escalate. Broad words can still clear the floor, so the policy gate must not rely on retrieval alone.
- **Snippets can hold instruction-like text as plain text** (ADR-017). Treat them as untrusted data in prompts.
- **State machine.** `SYSTEM_TRANSITIONS` in `services/state_machine.py` already defines the AI paths but nothing uses it yet. PATCH refuses to enter or leave `ANALYZING`.
- **Stuck `ANALYZING`.** The seed has one request in `ANALYZING` with no AI run, and a crash mid-analysis would leave the same state. The analyze design needs a recovery path, because PATCH cannot provide one.
- **Migrations.** The AI tables exist already (`ai_runs`, `ai_suggestions`, `request_feedback`). Never edit `0001` or `0002`. Any change needs a new revision, and `tests/test_migrations.py` fails if models and migrations differ.
- **Real concurrency tests** must open their own connections and clean up, as `tests/test_concurrency.py` does. The `db` fixture is one rolled-back transaction, so it cannot exercise a race.
- **Non-interactive shells.** Agents need `docker compose exec -T`. The README omits `-T` because the owner runs interactively.
- **Safety rules for autonomous runs.** Keep writes inside the project folder, with no global installs, no push and no external accounts. See ADR-020 for caches.

## Prompt for the next chunk

> You are the lead implementation engineer for IknowServiceAI. Read `AGENTS.md`, then every document it lists, then this handoff. Inspect the repository and `git log`, and treat code and tests as ground truth.
>
> Execute **Chunk 3: Blueprint Phases 5 and 6**, in two checkpoints. Commit after each one passes its checks, and update `docs/IMPLEMENTATION_STATUS.md`, `docs/ARCHITECTURE_DECISIONS.md` and this file at each checkpoint.
>
> **Checkpoint 6, AI orchestration (Phase 5).** Build the bounded workflow in blueprint section 6.1:
> - `TriageResult` Pydantic schema with strict validation, per section 6.2.
> - `AgentProvider.analyze(request, sources) -> TriageResult` with a deterministic fixture-backed `MockAgent` and a `GeminiAgent` in a single adapter. Verify the current `google-genai` and Interactions API docs before coding; schema-based output, `GEMINI_MODEL` from config, bounded timeout, retry with jitter on 429 and 5xx only, at most 2 calls per action. The live test is opt-in through `RUN_LIVE_GEMINI_TESTS=1` and never runs by default. Nothing may call the network in mock mode, and this must be tested.
> - Redaction of emails, phone numbers, tokens and account identifiers before any model call. Prompt version `triage-v1`, with delimiters, per section 6.4.
> - `POST /requests/{id}/analyze` for owner or staff: row lock, retry budget, `ai_runs` persistence, retrieval through `KnowledgeRetriever`, citation validation against the retrieved set, `SYSTEM_TRANSITIONS`, sanitized failures that return the request to `NEW`, a safe fallback, and a recovery path for a request stuck in `ANALYZING`.
> - Tests for network failure, invalid JSON, unknown citations, no articles, timeouts, 429s and racing analyze calls (real connections).
> - Commit: `feat: phase 5 ai orchestration with mock and gemini agents`.
>
> **Checkpoint 7, review gates and hardening (Phase 6).**
> - Deterministic risk scanning per section 6.3, which the model cannot override, and the confidence threshold from `AI_REVIEW_CONFIDENCE_THRESHOLD`.
> - `POST /requests/{id}/review` for AGENT and ADMIN: approve, edit or reject with a reason; duplicate or stale review returns 409; `published_reply` is stored separately from `proposed_reply`; audited with reviewer, decision and time.
> - `POST /requests/{id}/feedback` for the owner: one per suggestion.
> - Requester serialization that hides `PENDING_REVIEW` and `REJECTED` bodies from every list and detail response and shows the generic escalation state instead.
> - Rate limiting for login and analyze. Keep it simple and in-process unless an ADR justifies otherwise, and return 429 in the error envelope.
> - Every adversarial case in section 11.2 as a test, plus bogus article IDs, a model asking for a password, and a user trying to approve their own case.
> - `docs/SECURITY.md`: threat model, privacy choices, data visibility matrix and known risks. Update `docs/API.md`, the permission matrix and the README checklist.
> - Commit: `feat: phase 6 review gates, rate limiting and adversarial tests`.
>
> **Finish:** from a clean state run `docker compose down -v`, `docker compose up --build -d`, migrate, seed, `pytest -q`, `ruff check .`, `ruff format --check .`, `npm run lint`, `npm test -- --run` and `npm run build`. Record exact results. Keep `AI_MODE=mock` for all tests. Never mark anything done without running the check that proves it. Write a run report to `docs/RUN_REPORTS/RUN_02.md`, and leave the next-chunk prompt here, for Phases 7 and 8.
