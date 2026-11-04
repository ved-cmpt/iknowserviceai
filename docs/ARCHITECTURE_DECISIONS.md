# Architecture decisions

Each entry records context, alternatives, the decision and its trade-offs. ADR-001 to ADR-004 come from the blueprint.

## ADR-000: Documentation file mapping

- **Context:** The blueprint names `docs/PROGRESS.md`, `docs/HANDOFF.md` and `docs/ADR.md`. The chunk prompt specifies a different set of persistent docs.
- **Alternatives:** Keep the blueprint names, or maintain both sets.
- **Decision:** `PROGRESS.md` maps to `IMPLEMENTATION_STATUS.md`, `HANDOFF.md` maps to `NEXT_AGENT_PROMPT.md` and `ADR.md` maps to `ARCHITECTURE_DECISIONS.md`.
- **Trade-offs:** Blueprint references need translating, but there is one set of docs to keep accurate.

## ADR-001: Modular monolith

- **Context:** The resume concept mentions microservices, but v1 needs a complete system.
- **Alternatives:** Deployed microservices.
- **Decision:** One backend service with clear module boundaries.
- **Trade-offs:** Less integration complexity. The project must not advertise microservices.

## ADR-002: PostgreSQL full-text search first

- **Context:** The knowledge base is small and curated.
- **Alternatives:** Embeddings and a vector store.
- **Decision:** PostgreSQL FTS with a GIN index. Vectors only if measured quality justifies them.
- **Trade-offs:** Transparent, local and testable, but no semantic matching.

## ADR-003: Explicit analysis trigger

- **Context:** Requests must survive AI outages.
- **Alternatives:** Analyze during creation, or use a background queue.
- **Decision:** Request creation and analysis are separate HTTP calls.
- **Trade-offs:** The client makes two calls, and gets a retry path with no queue.

## ADR-004: Stateless application-managed conversation

- **Context:** Privacy and bounded behavior.
- **Alternatives:** Provider-side conversation state.
- **Decision:** Each analysis is a single bounded workflow containing only the current request and retrieved excerpts. Prefer `store=false` when supported; verify at implementation time.
- **Trade-offs:** No conversational memory, which v1 does not need.

## ADR-005: Development-only container choices

- **Context:** Phase 1 needs a reproducible local stack on Windows.
- **Alternatives:** Production-style images now.
- **Decision:** Dockerfiles target development: dev dependencies installed, `uvicorn --reload`, the Vite dev server, source bind mounts and polling. Both containers run as non-root users and contain no secrets. Production images come with Phase 10.
- **Trade-offs:** The images are larger than production images and must not be deployed as they are.

## ADR-006: VARCHAR with CHECK constraints instead of native PostgreSQL enums

- **Context:** Roles, categories, priorities and statuses need database enforcement and will evolve.
- **Alternatives:** Native PostgreSQL enums.
- **Decision:** `VARCHAR` columns with `CHECK` constraints. Python `StrEnum`s in `app/db/models/enums.py` are the single source of truth.
- **Trade-offs:** Changing a value is an ordinary constraint swap instead of an awkward `ALTER TYPE`. The enum type does not show up in database tooling.

## ADR-007: Foreign key deletion policy

- **Context:** The blueprint asks for intentional delete behavior.
- **Alternatives:** Cascade everywhere, or restrict everywhere.
- **Decision:** References to `users` use `RESTRICT`, so history cannot lose its author; deactivate users with `active=false`. Records meaningless without their parent use `CASCADE`: a request's comments, events, AI runs, suggestions and feedback. `audit_logs.entity_id` has no foreign key, because audit history must outlive its entity.
- **Trade-offs:** Users cannot be hard-deleted once they have history, which suits an auditable system.

## ADR-008: Test isolation through rolled-back transactions

- **Context:** Tests need real PostgreSQL behavior and speed, while service code commits.
- **Alternatives:** Truncate between tests, or recreate the database per test.
- **Decision:** Migrate once per session, then run each test in an outer transaction that always rolls back, with `join_transaction_mode="create_savepoint"`. `conftest.py` refuses a test database whose name lacks `test`.
- **Trade-offs:** Fast and isolated, but real multi-connection races cannot be simulated this way. Tests that need them must open their own connections and clean up after themselves, as `tests/test_concurrency.py` does.

