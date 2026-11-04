# Agent operating rules

Rules for any coding agent working in this repository.

## Before changing anything

1. Read, in this order: `docs/PROJECT_CONTEXT.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/NEXT_AGENT_PROMPT.md`, then `docs/IMPLEMENTATION_BLUEPRINT.md`.
2. Inspect the repository and `git log --oneline`. **Code and tests are ground truth**; docs and earlier agent claims are not evidence.

## While working

- Never mark work complete without running the check that proves it. If a check cannot run, mark it UNVERIFIED or BLOCKED and give the exact command.
- Never commit secrets. `.env` stays untracked. Only placeholders go in `.env.example`.
- Keep `AI_MODE=mock` for all tests. The browser never calls Gemini or sees its key.
- Never edit an applied Alembic migration. Schema changes get a new revision.
- Do not swap the stack (React JavaScript, FastAPI, PostgreSQL, Docker, pytest) or remove review gates without an ADR.
- Record each significant decision as an ADR in `docs/ARCHITECTURE_DECISIONS.md`.
- Never add AI-tool attribution (Co-Authored-By, session links, generated-by footers) to commits, PRs or files, and never mention AI tool or vendor names in tracked files.

## At the end of each chunk

Update `docs/IMPLEMENTATION_STATUS.md` and `docs/NEXT_AGENT_PROMPT.md`, then commit.

## Windows and Docker requirements

- The owner works in PowerShell on Windows 11 with Docker Desktop (WSL2). README commands are PowerShell first.
- `.gitattributes` enforces LF everywhere except `*.bat`, `*.cmd` and `*.ps1`. Containers fail on CRLF shell scripts.
- Bind mounts may not deliver file events, so dev reload polls (`WATCHFILES_FORCE_POLLING`, `VITE_USE_POLLING`).
- Host folders must not shadow container dependencies: the frontend has an anonymous `/app/node_modules` volume and the backend virtualenv lives in `/opt/venv`.
- Run backend commands in the container: `docker compose exec backend pytest -q`.
- Frontend checks can run on the host (Node 24) or with `docker compose exec frontend npm ...`.
- The Postgres host port is configurable with `POSTGRES_HOST_PORT`.
