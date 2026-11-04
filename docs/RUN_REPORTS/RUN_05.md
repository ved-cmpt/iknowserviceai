# Autopilot run 05 report

**Result: Checkpoints 18 to 24 are complete and pushed. Checkpoint 25 is partly done:** the system stopped my local clean-state run because the machine ran out of memory, and I did not restart it, as the notice instructed. **GitHub's CI then ran all the same suites from a clean checkout on that code, and they passed.** Commits after that run change docs only.

**Nothing is live yet.** The Neon database is ready, and Render is yours to apply: the steps are below.

**Things you may want to know first:**

- **Neon runs PostgreSQL 18,** where the prompt expected 17, and development and CI use 17. The backend suite also passed on a throwaway 18 (ADR-054).
- **The local fresh-clone walkthrough did not run.** Details are in section 5, with the commands.
- **The first live reply exposed a raw article ID to the requester.** It is fixed in code, but the fix has not been seen against a live reply.

## 1. Repo state found at start

`main` at `07cbf46`, clean. Baseline passed: 837 backend passed with 1 skipped, 231 frontend passed, build OK. `NEON_OWNER_DATABASE_URL` was in `.env`.

## 2. Completed and verified functionality

| Checkpoint | What changed |
|---|---|
| 18 Demo safeguards | Daily self-reset through a narrow `SECURITY DEFINER` function with an advisory lock, volume caps and a banner (ADR-051) |
| 19 Render and Neon settings | `render.yaml`, which validates against Render's published schema. Small pool with pre-ping and recycle, `/readyz` that retries once and says what is wrong, Dependabot limits (ADR-052, ADR-053) |
| 20 Neon | Provisioned by `deploy/neon/provision.py`, with `docs/DEPLOYMENT.md` |
| 21 Redesign | Brand, IBM Plex, two themes, two-column staff workspace (ADR-056) |
| 24 Polish | Staff page refreshes itself (ADR-059), 10 minute access tokens (ADR-058), browser subset on pull requests (ADR-057), live check through HTTP, article IDs replaced in replies (ADR-060) |
| 22 Pictures | Screenshots and a recorded video, from the production image |
| 23 Docs | README, `ARCHITECTURE`, `DEMO`, `RUNBOOK`, MIT license, private portfolio notes |
| 25 Final pass | **Partial.** See sections 4 and 5 |

I did 24 before 22 and 23, which the prompt's priority order allows, so the pictures show the final behavior.

## Neon provisioning results

| Check | Result |
|---|---|
| Connection | Host suffix `…us-west-2.aws.neon.tech`, database `neondb`, role `neondb_owner`, **server 18** |
| `app_user` | Created. Not a superuser, no createdb, createrole or bypassrls, no inherited rights, not in `neon_superuser`, owns no tables |
| Migrations | At `0007`, `alembic check` clean, grants applied |
| Seed, run twice | 4 users, 13 articles, 9 requests, both times |
| As `app_user`, refused | 11 of 11: changing history, truncating, DDL, changing `alembic_version` or `demo_state` |
| As `app_user`, allowed | Reading, adding history, updating requests: pass |
| Demo reset as `app_user` | Runs when due: pass. Skips when not due: pass. Removes added rows and reseeds: pass |
| Production image on Neon | `/readyz` 200 `at_head`, banner present. Browser suite: **43 passed, 1 skipped by design, exit 0.** This ran before the redesign |
| Final state, after a final reset | 4 users, 13 articles, 9 requests, 0 audit rows, 0 AI runs, at revision 0007, daily reset enabled: True |
| Secrets | `.env.render` written and git-ignored. `channel_binding=require` kept, because the driver accepts it |

## Redesign summary

Before: `git show 07cbf46:assets/screenshots/<name>`. After: `assets/screenshots/<name>`, same names for `login.png`, `requester-dashboard.png`, `request-suggestion.png`, `awaiting-review.png`, `review-workspace.png`, `knowledge-admin-preview.png`, `audit-log.png`, `mobile-dashboard.png` and `mobile-request-suggestion.png`. New: `support-queue.png`, `reviewed-reply.png`, `knowledge-article.png`, `mobile-login.png`, `mobile-review-workspace.png`, `review-workspace-dark.png`, `request-suggestion-dark.png`.

I looked at every main screen in both themes, and fixed wrapped buttons and dates, mismatched padding, inconsistent back links and tall mobile stat cards.

## Demo video

| File | Details |
|---|---|
| `assets/demo/iknowserviceai-demo.mp4` | 85.8 s, H.264, 1280×720, 1.1 MB, silent, with captions |
| `assets/demo/iknowserviceai-demo.gif` | Preview at twice the speed, 3.1 MB |

Re-run with `npm --prefix e2e run demo:record`.

## Live calls used: at most 3 of 3

Two requests through the real HTTP endpoints, locally. The backend's logs do not show provider requests, so **I cannot prove the first used only 1 call** rather than 2. So I ran the second with the adapter's retry off, which keeps the total at 3 or fewer whichever it was. `AI_MODE=mock` is restored, and the container was recreated.

