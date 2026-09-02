import assert from "node:assert/strict";
import test from "node:test";
import { createDailyLog } from "../src/domain/dailyLog.js";
import { validateDailyLog } from "../server/dailyLogs.mjs";

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

function log() {
  return createDailyLog({
    assignment,
    owner,
    startedAt: "2026-07-19T19:00:00.000Z",
    initialActivity: { code: "PRESTART", label: "Pre-start and site setup" },
  });
}

test("server accepts a daily log produced by the client domain", () => {
  const dailyLog = log();
  assert.equal(validateDailyLog(dailyLog, owner.userId), dailyLog);
});

test("server rejects syncing another user's log", () => {
  assert.throws(() => validateDailyLog(log(), "eb4cd8c8-d6e5-4e57-bf98-f9d42fc27bfd"), { code: "LOG_OWNER_FORBIDDEN" });
});

test("server rejects a point attached to another job", () => {
  const dailyLog = log();
  dailyLog.points[0].jobNumber = "999999";
  assert.throws(() => validateDailyLog(dailyLog, owner.userId), { code: "POINT_JOB_MISMATCH" });
});

test("server rejects submitted revisions through draft sync", () => {
  const dailyLog = log();
  dailyLog.status = "submitted";
  assert.throws(() => validateDailyLog(dailyLog, owner.userId), { code: "LOG_IMMUTABLE" });
});
