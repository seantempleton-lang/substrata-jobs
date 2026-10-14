import { randomId } from "../domain/crypto.js";
import { boreRecordLines } from "../domain/boreDetails";
import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useEditorState, useEditorFlush } from "./DraftEditor";
import { validationErrors } from "../domain/dailyLog";
import { acknowledgementOutcomes, acknowledgementLabel, contentHash, workContent } from "../domain/submission";
import { displayTime } from "../domain/time";
import { getOutput, retryPdf, sendClientEmail } from "../foundation/api";
import { cancelUnsentSubmission, putWorkflowRecord, getWorkflowRecords, deleteWorkflowRecord } from "../foundation/offlineStore";

export function AcknowledgementForm({ log, busy, save, reportError }) {
  const [outcome, setOutcome] = useEditorState("outcome", log.clientAcknowledgement.status === "not_signed" ? log.clientAcknowledgement.reasonCode : log.clientAcknowledgement.status);
  const [name, setName] = useEditorState("signerName", ""), [role, setRole] = useEditorState("companyRole", "");
  const [email, setEmail] = useEditorState("clientEmail", log.clientAcknowledgement.clientEmail || ""), [note, setNote] = useEditorState("reasonNotes", "");
  const [strokes, setStrokes] = useEditorState("strokes", []);
  const [signatureSnapshot, setSignatureSnapshot] = useEditorState("signatureSnapshot", null), [signatureTime, setSignatureTime] = useEditorState("signatureTime", null);
  const flush = useEditorFlush();
  const canvas = useRef(null), drawing = useRef(null), pointer = useRef(null);
  useEffect(() => {
    drawing.current = strokes;
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 640, 240); context.strokeStyle = "#182b3c"; context.lineWidth = 2.5; context.lineCap = "round"; context.lineJoin = "round";
    for (const stroke of strokes) { context.beginPath(); stroke.forEach(([x, y], i) => i ? context.lineTo(x * 640, y * 240) : context.moveTo(x * 640, y * 240)); context.stroke(); }
  }, [strokes, outcome]);
  function point(event) {
    const rect = canvas.current.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  }
  function move(event) {
    if (pointer.current !== event.pointerId) return;
    if (drawing.current.flat().length >= 20000) return;
    const next = structuredClone(drawing.current); next.at(-1).push(point(event)); drawing.current = next; setStrokes(next);
  }
  async function submit(event) {
    event.preventDefault();
    try {
      await flush();
      let ack, asset = null;
      if (outcome === "signed_on_device") {
        const validStrokes = strokes.filter(stroke => stroke.length >= 2);
        if (!validStrokes.length || !name.trim()) throw new Error("Enter the representative's name and draw a signature.");
        if (!signatureSnapshot) throw new Error("Clear this drawing and capture a new signature against the reviewed work.");
        const id = randomId();
        ack = { status: outcome, signerName: name.trim(), companyRole: role.trim() || null, clientEmail: email.trim() || null, signedAt: signatureTime, signatureUploadId: id, contentHash: await contentHash(workContent(signatureSnapshot)) };
        asset = { id, logId: log.id, userId: log.owner.userId, state: "pending", drawing: { strokes: validStrokes }, snapshot: { ...signatureSnapshot, clientAcknowledgement: ack } };
      } else ack = outcome === "not_required" ? { status: "not_required" } : { status: "not_signed", reasonCode: outcome, reasonNotes: note.trim() || null, clientEmail: email.trim() || null };
      if (outcome === "OTHER" && !note.trim()) throw new Error("Add a note for Other.");
      await save(ack, asset);
    } catch (error) { reportError(error.message); }
  }
  return <form className="form-fields form-section" onSubmit={submit}>
    <p className="helper-text">Client acknowledgement is optional. Review the shift, crew, activities, quantities and comments before signing. It does not constitute supervisor approval or agreement to charges.</p>
    <label>Acknowledgement outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}>{acknowledgementOutcomes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    {outcome === "signed_on_device" && <><label>Representative name<input value={name} required maxLength={200} onChange={e => setName(e.target.value)} /></label><label>Company / role (optional)<input maxLength={200} value={role} onChange={e => setRole(e.target.value)} /></label>
      <canvas ref={canvas} width="640" height="240" className="signature-pad" aria-label="Draw client signature" onPointerDown={event => {
        if (pointer.current !== null || strokes.length >= 300) return;
        if (!strokes.length) { setSignatureSnapshot(structuredClone(log)); setSignatureTime(new Date().toISOString()); }
        event.currentTarget.setPointerCapture(event.pointerId); pointer.current = event.pointerId;
        const next = [...strokes, [point(event)]]; drawing.current = next; setStrokes(next);
      }} onPointerMove={move} onPointerUp={event => { move(event); pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }} />
      <button type="button" className="secondary-button" onClick={() => { pointer.current = null; drawing.current = []; setStrokes([]); setSignatureSnapshot(null); setSignatureTime(null); }}>Clear signature</button>
      <p className="helper-text">Draw with a finger, stylus or mouse. Saved signatures remain on this device until uploaded.</p></>}
    {outcome !== "not_required" && <label>Client email (optional)<input type="email" value={email} maxLength={254} onChange={e => setEmail(e.target.value)} /></label>}
    {["OTHER", "CLIENT_UNAVAILABLE", "CLIENT_DECLINED", "WILL_SIGN_LATER"].includes(outcome) && <label>Acknowledgement note<textarea value={note} required={outcome === "OTHER"} maxLength={2000} onChange={e => setNote(e.target.value)} /></label>}
    <button className="primary-button" disabled={busy}>Save acknowledgement</button>
  </form>;
}

