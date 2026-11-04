# Agent handoff

Last updated: 2026-11-04
Current phase and exact objective: Chunk 6, Phase 10 deployment: put the production image and a managed PostgreSQL on a free or low-cost host.
Repo branch and last verified commit: `main`, pushed to the private remote `origin`. Run `git log --oneline`. Phases 0 to 9 passed a clean-state verification.
Run 05 in progress: Checkpoint 18 (demo safeguards, ADR-051) is committed; Checkpoints 19 onward follow. Implemented and verified: see `docs/IMPLEMENTATION_STATUS.md` and `docs/RUN_REPORTS/RUN_04.md`.
Environment/service state: dev stack running in mock mode with default limits, migrated at `0006`, freshly reset demo data.
Known bugs / incomplete tests: no known bugs. **The CI workflow had not run on GitHub when this was written.** Check the Actions tab first. The running app has not been used with `AI_MODE=gemini`.
Decisions and assumptions made: ADR-000 to ADR-050.
What the next agent must read: `AGENTS.md`, the status doc, ADR-030, 044 to 050, `docs/SECURITY.md`, `docs/EVALUATION.md`, `.env.prod.example`, `compose.prod.yaml`, and blueprint sections 10 (Phase 10), 12 and 14. Blueprint 12.2 proposes separate hosts, and ADR-044 supersedes that.
Next 3 concrete actions: confirm CI is green; get the owner's decisions below; deploy in mock mode and run the smoke test.
Owner-only actions needed: the decisions below, creating accounts, and entering secrets in the host's secret manager.

## Things that will catch you out

- **`Secure` cookie.** In production the session cookie is `Secure`, so the site must be served over HTTPS, except on `localhost`. Without it, sign-in appears to work and a reload signs out.
- **`TRUSTED_PROXY_HOPS` must match the host.** Most platforms have one proxy, so 1. Left at 0, every visitor shares the proxy's address, so they share login limits, and the refresh limit of 60 per minute becomes a limit for everyone. Too high and a client can forge its address. Check by watching which address the limiter sees. Confirm the host appends to `X-Forwarded-For`.
- **`HSTS_ENABLED`.** Turn it on only after HTTPS is confirmed working. Browsers remember it for a year.
- **One process only.** The rate limiter is in memory (ADR-030). Do not add workers or a second instance without moving it to a shared store.
- **Create `app_user` before migrating.** Otherwise revision `0006` grants nothing, and the app fails with permission errors. `deploy/sql/grant_app_role.sql` repairs that. Passwords go inside URLs, so use letters and digits only.
- **The running app must not get `MIGRATION_DATABASE_URL`.** It is for one-off commands only (ADR-047). `alembic upgrade head` and `reset_demo` need it. `seed_demo` runs with either role.
- **Nothing migrates or seeds on start,** on purpose. `/readyz` returns 503 until migrations reach head, so use `/healthz` for liveness and `/readyz` for readiness, and migrate before expecting traffic.
- **`seed_demo` and `reset_demo` refuse production** without `--allow-production`. `reset_demo` also needs `ALLOW_DEMO_RESET=true`, which the running app should not have.
- **Build context is the repository root:** `docker build -f deploy/Dockerfile .`. The root `.dockerignore` is a strict allowlist.
- **The filesystem is read-only in `compose.prod.yaml`.** A host might not offer that. The app does not need to write to disk.
- **Free PostgreSQL may expire.** The blueprint notes this for one provider. Check current terms and record them. Do not rely on memory for prices or limits.
- **Live mode on a public demo** spends the owner's free-tier quota, and free-tier content may be used to improve the provider's products. The rate limits apply per user, and demo accounts are shared. `AI_MODE=mock` is the kill switch.
- **E2E:** `npm --prefix e2e run e2e` (dev, resets demo data) and `npm --prefix e2e run e2e:prod` (production image, its own stack and throwaway secrets). `BASE_URL`, `HOST_RULES` and `API_URL` point the suite elsewhere. Do not run the suite against a hosted site without care: it creates data, and its limits assume `compose.prod.e2e.yaml`.
- **Rotation:** repeating a refresh token revokes that whole sign-in. Never call refresh twice with one token.
- **Evaluation in mock mode measures the pipeline, not model quality.** The 100% hold rate is on a fixture used to tune the patterns (`docs/EVALUATION.md`).
- **Migrations.** Never edit an applied revision. `tests/test_migrations.py` fails if models and migrations differ. New tables get ordinary `app_user` access by default, so a new append-only table must revoke in its own migration.
- **Backend serializers are allowlists.** A new requester field must be added deliberately.
- **Log tests must use `caplog`.** The handler holds the `sys.stdout` from import time.
- **In Git Bash, `/tmp/...` arguments to `docker exec` get rewritten** into Windows paths. Set `MSYS_NO_PATHCONV=1`, or use PowerShell.
- **Exit codes.** In PowerShell, read `$LASTEXITCODE` straight after a command, and write output to a file rather than judging by a filtered pipe.
- **Non-interactive shells.** Use `docker compose exec -T`.
- **Look at the screenshots.** In Run 04, a button wrongly visible on desktop passed every automated check, and was found only by eye.
- **Gemini.** No agent may call the live API without an explicit budget from the owner. Never print `GEMINI_API_KEY`.

