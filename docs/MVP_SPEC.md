# Substrata Jobs MVP Product Specification

Status: MVP target specification - implementation and acceptance in progress\
Last updated: 15 October 2026\
Product scope: Water and Geotech
Current delivery stage: Jobs submission → Ops at-a-glance review/edit → project lock-in for invoicing; client deliverables optional

Priority corrected on 15 October: Jobs must capture the right information for Ops, where a supervisor can review at a glance, edit and lock it into the project for invoicing. The supervisor may lock directly after edits; returning to the driller for correction/confirmation is optional. Develop and validate Jobs and Ops together. Client-facing PDFs, signatures and email are nice-to-have follow-up features and do not gate the internal pilot. Preserve offline saving, stable point references, original submissions and attributable corrections. Sections 1-23 describe the target; section 24 records implementation. See [../PROJECT_DEVELOPMENT.md](../PROJECT_DEVELOPMENT.md) for the current sequence.

## 1. Purpose

Substrata Jobs is a device-agnostic, offline-first web application for field teams to record daily drilling and ancillary work.

It replaces the paper daily log with structured actual work submitted to Ops for supervisor review, correction and project lock-in for invoice preparation. Later capabilities include client reporting, payroll export and other integrations. Locking reviewed work does not itself create an invoice, determine rates or mean that work has been billed.

The primary field record is a daily work segment for one job, one rig, one primary driller, and one entered shift period. A record may contain multiple boreholes or test points.

## 2. System boundaries

### Substrata Ops Manager owns

- Users, authentication, roles, and login access
- Clients and client contacts
- Jobs and job numbers
- Rigs, equipment, and personnel
- Planner assignments
- Supervisor review and approval workflow

### Substrata Jobs owns

- Rig shift logs
- Ancillary-only workday records
- Actual crew attendance
- Continuous activity timelines
- Point work segments within a daily log
- Materials, services, subcontractors, and measurements
- Client acknowledgement and drawn signatures
- Submission revisions, PDFs, email-delivery records, and audit history
- Offline drafts and synchronization state

### Substrata Field and Ops Manager own

- Creation and editing of boreholes and test points
- Technical field modules such as geology, SPT, core, water, installations, backfill, and photos

Jobs may select and reference points but must not become their source of truth. If a point is missing, Jobs launches the authoritative creation workflow in Field, or in Ops Manager if that capability is added there later.

### CORE-GS owns

- Geotechnical projects, points, lookups, and production technical records
- Existing SiteRecords, Activities, Consumables, and related integration targets

The mobile application must never connect directly to Postgres or CORE-GS.

## 3. Shared identifiers

- The Ops Manager job number is identical to the CORE-GS `PROJ_ID` and is carried across all systems.
- Jobs records receive permanent UUIDs on the device before first synchronization, as defined by the implemented v1 offline contract.
- Existing sequential paper log numbers do not need to be preserved.
- The UI may display a friendly reference such as `N107 - 20 Jul - Day - 01`, but it is not a business key.

## 4. Roles and authority

### Primary driller or leading hand

- Creates and owns the working record
- Records activities for the entire crew
- Records actual crew attendance
- Selects points and records point progress
- Captures quantities, measurements, and client acknowledgement
- Submits and resubmits the record
- Responds when the supervisor chooses to return a record for correction or confirmation

Authority is established through the authenticated user account. Crew signatures are not required.

### Crew member

- Appears in planned and actual attendance
- Does not need to authenticate or sign the daily log

### Client representative

- May review the record on the driller's device
- May provide a drawn signature
- Does not require a Substrata account for on-device acknowledgement
- Remote signing is outside the MVP

### Supervisor

- Reviews submitted records in Ops Manager
- Approves or returns records
- May make administrative or material corrections
- May reopen approved records with a mandatory reason

### Administrator

- Manages users, access, catalogues, and configuration
- May reopen approved records with a mandatory reason

## 5. Record types

### 5.1 Rig shift log

Required context:

- Job number
- Rig
- Primary driller
- Entered shift start and finish

Supported content:

- Multiple points or test locations
- Crew attendance
- Continuous activity timeline
- Job and ancillary payroll allocations
- Materials, services, subcontractors, and measurements
- Client acknowledgement and client PDF

### 5.2 Ancillary-only workday

This record supports yard, workshop, training, non-job travel, and similar payroll-only work.