| Request | Result |
|---|---|
| Ordinary | 200 in 7.6 s, `TRIAGED`, confidence 0.95, 1 valid citation, shown as an AI suggestion |
| Sensitive | 200 in 3.6 s, `NEEDS_HUMAN_REVIEW`, 4 risk flags, 2 valid citations. The requester's response held no draft |

Quality, from reading both: accurate but thin. The ordinary reply gave 2 of 5 checks and missed a clue pointing to an outage. The sensitive draft was cautious and sensible. Details are in `docs/EVALUATION.md`.

## 3. Files and directories created or changed

| Area | Contents |
|---|---|
| Root | New: `render.yaml`, `LICENSE`. Rewritten: `README.md` |
| `deploy/` | New: `neon/provision.py`, `sql/enable_demo_reset.sql`. Changed: `Dockerfile`, `sql/grant_app_role.sql` |
| `backend/` | New: `alembic/versions/0007_demo_state.py`, `app/db/models/demo.py`, `app/services/demo.py`, `tests/test_demo_safeguards.py`. Changed: config, middleware, session, health, readiness, config router, requests, knowledge, orchestrator, reset script, tests |
| `frontend/` | New: `public/favicon.svg`, `public/theme-init.js`, `components/icons/`, `Avatar`, `DemoBanner`, `Meter`, `ThemeToggle`, `requests/StatCards`, `requests/RunHistory`, `lib/theme.js`. Rewritten: all styles. Changed: most pages, tests |
| `e2e/` | New: `tests/demo.spec.js`, `record-demo.mjs`, `optimize-screenshots.mjs`. Changed: helpers, specs, config, `run.mjs` |
| `docs/` | New: `ARCHITECTURE.md`, `DEMO.md`, `DEPLOYMENT.md`, `RUNBOOK.md`, this report. ADR-051 to ADR-060. Changed: `API`, `EVALUATION`, `SECURITY`, status, handoff |
| `.github/` | `ci.yml` gains `e2e-smoke`, `dependabot.yml` holds majors and base-image versions |
| `assets/` | Regenerated screenshots, new `demo/` |

**Not tracked:** `.env` gained `NEON_APP_DATABASE_URL`. New: `.env.render`, `.portfolio/PORTFOLIO_NOTES.md`. `.git/info/exclude` gained `/.portfolio/`. Your local `.env` still has `ACCESS_TOKEN_MINUTES=30`, which overrides the new default in development only.

**Outside the project folder:** Docker now holds `postgres:18-alpine`, `jrottenberg/ffmpeg`, `minlag/mermaid-cli` and `lycheeverse/lychee`. A temporary PostgreSQL 18 container and network were removed. On Neon, a probe role was created and dropped while diagnosing a role creation error.

## 4. Commands run, exit codes and test counts

**GitHub CI, run 41914247955, on `5d84409`, from a clean checkout: success.** This is the first time the workflow has been confirmed on GitHub. Later commits change docs only.

| Job | Result |
|---|---|
| `backend` | **874 passed, 1 skipped,** ruff, format, `alembic check` |
| `frontend` | **242 passed,** lint, build |
| `e2e`, dev stack | **34 passed, 13 skipped by design** |
| `e2e`, production image | **46 passed, 1 skipped by design** |
| axe | **172 checks in the log, 0 findings,** in both themes, at 1440 and 375 px |
| `docker`, `secret-scan` | Success |

**Local, stopped final run:**

| Step | Result |
|---|---|
| `docker compose down -v`, `up --build` | 0, 0 |
| `/readyz` before migrating | 503, `behind_head` |
| `alembic upgrade head`, `alembic check` | 0, 0 |
| `seed_demo`, twice | 0, 0: 4 users, 13 articles, 9 requests |
| `/readyz` after | 200 |
| `pytest` onwards | **Stopped by the system, for low memory: 0.5 GB of 15.8 GB free** |

**Local, earlier in the run:**

| Check | Result |
|---|---|
| Backend suite on PostgreSQL 18 | 873 passed, 1 skipped |
| Dev browser suite, redesign | 33 passed, 11 skipped, 78 axe checks with 0 findings |
| Production browser suite, redesign | 45 passed, 1 skipped, 94 axe checks with 0 findings |
| `e2e:smoke` | 6 passed |
| `actionlint` | 0 |
| lychee, offline | 0 errors |
| Mermaid CLI | All 7 diagrams render |
| Secret counts, every push | 0 for Neon endpoint, owner and `app_user` passwords, JWT secrets and Gemini key, in history and files |
| gitleaks, every push | History 0. Files: the same 4 reviewed fake values in tests |
| Tool or vendor names, `git grep -i` | 0, apart from the CSS `cursor` property. "Gemini" remains, as the product's provider |

## 5. Unverified or blocked

