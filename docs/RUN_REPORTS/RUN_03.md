# Autopilot run 03 report

**Result: Chunk 4 is complete in mock mode, and all four checkpoints are committed.** Requesters, support staff and admins can now do everything in the browser. All six E2E scenarios pass at desktop size, the key ones also pass at 375 px, and axe found no violations of any severity. The full suite passed from a clean state. Nothing is deployed or pushed, and no live Gemini call was made. The stack is running in mock mode with freshly reset demo data.

## 1. Repo state found at start

`main` at `3b5e341`, with `docs/prompts/AUTOPILOT_RUN_03.md` untracked. The stack was healthy, `/readyz` returned 200, and the baseline matched the handoff: 671 backend passed with 1 skipped, and 31 frontend passed.

## 2. Completed and verified functionality

**Checkpoint 10: housekeeping, UI foundation, requester journey**
- Your live smoke test is recorded as DONE, owner-verified, in the status doc and ADR-029. I did not observe it myself.
- `AI_REQUEST_TIMEOUT_SECONDS` is 45 in config, `.env.example` and `.env` (only that line changed, file not printed). The backend was recreated, and reported `timeout 45.0`.
- `MockAgent` cites the top-ranked article, plus a second only if it is within 70% of the top rank and in the predicted category. `tests/test_mock_citations.py` proves through the real retriever that both Wi-Fi texts cite only the Wi-Fi article.
- `compose.e2e.yaml` sets high limits, `AI_MODE=mock` and an empty key. Defaults are unchanged: the container reports limits of 5 and 10 afterwards.
- A design system in `src/styles/`, and all the requested components. App shell with role-aware navigation, skip link, landmarks, focus moved on navigation and a live region. Route guards, 403 and 404 pages, and one error-message map.
- Dashboard, new request, request detail with every AI state, feedback, comments, timeline, and restyled knowledge pages.

**Checkpoint 11: staff screens**
- Queue with status, priority, category and assignee filters, sort, pagination, counts, a highlighted "Needs review" filter and assign-to-me.
- Review workspace: AI analysis panel with run history, read-only draft, editable reply, reason, approve and reject through `ConfirmDialog`, inline `UNSAFE_REPLY`, and a reload prompt on conflicts.
- Status controls offer only allowed moves, with a test for each of the 7 statuses. Stale updates keep typed text. A retry after reload uses the new version, and does not undo the other person's change (tested).

**Checkpoint 12: admin screens**
- Knowledge list with filters and search. Editor with auto-slug, safe preview sharing the article page's renderer, version display, publish, unpublish and archive, and a duplicate-slug message on the field.
- Audit log with action and entity filters, actor names and pagination. The UI also drops any metadata key that looks like a reply, body or secret, as a second layer.

**Checkpoint 13: E2E, accessibility, screenshots.** See the sections below.

**Do these tests actually catch failures?** I checked, because the suite passed on its first full run:

| Temporary change, since reverted | Result |
|---|---|
| Backend shows held and rejected text to requesters | Scenarios 2 and 3 failed |
| Muted text color lowered in contrast | axe failed with `color-contrast (serious)` |

I also looked at all nine screenshots by eye.

## E2E scenario results

Final clean-state run: **28 passed, 0 failed, 0 retries** (17 at 1440×900, 11 at 375×812).

| Scenario | 1440 px | 375 px |
|---|---|---|
| 1. Ordinary: auto-analysis, AI label, one citation opens the Wi-Fi article, Helpful, analysis ran exactly once | Pass | Pass |
| 1. Ordinary, using only Tab, Shift+Tab, Enter and Space | Pass | Not run |
| 2. Sensitive: no held text on the page or in Riley's API responses, `UNSAFE_REPLY` shown, edited reply approved, Riley signs in again and sees exactly that reply | Pass | Pass |
| 3. Reject: Riley never sees it, and the response has `suggestion: null` | Pass | Not run |
| 4. Admin knowledge: draft not searchable, published found, unpublished gone, version increments | Pass | Not run |
| 4. Duplicate slug message | Pass | Not run |
| 5. Authorization: 403 at `/support`, 404 for Sam's request, reload signs out, no browser storage | Pass | Pass |
| 5. An agent gets the access page at `/admin/audit` | Pass | Not run |
| 6. Stale update: second save shows the message, text is kept, save works after reload | Pass | Not run |

