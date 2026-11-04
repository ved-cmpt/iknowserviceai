# Autopilot run 02 report

**Result: Chunk 3 is complete in mock mode, and all four checkpoints are committed. The live Gemini test failed: both attempts timed out, so `AI_MODE=gemini` is unverified and recorded as BLOCKED.** Nothing else depends on it. The full suite passed from a clean state. Nothing is deployed or pushed. The stack is running in mock mode with freshly reset demo data.

## 1. Repo state found at start

`main` at `f526143`, with `docs/prompts/AUTOPILOT_RUN_02.md` untracked. `docker compose up -d --wait` gave healthy services, `/readyz` returned 200, and the baseline matched the handoff: 309 backend and 31 frontend tests passing. `.env` held a key (length 53, never printed), `AI_MODE=mock`, and a placeholder `GEMINI_MODEL`.

## 2. Completed and verified functionality

**Checkpoint 6: carry-overs**
- Query-focused snippets using `ts_headline` on text with markup already removed, for both the retriever and public search. Browsing and title-only matches use leading text.
- Revision `0003` adds triggers that refuse `UPDATE` and `DELETE` on `audit_logs` and `request_events`.
- `httpx` was replaced by `httpx2` for the test client, which removed the `StarletteDeprecationWarning`.
- Proof: `tests/test_append_only.py` (8) runs raw SQL; 6 new tests in `tests/test_knowledge.py`; on the real database after the demo, `reset_demo --yes` worked and `DELETE FROM request_events` returned `ERROR: DELETE on request_events is not allowed: the table is append-only`; `pytest` shows 0 warnings.

**Checkpoint 7: orchestration, mock agent, redaction, analyze**
- `services/ai/` (`base`, `mock`, `prompts`, `factory`, `orchestrator`), `services/redaction.py`, `services/policy.py`, `services/suggestions.py`, and `POST /requests/{id}/analyze`.
- Two transactions around the provider call, stale run recovery, attempt budget, citation validation, markup stripping, sanitized failures, and role-aware responses.
- Proof: `tests/test_analyze.py` (60) covers each failure type, attempts, 429, non-`NEW` 409, stale recovery, invalid citations, redaction reaching the provider, and forbidden requester fields. `tests/test_redaction.py` (37) covers each pattern and ordinary text. `tests/test_concurrency.py` runs on real connections: 5 rounds of simultaneous analyses each gave exactly `[200, 409]`, and another connection could take `FOR UPDATE NOWAIT` on the row during the provider call, which proves no lock is held.

**Checkpoint 8: Gemini adapter**
- `services/ai/gemini.py`, using the Interactions API with `store=False`, a response schema and at most 2 attempts. The opt-in test is `tests/live/test_gemini_live.py`.
- Proof: `tests/test_gemini_agent.py` (50) uses both a stub client and **the real SDK with a fake HTTP transport**, which measures actual requests: exactly 2 on a 429, 503 or timeout, and 1 on an auth failure.
- **Not proven live.** See "Live Gemini result".

**Checkpoint 9: policy, review, feedback, rate limits, hardening**
- Deterministic scanning of request text, model output and retrieved articles. `POST /review`, `POST /feedback`, an in-process rate limiter, a log masking filter, and `docs/SECURITY.md`.
- Proof: `tests/test_policy.py` (99), `tests/test_review.py` (47), `tests/test_adversarial.py` (19), `tests/test_hardening.py` (34).
- **The safety tests were themselves checked.** I temporarily broke three controls, and restored each afterwards: showing pending text to requesters (19 failed, 30 errors), ignoring the request-text scan (4 failed), and allowing self-review (2 failed).

**Manual API demo over HTTP, mock mode, final code**

