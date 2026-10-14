# Substrata Jobs integration contract

Status: proposed v1 for Step 2 review  
Last updated: 20 July 2026  
Contract root: `contracts/v1`

## 1. Purpose

This contract defines how Substrata Ops Manager, Substrata Jobs and Substrata Field exchange operational context without creating competing sources of truth.

It is based on the current repositories:

- Ops Manager already owns `app_users`, `jobs`, `clients`, `equipment`, and `planner_assignments` in PostgreSQL.
- Ops Manager exposes authenticated session and bootstrap endpoints using a `substrata_session` cookie.
- Field identifies projects and points with CORE-GS `PROJ_ID` and `POINT_ID`.
- Field treats CORE-GS as the source of truth for projects, points, lookups, and technical field records.
- Field currently uses IndexedDB pending records and a Postgres/API bridge for offline sync.

## 2. Architectural decision

Substrata Jobs is deployed as its own PWA and API resource in the same Coolify production environment as Ops Manager. The Jobs API connects to the same PostgreSQL cluster using its own restricted database role and owns tables in the `jobs_app` schema.

The browser communicates only with the same-origin Jobs API:

```text
Jobs PWA
  -> /api/v1/* on the Jobs origin
  -> Jobs API
      -> Ops-owned PostgreSQL tables (read operational master data)
      -> jobs_app tables (read/write daily-log data)
      -> CORE-GS SQL Server (read-only point references, scoped by client/project)
      -> Field API (short-lived handoff only)
```

The PWA must never receive database credentials or connect directly to PostgreSQL, MSSQL, or CORE-GS.

## 3. Source-of-truth boundaries

| Data | Owner | Jobs access | Stable identity |
|---|---|---|---|
| Authentication accounts and users | Ops Manager | Authenticate and read | `app_users.id` UUID |
| User-facing employee identity | Ops Manager | Read and snapshot | `employee_code` |
| Jobs and job numbers | Ops Manager | Read | `jobs.id` UUID plus `job_number` |
| Clients and contacts | Ops Manager | Read | `clients.id` UUID |
| Rigs and equipment | Ops Manager | Read | `equipment.id` UUID plus `equipment_code` |
| Planned assignments | Ops Manager | Read | `planner_assignments.id` UUID |
| Activity and ancillary catalogues | Ops Manager administration, Jobs operational use | Read | immutable catalogue code |
| Daily logs and revisions | Jobs | Read/write | client-generated UUID |
| Actual crew attendance | Jobs | Read/write | attendance UUID plus `app_users.id` |
| Daily activities and allocations | Jobs | Read/write | client-generated UUID |
| Client acknowledgements and PDFs | Jobs | Read/write | UUID plus log revision |
| Point references | CORE-GS | Read through Jobs' server-side CORE-GS helper | configured `CLNT_ID + PROJ_ID + POINT_ID` |
| Geology, testing, installation, backfill and photos | Field / CORE-GS | Context handoff only | Field-defined natural keys |

Jobs may snapshot display values such as job title, client name, employee name, rig code, and point label so historical PDFs remain intelligible. A snapshot does not transfer ownership.

## 4. Identifier rules

### 4.1 UUIDs

All Jobs-owned records use RFC 4122 UUIDs generated on the device before first sync. This allows records to be created offline and makes retries idempotent.

The client must never replace an ID after sync. The API treats creation of the same UUID with the same payload as a successful retry and rejects reuse with materially different data.

### 4.2 Job identity

Every job reference carries both:

- `jobId`: Ops Manager `jobs.id` UUID for database relationships.
- `jobNumber`: the stable business code displayed to users and passed to Field as CORE-GS `PROJ_ID`.

The integration invariant is:

```text
Ops Manager jobs.job_number = Jobs jobNumber = Field/CORE-GS PROJ_ID
```

Jobs must reject a payload where `jobId` resolves to a different `jobNumber`.

### 4.3 Point identity

Jobs does not create an independent point UUID. A point is referenced by:

```json
{
  "jobNumber": "302670",
  "pointId": "BH5049"
}
```

This maps to CORE-GS `PROJ_ID + POINT_ID`. Point creation or editing remains a Field operation.

