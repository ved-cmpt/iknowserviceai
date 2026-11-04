# Architecture

How the system fits together. Why it is built this way is in [the decision log](ARCHITECTURE_DECISIONS.md), and the code is the final word.

## Components

| Part | Where | What it does |
|---|---|---|
| Web app | `frontend/src/` | React and plain CSS. Requester, staff and admin screens. The server decides every permission, and the browser never calls the AI provider |
| API | `backend/app/routers/` | FastAPI routes under `/api/v1`, with explicit schemas for each role |
| Services | `backend/app/services/` | The state machine, policy gate, review, redaction, retrieval and demo safeguards. All decisions are made here |
| Provider adapter | `backend/app/services/ai/` | A mock agent and a Gemini adapter behind one interface, plus the orchestrator |
| Database | PostgreSQL | Migrated by Alembic as the owner. The app connects as `app_user` |
| Production image | `deploy/Dockerfile` | One non-root container serving the built frontend and the API on one origin |
| Browser tests | `e2e/` | Playwright with axe, run in Docker against both stacks |

## Request lifecycle

All rules are in [`state_machine.py`](../backend/app/services/state_machine.py). Only the AI service may enter or leave `ANALYZING`.

```mermaid
stateDiagram-v2
    [*] --> NEW: requester submits
    NEW --> ANALYZING: AI service
    ANALYZING --> TRIAGED: AI service, nothing held
    ANALYZING --> NEEDS_HUMAN_REVIEW: AI service, policy flags
    ANALYZING --> NEW: AI service, failure
    NEW --> TRIAGED: staff triage by hand
    NEW --> NEEDS_HUMAN_REVIEW: staff
    TRIAGED --> IN_PROGRESS: staff
    TRIAGED --> NEEDS_HUMAN_REVIEW: staff escalate
    NEEDS_HUMAN_REVIEW --> TRIAGED: staff
    NEEDS_HUMAN_REVIEW --> IN_PROGRESS: staff
    IN_PROGRESS --> RESOLVED: staff
    IN_PROGRESS --> NEEDS_HUMAN_REVIEW: staff escalate
    RESOLVED --> CLOSED: staff
    RESOLVED --> NEEDS_HUMAN_REVIEW: staff reopen
    CLOSED --> [*]
```

## AI workflow

The analysis has two short transactions, with no lock held during the provider call (ADR-026).

```mermaid
sequenceDiagram
    actor R as Requester
    participant A as API and orchestrator
    participant DB as PostgreSQL
    participant P as Provider
    R->>A: POST /requests/{id}/analyze
    A->>DB: Lock, set ANALYZING, record a run, commit
    A->>A: Redact title and description
    A->>DB: Search published articles
    A->>P: Fixed instructions, delimited untrusted text, excerpts
    P-->>A: Structured result, untrusted
    A->>A: Validate schema, strip markup, check citations
    A->>A: Policy gate: scan request, reply and sources
    A->>DB: Lock, confirm this run is still active, save, commit
    alt Nothing flagged
        A-->>R: Suggestion, labeled as AI, with sources
    else Any flag
        A-->>R: Awaiting staff review, with no AI text
    end
```

If the provider fails, the request returns to `NEW`, and the requester can retry within the attempt limit, or staff can triage it by hand. A late result from a replaced run is refused.

## Data model

Simplified. `demo_state` is a separate one-row table that holds the reset switch. `audit_logs.entity_id` has no foreign key, because history must outlive what it describes.

```mermaid
erDiagram
    users ||--o{ service_requests : submits
    users ||--o{ refresh_tokens : holds
    users ||--o{ request_comments : writes
    service_requests ||--o{ request_comments : has
    service_requests ||--o{ request_events : has
    service_requests ||--o{ ai_runs : has
    service_requests ||--o{ ai_suggestions : has
    ai_runs ||--o| ai_suggestions : produces
    ai_suggestions ||--o{ request_feedback : receives
    users ||--o{ audit_logs : acts
    users ||--o{ knowledge_articles : edits

    users {
        uuid id PK
        string email
        string role
        bool active }
    service_requests {
        uuid id PK
        uuid requester_id FK
        uuid assigned_agent_id FK
        string status
        string category
        string priority
        int version }
    ai_runs {
        uuid id PK
        uuid request_id FK
        string mode
        string status
        string redacted_input
        string prompt_version }
    ai_suggestions {
        uuid id PK
        uuid ai_run_id FK
        string proposed_reply
        string published_reply
        float confidence
        string review_state }
    request_events {
        uuid id PK
        uuid request_id FK
        string event_type }
    audit_logs {
        uuid id PK
        uuid actor_id FK
        string action
        json safe_metadata }
    knowledge_articles {
        uuid id PK
        string slug
        string status
        int version }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        string token_hash
        uuid family_id }
```

`request_events` and `audit_logs` are append-only, by grants and by triggers (ADR-025, ADR-047).

## Deployment topology

```mermaid
flowchart LR
    B[Browser] -->|HTTPS| P[Render proxy]
    P --> W["Render web service, free plan, Oregon<br/>one process, 512 MB"]
    W -->|"app_user, direct endpoint, TLS"| N[("Neon PostgreSQL, us-west-2")]
    O[Owner's workstation] -->|"Owner role: migrate, seed, reset"| N
    G[GitHub main] -->|Auto-deploy| W
```

The service sleeps when idle, and so does the database. Neither is a problem by design: health checks use `/healthz`, which has no dependencies, the connection pool replaces dead connections, and the demo resets itself on the first API request after the interval (ADR-051 to ADR-053). See [the deployment guide](DEPLOYMENT.md).
