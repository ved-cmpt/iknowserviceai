# Project context

## Problem

Small organizations and campus help desks receive repetitive IT requests in free text with inconsistent detail and urgency. Staff interpret them by hand, look up documentation, set priorities and draft replies. That is slow and inconsistent, and it is hard to audit. Generative AI could help, but uncontrolled AI can expose private data, invent procedures or take unsafe actions.

## Solution

IknowServiceAI is a portfolio-grade, AI-assisted IT service-request platform. A bounded backend workflow (mock or Gemini) classifies a request, retrieves published knowledge articles with PostgreSQL full-text search and drafts a cited suggestion. A deterministic policy engine forces human review for risky cases. It is a bounded workflow, not a free-roaming bot.

## Users and roles

| Role | Can do |
|---|---|
| USER (requester) | Create requests, see only their own, read safe or approved suggestions, comment, give feedback |
| AGENT (support staff) | Work the whole queue: triage, assign, internal notes, review suggestions, advance status |
| ADMIN | Everything AGENT can do, plus manage the knowledge base and read audit history |

All accounts are fictional demo accounts and all data is synthetic.

## v1 scope

Authentication and roles, request lifecycle, AI triage, knowledge search, grounded suggestions with citations, human-in-the-loop review, operator UI, engineering hygiene (Docker, migrations, tests, CI) and a hosted demo. See blueprint section 2.1.

## Non-goals for v1

Real ServiceNow, Jira, email, Slack or password-reset integrations. Model tool execution. Fine-tuning, multi-agent systems, vector databases, queues, streaming, file uploads, billing, multi-tenancy. Compliance claims. See blueprint section 2.2.

## Invariants (blueprint section 2.4)

- The frontend is JavaScript, not TypeScript, unless the owner approves a change.
- The backend is Python and FastAPI, storage is PostgreSQL, live AI is Gemini, local development uses Docker, backend tests use pytest.
- Default AI behavior is deterministic mock mode.
- The browser never calls Gemini or receives its key.
- AI never writes to the database directly; services validate and persist outputs.
- Retrieved documents and user text are never treated as system instructions.
- Build a coherent v1 before optional features.

## Architecture

A modular monolith (ADR-001).

```text
[React + Vite SPA, JavaScript]
   | JSON over HTTP, bearer access token held in memory
   v
[FastAPI: /api/v1]
   |-- Auth and role authorization
   |-- Request workflow and state machine
   |-- Knowledge base and retriever ---> [PostgreSQL full-text search]
   |-- Audit and event writers
   |-- Policy engine and AI orchestration (not built yet, Chunk 3)
   '-- SQLAlchemy models, Alembic migrations ---> [PostgreSQL 17]
```

## Tech stack

React, Vite, React Router, Vitest, Testing Library. Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, psycopg 3, Alembic, argon2-cffi, PyJWT, pytest, ruff, uv. PostgreSQL 17. Docker Compose.

## Owner environment

Windows 11, project at `C:\Users\User\Desktop\iknowserviceai` (not OneDrive-synced), PowerShell, Git 2.55, Node 24.18, npm 11.16, Python 3.12.10, uv 0.13.7, Docker Desktop 29.6 with Compose v5.3 on WSL2. No GitHub remote yet; the owner connects GitHub in a later chunk.

## Related documents

- [Implementation blueprint](IMPLEMENTATION_BLUEPRINT.md): the build specification. It is not evidence that anything exists.
- [Implementation status](IMPLEMENTATION_STATUS.md): what is actually done, with evidence.
- [Architecture decisions](ARCHITECTURE_DECISIONS.md): ADR log.
- [Product contract](PRODUCT_CONTRACT.md): taxonomy, state machine, permissions, personas, user stories.
- [API reference](API.md): implemented endpoints.
- [Next agent prompt](NEXT_AGENT_PROMPT.md): the handoff for the next chunk.
