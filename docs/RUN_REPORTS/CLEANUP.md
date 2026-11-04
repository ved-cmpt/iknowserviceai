# Cleanup report: removed AI-tool attribution and mentions

History was rewritten and force-pushed to `origin main` with the owner's approval. Every check below passed; the one open item is that GitHub still serves the old commits by direct SHA (see owner follow-ups).

## Audit counts

| Check | Before | After |
|---|---|---|
| Commit message lines with forbidden terms | 16 (all attribution trailers) | 0 |
| Author or committer fields with forbidden terms | 0 | 0 |
| Tracked file hits at HEAD (lines) | 4 | 0 |
| Tracked file names at HEAD | 1 | 0 |
| File-per-commit hits across all history | 43 | 0 |
| Trailers of any kind (co-author, session, generated-by) | 16 | 0 |

The real Gemini key value appears 0 times in history blobs, commit messages and raw objects. Only counts were printed.

## What was untracked

These were removed from all history and are now listed in `.git/info/exclude`. They stay on disk for local use and `git status` does not show them:

- the agent pointer file in the project root
- `docs/prompts/`
- the local tool settings folder (it did not exist on disk, so only the exclude rule applies)

## What was reworded

- `.gitignore`: removed the line naming the local tool settings folder, in every commit. The exclude rule replaces it.
- `docs/RUN_REPORTS/RUN_01.md`: removed the pointer file from the root file table, in every commit that had it.
- `AGENTS.md`: added the rule against AI-tool attribution and against naming AI tools or vendors in tracked files. New commit, not rewritten history.

No application code, tests, fixtures or config needed changes. Compared with the old HEAD, the only differences are the removed paths and the three edits above.

## SHAs

| | Old | New |
|---|---|---|
| HEAD before this report | `8cdbe0f` | `64b6fdd` |
| Commit count | 16 | 17, plus this report's commit |

All 16 original subjects are unchanged and in the same order. The new commits are `chore: neutral wording in docs and agent rules` and `docs: cleanup report`. The new commit was checked and carries no trailer, so no amendment was needed.

The earlier run reports quote SHAs from before the rewrite, and those reports were left as they are. Use this map to translate them:

| Old | New | Subject |
|---|---|---|
| `7e02987` | `ca83d91` | chore: phase 0 repository and project documentation |
| `481f2c1` | `a526682` | feat: phase 1 scaffolding, docker compose, health checks |
| `14016c4` | `b58fb49` | feat: phase 2 schema, migrations, auth, roles, seed |
| `b1ebd39` | `ba877b3` | feat: phase 3 request lifecycle api, state machine, events and audit |
| `0f641fb` | `041fa9a` | feat: phase 4 knowledge base admin, full-text search and retriever |
| `f526143` | `5dcfcad` | docs: autopilot run 01 report and handoff |
| `34fbe04` | `0f1e3f5` | feat: query-focused snippets and db-enforced append-only audit |
| `4c8631a` | `96174a4` | feat: phase 5 ai orchestration, mock agent, redaction and analyze endpoint |
| `d78d10f` | `465d978` | feat: gemini agent adapter with structured output and opt-in live smoke test |
| `1116bd1` | `f18d2a1` | feat: phase 6 policy gate, staff review, feedback, rate limiting and adversarial tests |
| `3b5e341` | `061ff5e` | docs: autopilot run 02 report and handoff |
| `7987927` | `4ff75a1` | feat: phase 7 design system and complete requester journey |
| `bdf4431` | `9eb6c9d` | feat: phase 8 staff queue and review workspace |
| `4dfd5a0` | `bd22e5f` | feat: phase 8 knowledge admin and audit viewer |
| `afd93fd` | `a6dd1d5` | test: phase 8 playwright e2e, accessibility checks and screenshots |
| `8cdbe0f` | `ab670e6` | docs: autopilot run 03 report and handoff |

## Test results

Run before the rewrite and again after it, with the same results. E2E was not required and was not run.

| Check | Result | Exit code |
|---|---|---|
| `docker compose up -d --wait` | all services healthy (after the rewrite) | 0 |
| backend `pytest -q` | 694 passed, 1 skipped (live Gemini test, opt-in) | 0 |
| frontend `npm test -- --run` | 194 passed | 0 |
| frontend `npm run build` | built | 0 |

## Push result

`main` was force-updated from `8cdbe0f` to `64b6fdd`. The push used a lease pinned to `8cdbe0f`, which also guarded against overwriting any commit that had landed since the audit. After `git fetch origin`, `HEAD` equalled `origin/main`.

## Backup

`.backup/` is excluded locally and was not deleted. It holds `pre-cleanup.bundle` (verified, full original history), `local-files/`, and the rewrite rules. The bundle still contains the original text, so keep it private and delete it when no longer needed.

## Owner follow-ups

- **Old commits are still reachable on GitHub by direct SHA.** After the push, the API still returned `8cdbe0f`. The repository is private with no forks and no pull requests, so only people with access and the SHA can reach it. GitHub usually removes such commits only through garbage collection, or a support request to purge them.
- GitHub may keep showing an extra contributor in the sidebar for a while after a force-push; it usually refreshes on its own. The contributors API already listed only the owner after the push.
- Re-download or update any local clones elsewhere (none expected).
