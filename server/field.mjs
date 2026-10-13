import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { query } from "./db.mjs";
import { readDailyLog } from "./dailyLogs.mjs";

function problem(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
export function serviceAuthorized(value) {
  const expected = process.env.FIELD_JOBS_KEY;
  if (!expected || !value) return false;
  const a = Buffer.from(expected), b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function getFieldPoints(jobNumber) {
  if (!process.env.FIELD_API_URL || !process.env.FIELD_JOBS_KEY) throw problem(503, "FIELD_UNCONFIGURED", "Field connection is not configured. Cached points remain available.");
  const url = new URL("/api/jobs/points", process.env.FIELD_API_URL);
  url.searchParams.set("proj_id", jobNumber);
  const response = await fetch(url, { headers: { "X-Jobs-Key": process.env.FIELD_JOBS_KEY }, signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok) throw problem(502, "FIELD_UNAVAILABLE", "Field points are temporarily unavailable.");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw problem(502, "FIELD_RESPONSE_INVALID", "Field returned an invalid point list.");
  return rows.map(row => ({ jobNumber, pointId: row.POINT_ID, pointType: row.Type ?? null,
    plannedDepthM: row.HoleDepth == null ? null : Number(row.HoleDepth), location: row.Location ?? null }));
}

export async function createHandoff(body, user) {
  const log = await readDailyLog(body.dailyLogId, user);
  if (!log.job || log.owner.userId !== user.userId || log.job.jobNumber !== body.jobNumber)
    throw problem(403, "HANDOFF_FORBIDDEN", "Field context must match your rig daily log.");
  const modules = ["project", "geology", "spt", "core", "installation", "backfill", "consumables", "photos"];
  if (body.contractVersion !== "1.0" || !modules.includes(body.requestedModule)) throw problem(400, "HANDOFF_INVALID", "Unsupported Field module.");
  if (body.pointId && !(await getFieldPoints(body.jobNumber)).some(point => point.pointId === body.pointId))
    throw problem(400, "POINT_NOT_FOUND", "Select a point owned by Field for this job.");
  const returnUrl = new URL(process.env.APP_BASE_URL);
  returnUrl.searchParams.set("dailyLogId", log.id);
  const handoffId = randomUUID(), token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 300000).toISOString();
  const context = { contractVersion: "1.0", handoffId, dailyLogId: log.id, user,
    PROJ_ID: log.job.jobNumber, POINT_ID: body.pointId || "", allowedModules: [body.requestedModule], returnUrl: returnUrl.href, expiresAt };
  await query(`insert into jobs_app.field_handoffs (id,token_hash,daily_log_id,actor_user_id,context,expires_at)
    values ($1,$2,$3,$4,$5::jsonb,$6)`, [handoffId, createHash("sha256").update(token).digest("hex"), log.id, user.userId, JSON.stringify(context), expiresAt]);
  await query(`insert into jobs_app.audit_events(daily_log_id,actor_user_id,event_type,metadata) values($1,$2,'field_handoff_created',$3::jsonb)`,
    [log.id, user.userId, JSON.stringify({ handoffId, pointId: body.pointId, requestedModule: body.requestedModule })]);
  const launchUrl = new URL("/", process.env.FIELD_BASE_URL || process.env.FIELD_API_URL);
  launchUrl.searchParams.set("handoff", token);
  return { contractVersion: "1.0", handoffId, launchUrl: launchUrl.href, expiresAt };
}

export async function consumeHandoff(body) {
  if (!/^[a-f0-9]{64}$/.test(body.token || "") || !body.employeeCode) throw problem(400, "HANDOFF_INVALID", "Invalid handoff request.");
  const result = await query(`update jobs_app.field_handoffs set consumed_at=now()
    where token_hash=$1 and consumed_at is null and expires_at>now() and context->'user'->>'employeeCode'=$2 returning context`,
    [createHash("sha256").update(body.token).digest("hex"), body.employeeCode]);
  if (!result.rowCount) throw problem(403, "HANDOFF_EXPIRED", "Handoff is expired, already used, or belongs to another user.");
  return result.rows[0].context;
}
