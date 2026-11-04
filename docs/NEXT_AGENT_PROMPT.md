# Agent handoff

Last updated: 2026-11-04
**Run 03 progress:** Checkpoint 10 (Phase 7) is committed. Next are checkpoints 11 to 13 in `docs/prompts/AUTOPILOT_RUN_03.md`, which overrides this file where they conflict. Live Gemini passed the owner's smoke test.
Current phase and exact objective: Chunk 4, Phases 7 and 8: the complete requester, staff and admin frontend, plus Playwright E2E in mock mode.
Repo branch and last verified commit: `main`; run `git log --oneline`. Phases 0 to 6 passed a clean-state verification in mock mode.
Implemented and verified: see `docs/IMPLEMENTATION_STATUS.md` and `docs/RUN_REPORTS/RUN_02.md`.
Environment/service state: compose stack running, migrated at `0004`, freshly reset demo data. `AI_MODE=mock`.
Known bugs / incomplete tests: the live Gemini smoke test failed with `AI_TIMEOUT` and is BLOCKED. Chunk 4 does not depend on it, and must not call Gemini.
Decisions and assumptions made: ADR-000 to ADR-031.
What the next agent must read: `AGENTS.md`, the status doc, the ADR log (especially ADR-009, 014, 018, 026, 028, 030 and 031), `docs/API.md`, `docs/SECURITY.md`, and blueprint sections 3, 8, 10 (Phases 7 and 8) and 11.
Next 3 concrete actions: build the new request form and request detail with analysis states; build the staff queue and review screen; add Playwright with the five required journeys.
Owner-only actions needed: none for Chunk 4. Re-running the live smoke test is optional.

## API shapes the UI must use

The base URL is `VITE_API_BASE_URL`. `docs/API.md` is the full reference. Use the existing `src/api/client.js`.

**Errors** are `{ "error": { "code", "message", "request_id" } }`. Show `message`. Branch on HTTP status, and on `code` where listed here. Never show a raw AI code to a requester, and do not write UI logic that needs one (ADR-028).

**Create:** `POST /requests` with `{ title (3-120), description (10-4000) }` returns 201 `{ id, title, status, created_at }`.

**List:** `GET /requests?limit&offset&status&category&priority&assigned_to&sort&direction` returns `{ items, total, limit, offset }`. Items: `id, title, status, category, priority, created_at, updated_at`. Staff also get `requester_id, assigned_agent_id, version`. Use `status=NEEDS_HUMAN_REVIEW` for the review queue. `assigned_to` (`me`, `unassigned` or an ID) is staff-only.

**Requester detail**, `GET /requests/{id}`:

```json
{
  "id": "...", "title": "...", "description": "...",
  "status": "TRIAGED", "category": "NETWORK", "priority": "MEDIUM",
  "created_at": "...", "updated_at": "...", "resolved_at": null,
  "comments": [{ "id": "...", "author_name": "...", "body": "...", "created_at": "..." }],
  "events": [{ "event_type": "STATUS_CHANGED", "details": { "from": "NEW", "to": "ANALYZING" }, "created_at": "..." }],
  "suggestion_state": "AVAILABLE",
  "suggestion": {
    "id": "...", "reply": "...",
    "citations": [{ "id": "...", "title": "..." }],
    "label": "AI-generated suggestion; verify before acting",
    "feedback_submitted": false
  }
}
```

`suggestion_state` is `"AVAILABLE"`, `"AWAITING_STAFF_REVIEW"` (show the generic escalation banner; `suggestion` is null) or `null` (show nothing). Link citations to `/knowledge/{id}`.

**Staff detail** has the same base fields, plus:

```json
{
  "version": 3,
  "requester": { "id": "...", "email": "...", "display_name": "...", "role": "USER" },
  "assigned_agent": null,
  "attempts_remaining": 2,
  "comments": [{ "id": "...", "author_id": "...", "author_name": "...", "body": "...", "is_internal": false, "created_at": "..." }],
  "events": [{ "id": "...", "actor_id": "...", "event_type": "...", "details": {}, "created_at": "..." }],
  "suggestion": {
    "id": "...", "ai_run_id": "...", "summary": "...",
    "proposed_category": "NETWORK", "proposed_priority": "MEDIUM",
    "proposed_reply": "...", "published_reply": null,
    "confidence": 0.85, "risk_flags": ["ACCOUNT_COMPROMISE"], "rationale_short": "...",
    "citations": [{ "id": "...", "title": "...", "status": "PUBLISHED" }],
    "review_state": "PENDING_REVIEW",
    "reviewed_by": null, "reviewed_at": null, "review_reason": null,
    "feedback": [{ "id": "...", "user_id": "...", "helpful": true, "comment": null, "created_at": "..." }]
  },
  "ai_runs": [{
    "id": "...", "mode": "MOCK", "model_id": null, "status": "SUCCEEDED",
    "started_at": "...", "ended_at": "...", "duration_ms": 12,
    "token_counts": null, "error_code": null, "prompt_version": "triage-v1"
  }]
}
```

