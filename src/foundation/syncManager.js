import { sendSyncBatch } from "./api";
import { getDeviceIdentity } from "./device";
import { applySyncAcknowledgements, getPendingMutations, getSyncMetadata, setSyncMetadata } from "./offlineStore";

function contractMutation(mutation) {
  return {
    mutationId: mutation.mutationId,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    operation: mutation.operation,
    baseRevision: mutation.baseRevision,
    occurredAt: mutation.occurredAt,
    payload: mutation.payload,
  };
}

export async function syncPendingDailyLogs() {
  const mutations = await getPendingMutations(100);
  if (!mutations.length) return { status: "idle", acknowledgements: [] };

  const metadata = await getSyncMetadata();
  const response = await sendSyncBatch({
    batchId: crypto.randomUUID(),
    deviceId: getDeviceIdentity(),
    lastSyncCursor: metadata?.syncCursor || null,
    mutations: mutations.map(contractMutation),
  });
  await applySyncAcknowledgements(response.acknowledgements);
  await setSyncMetadata({ syncCursor: response.syncCursor, serverTime: response.serverTime, synchronizedAt: new Date().toISOString() });
  return { status: response.acknowledgements.some((item) => item.status === "conflict" || item.status === "rejected") ? "attention" : "synced", ...response };
}