- Job and rig are not required.
- All activities use configured ancillary codes.
- It may be created by an individual for themselves.
- A leading hand may create one group record for multiple personnel.
- Client, point, signature, and client-PDF functions are not shown.

## 6. Assignment selection

- The home screen shows planned assignments from Ops Manager.
- `My assignments only` is enabled by default.
- The user may turn the filter off to view other active assignments.
- The user may start a log for another assignment when plans change.
- Starting work outside the user's plan is allowed but audit-logged as an assignment deviation.
- Assignment data needed for the current and upcoming work window is cached for offline use.

## 7. Shift and activity timing

### Shift entry

- Shift start and finish are exact, editable timestamps.
- Both fields provide a `Now` action.
- Day, Night, Morning, Afternoon, or Custom is a descriptive label only.
- The timestamps are authoritative and may cross midnight.
- Device time and server receipt time are retained for audit purposes.

### Continuous activity timeline

- The first activity begins at the shift start.
- `Start next activity now` finishes the current activity and starts the next at the same timestamp.
- `End shift now` finishes the active activity and the shift.
- Manual time correction remains available.
- Submission is blocked while activities are unfinished or contain gaps or overlaps.
- The first activity start must match shift start.
- The final activity finish must match shift finish.
- Subcontractor or service entries may occur concurrently without breaking the primary crew timeline.

### Activity allocation

Each activity contains:

- Start and finish
- Structured activity category
- Work description
- Optional active point or test location
- Payroll allocation type: Job or Ancillary
- Job number, defaulting to the log job, or a configured ancillary code
- Optional reporting and integration metadata

Payroll remains a separate process in the MVP, but this structure must support later payroll export without redesigning activities.

## 8. Crew attendance

- Planned personnel are loaded from the Ops Manager assignment.
- Everyone defaults to the shift start and finish.
- The driller can use `Joined now` and `Left now` or edit times manually.
- A person may have multiple attendance periods if they leave and later return.
- Personnel added or removed from the plan are recorded as deviations.
- Crew names and attendance appear in the daily-log PDF.

Future payroll time for a crew member is calculated from the intersection of their attendance periods and the coded activity timeline.

The system must detect overlapping attendance for the same person across rig logs, group ancillary records, and individual ancillary records. Unresolved overlaps block payroll export.

## 9. Point workflow

- A daily log may contain several boreholes or test points.
- The driller selects an active point; new point-related activities default to it.
- Travel, setup, safety, and other general activities may have no point.
- Changing the active point prompts for the outgoing point's finishing depth and status.
- Point status options include Started, Continued, Completed, and Abandoned, with configurable additions later.
- Technical Field records link back to both the point and daily-log UUID.

### Handover and continuation

A driller change or subsequent shift creates a new log. `Continue previous work` may carry forward:

- Job and rig
- Active point
- Previous finishing depth
- Bore size and relevant setup details
- Point status
- Reference to the preceding log

Activities, quantities, attendance, comments, and signatures are never copied into the new log.

## 10. Materials, services, and measurements

- Water and Geotech use the same base daily-log form.
- Materials, subcontractors, services, and other chargeable items use division-specific configurable catalogues.
- Each catalogue supports an `Other` entry with description and unit.
- Quantities retain units and may later map to invoice and CORE-GS codes.
- The MVP supports the critical fields from the existing paper form, including water readings and meter details where applicable.
- Photos remain in Substrata Field for the MVP.

## 11. Client acknowledgement

Client acknowledgement is optional and must never block log submission.

Supported outcomes:

- Signed on device
- Not available
- Declined
- Not required
- Will sign later
- Other, with a note

Captured signature data includes:

- Representative name
- Company or role, when supplied
- Drawn signature
- Signature timestamp
- The exact submitted revision being acknowledged
- Optional client email

Material changes made after signing cause the signature to remain attached to the earlier revision. The current revision clearly indicates that the prior signature no longer covers the changed content.

## 12. Submission, review, and corrections

### Workflow states

- Draft
- Submitted
- Returned
- Awaiting driller confirmation
- Approved
- Reopened

Synchronization state is independent of workflow state and includes Local, Pending, Synced, and Failed.

### Submission

- Submission runs all completeness and timeline validations.
- Submission creates an immutable revision.
- Structured work is available for supervisor review in Ops independently of client output.
- The current implementation also generates a draft PDF for rig submissions; this is an existing optional-output behaviour, not the acceptance target.
- The PDF is not emailed automatically.

### Supervisor review

