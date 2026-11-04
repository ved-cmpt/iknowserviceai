# Autopilot run 01 report

**Result: Chunk 1 and Chunk 2 are complete. All five checkpoints passed their checks, and the full suite passed from a clean state.** Nothing is deployed or pushed. The Docker stack is running with fresh demo data.

## 1. Repo state found at start

The folder held only `docs/IMPLEMENTATION_BLUEPRINT.md`, `docs/prompts/AUTOPILOT_RUN_01.md` and `docs/prompts/CHUNK_01_FOUNDATION.md`. There was no git repository and no containers. Ports 5432, 8000 and 5173 were free. Git, Docker, Node, Python and uv all worked, and the Docker engine was up throughout the run.

## 2. Completed and verified functionality

**Checkpoint 1: repository and docs**
- Git repo on `main`, `.gitignore`, `.gitattributes`, `.env.example`, a local `.env` with a random secret, and all persistent docs.
- Proof: `git ls-files` shows only `.env.example`; the JWT secret has no matches in history; no tracked file has CRLF.

**Checkpoint 2: scaffolding, Docker, health**
- Three services start healthy. Both containers run as non-root users.
- `/healthz` and `/readyz`, at the root and under `/api/v1`. Error envelope on 404, 405, 422 and 500. `X-Request-ID` on every response. JWT secret checks fail fast at startup.
- Proof: `docker compose up --build -d --wait`; `/readyz` returned 503 before migrating and 200 after; `tests/test_health.py` (16 tests).

**Checkpoint 3: schema, auth, roles, seed**
- All 9 tables, with constraints and indexes. Argon2id with rehash on login. JWT with the role loaded from the database on every request.
- Seed: 4 users, 12 published articles plus 1 draft, 9 requests across all 7 statuses. Guarded reset.
- Login page, dashboard, protected routes and not-found page, with the token in memory only.
- Proof:
  - `alembic upgrade head` twice and `alembic check`; `tests/test_migrations.py` runs downgrade and upgrade.
  - `seed_demo` twice gave the same counts.
  - `reset_demo` refused without `--yes`, with `ALLOW_DEMO_RESET=false`, and in production.
  - Seeded data survived `docker compose down` and `up -d`.
  - All four accounts signed in through the API and through the real UI in headless Edge, each with the correct role and request count.

**Checkpoint 4: request lifecycle (API)**
- Create, list (filters, sort whitelist, pagination), role-aware detail, comments and staff PATCH.
- State machine in `services/state_machine.py`, `version` column in new revision `0002`, `SELECT ... FOR UPDATE`, events and audit for every action, with no comment bodies in audit.
- Proof: `tests/test_requests_lifecycle.py` (133 tests), covering every one of the 49 status pairs. `tests/test_concurrency.py` races two real connections over 5 rounds and got exactly one winner each time.

**Checkpoint 5: knowledge base and retrieval**
- Public search and detail, admin list, create and edit, `KnowledgeRetriever`, plain-text snippets, `/knowledge` and `/knowledge/:id` screens.
- Proof: `tests/test_knowledge.py` (114 tests) and `src/tests/knowledge.test.jsx` (13 tests). The browser check confirmed that a `wifi` search finds the network article first, the no-match state appears, and the seeded draft's `<script>` is shown as text, is not in the DOM as an element and does not run.

## 3. Files and directories created or changed

| Area | Contents |
|---|---|
| Root | `README.md`, `AGENTS.md`, `compose.yaml`, `.env.example`, `.gitignore`, `.gitattributes` |
| `docs/` | `PROJECT_CONTEXT.md`, `PRODUCT_CONTRACT.md`, `ARCHITECTURE_DECISIONS.md`, `IMPLEMENTATION_STATUS.md`, `NEXT_AGENT_PROMPT.md`, `API.md`, `RUN_REPORTS/RUN_01.md` |
| `db/init/` | Test database creation script |
| `backend/` | `Dockerfile`, `pyproject.toml`, `uv.lock`, `alembic.ini`, migrations `0001` and `0002` |
| `backend/app/` | `core/`, `db/models/`, `schemas/`, `routers/`, `services/`, `scripts/` |
| `backend/tests/` | 8 test modules and `conftest.py` |
| `frontend/` | `Dockerfile`, `package.json`, `package-lock.json`, Vite and ESLint config, `.nvmrc` |
| `frontend/src/` | `api/`, `auth/`, `components/`, `knowledge/`, `pages/`, `tests/` |
| Untracked, left in place | `.env`, `frontend/node_modules/`, tool caches in `backend/` (all git-ignored) |

