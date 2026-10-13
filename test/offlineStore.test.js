import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { createDailyLog } from "../src/domain/dailyLog.js";
import { applySyncAcknowledgements, claimPendingMutations, getDailyLog, getQueueState, markMutations, mergeServerLogs, resolveLocalConflict, saveDailyLog } from "../src/foundation/offlineStore.js";
const owner = { userId: "31eb28f2-0bf1-4cee-813c-075f0436b5e7", employeeCode: "ST001", displayName: "Local driller" };
const makeLog = () => createDailyLog({ owner, ancillary: true, startedAt: "2026-10-13T18:00:00.000Z", initialActivity: { code: "ANC_WORKSHOP", label: "Workshop" } });

test("a lost response remains retryable after a newer local edit and rebases only the unsent change", async () => {
  const log = makeLog();
  const first = await saveDailyLog(log);
  const claimed = (await claimPendingMutations(owner.userId)).find(m => m.entityId === log.id);
  assert.equal(claimed.mutationId, first.mutationId);
  await markMutations([claimed], "failed", "Network lost");
  await saveDailyLog({ ...log, notes: "New edit during retry" });
  const retry = (await claimPendingMutations(owner.userId)).find(m => m.entityId === log.id);
  assert.equal(retry.mutationId, first.mutationId);
  assert.deepEqual(retry.payload, log);
  await applySyncAcknowledgements([{ mutationId: first.mutationId, status: "duplicate", serverRevision: 1 }]);
  const latest = (await claimPendingMutations(owner.userId)).find(m => m.entityId === log.id);
  assert.equal(latest.baseRevision, 1);
  assert.equal(latest.payload.notes, "New edit during retry");
  await applySyncAcknowledgements([{ mutationId: latest.mutationId, status: "applied", serverRevision: 2 }]);
  assert.equal((await getDailyLog(log.id)).serverRevision, 2);
  assert.equal((await getQueueState(owner.userId)).filter(m => m.entityId === log.id).length, 0);
});

test("server pulls cannot overwrite queued edits and conflicts remain blocked until deliberate resolution", async () => {
  const log = makeLog();
  const mutation = await saveDailyLog(log);
  const server = { ...log, notes: "Server content", serverRevision: 3 };
  await mergeServerLogs([server]);
  assert.equal((await getDailyLog(log.id)).notes, null);
  await applySyncAcknowledgements([{ mutationId: mutation.mutationId, status: "conflict", serverRevision: 3 }]);
  await saveDailyLog({ ...log, notes: "Device content" });
  assert.ok(!(await claimPendingMutations(owner.userId)).some(m => m.entityId === log.id));
  const resolved = await resolveLocalConflict(await getDailyLog(log.id), server, "local");
  assert.equal(resolved.notes, "Device content");
  const pending = (await claimPendingMutations(owner.userId)).find(m => m.entityId === log.id);
  assert.equal(pending.baseRevision, 3);
});

test("a corrected rejected draft gets a fresh mutation and queues are scoped to the owner", async () => {
  const log = makeLog();
  const mutation = await saveDailyLog(log);
  await applySyncAcknowledgements([{ mutationId: mutation.mutationId, status: "rejected", message: "Invalid item" }]);
  await saveDailyLog({ ...log, notes: "Corrected" });
  const pending = (await claimPendingMutations(owner.userId)).find(m => m.entityId === log.id);
  assert.notEqual(pending.mutationId, mutation.mutationId);
  assert.equal((await claimPendingMutations("another-user")).length, 0);
});
