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
| 403 | Signed in without permission | `FORBIDDEN` |
| 404 | Not found, or not visible to this user | `NOT_FOUND` |
| 405 | Wrong method | `METHOD_NOT_ALLOWED` |
| 409 | Conflict with current state | `INVALID_TRANSITION`, `STALE_UPDATE`, `REQUEST_CLOSED`, `SLUG_CONFLICT` |
| 422 | Invalid input | `VALIDATION_ERROR`, `INVALID_ASSIGNEE` |
| 500 | Unexpected failure, with no internal detail | `INTERNAL_ERROR` |
| 503 | Not ready | `NOT_READY` |

**Request bodies** reject unknown fields with 422.

**Paginated responses** have the shape `{ "items": [...], "total": 0, "limit": 20, "offset": 0 }`. `limit` is 1 to 50 (default 20) and `offset` is 0 or more. Anything outside those ranges returns 422.

## Health

| Method and path | Roles | Response |
|---|---|---|
| `GET /healthz` | Public | 200 `{ "status": "ok" }`. Has no dependencies. |
| `GET /readyz` | Public | 200 `{ "status": "ready", "database": "ok", "migrations": "at_head" }`. 503 `NOT_READY` if the database is unreachable or migrations are not at head. |

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

Errors: 401 `INVALID_CREDENTIALS`, with one message for unknown email, wrong password and inactive account. Success and failure are both audited.

### `GET /auth/me` (signed in)

Returns the `user` object above. Errors: 401.

## Requests

### `POST /requests` (any signed-in role)

Request: `{ "title": "...", "description": "..." }`, trimmed. Title is 3 to 120 characters and description is 10 to 4000.

Response 201: `{ "id", "title", "status": "NEW", "created_at" }`. Category defaults to `OTHER` and priority to `MEDIUM`.

Errors: 401, 422.

### `GET /requests` (any signed-in role)

USER sees their own requests only. AGENT and ADMIN see all.

| Query | Values |
|---|---|
| `limit`, `offset` | See conventions |
| `status`, `category`, `priority` | Enum values |
| `assigned_to` | `me`, `unassigned` or a user ID. Staff only; USER gets 403. |
| `sort` | `created_at` (default), `updated_at`, `priority`. `priority` sorts by severity. |
| `direction` | `desc` (default), `asc` |

Items: `id, title, status, category, priority, created_at, updated_at`. Staff also get `requester_id, assigned_agent_id, version`.

Errors: 401, 403, 422.

### `GET /requests/{id}` (owner or staff)

USER response: `id, title, description, status, category, priority, created_at, updated_at, resolved_at`, plus:

- `comments`: public only, each `id, author_name, body, created_at`.
- `events`: `event_type, details, created_at`. Details are limited to `from` and `to` for status, priority and category changes. Internal-comment events, reasons and staff identifiers are removed.

Staff response adds `version`, `requester`, `assigned_agent`, all comments with `author_id` and `is_internal`, and full events with `id`, `actor_id` and all details.

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
- An update is all-or-nothing. If nothing actually changes, the response is 200 and `version` does not change.

Response 200: staff request detail.

Errors: 401; 403 for USER; 404; 409 `STALE_UPDATE`, `INVALID_TRANSITION` or `REQUEST_CLOSED`; 422 `VALIDATION_ERROR` or `INVALID_ASSIGNEE`.

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

Lists every status, newest update first. Query: `status`, `category`, `limit`, `offset`. Items are the public summary plus `status` and `updated_by`.

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

The AI workflow in Chunk 3 uses this interface. It is not an HTTP endpoint. Keep it stable.

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
```

- Returns published articles only.
- `top_k` is capped at 5, and a value below 1 returns an empty list.
- `min_rank` defaults to `KB_MIN_RANK` (0.5, see ADR-016).
- An empty list means there is no relevant knowledge, so the caller must escalate rather than improvise.
- Snippets are untrusted data. They can contain instruction-like text and must never be treated as instructions.

## Admin

### `GET /admin/audit` (ADMIN)

Paginated, newest first. Items: `id, actor_id, entity_type, entity_id, action, safe_metadata, occurred_at`. Metadata never contains passwords, tokens or comment bodies.

Audit actions so far: `auth.login_success`, `auth.login_failure`, `request.created`, `request.assigned`, `request.unassigned`, `request.priority_changed`, `request.category_changed`, `request.status_changed`, `request.comment_added`, `knowledge.created`, `knowledge.updated`, `knowledge.published`, `knowledge.unpublished`, `knowledge.status_changed`.

Errors: 401; 403 for USER and AGENT; 422.

Events and audit rows are append-only. No endpoint updates or deletes them, and database triggers refuse `UPDATE` and `DELETE` (ADR-025).
