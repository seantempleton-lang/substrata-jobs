import { randomId } from "../domain/crypto.js";
import { sendSyncBatch, getServerLogs, getServerLog, uploadSignature, submitLog } from "./api";
import { reviewUpdates } from './reviewUpdates';
import { getDeviceIdentity } from "./device";
import { applySyncAcknowledgements, claimPendingMutations, markMutations, mergeServerLogs, setSyncMetadata, getWorkflowRecords, putWorkflowRecord, getQueueState, getDailyLog, getDailyLogs, completeSubmission, purgeEligibleLogs, claimSubmission } from "./offlineStore";
import { contentHash, submissionContent } from "../domain/submission";

let running;
async function synchronize(userId) {
  let count = 0;
  for (let batch = 0; batch < 20; batch++) {
    const mutations = await claimPendingMutations(userId);
    if (!mutations.length) break;
    let response;
    try {
      response = await sendSyncBatch({ batchId: randomId(), deviceId: getDeviceIdentity(), mutations: mutations.map(m => ({
        mutationId: m.mutationId, entityType: m.entityType, entityId: m.entityId, operation: m.operation,
        baseRevision: m.baseRevision, occurredAt: m.occurredAt, payload: m.payload,
      })) });
    } catch (error) {
      await markMutations(mutations, "failed", error.message);
      throw error;
    }
    await applySyncAcknowledgements(response.acknowledgements);
    await setSyncMetadata({ syncCursor: response.syncCursor, synchronizedAt: new Date().toISOString() });
    count += mutations.length;
  }
  const queue = await getQueueState(userId);
  // Drafts synchronize first because signature storage is linked to the stable
  // server log ID. Each upload is immutable and idempotent across lost responses.
  for (const asset of await getWorkflowRecords("signatures", userId)) {
    if (asset.state === "uploaded" || queue.some(m => m.entityId === asset.logId)) continue;
    try {
      await uploadSignature(asset.logId, { id: asset.id, snapshot: asset.snapshot, drawing: asset.drawing });
      await putWorkflowRecord("signatures", { ...asset, state: "uploaded", message: null });
    } catch (error) {
      await putWorkflowRecord("signatures", { ...asset, state: "failed", message: error.message });
    }
  }
  const signatures = await getWorkflowRecords("signatures", userId);
  for (const intent of await getWorkflowRecords("submissions", userId)) {
    if (intent.state === "completed" || intent.confirmedRejected || queue.some(m => m.entityId === intent.logId)) continue;
    const signatureId = intent.snapshot.clientAcknowledgement.signatureUploadId;
    if (signatureId && !signatures.some(s => s.id === signatureId && s.state === "uploaded")) continue;
    const log = await getDailyLog(intent.logId);
    if (await contentHash(submissionContent(log)) !== intent.contentHash) {
      await putWorkflowRecord("submissions", { ...intent, state: "conflict", confirmedRejected: !intent.sent, message: "Device content changed after Submit. Review the saved submission and server version." }); continue;
    }
    const sending = await claimSubmission(intent, log.serverRevision);
    if (!sending) continue;
    try {
      const response = await submitLog(intent.logId, { requestId: sending.requestId, baseRevision: sending.baseRevision, contentHash: sending.contentHash });
      await completeSubmission(sending, response);
    } catch (error) {
      const rejected = error.status >= 400 && error.status < 500 && ![401, 429].includes(error.status);
      await putWorkflowRecord("submissions", { ...sending, state: error.status === 409 ? "conflict" : "failed", confirmedRejected: rejected,
        validationErrors: error.validationErrors, message: error.message });
    }
  }
  const serverLogs = (await getServerLogs()).logs;
  await mergeServerLogs(await reviewUpdates(serverLogs, await getDailyLogs(userId), getServerLog));
  await purgeEligibleLogs(userId);
  return { count };
}

export function syncPendingDailyLogs(userId) {
  if (!running) {
    const action = () => synchronize(userId);
    running = (navigator.locks ? navigator.locks.request("substrata-jobs-sync", action) : action()).finally(() => { running = null; });
  }
  return running;
}
