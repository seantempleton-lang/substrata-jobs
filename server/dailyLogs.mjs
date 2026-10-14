import { createHash } from "node:crypto";
import { pool } from "./db.mjs";
import { draftErrors } from "../src/domain/dailyLog.js";
import { acknowledgementErrors } from "../src/domain/submission.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE_STATUSES = new Set(["draft", "returned", "reopened"]);
const ENTITY_TYPES = new Set(["daily_log"]);

function problem(code, message, field = null) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  error.statusCode = 400;
  return error;
}

function requireUuid(value, field) {
  if (!UUID.test(String(value || ""))) throw problem("INVALID_UUID", `${field} must be a UUID.`, field);
}

function requireInstant(value, field, nullable = false) {
  if (nullable && value == null) return;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw problem("INVALID_TIMESTAMP", `${field} must be an ISO timestamp.`, field);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function payloadHash(payload) {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

function validateAllocation(activity, log) {
  if (activity.allocation?.type === "job") {
    requireUuid(activity.allocation.jobId, "activities.allocation.jobId");
    if (log.logType === "ancillary" || !activity.allocation.jobNumber) {
      throw problem("ACTIVITY_JOB_MISMATCH", "Job allocation requires a job number on a rig log.", "activities");
    }
  } else if (activity.allocation?.type === "ancillary") {
    if (!activity.allocation.ancillaryCode) throw problem("ANCILLARY_CODE_REQUIRED", "Ancillary allocation requires a code.", "activities");
  } else {
    throw problem("ALLOCATION_REQUIRED", "Every activity requires a job or ancillary allocation.", "activities");
  }
}

export function validateDailyLog(log, authenticatedUserId) {
  if (!log || log.contractVersion !== "1.0") throw problem("CONTRACT_VERSION_UNSUPPORTED", "Daily log contractVersion must be 1.0.", "contractVersion");
  log.clientAcknowledgement ??= { status: "not_required" };
  requireUuid(log.id, "id");
  requireUuid(log.owner?.userId, "owner.userId");
  if (log.owner.userId !== authenticatedUserId) throw problem("LOG_OWNER_FORBIDDEN", "A field user can only sync their own daily log.", "owner.userId");
  if (!EDITABLE_STATUSES.has(log.status)) throw problem("LOG_IMMUTABLE", "Submitted or approved logs cannot be changed through draft sync.", "status");
  if (!["rig_shift", "ancillary"].includes(log.logType)) throw problem("LOG_TYPE_INVALID", "Unsupported daily log type.", "logType");
  requireInstant(log.shift?.startedAt, "shift.startedAt");
  requireInstant(log.shift?.endedAt, "shift.endedAt", true);
  requireInstant(log.createdAt, "createdAt");
  requireInstant(log.updatedAt, "updatedAt");
  if (log.assignmentId) requireUuid(log.assignmentId, "assignmentId");
  if (log.carriedFromLogId) requireUuid(log.carriedFromLogId, "carriedFromLogId");
  if (!["day", "night", "morning", "afternoon", "custom"].includes(log.shift?.label)) throw problem("SHIFT_LABEL_INVALID", "Unsupported shift label.", "shift.label");
  if (log.shift?.timezone !== "Pacific/Auckland") throw problem("TIMEZONE_INVALID", "Daily logs must use Pacific/Auckland.", "shift.timezone");
  if (!Array.isArray(log.crew) || !log.crew.length) throw problem("CREW_REQUIRED", "At least one crew attendance period is required.", "crew");
  if (!Array.isArray(log.activities) || !log.activities.length) throw problem("ACTIVITY_REQUIRED", "At least one activity is required.", "activities");
  if (!Array.isArray(log.points) || !Array.isArray(log.items)) throw problem("LOG_COLLECTION_INVALID", "Daily log collections are invalid.");

  if (log.logType === "rig_shift") {
    requireUuid(log.job?.jobId, "job.jobId");
    requireUuid(log.equipment?.equipmentId, "equipment.equipmentId");
  } else if (log.job || log.equipment || log.points.length) {
    throw problem("ANCILLARY_CONTEXT_INVALID", "Ancillary logs cannot contain a job, equipment, or points.", "logType");
  }

  const pointIds = new Set();
  const pointSequences = new Set();
  for (const point of log.points) {
    requireUuid(point.id, "points.id");
    if (point.jobNumber !== log.job?.jobNumber) throw problem("POINT_JOB_MISMATCH", "Point job number must match the daily log job.", "points");
    requireInstant(point.startedAt, "points.startedAt");
    requireInstant(point.endedAt, "points.endedAt", true);
    if (!Number.isInteger(point.sequence) || point.sequence < 1 || pointSequences.has(point.sequence)) throw problem("POINT_SEQUENCE_INVALID", "Point sequence must be unique and positive.", "points");
    pointSequences.add(point.sequence);
    pointIds.add(point.id);
  }
  for (const attendance of log.crew) {
    requireUuid(attendance.id, "crew.id");
    if (attendance.userId) requireUuid(attendance.userId, "crew.userId");
    if (!attendance.displayNameSnapshot) throw problem("CREW_NAME_REQUIRED", "Crew display name is required.", "crew");
    requireInstant(attendance.attendedFrom, "crew.attendedFrom");
    requireInstant(attendance.attendedTo, "crew.attendedTo", true);
  }
  const activitySequences = new Set();
  for (const activity of log.activities) {
    requireUuid(activity.id, "activities.id");
    if (activity.pointSegmentId && !pointIds.has(activity.pointSegmentId)) throw problem("ACTIVITY_POINT_INVALID", "Activity point must belong to the daily log.", "activities");
    if (!activity.activityCode || !activity.activityLabelSnapshot) throw problem("ACTIVITY_REQUIRED", "Activity code and label are required.", "activities");
    requireInstant(activity.startedAt, "activities.startedAt");
    requireInstant(activity.endedAt, "activities.endedAt", true);
    if (!Number.isInteger(activity.sequence) || activity.sequence < 1 || activitySequences.has(activity.sequence)) throw problem("ACTIVITY_SEQUENCE_INVALID", "Activity sequence must be unique and positive.", "activities");
    activitySequences.add(activity.sequence);
    validateAllocation(activity, log);
  }
  for (const item of log.items) {
    requireUuid(item.id, "items.id");
    if (item.pointSegmentId && !pointIds.has(item.pointSegmentId)) throw problem("ITEM_POINT_INVALID", "Item point must belong to the daily log.", "items");
    if (!item.itemCode || !item.itemLabelSnapshot || !["material", "service", "measurement", "subcontractor"].includes(item.itemType) || !item.unit || !Number.isFinite(item.quantity) || item.quantity < 0) {
      throw problem("ITEM_INVALID", "Log item code, label, type, non-negative quantity, and unit are required.", "items");
    }
  }
  const errors = [...draftErrors(log), ...acknowledgementErrors(log)];
  if (errors.length) throw problem(errors[0].code, errors[0].message, errors[0].field);
  return log;
}

function acknowledgement(row, status = row.result_status) {
  return {
    mutationId: row.mutation_id,
    status,
    serverRevision: row.result_revision == null ? null : Number(row.result_revision),
    errorCode: row.error_code || null,
    message: row.result_message || null,
  };
}

async function recordResult(client, { mutation, batchId, deviceId, userId, hash, status, revision = null, errorCode = null, message = null }) {
  const result = await client.query(
    `insert into jobs_app.sync_mutations (
       mutation_id, batch_id, device_id, actor_user_id, entity_type, entity_id, operation,
       base_revision, payload_hash, result_status, result_revision, error_code, result_message
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [mutation.mutationId, batchId, deviceId, userId, mutation.entityType, mutation.entityId,
      mutation.operation, mutation.baseRevision, hash, status, revision, errorCode, message],
  );
  return result.rows[0];
}

async function replaceChildren(client, log) {
  await client.query("delete from jobs_app.activities where daily_log_id = $1", [log.id]);
  await client.query("delete from jobs_app.log_items where daily_log_id = $1", [log.id]);
  await client.query("delete from jobs_app.crew_attendance where daily_log_id = $1", [log.id]);
  await client.query("delete from jobs_app.log_points where daily_log_id = $1", [log.id]);
  for (const point of log.points) await client.query(
    `insert into jobs_app.log_points
      (id,daily_log_id,job_number,point_id,sequence,started_at,ended_at,start_depth_m,end_depth_m,end_status,daily_details)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [point.id, log.id, point.jobNumber, point.pointId, point.sequence, point.startedAt, point.endedAt,
      point.startDepthM, point.endDepthM, point.endStatus, JSON.stringify(point.dailyDetails || {})],
  );
  for (const attendance of log.crew) await client.query(
    `insert into jobs_app.crew_attendance
      (id,daily_log_id,user_id,employee_code_snapshot,display_name_snapshot,role_snapshot,attended_from,attended_to)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [attendance.id, log.id, attendance.userId, attendance.employeeCodeSnapshot, attendance.displayNameSnapshot,
      attendance.roleSnapshot, attendance.attendedFrom, attendance.attendedTo],
  );
  for (const activity of log.activities) await client.query(
    `insert into jobs_app.activities
      (id,daily_log_id,point_segment_id,sequence,activity_code,activity_label_snapshot,started_at,ended_at,
       allocation_type,allocation_job_id,allocation_job_number_snapshot,ancillary_code,notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [activity.id, log.id, activity.pointSegmentId, activity.sequence, activity.activityCode,
      activity.activityLabelSnapshot, activity.startedAt, activity.endedAt, activity.allocation.type,
      activity.allocation.type === "job" ? activity.allocation.jobId : null,
      activity.allocation.type === "job" ? activity.allocation.jobNumber : null,
      activity.allocation.type === "ancillary" ? activity.allocation.ancillaryCode : null, activity.notes],
  );
  for (const item of log.items) await client.query(
    `insert into jobs_app.log_items
      (id,daily_log_id,point_segment_id,item_type,item_code,item_label_snapshot,quantity,unit,notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [item.id, log.id, item.pointSegmentId, item.itemType, item.itemCode, item.itemLabelSnapshot,
      item.quantity, item.unit, item.notes],
  );
}

async function applyMutation({ mutation, batchId, deviceId, user }) {
  requireUuid(mutation?.mutationId, "mutationId");
  requireUuid(mutation?.entityId, "entityId");
  if (!ENTITY_TYPES.has(mutation.entityType) || mutation.operation !== "upsert") {
    throw problem("SYNC_ENTITY_UNSUPPORTED", "This release accepts complete daily_log upserts only.", "entityType");
  }
  if (!Number.isInteger(mutation.baseRevision) || mutation.baseRevision < 0) throw problem("BASE_REVISION_INVALID", "baseRevision must be a non-negative integer.", "baseRevision");
  requireInstant(mutation.occurredAt, "occurredAt");
  if (mutation.entityId !== mutation.payload?.id) throw problem("ENTITY_ID_MISMATCH", "Mutation entityId must match payload id.", "entityId");
  validateDailyLog(mutation.payload, user.userId);
  const hash = payloadHash(mutation.payload);
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serialize concurrent retries and first creates, even when no log row exists yet.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [mutation.entityId]);
    const duplicate = await client.query("select * from jobs_app.sync_mutations where mutation_id = $1", [mutation.mutationId]);
    if (duplicate.rowCount) {
      const row = duplicate.rows[0];
      if (row.payload_hash !== hash || row.actor_user_id !== user.userId) throw problem("MUTATION_ID_REUSED", "Mutation ID was already used with different content.", "mutationId");
      await client.query("commit");
      return acknowledgement(row, row.result_status === "applied" ? "duplicate" : row.result_status);
    }

    const existing = await client.query("select owner_user_id, status, server_revision, aggregate, current_document_revision from jobs_app.daily_logs where id = $1 for update", [mutation.entityId]);
    if (existing.rowCount && Number(existing.rows[0].server_revision) !== mutation.baseRevision) {
      const row = await recordResult(client, { mutation, batchId, deviceId, userId: user.userId, hash,
        status: "conflict", revision: Number(existing.rows[0].server_revision), errorCode: "REVISION_CONFLICT",
        message: "The server daily log changed after this device last synchronized." });
      await client.query("commit");
      return acknowledgement(row);
    }
    if (!existing.rowCount && mutation.baseRevision !== 0) throw problem("LOG_NOT_FOUND", "A non-zero base revision requires an existing daily log.", "baseRevision");
    if (existing.rowCount && (existing.rows[0].owner_user_id !== user.userId || !EDITABLE_STATUSES.has(existing.rows[0].status))) {
      throw problem("LOG_IMMUTABLE", "The server daily log is not editable by this user.", "status");
    }

    if (mutation.payload.job) {
      const job = await client.query("select job_number from public.jobs where id = $1", [mutation.payload.job.jobId]);
      if (!job.rowCount || job.rows[0].job_number !== mutation.payload.job.jobNumber) throw problem("JOB_IDENTITY_MISMATCH", "jobId does not resolve to jobNumber.", "job");
    }
    for (const allocation of mutation.payload.activities.map(activity => activity.allocation).filter(allocation => allocation.type === "job")) {
      const job = await client.query("select job_number from public.jobs where id=$1", [allocation.jobId]);
      if (!job.rowCount || job.rows[0].job_number !== allocation.jobNumber) throw problem("JOB_IDENTITY_MISMATCH", "Payroll jobId does not resolve to jobNumber.", "activities.allocation");
    }
    const revision = (existing.rowCount ? Number(existing.rows[0].server_revision) : 0) + 1;
    const log = structuredClone(mutation.payload);
    if (log.status !== (existing.rows[0]?.status || 'draft')) throw problem('WORKFLOW_STATE_FORBIDDEN', 'Review states can only be changed by the office workflow.', 'status');
    // Office decisions are server-owned, even when a field device sends an old
    // or modified copy during returned-log synchronization.
    for (const field of ['officeReview', 'approvedAt', 'submittedAt', 'requiresDrillerAction']) {
      delete log[field];
      if (existing.rows[0]?.aggregate?.[field] !== undefined) log[field] = existing.rows[0].aggregate[field];
    }
    log.currentDocumentRevision = Number(existing.rows[0]?.current_document_revision || 0);
    await client.query(
      `insert into jobs_app.daily_logs (
        id,log_type,division,assignment_id,job_id,job_number_snapshot,job_snapshot,equipment_id,
        equipment_code_snapshot,equipment_snapshot,owner_user_id,owner_snapshot,shift_label,shift_started_at,
        shift_ended_at,timezone,status,current_document_revision,server_revision,carried_from_log_id,
        client_acknowledgement,notes,created_at,updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23,$24)
      on conflict (id) do update set
        division=excluded.division, assignment_id=excluded.assignment_id, job_id=excluded.job_id,
        job_number_snapshot=excluded.job_number_snapshot, job_snapshot=excluded.job_snapshot,
        equipment_id=excluded.equipment_id, equipment_code_snapshot=excluded.equipment_code_snapshot,
        equipment_snapshot=excluded.equipment_snapshot, shift_label=excluded.shift_label,
        shift_started_at=excluded.shift_started_at, shift_ended_at=excluded.shift_ended_at,
        current_document_revision=excluded.current_document_revision, server_revision=excluded.server_revision,
        carried_from_log_id=excluded.carried_from_log_id, client_acknowledgement=excluded.client_acknowledgement,
        notes=excluded.notes, updated_at=excluded.updated_at`,
      [log.id, log.logType, log.division, log.assignmentId, log.job?.jobId || null, log.job?.jobNumber || null,
        JSON.stringify(log.job), log.equipment?.equipmentId || null, log.equipment?.equipmentCode || null,
        JSON.stringify(log.equipment), log.owner.userId, JSON.stringify(log.owner), log.shift.label,
        log.shift.startedAt, log.shift.endedAt, log.shift.timezone, log.status, log.currentDocumentRevision || 0,
        revision, log.carriedFromLogId, JSON.stringify(log.clientAcknowledgement), log.notes, log.createdAt, log.updatedAt],
    );
    await replaceChildren(client, log);
    await client.query("update jobs_app.daily_logs set aggregate=$2::jsonb where id=$1", [log.id, JSON.stringify({ ...log, serverRevision: revision })]);
    const planned = log.assignmentId ? await client.query("select personnel from public.planner_assignments where id=$1", [log.assignmentId]) : { rows: [] };
    const plannedCrew = planned.rows[0]?.personnel || [];
    const names = plannedCrew.map(person => typeof person === "string" ? person : person.displayName || person.name);
    const actualNames = [...new Set(log.crew.map(person => person.displayNameSnapshot))];
    const deviations = { outsideAssignment: !!log.assignmentId && !plannedCrew.some(person => typeof person === "string" ? person === user.displayName : person.userId === user.userId || person.displayName === user.displayName),
      added: actualNames.filter(name => !names.includes(name)), removed: names.filter(name => !actualNames.includes(name)) };
    await client.query(
      `insert into jobs_app.audit_events (daily_log_id,actor_user_id,event_type,before_revision,after_revision,metadata)
       values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [log.id, user.userId, existing.rowCount ? "draft_synced" : "draft_created",
        existing.rowCount ? mutation.baseRevision : null, revision, JSON.stringify({ mutationId: mutation.mutationId, deviceId, occurredAt: mutation.occurredAt, deviations,
          previous: existing.rows[0]?.aggregate ?? null, current: { ...log, serverRevision: revision } })],
    );
    const row = await recordResult(client, { mutation, batchId, deviceId, userId: user.userId, hash, status: "applied", revision });
    await client.query("commit");
    return acknowledgement(row);
  } catch (error) {
    try { await client.query("rollback"); } catch { /* connection may already be outside a transaction */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function readDailyLog(id, user) {
  requireUuid(id, "id");
  const result = await pool.query("select * from jobs_app.daily_logs where id=$1", [id]);
  if (!result.rowCount) throw Object.assign(problem("LOG_NOT_FOUND", "Daily log was not found."), { statusCode: 404 });
  const row = result.rows[0];
  if (row.owner_user_id !== user.userId && !["Supervisor", "Administrator", "SuperUser"].includes(user.appRole))
    throw Object.assign(problem("LOG_OWNER_FORBIDDEN", "This daily log belongs to another user."), { statusCode: 403 });
  if (row.aggregate) return { ...row.aggregate, serverRevision: Number(row.server_revision), status: row.status };
  const [points, crew, activities, items] = await Promise.all([
    pool.query("select * from jobs_app.log_points where daily_log_id=$1 order by sequence", [id]),
    pool.query("select * from jobs_app.crew_attendance where daily_log_id=$1 order by attended_from", [id]),
    pool.query("select * from jobs_app.activities where daily_log_id=$1 order by sequence", [id]),
    pool.query("select * from jobs_app.log_items where daily_log_id=$1", [id]),
  ]);
  const iso = value => value ? new Date(value).toISOString() : null;
  return { contractVersion: "1.0", id, logType: row.log_type, division: row.division, job: row.job_snapshot, equipment: row.equipment_snapshot,
    owner: row.owner_snapshot, assignmentId: row.assignment_id, carriedFromLogId: row.carried_from_log_id, status: row.status,
    serverRevision: Number(row.server_revision), currentDocumentRevision: row.current_document_revision, notes: row.notes,
    clientAcknowledgement: row.client_acknowledgement, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    shift: { label: row.shift_label, startedAt: iso(row.shift_started_at), endedAt: iso(row.shift_ended_at), timezone: row.timezone },
    points: points.rows.map(p => ({ id: p.id, sequence: p.sequence, jobNumber: p.job_number, pointId: p.point_id, startedAt: iso(p.started_at), endedAt: iso(p.ended_at), startDepthM: p.start_depth_m == null ? null : Number(p.start_depth_m), endDepthM: p.end_depth_m == null ? null : Number(p.end_depth_m), endStatus: p.end_status, dailyDetails: p.daily_details || {} })),
    crew: crew.rows.map(p => ({ id: p.id, userId: p.user_id, employeeCodeSnapshot: p.employee_code_snapshot, displayNameSnapshot: p.display_name_snapshot, roleSnapshot: p.role_snapshot, attendedFrom: iso(p.attended_from), attendedTo: iso(p.attended_to) })),
    activities: activities.rows.map(a => ({ id: a.id, sequence: a.sequence, pointSegmentId: a.point_segment_id, activityCode: a.activity_code, activityLabelSnapshot: a.activity_label_snapshot, startedAt: iso(a.started_at), endedAt: iso(a.ended_at), allocation: a.allocation_type === "job" ? { type: "job", jobId: a.allocation_job_id, jobNumber: a.allocation_job_number_snapshot } : { type: "ancillary", ancillaryCode: a.ancillary_code }, notes: a.notes })),
    items: items.rows.map(i => ({ id: i.id, pointSegmentId: i.point_segment_id, itemType: i.item_type, itemCode: i.item_code, itemLabelSnapshot: i.item_label_snapshot, quantity: Number(i.quantity), unit: i.unit, notes: i.notes })),
  };
}

export async function listDailyLogs(user, office = false) {
  if (office && !["Supervisor", "Administrator", "SuperUser"].includes(user.appRole)) throw Object.assign(problem("OFFICE_FORBIDDEN", "Supervisor access is required."), { statusCode: 403 });
  const result = await pool.query(`select id from jobs_app.daily_logs where ($1::boolean or owner_user_id=$2)
    and (shift_started_at>=now()-interval '14 days' or updated_at>=now()-interval '14 days'
      or status in ('draft','submitted','under_review','returned','awaiting_driller_confirmation','reopened')) order by shift_started_at desc`, [office, user.userId]);
  return Promise.all(result.rows.map(row => readDailyLog(row.id, user)));
}

export async function applySyncBatch({ body, user }) {
  if (body?.contractVersion !== "1.0") throw problem("CONTRACT_VERSION_UNSUPPORTED", "Sync contractVersion must be 1.0.", "contractVersion");
  requireUuid(body.batchId, "batchId");
  requireUuid(body.deviceId, "deviceId");
  if (!Array.isArray(body.mutations) || body.mutations.length > 100) throw problem("MUTATION_BATCH_INVALID", "A sync batch may contain up to 100 mutations.", "mutations");
  const acknowledgements = [];
  for (const mutation of body.mutations) {
    try {
      acknowledgements.push(await applyMutation({ mutation, batchId: body.batchId, deviceId: body.deviceId, user }));
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) throw error;
      acknowledgements.push({ mutationId: mutation?.mutationId || null, status: "rejected", serverRevision: null,
        errorCode: error.code || "MUTATION_REJECTED", message: error.message });
    }
  }
  return {
    contractVersion: "1.0",
    serverTime: new Date().toISOString(),
    syncCursor: `sync:${Date.now()}`,
    acknowledgements,
    changes: [],
  };
}
