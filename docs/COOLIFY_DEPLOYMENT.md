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

## Step 5 submission and client output

This step has been developed against the isolated local fixtures. No production deployment, live migration or real client email is authorised by this work. Apply migration `004_submission_output.sql` after the existing immutable migrations 001-003 through the normal controlled rollout. Do not replay `contracts/v1/database-model.sql`; it is a design reference.

The new migration adds immutable submitted snapshots, encrypted signature assets, durable document artifacts and email request/history records. `current_document_revision` is the client document revision; `server_revision` remains the aggregate synchronization counter. Database triggers prevent submitted snapshots/signatures and ready PDF artifacts being rewritten. All storage is in the existing `jobs_app` PostgreSQL schema, so it survives Jobs container replacement. Retain the PostgreSQL persistent volume and backups; no object-storage service or Jobs file volume is required for this implementation. Generated PDFs, including any signature, are private binary records and must receive the same backup/storage access controls as the database.

When using a separate migration owner, apply these grants to the runtime role after migration (the existing daily-log, audit and Ops identity grants are still required):

```sql
grant select, insert on jobs_app.log_revisions, jobs_app.signature_assets to substrata_jobs;
grant select, insert, update on jobs_app.document_artifacts, jobs_app.email_deliveries to substrata_jobs;
```

### Signatures

Configure `SIGNATURE_ENCRYPTION_KEY` with a cryptographically random 32-byte key encoded as base64, and `SIGNATURE_KEY_ID` with its stable identifier. These are runtime secrets. Do not use the checked-in local fixture key in Coolify. Signature strokes are validated (up to 300 strokes, 20,000 points total, 512,000 bytes) and encrypted using AES-256-GCM, with authenticated log/content identity. Upload and download require an authenticated owner or permitted office reader. Signature strokes never enter aggregate/audit JSON.

Store the key securely outside the container and retain it alongside the database recovery plan. Losing it prevents signature recovery and generation of PDFs that include it. For rotation, use a new active key ID/key and retain previous keys in `SIGNATURE_PREVIOUS_KEYS`, a server-only JSON object mapping old IDs to their base64 keys. Existing encrypted assets are immutable and are decrypted with the corresponding key; they are not rewritten automatically. `/api/v1/health` reports signature capability separately from application readiness. Missing encryption leaves signatures saved locally and upload failed/pending; the user may return an unsent submission to editing and record an unsigned outcome.

### Microsoft 365 service mailbox