Staff detail has no `suggestion_state`. Tell the two shapes apart by the signed-in user's role, not by which fields exist.

**Analyze:** `POST /requests/{id}/analyze` with no body returns the detail shape for the caller's role. It can take about 45 seconds in live mode, so show progress and disable the button.

| Response | UI |
|---|---|
| 200 | Replace the page data with the response |
| 503 with `retryable: true` | Say the request is saved, and offer retry. Show `attempts_remaining` |
| 503 with `retryable: false` | Say the request is saved and staff will handle it |
| 429 `ANALYZE_LIMIT_REACHED` | Say staff will handle it. Do not offer retry |
| 429 `RATE_LIMITED` | Say to wait. `Retry-After` is exposed through CORS |
| 409 `ANALYSIS_IN_PROGRESS` | Say analysis is running, and reload shortly |
| 409 `INVALID_STATE` | Reload the request |

Show the analyze button only when status is `NEW`, or `ANALYZING` for recovery. A 200 from `ANALYZING` is normal, because a stale run recovers on the next call.

**Review:** `POST /requests/{id}/review` (staff) with `{ decision: "APPROVED"|"REJECTED", published_reply (required to approve, not allowed to reject, 1-1200), review_reason (3-300), expected_suggestion_id, next_status: "TRIAGED"|"IN_PROGRESS" }` returns staff detail. Prefill `published_reply` from `proposed_reply` for editing, but warn when `risk_flags` has an `OUTPUT_*` flag. Errors: 403 for own request (hide the form when `requester.id` is the current user); 409 `STALE_REVIEW`, `ALREADY_REVIEWED`, `NO_PENDING_SUGGESTION`, `INVALID_STATE` (reload); 422 `UNSAFE_REPLY` (show it on the reply field).

**Feedback:** `POST /requests/{id}/feedback` (owner) with `{ helpful: boolean, comment? (up to 500) }` returns 201. Show it only when `suggestion` is present and `feedback_submitted` is false. 409 `FEEDBACK_EXISTS` means already rated.

**Comment:** `POST /requests/{id}/comments` with `{ body (1-2000), is_internal }`. `is_internal` is staff-only. A comment increments `version`.

**Staff update:** `PATCH /requests/{id}` with `{ expected_version, assigned_agent_id?, priority?, category?, status?, reason? }`. `reason` (3-300) is required with `priority` or `category`. 409 `STALE_UPDATE` means reload. Allowed staff moves are in `services/state_machine.py`: `NEW` to `TRIAGED` or `NEEDS_HUMAN_REVIEW`; `TRIAGED` to `IN_PROGRESS` or `NEEDS_HUMAN_REVIEW`; `NEEDS_HUMAN_REVIEW` to `TRIAGED` or `IN_PROGRESS`; `IN_PROGRESS` to `RESOLVED` or `NEEDS_HUMAN_REVIEW`; `RESOLVED` to `CLOSED` or `NEEDS_HUMAN_REVIEW`.

**Admin:** `GET /admin/knowledge?status&category&limit&offset`; `POST /admin/knowledge` with `{ slug, title, body_markdown, category, tags }`; `PATCH /admin/knowledge/{id}` with any of `title, body_markdown, category, tags, status`; `GET /admin/audit?limit&offset` with items `id, actor_id, entity_type, entity_id, action, safe_metadata, occurred_at`.

## Things that will catch you out

