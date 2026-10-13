import { sendSyncBatch, getServerLogs } from "./api";
import { getDeviceIdentity } from "./device";
import { applySyncAcknowledgements, claimPendingMutations, markMutations, mergeServerLogs, setSyncMetadata } from "./offlineStore";

let running;
async function synchronize(userId) {
  let count = 0;
  for (let batch = 0; batch < 20; batch++) {
    const mutations = await claimPendingMutations(userId);
    if (!mutations.length) break;
    let response;
    try {
      response = await sendSyncBatch({ batchId: crypto.randomUUID(), deviceId: getDeviceIdentity(), mutations: mutations.map(m => ({
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
  await mergeServerLogs((await getServerLogs()).logs);
  return { count };
}

export function syncPendingDailyLogs(userId) {
  if (!running) {
    const action = () => synchronize(userId);
    running = (navigator.locks ? navigator.locks.request("substrata-jobs-sync", action) : action()).finally(() => { running = null; });
  }
  return running;
}