## What the owner must decide

| Decision | Options to research and compare | Notes |
|---|---|---|
| Hosting provider | Any host that runs a Docker image, with HTTPS and a health check | Compare current free tiers, sleep behavior and region. A sleeping instance also clears the rate limiter |
| Region | Near the likely viewers, and in the same region as the database | |
| Database provider | A non-expiring free tier, or a low-cost paid plan | Must allow creating a second role. Check connection limits, backups and pausing |
| `DEMO_MODE` | `true` shows the accounts and public password on the sign-in page | Recommended for a public portfolio demo. Anyone can then sign in and change the shared data |
| Live or mock AI | `mock` is free and deterministic. `gemini` spends quota and shows the real thing | Recommended: start with `mock`, then try `gemini` on a controlled basis once the app has run in that mode privately |
| Demo reset | By hand, or a schedule the host offers | Shared accounts will collect clutter |
| Public repository | When to change visibility | Owner only. Old commits may stay reachable by SHA until GitHub removes them (`docs/RUN_REPORTS/CLEANUP.md`) |

## Environment variables

**Running app:**

| Variable | Value |
|---|---|
| `APP_ENV` | `production` (already set in the image) |
| `DATABASE_URL` | `postgresql+psycopg://app_user:<password>@<host>:5432/<db>`, plus any SSL option the provider needs |
| `JWT_SECRET` | At least 32 random characters. Generate it once, and keep it in the host's secret manager |
| `PORT` | Set by most hosts. Defaults to 8000 |
| `CORS_ALLOWED_ORIGINS` | Empty: the app is same-origin. **Set it explicitly,** because the built-in default is the local dev origin |
| `AI_MODE` | `mock` to begin with |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Only for `gemini`. `gemini-3.5-flash-lite` was used for the evaluation |
| `DEMO_MODE` | Owner's decision |
| `DEMO_PASSWORD` | Shown on the page when `DEMO_MODE=true`. It must match what was seeded |
| `TRUSTED_PROXY_HOPS` | Usually 1. Confirm per host |
| `HSTS_ENABLED` | `true` once HTTPS is confirmed |
| `LOG_LEVEL` | `INFO` |

Optional, with safe defaults: `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_HOURS`, `RATE_LIMIT_LOGIN_PER_MINUTE`, `RATE_LIMIT_ANALYZE_PER_HOUR`, `RATE_LIMIT_REFRESH_PER_MINUTE`, `AI_REQUEST_TIMEOUT_SECONDS`, `AI_MAX_ANALYZE_ATTEMPTS`, `AI_STALE_RUN_SECONDS`, `KB_MIN_RANK`.