- Review shows the job/rig/shift/crew, activity totals, bore progress, quantities/units, services/subcontractors, comments and exceptions at a glance, with details available.
- The supervisor can edit and lock the reviewed revision directly to the project for invoice preparation.
- Lock-in records the exact reviewed version, project, reviewer and timestamp. The project exposes its agreed totals with links to source records.
- Current `approved` locks the log; the project invoicing view and supervisor editing still need implementation. Reuse or extend that transition after defining the contract rather than silently equating it with an invoiced state.
- Return sends the record to the driller with required comments.
- Driller corrections create a new revision before resubmission.

### Supervisor corrections

Supervisors may correct the following and lock directly; driller confirmation is not mandatory:

- Shift or activity time
- Quantity or unit
- Personnel or attendance
- Point or work allocation
- Payroll job or ancillary coding
- Description of work performed

Administrative corrections also remain attributable:

- Spelling
- Formatting
- Report presentation
- Internal supervisor notes

The supervisor may instead return a record for correction or confirmation with a clear comment. A requested driller action remains visible until resolved or explicitly withdrawn through an audited supervisor decision. All corrections preserve the submitted original and before/after values with actor/time/reason. Signatures cannot be edited or silently applied to changed content.

### Project lock-in and invoicing basis

- Expose locked daily work under the correct Ops project, with agreed activity/quantity totals and source revision links.
- Keep recorded actuals distinct from any supervisor chargeable classification. Agree the required units/grouping and billing treatment rather than inventing rates or invoice lines.
- Only the effective locked version contributes to invoice-preparation totals; draft, returned, superseded and awaiting-action work must not be silently included.
- Controlled corrections/reopening preserve prior versions and must not double-count replaced work. Define handling of already-used invoice inputs before implementing that boundary.
- Invoice creation, pricing and accounting integration are separate scope from reviewing and locking daily work.

### Reopening approved records

- Supervisor or Administrator authority is required.
- A reason is mandatory.
- Reopening creates a new revision and preserves the approved version.

## 13. Optional follow-up: PDF and client email

Existing signature/PDF/email implementations are preserved. Their refinement, final-PDF generation, mailbox/contact setup and production delivery acceptance are deferred from the core operational pilot. The requirements below apply when those optional features are used; they must not block submission, supervisor review/editing or project lock-in.

### Draft PDF

- Generated on driller submission
- Marked `DRAFT - Awaiting Supervisor Approval`
- Represents an immutable submitted revision
- Includes client signature status and acknowledgement details

### Final PDF

- May be generated after supervisor approval
- Does not carry the draft watermark
- Remains tied to its approved revision

### Client PDF content

Includes:

- Job, site, rig, shift, and crew
- Point progress
- Activity timeline and work descriptions
- Relevant quantities, services, and measurements
- Comments and client acknowledgement

Excludes:

- Payroll and ancillary codes
- Internal supervisor notes
- Audit history
- Internal integration and sync status

### Email delivery

- Client email may be pre-populated from Ops Manager and edited for the log.
- Every draft or final email requires a deliberate `Send` action.
- PDF generation or approval never sends email automatically.
- The audit history records recipient, sender, PDF revision, and timestamp.
- MVP email is PDF delivery only; remote signing is deferred.

## 14. Payroll periods and local retention

- Payroll operates on a 14-day cycle.
- Periods end at midnight every second Sunday in New Zealand local time.
- The configured anchor is Sunday 26 July 2026.
- Subsequent period ends repeat every 14 days from that date.
- New Zealand time rules are applied server-side and on the device.

Completed local records remain available for 14 days. Unsynced records, failed uploads, returned records, and records awaiting driller action must never be automatically purged.

Approved and successfully synchronized records may be removed from the device after the retention window while remaining available from the server.

## 15. Offline and synchronization requirements

- The application is an installable Progressive Web App.
- Every field edit is committed locally before network upload is attempted.
- The active log survives app closure, browser restart, and connectivity loss.
- Users can see Pending, Synced, and Failed states at all times.
- An explicit `Sync` action is always available.
- Server writes use stable UUIDs, revisions, and idempotency keys so retries cannot create duplicates.
- Assignment and catalogue caches support starting planned work without coverage.
- Approved server data is not silently overwritten by an offline device.
- Conflict resolution preserves both versions until an authorized user resolves the conflict.

## 16. Personal-device security