```text
1. Riley analyzes the NEW Wi-Fi request   200 TRIAGED NETWORK MEDIUM AVAILABLE
   label: AI-generated suggestion; verify before acting
   citations: Wi-Fi connected but websites not loading; VPN connectivity troubleshooting
   forbidden keys in Riley's JSON: []     feedback 201, repeat feedback 409
2. Riley creates and analyzes "I think someone accessed my account and I need admin credentials"
   200 NEEDS_HUMAN_REVIEW HIGH suggestion_state=AWAITING_STAFF_REVIEW suggestion=None
3. Sam reads it: 404. Riley calls review: 403. Alex publishes an unsafe reply: 422 UNSAFE_REPLY
   Alex sees PENDING_REVIEW, flags ACCOUNT_COMPROMISE, CREDENTIAL_REQUEST, PRIVILEGED_ACCESS
4. Alex approves a safe reply: 200 TRIAGED APPROVED. Repeat review: 409 ALREADY_REVIEWED
5. Riley now sees: "Our support team will contact you through a verified channel. Please do not
   share your password with anyone."
6. Alex reads audit: 403. Jordan reads audit: request.created, status changes,
   request.ai_analysis_started, request.category_changed, request.priority_changed,
   request.ai_analysis_succeeded, request.review_approved (with reason). Reply text in audit: False
7. The seeded stuck ANALYZING request: 200 TRIAGED
8. Login with a wrong password, 6 times: 401 x5, then 429 with Retry-After: 60
```

After an earlier run of this same demo, the backend log was scanned for `eyJ`, the demo password, `admin credentials`, `Bearer `, `verified channel` and `wrong-password`, with 0 matches for each.

## 3. Files and directories created or changed

53 files changed from `f526143` to the phase 6 commit (28 added, 25 modified), then this report's docs and one test.

| Area | Contents |
|---|---|
| `backend/alembic/versions/` | `0003_append_only_history.py`, `0004_suggestion_rationale_and_review_reason.py` |
| `backend/app/services/ai/` | `base.py`, `mock.py`, `gemini.py`, `prompts.py`, `factory.py`, `orchestrator.py` |
| `backend/app/services/` | New: `redaction.py`, `policy.py`, `suggestions.py`, `review.py`. Changed: `requests.py`, `knowledge.py`, `retrieval.py`, `state_machine.py` |
| `backend/app/core/` | New: `rate_limit.py`. Changed: `config.py`, `errors.py`, `logging.py` |
| `backend/app/` other | New: `schemas/ai.py`. Changed: `schemas/requests.py`, `db/models/ai.py`, `db/models/enums.py`, `routers/requests.py`, `routers/auth.py`, `routers/knowledge.py`, `main.py` |
| `backend/tests/` | New: `ai_fakes.py`, `test_analyze.py`, `test_redaction.py`, `test_policy.py`, `test_review.py`, `test_adversarial.py`, `test_hardening.py`, `test_gemini_agent.py`, `test_append_only.py`, `live/test_gemini_live.py`. Changed: `conftest.py`, `test_concurrency.py`, `test_knowledge.py` |
| `backend/` | `pyproject.toml`, `uv.lock` (`google-genai` 2.34.0, `httpx`, `httpx2`) |
| Root | `.env.example`, `README.md` |
| `docs/` | New: `SECURITY.md`, `RUN_REPORTS/RUN_02.md`. Changed: `API.md`, `ARCHITECTURE_DECISIONS.md`, `IMPLEMENTATION_STATUS.md`, `NEXT_AGENT_PROMPT.md`, `PRODUCT_CONTRACT.md`. `prompts/AUTOPILOT_RUN_02.md` is now tracked |
| Untracked | `.env`: the only change is `GEMINI_MODEL=gemini-3.5-flash-lite`. It remains git-ignored |

The frontend did not change. Nothing outside the project folder was changed on purpose, apart from Docker's own images and volumes for this project, and session scratch files.

## 4. Commands run, exit codes and test counts

Final clean-state run, on the final code:

| Command | Exit | Result |
|---|---|---|
| `docker compose down -v` | 0 | Removed |
| `docker compose up --build -d --wait` | 0 | Healthy |
| `GET /readyz` before migrating | | 503, as intended |
| `docker compose exec -T backend alembic upgrade head` | | 4 revisions applied |
| Same again | 0 | No-op |
| `docker compose exec -T backend alembic check` | | `No new upgrade operations detected.` |
| `docker compose exec -T backend python -m app.scripts.seed_demo` (twice) | | `Seed complete: 4 users, 13 articles, 9 requests.` both times |
| `GET /readyz`, `/healthz`, `/api/v1/readyz`, `:5173/` | | All 200 |
| `docker compose exec -T backend pytest -q` | see note | **671 passed, 0 failed, 1 skipped**, 0 warnings |
| `docker compose exec -T backend ruff check .` | see note | `All checks passed!` |
| `docker compose exec -T backend ruff format --check .` | see note | `83 files already formatted` |
| `docker compose exec -T frontend npm run lint` | 0 | Clean |
| `docker compose exec -T frontend npm test -- --run` | | **31 passed** |
| `docker compose exec -T frontend npm run build` | 0 | Built |
| `docker compose exec -T backend python -m app.scripts.reset_demo --yes` | 0 | `Demo data reset complete.` 9 requests, 0 AI runs |

**Note on exit codes:** in the final run, those three commands were piped to `tail`, so the exit code was not captured. The clean-state run just before it, with one test fewer (670 passed, 1 skipped), captured exit 0 for `pytest`, `ruff check` and `ruff format --check`. A blank exit means the same.

Backend tests per file: adversarial 19, analyze 60, append-only 8, auth 22, concurrency 3, gemini agent 50, hardening 34, health 16, knowledge 120, migrations 3, policy 99, redaction 37, lifecycle 133, requests read 8, review 47, seed 12, live 1 (skipped).

Environment at the end: `.env` has `AI_MODE=mock`; the container reports `AI_MODE=mock`, `GEMINI_MODEL=gemini-3.5-flash-lite`, key `set, length 53`.

Key checks, printing counts only: the real key's exact value appears 0 times in the staged diff, git history, tracked files and backend logs. A format-based check matched only the obviously fake `AQ.FakeKey...` fixture in `test_hardening.py`.

## 5. Unverified or blocked

- **BLOCKED: live Gemini analysis.** See "Live Gemini result".
- **The whole `AI_MODE=gemini` path through the running app.** It was never run against the real API. The factory branch and adapter are tested offline only. `conftest.py` forces `AI_MODE=mock`, so the live test builds `GeminiAgent` directly: passing `AI_MODE=gemini` on that command had no effect on the app.
- **`store=False` behavior and structured output on the real API.** The request shape follows the SDK and docs, and is tested against a fake transport. Google's handling of it is unconfirmed.
- **No browser check this run.** The frontend did not change, and has no AI screens yet.
- **Host-side frontend checks** were not run this time. Container checks passed.
- **Commands without `-T`** were not run, because this session has no terminal.
- **A fresh `git clone` build** was not run. The clean-state run used the working tree, with the same contents as the commits apart from the final docs and one test.
- **Policy accuracy** has not been measured. Tests prove the listed cases, not a false-positive or false-negative rate. That is Phase 9.

## 6. Deviations from the blueprint and prompt

| ADR or item | Deviation |
|---|---|
| ADR-024 | Supersedes ADR-017 for search snippets, as the prompt asked |
| ADR-025 | Narrows ADR-007: a request with history can no longer be hard-deleted, because the trigger refuses the cascade |
| ADR-026 | Stale runs count against the attempt budget, and staff changes made during a run are kept. The prompt did not specify either |
| ADR-027 | A reply with no valid citation always needs review, rather than detecting "procedural" text. The provider is still called when retrieval is empty, and its reply is replaced |
| ADR-028 | **Resolves a conflict in the prompt:** it specifies `error.code` in the 503 and also says a USER never sees raw error codes. A USER gets `ANALYSIS_FAILED`, and staff get the `AI_*` code |
| ADR-029 | Interactions API chosen, SDK retries disabled, `gemini-3.5-flash-lite` |
| ADR-030 | In-process rate limiter. Login counts every attempt, not only failures |
| ADR-031 | **Added beyond the prompt:** escalating a request withholds its visible AI reply until reviewed. Without this, staff could not take back a reply they distrust |

