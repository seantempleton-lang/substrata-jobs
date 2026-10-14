import nodemailer from "nodemailer";
import { pool } from "./db.mjs";
import { readDailyLog } from "./dailyLogs.mjs";
import { downloadDocument, problem, uuid } from "./submissions.mjs";

export const validEmail = value => typeof value === "string" && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export function emailCapability() {
  const provider = process.env.EMAIL_PROVIDER || "unconfigured";
  const configured = validEmail(process.env.EMAIL_FROM) && (!process.env.EMAIL_REPLY_TO || validEmail(process.env.EMAIL_REPLY_TO)) && (
    provider === "microsoft_graph" ? ["MS365_TENANT_ID", "MS365_CLIENT_ID", "MS365_CLIENT_SECRET"].every(k => !!process.env[k]) :
      provider === "local_smtp" && process.env.EMAIL_ALLOW_LOCAL_CAPTURE === "true" && !!process.env.SMTP_HOST);
  return { provider, configured: !!configured, from: process.env.EMAIL_FROM || null, replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || null,
    receiptTracking: false, localCapture: provider === "local_smtp" };
}

export async function deliverEmail({ requestId, recipient, from, replyTo, content, log, revision }, fetcher = fetch) {
  const subject = `Substrata - Job ${log.job.jobNumber} - Draft daily record - Revision ${revision}`;
  const text = `Please find the attached daily field record for ${log.job.title}.\n\nDRAFT - Awaiting Supervisor Approval. This records the work submitted by the field team and remains subject to supervisor review.\n\nPlease reply to this email if you have questions about the recorded work.\n\nSubstrata`;
  const filename = `daily-record-${log.id}-r${revision}-draft.pdf`;
  if (process.env.EMAIL_PROVIDER === "local_smtp") {
    if (process.env.EMAIL_ALLOW_LOCAL_CAPTURE !== "true") throw problem("EMAIL_UNCONFIGURED", "Local capture is disabled.", 503);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 1025), secure: false, ignoreTLS: true,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    const result = await transport.sendMail({ from, to: recipient, replyTo, subject, text,
      messageId: `<${requestId}@substrata-jobs.local>`, attachments: [{ filename, content, contentType: "application/pdf" }] });
    if (!result.accepted?.length) throw Object.assign(new Error("Recipient rejected"), { definitive: true });
    return { providerMessageId: result.messageId };
  }
  // Token failure occurs before sending and is safe to retry with a new request.
  let token;
  try {
    const response = await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS365_TENANT_ID)}/oauth2/v2.0/token`, {
      method: "POST", signal: AbortSignal.timeout(15000), body: new URLSearchParams({ client_id: process.env.MS365_CLIENT_ID, client_secret: process.env.MS365_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error("Microsoft 365 authentication failed");
    token = data.access_token;
  } catch { throw Object.assign(new Error("Microsoft 365 authentication failed before send"), { definitive: true, code: "EMAIL_AUTH_FAILED" }); }
  if (content.length > 2500000) throw Object.assign(new Error("PDF exceeds the supported inline attachment size"), { definitive: true, code: "EMAIL_ATTACHMENT_TOO_LARGE" });
  const response = await fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "client-request-id": requestId, "return-client-request-id": "true" },
    body: JSON.stringify({ message: { subject, body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: recipient } }],
      replyTo: [{ emailAddress: { address: replyTo } }], internetMessageHeaders: [{ name: "x-substrata-request-id", value: requestId }],
      attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: filename, contentType: "application/pdf", contentBytes: content.toString("base64") }] }, saveToSentItems: true }),
  });
  if (response.status !== 202) throw Object.assign(new Error("Microsoft 365 did not accept the request"), { definitive: response.status >= 400 && response.status < 500, code: "EMAIL_PROVIDER_REJECTED" });
  // sendMail does not return a message ID. Do not invent one.
  return { providerMessageId: null };
}

export async function sendClientEmail(logId, revision, body, user) {
  uuid(body?.requestId);
  if (!validEmail(body.recipient)) throw problem("EMAIL_RECIPIENT_INVALID", "Choose or enter one valid recipient email address.");
  if (body.resendOf) uuid(body.resendOf);
  const log = await readDailyLog(logId, user);
  if (log.owner.userId !== user.userId && !["Supervisor", "Administrator", "SuperUser"].includes(user.appRole)) throw problem("EMAIL_FORBIDDEN", "You may not send this record.", 403);
  const artifact = await downloadDocument(logId, revision, user);
  const capability = emailCapability();
  const client = await pool.connect();
  let row;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`email:${logId}:${revision}`]);
    const existing = await client.query("select * from jobs_app.email_deliveries where request_id=$1", [body.requestId]);
    if (existing.rowCount) {
      row = existing.rows[0];
      if (row.daily_log_id !== logId || row.revision !== revision || row.recipient !== body.recipient || row.actor_user_id !== user.userId || (row.resend_of || null) !== (body.resendOf || null)) throw problem("EMAIL_REQUEST_ID_REUSED", "Send request ID was used with different details.", 409);
      await client.query("commit"); return row;
    }
    const previous = await client.query("select * from jobs_app.email_deliveries where daily_log_id=$1 and revision=$2 order by requested_at desc limit 1", [logId, revision]);
    if (previous.rowCount) {
      const last = previous.rows[0];
      if (body.resendOf !== last.request_id) throw problem("EMAIL_RESEND_REQUIRED", "A previous send exists. Review delivery history and deliberately retry or resend.", 409);
      if ((last.state === "unknown" || last.state === "queued") && body.confirmPossibleDuplicate !== true) throw problem("EMAIL_OUTCOME_UNKNOWN", "The earlier email may have been sent. Confirm possible duplicate delivery before an intentional resend.", 409);
    } else if (body.resendOf) throw problem("EMAIL_RESEND_INVALID", "No prior delivery exists for this revision.");
    row = (await client.query(`insert into jobs_app.email_deliveries
      (request_id,daily_log_id,revision,artifact_id,artifact_sha256,actor_user_id,recipient,from_address,reply_to,provider,state,error_code,attempted_at,resend_of)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,case when $13 then now() else null end,$14) returning *`,
    [body.requestId, logId, revision, artifact.id, artifact.sha256, user.userId, body.recipient, capability.from || "unconfigured", capability.replyTo, capability.provider,
      capability.configured ? "queued" : "failed", capability.configured ? null : "EMAIL_UNCONFIGURED", capability.configured, body.resendOf || null])).rows[0];
    await client.query("insert into jobs_app.audit_events (daily_log_id,actor_user_id,event_type,metadata) values ($1,$2,'client_email_requested',$3::jsonb)",
      [logId, user.userId, JSON.stringify({ requestId: body.requestId, documentRevision: revision, recipient: body.recipient })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  if (!capability.configured) return row;
  // The attempt is durable BEFORE contacting the provider. Replays return history;
  // they never retry an ambiguous network operation and send another copy.
  let state = "sent", providerId = null, errorCode = null;
  try {
    const snapshot = (await pool.query("select snapshot from jobs_app.log_revisions where daily_log_id=$1 and revision=$2", [logId, revision])).rows[0].snapshot;
    const result = await deliverEmail({ requestId: body.requestId, recipient: body.recipient, from: capability.from, replyTo: capability.replyTo, content: artifact.content, log: snapshot, revision });
    providerId = result.providerMessageId;
  } catch (error) { state = error.definitive || ["EAUTH", "EENVELOPE"].includes(error.code) ? "failed" : "unknown"; errorCode = error.code || "EMAIL_PROVIDER_OUTCOME_UNKNOWN"; }
  return (await pool.query("update jobs_app.email_deliveries set state=$2,provider_message_id=$3,error_code=$4,completed_at=now() where request_id=$1 returning *", [body.requestId, state, providerId, errorCode])).rows[0];
}
