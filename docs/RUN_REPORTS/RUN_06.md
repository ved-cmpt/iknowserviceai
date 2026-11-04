# Autopilot run 06 report

**Result: the demo is verified live at https://iknowserviceai.onrender.com, and `v1.0.0` is tagged and pushed.** The repository stays private until you change it.

**Things you may want to know first:**

- **Live testing found a real bug.** `TRUSTED_PROXY_HOPS=1` was wrong, so the sign-in limiter was unreliable on the live site. It is fixed, with `3`, from a measurement (ADR-061).
- **One check could not be done:** a second visitor on another network. Only one network was available. The steps are in section 5.
- **I went over the request budget.** About 800 requests in total, against "a few hundred". Section 6 explains why.
- **The README differs from the prompt on one point.** The video shows the mock agent, not live Gemini, so the README points only to the evaluation for live results.

## 1. Repo state found at start

`main` at `65b592b`, clean. The site was already answering, with `/readyz` at head. The local dev stack was running.

## 2. Completed and verified functionality

| Checkpoint | What changed |
|---|---|
| 26 Live verification | `e2e/verify-live.mjs`, `npm --prefix e2e run e2e:live`, and the proxy fix |
| 27 Live docs | README live demo section and status badge, `CHANGELOG.md`, deployment results, runbook, security, status, private portfolio notes |
| 28 Release | Audit, `docs/RELEASE_NOTES_v1.0.0.md`, annotated tag `v1.0.0` on `86e2390` |
| Wrap-up | Demo data reset, maintenance handoff, this report |