Other choices to check:

- `redacted_input` is returned to nobody, including staff, which is stricter than the prompt requires.
- `KB_CONTENT_SUSPECT` is an extra flag, set when retrieved article text looks like instructions.
- `MOCK_AI_FAILURE_MODE` was optional and was not built.
- `policy.py` is committed with Phase 5, not Phase 6, because analyze depends on it. The Phase 6 commit message says so.
- The Gemini commit includes a note that the live test failed, in addition to the requested subject line.

## 7. Known bugs and limitations

No known bugs apart from the live failure. Bugs found and fixed during the run:

- The SDK sent a second request on 429 and 5xx even with `attempts=1`, which would have exceeded the provider call limit. Found by measuring offline, fixed, and pinned by tests.
- My first live test run crashed on a wrong seed key before reaching the API, so it used no calls.
- Two log tests used `capsys`, which could not see the log handler and so would have passed regardless. They now use `caplog`.

Limitations:

- **Regex scanning can be evaded** by rephrasing or other languages, and will hold some harmless requests. Other layers still apply, but a harmless-looking reply could be shown without review.
- **Replies that pass every check are shown unreviewed** and may still be wrong. They carry the required label.
- **Mock replies are generic.** They list article titles. In the demo, the mock also cited the VPN article for a Wi-Fi problem, because its keyword match is broad. The test only requires the Wi-Fi article to be among the citations.
- **Seeded `TRIAGED` and `NEEDS_HUMAN_REVIEW` requests have no suggestion,** so `/review` returns 409 on them. Use a newly analyzed request.
- **Rate limits are per process,** reset on restart, and need proxy configuration when hosted. Five logins a minute will affect E2E suites unless raised.
- **The analyze rate limit counts every call,** including ones that return 404 or 409.
- **The AI endpoints have no screens yet.** Use `/docs`.
- **`redacted_input` has no retention job.** The trigger does not stop a database superuser, and the local app role is one.

Full list: `docs/IMPLEMENTATION_STATUS.md` and `docs/SECURITY.md`.

## 8. Commits

Run `git log --oneline` for the final list.

```text
1116bd1 feat: phase 6 policy gate, staff review, feedback, rate limiting and adversarial tests
d78d10f feat: gemini agent adapter with structured output and opt-in live smoke test
4c8631a feat: phase 5 ai orchestration, mock agent, redaction and analyze endpoint
34fbe04 feat: query-focused snippets and db-enforced append-only audit
```

The final commit, `docs: autopilot run 02 report and handoff`, adds this report, the handoff and one offline factory test.

## 9. Owner actions needed

None are required to try the app or to start Chunk 4. Docker Desktop must stay running.

Optional:

1. **Retry the live test when convenient.** It uses at most 2 calls on your free tier, with a longer timeout:

   ```powershell
   docker compose exec -T -e RUN_LIVE_GEMINI_TESTS=1 -e AI_REQUEST_TIMEOUT_SECONDS=60 backend python -m pytest -q -s tests/live
   ```

   It prints only the model, latency, token counts and a short summary. If it passes, consider raising `AI_REQUEST_TIMEOUT_SECONDS` in `.env` to match the measured latency. If it times out again, the next thing to try is a different free model through `GEMINI_MODEL`, or the `generate_content` call shape.
2. **Review ADR-028 and ADR-031,** because they settle a conflict in the prompt and add behavior it did not ask for.
3. **Keep real data out.** Google's pricing page says free-tier content may be used to improve its products. Only synthetic data should go through live mode.

## 10. How to try it now

| What | URL |
|---|---|
| App | http://localhost:5173 |
| API docs | http://localhost:8000/docs |
| Readiness | http://localhost:8000/readyz |

