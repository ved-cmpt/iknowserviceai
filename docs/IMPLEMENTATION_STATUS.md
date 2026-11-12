# Implementation status

Updated: 2026-11-11
Current phase: complete, in maintenance. The public demo is live and verified, and `v1.0.0` is the first release.
Branch: main; see `git log --oneline` for the commit
Deployment status: live at https://iknowserviceai.onrender.com, on Render and Neon. Remote: `origin`, private until the owner makes it public

| Phase | Status | Evidence | Remaining |
|---|---|---|---|
| 0 Repository and docs | DONE | `git log`; only example env files tracked; gitleaks clean; key count 0 in tracked files and history | None |
| 1 Scaffolding, Docker, health | DONE | `docker compose up --build -d --wait` from `down -v`; `/readyz` 503 before migrating, 200 after; frontend 200 | None |
| 2 Schema, migrations, auth, seed | DONE | Alembic upgrade and `check`; seed twice gives 4 users, 13 articles, 9 requests | None |
| 3 Request lifecycle | DONE | `tests/test_requests_lifecycle.py`, `tests/test_request_counts.py`, `tests/test_concurrency.py` | None |
| 4 Knowledge base and retrieval | DONE | `tests/test_knowledge.py`, `tests/test_admin_filters.py`, `src/tests/knowledge.test.jsx` | None |
| 5 AI orchestration | DONE. Live path sampled | `tests/test_analyze.py`, `tests/test_redaction.py`, `tests/test_gemini_agent.py`, `tests/test_mock_citations.py`, `tests/test_mock_replies.py`; 10-case live sample through the orchestrator; 2 requests through the running app in `AI_MODE=gemini` | None |
| 6 Review gates and hardening | DONE | `tests/test_policy.py`, `tests/test_review.py`, `tests/test_adversarial.py`, `tests/test_hardening.py`, `tests/test_append_only.py`; `docs/SECURITY.md` | None |
| 7 Requester frontend | DONE | `src/tests/newRequest.test.jsx`, `requestDetail.test.jsx`, `dashboard.test.jsx`, `shell.test.jsx`; E2E scenarios 1, 2, 3, 5 at 1440 px; 1, 2, 5 at 375 px; keyboard-only test | None |
| 8 Staff and admin frontend, E2E | DONE | `src/tests/support.test.jsx`, `admin.test.jsx`; `e2e/tests/`: 28 tests, 38 axe checks; screenshots in `assets/screenshots/` | None |
| 9 Quality and evaluation | DONE | `docs/EVALUATION.md`, `backend/eval/`, `tests/test_eval_regression.py`. Sensitive hold recall 100% on a tuned fixture; 0 invented citations kept | A held-out set, and scoring reply quality, are future work |
| 10 GitHub, CI, deployment | DONE | CI confirmed on GitHub. Live site verified in Run 06: `e2e/verify-live.mjs` 54 of 54, browser subset 21 and 7 passed, data survives a redeploy, cold start 32.2 s. See `docs/DEPLOYMENT.md` | Testing the limiter from a second network |
| 11 Portfolio packaging | DONE | Redesign (ADR-056), `README.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/RUNBOOK.md`, `LICENSE`, screenshots, video, tag `v1.0.0` | None |

**Live Gemini:** the owner's adapter smoke test passed after Run 02. In Run 04, a 10-case sample ran through the real orchestrator, using 11 of the 12 allowed calls, with no failures. Results are in `docs/EVALUATION.md`. In Run 05, the running app in `AI_MODE=gemini` handled 2 requests through its HTTP endpoints, using at most 3 calls.

