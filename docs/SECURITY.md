# Security

This is a portfolio demo with synthetic data. It has not had an independent security review or a penetration test. This document describes what the code does, and where it stops. Tests named here are in `backend/tests/`.

## Threat model

| Threat | Defense | Test |
|---|---|---|
| A requester reads another person's request | Ownership check on every read and write; non-owners get 404, so IDs cannot be enumerated | `test_adversarial.py`, `test_requests_read.py` |
| A requester uses a staff action | Roles are read from the database on every request and enforced on the server | `test_review.py`, `test_requests_lifecycle.py` |
| Prompt injection in a request | Text is delimited and labeled as untrusted, deterministic scanning holds it for review, and the model has no tools | `test_adversarial.py`, `test_policy.py` |
| Prompt injection in an article | Only published articles are retrieved, excerpts are plain text inside delimiters, and instruction-like text sets `KB_CONTENT_SUSPECT` | `test_adversarial.py` |
| A model invents a citation | Citations must be in the retrieved set and currently published; others are dropped and review is required | `test_analyze.py` |
| A model clears its own review | Flags only accumulate, so `requires_human_review=false` lowers nothing | `test_adversarial.py`, `test_policy.py` |
| A model asks for a password, claims an action or adds a contact | Output is scanned; the reply is held and never shown; staff cannot publish a reply that asks for credentials | `test_adversarial.py`, `test_review.py` |
| Unreviewed text reaches a requester | One function, `suggestions.requester_view`, decides visibility, and requester schemas are explicit allowlists | `test_adversarial.py`, `test_analyze.py` |
| A reviewer approves their own request, or acts on stale data | 403 for self-review; 409 for stale or repeated reviews | `test_review.py` |
| Sensitive values reach a provider | Text is redacted before retrieval, prompting or storage in `ai_runs` | `test_redaction.py`, `test_analyze.py` |
| Secrets reach logs | Metadata-only logging, a masking filter, sanitized provider errors and `SecretStr` for the key | `test_hardening.py`, `test_gemini_agent.py` |
| Password guessing or quota exhaustion | Sliding-window rate limits on login and analyze, plus a per-request analyze budget | `test_hardening.py`, `test_analyze.py` |
| History is altered | The app's database role has no `UPDATE` or `DELETE` on `audit_logs` and `request_events`, and triggers refuse them for everyone else | `test_db_role.py`, `test_append_only.py` |
| A stolen refresh token is used | Rotation with reuse detection: a repeated token revokes that whole sign-in. Only a hash is stored | `test_sessions.py` |
| Another site triggers a session call | `SameSite=Strict`, same origin, and a required custom header that CORS will not allow | `test_sessions.py` |
| The app is compromised | It connects as a role that owns nothing, cannot run DDL and cannot truncate | `test_db_role.py` |
| Script injection through articles | Bodies are stored verbatim and rendered inertly by `react-markdown`; snippets hold no markup | `test_knowledge.py`, `knowledge.test.jsx` |
| A provider outage loses a request | Requests are saved before analysis, failures return them to `NEW`, and staff can triage manually | `test_analyze.py` |

## Trust boundaries

```text
Browser (untrusted)
   |  HTTPS JSON, same origin, bearer token, HttpOnly refresh cookie. Never sees the Gemini key.
FastAPI: authentication, roles, ownership, validation
   |
Services: state machine, policy, review       <- All decisions are made here.
   |                        |
PostgreSQL (trusted)     Provider adapter
                            |  Redacted text and article excerpts only
                         Gemini (untrusted output)
```

Three kinds of text are treated as data and never as instructions: request text, article text and model output. **The model can only propose text.** It has no tools, and cannot update tickets, approve itself, query the database, call URLs, change roles or send messages. Application code validates and writes everything.

## Data visibility