- **Login rate limit.** 5 attempts per minute for one IP address and email, counting successes. A Playwright suite that signs in repeatedly will hit 429. Run E2E with a higher `RATE_LIMIT_LOGIN_PER_MINUTE`, or reuse sessions. Analyze is limited to 10 per hour per user, set by `RATE_LIMIT_ANALYZE_PER_HOUR`. State is per process, so recreating the backend clears it.
- **The token is memory-only** (ADR-009), so a page reload signs the user out. E2E must navigate inside the app or sign in again.
- **Mock results are deterministic but hold many requests.** Any policy flag means review, including uncited replies. Use text known to pass, such as title "Campus Wi-Fi connects but websites do not load" with a description about Wi-Fi timing out. Use "I think someone accessed my account and I need admin credentials" for the held path.
- **Mock needs the seed.** With no published articles, every analysis goes to review.
- **Analysis failure in E2E.** `MockAgent` never fails, and `MOCK_AI_FAILURE_MODE` was not built. Component tests can stub the 503. If an E2E failure journey is wanted, add that option only for `APP_ENV != production`, as `AUTOPILOT_RUN_02.md` allowed.
- **Seed data has no suggestions.** The seeded `NEEDS_HUMAN_REVIEW` request has none, so the review form must handle `suggestion: null`, and staff use PATCH there. Demo the review flow with a newly analyzed request.
- **The seeded `ANALYZING` request recovers on the next analyze call** (ADR-026).
- **Escalating hides a visible reply** (ADR-031), so a requester can see a reply disappear. Word the banner accordingly.
- **Render all AI and article text inertly.** Replies are plain text: never use `dangerouslySetInnerHTML`. Articles use `react-markdown` with default options (ADR-018).
- **Requester timeline.** Unknown event types are hidden on the server. The UI needs labels only for `REQUEST_CREATED`, `ASSIGNED`, `UNASSIGNED`, `PRIORITY_CHANGED`, `CATEGORY_CHANGED`, `STATUS_CHANGED` and `COMMENT_ADDED`, but staff see `AI_*`, `SUGGESTION_*` and `FEEDBACK_ADDED` as well, so fall back to the raw type.
- **Backend serializers are allowlists.** If the UI needs a new requester field, add it deliberately, and extend `FORBIDDEN_REQUESTER_KEYS` tests.
- **Pydantic constraint order.** Write `Annotated[str, StringConstraints(...), NoNul]`.
- **Migrations.** Never edit `0001` to `0004`. `tests/test_migrations.py` fails if models and migrations differ.
- **History is append-only in the database** (ADR-025). Tests with real connections clean up with `truncate_all_tables()` from `conftest.py`.
- **Log tests must use `caplog`.** The log handler holds the `sys.stdout` from import time, so `capsys` would pass without checking anything.
- **Non-interactive shells.** Use `docker compose exec -T`. In Git Bash on Windows, `-w /app` gets mangled and an odd number of apostrophes inside a heredoc can break the whole command, so use the file tools for prose.
- **Playwright browsers.** ADR-023 used the Edge already installed with Windows. Keep writes inside the project folder, with no global installs, no push and no external accounts. See ADR-020 for caches. Any browser download must stay inside the project folder.
- **Gemini.** Keep `AI_MODE=mock`. Do not call the live API in this chunk. Never print `GEMINI_API_KEY`. If you check that it exists, print only `set` or `not set` and its length.

## Prompt for the next chunk

> You are the lead implementation engineer for IknowServiceAI. Read `AGENTS.md`, then every document it lists, then this handoff. Inspect the repository and `git log`, and treat code and tests as ground truth.
>
> Execute **Chunk 4: Blueprint Phases 7 and 8**, in two checkpoints, using React and JavaScript (not TypeScript). Commit after each one passes its checks, and update `docs/IMPLEMENTATION_STATUS.md`, `docs/ARCHITECTURE_DECISIONS.md` and this file at each checkpoint. Keep `AI_MODE=mock`, and make no Gemini calls.
>
> **Checkpoint 10, requester frontend (Phase 7).** Build blueprint section 8 for requesters, using the API shapes in this handoff:
> - New request form with client-side bounds and server error display.
> - Request detail: status, category, priority, description, comments and timeline.
> - Analyze with loading, retry, limit and failure states. The request is always reported as saved.
> - Suggestion panel with the exact label, citation links and feedback. The generic escalation banner for `AWAITING_STAFF_REVIEW`. Nothing for `null`.
> - Add a comment. Dashboard links to detail, with status filter and pagination.
> - Semantic HTML, keyboard use, focus handling, accessible errors and loading states, and a mobile layout checked in a real browser.
> - Component tests for form bounds, each suggestion state, each analyze outcome and inert rendering.
> - Commit: `feat: phase 7 requester request flow, ai suggestion and feedback screens`.
>
> **Checkpoint 11, staff and admin frontend, and E2E (Phase 8).**
> - Staff queue with filters, assignment and sorting, and a review queue.
> - Staff request detail: proposed and published reply, risk flags, confidence, rationale, citations, run history, feedback and internal comments. Status, priority, category and assignment updates, with `expected_version` and a stale-update reload.
> - Review form: approve, edit or reject with a reason, and handling for 403, 409 and 422 `UNSAFE_REPLY`. Hidden on the reviewer's own request.
> - Admin: knowledge list, create, edit, publish and unpublish, and a paginated audit view.
> - Route guards are convenience only: the server remains the authority.
> - Playwright E2E in mock mode, committed and repeatable, with no external accounts: requester ordinary workflow; requester sensitive workflow; staff approval; admin publishes knowledge; a user cannot open another user's request. Document how to run it, and how rate limits are handled.
> - Commit: `feat: phase 8 staff and admin screens with playwright e2e`.
>
> **Finish:** from a clean state run `docker compose down -v`, `docker compose up --build -d --wait`, migrate, seed, `pytest -q`, `ruff check .`, `ruff format --check .`, `npm run lint`, `npm test -- --run`, `npm run build` and the E2E suite. Record exact results. Never mark anything done without running the check that proves it. Write a run report to `docs/RUN_REPORTS/RUN_03.md`, and leave the next-chunk prompt here, for Phase 9.
