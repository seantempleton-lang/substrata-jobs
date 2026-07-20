# Substrata Jobs MVP Product Specification

Status: Draft baseline  
Last updated: 20 July 2026  
Product scope: Water and Geotech

## 1. Purpose

Substrata Jobs is a device-agnostic, offline-first web application for field teams to record daily drilling and ancillary work.

It replaces the current paper daily log while creating structured records that can later feed invoicing, client reporting, payroll, compliance, and other Substrata systems.

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
- All Jobs records use server-generated UUIDs as their permanent identifiers.
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
- Confirms or rejects material supervisor corrections

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
- A draft client PDF is generated for that revision.
- The PDF is not emailed automatically.

### Supervisor review

- Approval locks the current revision.
- Return sends the record to the driller with required comments.
- Driller corrections create a new revision before resubmission.

### Supervisor corrections

Material changes require driller confirmation:

- Shift or activity time
- Quantity or unit
- Personnel or attendance
- Point or work allocation
- Payroll job or ancillary coding
- Description of work performed

Administrative changes do not require driller confirmation:

- Spelling
- Formatting
- Report presentation
- Internal supervisor notes

All corrections are audit-logged. Signatures cannot be edited by supervisors.

### Reopening approved records

- Supervisor or Administrator authority is required.
- A reason is mandatory.
- Reopening creates a new revision and preserves the approved version.

## 13. PDF and client email

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
11. Client acknowledgement
12. Validation, review, and submission
13. Draft PDF preview and deliberate email send
14. My records, returned items, and sync status

### Ops Manager

1. Submitted-log review inbox
2. Log and revision detail
3. Return, correct, or approve actions
4. Driller-confirmation status
5. Approved-log reopen action
6. PDF and email history
7. Activity and materials catalogue administration

## 18. Integration architecture

Recommended implementation shape:

- `substrata-jobs`: React/Vite PWA
- Shared Ops Manager API and Postgres: authentication, assignments, operational master data, and daily-log persistence
- IndexedDB: offline assignments, catalogues, drafts, signatures, and pending sync queue
- Server-side PDF service: immutable revision PDFs
- Server-side email service: company service mailbox delivery
- Substrata Field API: technical-module and CORE-GS bridge

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

### Stage 4 - Submission and client output

- Validation
- Drawn signature
- Immutable revision generation
- Draft PDF and deliberate email send

### Stage 5 - Office workflow

- Ops Manager review inbox
- Return, material correction, driller confirmation, and approval
- Reopen workflow and audit history
- Final PDF

### Stage 6 - System integration

- Field context handoff
- CORE-GS SiteRecords, Activities, and Consumables mapping
- Payroll, invoicing, reporting, and compliance outputs
- Remote client signing in a later phase

## 21. MVP acceptance criteria

The MVP is ready for pilot when:

- A driller can download an assignment, lose coverage, complete a full multi-point shift log, and close the app without losing data.
- Shift activities cannot be submitted with gaps, overlaps, or unfinished entries.
- Planned and actual crew attendance can differ and is correctly recorded.
- Job and ancillary time is structurally ready for per-person payroll calculation.
- A leading hand can complete a group ancillary day without a job or rig.
- A handover creates a new log and carries forward point context without copying prior work records.
- A client can sign on the device or the driller can record why no signature was obtained.
- Submission creates a draft PDF that excludes internal payroll and review data.
- No client email is sent without a deliberate action.
- A supervisor can approve, return, correct, or reopen a log with the agreed confirmation rules.
- Offline retries do not duplicate records.
- Records remain locally available for the retention window and unsynced work is never purged.

## 22. Remaining configuration work

The product structure is agreed. Implementation still requires operational configuration rather than further architecture decisions:

- Water and Geotech material/service catalogues
- Ancillary payroll-code list
- Activity-category list
- Point status and bore-size lookups
- Client-facing PDF branding and wording
- Company service mailbox and sending provider
- Pilot users, rigs, and jobs

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
- optional client acknowledgement, drawn signature, absence reason, and email
- submission validation, draft PDF status, and deliberate client-send action
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

**Exit criterion:** both primary prototype scenarios can be completed offline and are visible as structured records in the office system.

### Step 5 - Submission and client output

Add validation, drawn signature, signature-unavailable reasons, immutable submitted revisions, server-rendered draft PDFs, deliberate email delivery, local retention, and delivery history.

**Exit criterion:** a submitted log produces an auditable PDF and is never emailed without an explicit user action.

### Step 6 - Office review workflow

Implement the Ops Manager review inbox, return-for-correction flow, supervisor material corrections, driller confirmation, approval, reopen controls, final PDFs, and complete audit history.

**Exit criterion:** a log can complete the full driller-client-supervisor lifecycle with every material change attributable and confirmed under the agreed rules.

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

The Step 1 prototype uses mocked data and device-local state. Database provisioning begins after the shared contracts in Step 2, avoiding premature schema commitments while the field workflow is still being validated.
