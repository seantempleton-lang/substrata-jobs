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

## Step 5 additions

`submission.schema.json` covers explicit Submit, restricted signature upload and deliberate email requests. Draft sync remains `upsert`; submission is server-authoritative. The aggregate schema keeps legacy acknowledgement statuses and adds Will sign later, retained prior-signature references, company/role, work identity and submitted/approval timestamps. Existing unsigned drafts remain compatible.

Normalized stroke coordinates are [0,1]. Uploads allow 300 strokes, 20,000 points total and 512,000 serialized bytes; runtime total/byte validation supplements the schema's per-stroke bound. Signature assets are encrypted/private and contain the exact signed snapshot. A submitted revision includes a signature only when its work identity matches. Unsigned submission is permitted.

`database-model.sql` remains a historical design reference. Applied migrations are `db/001` through `004_submission_output.sql`; Step 5 uses private PostgreSQL binary artifacts rather than object-storage keys. Never replay the model SQL against the existing database.
