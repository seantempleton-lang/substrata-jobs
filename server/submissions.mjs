import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pool } from "./db.mjs";
import { readDailyLog, validateDailyLog } from "./dailyLogs.mjs";
import { assertSubmittable } from "../src/domain/dailyLog.js";
import { canonical, workContent, submissionContent } from "../src/domain/submission.js";
import { renderDraftPdf } from "./output.mjs";

export const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
export function problem(code, message, statusCode = 400, extra = {}) { return Object.assign(new Error(message), { code, statusCode, ...extra }); }
export function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "")) throw problem("INVALID_UUID", "A valid request or asset UUID is required.");
}

export function signatureKey(keyId = process.env.SIGNATURE_KEY_ID || "v1") {
  let encoded = process.env.SIGNATURE_ENCRYPTION_KEY || "";
  if (keyId !== (process.env.SIGNATURE_KEY_ID || "v1")) {
    try { encoded = JSON.parse(process.env.SIGNATURE_PREVIOUS_KEYS || "{}")[keyId] || ""; } catch { encoded = ""; }
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw problem("SIGNATURE_STORAGE_UNCONFIGURED", "Signature encryption is not configured. Your signature remains on the device.", 503);
  return key;
}

export function validateDrawing(drawing) {
  if (!drawing || !Array.isArray(drawing.strokes) || !drawing.strokes.length || drawing.strokes.length > 300) throw problem("SIGNATURE_INVALID", "Draw a signature before saving.");
  let count = 0;
  for (const stroke of drawing.strokes) {
    if (!Array.isArray(stroke) || stroke.length < 2) throw problem("SIGNATURE_INVALID", "Signature strokes must contain at least two points.");
    for (const point of stroke) {
      if (!Array.isArray(point) || point.length !== 2 || point.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw problem("SIGNATURE_INVALID", "Signature coordinates are invalid.");
      count++;
    }
  }
  if (count > 20000 || Buffer.byteLength(JSON.stringify(drawing)) > 512000) throw problem("SIGNATURE_TOO_LARGE", "Signature exceeds the supported size.", 413);
  return { strokes: drawing.strokes };
}

function decryptSignature(row) {
  const decipher = createDecipheriv("aes-256-gcm", signatureKey(row.key_id), row.nonce);
  decipher.setAAD(Buffer.from(`${row.id}:${row.daily_log_id}:${row.content_hash}`));
  decipher.setAuthTag(row.auth_tag);
  return JSON.parse(Buffer.concat([decipher.update(row.encrypted_content), decipher.final()]).toString());
}

export async function uploadSignature(logId, body, user) {
  uuid(logId); uuid(body?.id);
  const log = await readDailyLog(logId, user);
  if (log.owner.userId !== user.userId) throw problem("LOG_OWNER_FORBIDDEN", "Only the record owner may upload a signature.", 403);
  const drawing = validateDrawing(body.drawing);
  validateDailyLog(body.snapshot, user.userId);
  if (body.snapshot.id !== logId || body.snapshot.logType !== "rig_shift") throw problem("SIGNATURE_CONTEXT_INVALID", "Signature must belong to this rig log.");
  const ack = body.snapshot.clientAcknowledgement;
  if (ack?.status !== "signed_on_device" || ack.signatureUploadId !== body.id || !ack.signerName?.trim() || !Number.isFinite(Date.parse(ack.signedAt))) throw problem("SIGNATURE_CONTEXT_INVALID", "Signature acknowledgement is incomplete.");
  const contentHash = hash(workContent(body.snapshot));
  if (ack.contentHash !== contentHash) throw problem("SIGNATURE_CONTENT_MISMATCH", "Signature does not match the acknowledged work.");
  const payloadHash = hash({ content: workContent(body.snapshot), acknowledgement: ack, drawing });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [logId]);
    const existing = await client.query("select * from jobs_app.signature_assets where id=$1", [body.id]);
    if (existing.rowCount) {
      if (existing.rows[0].payload_hash !== payloadHash || existing.rows[0].actor_user_id !== user.userId) throw problem("SIGNATURE_ID_REUSED", "Signature ID was used with different content.", 409);
    } else {
      const current = await client.query("select status,owner_user_id from jobs_app.daily_logs where id=$1 for update", [logId]);
      if (current.rows[0].owner_user_id !== user.userId || !["draft", "returned", "reopened"].includes(current.rows[0].status)) throw problem("LOG_IMMUTABLE", "This record is no longer editable.", 409);
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", signatureKey(), nonce);
      cipher.setAAD(Buffer.from(`${body.id}:${logId}:${contentHash}`));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(drawing)), cipher.final()]);
      await client.query(`insert into jobs_app.signature_assets
        (id,daily_log_id,actor_user_id,content_hash,acknowledged_content,acknowledgement,payload_hash,encrypted_content,nonce,auth_tag,key_id)
        values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)`,
      [body.id, logId, user.userId, contentHash, JSON.stringify(workContent(body.snapshot)), JSON.stringify(ack), payloadHash, encrypted, nonce, cipher.getAuthTag(), process.env.SIGNATURE_KEY_ID || "v1"]);
    }
    await client.query("commit"); return { id: body.id, contentHash, state: "uploaded" };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function readSignature(id, user) {
  uuid(id);
  const result = await pool.query("select * from jobs_app.signature_assets where id=$1", [id]);
  if (!result.rowCount) throw problem("SIGNATURE_NOT_FOUND", "Signature was not found.", 404);
  await readDailyLog(result.rows[0].daily_log_id, user);
  return { id, contentHash: result.rows[0].content_hash, drawing: decryptSignature(result.rows[0]) };
}