- **Local Checkpoint 25 suites.** Not rerun locally. CI covers them, as above.
- **Fresh-clone simulation, not done.** CI's checkout, with `.env` made from `.env.example` by the bash command, is close. Of the PowerShell quickstart, only the secret step was tested. To do it yourself when memory allows, close other apps, export `HEAD`, and follow the README.
- **Production image on Neon after the redesign.** It last ran before Checkpoint 21. Run 06 covers this on the live site.
- **`e2e-smoke` on GitHub.** It has only run locally, because no pull request has triggered it.
- **Everything on Render,** including `TRUSTED_PROXY_HOPS=1`, HSTS and cold starts. Run 06.
- **The article ID fix against a live reply,** and reply quality in general.
- **Browsers other than Chromium, and real screen readers.**

## 6. Deviations from the prompt

| Item | Deviation |
|---|---|
| ADR-054 | Neon is on PostgreSQL 18, and I continued rather than stopping |
| ADR-052 | `FORWARDED_ALLOW_IPS=*` is set in `render.yaml`, not the image's command line, because `*` in the image would let clients forge their address when run without a proxy. The effect on Render is the same |
| ADR-053 | `autoDeploy: true` as asked, although Render now prefers `autoDeployTrigger` |
| ADR-051 | A second switch in the database, so `DEMO_MODE` alone cannot wipe a database. A 1 hour floor in the function |
| `render.yaml` | `DEMO_PASSWORD` is inline, which the prompt did not list. The reset needs it |
| Dependabot | Base images are also held by version range, because Python 3.12 to 3.15 counts as a minor bump, which is what PR #1 and #2 are |
| ADR-056 | The demo account selector became cards, and one test changed with it. Axe got stricter |
| Screenshots | Now only from the production image, so the dev E2E run no longer overwrites them |
| Order | 24 before 22 and 23 |
| ADR-060 | A code change the prompt did not list, from the live check |
| Checkpoint 25 | Partial, as above |
| Commit title | Marked as partial |

## 7. Known bugs and limitations

No known bugs. Problems found and fixed in this run: the raw article ID, an E2E failure from stale `node_modules` in a Docker volume, and a backslash in a title that could have broken the ID replacement.

**A slip of mine:** a command chain continued past a lint failure, so commit `9693eb9` went out with one long line. A later commit fixed it. CI's run on that commit was cancelled by a newer push, and the final CI run is clean.

The limitations list is in `docs/IMPLEMENTATION_STATUS.md`. The main ones remain: pattern scanning can be evaded, and replies that pass are shown unreviewed.

## 8. Commits

```text
0b76e69 chore: final quality pass before public launch (partial, see run 05 report)
5d84409 docs: recruiter-ready README, architecture, demo guide, runbook and licence
0e828fe docs: regenerated screenshots and recorded demo walkthrough
9693eb9 fix: staff page refresh, shorter access tokens, pr e2e subset, live http verification
86ca0ff feat: visual redesign — brand, typography, dark theme, two-column staff workspace
495c26d docs: deployment guide and neon provisioning procedure
1baa68c feat: render blueprint, neon-ready connection settings, dependabot majors ignored
6de1897 feat: public demo safeguards — daily auto-reset, volume caps, demo banner
```

Then this report: `docs: autopilot run 05 report and handoff`. Run `git log --oneline`.

## 9. Owner actions needed

### What the owner must do in Render

1. Go to https://render.com and choose **Get Started**. Sign up with **GitHub**. No card should be needed.
2. Choose **New**, then **Blueprint**.
3. Grant Render access to the `ved-cmpt/iknowserviceai` repository, and select it.
4. Confirm it shows the **free** plan and **Oregon**, and apply it. If it asks for `DATABASE_URL`, `JWT_SECRET` and `GEMINI_API_KEY` at this point, use the values from `.env.render`, leaving the key empty.
5. Open the service's **Environment** page, choose **Add from .env**, and paste the whole contents of your local `.env.render` file. **Do not commit or share that file.**
6. Save, and let it deploy. Wait for **Live**.
7. Copy the URL, and give it to Run 06. If it is not `https://iknowserviceai.onrender.com`, tell Run 06, so it can update `CORS_ALLOWED_ORIGINS`.

### Also

- **Close Dependabot PRs #1 to #4** by hand. They are major-style base image bumps that the new configuration holds back.
- **License:** MIT, copyright Vedsai Vangapandu, 2026. You can change it.
- **Portfolio notes:** read `.portfolio/PORTFOLIO_NOTES.md`, which is not tracked. It still says "deploying". The last question there is one only you can answer.
- **After Run 06:** make the repository public, and tag `v1.0.0`.
- **Optional:** Neon on 17, to match CI, means a new Neon project and rerunning `deploy/neon/provision.py`.
- **Memory:** the Docker stack, browser builds and whatever else is open reached 15.3 GB of 15.8 GB here. Close other apps before running the full suites together.

## 10. How to try it now

The local stack is running in mock mode, with fresh data, at http://localhost:5173. Choose a demo account card on the sign-in page. Run 04's click-through still applies, and [the 3-minute demo script](../DEMO.md) is the short version. Use the moon button for the dark theme. The public banner shows only with `DEMO_MODE=true`, so it does not appear on this development stack.

## 11. Recommended next chunk

**Run 06: verify the live Render deployment,** once you have the URL. The prompt is in `docs/NEXT_AGENT_PROMPT.md`.
