import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { changePoint, continueDailyLog, correctActivity, createDailyLog, editDailyLog, endShift, validationErrors } from "../src/domain/dailyLog.js";
import { fromLocalInput, localInput } from "../src/domain/time.js";
const bootstrap = JSON.parse(readFileSync(new URL("../contracts/v1/examples/bootstrap-response.json", import.meta.url)));
const assignment = bootstrap.assignments.find(a => a.job?.division === "Geotech"), owner = bootstrap.currentUser;
const initialActivity = { code: "PRESTART", label: "Site setup" };
const makeLog = () => createDailyLog({ owner, assignment, startedAt: "2026-10-13T18:00:00.000Z", initialActivity, startDepthM: 0, setup: { boreSize: "150 mm" } });

test("point changes preserve earlier activity attribution and general activities have no point", () => {
  const log = makeLog();
  const changed = changePoint(log, { nextPoint: assignment.points[1], endDepthM: 12.4, endStatus: "Continued", nextStartDepthM: 0 }, "2026-10-13T22:00:00.000Z");
  assert.equal(changed.activities[0].pointSegmentId, log.points[0].id);
  assert.equal(changed.activities[1].pointSegmentId, changed.points[1].id);
  const general = changePoint(changed, { nextPoint: null, endDepthM: 4.2, endStatus: "Completed" }, "2026-10-14T01:00:00.000Z");
  assert.equal(general.activities.at(-1).pointSegmentId, null);
  assert.deepEqual(validationErrors(endShift(general, {}, "2026-10-14T04:00:00.000Z")), []);
});

test("handover carries only setup, point depth/status and references into a new owner's shift", () => {
  const finished = endShift(makeLog(), { endDepthM: 12.4, endStatus: "Continued" }, "2026-10-14T04:00:00.000Z");
  finished.notes = "Old notes"; finished.items = [{ id: "old-item" }];
  const next = continueDailyLog(finished, { owner: { ...owner, userId: crypto.randomUUID() }, startedAt: "2026-10-14T05:00:00.000Z", initialActivity, personnel: [owner] });
  assert.notEqual(next.id, finished.id);
  assert.equal(next.carriedFromLogId, finished.id);
  assert.equal(next.points[0].startDepthM, 12.4);
  assert.equal(next.setup.boreSize, "150 mm");
  assert.equal(next.setup.previousPointStatus, "Continued");
  assert.equal(next.notes, null); assert.deepEqual(next.items, []);
  assert.equal(next.activities.length, 1); assert.notEqual(next.crew[0].id, finished.crew[0].id);
});

test("attendance allows leave and rejoin while rejecting overlap and negative depth/quantity", () => {
  let log = editDailyLog(makeLog(), next => { next.crew[0].attendedTo = "2026-10-13T20:00:00.000Z"; });
  log = editDailyLog(log, next => { next.crew.push({ ...next.crew[0], id: crypto.randomUUID(), attendedFrom: "2026-10-13T21:00:00.000Z", attendedTo: null }); });
  assert.throws(() => editDailyLog(log, next => { next.crew.at(-1).attendedFrom = "2026-10-13T19:00:00.000Z"; }), { code: "ATTENDANCE_OVERLAP" });
  assert.throws(() => editDailyLog(log, next => { next.items.push({ quantity: NaN, unit: "m", itemLabelSnapshot: "Casing" }); }), { code: "ITEM_INVALID" });
  assert.throws(() => endShift(log, { endDepthM: -1, endStatus: "Completed" }, "2026-10-14T04:00:00.000Z"), { code: "POINT_DEPTH_REQUIRED" });
});

test("manual activity corrections maintain adjacent boundaries and reject impossible durations", () => {
  const log = changePoint(makeLog(), { nextPoint: assignment.points[1], endDepthM: 12.4, endStatus: "Continued" }, "2026-10-13T22:00:00.000Z");
  const corrected = correctActivity(log, log.activities[1].id, { startedAt: "2026-10-13T23:00:00.000Z" });
  assert.equal(corrected.activities[0].endedAt, corrected.activities[1].startedAt);
  assert.throws(() => correctActivity(log, log.activities[1].id, { startedAt: "2026-10-13T17:00:00.000Z" }));
});

test("NZ timestamps support overnight shifts, reject daylight-saving gaps and ambiguous times", () => {
  assert.equal(fromLocalInput("2026-10-14T07:00:00"), "2026-10-13T18:00:00.000Z");
  assert.equal(localInput("2026-07-19T19:00:00Z"), "2026-07-20T07:00:00");
  assert.throws(() => fromLocalInput("2026-09-27T02:30:00"), /does not exist/);
  assert.throws(() => fromLocalInput("2026-04-05T02:30:00"), /twice/);
});