Jobs now duplicates Field's read-only CORE-GS connection/point helper in `server/coregs.mjs`. Both assignment bootstrap and authenticated `GET /api/v1/points?jobNumber=...` query `dbo.POINT`, using typed `CLNT_ID` and `PROJ_ID` parameters and Field's sort order. `CORE_GS_*` settings remain server-only. There is no Field HTTP or Field-cache fallback for point reads. Failed reads keep `pointFeedAvailable=false`; the device retains previously cached point references. Field launch/create-point handoffs remain separate and optional. No CORE-GS master data is written by Jobs.

### 4.4 People and crew

Planned assignment personnel must be normalised from the current name-only JSON array to objects containing `userId`, `employeeCode`, and `displayName`.

Actual attendance uses `app_users.id` when the person is an authenticated employee. `displayNameSnapshot` is retained for historical output. An exceptional external crew member may have a null `userId`, but requires a name and audit note.

### 4.5 Equipment

Rig references carry `equipmentId` and `equipmentCode`. The code remains visible and can map to CORE-GS `Rig`; the UUID is used for Ops relationships.

## 5. Time contract

- API timestamps use ISO 8601 UTC, for example `2026-07-19T19:00:00.000Z`.
- Every daily log also stores the IANA timezone, initially `Pacific/Auckland`.
- Shift and activity times are full instants, not time-only values.
- An activity starts exactly when the prior activity ends unless an authorised correction explicitly changes both boundaries.
- Overnight shifts are represented by instants and do not require date-specific exceptions.
- The payroll fortnight is derived from the configured anchor ending Sunday 26 July 2026 at midnight in `Pacific/Auckland`.

## 6. Authentication and authorisation

Jobs reuses the Ops identity tables and role hierarchy:

```text
FieldUser < Maintenance < Supervisor < Administrator < SuperUser
```

For MVP, users authenticate on the Jobs origin with their existing Ops credentials. The Jobs API validates against the shared Ops identity store and sets an HTTP-only, Secure, SameSite=Lax cookie scoped to the Jobs host.

The browser must not store a bearer session token in LocalStorage or IndexedDB. Offline access is limited to already authenticated, previously downloaded work and expires according to the local offline-session policy.

Minimum permissions:

| Action | Minimum role / rule |
|---|---|
| View assignments | Authenticated active user |
| Create or edit own/team daily log | Assigned driller/leading hand or Supervisor |
| View other assignments | Authenticated user with filter enabled |
| Submit daily log | Record owner or authorised leading hand |
| Supervisor review/return/correct | Supervisor |
| Reopen approved log | Administrator |
| Catalogue and access administration | Administrator |

## 7. Assignment bootstrap

Jobs uses a dedicated, compact bootstrap response rather than downloading the existing all-system Ops `/api/bootstrap` payload.

```http
GET /api/v1/bootstrap?from=2026-07-20&to=2026-08-02&myAssignmentsOnly=true
```

The default range covers the current 14-day offline window. The response contains:

- current user and permissions
- matching assignments
- referenced jobs, clients, equipment, personnel, and planned points
- versioned activity, ancillary, material, service and measurement catalogues
- server time and a sync cursor

Assignment responses include stable UUID references and display snapshots. Jobs may show assignments belonging to other users when `myAssignmentsOnly=false`, but server-side authorisation still controls who may edit them.

## 8. Daily-log lifecycle

The v1 status machine is:

```text
draft
  -> submitted
  -> under_review
      -> returned -> draft
      -> awaiting_driller_confirmation -> submitted
      -> approved
approved -> reopened -> draft
```

- `draft`: editable by the driller/leading hand.
- `submitted`: immutable revision created; draft PDF available.
- `under_review`: supervisor has opened the record.
- `returned`: supervisor requested driller changes.
- `awaiting_driller_confirmation`: supervisor changed time, quantity, personnel, or work.
- `approved`: final immutable revision and PDF.
- `reopened`: authorised administrative action created a new draft from an approved revision.

Administrative changes that do not affect time, quantities, personnel, or work may produce a new revision without driller confirmation, but still require an audit event.

