export const sheetPointTextFields = ["boreSize", "permitNumber", "purpose", "gridReference", "waterMeterSerial", "waterMeterUnit"];
export const sheetPointNumberFields = ["currentDepthM", "waterLevelAm", "waterLevelBoreDepthAm", "waterLevelPm", "waterLevelBoreDepthPm", "waterMeterStart", "waterMeterFinish"];

export function boreDetailErrors(point) {
  const details = point.dailyDetails;
  if (details === undefined) return [];
  const errors = [];
  const add = message => errors.push({ code: "BORE_DETAIL_INVALID", message: `${point.pointId}: ${message}`, field: "points" });
  if (!details || typeof details !== "object" || Array.isArray(details)) { add("Bore details are invalid."); return errors; }
  for (const [key, value] of Object.entries(details)) {
    if (sheetPointTextFields.includes(key)) { if (typeof value !== "string" || value.length > 1000) add("Bore detail text must be 1000 characters or fewer."); }
    else if (sheetPointNumberFields.includes(key)) { if (!Number.isFinite(value) || value < 0) add("Readings must be non-negative numbers."); }
    else add("Unsupported bore detail field.");
  }
  if (details.waterMeterUnit && !["L", "m³"].includes(details.waterMeterUnit)) add("Choose litres or cubic metres for the water meter.");
  if (details.currentDepthM != null && point.startDepthM != null && details.currentDepthM < point.startDepthM) add("Current depth cannot be less than the starting depth.");
  return errors;
}

export function boreReadingErrors(log) {
  const errors = [];
  for (const point of log.points) {
    const d = point.dailyDetails || {};
    const add = message => errors.push({ code: "BORE_READING_INCOMPLETE", message: `${point.pointId}: ${message}`, field: "points" });
    for (const suffix of ["Am", "Pm"]) {
      if ((d[`waterLevel${suffix}`] != null) !== (d[`waterLevelBoreDepth${suffix}`] != null)) add(`Record both water depth and bore depth for the ${suffix.toUpperCase()} water level.`);
      if (d[`waterLevel${suffix}`] > d[`waterLevelBoreDepth${suffix}`]) add("Depth to water cannot exceed the bore depth at the reading.");
    }
    const start = d.waterMeterStart, finish = d.waterMeterFinish;
    if (start != null || finish != null) {
      if (start == null || finish == null || typeof d.waterMeterSerial !== "string" || !d.waterMeterSerial.trim()) add("Water meter readings need the serial number, start and finish readings.");
      if (finish < start) add("Water meter finish must be at least its start reading.");
    }
  }
  return errors;
}

export function boreRecordLines(point) {
  const d = point.dailyDetails || {}, lines = [];
  if (!point.endedAt && d.currentDepthM != null) lines.push(`Current depth: ${d.currentDepthM} m`);
  for (const [key, label] of [["boreSize", "Bore size"], ["permitNumber", "Permit"], ["purpose", "Purpose"], ["gridReference", "Grid reference"]]) if (d[key]) lines.push(`${label}: ${d[key]}`);
  for (const suffix of ["Am", "Pm"]) if (d[`waterLevel${suffix}`] != null || d[`waterLevelBoreDepth${suffix}`] != null) lines.push(`SWL ${suffix.toUpperCase()}: ${d[`waterLevel${suffix}`] ?? "Not recorded"} m depth to water; bore depth ${d[`waterLevelBoreDepth${suffix}`] ?? "Not recorded"} m`);
  if (d.waterMeterSerial || d.waterMeterStart != null || d.waterMeterFinish != null) lines.push(`Water meter ${d.waterMeterSerial || "Not recorded"}: ${d.waterMeterStart ?? "Not recorded"} to ${d.waterMeterFinish ?? "Not recorded"} ${d.waterMeterUnit || "L"}`);
  return lines;
}
