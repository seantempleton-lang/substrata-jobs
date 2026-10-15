# Coolify deployment

Priority decision, 15 October: the core delivery is Jobs submission → Ops review/edit/direct lock → project figures for invoicing, with optional return for driller correction/confirmation. Client signature/PDF/email refinement and mailbox/contact configuration are follow-up rather than pilot gates. Bounded item/note correction and an operational project matrix are now implemented locally; wider editors and requisition rules remain planned.

The newer coordinated increment requires **Jobs migrations 001-006** and **Ops migrations through 017**, compatible code and the additional Ops revision/item/daily-log-column grants in [OFFICE_REVIEW_INTEGRATION.md](OFFICE_REVIEW_INTEGRATION.md). The migration connection must also be allowed to alter `jobs_app.log_items.quantity`. Fresh local Jobs lint/40 tests/contracts/PWA build and shared-database/browser checks passed after Docker was restored. The walkthrough baseline below predates that increment; its 001-005 migration references are historical. No Coolify deployment or live records were changed.

## Next user-managed review release and feedback

Confirmed on 15 October: Coolify on the work server is the deployment target. Default development verification is local builds and focused tests, then the user's remote walkthrough and feedback. Local Docker is optional for a specific unresolved migration/database/transaction/integration question; explain that purpose before starting it. The completed disposable shared-database run was removed, and no local deployment needs to be kept running.

1. Make the compatible changes from both working trees available on the actual branches configured in Coolify. Local implementation does not mean the changes have been committed, pushed or deployed. Preserve existing uncommitted work when preparing the release.
2. Confirm the apps use the intended shared database and retain their working runtime settings. Deploy Jobs with migrations through **006**, then Ops through **017** before using the new correction workflow. Check each application's startup/migration log and actual deployed revision; the entrypoints apply only their own repository's pending migrations under the configured arrangement.
3. Verify the migration role can alter `jobs_app.log_items.quantity` and the Ops runtime grants described in [OFFICE_REVIEW_INTEGRATION.md](OFFICE_REVIEW_INTEGRATION.md). Check application health and reload the new bundles without clearing unsynced device storage. No new local Compose stack is required.
4. Using a user-selected test project/records, submit work in Jobs; review its Ops summary; correct an existing item or daily note with a reason and lock directly; open the project's **Daily work** matrix; verify separate same-day log columns, units, explicit zero, measurement exceptions and source drill-down; then sync Jobs to see the corrected locked revision. Exercise optional return/correct/resubmit separately. Times/crew/bore/allocation editing and reopening locked work remain outside this increment.
5. Feed back the app/screen, log reference/revision, expected versus actual result and any visible error. Relevant Coolify migration/runtime errors help diagnose database/grant problems; omit credentials. Use the feedback to refine capture/review and prioritize broader editors. Phone offline/restart testing requires HTTPS and can follow the connected walkthrough.

The companion Ops `docs/COOLIFY_REVIEW_HANDOFF.md` contains the complete cross-app checklist and remaining business decisions. Requisition finalisation, commercial adjustments, pricing and accounting integration remain deferred. This documentation update does not deploy, push changes or modify server records.

## Historical daily log walkthrough preparation - 15 October 2026

The next product checkpoint is a realistic full-day walkthrough of the Daily log screen. The screen, migration `005_daily_bore_details.sql`, Step 5 output, office-state synchronization, HTTP crypto compatibility and direct CORE-GS lookup are committed in this checkout at `7c50c70` on `master`, matching the locally recorded `origin/master`. No remote fetch or live Coolify deployment inspection was performed on 15 October. Verify the actual configured branch and deployed commit before preparing a test redeploy; deployment remains a separate user decision.

Fresh checks on 15 October passed 38 unit tests, lint, contract validation and the production/PWA build. Docker Desktop's Linux engine was unavailable, so browser/Postgres tests, migration state, container health and Docker build were not rechecked. The latest recorded CORE-GS preflight on 14 October passed 16 browser/API tests and Docker/PWA build. These results do not verify Coolify's runtime permissions, live SQL connectivity, current assignments or phone/browser behaviour.

Retain the existing Dockerfile, port 8080, database connections, Field integration settings and working cookie/base-URL settings. With `RUN_MIGRATIONS=true`, startup runs unapplied migrations in order; 004 and 005 must be present. The migration connection must own or be allowed to alter `jobs_app.log_points`. If migrations run under a separate owner, retain the Step 5 runtime grants below. Email configuration is not needed for the entry walkthrough; `EMAIL_PROVIDER=unconfigured` leaves submission and PDF generation available. Device signatures require the separately configured encryption key described below.

When an authorised test deployment is available, check its commit, startup migration log and `/health` plus `/api/v1/health`. In the Coolify application terminal, `npm run db:migrate:status` should show 001-005 applied. Configure and verify the direct CORE-GS reader described below. Confirm a current Ops job/rig assignment is visible, then open a rig daily record and verify the **Daily log** screen and Bore / Work / Water / Materials / Comments shortcuts. Existing installed clients may need an online close/reopen or reload to pick up the updated service worker; do not clear device storage containing unsynced records.

The first office approve/return slice also needs the compatible Ops API/inbox, Ops migration 016 and shared-schema permissions. Verify submit → return/comment → owner correction/resubmission → approve → Jobs synchronization/lock using [OFFICE_REVIEW_INTEGRATION.md](OFFICE_REVIEW_INTEGRATION.md). Supervisor editing/direct lock-in, optional requested driller action and effective project figures are next work; final client PDFs are deferred.