## ADR-009: Access token held in memory only

- **Context:** The blueprint forbids tokens in browser storage for v1.
- **Alternatives:** `localStorage`, or refresh tokens in `HttpOnly` cookies.
- **Decision:** The access token lives in a JavaScript module variable. Reloading requires signing in again.
- **Trade-offs:** Reduced XSS token theft exposure and no refresh machinery, at the cost of an intentional demo-grade inconvenience.

## ADR-010: `clock_timestamp()` for timestamp defaults

- **Context:** `now()` returns the transaction start time, so several events written in one transaction would tie, and rows in a rolled-back test transaction would never differ.
- **Alternatives:** `now()` with a sequence column for ordering.
- **Decision:** Timestamp defaults and `updated_at` use `clock_timestamp()`.
- **Trade-offs:** Timestamps within one transaction differ slightly, which is accurate.

## ADR-011: Pure ASGI middleware and dual health paths

- **Context:** Every response needs `X-Request-ID`, including 500s and CORS preflights. Starlette's `Exception` handler runs outside user middleware, so its responses lose CORS headers.
- **Alternatives:** `BaseHTTPMiddleware` with an `Exception` handler.
- **Decision:** The order is request context (outermost), CORS, unhandled-error catcher (innermost). Health endpoints are served at `/healthz` and `/readyz` for infrastructure, and under `/api/v1` for the frontend, because `VITE_API_BASE_URL` includes the prefix.
- **Trade-offs:** Slightly more middleware code, and two paths for each health endpoint.

## ADR-012: Interpreting the state machine for manual staff actions

- **Context:** Blueprint section 4.3 leaves some details open: "manual triage" from `NEW`, what "staff-owned" means for escalation, and whether resolved requests can reopen.
- **Alternatives:** Allow free staff transitions, or require an assignee before escalating.
- **Decision:** `NEW` can go to `TRIAGED` (the manual triage path) or `NEEDS_HUMAN_REVIEW`. Any staff member can escalate any non-closed, non-analyzing request; assignment is not required, because blocking an escalation is the riskier failure. `RESOLVED` can only reopen by escalating, which clears `resolved_at`. `CLOSED` is terminal, so every PATCH to it returns 409 `REQUEST_CLOSED`, including assignment. Same-status updates are illegal. `ANALYZING` can only be left by the AI service, so a seeded `ANALYZING` request stays there until Chunk 3 builds that service.
- **Trade-offs:** No direct `NEW` to `IN_PROGRESS`, so staff take two steps.

## ADR-013: Comments increment the request version

- **Context:** The spec says to increment `version` on every change. Comments do not edit the request row itself.
- **Alternatives:** Only bump for PATCH.
- **Decision:** A comment takes the row lock and bumps `version`, so staff acting on an outdated view get `STALE_UPDATE` and see the new comment first. The lock also prevents a comment racing a close.
- **Trade-offs:** A requester's comment can force an agent to reload before an update.

## ADR-014: Requester-visible timeline uses an allowlist

- **Context:** Requesters see their timeline, but events can hold staff identifiers, reasons and internal-comment references.
- **Alternatives:** Strip known sensitive keys, or hide the timeline.
- **Decision:** `REQUESTER_EVENT_DETAILS` in `services/requests.py` lists the event types and detail keys requesters may see. Unknown types are hidden, internal-comment events are dropped and actors are omitted. Requester schemas are separate classes, not subsets of staff schemas.
- **Trade-offs:** Every new event type must be added deliberately before requesters can see it.

## ADR-020: Project-local tool caches

- **Context:** The autonomous run may only write inside the project folder.
- **Alternatives:** Default user-level uv and npm caches.
- **Decision:** Host-side `uv` and `npm` runs set `UV_CACHE_DIR` and `npm_config_cache` under the git-ignored `.cache/`. Normal development by the owner does not need this.
- **Trade-offs:** A larger project folder until `.cache/` is deleted.
