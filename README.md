# Substrata Jobs

Substrata Jobs is the offline-first field operations layer between Substrata Ops Manager and Substrata Field.

The initial product and architecture plan is documented in [docs/MVP_SPEC.md](docs/MVP_SPEC.md).

The proposed cross-system v1 contract is documented in [docs/INTEGRATION_CONTRACTS.md](docs/INTEGRATION_CONTRACTS.md), with machine-readable schemas and examples under [contracts/v1](contracts/v1).

## Step 1 prototype

The current application is a mobile-first, clickable UX prototype. It uses realistic mocked records and browser-local state; it does not yet connect to Ops Manager, Field, payroll, email, or a production database.

The suggested field-team walkthrough and feedback checklist are in [docs/PROTOTYPE_WALKTHROUGH.md](docs/PROTOTYPE_WALKTHROUGH.md).

```powershell
npm.cmd install
npm.cmd run dev
```

For UI-only prototype work without PostgreSQL or authentication:

```powershell
$env:VITE_BYPASS_AUTH='true'
npm.cmd run dev:web
```

Never enable that flag in Coolify.

For a production-style local build:

```powershell
npm.cmd run build
npm.cmd run preview
```

Validate the representative integration payloads with:

```powershell
npm.cmd run contracts:validate
```

The included `Dockerfile` serves the PWA and same-origin Jobs API from Node and is suitable for a Coolify Dockerfile deployment. The container exposes port `8080` and provides `/health` for health checks. See [docs/COOLIFY_DEPLOYMENT.md](docs/COOLIFY_DEPLOYMENT.md) for the database role, environment variables, networking and first-deployment checks.

For a production-shaped local Docker environment with a private fixture database, see [docs/LOCAL_DOCKER.md](docs/LOCAL_DOCKER.md).