- Jobs uses shared Ops Manager authentication and role authority.
- Cached data is limited to relevant assignments and the retention window.
- Administrators can revoke login sessions.
- Sensitive server credentials never reach the browser.
- Client signature images are uploaded through the API and stored with restricted access.
- Audit events identify user, device/session, timestamp, revision, and action.
- Older server records may require reauthentication before viewing.

## 17. MVP screens

### Field PWA

1. Sign in
2. My assigned work
3. All active assignments, when the default filter is disabled
4. Start rig shift or ancillary workday
5. Active-log overview
6. Shift timing and crew attendance
7. Continuous activity timeline
8. Points and depth progress
9. Materials, services, subcontractors, and measurements
10. Launch technical Field module
11. Optional client acknowledgement (secondary)
12. Validation, review, and submission
13. Optional draft PDF preview and deliberate email send (secondary)
14. My records, returned items, and sync status

### Ops Manager

1. Submitted-log review inbox
2. At-a-glance work summary with log/revision detail
3. Edit and lock into the project, or optionally return for correction/confirmation
4. Optional requested-driller-action status
5. Approved-log reopen action
6. Project locked-work view and agreed totals for invoice preparation
7. Activity and materials catalogue administration

PDF/email history remains optional secondary functionality.

## 18. Integration architecture

Recommended implementation shape:

- `substrata-jobs`: React/Vite PWA
- Shared Ops Manager API and Postgres: authentication, assignments, operational master data, and daily-log persistence
- IndexedDB: offline assignments, catalogues, drafts, signatures, and pending sync queue
- Server-side PDF service: immutable revision PDFs
- Server-side email service: company service mailbox delivery
- Jobs server-side CORE-GS helper: read-only point selection by configured client and Ops job number
- Substrata Field API: technical-module and point-creation handoff

Field context handoff contains the authenticated user, job number, point ID, daily-log UUID, and return destination. It should use same-origin routing or a short-lived server-issued handoff token, not database credentials or editable query-string authority.

## 19. MVP non-goals

- Remote client signing
- Replacing the existing payroll/timesheet process
- Automatic payroll export
- Direct invoicing integration
- Automatic client email
- Photo capture in Jobs
- Point ownership or editing in Jobs
- Rebuilding every Substrata Field module inside Jobs
- Full replacement of CORE-GS SiteRecords integrations

## 20. Delivery stages

### Stage 1 - Foundation

- Shared authentication and authorization
- Assignment feed
- PWA shell and offline database
- Sync protocol, revisioning, and audit framework

### Stage 2 - Core field entry

- Rig and ancillary record creation
- Shift controls and continuous activities
- Crew attendance
- Multiple points, depth prompts, and handover

### Stage 3 - Commercial and site data

- Division-specific catalogues
- Materials, services, subcontractors, and measurements
- Future payroll allocation fields

### Stage 4 - Reliable structured submission

- Validation
- Immutable revision generation
- Reliable availability in the Ops review inbox
- Existing client signature/PDF/email retained as optional follow-up

### Stage 5 - Office workflow

- Ops Manager review inbox
- At-a-glance review, supervisor editing and direct lock-in
- Optional return for driller correction/confirmation
- Project-linked reviewed figures for invoice preparation
- Reopen workflow and audit history
- Final client PDF deferred to optional follow-up

### Stage 6 - System integration

- Field context handoff
- CORE-GS SiteRecords, Activities, and Consumables mapping
- Later invoice creation/accounting integration, payroll export, reporting and compliance outputs
- Remote client signing in a later phase

## 21. MVP acceptance criteria

The MVP is ready for pilot when:

- A driller can download an assignment, lose coverage, complete a full multi-point shift log, and close the app without losing data.
- Shift activities cannot be submitted with gaps, overlaps, or unfinished entries.
- Planned and actual crew attendance can differ and is correctly recorded.
- Job and ancillary time is structurally ready for per-person payroll calculation.
- A leading hand can complete a group ancillary day without a job or rig.
- A handover creates a new log and carries forward point context without copying prior work records.
- Submitted work is available as structured information for at-a-glance Ops review without requiring a PDF, signature or email setup.
- A supervisor can edit and lock directly or optionally return work for correction/confirmation, with original and corrected versions attributable.
- The correct effective locked revision appears under the project with the agreed invoice-preparation figures; replaced versions are not double-counted.
- Controlled correction/reopening preserves the prior locked version and changes are synchronized back to Jobs.
- Offline retries do not duplicate records.
- Records remain locally available for the retention window and unsynced work is never purged.

