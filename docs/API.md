# API reference

This covers implemented endpoints only. The base path is `/api/v1`, except that the health endpoints are also served at the root. Bodies are JSON and timestamps are ISO 8601 UTC. Interactive docs are at `http://localhost:8000/docs` outside production.

## Conventions

**Authentication:** send `Authorization: Bearer <access_token>`. Tokens come from `POST /auth/login`. The role is read from the database on every request.

**Errors:** every error uses one shape, and `request_id` matches the `X-Request-ID` response header.

```json
{ "error": { "code": "STALE_UPDATE", "message": "This request has changed. Reload it and try again", "request_id": "..." } }
```

| Status | Meaning | Codes |
|---|---|---|
| 401 | Not signed in, or the token is invalid or expired | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | Signed in without permission, or a required header is missing | `FORBIDDEN`, `CSRF_HEADER_REQUIRED` |
| 404 | Not found, or not visible to this user | `NOT_FOUND` |
| 405 | Wrong method | `METHOD_NOT_ALLOWED` |
| 409 | Conflict with current state | `INVALID_TRANSITION`, `STALE_UPDATE`, `REQUEST_CLOSED`, `SLUG_CONFLICT`, `INVALID_STATE`, `ANALYSIS_IN_PROGRESS`, `ANALYSIS_SUPERSEDED`, `NO_PENDING_SUGGESTION`, `STALE_REVIEW`, `ALREADY_REVIEWED`, `NO_VISIBLE_SUGGESTION`, `FEEDBACK_EXISTS` |
| 422 | Invalid input | `VALIDATION_ERROR`, `INVALID_ASSIGNEE`, `UNSAFE_REPLY` |
| 429 | Limit reached. `RATE_LIMITED` includes a `Retry-After` header | `RATE_LIMITED`, `ANALYZE_LIMIT_REACHED`, `DEMO_LIMIT_REACHED` |
| 500 | Unexpected failure, with no internal detail | `INTERNAL_ERROR` |
| 503 | Not ready, or the AI provider failed | `NOT_READY`, `ANALYSIS_FAILED`, `AI_TIMEOUT`, `AI_RATE_LIMITED`, `AI_UNAVAILABLE`, `AI_INVALID_OUTPUT`, `AI_AUTH` |

**Request bodies** reject unknown fields with 422.

**Paginated responses** have the shape `{ "items": [...], "total": 0, "limit": 20, "offset": 0 }`. `limit` is 1 to 50 (default 20) and `offset` is 0 or more. Anything outside those ranges returns 422.

## Health

| Method and path | Roles | Response |
|---|---|---|
| `GET /healthz` | Public | 200 `{ "status": "ok" }`. Has no dependencies. |
| `GET /readyz` | Public | 200 `{ "status": "ready", "database": "ok", "migrations": "at_head" }`. 503 `NOT_READY` if the database is unreachable or migrations are not at head, with `database` and `migrations` beside `error`. Retries once, and answers in about 4.5 seconds when the database is down. |

## Auth

### `POST /auth/login` (public)

Request: `{ "email": "...", "password": "..." }`. Email is 3 to 254 characters and case-insensitive; password is 1 to 1024 characters.

Response 200:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": { "id": "...", "email": "...", "display_name": "...", "role": "USER" }
}
```

Errors: 401 `INVALID_CREDENTIALS`, with one message for unknown email, wrong password and inactive account; 429 `RATE_LIMITED` after 5 attempts per minute for one IP address and email. Success and failure are both audited.

A successful sign-in also sets the session cookie: `iks_refresh`, `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, and `Secure` in production. JavaScript cannot read it. See ADR-045.

### `POST /auth/refresh` (cookie)

Requires the header `X-Requested-With: iknowserviceai`. It has no body. It replaces the cookie's token and returns the same body as login, with a new access token. The session's expiry does not move: one sign-in lasts at most `REFRESH_TOKEN_HOURS` (default 8).

Errors: 401 `UNAUTHORIZED` for a missing, unknown, expired or revoked token, or an inactive user, and the cookie is cleared; 403 `CSRF_HEADER_REQUIRED`; 429 `RATE_LIMITED` after 60 attempts per minute per IP address. **Presenting a token that was already replaced revokes every token from that sign-in.**

