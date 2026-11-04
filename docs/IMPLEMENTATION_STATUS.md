# Implementation status

Updated: 2026-11-04
Current phase: 5 (not started)
Branch: main; see `git log --oneline` for the commit
Deployment status: not deployed; local Docker only

| Phase | Status | Evidence | Remaining |
|---|---|---|---|
| 0 Repository and docs | DONE | `git log`; only `.env.example` tracked; no secret in history | GitHub remote (owner, later chunk) |
| 1 Scaffolding, Docker, health | DONE | `docker compose up --build -d --wait` from `down -v`; `/healthz` and `/readyz` 200; `/readyz` 503 before migrating; frontend 200 | None |
| 2 Schema, migrations, auth, seed | DONE | Alembic upgrade, repeat, `check` and down/up test; seed twice gives 4 users, 13 articles, 9 requests; four accounts via API and headless Edge; data survives `down` + `up` | None |
| 3 Request lifecycle | DONE (API) | `tests/test_requests_lifecycle.py` 133 tests including all 49 status pairs; `tests/test_concurrency.py` real two-connection race; `docs/API.md` | Screens belong to Phases 7 and 8 |
| 4 Knowledge base and retrieval | DONE | `tests/test_knowledge.py` 114 tests; frontend search and article tests; browser check of search, article and inert draft | Admin screens belong to Phase 8 |
| 5 AI orchestration | IN_PROGRESS | `tests/test_analyze.py`, `tests/test_redaction.py`, analyze races in `tests/test_concurrency.py` | Gemini adapter and live smoke test |
| 6 Review gates and hardening | NOT_STARTED | | All |
| 7 Requester frontend | NOT_STARTED | Login, dashboard list and knowledge pages exist | New request form, request detail, analysis, feedback |
| 8 Staff and admin frontend, E2E | NOT_STARTED | | All |
| 9 Quality and evaluation | NOT_STARTED | | All |
| 10 GitHub, CI, deployment | NOT_STARTED | | All |
| 11 Portfolio packaging | NOT_STARTED | | All |

Decisions changed since blueprint: ADR-000 (doc file mapping), ADR-015 (any-term search ordering), ADR-021 (schema refinements). See [the ADR log](ARCHITECTURE_DECISIONS.md).
Current blockers: none

## Test results (clean state: `down -v`, rebuild, migrate, seed)

| Check | Result |
|---|---|
| `pytest -q` | 309 passed, 0 failed, 0 skipped, 1 warning |
| `ruff check .` and `ruff format --check .` | Clean |
| `npm run lint` | Clean, container and host |
| `npm test -- --run` | 31 passed, container and host |
| `npm run build` | Succeeds, container and host |
| Browser journey in headless Edge | 20 checks passed |

## Known bugs

None known. See limitations below.

## Known limitations

- Requests can only be created, commented on or updated through the API (`/docs`). The screens come in Phases 7 and 8.
- No rate limiting yet, including on login (Phase 6).
- The relevance floor is measured on 12 articles and should be re-measured in Phase 9.
- Base images use floating tags (`postgres:17`, `python:3.12-slim`, `node:24-slim`).
- Mobile layout and keyboard use have not been checked in a browser (Phase 7).
- `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/EVALUATION.md`, CI and `LICENSE` do not exist yet. Later phases add them.