Client signatures, draft/final PDF acceptance and client delivery are optional follow-up checks. When used, client output excludes internal-only data and email always requires a deliberate Send action.

## 22. Remaining configuration work

The operational loop is the agreed priority. Information/aggregation rules for project invoice preparation and the supervisor edit/lock contract still need definition. Core configuration includes:

- Water and Geotech material/service catalogues
- Ancillary payroll-code list
- Activity-category list
- Point status and bore-size lookups
- Pilot users, rigs, and jobs

Optional client-output configuration is deferred: client-facing PDF branding/wording, service mailbox/provider, client contact defaults and signature-key recovery when signatures are used.

## 23. MVP delivery plan

The implementation will proceed as a thin vertical slice so the field workflow is validated before the production data model and cross-system contracts are locked down.

### Step 1 - Clickable mobile UX prototype

Build a device-agnostic, mobile-first PWA prototype using realistic mocked assignments and catalogues. The prototype must cover:

- assignment selection with **My assignments only** enabled by default
- starting a rig-shift or ancillary-only daily log
- exact shift start and end controls with **Now** actions
- a continuous activity timeline with job and ancillary allocation
- multiple points, point changes, depths, statuses, and handover context
- whole-crew attendance with join and leave times
- site data, materials, services, measurements, and notes
- submission validation and reliable structured delivery to Ops
- offline and sync status states visible throughout the workflow

The prototype will include at least these walkthrough scenarios:

1. A Geotech rig shift working across two boreholes with a crew change and no client signature.
2. A group ancillary-only day split between workshop work and non-job travel.
3. A Water rig shift to confirm that the shared daily-log structure supports both divisions.

**Exit criterion:** a driller or leading hand can walk through a complete shift using realistic data without explanation from the designer, and the field team agrees that the flow is workable on a personal phone.

### Step 2 - Shared data contracts

Define versioned contracts between Ops Manager, Jobs, and Field for authentication, job numbers, assignments, rigs, people, points, catalogues, daily-log revisions, and Field context handoff. Confirm which existing Ops Manager APIs can be extended and document all source-of-truth boundaries.

**Exit criterion:** representative JSON payloads and database mappings are agreed for the prototype scenarios, including stable IDs and offline conflict rules.

### Step 3 - PWA and deployment foundation

Establish the production PWA shell, device database, sync queue, authentication session, environment configuration, health checks, and Coolify deployment topology. Provision the application and PostgreSQL services with separate development, staging, and production configuration.

**Exit criterion:** an authenticated user can install the staging PWA, cache assignments, work offline, reconnect, and sync a harmless test record without duplication.

### Step 4 - Core daily-log vertical slice

Implement rig and ancillary record creation, shift controls, activity continuity, crew attendance, multi-point work, handover, catalogued site data, and autosave using the production contracts.

**Delivery checkpoints:**

1. **Field workflow complete:** both primary prototype scenarios can be completed offline, survive app closure or refresh, and resume without data loss.
2. **Integration complete:** the resulting daily logs synchronize idempotently and are visible as structured records in the office system.

### Step 5 - Reliable submission (existing client output optional)

Validate and capture immutable submitted revisions, durable offline intentions, reliable Ops visibility and safe local retention. Existing client acknowledgement/signature, PDF and delivery functions are preserved as optional features; further output work is deferred.

**Exit criterion:** the exact submitted work arrives once in Ops with correct project/crew/bore attribution and units, without requiring client deliverables.

### Step 6 - Office review workflow

Implement at-a-glance Ops review, supervisor correction/direct lock-in, optional return for driller correction/confirmation, project-linked reviewed figures for invoice preparation, controlled reopening and attributable revision history. Changes may alternate between Jobs and Ops. Final client PDFs are optional follow-up.

**Exit criterion:** the supervisor can quickly review, correct and lock a traceable version to the project for invoice preparation; Jobs reflects the result and project totals include only the effective locked work.

### Step 7 - Pilot hardening and rollout

Pilot with a small mixed group of Water and Geotech users. Test personal Android and iOS devices, poor and absent coverage, shift handover, payroll-period boundaries, duplicate retry protection, retention, and operational support procedures.

**Exit criterion:** the agreed pilot cohort completes two payroll fortnights with no lost records or unresolved critical workflow defects, after which MVP rollout can be approved.

### Coolify deployment direction