| Data | USER (owner) | AGENT | ADMIN | Provider |
|---|---|---|---|---|
| Original title and description | Yes | Yes | Yes | No, redacted only |
| Status, category, priority | Yes | Yes | Yes | No |
| Public comments | Yes | Yes | Yes | No |
| Internal comments | No | Yes | Yes | No |
| Reply with `NOT_REQUIRED` | Yes, as `suggestion.reply` | Yes | Yes | Generated it |
| Reply with `PENDING_REVIEW` | **No**, `AWAITING_STAFF_REVIEW` only | Yes | Yes | Generated it |
| Reply with `REJECTED` | **No**, no trace | Yes | Yes | Generated it |
| `published_reply` once `APPROVED` | Yes, as `suggestion.reply` | Yes | Yes | No |
| `proposed_reply` once `APPROVED` | **No** | Yes | Yes | Generated it |
| Citations | Published only, as `{id, title}` | With status | With status | Sent as excerpts |
| Confidence, risk flags, rationale | No | Yes | Yes | Generated part of them |
| Run history and `error_code` | No | Yes | Yes | No |
| `redacted_input` | No | No | No, database only | Yes, this is what is sent |
| Timeline | Allowlisted events, `from` and `to` only | All | All | No |
| Audit log | No | No | Yes | No |
| Password hashes, tokens, API key | No | No | No | No |

A USER who is not the owner gets 404 for all of this. Staff who submit a request see the staff view of it, and cannot review it.

## Redaction

`services/redaction.py` masks emails, phone numbers, URLs with a query string or embedded credentials, JWT-like strings, long hex and base64 tokens, API-key-like strings, card-like numbers, `password:` and `pwd=` style secrets, UUIDs and numeric IDs of 7 or more digits.

Redacted text goes to retrieval, the prompt and `ai_runs.redacted_input`. The original stays on the request for authorized viewers. `redacted_input` is not returned by any endpoint and is not logged.

**Limits:** names and street addresses are not masked, and neither is a secret in an unusual format. Patterns reduce exposure but do not guarantee it.

## Prompt-injection defenses

These are layers, because none is sufficient alone:

1. **Least privilege:** the model has no tools, so a successful injection can only change proposed text.
2. **Separation:** a fixed system instruction, with untrusted text inside delimiters and any delimiter runs in that text neutralized.
3. **Input scanning:** deterministic patterns, after removing invisible characters and normalizing compatibility forms.
4. **Output validation:** a strict schema, allow-listed flags, citation checks and markup stripping.
5. **Output scanning:** requests for credentials, claims of action, and contact details that the cited articles do not contain.
6. **Human review:** anything flagged waits for staff, whose published text is scanned for credential requests.

## Rate limits

| What | Default | Key | Setting |
|---|---|---|---|
| Login | 5 per minute | IP address and email | `RATE_LIMIT_LOGIN_PER_MINUTE` |
| Analyze | 10 per hour | User | `RATE_LIMIT_ANALYZE_PER_HOUR` |
| Analyze, per request | 3 attempts | Request | `AI_MAX_ANALYZE_ATTEMPTS` |
| Provider calls per action | 2 | Action | `MAX_ATTEMPTS` in `services/ai/gemini.py` |

Limited responses are 429 with `Retry-After`. See ADR-030.

## Transport and browser

- The SPA and API share one origin (ADR-044). Credentials are never sent across origins. CORS is an explicit allowlist, empty in production, and a wildcard fails at startup.
- The access token is held in memory only. The refresh token is in an `HttpOnly`, `SameSite=Strict` cookie, `Secure` in production, scoped to `/api/v1/auth` (ADR-045). JavaScript can read neither from storage, and the browser never calls Gemini.
- With `APP_ENV=production`, API docs are disabled and every response has a strict `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`. `HSTS_ENABLED=true` adds `Strict-Transport-Security` once HTTPS works (ADR-048).
- Startup fails if `AI_MODE=gemini` lacks a key or model, or if `JWT_SECRET` is short. In production it also fails on a placeholder or repetitive secret.

## Database roles

| Role | Used by | Can do |
|---|---|---|
| Owner | Migrations and `reset_demo` only, through `MIGRATION_DATABASE_URL` | Everything |
| `app_user` | The running app, through `DATABASE_URL` | `SELECT`, `INSERT`, `UPDATE`, `DELETE`; only `SELECT` and `INSERT` on `audit_logs` and `request_events`; only `SELECT` on `alembic_version` and `demo_state`; `EXECUTE` on `demo_reset_begin`. No `TRUNCATE`, no DDL, owns nothing |

