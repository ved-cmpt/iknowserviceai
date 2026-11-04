# IknowServiceAI

An AI-assisted IT service-request platform with knowledge-grounded suggestions and human review gates. This is a portfolio project that uses only synthetic data.

**Status: in development.** The foundation, request lifecycle API, knowledge base and AI workflow work locally in mock mode. Nothing is deployed, the live Gemini path has not passed its smoke test, and most request actions have an API but no screen yet. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for verified progress.

## Features

- [x] Docker Compose stack with health and readiness checks
- [x] Sign-in with Argon2id passwords and short-lived JWTs, plus USER, AGENT and ADMIN roles
- [x] Full database schema, Alembic migrations, idempotent synthetic seed and guarded reset
- [x] Login page and dashboard
- [x] Request lifecycle API: filters, comments, state machine, optimistic concurrency, events and audit
- [x] Knowledge base: admin API, PostgreSQL full-text search, retriever for the AI workflow and read-only screens
- [x] AI triage with a deterministic mock agent, redaction, citation checks and retry limits
- [x] Deterministic policy gate, staff review, feedback, rate limiting and adversarial tests
- [ ] Live Gemini triage: the adapter is built and tested offline, but its one live test timed out
- [ ] Complete requester, staff and admin screens
- [ ] CI and hosted demo

## Stack

React and Vite (JavaScript), FastAPI (Python 3.12), PostgreSQL 17, SQLAlchemy 2, Alembic, Docker Compose, pytest, Vitest.

## Quickstart

You need Docker Desktop running. Commands are for PowerShell, from the project root.

1. Create your local environment file with a random JWT secret:

   ```powershell
   $secret = python -c "import secrets; print(secrets.token_urlsafe(48))"
   (Get-Content .env.example) -replace '<replace-with-a-long-random-string>', $secret | Set-Content -Encoding ascii .env
   ```

   In bash:

   ```bash
   sed "s|<replace-with-a-long-random-string>|$(openssl rand -hex 32)|" .env.example > .env
   ```

2. Start the stack, apply migrations and load the demo data:

   ```powershell
   docker compose up --build -d
   docker compose exec backend alembic upgrade head
   docker compose exec backend python -m app.scripts.seed_demo
   ```

3. Open the app:

   | What | URL |
   |---|---|
   | App | http://localhost:5173 |
   | API docs (development only) | http://localhost:8000/docs |
   | Liveness | http://localhost:8000/healthz |
   | Readiness | http://localhost:8000/readyz |

   The health endpoints are also served at `/api/v1/healthz` and `/api/v1/readyz`.

If another PostgreSQL already uses port 5432, set `POSTGRES_HOST_PORT` in `.env` to a free port.

## Demo accounts

These are fictional accounts on the reserved `.test` domain. They share one **intentionally public** password, `demo-only-public-2026` (`DEMO_PASSWORD` in `.env`), which protects synthetic data only.

| Email | Role | Name |
|---|---|---|
| `riley.morgan@demo.iknowservice.test` | USER | Riley Morgan |
| `sam.patel@demo.iknowservice.test` | USER | Sam Patel |
| `alex.chen@demo.iknowservice.test` | AGENT | Alex Chen |
| `jordan.reyes@demo.iknowservice.test` | ADMIN | Jordan Reyes |

Reloading the page signs you out, because the token is held in memory only (ADR-009).

## Tests and checks

```powershell
# Backend, in the container
docker compose exec backend pytest -q
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .

# Frontend, in the container
docker compose exec frontend npm run lint
docker compose exec frontend npm test -- --run
docker compose exec frontend npm run build
```

Frontend checks also work on the host with Node 24. Run `npm ci` once in `frontend/`, then use `npm --prefix frontend run lint`, `npm --prefix frontend test -- --run` and `npm --prefix frontend run build`.

Backend tests use the separate `iknowserviceai_test` database and never touch demo data. They use mock and fake providers and make no provider calls.

The live Gemini smoke test is opt-in, and makes at most 2 API calls:

```powershell
docker compose exec -e RUN_LIVE_GEMINI_TESTS=1 backend pytest -q -s tests/live
```

## Reset the demo data

This deletes all data and reseeds it:

```powershell
docker compose exec backend python -m app.scripts.reset_demo --yes
```

It refuses to run unless `ALLOW_DEMO_RESET=true`, and in `APP_ENV=production` it also requires `--allow-production`.

## AI mode

`AI_MODE=mock` is the default. It is deterministic and uses no network or key. To try Gemini, set `AI_MODE=gemini`, `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env`, then run `docker compose up -d --force-recreate backend`. Live mode has not passed its smoke test yet (see [status](docs/IMPLEMENTATION_STATUS.md)). Do not enter real personal data: see [security](docs/SECURITY.md).

## Useful commands

```powershell
docker compose logs -f backend
docker compose exec backend alembic current
docker compose down        # stop, keep data
docker compose down -v     # stop and delete the database volume
```

## Documentation

- [Project context](docs/PROJECT_CONTEXT.md)
- [Product contract](docs/PRODUCT_CONTRACT.md)
- [API reference](docs/API.md)
- [Architecture decisions](docs/ARCHITECTURE_DECISIONS.md)
- [Security](docs/SECURITY.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Implementation blueprint](docs/IMPLEMENTATION_BLUEPRINT.md)
- [Latest run report](docs/RUN_REPORTS/RUN_02.md)
