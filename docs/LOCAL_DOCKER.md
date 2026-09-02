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
