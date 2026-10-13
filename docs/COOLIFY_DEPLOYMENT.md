# Coolify deployment

## Resource configuration

Deploy Substrata Jobs as a separate Dockerfile application in the same Coolify production environment as Ops Manager.

- Domain: `https://substrata-jobs.drilling.co.nz`
- Container port: `8080`
- Health check: `/health`
- Build pack: Dockerfile
- Branch: the actual GitHub branch, currently `master` unless renamed

The container serves the PWA and `/api/v1` from the same origin. No separate nginx resource is required.

## Required environment variables

Configure all variables in this section as **runtime only** in Coolify. Disable **Available at Buildtime**, especially for `DATABASE_URL` and `MIGRATION_DATABASE_URL`. The PWA and API are built into one image and do not require database credentials during the image build.

```dotenv
NODE_ENV=production
PORT=8080
TRUST_PROXY=1
APP_BASE_URL=https://substrata-jobs.drilling.co.nz
DATABASE_URL=postgresql://substrata_jobs:<password>@<postgres-internal-host>:5432/<ops-database>
PGSSLMODE=disable
RUN_MIGRATIONS=true
SESSION_DURATION_DAYS=30
COOKIE_SECURE=true
```

Optional:

```dotenv
MIGRATION_DATABASE_URL=postgresql://<database-owner>:<password>@<postgres-internal-host>:5432/<ops-database>
FIELD_BASE_URL=https://substrata-field.mcm
PGPOOL_MAX=10
```

`DATABASE_URL` must point to the same database used by Ops Manager, not a newly empty database. The first migration deliberately checks for the Ops identity, jobs, equipment, and planner tables.

`MIGRATION_DATABASE_URL` is only needed when the runtime Jobs role cannot create or alter tables in `jobs_app`. If it is supplied, the migration runner uses it while the API continues using the restricted `DATABASE_URL`.

Do not set `VITE_BYPASS_AUTH=true` in Coolify. It is a local prototype escape hatch only.

### Build-time variable rule

No current production variable needs to be available at build time. In particular:

- `NODE_ENV=production` at build time can cause npm to omit Vite and fail with `vite: not found`.
- Database URLs supplied at build time may be exposed to Docker build metadata, cache, or logs.
- The Dockerfile explicitly installs development dependencies only in its isolated build stage and removes them from the runtime stage.

Keep `NODE_ENV=production` enabled at runtime. Only future public `VITE_*` configuration values may be made available at build time; secrets must never use a `VITE_*` prefix.

## Restricted PostgreSQL role

Run the following once as the Ops database owner, replacing the password before execution:

```sql
create role substrata_jobs login password '<strong-random-password>';

grant connect on database <ops_database_name> to substrata_jobs;
grant usage on schema public to substrata_jobs;

grant select on table
  public.app_users,
  public.jobs,
  public.clients,
  public.equipment,
  public.planner_assignments
to substrata_jobs;

grant references on table
  public.app_users,
  public.jobs,
  public.equipment,
  public.planner_assignments
to substrata_jobs;

grant select, update on table public.app_auth_accounts to substrata_jobs;
grant select, insert, update on table public.app_sessions to substrata_jobs;
grant insert on table public.app_auth_events to substrata_jobs;

create schema if not exists jobs_app authorization substrata_jobs;
grant usage, create on schema jobs_app to substrata_jobs;
```

If the `jobs_app` schema was initially created by the Ops database owner, transfer it before using the restricted connection:

```sql
alter schema jobs_app owner to substrata_jobs;
grant all privileges on all tables in schema jobs_app to substrata_jobs;
grant all privileges on all sequences in schema jobs_app to substrata_jobs;
```

Future Jobs migrations create their tables inside this schema.

## Coolify networking

If PostgreSQL is a separate Coolify resource or Compose stack, Jobs must be able to resolve its internal hostname. Attach both resources to an appropriate predefined/private network, or use the internal PostgreSQL connection URL exposed by Coolify.

Do not expose PostgreSQL publicly solely for this application.

## First-deployment verification

Step 4 requires migration `003_field_workflow.sql`, which adds the aggregate snapshot, Custom shift label and single-use Field handoff storage. Deploy the companion Field changes (`jobs-integration.js`, server routing, Dockerfile and context-aware UI) as well.

Configure Jobs with `FIELD_API_URL` (private Field service address), `FIELD_BASE_URL` (public Field URL), and `FIELD_JOBS_KEY`. Configure Field with `JOBS_API_URL` (private Jobs address) and the identical `FIELD_JOBS_KEY`. Keep the key server-side. Jobs authenticates point reads through Field's `/api/jobs/points`; Field continues to choose CORE-GS or its own configured backing store. Jobs does not write Field's points or connect directly to CORE-GS.

Handoffs require the employee code in Field's authenticated account to match the Ops account. Field's separate identity store still authorizes its own operations; the opaque token supplies context only. Empty point context is allowed for the project/point-creation workflow. Jobs constructs the return URL from `APP_BASE_URL`, ignoring client-supplied authority.

When migrations run as a different owner, ensure the runtime role has `select, insert, update` on `jobs_app.field_handoffs` (or suitable owner default privileges for new tables). Apply grants and migrations through the existing controlled deployment process.

After deployment, complete the Geotech multi-point/crew-change and group ancillary scenarios offline on staging, close/reopen the PWA, reconnect and confirm the structured records in the supervisor office view. Verify a Field launch and return, including creating a missing point in Field. Local tests do not establish connectivity or identity compatibility in staging.

After deployment:

1. Open `/health`; it should return `ok`.
2. Open `/api/v1/health`; all checks should report `ok`.
3. Sign in using an active Ops Manager username and password.
4. Confirm the assignments screen reports that Ops is connected and assignments are cached.
5. Temporarily disconnect the phone and reload the installed PWA; the cached workspace should remain available.
6. Reconnect and confirm `/api/v1/health` still reports healthy.

If `/health` succeeds but `/api/v1/health` returns 503, the container is running and the fault is limited to database configuration, permissions, or migrations.