The intended From/reply-to identity is `substrata-jobs@drilling.co.nz`, as selected by the user. Create the mailbox in Microsoft 365 and register an Entra application. This implementation uses client credentials and Microsoft Graph `POST /users/{mailbox}/sendMail`. Authorise `Application Mail.Send` through Exchange Online application RBAC with a resource scope restricted to this mailbox. Entra grants and Exchange RBAC grants are additive; an unscoped Entra `Mail.Send` application grant must not remain alongside the scoped RBAC grant. The Microsoft 365 administrator must verify both in-scope service-mailbox access and denied access to an unrelated mailbox. Follow [Microsoft's application RBAC guidance](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac) for registration, role assignment and authorisation testing. Configure these Coolify runtime variables only:

```text
EMAIL_PROVIDER=microsoft_graph
EMAIL_FROM=substrata-jobs@drilling.co.nz
EMAIL_REPLY_TO=substrata-jobs@drilling.co.nz
MS365_TENANT_ID=<tenant UUID>
MS365_CLIENT_ID=<application UUID>
MS365_CLIENT_SECRET=<runtime secret>
```

No mailbox, Entra application, credentials or consent was created or verified during local development. The API exposes only capability status and From/reply-to identity; credentials are never sent to the browser. Capability `configured=true` checks configuration presence, not Microsoft authorisation or real delivery. Authentication failures before send are recorded as failed. Inline attachments are limited to 2.5 MB in this adapter; larger documents remain downloadable and the send is recorded as failed with `EMAIL_ATTACHMENT_TOO_LARGE`.

Graph returns 202 when accepting `sendMail` and does not return a message ID. History records `sent` as **accepted by the provider; receipt unconfirmed**. It keeps the request UUID, sender, recipient, selected PDF revision/artifact checksum and timestamps. It never invents a provider message ID or proof of receipt. Sent Items are retained in the service mailbox. See [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0) and [application authentication](https://learn.microsoft.com/en-us/graph/auth-v2-service).

Submission and PDF generation cannot send email. A deliberate Send action records a request before attempting the provider. Replays of that UUID return the existing result without contacting the provider again. An interrupted or ambiguous provider attempt is `unknown` (an abandoned `queued` attempt becomes unknown after two minutes when history is read). It is never automatically retried. A deliberate retry/resend uses a new UUID referencing the latest delivery with `resendOf`; unknown/queued outcomes also require explicit acknowledgement that another copy may be sent. No background email worker sends unrequested mail.

`EMAIL_PROVIDER=unconfigured`, missing settings or unsupported providers leave the app and PDFs usable. Explicit send requests then have a genuine failed history entry (`EMAIL_UNCONFIGURED`). Keep production local-capture settings unset. The test-only `local_smtp` provider requires `EMAIL_ALLOW_LOCAL_CAPTURE=true` and sends only to the configured SMTP capture host; Compose config points this at Mailpit with no relay. It is not a production SMTP integration.

### Ops client contacts

The inspected Ops schema has `jobs.client_id` and `client_contacts(id,client_id,full_name,job_title,email,is_primary)`. It has **no job-level supervisor-selected contact field**. Jobs reads only contacts for the current log's authoritative Ops job/client, provides a dropdown and editable explicit recipient, and reports the missing selection. A client's primary contact is not treated as a supervisor selection. Ops must add and persist the job contact choice in its own setup workflow; that work is outside this Jobs change.

The API probes table presence and runtime-role SELECT privileges before querying contacts. Missing schema/permission is a visible integration state, not a blocker for submission or PDF creation. For contact reads, grant only the needed table access through the approved database process:

```sql
grant select on public.client_contacts to substrata_jobs;
```

Once Ops supplies a documented contact UUID column on `public.jobs`, configure `OPS_JOB_CONTACT_COLUMN` with that verified column name. Jobs checks that it exists and that its selected UUID belongs to the job's client before offering it as the default. Do not configure a guessed metadata key or manufacture a client selection.

### Draft PDFs and local retention

Draft template `draft-v1` uses the existing Substrata mark, NZ timestamps and the visible `DRAFT - Awaiting Supervisor Approval` banner on every page. It includes the client-facing field record and optional acknowledgement, and excludes allocation/payroll codes, audit/sync metadata and supervisor notes. The acknowledgement wording records presentation of work, without claiming supervisor approval or agreement to charges. Three sample PDFs under `output/pdf/step5-*` cover long descriptions, Water/Geotech and a drawn signature. Branding and wording remain reviewable starting points.

PDF state is pending/ready/failed and is revision-linked with an artifact UUID, template version, checksum and generation timestamp. A generation failure leaves submission committed. Retry uses the same immutable revision and cannot replace a ready artifact. Preview/download are authenticated, private and `no-store`. Health requires the Step 5 schema, but email and signature capability configuration is reported separately.

Local purge starts 14 elapsed days after the **later of authoritative approval time and the last confirmed synchronization of that server version**. It requires `approved`, an `approvedAt` timestamp (supplied by Step 6), a synchronized version and no driller action, mutations, incomplete submission intentions, unuploaded/failed signatures or unresolved explicit Send request. It removes the eligible aggregate, local signatures/editor copies and completed intention, keeping a minimal revision tombstone so a full pull does not immediately restore it. A newer returned server version is imported again. It never deletes server data; Submitted is never treated as Approved.

Real-device secure-context/offline testing, production mailbox authorisation, Ops contact grants/selection and staging compatibility remain rollout checks. Step 6 supervisor review/corrections and final PDFs are not implemented by Step 5.
