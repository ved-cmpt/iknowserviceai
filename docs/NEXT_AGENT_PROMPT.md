# Agent handoff

Last updated: 2026-11-04
Current phase and exact objective: Run 04 in progress. Checkpoints 14 and 15 are committed; next are evaluation and CI.
Repo branch and last verified commit: `main`; run `git log --oneline`. Phases 0 to 8 passed a clean-state verification in mock mode.
Implemented and verified: see `docs/IMPLEMENTATION_STATUS.md` and `docs/RUN_REPORTS/RUN_03.md`.
Environment/service state: compose stack running in mock mode with default limits, migrated at `0004`, freshly reset demo data.
Known bugs / incomplete tests: no known bugs. Limitations are listed in the status doc. The whole app has not run in `AI_MODE=gemini`.
Decisions and assumptions made: ADR-000 to ADR-037.
What the next agent must read: `AGENTS.md`, the status doc, the ADR log (especially ADR-016, 027, 029, 030 and 037), `docs/API.md`, `docs/SECURITY.md`, and blueprint sections 10 (Phases 9 and 10), 11, 13 and 14.
Next 3 concrete actions: write the 30-case fixture and mock regression test; run and document the evaluation; add the GitHub Actions workflow.
Owner-only actions needed: running any live Gemini sample; creating the GitHub repository and remote.

## Things that will catch you out

- **E2E resets the demo data,** and restores default settings afterwards. Run it with `npm --prefix e2e run e2e`. The compose override is `compose.e2e.yaml`. The browser runs in a container, and Chromium maps `localhost:5173` and `localhost:8000` to the services (ADR-037). Upgrade the image tag and `@playwright/test` together.
- **A reload keeps the session,** through the refresh cookie (ADR-045). Each Playwright context starts with no cookie, so it starts signed out. Rotation means a repeated token revokes the session, so never call refresh twice with one token.
- **The app connects as `app_user`** (ADR-047). Migrations and `reset_demo` use `MIGRATION_DATABASE_URL`. New tables get ordinary access by default, so a new append-only table must revoke in its own migration. A dev volume from before revision `0006` needs `docker compose down -v` once.
- **Production E2E:** `npm --prefix e2e run e2e:prod`, with its own project and throwaway secrets.
- **Login limit.** 5 attempts per minute for one IP address and email, counting successes. Analyze is 10 per hour per user. Recreating the backend clears both. Tests in CI should use `compose.e2e.yaml`.
- **Mock results are deterministic but hold many requests.** Any policy flag means review, including uncited replies. `MockAgent` cites the top article, plus a close second in the same category (ADR-032). Mock needs the seed: with no published articles, everything goes to review.
- **`MockAgent` never fails.** E2E simulates a failed analysis with `page.route`. Backend failures are covered in `tests/test_analyze.py`.
- **Evaluation in mock mode measures the policy and retrieval, not model quality.** Report them separately from any live sample. Do not present mock accuracy as AI accuracy.
- **The relevance floor** (`KB_MIN_RANK=0.5`, ADR-016) was measured on 12 articles. Re-measure it against the fixture before changing it.
- **Backend serializers are allowlists.** A new requester field must be added deliberately, and `FORBIDDEN_REQUESTER_KEYS` tests extended.
- **Migrations.** Never edit `0001` to `0004`. `tests/test_migrations.py` fails if models and migrations differ.
- **History is append-only in the database** (ADR-025).
- **Log tests must use `caplog`.** The log handler holds the `sys.stdout` from import time, so `capsys` would pass without checking anything.
- **Exit codes.** In PowerShell, read `$LASTEXITCODE` straight after a command, and write output to a file rather than judging by a filtered pipe.
- **Non-interactive shells.** Use `docker compose exec -T`.
- **Gemini.** No agent should call the live API without an explicit budget from the owner. Never print `GEMINI_API_KEY`. If you check it, print only `set` or `not set` and its length.
- **Frontend text queries.** A message shown on screen and also sent to the live region appears twice in tests. Use one or the other: alerts and status banners announce themselves.

## Prompt for the next chunk

> You are the lead implementation engineer for IknowServiceAI. Read `AGENTS.md`, then every document it lists, then this handoff. Inspect the repository and `git log`, and treat code and tests as ground truth.
>
> Execute **Chunk 5: Blueprint Phase 9 plus CI**. Commit after each checkpoint passes its checks, and update `docs/IMPLEMENTATION_STATUS.md`, `docs/ARCHITECTURE_DECISIONS.md` and this file at each one. Keep `AI_MODE=mock` for all automated tests. Do not call the live Gemini API yourself. Do not push, create remotes or use external accounts.
>
> **Checkpoint 14, evaluation.**
> - A 30-case evaluation fixture in the backend tests, all synthetic: ordinary issues for each category, sensitive issues for each hard-review flag, prompt-injection attempts, requests with no relevant knowledge, and harmless text likely to cause false positives. Each case states the expected category, whether review is required, and the expected cited article where there is one.
> - A mock regression test that fails if results change, and a report command that prints category accuracy, review precision and recall, and citation correctness.
> - `docs/EVALUATION.md`: the method, the results, what they do and do not show, and the measured false-positive and false-negative rates for the policy gate. Re-measure the relevance floor (ADR-016) and record it, changing the value only with evidence and an ADR.
> - An optional, small live sample that only the owner runs: opt-in by environment variable, with a hard cap on cases and calls, documented with its free-tier and synthetic-data caveats. Build it and test it offline. Do not run it.
>
> **Checkpoint 15, performance, timeouts and logs.** Measure the main endpoints and page loads under mock mode, and record the numbers. Check every client and server timeout against the 2-attempt, 45-second provider budget. Review the logs for one full journey, for missing correlation IDs and for anything sensitive, and fix what you find.
>
> **Checkpoint 16, hardening carried over.**
> - Pin base image versions (`postgres`, `python`, `node`).
> - Add a non-superuser database role for the app, keeping migrations, `reset_demo` and the append-only triggers working (ADR-025). Update `docs/SECURITY.md`.
> - Hide the demo password hint outside demo mode: today `import.meta.env.DEV` always shows it.
>
> **Checkpoint 17, GitHub Actions.** One workflow, validated locally as far as possible, with:
> - Backend: ruff, format check, `alembic check` and pytest, with a Postgres service.
> - Frontend: lint, test and build.
> - E2E in mock mode, if feasible on hosted runners. Otherwise document why, and what would make it so.
> - A secret scan, and a Docker build of each image.
> - State clearly in the status doc that the workflow has **not** run on GitHub until the owner adds the remote. Never mark it passing without a run.
>
> **Finish:** from a clean state run `docker compose down -v`, `docker compose up --build -d --wait`, migrate, seed, `pytest -q`, `ruff check .`, `ruff format --check .`, `alembic check`, `npm run lint`, `npm test -- --run`, `npm run build` and `npm --prefix e2e run e2e`, capturing every exit code. Never mark anything done without running the check that proves it. Write a run report to `docs/RUN_REPORTS/RUN_04.md`, and leave the next-chunk prompt here, for Phase 10.
