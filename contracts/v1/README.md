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