Coolify is the intended hosting platform. The target topology is:

- a containerised Substrata Jobs PWA/API service
- PostgreSQL as the operational database, with managed backups
- server-side PDF and email workers or service endpoints
- environment-specific secrets and service URLs managed in Coolify
- health checks, persistent storage only where required, and migration commands controlled during deployment

The field screens now use authenticated Ops assignments and persisted daily-log aggregates. Mocked walkthroughs have been removed. Environment-specific database migrations remain controlled deployment actions.

## 24. Implementation progress

### Step 1 - Complete for review

The initial clickable mobile-first prototype covered Geotech, Water, and ancillary-only work. Step 4 has replaced its mocked state with live assignments and locally persisted daily logs while retaining the screen design.

### Step 2 - Contract pack established as the implementation baseline

The additive v1 integration contract is documented in `docs/INTEGRATION_CONTRACTS.md` and `contracts/v1`. It includes implemented entry/submission contracts and planned lifecycle states; a schema state alone does not establish that its full workflow is implemented.

The contract pack contains:

- source-of-truth boundaries derived from the current Ops Manager and Field repositories
- stable identity rules for users, assignments, jobs, equipment, daily logs, and points
- the invariant `job_number = PROJ_ID`
- a compact 14-day assignment/bootstrap contract
- a complete daily-log aggregate for Water, Geotech, and ancillary records
- client-generated UUIDs and idempotent offline sync rules
- lifecycle and revision states for submission, review, return, confirmation, approval, and reopen
- a short-lived, single-use Jobs-to-Field handoff contract
- a proposed PostgreSQL `jobs_app` schema alongside Ops-owned master data
- validated representative payloads for all three prototype scenarios

The contract pack became the implementation baseline. Database migrations were subsequently added during Steps 3 and 4; applying them remains an environment-controlled deployment action.

### Step 3 - Foundation deployed and verified

The shared-cluster and shared-identity assumptions were approved on 20 July 2026. The repository now includes:

- a same-origin Node API and PWA container for Coolify
- an initial `jobs_app` PostgreSQL migration with catalogue, device, and sync-probe tables
- shared Ops credential validation with a Jobs-specific secure session cookie
- a compact assignment and catalogue bootstrap endpoint
- IndexedDB caching for the 14-day field workspace
- authenticated offline resume without storing password or bearer tokens in browser storage
- a harmless idempotent sync probe used to verify device-to-server reconnection
- health endpoints separating container health from database/integration health
- restricted PostgreSQL role and Coolify environment guidance

The foundation was deployed and its shared Ops login and prototype behaviour were verified on 3 September 2026.

### Step 4 - Implemented, locally verified, and deployed; remaining acceptance checks tracked

The repository now includes the production-shaped domain, local persistence, synchronization, and server persistence needed for an editable daily-log aggregate:

- client-side creation of rig-shift and ancillary logs with stable UUIDs and assignment snapshots
- continuous activity transitions that close and start at the same instant
- multi-point transitions with finishing depth and status validation
- shift completion and submission-readiness validation
- IndexedDB stores for daily logs, pending mutations, and synchronization metadata
- local autosave primitives that atomically store a log and queue its latest mutation
- authenticated, idempotent `POST /api/v1/sync` handling with revision-conflict detection
- PostgreSQL persistence for daily logs, points, crew attendance, activities, items, sync mutations, and audit events
- server-side ownership, contract, point/job, allocation, and editability validation
- automated coverage for the core client domain and server sync validation

The Step 4 UI and integrations now include:

- live assignment selection, with My assignments only enabled by default and all assignments cached for offline plan changes
- starting-point selection and planned-crew replacement; the active Ops personnel picker defaults to matching division and region with Show all users
- activity descriptions, allocation and time corrections; crew attendance periods including leave/rejoin; point changes, depths and statuses
- division-specific catalogue items and Other descriptions/units for materials, services, measurements and subcontractors; bore setup and daily notes
- atomic local autosave, active-log recovery, unfinished editor-field recovery and synchronization on reconnection
- real Local, Pending, Synced, Failed and Conflict indicators, retry controls and deliberate conflict reconciliation preserving both versions
- immutable in-flight mutation payloads, safe retry after a lost acknowledgement, and serialized concurrent server creates/retries
- continuation into a new log carrying point/setup context without copying earlier work entries
- direct server-side CORE-GS point reads scoped by client/project, and five-minute single-use Field context handoffs with companion receiver/context changes in the Field repository
- structured log reads and a supervisor-only office view; sync audit snapshots include device/time and assignment/crew deviations
- browser and real-Postgres coverage for the Geotech multi-point, group ancillary and Water workflows

