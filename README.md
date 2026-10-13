# Substrata Jobs

Substrata Jobs is the offline-first field operations layer between Substrata Ops Manager and Substrata Field.

The initial product and architecture plan is documented in [docs/MVP_SPEC.md](docs/MVP_SPEC.md).

The proposed cross-system v1 contract is documented in [docs/INTEGRATION_CONTRACTS.md](docs/INTEGRATION_CONTRACTS.md), with machine-readable schemas and examples under [contracts/v1](contracts/v1).

## Core field workflow (Step 4)

The application uses live Ops assignments, catalogues and personnel. Rig and ancillary logs, activities, point progress, attendance, site items, setup and notes are saved in IndexedDB before authenticated API synchronization to PostgreSQL. Unfinished editor inputs also survive app closure. Mocked walkthrough screens and the authentication bypass have been removed.

Submission, signatures, PDFs and email remain Step 5 work. Supervisors can inspect synchronized structured records through the read-only office view; approval and corrections remain Step 6 work.

```powershell
npm.cmd install
npm.cmd run dev
```

Use the isolated Docker database and Field fixture for integration tests:

```powershell
docker compose -f compose.local.yaml up --build -d
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

See [docs/LOCAL_DOCKER.md](docs/LOCAL_DOCKER.md) for fixture accounts. Unit and queue tests use `npm.cmd test`; lint uses `npm.cmd run lint`.

For a production-style local build:

```powershell
npm.cmd run build
npm.cmd start
```

Validate the representative integration payloads with:

```powershell
npm.cmd run contracts:validate
```

The included `Dockerfile` serves the PWA and same-origin Jobs API from Node and is suitable for a Coolify Dockerfile deployment. The container exposes port `8080` and provides `/health` for health checks. See [docs/COOLIFY_DEPLOYMENT.md](docs/COOLIFY_DEPLOYMENT.md) for the database role, environment variables, networking and first-deployment checks.

For a production-shaped local Docker environment with a private fixture database, see [docs/LOCAL_DOCKER.md](docs/LOCAL_DOCKER.md).