## Axe results

**38 checks across 19 screens and states, at both viewports: 0 serious or critical, and 0 lesser findings.** Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. There are no accepted exceptions. Each check also asserts no sideways scrolling.

Screens: login; dashboard; new request; new request with errors; knowledge list; knowledge article; request detail with no analysis, analyzing, analysis failed, suggestion available and awaiting review; support queue; review page; review confirmation dialog; knowledge admin; article editor with preview; audit log; 403; 404.

Axe only finds part of what affects accessibility, and I did not test with a real screen reader.

## Screenshots captured

In `assets/screenshots/`, synthetic data only, referenced in the README:

| File | Size |
|---|---|
| `login.png` | 1440×900 |
| `requester-dashboard.png` | 1440×900 |
| `request-suggestion.png` | 1440 wide, full page |
| `awaiting-review.png` | 1440×900 |
| `review-workspace.png` | 1440 wide, full page |
| `knowledge-admin-preview.png` | 1440 wide, full page |
| `audit-log.png` | 1440×900 |
| `mobile-dashboard.png` | 375×812 |
| `mobile-request-suggestion.png` | 375×812 |

`login.png` shows the intentionally public demo password.

## 3. Files and directories created or changed

| Area | Contents |
|---|---|
| `frontend/src/styles/` | New: `tokens`, `base`, `layout`, `components`, `index`. Removed `src/styles.css` |
| `frontend/src/components/` | New: `Button`, `Card`, `Badge`, `Table`, `FormField`, `LoadingState`, `EmptyState`, `ErrorState`, `Banner`, `Timeline`, `Pagination`, `ConfirmDialog`, `SafeMarkdown`, `announcerContext`. Changed `Layout`, `ApiStatus`. Removed `DataState` |
| `frontend/src/api/` | New: `errors`, `requests`, `knowledge`, `admin`. Changed `client`, `useApiData` |
| `frontend/src/auth/` | New: `roles`, `RoleRoute`. Changed `AuthProvider` |
| `frontend/src/pages/` | New: `NewRequest`, `RequestDetail`, `SupportQueue`, `SupportDetail`, `AdminKnowledge`, `AdminArticleEditor`, `AdminAudit`, `Forbidden`. All others changed |
| `frontend/src/requests/`, `support/`, `knowledge/`, `lib/` | New: AI section, analysis hooks, comments, timeline, list params, review panel, workflow controls, article form, labels, format, audit |
| `frontend/src/tests/` | New: `newRequest`, `requestDetail`, `shell`, `support`, `admin`. Others changed |
| `backend/app/` | `services/ai/mock.py`, `ai/base.py`, `ai/orchestrator.py`, `services/requests.py`, `services/knowledge.py`, `routers/requests.py`, `routers/knowledge.py`, `routers/admin.py`, `schemas/requests.py`, `schemas/audit.py`, `core/config.py` |
| `backend/tests/` | New: `test_mock_citations.py`, `test_request_counts.py`, `test_admin_filters.py` |
| `e2e/` | New: `package.json`, lockfile, `Dockerfile`, `.dockerignore`, `playwright.config.js`, `run.mjs`, `tests/` |
| Root | New: `compose.e2e.yaml`, `assets/screenshots/`. Changed: `README.md`, `.env.example` |
| `docs/` | New: this report. Changed: `API.md`, `ARCHITECTURE_DECISIONS.md`, `IMPLEMENTATION_STATUS.md`, `NEXT_AGENT_PROMPT.md`, `PROJECT_CONTEXT.md`, `SECURITY.md`. `prompts/AUTOPILOT_RUN_03.md` is now tracked |
| Untracked | `.env`: only `AI_REQUEST_TIMEOUT_SECONDS=45` changed. It remains git-ignored |

No database migration was needed. Outside the project folder, only Docker's images and volumes for this project and session scratch files changed.

## 4. Commands run, exit codes and test counts

Clean-state run, with each exit code read directly from the command:

