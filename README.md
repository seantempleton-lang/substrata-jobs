# Substrata Jobs

Substrata Jobs is the offline-first field operations layer between Substrata Ops Manager and Substrata Field.

The product vision and detailed target behaviour are documented in [docs/MVP_SPEC.md](docs/MVP_SPEC.md).

The current plan and handoff are in [PROJECT_DEVELOPMENT.md](PROJECT_DEVELOPMENT.md), reprioritised on 15 October 2026: capture the right information in Jobs, let the supervisor review/edit it quickly in Ops, then lock it into the project for invoicing. The next checkpoint is a paired field-entry and supervisor-review walkthrough. Changes may span both repositories.

The cross-system v1 implementation baseline is documented in [docs/INTEGRATION_CONTRACTS.md](docs/INTEGRATION_CONTRACTS.md), with machine-readable schemas and examples under [contracts/v1](contracts/v1).

## Current implementation

The application reads Ops assignments, catalogues and personnel, and reads point references directly from CORE-GS through the Jobs API. Rig logs use a combined Daily log screen for bore details, work descriptions/times, readings, quantities, crew and comments. Rig and ancillary records are saved in IndexedDB before authenticated synchronization to PostgreSQL. Unfinished editor inputs survive app closure.

Step 5 is implemented locally: validated submission, immutable revisions and protected local retention, plus existing optional client acknowledgement/signatures, draft PDFs and deliberate delivery/history. Client output is a nice-to-have follow-up; mailbox/contact setup and PDF/signature refinement do not gate the operational workflow. Real-device and deployed integration acceptance remain outstanding.

The first Step 6 approve/return slice is implemented across the companion Ops review API/inbox and Jobs' returned-log correction/resubmission and approval synchronization. Jobs' own office view remains read-only. Next: at-a-glance review, supervisor edits/direct lock-in and project-linked reviewed figures for invoice preparation. The supervisor may optionally send work back for correction/confirmation; driller confirmation is not mandatory before lock-in. These capabilities are planned, not yet implemented. See [docs/OFFICE_REVIEW_INTEGRATION.md](docs/OFFICE_REVIEW_INTEGRATION.md).

Fresh checks on 15 October passed all 38 unit tests, lint, contract validation and the production/PWA build. Docker Desktop was unavailable, so browser/Postgres tests were not rerun; the latest recorded run passed 16 browser/API tests. Local fixture results do not establish production readiness.

## Local development

```powershell
npm.cmd install
npm.cmd run dev
```

Use the isolated Docker database and CORE-GS driver fixture for integration tests:

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