The shared demo password is `demo-only-public-2026`. Accounts: `riley.morgan@demo.iknowservice.test` (USER), `sam.patel@demo.iknowservice.test` (USER), `alex.chen@demo.iknowservice.test` (AGENT), `jordan.reyes@demo.iknowservice.test` (ADMIN).

**The AI flow in `/docs`:**

Each time this says "sign in as", do the following. Open `POST /api/v1/auth/login`, choose **Try it out**, send the email and password, and copy `access_token`. Then choose **Authorize** at the top of the page, paste the token, and confirm. To switch accounts, choose **Authorize**, then **Logout**, then authorize with the new token. Five sign-ins per minute are allowed for each account.

*An ordinary request:*

1. Sign in as Riley.
2. Run `GET /api/v1/requests` with `status` set to `NEW`, and copy the `id` of "Campus Wi-Fi connects but websites do not load".
3. Run `POST /api/v1/requests/{request_id}/analyze` with that ID. You should get `status: TRIAGED`, `category: NETWORK` and a `suggestion` with a reply, the AI label and citations. Confidence and risk flags are absent.
4. Run `POST /api/v1/requests/{request_id}/feedback` with `{"helpful": true}` for 201. Run it again for 409.

*A sensitive request:*

5. Still as Riley, run `POST /api/v1/requests` with:

   ```json
   { "title": "Possible account compromise", "description": "I think someone accessed my account and I need admin credentials" }
   ```

6. Analyze the new ID. You should get `NEEDS_HUMAN_REVIEW`, `suggestion_state: AWAITING_STAFF_REVIEW` and `suggestion: null`.
7. Sign in as Alex, and run `GET /api/v1/requests/{request_id}`. You now see `proposed_reply`, `risk_flags`, `confidence` and `ai_runs`. Copy `suggestion.id`.
8. Run `POST /api/v1/requests/{request_id}/review`, using that value:

   ```json
   {
     "decision": "APPROVED",
     "published_reply": "Our support team will contact you through a verified channel. Please do not share your password with anyone.",
     "review_reason": "Safe escalation language approved",
     "expected_suggestion_id": "<suggestion.id>"
   }
   ```

   Try `"published_reply": "Please send us your password."` first to see 422 `UNSAFE_REPLY`. Send the safe body twice to see 409 `ALREADY_REVIEWED`.
9. Sign in as Riley again, and read the request. The `reply` is now exactly what Alex published.
10. Sign in as Jordan, and run `GET /api/v1/admin/audit` to see the trail, including the reviewer and reason, but no reply text.

*Also try:* analyzing "VPN disconnects every few minutes", the seeded stuck request, as Riley. It recovers and completes. Reading Riley's request as Sam gives 404.

To restore the original data:

```powershell
docker compose exec backend python -m app.scripts.reset_demo --yes
```

## 11. Recommended next chunk

**Chunk 4: Phases 7 and 8.** That covers the complete requester, staff and admin frontend, plus Playwright E2E in mock mode. The ready-to-use prompt and the exact API shapes are in `docs/NEXT_AGENT_PROMPT.md`.

## Live Gemini result

| Item | Result |
|---|---|
| Model | `gemini-3.5-flash-lite` (in the account's model list; the pricing page lists it as free of charge) |
| SDK | `google-genai` 2.34.0, Interactions API |
| Live calls used | **3 of 3**: 1 model listing (succeeded), 2 analysis requests (both timed out) |
| Calls counted by | An HTTP event hook, not by estimate |
| Latency | 42,100 ms in total: 2 attempts at the 20-second timeout, plus backoff |
| Outcome | **FAIL: `AI_TIMEOUT`**, no HTTP status, no token counts |
| Status | **BLOCKED.** Not retried, as the rules require |

**What this does and does not show.** Listing models with the same key succeeded moments earlier, so the key and network path were working. No response came back from the analysis, so I can't say whether the cause is slow model latency, the free tier, or something about this Interactions request. I didn't raise the timeout on a guess, because I had no calls left to check that it helped. No billing was enabled, no paid model was called, and the key was never printed.
