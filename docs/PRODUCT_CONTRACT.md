# Product contract

## Category taxonomy

`ACCOUNT_ACCESS`, `SOFTWARE`, `HARDWARE`, `NETWORK`, `OTHER`. The default is `OTHER`.

## Priorities

`LOW`, `MEDIUM`, `HIGH`, `URGENT`. The default is `MEDIUM`.

## Request statuses

`NEW`, `ANALYZING`, `TRIAGED`, `NEEDS_HUMAN_REVIEW`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.

### State machine

```text
NEW --analyze--> ANALYZING --safe valid output--> TRIAGED
                        |--risky/low confidence--> NEEDS_HUMAN_REVIEW
                        '--failure-------------> NEW (retry or manual triage)
TRIAGED ----------------------> IN_PROGRESS --> RESOLVED --> CLOSED
NEEDS_HUMAN_REVIEW --review--> TRIAGED or IN_PROGRESS
Any non-closed staff-owned request can be escalated to NEEDS_HUMAN_REVIEW.
```

Staff transitions through `PATCH /requests/{id}`:

| From | Allowed targets |
|---|---|
| NEW | TRIAGED (manual triage), NEEDS_HUMAN_REVIEW |
| TRIAGED | IN_PROGRESS, NEEDS_HUMAN_REVIEW |
| NEEDS_HUMAN_REVIEW | TRIAGED, IN_PROGRESS |
| IN_PROGRESS | RESOLVED, NEEDS_HUMAN_REVIEW |
| RESOLVED | CLOSED, NEEDS_HUMAN_REVIEW |
| ANALYZING | none (owned by the AI service) |
| CLOSED | none (terminal) |

`ANALYZING` is reserved for the AI service. PATCH cannot set it or leave it. The decision is recorded in ADR-012.

## Suggestion review states

`NOT_REQUIRED`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`. Review state is separate from request status. Requesters see only a generic escalation banner until an approved message exists, and rejected suggestions never reach them.

## Knowledge article statuses

`DRAFT`, `PUBLISHED`, `ARCHIVED`. Only `PUBLISHED` articles can be searched or cited.

## Permission matrix

"Own" means the signed-in user is the requester. A USER requesting a record they do not own gets 404, not 403, to prevent ID enumeration.

| Endpoint | Public | USER | AGENT | ADMIN |
|---|---|---|---|---|
| `GET /healthz`, `GET /readyz` | yes | yes | yes | yes |
| `POST /auth/login` | yes | yes | yes | yes |
| `GET /auth/me` | 401 | yes | yes | yes |
| `POST /requests` | 401 | yes | yes | yes |
| `GET /requests` | 401 | own | all | all |
| `GET /requests?assigned_to=` | 401 | 403 | yes | yes |
| `GET /requests/{id}` | 401 | own, else 404 | all | all |
| `POST /requests/{id}/comments` (public) | 401 | own, else 404 | all | all |
| `POST /requests/{id}/comments` (internal) | 401 | 403 | all | all |
| `PATCH /requests/{id}` | 401 | 403 | all | all |
| `POST /requests/{id}/analyze` (planned) | 401 | own | all | all |
| `POST /requests/{id}/review` (planned) | 401 | 403 | all | all |
| `POST /requests/{id}/feedback` (planned) | 401 | own | 403 | 403 |
| `GET /knowledge` | 401 | published | published | published |
| `GET /knowledge/{id}` | 401 | published, else 404 | published, else 404 | all statuses |
| `GET /admin/knowledge` | 401 | 403 | 403 | yes |
| `POST /admin/knowledge`, `PATCH /admin/knowledge/{id}` | 401 | 403 | 403 | yes |
| `GET /admin/audit` | 401 | 403 | 403 | yes |

## Demo personas

All are fictional and use `@demo.iknowservice.test` addresses with one intentionally public demo password.

| Persona | Role | Email | Story |
|---|---|---|---|
| Riley Morgan | USER | `riley.morgan@demo.iknowservice.test` | Student with everyday Wi-Fi and software problems |
| Sam Patel | USER | `sam.patel@demo.iknowservice.test` | Staff member who reports a suspected account compromise |
| Alex Chen | AGENT | `alex.chen@demo.iknowservice.test` | Support agent who works the queue |
| Jordan Reyes | ADMIN | `jordan.reyes@demo.iknowservice.test` | Help desk lead who owns the knowledge base and audit log |

## User stories

1. **Sign in.** As any demo user, I sign in with email and password so I can reach my workspace.
   - Wrong password, unknown email and inactive account all show the same message.
   - The token lives in memory only, so reloading requires signing in again.
2. **Submit a request.** As a requester, I describe an issue so support can act on it.
   - Title is 3 to 120 characters and description is 10 to 4000 after trimming; otherwise 422.
   - The response is 201 with status `NEW`, category `OTHER` and priority `MEDIUM`.
3. **See only my requests.** As a requester, I list and open only my own requests.
   - The list contains only my records.
   - Another user's request ID returns 404.
4. **Follow progress.** As a requester, I see a timeline and public comments.
   - Internal comments and their timeline events never appear in my responses.
   - Staff-only reasons and identifiers are absent from my timeline.
5. **Work the queue.** As an agent, I filter and sort all requests.
   - Filters: status, category, priority, `assigned_to=me|unassigned|<uuid>`.
   - An invalid sort returns 422 and `limit` above 50 returns 422.
6. **Triage a request.** As an agent, I assign it and change its priority or category with a reason.
   - A priority or category change without a 3 to 300 character reason returns 422.
   - The assignee must be an active AGENT or ADMIN.
   - Old value, new value and reason are recorded in the audit log.
7. **Advance a request.** As an agent, I move it through the state machine.
   - Illegal transitions return 409 and `ANALYZING` cannot be set by hand.
   - A stale `expected_version` returns 409 `STALE_UPDATE`.
   - `CLOSED` is terminal: PATCH and new comments return 409.
8. **Search knowledge.** As any signed-in user, I search published articles.
   - Drafts and archived articles never appear.
   - No match returns an empty list, not an error.
   - Article content renders as inert text.
9. **Maintain knowledge.** As an admin, I create, edit, publish and unpublish articles.
   - Edits increment the version and keep the same ID, so citations stay stable.
   - A duplicate slug returns 409, and USER or AGENT gets 403.
10. **Audit activity.** As an admin, I page through audit records.
    - Records identify actor, entity, action and time.
    - Records contain no passwords, tokens or comment bodies, and USER or AGENT gets 403.
