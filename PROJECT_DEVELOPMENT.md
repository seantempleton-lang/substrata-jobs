# Substrata Jobs development handoff

Last updated: 14 October 2026  
Next step: Step 5 configuration and staging acceptance; Step 6 after review  
Status: Step 5 implemented locally; production mailbox/contact configuration and rollout remain outstanding

## Objective for the new thread

Implement Step 5 from [docs/MVP_SPEC.md](docs/MVP_SPEC.md), preserving the existing field layout, offline persistence, shared Ops authority, and idempotent synchronization. A completed daily log must become an immutable submitted revision, produce an auditable draft PDF for a rig shift, and support client delivery only after a deliberate Send action. Ancillary records submit internally and do not show client acknowledgement, signature or client-PDF functions.

Read the MVP spec, this document, [docs/INTEGRATION_CONTRACTS.md](docs/INTEGRATION_CONTRACTS.md), `contracts/v1`, and the current implementation before changing code. Operational choices requiring user input are listed below. Continue independent foundations while those choices are pending.

## Current position and separate Ops work

Step 4 implements live assignments, rig/ancillary logs, continuous activities, multiple points, crew attendance, quantities, notes, shift completion, continuation/handover, offline recovery, synchronization and a supervisor-only read-only office view. The user has deployed and tested Jobs and Field and reports that both work as expected.

Jobs currently has no planned assignments because live Ops shows no current plans: navigating back shows historical May-June schedules, and Personnel reports zero active assignments. Repository inspection also found Ops date edits only change local component state, with no planner assignment write APIs. Ops planner persistence and stable crew assignment are a separate task, documented in that repository's `PROJECT_DEVELOPMENT.md`. Do not fold that work into Jobs or manufacture production assignments. Use the Jobs local fixture database to develop and test Step 5.

The user's deployment report does not prove every acceptance scenario. Retain checks for current Ops assignment visibility, personal-phone offline/restart behaviour and structured office records. Existing local regression coverage is the baseline, not a substitute for those environment checks.

Actual deployed LAN URLs:

| App | URL |
| --- | --- |
| Jobs | http://substrata-jobs.mcm |
| Ops | http://substrata.ops.mcm |
| Field | http://substrata.field.mcm |

The HTTPS addresses in older deployment examples are not the current LAN configuration. Installation/service-worker acceptance on real devices requires a secure context; do not imply HTTP LAN testing proves offline PWA behaviour. Preserve existing runtime secrets and shared database/service configuration; no credentials are recorded here.

## Implementation map and gaps

| Source | Relevant baseline |
| --- | --- |
| `src/App.jsx`, `src/components/LogForms.jsx` | Editable field screens and completed-shift review. The review still describes an editable draft; no real Submit, acknowledgement, PDF or Send workflow. |
| `src/domain/dailyLog.js` | `validationErrors`, `assertSubmittable`, draft constraints and aggregate editing. Reuse and extend rather than duplicating validation. |
| `src/foundation/offlineStore.js`, `syncManager.js`, `useWorkspace.js` | IndexedDB, atomic autosave/outbox, recovery, immutable sent mutations and conflict handling. Extend carefully for signatures and submission intentions. |
| `server/dailyLogs.mjs` | Authenticated aggregate persistence, ownership checks and draft sync. Editable statuses are draft/returned/reopened; mutation operation currently supports upsert only. Submission needs an explicit server-authoritative transition. |
| `server/index.mjs`, `repository.mjs`, `auth.mjs` | Same-origin API, shared Ops identity, roles, assignment/catalogue reads and restricted access. Extend existing error/authority patterns. |
| `db/001_jobs_foundation.sql` through `003_field_workflow.sql` | Applied implementation migrations. Revision/acknowledgement fields exist but there are no completed immutable document/PDF/email workflows. Recheck the next migration number before adding files. |
| `contracts/v1/daily-log.schema.json`, `sync.schema.json`, `database-model.sql` | Contract scaffolding. The model SQL is a design reference, not an instruction to replay it on the database. Current acknowledgement schema does not express every MVP outcome (for example Will sign later); align schemas, examples and implementations. |
| `test`, `test/fixtures`, `compose.local.yaml` | Unit/IndexedDB/server tests, Playwright/real-Postgres tests, isolated Ops fixtures and a test Field server. Extend this baseline. |

Jobs owns document revisions, actual attendance, signatures, output and delivery records. Ops owns people/jobs/plans and later supervisor review. Field owns points. Keep `job_number = PROJ_ID` and permanent log/assignment UUIDs. A document revision and the aggregate's synchronization `serverRevision` are distinct concepts; do not conflate them.

## Work sequence

### 1. Submission and immutable revisions