Nothing outside the project folder was changed on purpose, apart from Docker's own images and volumes for this project, and ordinary temp files from tools.

## 4. Commands run, exit codes and test counts

Final clean-state run:

| Command | Exit | Result |
|---|---|---|
| `docker compose down -v` | 0 | Removed |
| `docker compose up --build -d --wait` | 0 | db and backend healthy, frontend up |
| `GET /readyz` before migrating | | 503, as intended |
| `docker compose exec -T backend alembic upgrade head` | 0 | `-> 0001`, `0001 -> 0002` |
| Same again | 0 | No-op |
| `docker compose exec -T backend alembic check` | 0 | `No new upgrade operations detected.` |
| `docker compose exec -T backend python -m app.scripts.seed_demo` (twice) | 0, 0 | `Seed complete: 4 users, 13 articles, 9 requests.` both times |
| `GET /healthz`, `/readyz`, `/api/v1/healthz`, `/api/v1/readyz`, `:5173/` | | All 200 |
| `docker compose exec -T backend pytest -q` | 0 | **309 passed, 0 failed, 0 skipped**, 1 warning |
| `docker compose exec -T backend ruff check .` | 0 | `All checks passed!` |
| `docker compose exec -T backend ruff format --check .` | 0 | `57 files already formatted` |
| `docker compose exec -T frontend npm run lint` | 0 | Clean |
| `docker compose exec -T frontend npm test -- --run` | 0 | **31 passed**, 4 files |
| `docker compose exec -T frontend npm run build` | 0 | Built |
| `npm --prefix frontend run lint`, `test -- --run`, `build` (host) | 0, 0, 0 | Clean, 31 passed, built |
| `docker compose down`, then `up -d --wait` | 0, 0 | Data persisted; `/readyz` 200 |
| Headless Edge journey | 0 | 20 checks passed, no browser console errors |

Backend tests per file: auth 22, concurrency 1, health 16, knowledge 114, migrations 3, lifecycle 133, requests read 8, seed 12.

API account check:

```text
riley.morgan role=USER requests=5 audit=403
sam.patel role=USER requests=4 audit=403
alex.chen role=AGENT requests=9 audit=403
jordan.reyes role=ADMIN requests=9 audit=200
```

The only warning is `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated`.

## 5. Unverified or blocked

Nothing is blocked. These were not verified:

- **Rerunning the browser check.** It was a one-off script that has been deleted (ADR-023). Phase 8 adds a committed end-to-end suite. Component tests cover the same screens and do remain.
- **Mobile layout and keyboard use** were not checked in a browser. Phase 7 covers them.
- **Commands without `-T`.** I ran `docker compose exec -T` because this session has no terminal. The README omits `-T` for interactive use, and that exact form was not run.
- **The README's PowerShell step that writes `.env` was tested on a scratch copy**, and it produced a valid file. The bash version was tested in Git Bash with output piped, not written.
- **A fresh `git clone` was not built.** The clean-state run used the working tree, which matched `HEAD` apart from these final docs. I confirmed that the lockfiles, migrations and init script are tracked.

## 6. Deviations from the blueprint

| ADR | Deviation |
|---|---|
| ADR-000 | Docs use the chunk prompt's names rather than `PROGRESS.md`, `HANDOFF.md` and `ADR.md` |
| ADR-015 | Search matches any term and ranks all-term matches first. Pure AND search found nothing for natural-language requests. This extends the run prompt's search instruction |
| ADR-019 | `GET /knowledge` without `q` browses; a blank `q` returns an empty list |
| ADR-021 | Three nullable columns and the failed-login audit content |
| ADR-022 | The single seeded draft is also the hostile-content fixture |
| ADR-023 | Browser verification was a one-off script, not a committed suite |

GitHub setup from Phase 0 was deferred, as the chunk prompt instructs. All decisions are in `docs/ARCHITECTURE_DECISIONS.md`.

## 7. Known bugs and limitations

No known bugs. Bugs found and fixed during the run:

- Whitespace-only titles were accepted, because of pydantic constraint ordering. A test caught it, and login bounds had the same fault.
- Startup errors could print setting values, which might include secrets.
- The first relevance floor (0.05) filtered nothing, as measuring ranks showed. It is now 0.5 (ADR-016).
- After an explicit sign-out, the next user landed on the previous user's page.
- The password hint polluted the password field's accessible name.
- The README's bash setup command silently produced a blank secret where `python3` is missing.

Limitations:

- **Requests have no screens yet.** Creating, commenting and updating work only through the API at `/docs`. The dashboard is a read-only list.
- **No rate limiting**, including on login. This is scheduled for Phase 6, and it matters before any public deployment.
- **The seeded `ANALYZING` request is stuck** until Chunk 3, by design. PATCH cannot move it.
- **Audit and events are append-only at the API level only.** Direct SQL could still change them.
- **The relevance floor is tuned on just 12 articles.** Broad words such as "support" still clear it for most articles.
- **Snippets are leading text**, so they may not show the matched words.
- **The demo password is shown on the login page** while `VITE_SHOW_DEMO_HINT=true`. This is intentional for a demo, and should be reviewed before deployment.
- Base images use floating tags, and the images are development-only (ADR-005).

## 8. Commits

Run `git log --oneline` for the final list.

```text
0f641fb feat: phase 4 knowledge base admin, full-text search and retriever
b1ebd39 feat: phase 3 request lifecycle api, state machine, events and audit
14016c4 feat: phase 2 schema, migrations, auth, roles, seed
481f2c1 feat: phase 1 scaffolding, docker compose, health checks
7e02987 chore: phase 0 repository and project documentation
```

The final commit, `docs: autopilot run 01 report and handoff`, adds this report.

## 9. Owner actions needed

None are required to try the app. Docker Desktop must stay running.

If the stack is stopped, restart it in PowerShell from the project root:

```powershell
cd C:\Users\User\Desktop\iknowserviceai
docker compose up -d
```

Decisions for later:

- Connect GitHub when you are ready. No remote exists yet.
- Get a Gemini API key only if you want the optional live smoke test in Chunk 3.
- Review ADR-015 and ADR-016, because they extend the search instructions.

## 10. How to try it now

| What | URL |
|---|---|
| App | http://localhost:5173 |
| API docs | http://localhost:8000/docs |
| Readiness | http://localhost:8000/readyz |

The shared demo password is `demo-only-public-2026`, and the login page shows it too.

| Account | Role |
|---|---|
| `riley.morgan@demo.iknowservice.test` | USER |
| `sam.patel@demo.iknowservice.test` | USER |
| `alex.chen@demo.iknowservice.test` | AGENT |
| `jordan.reyes@demo.iknowservice.test` | ADMIN |

Things to try:

1. Sign in as Riley. The dashboard shows 5 requests, and Sam's sensitive request is not among them. Reload the page: you must sign in again, because the token is memory-only.
2. Sign in as Alex. The dashboard shows all 9 requests.
3. Open **Knowledge** and search `wifi`, then a full sentence such as `The campus Wi-Fi connects but I cannot open websites`, then `zzz` for the empty state.
4. Try the lifecycle at http://localhost:8000/docs. Use **Authorize** with a token from `POST /api/v1/auth/login`, then move a request with `PATCH /api/v1/requests/{id}`. Repeat it with the old `expected_version` to see `STALE_UPDATE`, or set `status` to `ANALYZING` to see `INVALID_TRANSITION`.
5. As Jordan, call `GET /api/v1/admin/audit` to see your actions, then `GET /api/v1/admin/knowledge?status=DRAFT` for the draft's ID. Open `http://localhost:5173/knowledge/<id>` to see the hostile text displayed harmlessly. You will need to sign in again after that page load.

To restore the original data:

```powershell
docker compose exec backend python -m app.scripts.reset_demo --yes
```

## 11. Recommended next chunk

**Chunk 3: Phases 5 and 6.** That covers AI orchestration with `MockAgent` and `GeminiAgent`, the analyze endpoint, redaction, the policy gate, the staff review endpoint, rate limiting and adversarial tests. The ready-to-use prompt is at the end of `docs/NEXT_AGENT_PROMPT.md`.