| Command | Exit | Result |
|---|---|---|
| `docker compose down -v` | 0 | Removed |
| `docker compose up --build -d --wait` | 0 | Healthy |
| `GET /readyz` before migrating | | 503, as intended |
| `docker compose exec -T backend alembic upgrade head` | 0 | Applied through `0004` |
| `docker compose exec -T backend alembic check` | 0 | `No new upgrade operations detected.` |
| `docker compose exec -T backend python -m app.scripts.seed_demo` (twice) | 0, 0 | `Seed complete: 4 users, 13 articles, 9 requests.` both times |
| `GET /readyz` after | | 200 |
| `docker compose exec -T backend pytest -q` | 0 | **694 passed, 1 skipped** |
| `docker compose exec -T backend ruff check .` | 0 | `All checks passed!` |
| `docker compose exec -T backend ruff format --check .` | 0 | `86 files already formatted` |
| `docker compose exec -T frontend npm run lint` | 0 | Clean |
| `docker compose exec -T frontend npm test -- --run` | 0 | **195 passed** |
| `docker compose exec -T frontend npm run build` | 0 | Built |
| `npm --prefix e2e run e2e` | 0 | **28 passed; 5 screenshot captures passed** |

After that run I removed one pointless test from `dashboard.test.jsx`, and re-ran lint (exit 0) and the frontend tests (exit 0, **194 passed**). This report's commit adds only docs on top of that.

Final state: `AI_MODE=mock`, timeout 45, login limit 5, analyze limit 10, key `set`, `/readyz` and the frontend both 200.

Key check, printing counts only (key length 53): 0 tracked files and 0 commits in history contain it. The backend log also had 0 matches, but that log covers only the container since its last recreation. Requests to Gemini in that log: 0.

## 5. Unverified or blocked

Nothing is blocked. Not verified:

- **The whole app in `AI_MODE=gemini`.** Only the adapter's smoke test has passed, and you ran that. No live call was made in this run, as instructed.
- **A real backend analysis failure in the browser.** `MockAgent` never fails, so the analyzing and failed screens use a browser-side stub of the response. Backend failures are covered by pytest, and the UI's handling by component tests and this stub.
- **Browsers other than Chromium, and real screen readers.**
- **A production build in the browser.** E2E runs against the Vite dev server. `npm run build` passes, but nothing has browsed the result.
- **Host-side frontend checks, and a fresh `git clone` build.** The clean-state run used the working tree.
- **Scenarios 3, 4 and 6, and the keyboard test, at 375 px.** The brief asked for "key scenarios" there.

## 6. Deviations from the blueprint and prompt

| ADR or item | Deviation |
|---|---|
| ADR-033 | **Added API surface you did not ask for:** `GET /requests/counts`, `mine=true`, `q` on admin knowledge, and `action`, `entity_type` and `actor_name` on audit. The prompt allowed client-side audit filtering of the current page, but that silently misses matches on other pages. Without `mine`, "My requests" would list every request for staff |
| Status controls | **Stricter than the state machine:** while a draft is pending review, no status moves are offered. The API allows them, but moving away would leave the draft impossible to review. This narrows "offer what the state machine allows" |
| AI section | A rejected suggestion or a request with no suggestion shows no AI section, so "exactly one state" has a fifth outcome of nothing. This follows the API's "no trace" rule |
| AI label | The screen uses the prompt's wording, with a dash. The API's `label` field, with a semicolon, is not displayed |
| ADR-036 | Staff always use the staff screen, so they cannot rate a suggestion on their own request in the UI |
| ADR-037 | Failed and analyzing states in E2E are stubbed in the browser, with no `MOCK_AI_FAILURE_MODE` |
| Sorting | A sort control rather than clickable table headers, because headers are hidden in the stacked mobile layout |
| Mobile E2E titles | Mobile reruns append `[mobile]` to scenario titles, so the queue has one matching link. Desktop uses the exact wording |
| Docs | The handoff said the live test was BLOCKED. This prompt overrides that |

## 7. Known bugs and limitations

No known bugs. Problems found and fixed during the run:

- Status messages were announced twice, once by the live region and once by their own visible status element. Each now has one source.
- My keyboard test first moved focus with `.focus()`, which is not keyboard use. It now uses Shift+Tab.
- A filler test that checked nothing useful was removed.

Limitations worth knowing:

- **Pages do not refresh themselves.** A requester waiting on review must navigate away and back, or reload and sign in again.
- **After a failed analysis, reloading shows the plain Analyze button.** The attempts remaining appear only after the next try.
- **Assignment is to yourself only,** and the queue says "Another team member" rather than a name.
- **Pressing Search again with the same query does not fetch again.**
- **Audit details show raw identifiers and enum values.**
- **Mock replies are generic,** and the rationale can read "1 articles".
- **In the screenshots, bold text looks light,** because of the fonts in the Playwright image. This is about the pictures, and I did not check how it looks in your browser.

The full list is in `docs/IMPLEMENTATION_STATUS.md`.

## 8. Commits

Run `git log --oneline` for the final list.

```text
afd93fd test: phase 8 playwright e2e, accessibility checks and screenshots
4dfd5a0 feat: phase 8 knowledge admin and audit viewer
bdf4431 feat: phase 8 staff queue and review workspace
7987927 feat: phase 7 design system and complete requester journey
```

The final commit, `docs: autopilot run 03 report and handoff`, adds this report and the handoff, plus removal of the filler test.

## 9. Owner actions needed

None are required. Docker Desktop must stay running. Optional:

1. **Review ADR-033 and the status-control restriction,** because they go beyond or narrow what the prompt asked for.
2. **Try live mode when convenient** (steps in the README), since the whole app has not run that way. Use synthetic text only.

## 10. How to try it now

| What | URL |
|---|---|
| App | http://localhost:5173 |

Choose an account from the "Demo account" list. The password, `demo-only-public-2026`, is shown on the page. Reloading signs you out, so use the links in the app. To sign in as someone else, use **Sign out**, or a private window to stay signed in as both.

### What the owner should click through

**As Riley, an ordinary problem:**

1. Sign in as Riley Morgan. You land on **My requests**, with counts by status.
2. Choose **New request**. Enter the title `The campus Wi-Fi connects but I cannot open websites` and a description such as `My laptop shows connected, but every website times out.` Watch the character counts, then choose **Submit request**.
3. The request opens and analyzes by itself. You should see "AI-generated suggestion — verify before acting", with one source: the Wi-Fi article.
4. Open that source, go back, then choose **Helpful**. The buttons disable and it says thank you.

**As Riley, a sensitive problem:**

5. Create another request with the title and description `I think someone accessed my account and I need admin credentials`.
6. You should see "Awaiting staff review", with no suggested text anywhere.

**As Alex, the review:**

7. Sign out and sign in as Alex Chen. You land on the **Support queue**. Choose **Needs review**, and open Riley's request.
8. Look over the AI analysis: confidence, risk flags, citations and run history.
9. In **Reply to publish**, enter `Please send us your password.`, add a review reason, then choose **Approve** and confirm. It is refused, with the explanation on the field.
10. Replace it with `Our support team will contact you through a verified channel. Please do not share your password with anyone.`, then approve and confirm.
11. Try a priority change with a reason, and an **Internal** comment, marked "Internal — not visible to requester".

**As Riley again:**

12. Sign in as Riley, and open the request. You see exactly Alex's reply, and not the internal comment.

**As Jordan, the admin:**

13. Sign in as Jordan Reyes, and open **Knowledge admin**, then **New article**. Type a title and watch the slug fill in. Put `<script>alert(1)</script>` in the body, and see it stay as harmless text in the preview.
14. Choose **Create draft**, then **Publish**. In **Knowledge**, search for a word from your article. Back in the editor, choose **Unpublish**, and search again: it has gone.
15. Open **Audit** to see the trail: Alex's approval and reason appear, but never the reply text.

**Edge cases:**

16. As Riley, type `/support` into the address bar and sign in again: you get "You don't have access".
17. In two windows, open the same request as Alex and as Jordan, and change the priority in both. The second save says "Someone else changed this request", and your typed reason stays after **Reload**.
18. Narrow your browser to phone width: tables become stacked cards.

To restore the original data:

```powershell
docker compose exec backend python -m app.scripts.reset_demo --yes
```

## 11. Recommended next chunk

**Chunk 5: Phase 9 plus CI.** That covers a 30-case evaluation fixture and `docs/EVALUATION.md`, a mock regression test and an optional capped live sample that you run, a review of performance, timeouts and logs, pinned base images, a non-superuser database role, hiding the password hint outside demo mode, and a GitHub Actions workflow. The ready-to-use prompt is in `docs/NEXT_AGENT_PROMPT.md`.
