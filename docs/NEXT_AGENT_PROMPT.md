# Agent handoff

Last updated: 2026-11-04
Current objective: **Run 06: verify the live Render deployment.** The owner supplies the URL after applying the Blueprint.
Repo branch and last verified commit: `main`, on the private remote `origin`. Run `git log --oneline`. Run 05's report states the pushed SHA.
Implemented and verified: see `docs/IMPLEMENTATION_STATUS.md` and `docs/RUN_REPORTS/RUN_05.md`.
Environment and service state: local dev stack running in mock mode, migrated, with fresh demo data. Neon is provisioned, at `0007`, with the daily reset enabled and demo data freshly reset. **Render has not been applied, so nothing is live.**
Known bugs: none known.
Decisions: ADR-000 to ADR-060.
What the next agent must read: `AGENTS.md`, the status doc, `docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`, `docs/SECURITY.md`, `render.yaml`, and ADR-044 to ADR-054.
Next 3 concrete actions: confirm the owner's URL answers; run the smoke checks below with care about shared data; update the README and status doc with real results.
Owner-only actions: applying the Blueprint, making the repository public, and tagging `v1.0.0`.

## Prompt for Run 06

> You are the lead implementation engineer for IknowServiceAI. Read `AGENTS.md` and every document it lists, then this handoff and `docs/RUN_REPORTS/RUN_05.md`. Treat code and tests as ground truth. The owner gives you the live URL.
>
> **Verify the live Render deployment,** and fix what you find:
>
> 1. **Production smoke suite against the live HTTPS site.** Write a small, repeatable Playwright subset in `e2e/` that takes the URL as `BASE_URL`, runs in `AI_MODE=mock`, and leaves little behind. The existing suite assumes `compose.prod.e2e.yaml` limits and a resettable database, so do not point it at the live site as it is. Cover: sign in, reload, ordinary journey, sensitive journey, staff review, knowledge, audit, 403 and 404, and no content security violations.
> 2. **Cookies and headers through Render's proxy:** the refresh cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, on `/api/v1/auth`. Check `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security`, which is on in `render.yaml`. `/docs` shows no API docs.
> 3. **Proxy hops and rate limits, which are unverified.** `TRUSTED_PROXY_HOPS=1` is a reasoned default (ADR-052). Check what `X-Forwarded-For` really holds behind Render. Confirm that a forged header does not change the address the limiter uses, and that one client's wrong passwords reach 429 without limiting a second network. Adjust the value, and record the evidence, if it is wrong.
> 4. **Cold starts.** Time a request after Render's sleep (15 idle minutes) and Neon's suspension (5 idle minutes), and sign in right after. Confirm `/healthz` passes, and that `/readyz` answers within its budget.
> 5. **Persistence after a redeploy:** data survives, and sessions behave as documented.
> 6. **Demo safeguards:** the banner shows on the sign-in page and in the app. The daily reset is hard to wait for, so test it by backdating `demo_state.last_reset_at` as the owner role, then making an API request. Confirm it ran as `app_user`, and that the demo reseeded. Check a volume cap only if it can be done without disturbing visitors, and reset afterwards.
> 7. **Then** set `CORS_ALLOWED_ORIGINS` to the real URL if it differs from the placeholder. Update the README's "Live demo" section with the real link, mark the project as live in the README and the status doc, and record the URL, commit and date. Update `.portfolio/PORTFOLIO_NOTES.md`, which is not tracked, replacing "deploying" with "deployed" only when this all passes.
>
> Rules: never print a connection string, password, JWT secret or API key. Use the owner connection in `.env` only for one-off commands. No live AI calls: the demo stays in mock mode. Reset the demo data when finished. Do not change repository visibility or create tags: **the owner makes the repository public and tags `v1.0.0` afterwards**. Never mark anything done without the check that proves it. Commit per step, and scan for secrets before pushing. Write `docs/RUN_REPORTS/RUN_06.md`.

## Things that will catch you out

- **`.env.render` must match Neon.** Running `deploy/neon/provision.py` again rotates the `app_user` password and JWT secret, and resets demo data. Paste the new file into Render, or the service loses its database.
- **`DEMO_PASSWORD` is in `render.yaml` on purpose.** It is published on the sign-in page. The reset reseeds with it, so it must match the seed.
- **Migrate first.** Render does not run migrations. `/readyz` shows `"migrations": "behind_head"` if you forget. Keep them backward compatible. **A new table must also be added to `demo_reset_begin`,** in its own migration, and a test fails until it is.
- **One process only.** The rate limiter lives in memory, and restarts clear it (ADR-030).
- **Neon runs PostgreSQL 18, and development and CI use 17** (ADR-054). The backend suite passed on both.
- **`FORWARDED_ALLOW_IPS=*` belongs only on the host.** The image defaults to `127.0.0.1`, so a client without a proxy cannot set its own address.
- **After frontend dependency changes,** use `docker compose up -d --build --renew-anon-volumes frontend`, or the container keeps the old `node_modules`. `e2e/run.mjs` already does.
- **`expectAccessible` is strict:** any axe finding in either theme fails. Colors go through `frontend/src/styles/tokens.css`, whose dark values appear twice.
- **The Content-Security-Policy allows no inline scripts or `<style>`.** React's `style` prop is fine, because it goes through the DOM. Test in the production image.
- **Screenshots and video come from the production image:** `npm --prefix e2e run screenshots` and `demo:record`, after `npm --prefix e2e ci`. Regenerate them after visible changes.
- **`Secure` cookie.** Outside `localhost`, the site needs HTTPS, or a reload signs out.
- **Rotation:** repeating a refresh token revokes that sign-in. Never call refresh twice with one token.
- **Evaluation in mock mode measures the pipeline, not model quality.** The 100% hold rate is on a fixture used to tune the patterns.
- **Never edit an applied migration.** `tests/test_migrations.py` fails if models and migrations differ. A new append-only table must revoke in its own migration.
- **Backend serializers are allowlists.** A new requester field must be added deliberately.
- **Log tests must use `caplog`.**
- **In Git Bash, set `MSYS_NO_PATHCONV=1`** for container paths. In PowerShell, read `$LASTEXITCODE` straight after a command.
- **Check your exit codes, not a filtered pipe.** In Run 05, a chain continued past a lint failure, and it reached a commit before being fixed.
- **Look at the screenshots.** Automated checks do not catch layout problems.
- **Gemini.** No agent may call the live API without an explicit budget from the owner. Never print the key. The backend's logs do not show provider requests, so they cannot be counted from there.
