# Implementation status

Updated: 2026-11-04
Current phase: 8 (in progress). Phases 0 to 7 are complete in mock mode.
Branch: main; see `git log --oneline` for the commit
Deployment status: not deployed; local Docker only

| Phase | Status | Evidence | Remaining |
|---|---|---|---|
| 0 Repository and docs | DONE | `git log`; only `.env.example` tracked; no secret in history | GitHub remote (owner, later chunk) |
| 1 Scaffolding, Docker, health | DONE | `docker compose up --build -d --wait` from `down -v`; `/healthz` and `/readyz` 200; `/readyz` 503 before migrating; frontend 200 | None |
| 2 Schema, migrations, auth, seed | DONE | Alembic upgrade, repeat, `check` and down/up test; seed twice gives 4 users, 13 articles, 9 requests; data survives `down` + `up` (Run 01) | None |
| 3 Request lifecycle | DONE | `tests/test_requests_lifecycle.py` 133 tests including all 49 status pairs; `tests/test_concurrency.py` real two-connection race; `docs/API.md` | None |
| 4 Knowledge base and retrieval | DONE | `tests/test_knowledge.py` 120 tests; frontend search and article tests | Admin screens belong to Phase 8 |
| 5 AI orchestration | DONE. Live Gemini DONE, owner-verified | `tests/test_analyze.py`, `tests/test_redaction.py`, `tests/test_gemini_agent.py`, `tests/test_mock_citations.py`; owner's live smoke test, see below | None |
| 6 Review gates and hardening | DONE | `tests/test_policy.py`, `tests/test_review.py`, `tests/test_adversarial.py`, `tests/test_hardening.py`, `tests/test_append_only.py`; `docs/SECURITY.md` | Staff screens belong to Phase 8 |
| 7 Requester frontend | DONE at component level | `src/tests/newRequest.test.jsx`, `requestDetail.test.jsx`, `dashboard.test.jsx`, `shell.test.jsx` | Browser journeys, keyboard and mobile checks come with Phase 8 E2E |
| 8 Staff and admin frontend, E2E | DONE | Component tests: `src/tests/support.test.jsx`, `src/tests/admin.test.jsx`; API: `tests/test_admin_filters.py`; browser: `e2e/tests/` | None |
| 9 Quality and evaluation | NOT_STARTED | | All |
| 10 GitHub, CI, deployment | NOT_STARTED | | All |
| 11 Portfolio packaging | NOT_STARTED | | All |

**Live Gemini: owner-verified after Run 02.** `model=gemini-3.5-flash-lite http_requests=1 latency_ms=14878 tokens={'input': 625, 'output': 216, 'thought': 0, 'total': 841} outcome=pass`, result `category=NETWORK priority=MEDIUM confidence=0.95 citations=1 risk_flags=[] review=False`. The owner ran this, and no agent has observed it. It is the adapter's opt-in test, so the full `AI_MODE=gemini` path through the running app has still not been exercised. No live call was made in Run 03.

Decisions changed since blueprint: ADR-000 (doc file mapping), ADR-015 (any-term search ordering), ADR-021 (schema refinements), ADR-024 (query-focused snippets), ADR-025 (append-only triggers narrow ADR-007), ADR-027 (uncited replies always need review), ADR-028 (generic failure code for requesters), ADR-029 (Gemini call shape), ADR-031 (escalation withholds a visible reply), ADR-032 (mock citations), ADR-033 (counts and `mine`), ADR-034 (frontend structure), ADR-035 (auto-analysis), ADR-036 (staff screen for every request). See [the ADR log](ARCHITECTURE_DECISIONS.md).

Current blockers: none.

## Known limitations

- Pattern-based policy scanning can be evaded by rephrasing or other languages, and produces false positives. Rates have not been measured (Phase 9).
- Seeded `TRIAGED` and `NEEDS_HUMAN_REVIEW` requests have no suggestion, so `POST /review` on them returns 409 `NO_PENDING_SUGGESTION`. Staff move them with PATCH.
- Rate limits are per process, count all login attempts, and do not trust proxy headers (ADR-030).
- A crashed analysis blocks retries for up to `AI_STALE_RUN_SECONDS` and uses one attempt (ADR-026).
- A request with history cannot be hard-deleted, because the append-only trigger refuses the cascade (ADR-025).
- `ai_runs.redacted_input` has no retention job. The demo reset is the only cleanup.
- The relevance floor is measured on 12 articles and should be re-measured in Phase 9.
- Base images use floating tags (`postgres:17`, `python:3.12-slim`, `node:24-slim`).
- `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/EVALUATION.md`, CI and `LICENSE` do not exist yet. Later phases add them.