## 9. Offline sync contract

The device maintains an append-only mutation queue. Each mutation contains:

- `mutationId`: device-generated UUID and idempotency key
- `entityType` and `entityId`
- `operation`: `upsert` or `delete_draft_child`
- `baseRevision`: last server revision seen by the client
- `occurredAt`: device timestamp
- `payload`: complete entity state for deterministic replay

```http
POST /api/v1/sync
Idempotency-Key: <batch UUID>
```

The server returns an acknowledgement per mutation:

- `applied`: mutation committed
- `duplicate`: already committed; safe to remove locally
- `conflict`: server revision differs; keep locally for resolution
- `rejected`: validation or authorisation failure; keep locally and display action

Submitted or approved revisions are never overwritten through sync. Corrections create a new draft/revision workflow.

Daily bore input adds optional `points[].dailyDetails` for daily-record bore context and readings. Migration `005_daily_bore_details.sql` persists it to `jobs_app.log_points.daily_details` as well as the aggregate; existing drafts without it remain valid. Bore/permit/purpose/grid context, current depth, paired AM/PM depth-to-water and bore depths, and meter serial/start/finish/unit are log snapshots, not Field master-data writes. Partial readings may synchronize as drafts; completeness is checked on submission. Quick material/service quantities remain existing `items` with a point-segment reference. Empty entries are absent; explicit zero/Not used remains recorded.

The bootstrap `syncCursor` is opaque. Incremental pulls use:

```http
GET /api/v1/sync?cursor=<opaque cursor>
```

## 10. Field handoff

Jobs launches Field with a server-created, single-use handoff rather than editable authority in the URL.

```http
POST /api/v1/field-handoffs
```

The request identifies the daily log, job and point. The Jobs API verifies the user and returns a launch URL containing only a short-lived opaque token.

```text
https://substrata-field.mcm/handoff?token=<opaque-one-time-token>
```

Field consumes the token server-to-server or through its authenticated API. The resolved context includes:

- user UUID and employee code
- `jobNumber` / `PROJ_ID`
- `pointId` / `POINT_ID`
- Jobs daily-log UUID
- allowed modules
- return URL
- expiry, initially five minutes

The handoff grants context, not additional permissions. Field still authorises its own operations and retains ownership of points and technical records.

## 11. Client acknowledgement and email

Client acknowledgement states are:

- `signed_on_device`
- `not_signed`
- `not_required`

Step 5 preserves these statuses for compatibility and adds absence codes `WILL_SIGN_LATER` and server-generated `CONTENT_CHANGED` alongside `CLIENT_UNAVAILABLE`, `CLIENT_DECLINED`, `REMOTE_UNATTENDED` and `OTHER`. Other requires a note. Signed acknowledgements add optional company/role and work-content SHA-256 identity. Ancillary records only use `not_required`.

When not signed, a reason code is required. Drawn signatures are stored as encrypted object data or an encrypted binary reference, not embedded in general audit JSON. The acknowledgement records the signer name if supplied, signature timestamp, device record owner, and daily-log revision.

Submission creates a draft PDF but never sends it. Email requires a separate endpoint and explicit confirmation:

```http
POST /api/v1/daily-logs/{id}/revisions/{revision}/send-client-email
```

The API records recipient, actor, PDF revision, artifact/checksum, request/provider IDs when supplied, timestamps and genuine delivery state. Microsoft Graph acceptance is reported as provider acceptance with receipt unconfirmed; `sendMail` returns no message ID. Replays return history without contacting the provider. An intentional retry/resend uses a new request UUID and `resendOf`; unknown/queued prior outcomes also require `confirmPossibleDuplicate=true`.

