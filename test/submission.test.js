import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createDailyLog, endShift, validationErrors } from "../src/domain/dailyLog.js";
import { contentHash, workContent, submissionContent, retentionEligible, acknowledgementErrors } from "../src/domain/submission.js";
import { saveDailyLog, queueSubmission, getWorkflowRecords, claimPendingMutations, applySyncAcknowledgements, getDailyLog, claimSubmission, cancelUnsentSubmission, mergeServerLogs, completeSubmission, purgeEligibleLogs, putWorkflowRecord } from "../src/foundation/offlineStore.js";
import { clientSections, renderDraftPdf, DRAFT_MARK } from "../server/output.mjs";
import { validateDrawing, signatureKey } from "../server/submissions.mjs";
import { deliverEmail } from "../server/email.mjs";

const owner = { userId: "31eb28f2-0bf1-4cee-813c-075f0436b5e7", employeeCode: "ST001", displayName: "Local driller" };
const ancillary = () => endShift(createDailyLog({ owner, ancillary: true, startedAt: "2026-10-13T18:00:00.000Z", initialActivity: { code: "ANC_WORKSHOP", label: "Workshop" } }), {}, "2026-10-14T02:00:00.000Z");

test("submission freezes exact local content, survives lost acknowledgement and cannot be replaced by a pull", async () => {
  const log = ancillary(); await saveDailyLog(log);
  const intent = await queueSubmission(log.id, owner.userId);
  await assert.rejects(() => saveDailyLog({ ...log, notes: "late edit" }), /pending/);
  await mergeServerLogs([{ ...log, serverRevision: 3, notes: "different server content" }]);
  assert.equal((await getDailyLog(log.id)).notes, null);
  const mutation = (await claimPendingMutations(owner.userId)).find(m => m.entityId === log.id);
  await applySyncAcknowledgements([{ mutationId: mutation.mutationId, status: "applied", serverRevision: 1 }]);
  const sending = await claimSubmission(intent, 1);
  assert.equal((await claimSubmission(intent, 99)).baseRevision, 1);
  assert.equal((await getWorkflowRecords("submissions")).find(i => i.logId === log.id).contentHash, await contentHash(submissionContent(log)));
  await assert.rejects(() => cancelUnsentSubmission(log.id));
  await completeSubmission(sending, { log: { ...log, status: "submitted", serverRevision: 2, currentDocumentRevision: 1 }, document: null });
  await assert.rejects(async () => saveDailyLog(await getDailyLog(log.id)), /cannot be edited/);
});

test("cancelled unsent intention cannot be resurrected by a delayed synchronizer", async () => {
  const log = ancillary(); await saveDailyLog(log);
  const intent = await queueSubmission(log.id, owner.userId);
  await cancelUnsentSubmission(log.id);
  assert.equal(await claimSubmission(intent, 1), null);
  await putWorkflowRecord("submissions", { ...intent, state: "failed" });
  assert.ok(!(await getWorkflowRecords("submissions")).some(i => i.logId === log.id));
});

test("device retention timestamps stay local and never enter immutable sync payloads", async () => {
  const log = { ...ancillary(), locallySynchronizedAt: "2026-10-14T03:00:00Z" };
  const mutation = await saveDailyLog(log);
  assert.equal(mutation.payload.locallySynchronizedAt, undefined);
  assert.equal((await getDailyLog(log.id)).locallySynchronizedAt, log.locallySynchronizedAt);
});

test("all absence outcomes permit submission while Other needs a note and ancillary rejects signatures", () => {
  const log = ancillary(); log.logType = "rig_shift"; log.job = {}; log.equipment = {};
  for (const code of ["CLIENT_UNAVAILABLE", "CLIENT_DECLINED", "WILL_SIGN_LATER", "OTHER"]) {
    log.clientAcknowledgement = { status: "not_signed", reasonCode: code, reasonNotes: "Local explanation" };
    assert.deepEqual(validationErrors(log), []);
  }
  log.clientAcknowledgement.reasonNotes = ""; assert.equal(acknowledgementErrors(log).length, 1);
  const a = ancillary(); a.clientAcknowledgement = { status: "signed_on_device" }; assert.ok(acknowledgementErrors(a).length);
});

test("content hash ignores synchronization but changes with recorded work and signature drawing rejects unsafe input", async () => {
  const log = ancillary(); const first = await contentHash(workContent(log));
  assert.equal(first, await contentHash(workContent({ ...log, serverRevision: 9, status: "submitted", updatedAt: new Date().toISOString() })));
  assert.notEqual(first, await contentHash(workContent({ ...log, notes: "changed" })));
  assert.throws(() => validateDrawing({ strokes: [[[0, 0], [NaN, 2]]] }));
  assert.throws(() => validateDrawing({ strokes: [Array(20001).fill([0, 0])] }));
  assert.deepEqual(validateDrawing({ strokes: [[[0, 0], [1, 1]]] }).strokes.length, 1);
  const old = process.env.SIGNATURE_ENCRYPTION_KEY; delete process.env.SIGNATURE_ENCRYPTION_KEY;
  assert.throws(signatureKey, /not configured/);
  if (old) process.env.SIGNATURE_ENCRYPTION_KEY = old;
});

