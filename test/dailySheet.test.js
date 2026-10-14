import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setBoreDetail, setBoreDepth, setSheetQuantity, sheetMaterials, sheetSubcontractors } from "../src/domain/dailySheet.js";
import { boreRecordLines } from "../src/domain/boreDetails.js";
import { validationErrors } from "../src/domain/dailyLog.js";
import { validateDailyLog } from "../server/dailyLogs.mjs";

function example() {
  const log = JSON.parse(fs.readFileSync("contracts/v1/examples/daily-log-geotech.json"));
  log.status = "draft"; log.items = []; log.clientAcknowledgement = { status: "not_required" };
  return log;
}

test("paper-sheet quantities belong to the selected bore and blanks differ from explicit zero", () => {
  const log = example(), preset = sheetMaterials[0], [a, b] = log.points;
  const first = setSheetQuantity(log, preset, a.id, "2");
  const second = setSheetQuantity(first, preset, b.id, "0");
  assert.equal(second.items.length, 2); assert.equal(second.items[0].quantity, 2); assert.equal(second.items[1].quantity, 0);
  const changed = setSheetQuantity(second, preset, a.id, "3"); assert.equal(changed.items[0].id, first.items[0].id);
  assert.equal(setSheetQuantity(changed, preset, a.id, "").items.length, 1);
  assert.throws(() => setSheetQuantity(log, preset, a.id, "-1"), /non-negative/);
  const unused = setSheetQuantity(log, sheetSubcontractors[0], a.id, "0");
  assert.equal(unused.items[0].itemType, "subcontractor"); assert.equal(unused.items[0].quantity, 0);
});

test("water/bore depth pairs and meter readings autosave progressively but report incomplete or impossible submission", () => {
  let log = example(); const id = log.points[0].id;
  log = setBoreDetail(log, id, "waterLevelAm", "2.2");
  assert.ok(validationErrors(log).some(e => e.code === "BORE_READING_INCOMPLETE"));
  assert.doesNotThrow(() => validateDailyLog(log, log.owner.userId));
  log = setBoreDetail(log, id, "waterLevelBoreDepthAm", "15");
  assert.ok(!validationErrors(log).some(e => e.code === "BORE_READING_INCOMPLETE"));
  log = setBoreDetail(log, id, "waterMeterStart", "100");
  log = setBoreDetail(log, id, "waterMeterFinish", "80");
  assert.ok(validationErrors(log).some(e => e.message.includes("finish must be")));
  log = setBoreDetail(log, id, "waterMeterSerial", "WM-TEST");
  log = setBoreDetail(log, id, "waterMeterFinish", "140");
  assert.ok(!validationErrors(log).some(e => e.code === "BORE_READING_INCOMPLETE"));
  assert.throws(() => setBoreDetail(log, id, "waterLevelPm", "-2"), /non-negative/);
  const invalid = structuredClone(log); invalid.points[0].dailyDetails.waterLevelAm = -1;
  assert.throws(() => validateDailyLog(invalid, invalid.owner.userId), /non-negative/);
  assert.deepEqual(log.points[1].dailyDetails, undefined);
});

test("daily bore details and quantities cannot change submitted content", () => {
  const log = { ...example(), status: "submitted" };
  assert.throws(() => setBoreDetail(log, log.points[0].id, "purpose", "Changed"), /editable/);
  assert.throws(() => setSheetQuantity(log, sheetMaterials[0], log.points[0].id, "1"), /editable/);
});

test("bore depths validate directly and water units remain explicit in the record", () => {
  let log = example(), id = log.points[0].id;
  assert.throws(() => setBoreDepth(log, id, "endDepthM", ""), /finishing depth/);
  assert.throws(() => setBoreDepth(log, id, "startDepthM", "100"), /less than/);
  log = setBoreDetail(log, id, "waterMeterUnit", "m³");
  log = setBoreDetail(log, id, "waterMeterSerial", "WM-CUBIC");
  log = setBoreDetail(log, id, "waterMeterStart", "1.5");
  log = setBoreDetail(log, id, "waterMeterFinish", "2.1");
  assert.ok(boreRecordLines(log.points[0]).some(line => line.includes("1.5 to 2.1 m³")));
  assert.throws(() => setBoreDetail(log, id, "waterMeterUnit", "unknown"), /litres or cubic/);
});