Walk through pre-start, drilling work entries with times/descriptions, starting/current depths, AM/PM water readings, meter readings, quantities/tests, crew changes and daily comments. Change to a second bore and confirm the first bore's readings/quantities stay separate. Correct an earlier entry, reload with a saved draft, finish the shift and review the record. Note any unclear labels, extra taps, missing fields or unsuitable units. Test submission/PDF separately if desired; a client signature is optional. Email sending is a separate deliberate action.

For phone offline/PWA acceptance, use a valid HTTPS origin. The currently documented LAN address `http://substrata-jobs.mcm` is suitable for the connected UI walkthrough but is not a secure context for service-worker acceptance. Disconnect/reload/reconnect and confirm synchronization when testing on HTTPS.

## HTTP LAN UUID/hash compatibility

The reported `crypto.randomUUID is not a function` failure on **Start daily record** is caused by directly using a secure-context browser API on an HTTP origin. `localhost` browser tests did not expose it. `src/domain/crypto.js` now supplies UUID v4 generation using native `randomUUID` where available, otherwise cryptographic `getRandomValues`, and SHA-256 using Web Crypto where available, otherwise pinned `@noble/hashes`. All browser record/device/mutation/submission IDs use this helper. UUID format, canonical content hashes and stored records remain compatible; no new database migration or environment variable is needed. Deploy the source and package-lock change together through the Dockerfile build.

`test/e2e/http-browser.spec.js` uses a non-localhost HTTP hostname mapped to the local fixture container. It checks that the origin is non-secure and the native UUID/SubtleCrypto APIs are absent, then exercises bore record creation, quantity entry, shift finish, sync and submission. HTTP support here does not enable service workers or installation/offline reload on an insecure origin; HTTPS remains required for those browser capabilities. After redeploying, reload the Jobs page to load the rebuilt bundle; do not clear storage containing unsynced work.

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

### CORE-GS point selection

Point lookup now uses Jobs' own server-side CORE-GS helper, adapted from Field's `getCoreGsPool` / `getCoreGsPoints` in `server.js`. It does not call the Field application. Copy the **working runtime settings** from Field into the Jobs Coolify resource, enable them, and redeploy Jobs:

```dotenv
CORE_GS_ENABLED=true
CORE_GS_HOST=<same SQL Server host used by Field>
CORE_GS_DATABASE=<same CORE-GS database used by Field>
CORE_GS_USER=<SQL login with read access to dbo.POINT>
CORE_GS_PASSWORD=<runtime secret>
CORE_GS_CLNT_ID=<same CLNT_ID used by Field; default Geotechnical>
```

Also copy `CORE_GS_PORT`, `CORE_GS_INSTANCE`, `CORE_GS_ENCRYPT` and `CORE_GS_TRUST_SERVER_CERTIFICATE` when set in Field. Jobs uses Field's boolean defaults when omitted. Preserve the actual working port/instance/certificate choices; do not substitute old sample hostnames or the historical test database. These settings are runtime-only, never `VITE_*` or build-time variables. The Jobs container must be able to reach the SQL Server from its own network. Jobs issues SELECT only, bound to the configured `CLNT_ID` and the Ops job number as `PROJ_ID`, and retains Field's `Sort, POINT_ID` ordering. It does not create/edit CORE-GS points, copy Field's auth/cache tables or require a new PostgreSQL migration.

`/api/v1/health` reports `capabilities.points` with source/enabled/configured, without credentials. `configured` reports setting presence, not verified SQL connectivity. After signing in, open `/api/v1/points?jobNumber=302670` (or the intended Ops job number), then confirm starting-point selection and **Refresh points**. A source failure returns a visible error; saved point lists remain available. A successful empty list means no points for that configured client/project. The Field service key and Field API URL are not used for point lookup.

Local Compose uses a test-only Node loader and SQL-driver fixture mounted from `test/fixtures`; neither the fixture files nor its `NODE_OPTIONS` setting belong in the Coolify production configuration. The production Dockerfile installs the real `mssql` dependency. Local browser/API tests run without a Field HTTP fixture and cannot prove live SQL Server reachability or login permissions.

### Optional Field technical-module handoff

Step 4 requires migration `003_field_workflow.sql`, which adds the aggregate snapshot, Custom shift label and single-use Field handoff storage. Deploy the companion Field changes (`jobs-integration.js`, server routing, Dockerfile and context-aware UI) as well.

To open technical modules or create a missing point in Field, configure Jobs with `FIELD_BASE_URL` (Field browser URL) and `FIELD_JOBS_KEY`. Configure Field with `JOBS_API_URL` (private Jobs address) and the identical `FIELD_JOBS_KEY`. Keep the key server-side. These settings are independent of the read-only CORE-GS point helper; `FIELD_API_URL` is no longer used by Jobs.

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

Daily input UI refinement adds migration `005_daily_bore_details.sql`, after 004. It adds `daily_details jsonb` to the Jobs-owned `log_points` table; table-level runtime SELECT/INSERT grants cover that column. It requires no Ops/Field migration or new provider. The changes are committed in this checkout; verify actual deployed state. The next walkthrough pairs entry with supervisor review and project invoice-preparation needs.

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

Real-device HTTPS offline/restart, shared-schema permissions and connected workflow acceptance remain core rollout checks. Production mailbox authorisation, contact grants/selection and final client PDFs are deferred optional-output checks. Step 5 does not implement the next supervisor edit/direct lock/project invoicing slice.
