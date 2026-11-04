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