Implemented Step 5 endpoints (all authenticated):

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/daily-logs/{id}/submit` | Explicit idempotent submission with request UUID, synchronized baseRevision and submission content hash |
| `POST /api/v1/daily-logs/{id}/signatures` | Restricted idempotent upload of normalized strokes and the acknowledged snapshot |
| `GET /api/v1/signatures/{assetId}` | Authorized, no-store signature download |
| `GET /api/v1/daily-logs/{id}/output` | Revisions, artifact states, delivery history, email capability and available Ops contacts |
| `POST /api/v1/daily-logs/{id}/revisions/{revision}/pdf` | Generate/retry from the immutable snapshot; ready output cannot be replaced |
| `GET /api/v1/daily-logs/{id}/revisions/{revision}/pdf` | Authorized preview; `?download=1` requests attachment download |
| `POST /api/v1/daily-logs/{id}/revisions/{revision}/send-client-email` | Deliberate Send; durable request history before attempting the provider |

`submission.schema.json` specifies request shapes. Submission is separate from draft sync and document revision is distinct from the synchronization counter. The device freezes the exact submission intention, drains its outbox, uploads saved signatures and submits the durable request UUID using the latest synchronized base revision. On replay that base revision/hash remain unchanged. The server locks the aggregate, verifies owner/state/version/content/completeness, atomically inserts its immutable snapshot and changes workflow state. PDF generation follows the commit; failure can be retried without creating another revision.

Work identity is canonical sorted-key JSON of `workContent` in `src/domain/submission.js`; submission identity also includes acknowledgement. Sync/document counters, status, assignment cache and audit timestamps are excluded. Signed details must match the uploaded immutable acknowledgement. Changed work retains the earlier encrypted asset and acknowledged snapshot; the new submitted snapshot uses `CONTENT_CHANGED` and references the earlier asset without including its drawing in the new PDF. General audit JSON contains references/metadata, never drawn strokes.

The inspected Ops schema has client contacts but no job-level selected contact. Jobs reads the authoritative job/client and offers its contacts in a dropdown; it does not presume a primary contact was chosen by the supervisor. Missing source/SELECT grants are explicit states. A future verified job contact column may be configured through `OPS_JOB_CONTACT_COLUMN`; its referenced contact must belong to the job's client. Ops setup/persistence remains external to this step.

## 12. API error format

All v1 errors use:

```json
{
  "error": {
    "code": "ACTIVITY_TIMELINE_GAP",
    "message": "Activities must form a continuous shift timeline.",
    "field": "activities",
    "retryable": false,
    "correlationId": "c86e3147-cf6c-4eef-81c5-c21f223b58c3"
  }
}
```

Validation errors use stable machine codes. Unexpected errors return a correlation ID and do not expose SQL or stack details.

## 13. Versioning

- HTTP endpoints are prefixed `/api/v1`.
- Payloads include `contractVersion: "1.0"` at integration boundaries and offline storage roots.
- Additive optional fields do not require a new major version.
- Removing, renaming, changing meaning, or tightening an accepted value requires `/api/v2` or an explicit migration period.
- Catalogues have their own monotonically increasing version and effective date.

## 14. Existing-system gaps to close

These are implementation gaps observed in the current repositories:

1. Ops `planner_assignments.personnel` is name-oriented JSON. Add stable user UUIDs to assignment payloads before production use.
2. Ops `/api/bootstrap` returns the entire management dataset. Jobs needs the compact date/user-scoped endpoint defined here.
3. Ops session cookies are host-scoped. Jobs must set its own cookie after authenticating against the shared identity store or use a later server-to-server SSO exchange.
4. Field currently maintains a separate copy of users and sessions. Jobs must not add a third independent identity source.
5. Field currently accepts bearer tokens from browser LocalStorage. The Jobs-to-Field handoff must use the short-lived opaque token defined here instead.
6. Field Postgres `projects` and `points` are support/cache tables while CORE-GS remains authoritative. Jobs must not reference those Postgres rows as master data.

## 15. Review decisions required before migration work

The following do not block contract prototyping but must be confirmed before Step 3 database deployment:

- exact production hostname for Ops Manager and Field
- whether Jobs authentication initially reuses shared database auth logic or a dedicated Ops identity API
- final ancillary, activity, material, service and measurement codes
- which Ops roles may edit another driller's active draft
- signature encryption and object-storage provider
- email provider and company sending mailbox

All other v1 identifiers, source-of-truth boundaries, lifecycle states, offline idempotency rules, and Field handoff semantics are ready for implementation review.
