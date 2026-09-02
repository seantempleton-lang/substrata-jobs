import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "contracts", "v1");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

function assertUuid(value, label) {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${label} must be a UUID`);
}

function assertInstant(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp`);
}

function validateTimeline(log) {
  assert.equal(log.contractVersion, "1.0");
  assertUuid(log.id, "daily log ID");
  assert.ok(log.activities.length > 0, "daily log must contain activities");

  const ordered = [...log.activities].sort((left, right) => left.sequence - right.sequence);
  assert.equal(ordered[0].startedAt, log.shift.startedAt, "first activity must start with shift");
  assert.equal(ordered.at(-1).endedAt, log.shift.endedAt, "last activity must end with shift");

  for (let index = 0; index < ordered.length; index += 1) {
    const activity = ordered[index];
    assertUuid(activity.id, `activity ${activity.sequence} ID`);
    assertInstant(activity.startedAt, `activity ${activity.sequence} start`);
    assertInstant(activity.endedAt, `activity ${activity.sequence} end`);
    assert.ok(Date.parse(activity.endedAt) > Date.parse(activity.startedAt), `activity ${activity.sequence} must have positive duration`);
    if (index > 0) {
      assert.equal(ordered[index - 1].endedAt, activity.startedAt, `activity ${activity.sequence} must follow without a gap or overlap`);
    }
  }

  if (log.logType === "rig_shift") {
    assert.ok(log.job && log.equipment, "rig shift requires job and equipment");
    for (const point of log.points) assert.equal(point.jobNumber, log.job.jobNumber, "point job number must match daily log job");
  } else {
    assert.equal(log.job, null, "ancillary log cannot carry a job");
    assert.equal(log.equipment, null, "ancillary log cannot carry equipment");
    assert.deepEqual(log.points, [], "ancillary log cannot carry points");
    assert.equal(log.clientAcknowledgement.status, "not_required");
  }
}

const schemaFiles = [
  "common.schema.json",
  "bootstrap.schema.json",
  "daily-log.schema.json",
  "sync.schema.json",
  "field-handoff.schema.json",
];

const schemas = [];
for (const file of schemaFiles) {
  const schema = await readJson(file);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema.$id, `${file} must have an ID`);
  schemas.push(schema);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
for (const schema of schemas) ajv.addSchema(schema);

function validateSchema(schemaName, payload, label) {
  const schema = schemas.find((candidate) => candidate.$id.endsWith(`/${schemaName}`));
  const validate = ajv.getSchema(schema.$id);
  assert.ok(validate(payload), `${label} failed JSON Schema validation:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`);
}

const bootstrap = await readJson("examples/bootstrap-response.json");
validateSchema("bootstrap.schema.json", bootstrap, "bootstrap response");
assert.equal(bootstrap.contractVersion, "1.0");
assert.equal(bootstrap.retentionDays, 14);
assert.ok(bootstrap.assignments.every((assignment) => assignment.personnel.every((person) => person.userId)), "planned personnel need stable user IDs");
assert.ok(bootstrap.assignments.every((assignment) => !assignment.job || assignment.points.every((point) => point.jobNumber === assignment.job.jobNumber)), "assignment point job numbers must match");

for (const file of ["daily-log-geotech.json", "daily-log-water.json", "daily-log-ancillary.json"]) {
  const log = await readJson(`examples/${file}`);
  validateSchema("daily-log.schema.json", log, file);
  validateTimeline(log);
}

const sync = await readJson("examples/sync-request.json");
validateSchema("sync.schema.json", sync, "sync request");
assertUuid(sync.batchId, "sync batch ID");
assertUuid(sync.deviceId, "sync device ID");
assert.ok(sync.mutations.length > 0 && sync.mutations.length <= 100);
for (const mutation of sync.mutations) {
  assertUuid(mutation.mutationId, "mutation ID");
  assertUuid(mutation.entityId, "mutation entity ID");
}

const handoffRequest = await readJson("examples/field-handoff-request.json");
const handoffResponse = await readJson("examples/field-handoff-response.json");
validateSchema("field-handoff.schema.json", handoffRequest, "field handoff request");
validateSchema("field-handoff.schema.json", handoffResponse, "field handoff response");
assert.equal(handoffRequest.jobNumber, "302670");
assert.equal(handoffRequest.pointId, "BH5049");
assert.ok(new URL(handoffRequest.returnUrl).protocol === "https:");
assert.ok(new URL(handoffResponse.launchUrl).protocol === "https:");
assertInstant(handoffResponse.expiresAt, "handoff expiry");

console.log("Contract examples passed structural and domain-invariant validation.");