- Add a usable readiness/review screen with actionable completeness and timeline errors for rig and ancillary logs.
- Define an explicit idempotent submission operation: validate ownership, workflow state, latest aggregate version and completeness on the server, then atomically capture the exact submitted snapshot and workflow transition.
- Offline Submit must durably save a pending submission intention and its content locally. Show that server submission/PDF creation is pending until acknowledged. Synchronize required draft data and signature uploads before finalizing the transition; handle interruption and lost responses without duplicate revisions.
- Preserve prior snapshots. Block later draft upserts from mutating a submitted revision, and ensure conflicts cannot silently swap the contents being signed or submitted.
- Preserve the draft-synchronization protections already implemented, including immutable in-flight payloads and deliberate conflict resolution.

### 2. Optional client acknowledgement and signatures

- Support Signed on device, Not available, Declined, Not required, Will sign later, and Other with a note. Absence of a client signature must never block submission.
- Capture representative name, optional company/role, signature time and optional email; support drawing/clearing on touch and pointer devices.
- Persist signature content on the device before upload and retain it across closure/offline use. Add authenticated, restricted uploads/downloads and validated content/size limits. Do not expose signature assets through public URLs.
- Bind acknowledgement to the exact immutable content/revision it covers. If content changes after signing, preserve the earlier acknowledgement and clearly indicate it does not cover the changed content; never carry a signature forward silently.
- Update contracts/migrations for missing fields/outcomes with compatibility for existing drafts. Ancillary UI omits all client/signature functions.

### 3. Draft PDFs

- Render rig-shift PDFs server-side from immutable submitted snapshots, with `DRAFT - Awaiting Supervisor Approval` clearly visible.
- Include job/site/rig/shift/crew, point progress, activity descriptions/timeline, relevant quantities/services/measurements, comments and acknowledgement status.
- Exclude payroll/ancillary allocation codes, internal supervisor notes, audit history and integration/sync metadata.
- Provide authorised preview/download and durable revision-linked output. Show genuine pending/failed states and safe generation retries; submission durability must not depend on an email provider being available.
- Record document revision, artifact identity/checksum and generation state so a document can be traced to the submitted data. Use durable storage appropriate to Coolify; container-local ephemeral files alone are insufficient.
- Render and inspect representative multipage outputs, including long descriptions, missing signature and Water/Geotech differences.

### 4. Deliberate email and delivery history

- Add editable recipient selection, optionally defaulting from authoritative Ops contact data if available. Verify schema and restricted DB-role read permissions before introducing a new contact query.
- Send only in response to the user's explicit Send action for a chosen PDF revision. Submission, PDF generation and later approval must never implicitly email.
- Record recipient, authenticated sender, document revision, request/provider IDs, timestamps and genuine queued/sent/failed/unknown delivery states. Distinguish provider acceptance from actual receipt if receipt evidence is unavailable.
- Prevent duplicate sends on request replay; define how intentional resend differs from retry. Handle ambiguous provider timeouts without blindly sending another copy.
- Keep provider credentials server-side in Coolify runtime variables. Use a local email capture/test provider for automated verification; no real client email should be sent during development.

### 5. Retention and deployment documentation

- Implement/test the spec's 14-day local-retention policy with explicit eligibility and deletion time semantics. Never purge unsynced/failed/conflicted records, signature uploads or submitted intentions awaiting completion, returned records, or records awaiting driller action.
- Purge only safely eligible approved/synchronized local records after the retention window, preserving server data. Step 6 supplies approval; do not treat Submitted as Approved just to exercise cleanup. Use approved fixtures for retention tests.
- Add new immutable migrations and any Jobs-role grants for revision/signature/document/delivery storage. Preserve Ops-owned data and existing log UUIDs.
- Document provider/storage variables, durable storage, migration order and health/error behaviour in the Coolify guide. Separate application readiness from unconfigured email capability.

## Decisions to obtain during implementation

- Company sending provider and service mailbox (including authorised From/reply-to identity).
- Approved client-facing branding/template and wording; reuse existing Substrata assets as a reviewable starting point.
- Authoritative Ops client contact source and selection rule, if multiple contacts exist. Continue with an editable explicit recipient until integration is defined.
- Any desired storage/provider conventions already in use on the server. Choose reviewable local defaults for independent work; do not configure live services or guess credentials.

These are configuration/product inputs, not a reason to stop revision, acknowledgement and PDF groundwork. If production email is unconfigured at completion, report that limitation and provide a tested local delivery path; do not claim the whole delivery step is operational.

## Acceptance checks

