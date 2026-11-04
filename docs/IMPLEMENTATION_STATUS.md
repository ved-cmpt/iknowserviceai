# Implementation status

Updated: 2026-11-04
Current phase: Run 04 in progress. Checkpoints 14 to 16 are committed; see `git log`.
Branch: main; see `git log --oneline` for the commit
Deployment status: not deployed; local Docker only

| Phase | Status | Evidence | Remaining |
|---|---|---|---|
| 0 Repository and docs | DONE | `git log`; only `.env.example` tracked; no secret in history | GitHub remote (owner, later chunk) |
| 1 Scaffolding, Docker, health | DONE | `docker compose up --build -d --wait` from `down -v`; `/readyz` 503 before migrating, 200 after; frontend 200 | None |
| 2 Schema, migrations, auth, seed | DONE | Alembic upgrade and `check`; seed twice gives 4 users, 13 articles, 9 requests | None |
| 3 Request lifecycle | DONE | `tests/test_requests_lifecycle.py`, `tests/test_request_counts.py`, `tests/test_concurrency.py` | None |
| 4 Knowledge base and retrieval | DONE | `tests/test_knowledge.py`, `tests/test_admin_filters.py`, `src/tests/knowledge.test.jsx` | None |
| 5 AI orchestration | DONE. Live adapter DONE, owner-verified | `tests/test_analyze.py`, `tests/test_redaction.py`, `tests/test_gemini_agent.py`, `tests/test_mock_citations.py`; owner's smoke test below | Whole-app run in `AI_MODE=gemini` is UNVERIFIED |
| 6 Review gates and hardening | DONE | `tests/test_policy.py`, `tests/test_review.py`, `tests/test_adversarial.py`, `tests/test_hardening.py`, `tests/test_append_only.py`; `docs/SECURITY.md` | None |
| 7 Requester frontend | DONE | `src/tests/newRequest.test.jsx`, `requestDetail.test.jsx`, `dashboard.test.jsx`, `shell.test.jsx`; E2E scenarios 1, 2, 3, 5 at 1440 px; 1, 2, 5 at 375 px; keyboard-only test | None |
| 8 Staff and admin frontend, E2E | DONE | `src/tests/support.test.jsx`, `admin.test.jsx`; `e2e/tests/`: 28 tests, 38 axe checks; screenshots in `assets/screenshots/` | None |
| 9 Quality and evaluation | NOT_STARTED | | All |
| 10 GitHub, CI, deployment | NOT_STARTED | | All |
| 11 Portfolio packaging | NOT_STARTED | | All |

**Live Gemini: DONE, owner-verified after Run 02.** `model=gemini-3.5-flash-lite http_requests=1 latency_ms=14878 tokens={'input': 625, 'output': 216, 'thought': 0, 'total': 841} outcome=pass`, result `category=NETWORK priority=MEDIUM confidence=0.95 citations=1 risk_flags=[] review=False`. The owner ran this, and no agent observed it. It is the adapter's opt-in test, so the full `AI_MODE=gemini` path through the running app has not been exercised. No live call was made in Run 03.

Decisions changed since blueprint: ADR-000 (doc file mapping), ADR-015 (any-term search ordering), ADR-021 (schema refinements), ADR-024 (query-focused snippets), ADR-025 (append-only triggers narrow ADR-007), ADR-027 (uncited replies always need review), ADR-028 (generic failure code for requesters), ADR-029 (Gemini call shape), ADR-031 (escalation withholds a visible reply), ADR-032 (mock citations), ADR-033 (added API filters and counts), ADR-034 (frontend structure), ADR-035 (auto-analysis), ADR-036 (staff screen for every request), ADR-037 (Playwright in Docker). See [the ADR log](ARCHITECTURE_DECISIONS.md).

Current blockers: none.

## Test results (clean state: `down -v`, rebuild, migrate, seed)

Exit codes were captured directly, with no pipe in between.

| Check | Exit | Result |
|---|---|---|
| `pytest -q` | 0 | 694 passed, 1 skipped (the opt-in live test) |
| `ruff check .` | 0 | Clean |
| `ruff format --check .` | 0 | 86 files already formatted |
| `alembic check` | 0 | No new upgrade operations detected |
| `npm run lint` | 0 | Clean, container |
| `npm test -- --run` | 0 | 194 passed, container. The clean-state run had 195, then one filler test was removed and this was re-run |
| `npm run build` | 0 | Succeeds, container |
| `npm --prefix e2e run e2e` | 0 | 28 passed (17 at 1440 px, 11 at 375 px), plus 5 screenshot captures |
| axe, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` | | 38 checks across 19 screens and states: 0 serious or critical, 0 lesser findings |

The E2E safety checks were tested too. Making the backend show held and rejected text to requesters failed scenarios 2 and 3. Lowering muted-text contrast failed axe with `color-contrast (serious)`. Both changes were then reverted.

## Known bugs

None known.

## Known limitations

- Assignment is to yourself only: there is no picker for other staff.
- The staff detail page does not refresh by itself (ADR-041). The stale-update message covers conflicts there.
- Staff cannot rate a suggestion on their own request from the UI (ADR-036).
- While a draft is pending review, the status controls offer no moves, which is stricter than the API. A person can still use the API to move the request, which strands the draft until it is escalated again.
- Browser checks ran in Chromium only, against both the Vite dev server and the production image. No real screen reader has been tried. Axe finds only part of what affects accessibility.
- Pattern-based policy scanning can be evaded by rephrasing or other languages, and produces false positives. The evaluation's 100% hold rate is on a fixture used to tune the patterns (`docs/EVALUATION.md`).
- A shared word can retrieve an unrelated article. In live mode, only the model's judgment stops a confident reply citing it, and this is not measured (`docs/EVALUATION.md`).
- Seeded `TRIAGED` and `NEEDS_HUMAN_REVIEW` requests have no suggestion, so staff move them with the status controls.
- Rate limits are per process and count all login attempts (ADR-030). `TRUSTED_PROXY_HOPS` must be set per host (ADR-048).
- A crashed analysis blocks retries for up to `AI_STALE_RUN_SECONDS` and uses one attempt (ADR-026).
- A request with history cannot be hard-deleted, because the append-only trigger refuses the cascade (ADR-025).
- `ai_runs.redacted_input` has no retention job. The demo reset is the only cleanup.
- The relevance floor was measured again on the fixture, and no value separates noise from fair sources (`docs/EVALUATION.md`).
- An access token stays valid for up to 30 minutes after sign-out (ADR-045).
- `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/EVALUATION.md`, CI and `LICENSE` do not exist yet. Later phases add them.