**One-off commands only:** the above, plus `MIGRATION_DATABASE_URL` (owner role) and, for a reset, `ALLOW_DEMO_RESET=true`.

## Migration and seed procedure

1. As the owner role, run `deploy/sql/create_app_role.sql` with a generated password. Do not save the edited file. Confirm the role has no inherited rights.
2. Run the image once with `MIGRATION_DATABASE_URL` set: `alembic upgrade head`.
3. Confirm the limits, by connecting as `app_user`: `UPDATE audit_logs SET action = 'x'` and `CREATE TABLE t (id int)` must both be refused. See `tests/test_db_role.py`.
4. Start the app without `MIGRATION_DATABASE_URL`. `/healthz` should be 200, and `/readyz` 200 `at_head`.
5. For demo data, once only: `python -m app.scripts.seed_demo --allow-production`. It is safe to repeat, and leaves existing rows alone.
6. On each later deploy that adds a migration, migrate first, and keep migrations backward compatible, because the old version keeps running until the new one is ready.

## Smoke-test checklist

Over HTTPS, on the hosted URL:

- [ ] `/healthz` 200, `/readyz` 200, and `/docs` shows no API docs
- [ ] Response headers: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and HSTS if enabled
- [ ] The browser console shows no content security violations
- [ ] The session cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, on path `/api/v1/auth`
- [ ] Sign in, reload and stay signed in. Sign out, reload and stay signed out
- [ ] A direct visit to a deep link loads the app, and an unknown `/api/v1/...` path returns a JSON 404
- [ ] Ordinary request: analysis, labeled suggestion, citation opens, feedback saved
- [ ] Sensitive request: awaiting review, with no draft text in the page or responses
- [ ] Staff: an unsafe reply is refused before the dialog. A safe reply is approved, and the requester's open page shows it, labeled as reviewed
- [ ] Admin: publish and unpublish an article, and read the audit log
- [ ] A requester gets 403 at `/support`, and 404 for another person's request
- [ ] Wrong passwords reach 429. A second visitor from another network is not limited too, which proves `TRUSTED_PROXY_HOPS`
- [ ] Logs hold no bodies, tokens or keys
- [ ] Redeploy: data persists, and sessions still work
- [ ] Record the URL, the commit and the date in the status doc

## Rollback

- **App:** redeploy the last good image or commit. Keep the previous image tag.
- **Database:** take a backup before each migration where the plan allows. Prefer a new forward migration to `alembic downgrade`. Revision `0005`'s downgrade drops `refresh_tokens`, which only signs people out. Revision `0006`'s removes the role's access.
- **Live AI problem or unexpected usage:** set `AI_MODE=mock` and restart.
- **A leaked secret:** rotate it at once. Changing `JWT_SECRET` invalidates every access token. Refresh tokens are separate rows: to end all sessions, set `revoked_at` on them as the owner role.
- **Bad demo data:** `reset_demo --yes --allow-production`, as a one-off, with `ALLOW_DEMO_RESET=true`.

## Prompt for the next chunk

> You are the lead implementation engineer for IknowServiceAI. Read `AGENTS.md`, then every document it lists, then this handoff. Inspect the repository and `git log`, and treat code and tests as ground truth.
>
> Execute **Chunk 6: Blueprint Phase 10 deployment**. First, confirm the owner has made the decisions listed above, and that the latest CI run on `main` is green. If CI failed, fix that first. Deploy the production image with a managed PostgreSQL in mock mode, following the migration and seed procedure. Run the whole smoke-test checklist, and record real results. Add any host-specific configuration as a small, documented file, and record the choice in an ADR with prices and limits checked on the day. Use only secrets the owner has placed in the host's secret manager, and never print them. Do not enable billing without the owner's explicit approval. Do not change repository visibility, or create tags or releases, unless the owner asks. Update `README.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/SECURITY.md` and this file, and write a run report. Never mark anything done without running the check that proves it.
