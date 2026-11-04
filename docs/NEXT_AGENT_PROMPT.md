# Maintenance handoff

Last updated: 2026-11-04

**State:** `v1.0.0` is released, and the public demo is live at https://iknowserviceai.onrender.com. The project is in maintenance. No work is in progress.

Read `AGENTS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/RUN_REPORTS/RUN_06.md`, `docs/DEPLOYMENT.md` and `docs/RUNBOOK.md`. Code and tests are ground truth.

**Known gap:** the login limiter has not been tested from a second network. The measured header shape supports it. From another network, such as a phone hotspot, try the site while `node e2e/verify-live.mjs` is limiting an invented email on this one.

## Making a change safely

1. Work on a branch, and open a pull request. A browser subset runs on pull requests (ADR-057).
2. Run the checks in the README's "Tests and evaluation" section. Read each exit code, not a filtered pipe.
3. Scan before pushing: gitleaks over the full history, and search for the real secret values by count only.
4. Keep `AI_MODE=mock` for all tests. **Nothing may call the live provider without an explicit budget from the owner.**
5. Never print a connection string, password, JWT secret or key.
6. Do not name AI tools or vendors, or add attribution, in tracked files or commits. "Gemini" is fine, as the product's provider.
7. Record each significant decision as an ADR, and update the status document.

## Redeploying

- **A push to `main` deploys.** It takes 1 to 3 minutes. The site shows no version, so check **Events** in Render.
- **Migrate first,** from a workstation, as the owner. Keep migrations backward compatible, because the old version keeps running during a deploy. Steps are in `docs/DEPLOYMENT.md`.
- **A new table must be added to `demo_reset_begin`,** in its own migration. A test fails until it is.
- **Changing `render.yaml` can restart the service twice,** once for the code and once for the setting. Wait before trusting a result. In Run 06, a check failed in that gap.

## Checking the live site

The site is public and shared, so be gentle.

- `node e2e/verify-live.mjs`: about 60 requests. Run it after any change in hosting.
- `npm --prefix e2e run e2e:live -- desktop`: about 350 requests, and 6 of Riley's 10 analyses for the hour. Run it rarely, and only `mobile` after a redeploy or an hour.
- Never rate limit the published demo accounts. Use invented emails.
- Label created data `[verification]`, and reset afterwards.

## Resetting the demo data

The steps are in `docs/RUNBOOK.md`. It also resets itself on the first API request after 24 hours. A reset ends all sessions.

## Rotating secrets

| Secret | How |
|---|---|
| `app_user` password and `JWT_SECRET` | Run `deploy/neon/provision.py` again, then paste `.env.render` into Render. **This also resets the demo data** |
| Neon owner password | Reset it in the Neon console, and update `.env`. The service is not affected |
| `GEMINI_API_KEY` | Revoke it at the provider. The demo uses no key |

After any exposure, rotate first and investigate afterwards. `docs/RUNBOOK.md` has the steps. The repository's history is public once the owner changes its visibility, so a committed secret must be treated as burned.

## Recording the demo again

After any visible change, run `npm --prefix e2e ci` once, then `npm --prefix e2e run screenshots` and `npm --prefix e2e run demo:record`. They use the production image, on a throwaway stack. **Look at the results:** automated checks do not catch layout problems. Close other applications first, because the suites together have nearly run this machine out of memory.

## Things that will catch you out

- **`TRUSTED_PROXY_HOPS=3` depends on a proxy chain that the host could change.** If it does, the limiter degrades silently (ADR-061).
- **`.env.render` must match Neon.** Running `provision.py` again rotates the password, and Render loses its database until you paste the new file.
- **`DEMO_PASSWORD` is in `render.yaml` on purpose.** The reset seeds with it, so it must match.
- **One process only.** The rate limiter lives in memory, and restarts clear it (ADR-030).
- **Neon runs PostgreSQL 18, and development and CI use 17** (ADR-054).
- **`FORWARDED_ALLOW_IPS=*` belongs only on the host.** With it, `request.client` holds the leftmost header entry, which can be forged, so do not use it for security decisions.
- **After frontend dependency changes,** use `docker compose up -d --build --renew-anon-volumes frontend`.
- **`expectAccessible` is strict:** any axe finding in either theme fails. Colors go through `frontend/src/styles/tokens.css`.
- **The Content-Security-Policy allows no inline scripts or `<style>`.** Test in the production image.
- **Rotation:** repeating a refresh token revokes that sign-in. Never call refresh twice with one token.
- **Never edit an applied migration.** Schema changes get a new revision.
- **Backend serializers are allowlists.** A new requester field must be added deliberately.
- **In Git Bash, set `MSYS_NO_PATHCONV=1`** for container paths.
- **Earlier run reports quote some commit SHAs from before a history rewrite,** so those SHAs no longer exist. Commit subjects still match.
- **Evaluation in mock mode measures the pipeline, not model quality.** The 100% hold rate is on a fixture used to tune the patterns.

## Ideas for v1.1

None of these has been started. Each needs an ADR.

- **Hybrid search with pgvector,** only if the evaluation shows it beats full-text search. Measure first.
- **Real ticketing integration,** with every outbound action behind staff approval.
- **An asynchronous analysis worker,** so slow provider calls do not hold a request open.
- **An analytics dashboard** for staff, showing hold rates and feedback.
- **A held-out evaluation set, and scoring of reply quality.** These are the biggest unknowns, so they may matter most.