export async function submitLog(logId, body, user) {
  uuid(logId); uuid(body?.requestId);
  if (!Number.isInteger(body.baseRevision) || body.baseRevision < 1 || !/^[a-f0-9]{64}$/.test(body.contentHash || "")) throw problem("SUBMISSION_INVALID", "Submission requires the synchronized revision and content hash.");
  const requestHash = hash({ logId, baseRevision: body.baseRevision, contentHash: body.contentHash });
  const client = await pool.connect();
  let revision;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [logId]);
    const result = await client.query("select * from jobs_app.daily_logs where id=$1 for update", [logId]);
    const row = result.rows[0];
    if (!row) throw problem("LOG_NOT_FOUND", "Synchronize the record before submission.", 404);
    if (row.owner_user_id !== user.userId) throw problem("LOG_OWNER_FORBIDDEN", "Only the record owner may submit.", 403);
    const existing = await client.query("select * from jobs_app.log_revisions where request_id=$1", [body.requestId]);
    if (existing.rowCount) {
      const previous = existing.rows[0];
      if (previous.daily_log_id !== logId || previous.created_by_user_id !== user.userId || previous.request_hash !== requestHash) throw problem("SUBMISSION_ID_REUSED", "Submission ID was used with different content.", 409);
      revision = previous.revision;
    } else {
      if (!["draft", "returned", "reopened"].includes(row.status)) throw problem("LOG_IMMUTABLE", "This record has already been submitted.", 409);
      if (Number(row.server_revision) !== body.baseRevision || hash(submissionContent(row.aggregate)) !== body.contentHash) throw problem("REVISION_CONFLICT", "The server content changed. Review both versions before submitting.", 409);
      validateDailyLog(row.aggregate, user.userId);
      try { assertSubmittable(row.aggregate); } catch (error) { throw problem(error.code, error.message, 422, { validationErrors: error.validationErrors }); }
      revision = Number(row.current_document_revision) + 1;
      const snapshot = { ...row.aggregate, status: "submitted", requiresDrillerAction: false, serverRevision: Number(row.server_revision) + 1, currentDocumentRevision: revision, submittedAt: new Date().toISOString() };
      let signatureId = null;
      if (snapshot.clientAcknowledgement.status === "signed_on_device") {
        const asset = await client.query("select * from jobs_app.signature_assets where id=$1 and daily_log_id=$2 and actor_user_id=$3", [snapshot.clientAcknowledgement.signatureUploadId, logId, user.userId]);
        if (!asset.rowCount) throw problem("SIGNATURE_UPLOAD_PENDING", "Upload the saved signature before finalizing submission.", 409);
        const signature = asset.rows[0];
        if (hash(signature.acknowledgement) !== hash(snapshot.clientAcknowledgement)) throw problem("SIGNATURE_ACK_MISMATCH", "Representative details changed after signing. Capture a new acknowledgement.", 409);
        if (signature.content_hash === hash(workContent(snapshot))) signatureId = signature.id;
        else snapshot.clientAcknowledgement = { status: "not_signed", reasonCode: "CONTENT_CHANGED", reasonNotes: "The earlier signature is retained against the work originally acknowledged.", clientEmail: snapshot.clientAcknowledgement.clientEmail || null, priorSignatureUploadId: signature.id };
      }
      await client.query(`insert into jobs_app.log_revisions (daily_log_id,revision,request_id,request_hash,snapshot,content_sha256,signature_asset_id,created_by_user_id)
        values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`, [logId, revision, body.requestId, requestHash, JSON.stringify(snapshot), hash(submissionContent(snapshot)), signatureId, user.userId]);
      await client.query(`update jobs_app.daily_logs set status='submitted',current_document_revision=$2,server_revision=$3,aggregate=$4::jsonb,client_acknowledgement=$5::jsonb where id=$1`,
      [logId, revision, snapshot.serverRevision, JSON.stringify(snapshot), JSON.stringify(snapshot.clientAcknowledgement)]);
      if (snapshot.logType === "rig_shift") await client.query("insert into jobs_app.document_artifacts (daily_log_id,revision) values ($1,$2)", [logId, revision]);
      await client.query("insert into jobs_app.audit_events (daily_log_id,actor_user_id,event_type,before_revision,after_revision,metadata) values ($1,$2,'submitted',$3,$4,$5::jsonb)",
      [logId, user.userId, row.server_revision, snapshot.serverRevision, JSON.stringify({ requestId: body.requestId, documentRevision: revision })]);
    }
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  // The submitted snapshot is already durable. A renderer failure cannot undo it.
  const document = await generateDocument(logId, revision, user);
  return { log: await readDailyLog(logId, user), document };
}