test("14-day retention purges only approved synchronized records and keeps protected work and tombstones", async () => {
  const now = Date.parse("2026-10-14T12:00:00Z"), stamp = new Date(now - 14 * 86400000).toISOString();
  const approved = { ...ancillary(), status: "approved", serverRevision: 2, approvedAt: stamp, locallySynchronizedAt: stamp };
  assert.equal(retentionEligible(approved, { now: now - 1 }), false);
  assert.equal(retentionEligible(approved, { now }), true);
  for (const state of ["submitted", "returned", "awaiting_driller_confirmation", "draft"]) assert.equal(retentionEligible({ ...approved, status: state }, { now }), false);
  for (const context of [{ mutations: [{ entityId: approved.id, queueStatus: "failed" }] }, { signatures: [{ logId: approved.id, state: "failed" }] }, { intentions: [{ logId: approved.id, state: "pending" }] }, { deliveries: [{ logId: approved.id }] }]) assert.equal(retentionEligible(approved, { now, ...context }), false);
  await mergeServerLogs([approved]);
  // The first pull timestamps actual synchronization today: it must not purge.
  assert.equal((await purgeEligibleLogs(owner.userId, now)).includes(approved.id), false);
  // Advance relative to the actual successful pull, without changing any server data.
  const local = await getDailyLog(approved.id), after = Date.parse(local.locallySynchronizedAt) + 14 * 86400000;
  assert.ok((await purgeEligibleLogs(owner.userId, after)).includes(approved.id));
  assert.equal(await getDailyLog(approved.id), undefined);
  await mergeServerLogs([approved]); assert.equal(await getDailyLog(approved.id), undefined);
  await mergeServerLogs([{ ...approved, status: "returned", serverRevision: 3 }]); assert.equal((await getDailyLog(approved.id)).status, "returned");
});

test("client PDF projection omits internal fields and produces multipage Water, Geotech and signed PDFs", async () => {
  await fs.mkdir("output/pdf", { recursive: true });
  for (const division of ["geotech", "water"]) {
    const log = JSON.parse(await fs.readFile(`contracts/v1/examples/daily-log-${division}.json`));
    log.internalSupervisorNotes = "SECRET_SUPERVISOR"; log.audit = "SECRET_AUDIT";
    log.activities[0].allocation.ancillaryCode = "SECRET_PAYROLL";
    log.activities[0].notes = Array(35).fill("Long description: drilling progress, site coordination, groundwater observations and the next work stage.").join("\n");
    log.clientAcknowledgement = { status: "not_signed", reasonCode: "WILL_SIGN_LATER", reasonNotes: "Representative will review later." };
    const projection = JSON.stringify(clientSections(log));
    assert.ok(!projection.includes("SECRET_"));
    const content = await renderDraftPdf(log, 1);
    assert.equal(content.subarray(0, 5).toString(), "%PDF-");
    assert.ok(content.length > 3000); assert.ok(DRAFT_MARK.includes("Awaiting Supervisor"));
    await fs.writeFile(`output/pdf/step5-${division}-draft.pdf`, content);
    if (division === "geotech") {
      log.clientAcknowledgement = { status: "signed_on_device", signerName: "Test Representative", companyRole: "Client / Site manager", signedAt: log.shift.endedAt };
      await fs.writeFile("output/pdf/step5-signed-draft.pdf", await renderDraftPdf(log, 1, { strokes: [[[0.1, 0.7], [0.3, 0.1], [0.2, 0.8], [0.6, 0.4], [0.9, 0.6]]] }));
    }
  }
});

test("Microsoft Graph records provider acceptance without inventing receipt/message IDs and timeout remains ambiguous", async () => {
  const previous = process.env.EMAIL_PROVIDER; process.env.EMAIL_PROVIDER = "microsoft_graph";
  const log = JSON.parse(await fs.readFile("contracts/v1/examples/daily-log-water.json"));
  const args = { requestId: crypto.randomUUID(), recipient: "client@example.test", from: "substrata-jobs@drilling.co.nz", replyTo: "substrata-jobs@drilling.co.nz", content: Buffer.from("test PDF"), log, revision: 1 };
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return calls.length === 1 ? { ok: true, json: async () => ({ access_token: "test-token" }) } : { status: 202 }; };
  assert.deepEqual(await deliverEmail(args, fetcher), { providerMessageId: null });
  assert.equal(JSON.parse(calls[1].options.body).message.attachments[0].contentBytes, args.content.toString("base64"));
  assert.equal(JSON.parse(calls[1].options.body).saveToSentItems, true);
  let count = 0;
  await assert.rejects(() => deliverEmail(args, async () => { if (!count++) return { ok: true, json: async () => ({ access_token: "test" }) }; throw new Error("response lost"); }), error => !error.definitive);
  if (previous === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = previous;
});