export default function SubmissionReview({ w, edit, acknowledge, continueWork }) {
  const log = w.log, intent = w.intention, errors = validationErrors(log);
  const reportError = w.setError;
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let cancelled = false;
    contentHash(workContent(log)).then(value => { if (!cancelled) setStale(log.clientAcknowledgement.status === "signed_on_device" && value !== log.clientAcknowledgement.contentHash); }).catch(error => reportError(error.message));
    return () => { cancelled = true; };
  }, [log, reportError]);
  const submitted = !["draft", "returned", "reopened"].includes(log.status);
  return <div className="screen"><section className="review-hero"><h2>{log.status === 'approved' ? 'Approved daily log' : submitted ? "Submitted daily log" : "Review daily log"}</h2><p>{log.job?.title || "Ancillary workday"}</p></section><div className="form-section">
    {log.status === 'returned' && <div className="form-card" role="status"><h3>Returned for correction</h3><p>{log.officeReview?.comment || 'Review the returned record and correct it before resubmitting.'}</p><small>{log.officeReview?.reviewerName} · submitted revision {log.officeReview?.documentRevision || log.currentDocumentRevision}</small></div>}
    {log.status === 'approved' && <div className="info-strip"><Check size={18} />Approved revision {log.currentDocumentRevision} · {log.officeReview?.reviewerName}{log.officeReview?.selfReview && ' · self-review recorded'}</div>}
    <p>{displayTime(log.shift.startedAt)} → {displayTime(log.shift.endedAt)}</p>
    {submitted ? <div className="info-strip"><Check size={18} />{log.status === 'approved' ? 'Approved' : 'Submitted'} · document revision {log.currentDocumentRevision}</div> : errors.length ? <ul className="validation-list">{errors.map((error, i) => <li key={i}>{error.message} {!w.locked && <button className="text-button" onClick={() => edit(error.field)}>Review {error.field}</button>}</li>)}</ul> : <div className="info-strip"><Check size={18} />Field entry is complete and ready for submission.</div>}
    <details className="form-card"><summary>Review recorded work</summary><p>{log.job?.siteName} {log.equipment?.equipmentCode}</p>{log.crew.map(p => <p key={p.id}>{p.displayNameSnapshot}: {displayTime(p.attendedFrom)} → {displayTime(p.attendedTo)}</p>)}{log.points.map(p => <p key={p.id}>{p.pointId}: {p.startDepthM ?? "—"} → {p.endDepthM ?? "—"} m · {p.endStatus}</p>)}{log.points.flatMap(point => boreRecordLines(point).map((line, i) => <p key={`${point.id}:${i}`}>{point.pointId} · {line}</p>))}{log.activities.map(a => <p key={a.id}>{displayTime(a.startedAt)} → {displayTime(a.endedAt)} · {a.activityLabelSnapshot}<br />{a.notes}</p>)}{log.items.map(i => <p key={i.id}>{i.itemLabelSnapshot}: {i.quantity} {i.unit} · {i.notes}</p>)}<p>{log.notes}</p></details>
    {log.logType === "rig_shift" && <div className="form-card"><h3>Client acknowledgement</h3><p>{stale ? "Earlier signature does not cover this changed content. It will be retained with the earlier work; this submission will be unsigned." : acknowledgementLabel(log.clientAcknowledgement)}</p>{log.clientAcknowledgement.signerName && <p>{log.clientAcknowledgement.signerName} · {log.clientAcknowledgement.companyRole}</p>}{!w.locked && <button className="secondary-button" onClick={acknowledge}>Record client acknowledgement</button>}</div>}
    {intent && <div className="form-card" role="status"><h3>Submission {intent.state === "pending" || intent.state === "sending" ? "pending" : intent.state}</h3><p>{intent.message || "The exact content is saved on this device. Server submission and PDF creation await synchronization."}</p>{intent.validationErrors?.map((error, i) => <p key={i}>{error.message}</p>)}{w.signatures.filter(s => s.logId === log.id && s.state === "failed").map(s => <p key={s.id}>Signature upload: {s.message}</p>)}
      <button className="primary-button" disabled={!w.online || w.syncing} onClick={w.sync}>Retry synchronization</button>
      {(!intent.sent || intent.confirmedRejected) && <button className="secondary-button" disabled={w.syncing} onClick={async () => { try { await cancelUnsentSubmission(log.id); await w.refresh(); } catch (error) { w.setError(error.message); } }}>Return to editing</button>}
    </div>}
    {!w.locked && <><button className="secondary-button" onClick={() => edit("activities")}>Edit daily log</button><p className="helper-text">Submit saves an immutable revision. It does not send email. Offline submission remains pending until the server confirms it.</p><button className="primary-button" disabled={w.busy || errors.length > 0} onClick={w.submit}>Submit daily log</button></>}
    {submitted && log.logType === "rig_shift" && <ClientOutput key={`${log.id}:${log.currentDocumentRevision}`} log={log} w={w} />}
    <button className="secondary-button" disabled={w.syncing || !w.online} onClick={w.sync}>Sync record</button><button className="secondary-button" onClick={continueWork}>Continue previous work</button>
  </div></div>;
}