export async function generateDocument(logId, revision, user) {
  if (!Number.isInteger(revision) || revision < 1) throw problem("DOCUMENT_REVISION_INVALID", "Choose a positive document revision.");
  const log = await readDailyLog(logId, user);
  if (log.logType === "ancillary") return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query("select * from jobs_app.document_artifacts where daily_log_id=$1 and revision=$2 for update", [logId, revision]);
    const row = result.rows[0];
    if (!row) throw problem("DOCUMENT_NOT_FOUND", "No submitted PDF revision was found.", 404);
    if (row.state !== "ready") {
      try {
        const { rows: [record] } = await client.query("select * from jobs_app.log_revisions where daily_log_id=$1 and revision=$2", [logId, revision]);
        const asset = record.signature_asset_id ? (await client.query("select * from jobs_app.signature_assets where id=$1", [record.signature_asset_id])).rows[0] : null;
        const content = await renderDraftPdf(record.snapshot, revision, asset ? decryptSignature(asset) : null);
        await client.query("update jobs_app.document_artifacts set state='ready',content=$2,sha256=$3,error_code=null,generated_at=now() where id=$1", [row.id, content, createHash("sha256").update(content).digest("hex")]);
      } catch (error) {
        // Renderer/encryption failures are reported without exposing sensitive detail.
        if (error.code?.startsWith("23") || error.code?.startsWith("42")) throw error;
        await client.query("update jobs_app.document_artifacts set state='failed',error_code=$2 where id=$1", [row.id, error.code || "PDF_GENERATION_FAILED"]);
      }
    }
    await client.query("commit");
    return (await client.query("select id,state,sha256,error_code,generated_at,template_version from jobs_app.document_artifacts where id=$1", [row.id])).rows[0];
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function readOutput(logId, user) {
  await readDailyLog(logId, user);
  await pool.query("update jobs_app.email_deliveries set state='unknown',error_code='EMAIL_ATTEMPT_INTERRUPTED',completed_at=now() where daily_log_id=$1 and state='queued' and attempted_at < now()-interval '2 minutes'", [logId]);
  const [revisions, deliveries] = await Promise.all([
    pool.query(`select r.revision,r.content_sha256,r.created_at,d.id,d.state,d.sha256,d.error_code,d.generated_at
      from jobs_app.log_revisions r left join jobs_app.document_artifacts d on d.daily_log_id=r.daily_log_id and d.revision=r.revision where r.daily_log_id=$1 order by r.revision desc`, [logId]),
    pool.query("select d.*,u.full_name as sender_name from jobs_app.email_deliveries d join public.app_users u on u.id=d.actor_user_id where d.daily_log_id=$1 order by d.requested_at desc", [logId]),
  ]);
  return { revisions: revisions.rows, deliveries: deliveries.rows };
}

export async function downloadDocument(logId, revision, user) {
  if (!Number.isInteger(revision) || revision < 1) throw problem("DOCUMENT_REVISION_INVALID", "Choose a positive document revision.");
  await readDailyLog(logId, user);
  const result = await pool.query("select * from jobs_app.document_artifacts where daily_log_id=$1 and revision=$2", [logId, revision]);
  if (!result.rowCount) throw problem("DOCUMENT_NOT_FOUND", "PDF was not found.", 404);
  if (result.rows[0].state !== "ready") throw problem("PDF_NOT_READY", "PDF generation is pending or failed. Retry generation.", 409);
  return result.rows[0];
}