## Live verification results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `/healthz`, `/readyz`, config flags, JSON 404, no API docs, SPA deep link | **Pass** | `/docs` and `/redoc` serve the app with no API docs. `/openapi.json` is 404. Config has no `AI_MODE` field, and states the mock agent in `ai_notice` |
| 2 | CSP, nosniff, referrer, frame-ancestors, X-Frame-Options, permissions, HSTS | **Pass** | On pages and API responses. HSTS is `max-age=31536000; includeSubDomains`. TLS 1.3 |
| 2 | HTTP to HTTPS | **Pass** | 301, from Cloudflare at the edge |
| 3 | Cookie attributes | **Pass** | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth` |
| 3 | Rotation, reuse detection, sign-out | **Pass** | A replay gets 401 and revokes the sign-in. Sign-out revokes the refresh token. The access token still works afterwards, as ADR-058 documents |
| 4 | Limiter: 429 with `Retry-After`, then lifts | **Failed, fixed, pass** | See below |
| 4 | Another email or route is unaffected | **Pass** | |
| 4 | Forged headers do not bypass it | **Failed, fixed, pass** | Single, chained, repeated and rotating values, each on new and reused connections |
| 4 | A second network is not limited | **Unverified** | Only one network, and no IPv6. The measured header shape supports it |
| 5 | Browser subset, 1440 px | **Pass** | 21 passed, 1 skipped because it is for narrow screens. 349 requests |
| 5 | Browser subset, 375 px | **Pass, narrowed** | 7 passed. 119 requests |
| 5 | axe, both themes | **Pass** | 72 checks, 0 findings |
| 6 | Data after a redeploy | **Pass** | The `[verification]` request survived. So did the session |
| 7 | Cold start | **Pass** | See below |
| 8 | Daily reset | **Pass, stronger than asked** | Backdated as the owner, as the handoff's checklist says. One ordinary request reseeded through `app_user` |
| 9 | Errors hold no internals | **Pass** | 9 cases, all under 500, with no stack traces or internal details. **Render's logs themselves are unverified,** because I cannot read them |

### The proxy bug

Seven wrong passwords in a row on one invented email often all returned 401, even with no forged header. Render serves through Cloudflare, which ADR-052's reasoning did not know. A temporary admin-only route showed the header's shape as salted hashes, never addresses:

```text
X-Forwarded-For: [anything the client forged...], real client, Cloudflare edge, Render internal
```

One hop read Render's internal address, which rotates and is shared by every visitor. So the limits were unreliable, and the refresh limit of 60 a minute could be shared between visitors. Three hops read the real client, and forged values stay to its left. The route was live for a few minutes, and is gone from the code, but remains in git history at `4eed561`.

**After the fix, the first check still failed 5 limiter checks,** then a run minutes later passed 54 of 54, and it has passed since. A single 502 appeared between the two. This fits Render applying the code and then the setting in two restarts, but **that explanation is inferred.** I could not see Render's events.

## Measured cold start

**One sample,** after 19 idle minutes:

| Request | Time |
|---|---|
| First `/healthz` | **32.2 s to first byte** |
| Second `/healthz` | 0.14 s |
| First `/readyz`, the first database use | 0.71 s |
| Second `/readyz` | 0.14 s |
| Sign-in straight after | 1.7 s |

So Neon's wake-up was about 0.6 s, if the difference is all wake-up. I cannot rule out another visitor having woken either service earlier, but a 32 s wait suggests Render, at least, was asleep. The README keeps "about a minute", as you asked, and because Render documents that figure.

## Release audit results

| Check | Result |
|---|---|
| gitleaks, full history | 0 findings |
| gitleaks, tree at `HEAD` | 4, the reviewed fake test values |
| Real secret values, files and history | 0 for each: Neon passwords and hosts, JWT secrets, Gemini key |
| Tool or vendor names, tree and commit messages | 0, apart from the CSS `cursor` property, which `RUN_05.md` also mentions. `AGENTS.md`'s rule against attribution trailers names the trailer. "Gemini" remains as the product's provider |
| `.env*` other than examples, `.backup/`, `.portfolio/`, `.cache/`, local prompts | Never tracked in current history |
| Commit identity | One: your name and email |
| Personal data in files | Your name in `LICENSE` and `RUN_05.md`. The path `C:\Users\User\Desktop\...` in `docs/PROJECT_CONTEXT.md` and `RUN_01.md`, which holds only the generic user name, and I left it |
| 16 screenshots, 6 video frames | Viewed each. Synthetic data, and the public password only. No browser tabs, bookmarks or OS details |
| Video metadata | Encoder fields only |
| Local links | lychee: 63 OK, 0 errors, 12 excluded |
| README images and files | All tracked. The live link gives 200 |
| CI on the tagged commit, run 41933225104 | Success |
| Commits from before the earlier history rewrite | GitHub's API gives 422 for all 16, by full SHA. A control on the current `HEAD` succeeded. See below |

**About those old commits.** The old cleanup report warned that they were still reachable on GitHub, which would matter once the repository is public. They are not served through the API now. I cannot test the web pages or caches of a private repository. I also scanned the local backup of that history. It holds 0 of the real secrets, and its one gitleaks finding and other matches are fake test values and placeholders, all in the current history too. It does hold attribution trailers and the local prompt files. **So the worst case, if GitHub still kept them somewhere, is attribution, not credentials.** If you want certainty, GitHub Support can purge them.

## 3. Files and directories created or changed

| Area | Contents |
|---|---|
| Root | New: `CHANGELOG.md`. Changed: `README.md`, `render.yaml` |
| `e2e/` | New: `verify-live.mjs`, `run-live.mjs`, `tests/fixtures.js`. Changed: config, helpers, 3 specs, `package.json` |
| `backend/` | `tests/test_sessions.py` gains 2 cases. `app/main.py` and a diagnostic route were added, then restored and removed |
| `docs/` | New: `RELEASE_NOTES_v1.0.0.md`, this report. Rewritten: the handoff. Changed: ADR-052, new ADR-061, deployment, runbook, security, status. **Removed:** `RUN_REPORTS/CLEANUP.md`, which was stale and confusing. It remains in history |

**Not tracked:** `.portfolio/PORTFOLIO_NOTES.md` now says deployed, and gains story 6, about the proxy bug.

**Outside the project folder:** one `curl` output briefly went to a temporary file in `/tmp`, and was deleted. The Docker image `iknowserviceai-live-e2e` was built and removed. Neon's demo data was reset. `demo_state.last_reset_at` was backdated twice, on purpose, for the two resets.

## 4. Commands run, exit codes and test counts

| Command | Result |
|---|---|
| `node e2e/verify-live.mjs`, first | **1:** 52 passed, 2 failed. The bug |
| The same, during the rollout | **1:** 49 passed, 5 failed |
| The same, after it settled | **0:** 54 passed |
| `node e2e/verify-live.mjs persist-create`, then `persist-check` | 0, 0 |
| `node e2e/run-live.mjs desktop` | 0: 21 passed, 1 skipped |
| `node e2e/run-live.mjs mobile`, narrowed | 0: 7 passed |
| `pytest tests/test_sessions.py -k client_ip`, ruff, format | 0: 8 passed, clean |
| Pre-push scan, before every push | 0 |
| lychee, offline | 0 |
| `git push`, tag push | 0 |

**GitHub CI, run 41933225104, on the tagged commit `86e2390`: success.**

| Job | Result |
|---|---|
| `backend` | 876 passed, 1 skipped |
| `frontend` | 242 passed |
| `e2e`, dev stack | 34 passed |
| `e2e`, production image | 46 passed |
| axe | 172 checks, 0 findings |
| `docker`, `secret-scan` | Success |

**Live provider calls: 0.**

## 5. Unverified or blocked

- **The limiter from a second network.** While `node e2e/verify-live.mjs` runs, try the site from a phone on mobile data. You should not be limited. This takes a minute.
- **The two-restart explanation** above is inferred.
- **Render's logs.** Only the response bodies were checked.
- **Tests left out of the live run:** the keyboard journey, stale update, staff self-refresh, the Refresh button, duplicate slug and wide layout. Mobile also left out 12 tests. All of them pass in CI, against a local database.
- **Local fresh-clone walkthrough, and `e2e-smoke` on GitHub.** Carried over from Run 05.
- **Browsers other than Chromium, and real screen readers.**

## 6. Deviations from the prompt

| Item | Deviation |
|---|---|
| Request budget | **About 800, against "a few hundred".** This is an estimate: 468 counted from the browser suites, the rest worked out from the scripts. Diagnosing the bug cost about 200 of them. I narrowed the mobile run when I saw the total, and did not go lower, because you asked for 375 px coverage |
| README | Says live results are in the evaluation, not in the video, because the video shows the mock agent |
| Suite against the live site | A subset, as you allowed. No assertion was changed in meaning: the slug check follows the label, and the cookie check uses the base URL rather than a fixed host |
| Temporary code | A diagnostic route went to production and into history. The fix needed evidence that I had no other way to get |
| Extra commits | `4eed561` and `a67a7bf`, beyond the named ones |
| Removed file | `docs/RUN_REPORTS/CLEANUP.md`, under "remove stale or confusing files". Earlier reports quote SHAs that only it could translate |
| Daily reset | Actually run, by backdating, following the handoff rather than just reading metadata |
| Final reset | Through the daily reset path, not `reset_demo` |
| Tag | On the Checkpoint 28 commit, as you wrote, so this report comes after it |

## 7. Known bugs and limitations

No known bugs. The full list of limitations is in `docs/IMPLEMENTATION_STATUS.md`. New: the limiter depends on a proxy chain that Render or Cloudflare could change, and it would then degrade silently, so `verify-live.mjs` should be rerun after hosting changes. With `FORWARDED_ALLOW_IPS=*`, `request.client` holds a value a client can forge. Nothing relies on it behind this chain.

**Slips of mine, all caught before they mattered:** my first pre-push scan printed "CLEAN" although its tree scan had failed to run, and then scanned an empty folder. I noticed before pushing, and made it fail on both. My first check of old commits used short SHAs, which proved little, so I repeated it with full ones.

## 8. Commits

```text
86e2390 chore: v1.0.0 release readiness            (tag v1.0.0)
dd9d914 docs: live demo link, deployment results and changelog
699204a test: live deployment verification on render and neon
a67a7bf fix: trust three proxy hops on render, so the rate limiter sees the visitor
4eed561 chore: temporary proxy header diagnostic, and a repeatable live http check
```

Then this report: `docs: autopilot run 06 report and handoff`.

## 9. Owner actions needed

Besides the final steps below:

- **Try the site from a phone,** as in section 5.
- **Dependabot PRs #1 to #4 already show as closed** on GitHub, so step 1 below may need nothing.
- **Portfolio notes:** read story 6, and answer the last question, which only you can.

## Owner final steps

1. Close Dependabot PRs #1–#4 (each PR → "Close pull request").
2. Make the repo public: GitHub → Settings → General → Danger Zone → Change visibility → Public.
3. Create the GitHub Release from tag `v1.0.0`, pasting `docs/RELEASE_NOTES_v1.0.0.md`.
4. Add repo topics and the live URL in the repo's About box. Suggested topics: `ai`, `human-in-the-loop`, `service-desk`, `fastapi`, `react`, `postgresql`, `docker`, `playwright`, `prompt-injection`, `portfolio-project`.
5. Delete the local `.backup/` folder once satisfied.

## 10. How to try it now

Open https://iknowserviceai.onrender.com, and pick a demo account. If it has been idle, the first load takes a while. [The 3-minute demo script](../DEMO.md) says what to click. The data is freshly reset, and the local dev stack is as it was.

## 11. Recommended next chunk

Nothing is required. If you continue, a held-out evaluation set and scoring of reply quality would answer the biggest open questions. Other ideas are in `docs/NEXT_AGENT_PROMPT.md`.
