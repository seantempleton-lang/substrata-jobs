# Substrata Jobs

Substrata Jobs is the offline-first field operations layer between Substrata Ops Manager and Substrata Field.

The initial product and architecture plan is documented in [docs/MVP_SPEC.md](docs/MVP_SPEC.md).

## Step 1 prototype

The current application is a mobile-first, clickable UX prototype. It uses realistic mocked records and browser-local state; it does not yet connect to Ops Manager, Field, payroll, email, or a production database.

The suggested field-team walkthrough and feedback checklist are in [docs/PROTOTYPE_WALKTHROUGH.md](docs/PROTOTYPE_WALKTHROUGH.md).

```powershell
npm.cmd install
npm.cmd run dev
```

For a production-style local build:

```powershell
npm.cmd run build
npm.cmd run preview
```

The included `Dockerfile` serves the built PWA through nginx and is suitable for a Coolify Dockerfile deployment. The container exposes port `8080` and provides `/health` for health checks.