function ClientOutput({ log, w }) {
  const reportError = w.setError, online = w.online;
  const [output, setOutput] = useState(null), [busy, setBusy] = useState(false), [recipient, setRecipient] = useState("");
  const [revision, setRevision] = useState(log.currentDocumentRevision), [confirm, setConfirm] = useState(false), [pendingSend, setPendingSend] = useState(null);
  const refreshRef = useRef(null);
  const refresh = async () => {
    const data = await getOutput(log.id); setOutput(data);
    const requests = await getWorkflowRecords("deliveries", log.owner.userId);
    const pending = requests.find(d => d.logId === log.id);
    if (pending && data.deliveries.some(d => d.request_id === pending.requestId)) { await deleteWorkflowRecord("deliveries", pending.requestId); setPendingSend(null); }
    else setPendingSend(pending || null);
    return data;
  };
  refreshRef.current = refresh;
  useEffect(() => {
    if (!online) return;
    refreshRef.current().catch(error => reportError(error.message));
    const timer = window.setInterval(() => refreshRef.current().catch(error => reportError(error.message)), 15000);
    return () => clearInterval(timer);
  }, [log.id, online, reportError]);
  useEffect(() => {
    if (recipient || !output) return;
    const selected = output.contacts.options.find(c => c.id === output.contacts.selectedContactId);
    if (selected?.email) setRecipient(selected.email);
    else if (log.clientAcknowledgement.clientEmail) setRecipient(log.clientAcknowledgement.clientEmail);
  }, [output, log.clientAcknowledgement.clientEmail, recipient]);
  const deliveries = output?.deliveries.filter(d => d.revision === Number(revision)) || [], previous = deliveries[0];
  const uncertain = previous && ["queued", "unknown"].includes(previous.state);
  async function action(callback) { setBusy(true); try { await callback(); w.setError(""); } catch (error) { w.setError(error.message); } finally { setBusy(false); } }
  async function send(existing = null) {
    let request = existing;
    if (!request) {
      request = { requestId: randomId(), logId: log.id, userId: log.owner.userId, revision: Number(revision), recipient: recipient.trim(), resendOf: previous?.request_id || null, confirmPossibleDuplicate: confirm };
      await putWorkflowRecord("deliveries", request); setPendingSend(request);
    }
    const { requestId, recipient: requestRecipient, resendOf, confirmPossibleDuplicate } = request;
    try { await sendClientEmail(log.id, request.revision, { requestId, recipient: requestRecipient, resendOf, confirmPossibleDuplicate }); }
    catch (error) {
      if (["EMAIL_RECIPIENT_INVALID", "EMAIL_RESEND_REQUIRED", "EMAIL_OUTCOME_UNKNOWN", "EMAIL_RESEND_INVALID", "EMAIL_REQUEST_ID_REUSED"].includes(error.code)) {
        await deleteWorkflowRecord("deliveries", requestId); setPendingSend(null); await refresh();
      }
      throw error;
    }
    await refresh();
  }
  const document = output?.revisions.find(r => r.revision === Number(revision)), url = `/api/v1/daily-logs/${log.id}/revisions/${revision}/pdf`;
  return <div className="form-card form-fields"><h3>Draft PDF and client email</h3><p className="helper-text">{log.status === 'approved' ? 'Approval is recorded. The attached document is the retained submitted draft PDF.' : 'DRAFT - Awaiting Supervisor Approval.'} Email is sent only when you select Send.</p>
    {!w.online && <p>Reconnect to preview PDFs or send email.</p>}
    {!output && w.online && <p>Loading document status…</p>}
    {output && <><label>Document revision<select value={revision} onChange={e => { setRevision(Number(e.target.value)); setConfirm(false); }}>{output.revisions.map(r => <option key={r.revision} value={r.revision}>Revision {r.revision} · {r.state || "No client PDF"}</option>)}</select></label>
      <p>PDF: {document?.state || "pending"}{document?.error_code ? ` · ${document.error_code}` : ""}</p>
      {document?.state === "ready" ? <div className="pdf-actions"><a className="secondary-button" href={url} target="_blank" rel="noreferrer">Preview draft PDF</a><a className="secondary-button" href={`${url}?download=1`}>Download draft PDF</a></div> : <button className="secondary-button" disabled={busy || !w.online} onClick={() => action(async () => { await retryPdf(log.id, Number(revision)); await refresh(); })}>Retry PDF generation</button>}
      <p className="helper-text">{output.email.configured ? output.email.localCapture ? "Local test capture only. No external delivery." : `From ${output.email.from}` : "Email is unconfigured. A Send request will be recorded as failed until mailbox access is configured."}</p>
      <label>Client contact<select value={output.contacts.options.find(c => c.email === recipient)?.id || ""} onChange={e => setRecipient(output.contacts.options.find(c => c.id === e.target.value)?.email || "")}><option value="">Choose contact or enter recipient</option>{output.contacts.options.map(c => <option key={c.id} value={c.id}>{c.full_name} · {c.email}</option>)}</select></label>
      {output.contacts.state !== "selected_in_ops" && <p className="helper-text">The job's supervisor-selected contact is unavailable ({output.contacts.state.replaceAll("_", " ")}). Choose a contact or enter the recipient explicitly.</p>}
      <label>Recipient email<input type="email" value={recipient} maxLength={254} onChange={e => setRecipient(e.target.value)} /></label>
      {uncertain && <label className="duplicate-confirm"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />The earlier email may have been sent. I intend to send another copy.</label>}
      {pendingSend ? <><p>A previous Send response was interrupted. Check history before creating another request.</p><button className="primary-button" disabled={busy || !w.online} onClick={() => action(() => send(pendingSend))}>Check existing Send request</button></> : <button className="primary-button" disabled={busy || !w.online || !recipient.trim() || document?.state !== "ready" || (uncertain && !confirm)} onClick={() => action(() => send())}>{previous ? previous.state === "failed" ? "Retry failed email" : "Send another copy" : "Send draft PDF"}</button>}
      <button className="secondary-button" disabled={busy || !w.online} onClick={() => action(refresh)}><RefreshCw size={16} />Refresh delivery history</button>
      <h3>Delivery history</h3>{output.deliveries.length ? output.deliveries.map(d => <div className="delivery-entry" key={d.request_id}><strong>{d.recipient} · revision {d.revision}</strong><p>{d.state === "sent" ? d.provider === "local_smtp" ? "Accepted by local test capture" : "Accepted by email provider; receipt unconfirmed" : d.state === "unknown" ? "Outcome unknown; may have been sent" : d.state === "queued" ? "Provider attempt pending; do not send another copy" : "Failed"}{d.error_code ? ` · ${d.error_code}` : ""}</p><small>{new Date(d.requested_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} · Sender {d.sender_name || d.actor_user_id}</small>{d.provider_message_id && <small>Provider ID: {d.provider_message_id}</small>}</div>) : <p>No email requests. Submission did not send email.</p>}
    </>}
  </div>;
}