### `POST /auth/logout` (cookie)

Requires the same header. It revokes every token from this sign-in and clears the cookie. Returns 204, including when there is no cookie. An access token already issued stays valid until it expires.

Errors: 403 `CSRF_HEADER_REQUIRED`.

### `GET /auth/me` (signed in)

Returns the `user` object above. Errors: 401.

## Config

### `GET /config` (public)

Returns what the pages may show: `{ "demo_mode": true, "demo_password_hint": "...", "demo_banner": "...", "ai_notice": "..." }`. In production `demo_mode` and the hint are off unless `DEMO_MODE=true`. `demo_banner` is set only with `DEMO_MODE=true`, and `ai_notice` only when that demo also uses `AI_MODE=mock` (ADR-051).

With `DEMO_MODE=true`, an API request may first start the daily demo reset. It has no effect on the response.

## Requests

### `POST /requests` (any signed-in role)

Request: `{ "title": "...", "description": "..." }`, trimmed. Title is 3 to 120 characters and description is 10 to 4000.

Response 201: `{ "id", "title", "status": "NEW", "created_at" }`. Category defaults to `OTHER` and priority to `MEDIUM`.

Errors: 401, 422. With `DEMO_MODE=true` only: 429 `DEMO_LIMIT_REACHED` when this account reached its daily limit, and 409 `DEMO_CAPACITY_REACHED` when the demo holds too many created requests. `POST /admin/knowledge` returns the same 409 for too many created articles.

### `GET /requests` (any signed-in role)

USER sees their own requests only. AGENT and ADMIN see all.

| Query | Values |
|---|---|
| `limit`, `offset` | See conventions |
| `status`, `category`, `priority` | Enum values |
| `assigned_to` | `me`, `unassigned` or a user ID. Staff only; USER gets 403. |
| `mine` | `true` limits the list to requests the signed-in user submitted. A USER only sees those anyway. |
| `sort` | `created_at` (default), `updated_at`, `priority`. `priority` sorts by severity. |
| `direction` | `desc` (default), `asc` |

Items: `id, title, status, category, priority, created_at, updated_at`. Staff also get `requester_id, assigned_agent_id, assigned_agent_name, version`.

Errors: 401, 403, 422. List items never hold suggestion fields.

### `GET /requests/counts` (any signed-in role)

Counts the requests this user can see, by status. Every status is present, with an explicit zero. Query: `mine=true`, as above.

Response 200: `{ "counts": { "NEW": 2, "ANALYZING": 0, "TRIAGED": 1, "NEEDS_HUMAN_REVIEW": 0, "IN_PROGRESS": 0, "RESOLVED": 0, "CLOSED": 0 }, "total": 3 }`.

Errors: 401.

### `GET /requests/{id}` (owner or staff)

USER response: `id, title, description, status, category, priority, created_at, updated_at, resolved_at`, plus:

- `comments`: public only, each `id, author_name, body, created_at`.
- `events`: `event_type, details, created_at`. Details are limited to `from` and `to` for status, priority and category changes. Internal-comment events, AI and review events, reasons and staff identifiers are removed.
- `suggestion_state` and `suggestion`. See [AI fields](#ai-fields-in-get-requestsid).
- `attempts_remaining` and `last_analysis_failed`, so a page can explain a failed analysis after a reload (ADR-040).

Staff response adds `version`, `requester`, `assigned_agent`, all comments with `author_id` and `is_internal`, full events with `id`, `actor_id` and all details, and `suggestion`, `ai_runs` and `attempts_remaining`.

Errors: 401; 404 for an unknown ID or another user's request.

### `POST /requests/{id}/comments` (owner or staff)

Request: `{ "body": "...", "is_internal": false }`. Body is 1 to 2000 characters, trimmed.

Response 201: the comment, in the same role-aware shape as request detail.

Errors: 401; 403 if a USER sets `is_internal: true`; 404 for another user's request; 409 `REQUEST_CLOSED`; 422.

Adding a comment increments the request `version` (ADR-013).

### `PATCH /requests/{id}` (AGENT, ADMIN)

```json
{
  "expected_version": 3,
  "assigned_agent_id": "<uuid or null>",
  "priority": "HIGH",
  "category": "NETWORK",
  "status": "IN_PROGRESS",
  "reason": "Affects a whole floor"
}
```

- `expected_version` is required. All other fields are optional, but at least one change is required.
- Omitting `assigned_agent_id` leaves it unchanged, and `null` unassigns.
- `reason` (3 to 300 characters) is required when `priority` or `category` is sent. It is staff-only and is recorded in the event and audit log.
- `status` follows the [state machine](PRODUCT_CONTRACT.md#state-machine). `ANALYZING` cannot be set or left here.
- Moving to `NEEDS_HUMAN_REVIEW` withholds a visible AI reply until it is reviewed (ADR-031).
- An update is all-or-nothing. If nothing actually changes, the response is 200 and `version` does not change.

Response 200: staff request detail.

Errors: 401; 403 for USER; 404; 409 `STALE_UPDATE`, `INVALID_TRANSITION` or `REQUEST_CLOSED`; 422 `VALIDATION_ERROR` or `INVALID_ASSIGNEE`.

### `POST /requests/{id}/analyze` (owner or staff)

Runs one AI analysis. It has no request body, and can take up to about 95 seconds in live mode (2 provider attempts at the 45-second timeout, plus backoff), so clients should show progress. The request must be `NEW`.

Response 200: the same role-aware shape as `GET /requests/{id}`. The status becomes `TRIAGED`, or `NEEDS_HUMAN_REVIEW` if any policy flag applies.

| Status | Code | Meaning |
|---|---|---|
| 401, 404 | `UNAUTHORIZED`, `NOT_FOUND` | Not signed in, or not this user's request |
| 409 | `INVALID_STATE` | The request is not `NEW` |
| 409 | `ANALYSIS_IN_PROGRESS` | Another analysis of this request is running |
| 409 | `ANALYSIS_SUPERSEDED` | This run took so long that a newer call replaced it |
| 429 | `ANALYZE_LIMIT_REACHED` | The request used all `AI_MAX_ANALYZE_ATTEMPTS` (default 3). Staff can still triage it manually |
| 429 | `RATE_LIMITED` | This user reached the hourly limit. See `Retry-After` |
| 503 | See below | The provider failed |

A 503 has this body. The request is back at `NEW`, the run is `FAILED` and no suggestion was saved.

```json
{
  "error": { "code": "ANALYSIS_FAILED", "message": "...", "request_id": "..." },
  "retryable": true,
  "attempts_remaining": 2
}
```

A USER always gets the code `ANALYSIS_FAILED`. Staff get `AI_TIMEOUT`, `AI_RATE_LIMITED`, `AI_UNAVAILABLE`, `AI_INVALID_OUTPUT` or `AI_AUTH` (ADR-028). `AI_AUTH` is never retryable, and `retryable` is false when no attempts remain.

A request found in `ANALYZING` whose run is older than `AI_STALE_RUN_SECONDS` (default 120), or which has no run, is recovered automatically by the next call: the run becomes `FAILED` with `STALE_RUN`, and the analysis proceeds if attempts remain (ADR-026).

### `POST /requests/{id}/review` (AGENT, ADMIN)

Approve or reject the latest `PENDING_REVIEW` suggestion of a `NEEDS_HUMAN_REVIEW` request.

```json
{
  "decision": "APPROVED",
  "published_reply": "Required to approve, not allowed to reject. 1 to 1200 characters",
  "review_reason": "3 to 300 characters",
  "expected_suggestion_id": "<suggestion.id from the staff request detail>",
  "next_status": "TRIAGED",
  "dry_run": false
}
```

**Dry run:** with `"dry_run": true`, the server runs every check a real review runs, including permissions, conflicts and `UNSAFE_REPLY`, and then stops. It returns 200 `{ "valid": true }` or the same error, and saves nothing: no state change, no event, no audit row. A real review always validates again (ADR-039).

`next_status` is `TRIAGED` (default) or `IN_PROGRESS`. `published_reply` is stored separately from `proposed_reply`. Events and audit hold the decision, reason and reviewer, never reply text.

Response 200: staff request detail.

Errors: 401; 403 for USER, or for staff reviewing a request they submitted; 404; 409 `NO_PENDING_SUGGESTION`, `STALE_REVIEW`, `ALREADY_REVIEWED` or `INVALID_STATE`; 422 `VALIDATION_ERROR`, or `UNSAFE_REPLY` if the reply asks for passwords, codes or tokens.

### `POST /requests/{id}/feedback` (owner)

Rate the suggestion the owner can currently see. Allowed once per suggestion.

Request: `{ "helpful": true, "comment": "optional, up to 500 characters" }`. `helpful` must be a JSON boolean.

Response 201: `{ "id", "suggestion_id", "helpful", "comment", "created_at" }`.

Errors: 401; 403 for staff who do not own the request; 404; 409 `NO_VISIBLE_SUGGESTION` or `FEEDBACK_EXISTS`; 422.

### AI fields in `GET /requests/{id}`

USER:

```json
{
  "suggestion_state": "AVAILABLE",
  "suggestion": {
    "id": "...",
    "reply": "...",
    "citations": [{ "id": "...", "title": "..." }],
    "source": "AI",
    "label": "AI-generated suggestion; verify before acting",
    "feedback_submitted": false
  }
}
```

| `review_state` (staff-only) | `suggestion_state` | `suggestion.reply` | `suggestion.source` and `label` |
|---|---|---|---|
| No suggestion | `null` | `suggestion` is `null` | |
| `NOT_REQUIRED` | `AVAILABLE` | The AI reply | `AI`, "AI-generated suggestion; verify before acting" |
| `PENDING_REVIEW` | `AWAITING_STAFF_REVIEW` | `suggestion` is `null` | |
| `APPROVED` | `AVAILABLE` | The staff-approved `published_reply` | `STAFF_REVIEWED`, "Reviewed by the support team" |
| `REJECTED` | `null` | `suggestion` is `null` | |

Citations to articles that are no longer published are omitted for requesters.

Staff get these fields instead:

```json
{
  "attempts_remaining": 2,
  "suggestion": {
    "id": "...", "ai_run_id": "...", "summary": "...",
    "proposed_category": "NETWORK", "proposed_priority": "MEDIUM",
    "proposed_reply": "...", "published_reply": null,
    "confidence": 0.85, "risk_flags": [], "rationale_short": "...",
    "citations": [{ "id": "...", "title": "...", "status": "PUBLISHED" }],
    "review_state": "NOT_REQUIRED",
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

`suggestion` is `null` before a successful analysis. `redacted_input` is not returned to anyone.

Risk flags: `ACCOUNT_COMPROMISE`, `CREDENTIAL_REQUEST`, `PHISHING`, `PRIVACY_SENSITIVE`, `PAYMENT`, `PRIVILEGED_ACCESS`, `ACCOUNT_RECOVERY`, `DEVICE_WIPE`, `DESTRUCTIVE_ACTION`, `PROMPT_INJECTION`, `INVALID_CITATION`, `NO_CITATIONS`, `NO_RELEVANT_KNOWLEDGE`, `LOW_CONFIDENCE`, `MODEL_REQUESTED_REVIEW`, `OUTPUT_ASKS_CREDENTIALS`, `OUTPUT_CLAIMS_ACTION`, `OUTPUT_UNSUPPORTED_CONTACT`, `KB_CONTENT_SUSPECT`.

## Knowledge

Article bodies are raw markdown and **untrusted text**. The backend never interprets them, and clients must render them safely. Snippets are plain text with markup removed. In a search they show the text around the matched terms, with fragments joined by ` … `. When browsing, or when only the title matched, they show the start of the article (ADR-024).

### `GET /knowledge` (any signed-in role)

Returns published articles only, for every role including ADMIN.

| Query | Values |
|---|---|
| `q` | Up to 200 characters. Omit it to browse newest first. A blank value returns an empty list. |
| `category` | Category enum |
| `limit`, `offset` | See conventions |

Search uses PostgreSQL full-text search. Articles containing every term come first, then ones containing any term; within each group, order is by `ts_rank_cd`, then newest update, then ID. A query with no matches returns an empty list, not an error. See ADR-015.

Items: `id, slug, title, category, tags, version, updated_at, snippet` (at most 300 characters).

Errors: 401, 422.

### `GET /knowledge/{id}` (any signed-in role)

Returns `id, slug, title, category, tags, version, updated_at, body_markdown, status`. Unpublished articles are visible to ADMIN only; everyone else gets 404.

Errors: 401, 404.

### `GET /admin/knowledge` (ADMIN)

Lists every status, newest update first. Query: `status`, `category`, `q`, `limit`, `offset`. `q` (up to 200 characters) is a case-insensitive substring match on title and slug, with no ranking. Items are the public summary plus `status` and `updated_by`.

Errors: 401; 403 for USER and AGENT; 422.

### `POST /admin/knowledge` (ADMIN)

```json
{
  "slug": "lowercase-kebab-case",
  "title": "3 to 200 characters",
  "body_markdown": "1 to 50000 characters, stored verbatim",
  "category": "NETWORK",
  "tags": ["up to 20 tags"]
}
```

Response 201: the article as `status: "DRAFT"` and `version: 1`, with `created_at` and `updated_by`.

Errors: 401; 403 for USER and AGENT; 409 `SLUG_CONFLICT`; 422.

### `PATCH /admin/knowledge/{id}` (ADMIN)

Body: any of `title`, `body_markdown`, `category`, `tags`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`). At least one is required, and null values are rejected.

A content change increments `version` and sets `updated_by`. A status-only change does not increment `version`. The ID and slug never change, so citations stay valid. Unpublishing removes an article from search immediately.

Errors: 401; 403 for USER and AGENT; 404; 422.

## Internal interface: KnowledgeRetriever

The AI workflow uses this interface. It is not an HTTP endpoint. Keep it stable.

```python
# app/services/retrieval.py
KnowledgeRetriever(db).search(query: str, top_k: int = 5, min_rank: float | None = None) -> list[RetrievedArticle]

@dataclass(frozen=True)
class RetrievedArticle:
    id: uuid.UUID
    title: str
    category: str
    snippet: str  # plain text around the matched terms, at most 500 characters
    rank: float
    body_markdown: str = ""  # For the mock agent. Live prompts send only the snippet.
```

- Returns published articles only.
- `top_k` is capped at 5, and a value below 1 returns an empty list.
- `min_rank` defaults to `KB_MIN_RANK` (0.5, see ADR-016).
- An empty list means there is no relevant knowledge, so the caller must escalate rather than improvise.
- Snippets are untrusted data. They can contain instruction-like text and must never be treated as instructions.

## Admin

### `GET /admin/audit` (ADMIN)

Paginated, newest first. Query: `action` and `entity_type` (exact matches, up to 100 characters), `limit`, `offset`. Items: `id, actor_id, actor_name, entity_type, entity_id, entity_name, names, action, safe_metadata, occurred_at`. `actor_name` is null when there is no actor, such as a failed sign-in for an unknown email. `entity_name` is the title of the request or article, when there is one. `names` maps user IDs in `safe_metadata`, such as an assignee, to display names. Metadata never contains passwords, tokens or comment bodies.

Audit actions so far: `auth.login_success`, `auth.login_failure`, `auth.logout`, `auth.refresh_reuse_detected`, `request.created`, `request.assigned`, `request.unassigned`, `request.priority_changed`, `request.category_changed`, `request.status_changed`, `request.comment_added`, `request.ai_analysis_started`, `request.ai_analysis_succeeded`, `request.ai_analysis_failed`, `request.review_approved`, `request.review_rejected`, `request.suggestion_withheld`, `request.feedback_added`, `knowledge.created`, `knowledge.updated`, `knowledge.published`, `knowledge.unpublished`, `knowledge.status_changed`.

Errors: 401; 403 for USER and AGENT; 422.

Events and audit rows are append-only. No endpoint updates or deletes them, and database triggers refuse `UPDATE` and `DELETE` (ADR-025). The app's database role has no such privileges either (ADR-047).
