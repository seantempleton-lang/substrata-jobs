# Substrata Jobs contract v1

This directory contains the machine-readable companion to `docs/INTEGRATION_CONTRACTS.md`.

- `common.schema.json`: shared identities and value objects.
- `bootstrap.schema.json`: offline bootstrap response.
- `daily-log.schema.json`: complete daily-log aggregate.
- `sync.schema.json`: idempotent offline mutation request and response.
- `field-handoff.schema.json`: short-lived Field context handoff.
- `database-model.sql`: proposed PostgreSQL mapping; design reference only, not a deployment migration.
- `examples/`: representative payloads for the agreed walkthrough scenarios.

Contract version `1.0` is additive during MVP development. Breaking changes require a new major contract version or an explicit migration window.

## 15 October office correction addition

`daily-log.schema.json` now includes server-owned `officeCorrection` provenance (source/new revision, reviewer/time/reason and before/after changes), and `officeReview.action` accepts `correct_and_lock`. Ops owns this action; device upserts cannot create or overwrite either metadata field. The portable `src/domain/reviewWork.js` validation module is shipped in both repositories and parity-tested. Jobs migration 006 preserves captured item precision without the former three-decimal child-row rounding. Internal corrected revisions do not imply a client PDF or covering signature; previous signed submissions remain immutable. See [review integration](../../docs/OFFICE_REVIEW_INTEGRATION.md).

## Step 5 additions

`submission.schema.json` covers explicit Submit, restricted signature upload and deliberate email requests. Draft sync remains `upsert`; submission is server-authoritative. The aggregate schema keeps legacy acknowledgement statuses and adds Will sign later, retained prior-signature references, company/role, work identity and submitted/approval timestamps. Existing unsigned drafts remain compatible.

Normalized stroke coordinates are [0,1]. Uploads allow 300 strokes, 20,000 points total and 512,000 serialized bytes; runtime total/byte validation supplements the schema's per-stroke bound. Signature assets are encrypted/private and contain the exact signed snapshot. A submitted revision includes a signature only when its work identity matches. Unsigned submission is permitted.

`database-model.sql` remains a historical design reference. Versioned Jobs migrations are `db/001_jobs_foundation.sql` through `005_daily_bore_details.sql`; verify actual applied state in each environment. Step 5 uses private PostgreSQL binary artifacts rather than object-storage keys. Migration 005 adds per-point daily observations without changing authoritative CORE-GS point ownership. Never replay the model SQL against the existing database.

The first approve/return slice uses Ops migration 016 and server-owned decision metadata. Next is supervisor editing/direct lock-in with project-linked figures for invoicing; return to the driller for correction/confirmation is optional. Client output is optional follow-up. These new capabilities need a coordinated versioned contract; lifecycle enum values alone do not establish implementation. See [../../docs/OFFICE_REVIEW_INTEGRATION.md](../../docs/OFFICE_REVIEW_INTEGRATION.md).