**Local:** `db/init/02-create-app-role.sh` creates `app_user` when the volume is first initialized, and revision `0006` grants its access.

**Hosted:** as the owner, run `deploy/sql/create_app_role.sql` once with a generated password, then `alembic upgrade head`. If the role was created after migrating, run `deploy/sql/grant_app_role.sql`. Give the running app only `DATABASE_URL`, and keep `MIGRATION_DATABASE_URL` for one-off commands. Check the result with the queries in `tests/test_db_role.py`. A managed provider's default role may have extra rights, so confirm that the role you create does not inherit them.

## Public demo reset

The demo resets itself daily with `DEMO_MODE=true`, through a `SECURITY DEFINER` function the app role may call (ADR-051). **This is a deliberate exception to "the app role cannot erase history".** Its limits, all enforced in the database:

- It does nothing unless the owner role has set `demo_state.reset_enabled`, which `app_user` cannot change. The default is off.
- It runs at most once an hour, whatever interval the caller asks for, and only one caller can win its advisory lock.
- It has a fixed table list and a pinned `search_path`, takes no text from the caller, and only `app_user` may execute it.

So a compromised app on a demo database could erase that demo's synthetic data at most hourly, and on any other database not at all. The demo also caps created requests and articles (ADR-051).

## Known risks

- **Pattern scanning can be evaded.** Rephrasing, other languages, homoglyphs or text split across fields can get past it. Citation, schema and output checks still apply, but a cleverly worded harmless-looking reply could be shown without review.
- **False positives are expected.** Ordinary requests that mention passwords or admin rights go to staff, which costs staff time. On the evaluation fixture, 1 of 10 ordinary cases was held in mock mode, and that came from the mock's low confidence. See [the evaluation](EVALUATION.md).
- **A shared word can retrieve an unrelated article.** In live mode, only the model's judgment stops a confident reply citing it. This is not measured. See [the evaluation](EVALUATION.md).
- **An uncited reply is always held,** even when harmless (ADR-027).
- **Model replies that pass every check are shown unreviewed,** labeled "AI-generated suggestion; verify before acting". They may still be wrong.
- **Rate limits are per process.** They reset on restart and do not work across instances. Behind a proxy, `TRUSTED_PROXY_HOPS` must match the host, or all users share one address, or an address can be forged (ADR-048).
- **Login limits can lock out a real user** for up to a minute if someone else tries that email from the same address.
- **The triggers and grants do not stop the owner role** (ADR-025, ADR-047). Whoever holds `MIGRATION_DATABASE_URL` can change history, so keep it away from the running app.
- **The access token cannot be revoked** before it expires, up to 10 minutes after sign-out (ADR-058), although a deactivated user is refused immediately.
- **Sign-out needs the server.** If the logout call fails, the cookie stays until it expires, and a reload signs back in.
- **A script injected into the page could still use the session** while the page is open, although it could not read the refresh token. The Content-Security-Policy is the defense against that, in production only.
- **Staff replies are only scanned for credential requests.** A reviewer can still publish poor advice. Their identity and reason are recorded.
- **`redacted_input` is stored indefinitely.** There is no retention job. The demo reset is the only cleanup.
- **The live Gemini path has a small sample.** 10 synthetic cases through the orchestrator, plus the owner's smoke test. That is not evidence about quality or latency in general, and 2 requests through the running app's HTTP endpoints. See [the evaluation](EVALUATION.md).

## Demo limitations

- All data is synthetic. **Do not enter real personal data, credentials or support cases.**
- Anyone can sign in as any demo account, including the admin, and change shared data until the next reset. Volume caps limit how much.
- The shared demo password is intentionally public. It is shown on the login page in development, and in production only with `DEMO_MODE=true`.
- `store=False` is requested from Gemini, but Google's pricing page states that free-tier content may be used to improve its products. That is another reason to send only synthetic, redacted text.
- There is no TLS locally. `compose.prod.yaml` over `http://localhost` works because browsers treat localhost as secure for cookies. On any other host, serve it over HTTPS, or the `Secure` cookie will not be kept.
