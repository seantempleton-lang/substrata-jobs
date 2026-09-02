import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSubmittable,
  changePoint,
  createDailyLog,
  endShift,
  startNextActivity,
  validationErrors,
} from "../src/domain/dailyLog.js";

const owner = {
  userId: "31eb28f2-0bf1-4cee-813c-075f0436b5e7",
  employeeCode: "ST001",
  displayName: "Sean Templeton",
  roleTitle: "Driller",
  appRole: "FieldUser",
  division: "Geotech",
  region: "North",
};

const assignment = {
  assignmentId: "6994af79-c56e-4c51-b7e9-32e548d6375e",
  job: {
    jobId: "8954b2f8-484a-4521-a34f-f79368c86d4b",
    jobNumber: "302670",
    title: "Northern Corridor ground investigation",
    division: "Geotech",
    clientId: null,
    clientName: null,
    siteName: "SH1 Albany",
    siteAddress: null,
  },
  equipment: {
    equipmentId: "2cdad674-37d3-4c02-a3f0-b18a810fa62f",
    equipmentCode: "N107",
    name: "N107",
    equipmentType: "Rig",
    division: "Geotech",
  },
  personnel: [owner],
  points: [{ jobNumber: "302670", pointId: "BH5049" }],
};

function rigLog() {
  return createDailyLog({
    assignment,
    owner,
    startedAt: "2026-07-19T19:00:00.000Z",
    initialActivity: { code: "PRESTART", label: "Pre-start and site setup" },
  });
}

test("creates an offline-ready rig log with stable IDs and assignment snapshots", () => {
  const log = rigLog();
  assert.equal(log.logType, "rig_shift");
  assert.equal(log.serverRevision, 0);
  assert.equal(log.activities[0].startedAt, log.shift.startedAt);
  assert.equal(log.activities[0].pointSegmentId, log.points[0].id);
  assert.equal(log.crew[0].displayNameSnapshot, owner.displayName);
});

test("activity transition closes and starts activities at the same instant", () => {
  const log = startNextActivity(rigLog(), {
    code: "GT_ROTARY_SONIC",
    label: "Rotary sonic drilling",
    allocation: { type: "job", jobId: assignment.job.jobId, jobNumber: assignment.job.jobNumber },
  }, "2026-07-19T19:20:00.000Z");
  assert.equal(log.activities[0].endedAt, log.activities[1].startedAt);
  assert.equal(log.activities[1].sequence, 2);
});

test("multi-point shift can close without timeline gaps", () => {
  let log = startNextActivity(rigLog(), {
    code: "GT_ROTARY_SONIC",
    label: "Rotary sonic drilling",
    allocation: { type: "job", jobId: assignment.job.jobId, jobNumber: assignment.job.jobNumber },
  }, "2026-07-19T19:20:00.000Z");
  log = changePoint(log, {
    nextPoint: { jobNumber: "302670", pointId: "BH5050" },
    endDepthM: 12.4,
    endStatus: "Continued",
    nextStartDepthM: 0,
  }, "2026-07-20T00:00:00.000Z");
  log = endShift(log, { endDepthM: 4.2, endStatus: "Continued" }, "2026-07-20T05:00:00.000Z");
  assert.deepEqual(validationErrors(log), []);
  assert.equal(assertSubmittable(log), true);
});

test("ancillary logs reject job context and use ancillary allocation", () => {
  const log = createDailyLog({
    owner,
    ancillary: true,
    startedAt: "2026-07-19T19:00:00.000Z",
    initialActivity: { code: "ANC_WORKSHOP", label: "Workshop", ancillaryCode: "ANC_WORKSHOP" },
  });
  const ended = endShift(log, {}, "2026-07-20T03:30:00.000Z");
  assert.equal(ended.job, null);
  assert.equal(ended.equipment, null);
  assert.equal(ended.activities[0].allocation.type, "ancillary");
  assert.equal(assertSubmittable(ended), true);
});

test("submission validation reports unfinished work instead of silently succeeding", () => {
  const errors = validationErrors(rigLog());
  assert.ok(errors.some((error) => error.code === "SHIFT_UNFINISHED"));
  assert.ok(errors.some((error) => error.code === "ACTIVITY_UNFINISHED"));
  assert.ok(errors.some((error) => error.code === "POINT_UNFINISHED"));
});
