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

## ADR-011: Pure ASGI middleware and dual health paths

- **Context:** Every response needs `X-Request-ID`, including 500s and CORS preflights. Starlette's `Exception` handler runs outside user middleware, so its responses lose CORS headers.
- **Alternatives:** `BaseHTTPMiddleware` with an `Exception` handler.
- **Decision:** The order is request context (outermost), CORS, unhandled-error catcher (innermost). Health endpoints are served at `/healthz` and `/readyz` for infrastructure, and under `/api/v1` for the frontend, because `VITE_API_BASE_URL` includes the prefix.
- **Trade-offs:** Slightly more middleware code, and two paths for each health endpoint.

## ADR-020: Project-local tool caches

- **Context:** The autonomous run may only write inside the project folder.
- **Alternatives:** Default user-level uv and npm caches.
- **Decision:** Host-side `uv` and `npm` runs set `UV_CACHE_DIR` and `npm_config_cache` under the git-ignored `.cache/`. Normal development by the owner does not need this.
- **Trade-offs:** A larger project folder until `.cache/` is deleted.
