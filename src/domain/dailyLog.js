const CONTRACT_VERSION = "1.0";
const TIMEZONE = "Pacific/Auckland";

function fail(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  throw error;
}

function instant(value, field) {
  const parsed = new Date(value);
  if (!value || !Number.isFinite(parsed.getTime())) fail("INVALID_TIMESTAMP", `${field} must be a valid timestamp.`, field);
  return parsed.toISOString();
}

function after(left, right, code, message, field) {
  if (Date.parse(left) <= Date.parse(right)) fail(code, message, field);
}

function copy(log) {
  return structuredClone(log);
}

function touch(log, at) {
  log.updatedAt = instant(at, "updatedAt");
  return log;
}

function assertDraft(log) {
  if (log.status !== "draft" && log.status !== "returned" && log.status !== "reopened") {
    fail("LOG_NOT_EDITABLE", "Only an editable daily log can be changed.", "status");
  }
}

function currentActivity(log) {
  const open = log.activities.filter((activity) => !activity.endedAt);
  if (open.length !== 1) fail("ACTIVITY_CURRENT_INVALID", "The daily log must have exactly one current activity.", "activities");
  return open[0];
}

function currentPoint(log) {
  const open = log.points.filter((point) => !point.endedAt);
  if (open.length > 1) fail("POINT_CURRENT_INVALID", "The daily log cannot have more than one current point.", "points");
  return open[0] || null;
}

function ownerRef(user) {
  if (!user?.userId || !user?.employeeCode || !user?.displayName) {
    fail("OWNER_REQUIRED", "A daily log requires an authenticated owner.", "owner");
  }
  return {
    userId: user.userId,
    employeeCode: user.employeeCode,
    displayName: user.displayName,
    roleTitle: user.roleTitle ?? null,
    appRole: user.appRole || "FieldUser",
    division: user.division ?? null,
    region: user.region ?? null,
  };
}

function crewFromAssignment(personnel, startedAt) {
  return personnel.map((person) => ({
    id: crypto.randomUUID(),
    userId: person.userId ?? null,
    employeeCodeSnapshot: person.employeeCode ?? null,
    displayNameSnapshot: person.displayName,
    roleSnapshot: person.roleTitle ?? null,
    attendedFrom: startedAt,
    attendedTo: null,
  }));
}

function pointFromReference(reference, startedAt, sequence = 1, startDepthM = null) {
  return {
    id: crypto.randomUUID(),
    sequence,
    jobNumber: reference.jobNumber,
    pointId: reference.pointId,
    startedAt,
    endedAt: null,
    startDepthM,
    endDepthM: null,
    endStatus: null,
  };
}