On 14 October 2026, the user reported Jobs/Field deployed and working, while the inspected live Ops planner had no current plans. Read-only inspection of Ops source at `af45f0a` on 15 October confirms planner persistence and structured crew assignments are now implemented. Their deployed state and current plans were not checked; verify those rather than treating the older source gap as current.

Current saved Ops assignments, personal-device offline/restart and structured office visibility remain environment checks. The combined Daily log screen adds paper-based bore details, work descriptions/times, readings and quantity shortcuts with migration 005. The next product checkpoint pairs its realistic phone walkthrough with the supervisor's Ops summary and invoice-preparation needs.

### Step 5 - Implemented locally: configuration and staging acceptance pending

The section 23 scope is implemented locally: submission validation, optional on-device acknowledgement, durable encrypted signature upload, immutable submitted revisions, server-rendered draft PDFs, deliberate email delivery/history and safe local-retention rules. See `../PROJECT_DEVELOPMENT.md` for current acceptance gates and implementation locations.

Submission and existing PDF generation are server-authoritative and revision-linked. Offline submission preserves the exact intended content until acknowledged. Ancillary records submit internally without client controls. Reliable structured submission remains core; client output is optional follow-up. The first approve/return slice exists; supervisor editing/direct lock-in and project invoice-preparation views are next.

Production email authorisation, client-facing wording and Ops contact access/selection still need configuration and acceptance. Unconfigured delivery does not prevent submission or draft PDF generation. Local test capture establishes provider acceptance and attachment content rather than production delivery or actual receipt.

The proposed Microsoft 365 mailbox `substrata-jobs@drilling.co.nz`, draft wording and client-scoped contact dropdown remain available for later client-output work. Mailbox/Entra access, signature key/recovery and contact default/access acceptance are deferred; they do not gate the internal pilot. Local Mailpit tests establish capture and attachment content rather than production receipt. See `docs/COOLIFY_DEPLOYMENT.md` and the optional follow-up in `PROJECT_DEVELOPMENT.md`.

### Step 6 - First approve/return slice implemented locally; remaining lifecycle outstanding

The companion Ops API/inbox supports approve and return decisions, with review idempotency/history in Ops migration 016. Jobs supports returned comments, owner correction/resubmission, approved state/locking and review reconciliation after dormant-device reconnects. Office metadata remains server-owned and old submitted/signed snapshots remain immutable. Jobs' own office screen is still read-only. See [OFFICE_REVIEW_INTEGRATION.md](OFFICE_REVIEW_INTEGRATION.md).

The previous disposable shared-database run exercised submit, return/comment, owner correction/resubmission, approval and Jobs locking. Source inspection on 15 October confirms those actions but no supervisor content editing or project invoicing view. Next: at-a-glance summaries, authorised supervisor corrections/direct lock-in, optional return for correction/confirmation, controlled reopening and effective locked project figures. The earlier mandatory material-change confirmation rule is superseded by the user's 15 October decision. Existing PDFs remain drafts; final client PDFs are optional follow-up.

### Step 7 - Pilot and rollout acceptance outstanding

Pilot the internal Jobs → Ops review/edit/lock → project invoice-preparation loop after paired usability and connected-workflow acceptance. Cover Water/Geotech and ancillary work on Android/iOS, weak/no coverage, handover, payroll boundaries, retries/conflicts, effective-version project totals and recovery. Client output is not a pilot prerequisite. The target remains two payroll fortnights without lost records or unresolved critical workflow defects before wider rollout approval.

### Verification baseline - 15 October 2026

Fresh repository inspection at `7c50c70` passed all 38 unit/domain/IndexedDB tests, lint, contract validation and the production/PWA build. Docker Desktop's Linux engine was unavailable, so browser/Postgres tests and the Docker build were not rerun. The latest recorded 14 October CORE-GS validation passed 16 browser/API tests and Docker/PWA build; separate office integration exercised a disposable shared database. These do not establish the new supervisor edit/lock/project features or production readiness. Core environment acceptance includes Ops assignments, shared-schema permissions, CORE-GS and personal-phone HTTPS offline/restart. Signature/email/contact acceptance is optional follow-up. The priority correction changed documentation, not runtime behaviour.
