# Local Docker environment

The local environment builds the same production `Dockerfile` used by Coolify. It runs against a private PostgreSQL container populated with the minimum Ops Manager tables and representative local-only records from `test/fixtures/ops-schema.sql`.

It never connects to staging or production and does not change the Coolify configuration.

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

For automated browser and real-API checks, run `npx.cmd playwright install chromium` once, then `npm.cmd run test:e2e`. Playwright starts the read-only local Field fixture on port 18081. The Jobs container reaches it through `host.docker.internal`; this service is test-only and is not included in the production image. For manual local point selection, run `node test/fixtures/field-server.mjs` in another terminal while Jobs is running.

The tests cover both Step 4 scenarios offline, app closure, unfinished form recovery, Water measurements, lost-response retries against Postgres, concurrent duplicate requests, office access, and single-use handoff tokens. Field receiver tests live in the Field repository under `test/jobs-integration.test.js`.

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

The Step 5 browser/API suite covers server completeness and ownership, concurrent/replayed submission and signature upload, encrypted/restricted assets, stale signature coverage, immutable database snapshots, explicit delivery with the exact PDF checksum, resend controls, genuine unconfigured/unknown provider outcomes, PDF failure/retry, ancillary submission and a complete offline browser-process restart with lost responses. Tests may add local-only crew login/contact fixtures in the Compose database. They never change Ops production data or planner assignments. Unit tests additionally cover safe retention using approved fixtures; no approval workflow is added.

`npm.cmd test` creates three representative sample PDFs in `output/pdf/step5-*`. PDF visual QA uses Poppler and pypdf from the bundled workspace dependencies. The local app remains at `http://localhost:18080`. Mailpit capture confirms test transport acceptance and attachment content; it does not establish real client receipt or Microsoft 365 access.