- [ ] A valid rig log submits once, captures an immutable revision and generates a real draft PDF.
- [ ] Incomplete/invalid logs are rejected on the server with actionable validation; other users cannot submit, fetch signatures or access another user's documents outside permitted office roles.
- [ ] Every acknowledgement outcome works; unsigned logs submit; ancillary logs submit without client features.
- [ ] Offline signature and Submit survive a full browser restart and complete on reconnect, with no duplicate revision/upload on lost response or concurrent retries.
- [ ] Signed content is traceable; a material edit cannot silently reuse acknowledgement for different content.
- [ ] Submitted revisions resist later draft-sync overwrite; immutable snapshots remain unchanged as future workflow revisions are introduced.
- [ ] PDFs reflect the chosen revision, carry the draft marking and omit all internal-only fields; representative multipage PDFs are visually checked.
- [ ] No email is sent by submission or PDF generation. Explicit Send delivers the correct PDF to the selected test recipient and records history.
- [ ] Replayed send requests do not duplicate delivery; intentional resend and ambiguous failures have explicit behaviour.
- [ ] Retention removes only eligible approved/synced local records and preserves protected data/signatures/outbox work.
- [ ] Existing Step 4 regressions, contract validation, lint, build and new tests pass.

Use the isolated Docker setup from [docs/LOCAL_DOCKER.md](docs/LOCAL_DOCKER.md). Relevant commands on Windows:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run contracts:validate
npm.cmd run build
docker compose -f compose.local.yaml up --build -d
npm.cmd run test:e2e
```

The previously recorded baseline was 17 Jobs unit/domain/IndexedDB tests, seven browser/real-Postgres tests and two receiver tests in Field, plus a mocked Field UI smoke check. This handoff did not rerun those tests. Reassess the baseline before changing behaviour and add meaningful tests for the new workflow.

## Scope after this step

Step 6 covers the Ops review inbox, returns, supervisor corrections, driller confirmation, approval, reopen controls and final PDFs. Step 7 covers pilot hardening and rollout. Do not expand Step 5 into those steps; design revision/output records so they can support them later.

Review the resulting diff and local validation before requesting any rollout decision. The new thread is authorised for development; this handoff does not authorise production deployment, live data changes or emailing real clients.

## Step 5 implementation update - 14 October 2026

The original handoff/work sequence above is preserved. Step 5 adds `db/004_submission_output.sql`, `server/submissions.mjs`, `server/output.mjs`, `server/email.mjs`, `src/domain/submission.js` and `src/components/SubmissionReview.jsx`, extending the existing IndexedDB/outbox/workspace and field layout.

Local behaviour now includes actionable completeness checks; durable frozen Submit intentions; encrypted/restricted/idempotent signature storage; exact content binding and preserved earlier signed snapshots; atomic immutable submitted revisions; durable draft PDFs/checksums and generation retry; deliberate Send with Microsoft Graph and local capture adapters; genuine delivery history/replay/resend/unknown handling; and protected 14-day retention using approved fixtures. Ancillary submission has no client/signature/PDF controls. Approval/corrections and final PDFs remain Step 6.

The user selected `substrata-jobs@drilling.co.nz` as a proposed Microsoft 365 inbox/outbox and authorised best-effort PDF branding/wording. They want client/contact chosen by the supervisor in Ops job setup and offered as a dropdown. The inspected Ops schema has `jobs.client_id` and `client_contacts`, but no persisted job contact selection. Jobs provides a client-scoped dropdown and editable explicit recipient, reports the missing default and supports a future verified contact UUID column through configuration. No Ops files/planner work/live records were changed.

Production gaps: service mailbox, Entra application, restricted mailbox authorisation/admin consent, runtime credentials, persistent signature key/backup plan, contact SELECT grant and Ops job-contact selection need controlled configuration/verification. None were created or tested against production. Configuration presence is distinct from authorisation/receipt. Local email uses Mailpit without a relay; no real client was emailed. See `docs/COOLIFY_DEPLOYMENT.md` for variables, grants, durable storage, retry semantics and retention clock.

Samples in `output/pdf/step5-*` cover long Water/Geotech descriptions and a drawn signature. Their multipage layouts were rendered for visual QA. New tests are in `test/submission.test.js` and `test/e2e/submission.spec.js`, including full offline browser restart, lost response replay, PDF failure and true failed/unknown sends. The previous Geotech browser assertion now identifies the newly created record rather than assuming synchronization revision zero or selecting a historical unfinished fixture. Final verification is recorded below.

Final local verification: 25 unit/domain/IndexedDB tests, 13 browser/real-Postgres tests, lint, contract examples, production PWA/container build and draft-PDF visual/text checks pass. Critical submission/signature/Send paths were rechecked after payload cleanup; runtime dependency audit reports no production dependency vulnerabilities. The full browser suite includes the original seven Step 4 cases. Representative PDFs have two Geotech pages, two Water pages and three signed pages, with draft marking/page numbers on every page. Existing production acceptance gaps in the original handoff remain; these checks use isolated fixtures and do not claim live assignments, real-device LAN PWA acceptance or Microsoft 365 receipt. Changes remain uncommitted, including the preserved original documentation edits.