export function createDailyLog({ assignment = null, owner, shiftLabel = "day", startedAt, initialActivity, ancillary = false }) {
  const start = instant(startedAt, "shift.startedAt");
  const isAncillary = ancillary || !assignment?.job;
  const job = isAncillary ? null : assignment.job;
  const equipment = isAncillary ? null : assignment.equipment;
  if (!isAncillary && (!job || !equipment)) fail("RIG_CONTEXT_REQUIRED", "A rig shift requires a job and equipment.", "assignment");
  if (!initialActivity?.code || !initialActivity?.label) fail("ACTIVITY_REQUIRED", "An initial activity is required.", "activities");

  const personnel = assignment?.personnel?.length ? assignment.personnel : [owner];
  const pointReference = !isAncillary ? assignment?.points?.[0] : null;
  const point = pointReference ? pointFromReference(pointReference, start) : null;
  const allocation = isAncillary
    ? { type: "ancillary", ancillaryCode: initialActivity.ancillaryCode || initialActivity.code }
    : { type: "job", jobId: job.jobId, jobNumber: job.jobNumber };
  const now = new Date().toISOString();

  return {
    contractVersion: CONTRACT_VERSION,
    id: crypto.randomUUID(),
    logType: isAncillary ? "ancillary" : "rig_shift",
    division: isAncillary ? null : job.division,
    assignmentId: assignment?.assignmentId ?? null,
    job,
    equipment,
    owner: ownerRef(owner),
    shift: { label: shiftLabel, startedAt: start, endedAt: null, timezone: TIMEZONE },
    status: "draft",
    serverRevision: 0,
    currentDocumentRevision: 0,
    carriedFromLogId: null,
    crew: crewFromAssignment(personnel, start),
    points: point ? [point] : [],
    activities: [{
      id: crypto.randomUUID(),
      sequence: 1,
      pointSegmentId: point?.id ?? null,
      activityCode: initialActivity.code,
      activityLabelSnapshot: initialActivity.label,
      startedAt: start,
      endedAt: null,
      allocation,
      notes: null,
    }],
    items: [],
    clientAcknowledgement: { status: "not_required" },
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function startNextActivity(source, { code, label, allocation, notes = null }, occurredAt) {
  const log = copy(source);
  assertDraft(log);
  if (!code || !label || !allocation) fail("ACTIVITY_REQUIRED", "Activity code, label, and allocation are required.", "activities");
  const at = instant(occurredAt, "activities.startedAt");
  const active = currentActivity(log);
  after(at, active.startedAt, "ACTIVITY_DURATION_INVALID", "The next activity must start after the current activity.", "activities");
  active.endedAt = at;
  log.activities.push({
    id: crypto.randomUUID(),
    sequence: log.activities.length + 1,
    pointSegmentId: currentPoint(log)?.id ?? null,
    activityCode: code,
    activityLabelSnapshot: label,
    startedAt: at,
    endedAt: null,
    allocation,
    notes,
  });
  return touch(log, at);
}

export function changePoint(source, { nextPoint, endDepthM, endStatus, nextStartDepthM = null }, occurredAt) {
  const log = copy(source);
  assertDraft(log);
  if (log.logType !== "rig_shift") fail("POINT_NOT_ALLOWED", "Ancillary logs cannot contain points.", "points");
  const at = instant(occurredAt, "points.startedAt");
  const active = currentPoint(log);
  if (active) {
    after(at, active.startedAt, "POINT_DURATION_INVALID", "The next point must start after the current point.", "points");
    if (!endStatus) fail("POINT_STATUS_REQUIRED", "The outgoing point requires a status.", "points");
    if (endDepthM == null || Number(endDepthM) < 0) fail("POINT_DEPTH_REQUIRED", "The outgoing point requires a valid finishing depth.", "points");
    if (active.startDepthM != null && Number(endDepthM) < active.startDepthM) fail("POINT_DEPTH_INVALID", "Finishing depth cannot be less than starting depth.", "points");
    active.endedAt = at;
    active.endDepthM = Number(endDepthM);
    active.endStatus = endStatus;
  }
  if (!nextPoint?.jobNumber || !nextPoint?.pointId) fail("POINT_REQUIRED", "The next point requires a job number and point ID.", "points");
  if (nextPoint.jobNumber !== log.job.jobNumber) fail("POINT_JOB_MISMATCH", "The point must belong to the daily log job.", "points");
  log.points.push(pointFromReference(nextPoint, at, log.points.length + 1, nextStartDepthM));
  return touch(log, at);
}

export function endShift(source, { endDepthM = null, endStatus = null } = {}, occurredAt) {
  const log = copy(source);
  assertDraft(log);
  const at = instant(occurredAt, "shift.endedAt");
  after(at, log.shift.startedAt, "SHIFT_DURATION_INVALID", "Shift end must be after shift start.", "shift.endedAt");
  const active = currentActivity(log);
  after(at, active.startedAt, "ACTIVITY_DURATION_INVALID", "The final activity must have a positive duration.", "activities");
  active.endedAt = at;
  log.shift.endedAt = at;
  for (const attendance of log.crew) if (!attendance.attendedTo) attendance.attendedTo = at;

  const point = currentPoint(log);
  if (point && endStatus) {
    if (endDepthM == null || Number(endDepthM) < 0) fail("POINT_DEPTH_REQUIRED", "The active point requires a valid finishing depth.", "points");
    point.endedAt = at;
    point.endDepthM = Number(endDepthM);
    point.endStatus = endStatus;
  }
  return touch(log, at);
}

export function validationErrors(log) {
  const errors = [];
  const add = (code, message, field) => errors.push({ code, message, field });
  if (!log.shift.endedAt) add("SHIFT_UNFINISHED", "Shift finish is required.", "shift.endedAt");
  if (!log.activities.length) add("ACTIVITY_REQUIRED", "At least one activity is required.", "activities");

  const activities = [...log.activities].sort((left, right) => left.sequence - right.sequence);
  if (activities[0]?.startedAt !== log.shift.startedAt) add("ACTIVITY_TIMELINE_START", "The first activity must start with the shift.", "activities");
  for (let index = 0; index < activities.length; index += 1) {
    const activity = activities[index];
    if (!activity.endedAt) add("ACTIVITY_UNFINISHED", `Activity ${activity.sequence} is unfinished.`, "activities");
    else if (Date.parse(activity.endedAt) <= Date.parse(activity.startedAt)) add("ACTIVITY_DURATION_INVALID", `Activity ${activity.sequence} must have a positive duration.`, "activities");
    if (index > 0 && activities[index - 1].endedAt !== activity.startedAt) add("ACTIVITY_TIMELINE_GAP", "Activities must form a continuous shift timeline.", "activities");
  }
  if (activities.at(-1)?.endedAt !== log.shift.endedAt) add("ACTIVITY_TIMELINE_END", "The final activity must end with the shift.", "activities");
  if (log.crew.some((attendance) => !attendance.attendedTo)) add("ATTENDANCE_UNFINISHED", "All crew attendance periods must be finished.", "crew");

  if (log.logType === "rig_shift") {
    if (!log.job || !log.equipment) add("RIG_CONTEXT_REQUIRED", "A rig shift requires a job and equipment.", "job");
    for (const point of log.points) {
      if (!point.endedAt || point.endDepthM == null || !point.endStatus) add("POINT_UNFINISHED", `${point.pointId} requires a finish depth and status.`, "points");
      if (point.jobNumber !== log.job?.jobNumber) add("POINT_JOB_MISMATCH", `${point.pointId} does not belong to the daily log job.`, "points");
    }
  } else {
    if (log.job || log.equipment || log.points.length) add("ANCILLARY_CONTEXT_INVALID", "Ancillary logs cannot contain a job, equipment, or points.", "logType");
    if (log.activities.some((activity) => activity.allocation.type !== "ancillary")) add("ANCILLARY_ALLOCATION_INVALID", "Ancillary activities require ancillary allocation codes.", "activities");
  }
  return errors;
}

export function assertSubmittable(log) {
  const errors = validationErrors(log);
  if (errors.length) {
    const error = new Error("The daily log is not ready to submit.");
    error.code = "LOG_VALIDATION_FAILED";
    error.validationErrors = errors;
    throw error;
  }
  return true;
}

export const dailyLogContract = { version: CONTRACT_VERSION, timezone: TIMEZONE };