Decisions changed since blueprint: ADR-000 (doc file mapping), ADR-015 (any-term search ordering), ADR-021 (schema refinements), ADR-024 (query-focused snippets), ADR-025 (append-only triggers narrow ADR-007), ADR-027 (uncited replies always need review), ADR-028 (generic failure code for requesters), ADR-029 (Gemini call shape), ADR-031 (escalation withholds a visible reply), ADR-032 (mock citations), ADR-033 (added API filters and counts), ADR-034 (frontend structure), ADR-035 (auto-analysis), ADR-036 (staff screen for every request), ADR-037 (Playwright in Docker), ADR-038 to ADR-043 (Run 04 behavior changes), ADR-044 (one production container, replacing the blueprint's separate hosts), ADR-045 (refresh cookie, replacing ADR-009's reload behavior), ADR-046 to ADR-050 (demo help, database role, headers, evaluation, CI), ADR-061 (three proxy hops on Render, replacing part of ADR-052). See [the ADR log](ARCHITECTURE_DECISIONS.md).

Current blockers: none.

## Run 07 progress: product-grade redesign and a public website (v1.1.0)

- **Checkpoint 29, brand and design system: DONE.** `scripts/brand/build.mjs`, `docs/BRAND.md`, ADR-062. Dark is the default theme. Inter and JetBrains Mono replace IBM Plex. Frontend 242 passed, lint clean.
- **Checkpoint 30, routes: DONE.** ADR-063. The website is at `/`, the app under `/app`, and old paths redirect on the client. `robots.txt`, `sitemap.xml`, social tags, origin compression. Backend SPA tests cover both pages and every old path. New browser spec `e2e/tests/website.spec.js`: 10 passed on the dev stack, with the 404 checks.

## Run 06 progress

- **Checkpoint 26, live verification: DONE, with one check not possible.** `TRUSTED_PROXY_HOPS=1` was wrong, and the limiter was unreliable. Fixed with `3`, from a measurement (ADR-061). Results are in `docs/DEPLOYMENT.md` and `docs/RUN_REPORTS/RUN_06.md`. A second network was not available.
- **Checkpoint 27, live demo docs: DONE.**
- **Checkpoint 28, release readiness: DONE.** See `docs/RUN_REPORTS/RUN_06.md`.

## Run 05 progress

- **Checkpoint 18, public-demo safeguards: DONE.** `tests/test_demo_safeguards.py` (31 tests, including as `app_user`), production E2E banner check. See ADR-051.
- **Checkpoint 19, Render and Neon settings: DONE.** `render.yaml` validates against the schema Render publishes; `tests/test_health.py`; production E2E 43 passed, 1 skipped. See ADR-052 and ADR-053. The Blueprint itself has not been applied to Render.
- **Checkpoint 20, Neon provisioned: DONE.** `deploy/neon/provision.py`: role, migrations at `0007`, seed twice (4 users, 13 articles, 9 requests), all `app_user` checks passed, reset works as `app_user`. Production image on Neon: browser suite 43 passed, 1 skipped by design; demo data reset afterwards. Neon runs PostgreSQL 18, and development and CI use 17 (ADR-054); the backend suite passed on 18 too, 873 passed, 1 skipped. See `docs/DEPLOYMENT.md`.
- **Checkpoint 21, visual redesign: DONE.** ADR-056. Frontend 237 passed. Dev browser suite 33 passed, 11 skipped by design. Production browser suite 45 passed, 1 skipped by design. axe now fails on any finding, in both themes, at 1440 and 375 px: 94 checks on the production image, all with 0 findings. Every screen reviewed by eye in both themes.
- **Checkpoint 24, polish: DONE, ahead of 22 and 23.** Staff page refreshes by itself (ADR-059), 10 minute access tokens (ADR-058), browser subset on pull requests (ADR-057), live path through HTTP checked with 2 requests and at most 3 provider calls (`docs/EVALUATION.md`), article IDs replaced in replies (ADR-060).
- **Checkpoint 22, screenshots and demo: DONE.** `npm --prefix e2e run screenshots` (production image, 16 files, 622 KB after optimizing) and `npm --prefix e2e run demo:record` (86 s H.264 video of 1.1 MB, and a 3.1 MB animated preview).
- **Checkpoint 23, documentation: DONE.** README, architecture, demo script, runbook, MIT license. 7 Mermaid diagrams rendered with the Mermaid CLI, and lychee found 0 broken local links.

