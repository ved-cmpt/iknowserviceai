# Implementation status

Updated: 2026-11-04
Current phase: 7 (not started). Phases 5 and 6 are complete in mock mode.
Branch: main; see `git log --oneline` for the commit
Deployment status: not deployed; local Docker only

| Phase | Status | Evidence | Remaining |
|---|---|---|---|
| 0 Repository and docs | DONE | `git log`; only `.env.example` tracked; no secret in history | GitHub remote (owner, later chunk) |
| 1 Scaffolding, Docker, health | DONE | `docker compose up --build -d --wait` from `down -v`; `/healthz` and `/readyz` 200; `/readyz` 503 before migrating; frontend 200 | None |
| 2 Schema, migrations, auth, seed | DONE | Alembic upgrade, repeat, `check` and down/up test; seed twice gives 4 users, 13 articles, 9 requests; data survives `down` + `up` (Run 01) | None |
| 3 Request lifecycle | DONE (API) | `tests/test_requests_lifecycle.py` 133 tests including all 49 status pairs; `tests/test_concurrency.py` real two-connection race; `docs/API.md` | Screens belong to Phases 7 and 8 |
| 4 Knowledge base and retrieval | DONE | `tests/test_knowledge.py` 120 tests; frontend search and article tests; browser check in Run 01 | Admin screens belong to Phase 8 |
| 5 AI orchestration | DONE in mock mode; live BLOCKED | `tests/test_analyze.py` 60, `tests/test_redaction.py` 37, `tests/test_gemini_agent.py` 50, analyze races in `tests/test_concurrency.py`; HTTP demo in `docs/RUN_REPORTS/RUN_02.md` | A passing live smoke test. See "Current blockers" |
| 6 Review gates and hardening | DONE (API) | `tests/test_policy.py` 99, `tests/test_review.py` 47, `tests/test_adversarial.py` 19, `tests/test_hardening.py` 34, `tests/test_append_only.py` 8; `docs/SECURITY.md` | Screens belong to Phases 7 and 8 |
| 7 Requester frontend | NOT_STARTED | Login, dashboard list and knowledge pages exist | New request form, request detail, analysis, feedback |
| 8 Staff and admin frontend, E2E | NOT_STARTED | | All |
| 9 Quality and evaluation | NOT_STARTED | | All |
| 10 GitHub, CI, deployment | NOT_STARTED | | All |
| 11 Portfolio packaging | NOT_STARTED | | All |

Decisions changed since blueprint: ADR-000 (doc file mapping), ADR-015 (any-term search ordering), ADR-021 (schema refinements), ADR-024 (query-focused snippets), ADR-025 (append-only triggers narrow ADR-007), ADR-027 (uncited replies always need review), ADR-028 (generic failure code for requesters), ADR-029 (Gemini call shape), ADR-031 (escalation withholds a visible reply). See [the ADR log](ARCHITECTURE_DECISIONS.md).

Current blockers:

- **BLOCKED: the live Gemini smoke test failed with `AI_TIMEOUT`.** Model `gemini-3.5-flash-lite`, 2 HTTP requests, each reaching the 20-second timeout (42.1 seconds in total), no HTTP status. The cause is unknown. Listing models with the same key worked, so the key and network path were working at that time. The 3-call budget for Run 02 is used up, so nothing further was tried. `AI_MODE=gemini` must be treated as unverified. Nothing else depends on it. To retry, using at most 2 calls:

  ```powershell
  docker compose exec -T -e RUN_LIVE_GEMINI_TESTS=1 -e AI_REQUEST_TIMEOUT_SECONDS=60 backend python -m pytest -q -s tests/live
  ```

## Test results (clean state: `down -v`, rebuild, migrate, seed)

| Check | Result |
|---|---|
| `pytest -q` | 671 passed, 0 failed, 1 skipped (the opt-in live test), 0 warnings |
| `ruff check .` and `ruff format --check .` | Clean |
| `alembic check` | No new upgrade operations detected |
| `npm run lint` | Clean, container |
| `npm test -- --run` | 31 passed, container |
| `npm run build` | Succeeds, container |
| Manual API demo in mock mode | Passed, see `docs/RUN_REPORTS/RUN_02.md` |
| Live Gemini smoke test | **Failed: `AI_TIMEOUT`** |

No browser check was run in Run 02, because the frontend did not change. The Run 01 browser check was a one-off (ADR-023).

## Known bugs

None known, apart from the blocker above. See limitations below.

## Known limitations

- Requests can only be created, analyzed, reviewed, commented on or updated through the API (`/docs`). The screens come in Phases 7 and 8.
- Pattern-based policy scanning can be evaded by rephrasing or other languages, and produces false positives. Rates have not been measured (Phase 9).
- Seeded `TRIAGED` and `NEEDS_HUMAN_REVIEW` requests have no suggestion, so `POST /review` on them returns 409 `NO_PENDING_SUGGESTION`. Staff move them with PATCH.
- Rate limits are per process, count all login attempts, and do not trust proxy headers (ADR-030).
- A crashed analysis blocks retries for up to `AI_STALE_RUN_SECONDS` and uses one attempt (ADR-026).
- A request with history cannot be hard-deleted, because the append-only trigger refuses the cascade (ADR-025).
- `ai_runs.redacted_input` has no retention job. The demo reset is the only cleanup.
- The relevance floor is measured on 12 articles and should be re-measured in Phase 9.
- Base images use floating tags (`postgres:17`, `python:3.12-slim`, `node:24-slim`).
- Mobile layout and keyboard use have not been checked in a browser (Phase 7).
- `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/EVALUATION.md`, CI and `LICENSE` do not exist yet. Later phases add them.
