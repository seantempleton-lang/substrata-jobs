import { randomId } from "./crypto.js";
import { sheetPointTextFields, sheetPointNumberFields } from "./boreDetails.js";
import { editDailyLog } from "./dailyLog.js";

// Familiar paper-sheet entries; these are shortcuts to log items, not a new
// price list. Use an existing catalogue code when it matches, otherwise Other.
export const sheetMaterials = [
  ["bentonite", "Bentonite powder / pellets", "bag"], ["cement", "Cement", "bag"],
  ["coreBoxes", "Core boxes", "each"], ["pvcSplits", "PVC splits", "each"],
  ["backfill", "Gravel / backfill", "bag"], ["diatube", "Diatube", "m"],
  ["pac", "PAC R", "bag"], ["quickMud", "Quick Mud", "L"], ["quickFoam", "Quick Foam", "L"],
];
export const sheetServices = [
  ["spt", "SPT test", "each", "measurement"], ["pushTube", "Push tubes", "each", "measurement"],
  ["soundMats", "Sound mats", "each"], ["trackMats", "Track mats", "each"],
  ["fencing", "Fencing", "m"], ["geocloth", "Geocloth", "m"],
  ["bulkWaste", "1000 L bulk waste", "pod"], ["handAuger", "Hand auger", "m", "service"],
  ["packer", "Packer test", "each", "measurement"], ["accommodation", "Accommodation", "person", "service"],
  ["meals", "Meals", "person", "service"], ["tractor", "Tractor hire", "hour", "service"],
  ["televiewer", "Televiewer", "each", "service"], ["pressure", "Pressure test", "each", "measurement"],
];
export const sheetSubcontractors = [
  ["vac", "Vac extraction", "visit", "subcontractor"], ["traffic", "Traffic control", "visit", "subcontractor"],
  ["locate", "Service locate", "visit", "subcontractor"], ["earthworks", "Earth works", "visit", "subcontractor"],
  ["waterTruck", "Water truck", "visit", "subcontractor"],
];
export const sheetEntries = [...sheetMaterials, ...sheetServices, ...sheetSubcontractors];

export function sheetItem(log, preset, pointSegmentId) {
  return log.items.find(item => (item.pointSegmentId || null) === (pointSegmentId || null) && item.itemLabelSnapshot === preset[1]);
}

export function setSheetQuantity(source, preset, pointSegmentId, value, catalogue = []) {
  return editDailyLog(source, log => {
    if (pointSegmentId && !log.points.some(p => p.id === pointSegmentId)) throw new Error("Choose a bore on this daily log.");
    const existing = sheetItem(log, preset, pointSegmentId);
    if (value === "") { log.items = log.items.filter(item => item.id !== existing?.id); return; }
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Enter a non-negative quantity or leave it blank.");
    const matching = catalogue.find(item => item.active && item.label.toLowerCase() === preset[1].toLowerCase() && item.unit === preset[2] && (!item.division || item.division === "Shared" || item.division === log.division));
    const next = { id: existing?.id || randomId(), itemType: existing?.itemType || matching?.itemType || preset[3] || "material", itemCode: existing?.itemCode || matching?.code || "OTHER",
      itemLabelSnapshot: preset[1], pointSegmentId: pointSegmentId || null, quantity, unit: existing?.unit || preset[2], notes: existing?.notes || null };
    if (existing) Object.assign(existing, next); else log.items.push(next);
  });
}

export function setBoreDetail(source, pointId, field, value) {
  return editDailyLog(source, log => {
    const point = log.points.find(point => point.id === pointId);
    if (!point) throw new Error("Choose a bore on this daily log first.");
    if (![...sheetPointTextFields, ...sheetPointNumberFields].includes(field)) throw new Error("Unsupported bore detail.");
    const details = { ...point.dailyDetails };
    if (value === "") delete details[field];
    else if (sheetPointNumberFields.includes(field)) {
      if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("Enter a non-negative reading or leave it blank.");
      details[field] = Number(value);
      if (field === "waterMeterStart" || field === "waterMeterFinish") details.waterMeterUnit ||= "L";
    } else details[field] = value;
    point.dailyDetails = details;
  });
}

export function setBoreDepth(source, pointId, field, value) {
  return editDailyLog(source, log => {
    const point = log.points.find(p => p.id === pointId);
    if (!point || !["startDepthM", "endDepthM"].includes(field)) throw new Error("Choose a bore depth on this log.");
    const depth = value === "" ? null : Number(value);
    if (depth != null && (!Number.isFinite(depth) || depth < 0)) throw new Error("Depth must be a non-negative number.");
    if (field === "endDepthM" && !point.endedAt) throw new Error("Record a current depth while the bore is in progress.");
    if (field === "endDepthM" && depth == null) throw new Error("A completed point requires a finishing depth.");
    point[field] = depth;
    if (point.endDepthM != null && point.startDepthM != null && point.endDepthM < point.startDepthM) throw new Error("Finishing depth cannot be less than starting depth.");
  });
}