## Test results

**GitHub CI, run 41933225104, on `86e2390`, tagged `v1.0.0`, from a clean checkout: success.** Later commits change docs only.

| Check | Result |
|---|---|
| `pytest -q`, ruff, format, `alembic check` | 876 passed, 1 skipped (the opt-in live test). Clean |
| `npm run lint`, `npm test -- --run`, `npm run build` | 242 passed. Clean |
| `npm --prefix e2e run e2e` | 34 passed, 13 skipped by design |
| `npm --prefix e2e run e2e:prod` | 46 passed, 1 skipped by design |
| axe, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, both themes, 1440 and 375 px | 172 checks, no findings of any severity |
| `docker build`, gitleaks over the full history | Success |

**Local, 2026-11-04:** from `down -v`: `/readyz` 503 `behind_head`, upgrade and `alembic check` exit 0, seed twice gives 4 users, 13 articles, 9 requests, `/readyz` 200. **The local run was stopped there by the system, for low memory, and was not restarted.** Also local: backend suite on PostgreSQL 18, 873 passed, 1 skipped; production image on Neon, 43 passed, 1 skipped, before the redesign; `actionlint` and lychee clean; 7 Mermaid diagrams render.

**Live site, 2026-11-04:** `node e2e/verify-live.mjs` 54 of 54. `npm --prefix e2e run e2e:live`: desktop 21 passed, 1 skipped, and a narrowed mobile run 7 passed, with 72 axe checks and no findings.

**Not done:** a local fresh-clone walkthrough of the README.

Skips by design: production-only checks on the dev stack, and the layout tests on the viewport they do not apply to.

## Known bugs

None known.

## Known limitations

- Assignment is to yourself only: there is no picker for other staff.
- Staff cannot rate a suggestion on their own request from the UI (ADR-036).
- While a draft is pending review, the status controls offer no moves, which is stricter than the API. A person can still use the API to move the request, which strands the draft until it is escalated again.
- Browser checks ran in Chromium only, against both the Vite dev server and the production image. No real screen reader has been tried. Axe finds only part of what affects accessibility.
- Pattern-based policy scanning can be evaded by rephrasing or other languages, and produces false positives. The evaluation's 100% hold rate is on a fixture used to tune the patterns (`docs/EVALUATION.md`).
- A shared word can retrieve an unrelated article. In live mode, only the model's judgment stops a confident reply citing it, and this is not measured (`docs/EVALUATION.md`).
- Seeded `TRIAGED` and `NEEDS_HUMAN_REVIEW` requests have no suggestion, so staff move them with the status controls.
- Rate limits are per process and count all login attempts (ADR-030). `TRUSTED_PROXY_HOPS` must be set per host (ADR-048), and on Render it depends on a proxy chain the host could change (ADR-061).
- A crashed analysis blocks retries for up to `AI_STALE_RUN_SECONDS` and uses one attempt (ADR-026).
- A request with history cannot be hard-deleted, because the append-only trigger refuses the cascade (ADR-025).
- `ai_runs.redacted_input` has no retention job. The demo reset is the only cleanup.
- The relevance floor was measured again on the fixture, and no value separates noise from fair sources (`docs/EVALUATION.md`).
- An access token stays valid for up to 10 minutes after sign-out (ADR-058).
- Refresh token rows are only removed when that person signs in again after they expire. The demo reset also clears them.
- Browsers without the Web Locks API can sign a person out if two tabs reload at the same moment (ADR-045).
- The Content-Security-Policy blocks images hosted elsewhere in article markdown (ADR-048).
- Pull requests run a browser subset, and the full suite runs on pushes to `main` (ADR-057).
