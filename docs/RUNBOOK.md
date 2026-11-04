# Runbook

For operating the public demo on Render and Neon. Setup is in [the deployment guide](DEPLOYMENT.md). Limits were read from the providers' docs on 2026-11-04, so check them again before relying on them.

## Health checks

| Check | Means | When it fails |
|---|---|---|
| `GET /healthz` | The process is up. Touches nothing else | The service is down or asleep. A sleeping service takes about a minute to answer |
| `GET /readyz` | The database answers, and migrations are at head | The 503 body says which: `"database": "unavailable"`, or `"migrations": "behind_head"` |
| `GET /api/v1/config` | The banner and demo settings | `demo_banner` should be set on the public demo |

`/readyz` opens a new database connection each time, and wakes a suspended Neon. Point any frequent monitor at `/healthz`.

## Logs

In Render, open the service, then **Logs**. Entries are JSON with a `request_id`, which also comes back in the `X-Request-ID` header and in error bodies. Logs hold metadata only: no bodies, tokens or keys. Useful messages:

| Message | Meaning |
|---|---|
| `demo_reset_complete` | The daily reset ran |
| `demo_reset_failed` | It failed and rolled back, and tries again a minute later. Nothing is lost |
| `readiness_database_unavailable` | `/readyz` could not reach the database |
| `unhandled_exception` | A 500. Search for its `request_id` |

## Free-tier behavior

| Symptom | Likely cause | What to do |
|---|---|---|
| First visit takes about a minute | Render spun down after 15 idle minutes | Nothing. This is expected |
| A slow first query after 5 idle minutes | Neon suspended its compute | Nothing. The pool reconnects |
| Sessions vanish and rate limits reset | The instance restarted or slept. Limits live in memory (ADR-030) | Nothing |
| The service is suspended near the end of a month | Render's 750 free hours per workspace were used up | Wait for the next month. Sleep time does not count |
| Database errors after heavy use | Neon's 100 compute-unit hours or 1 GB limit | Check the Neon console |

## Demo data

The demo resets itself on the first API request after 24 hours. To reset now, from a workstation, make a git-ignored file, `.env.neon-migrate`, with these lines, then delete it afterwards. Take the two connection strings from `.env`, changed to the `postgresql+psycopg://` scheme.

```dotenv
APP_ENV=production
DATABASE_URL=<the app_user connection>
MIGRATION_DATABASE_URL=<the owner connection>
JWT_SECRET=<any 32 or more random characters>
DEMO_PASSWORD=demo-only-public-2026
ALLOW_DEMO_RESET=true
```

```powershell
docker build -f deploy/Dockerfile -t iknowserviceai:local .
docker run --rm --env-file .env.neon-migrate iknowserviceai:local python -m app.scripts.reset_demo --yes --allow-production
```

If people hit the caps, they see "The public demo is busy; data resets daily". The fix is a reset, or higher `DEMO_MAX_*` values in Render.

## Rotating secrets

| Secret | How | Effect |
|---|---|---|
| `app_user` password and `JWT_SECRET` | Run `deploy/neon/provision.py` again ([guide](DEPLOYMENT.md#provisioning-the-database)), then paste `.env.render` into Render. **This also resets the demo data** | Brief outage until the service restarts. Access tokens end at once |
| Neon owner password | Reset it in the Neon console, and update `.env` | The service is not affected |
| `GEMINI_API_KEY` | Revoke it at the provider, and set the new one in Render, if used | The demo uses mock mode, with no key |

## Incident response

1. **Contain.** For anything involving AI output or quota, use the kill switch below. For a security problem, rotate the affected secret first.
2. **Look.** Check the logs by `request_id`, and the audit log as an admin. Neither holds message text.
3. **Decide.** Roll back the code, or reset the data. All data is synthetic, so a reset is always safe here.
4. **Record** what happened in a new run report.

**If a real secret or personal data appears anywhere public:** rotate at once, treat the old value as burned, and remember that a removed commit can stay reachable by its hash for a while.

**If someone posts abusive content on the demo:** reset the data. Consider lowering the caps.

## Rollback

- **Code:** in Render, open **Events**, pick an earlier deploy and choose **Rollback**. Auto-deploy continues from the next push, so fix `main` as well.
- **Migrations:** Render does not run them, and they stay applied after a rollback, so they must work with the previous version. Prefer a new forward migration. `alembic downgrade` can lose data: revision `0007`'s drops the reset function.
- **Database:** Neon's free plan offers instant restore up to 6 hours back, limited to 1 GB of change history. For this demo, reprovisioning is simpler.

## Cost kill switch

The demo is free, with no card on file. There is no paid service to run away from, unless someone adds one.

- **Live AI:** set `AI_MODE=mock` in Render's **Environment**, and let the service restart. Provider calls stop at once. Removing `GEMINI_API_KEY` as well makes sure.
- **The whole site:** in Render, choose **Suspend Service**.
- **Before adding a card anywhere,** check what it unlocks. Render's overage behavior changes with a payment method on file.
