# Local Docker environment

## When to use this optional environment

The user's deployment target is **Coolify on the work server**, confirmed 15 October 2026. Default to local builds and focused tests followed by the user's remote testing and feedback. Use this Docker environment only when it answers a specific unresolved database, migration, transaction or integration question, and explain its purpose beforehand. It is not required for routine development, documentation updates or each feedback cycle. Do not keep a parallel local deployment running by default.

The completed review increment used a separate disposable shared database to verify Ops/Jobs correction, precision and effective-source reconciliation. Its container/database and local servers were removed. The instructions below remain a reproduction reference. See [the next Coolify release and walkthrough](COOLIFY_DEPLOYMENT.md#next-user-managed-review-release-and-feedback) for the normal next step.

The local environment builds the same production `Dockerfile` used by Coolify. It runs against a private PostgreSQL container populated with the minimum Ops Manager tables and representative local-only records from `test/fixtures/ops-schema.sql`.

It never connects to staging or production and does not change the Coolify configuration.

The 15 October review increment requires Jobs migrations through **006_log_item_quantity_precision.sql**. Cross-app correction/matrix acceptance additionally requires the actual Ops schema through **017_daily_log_corrections.sql**, rather than only this app's minimal Ops fixture. See [OFFICE_REVIEW_INTEGRATION.md](OFFICE_REVIEW_INTEGRATION.md) and Ops' guarded `TEST_DATABASE_URL` integration suite for the disposable shared-database workflow.

## Start

Make sure Docker Desktop is running, then use:

```powershell
docker compose -f compose.local.yaml up --build -d
docker compose -f compose.local.yaml ps
```

Open `http://localhost:18080` and sign in with the local fixture account:

```text
Username: localdriller
Password: TestPassword123!
```

Useful checks:

```powershell
Invoke-RestMethod http://localhost:18080/health
Invoke-RestMethod http://localhost:18080/api/v1/health
docker compose -f compose.local.yaml logs jobs
```

The fixture database includes Geotech and Water assignments, a filtered crew directory, and a supervisor account (`localsupervisor`, using the same local test password). Assignment dates follow the database's current date. Existing volumes initialized from the old fixture do not automatically gain new seed data.

For automated browser and real-API checks, run `npx.cmd playwright install chromium` once, then `npm.cmd run test:e2e`. Compose mounts `test/fixtures` and supplies a test-only `NODE_OPTIONS` import that substitutes the CORE-GS SQL driver. Point selection works without starting a Field HTTP fixture. The loader and fixture settings must never be copied into production; production Jobs reads CORE-GS using its real server-side MSSQL driver.

The browser/API suite covers daily bore entry and bore separation, offline closure/restart, unfinished form recovery, Water measurements, lost-response/concurrent retries against Postgres, office access, single-use handoff tokens, direct CORE-GS source scoping and HTTP-origin crypto compatibility. Field receiver tests live in the Field repository under `test/jobs-integration.test.js`; Jobs' suite does not launch that app.

## Stop

Stop the containers while retaining the local database:

```powershell
docker compose -f compose.local.yaml down
```

To deliberately discard the local-only database and recreate it from the fixture on the next start:

```powershell
docker compose -f compose.local.yaml down --volumes
```

The `--volumes` command deletes only the Compose-managed `local-postgres` development volume. It cannot affect the Coolify or Ops databases.

## Differences from Coolify

- Coolify supplies the real domain, TLS proxy, secrets, and private service network.
- Coolify uses the restricted Jobs database role and, when configured, a separate migration-owner connection.
- The local database contains a deliberately small representation of the Ops schema. Staging remains the final compatibility check against the real Ops schema and permissions.
- `COOKIE_SECURE=false` is local-only. Coolify must retain `COOKIE_SECURE=true`.

## Step 5 output tests

Compose also runs Mailpit at `http://localhost:18082`, with its SMTP service reachable only on the private Compose network. It captures local test emails and has no relay configured. Jobs uses `substrata-jobs@example.test`, a local-only encryption key and `EMAIL_PROVIDER=local_smtp`; do not copy these settings into Coolify. No Microsoft 365 credentials are used during tests.

The Step 5 browser/API suite covers server completeness and ownership, concurrent/replayed submission and signature upload, encrypted/restricted assets, stale signature coverage, immutable database snapshots, explicit delivery with the exact PDF checksum, resend controls, genuine unconfigured/unknown provider outcomes, PDF failure/retry, ancillary submission and a complete offline browser-process restart with lost responses. Tests may add local-only crew login/contact fixtures in the Compose database. They never change Ops production data or planner assignments. Unit tests cover safe retention using approved fixtures and office-decision reconciliation; the companion Ops approve/return API is outside this standalone Compose suite. See [OFFICE_REVIEW_INTEGRATION.md](OFFICE_REVIEW_INTEGRATION.md) for the separate shared-database acceptance scenario.

`npm.cmd test` creates three representative sample PDFs in `output/pdf/step5-*`. PDF visual QA uses Poppler and pypdf from the bundled workspace dependencies. The local app remains at `http://localhost:18080`. Mailpit capture confirms test transport acceptance and attachment content; it does not establish real client receipt or Microsoft 365 access.

## Current verification record

Latest 15 October results: Jobs **40 tests**, lint, contract validation including a corrected locked aggregate and PWA build passed. The companion Ops build, **10 unit tests**, **17 shared-database integration results** and the additional actual-app browser scenario passed against a disposable database, which was removed afterward. This was the separate Ops/Jobs workflow, not a fresh run of the full standalone Jobs Compose suite or a remote Coolify acceptance result.

The earlier 15 October inspection passed 38 tests while Docker was unavailable; the latest recorded full standalone Jobs browser/API suite and Docker build passed 16 tests on 14 October. Those are historical baselines. Repeat the relevant local Docker checks only when a specific change warrants them. Localhost offline tests do not replace personal-device acceptance on a valid HTTPS origin.
