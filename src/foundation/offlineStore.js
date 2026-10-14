import { randomId } from "../domain/crypto.js";
const DB_NAME = "substrata-jobs";
import { assertSubmittable } from "../domain/dailyLog.js";
import { canonical, contentHash, submissionContent, retentionEligible, serverSnapshot } from "../domain/submission.js";
const DB_VERSION = 3;
const FOUNDATION_STORE = "foundation";
const DAILY_LOG_STORE = "dailyLogs";
const MUTATION_STORE = "mutations";
const META_STORE = "metadata";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FOUNDATION_STORE)) database.createObjectStore(FOUNDATION_STORE);
      if (!database.objectStoreNames.contains(DAILY_LOG_STORE)) database.createObjectStore(DAILY_LOG_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(MUTATION_STORE)) {
        const mutations = database.createObjectStore(MUTATION_STORE, { keyPath: "mutationId" });
        mutations.createIndex("byStatusAndOccurredAt", ["queueStatus", "occurredAt"]);
        mutations.createIndex("byEntity", ["entityType", "entityId"]);
      }
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
      for (const [name, keyPath] of [["signatures", "id"], ["submissions", "logId"], ["deliveries", "requestId"]]) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(storeNames, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    let result;
    try {
      result = action(transaction);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("IndexedDB transaction aborted.")); };
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function cacheFoundation(payload) {
  return transact([FOUNDATION_STORE], "readwrite", (transaction) => transaction.objectStore(FOUNDATION_STORE).put(payload, "latest"));
}

export function getCachedFoundation() {
  return openDatabase().then(async (database) => {
    try { return await requestResult(database.transaction(FOUNDATION_STORE, "readonly").objectStore(FOUNDATION_STORE).get("latest")); }
    finally { database.close(); }
  });
}

export function clearFoundationCache() {
  return transact([FOUNDATION_STORE], "readwrite", (transaction) => transaction.objectStore(FOUNDATION_STORE).delete("latest"));
}

export async function saveDailyLog(log, baseRevision = log.serverRevision || 0, signature = null) {
  if (!["draft", "returned", "reopened"].includes(log.status)) throw new Error("Submitted records cannot be edited.");
  if ((await getWorkflowRecords("submissions")).some(i => i.logId === log.id && i.state !== "completed")) throw new Error("Submission is pending. Resolve it before editing this record.");
  const occurredAt = new Date().toISOString();
  const mutation = {
    mutationId: randomId(),
    entityType: "daily_log",
    entityId: log.id,
    operation: "upsert",
    baseRevision,
    occurredAt,
    payload: serverSnapshot(log),
    queueStatus: "pending",
    attempts: 0,
  };
  await transact([DAILY_LOG_STORE, MUTATION_STORE, "signatures", "submissions"], "readwrite", (transaction) => {
    const intent = transaction.objectStore("submissions").get(log.id);
    intent.onsuccess = () => { if (intent.result && intent.result.state !== "completed") transaction.abort(); };
    if (signature) transaction.objectStore("signatures").put(signature);
    const logs = transaction.objectStore(DAILY_LOG_STORE);
    const storedRequest = logs.get(log.id);
    storedRequest.onsuccess = () => {
      if (storedRequest.result && !["draft", "returned", "reopened"].includes(storedRequest.result.status)) { transaction.abort(); return; }
      mutation.baseRevision = storedRequest.result?.serverRevision ?? baseRevision;
      logs.put({ ...log, serverRevision: mutation.baseRevision });
    };
    const mutations = transaction.objectStore(MUTATION_STORE);
    const existingRequest = mutations.index("byEntity").getAll(["daily_log", log.id]);
    existingRequest.onsuccess = () => {
      mutation.queueIndex = Math.max(0, ...existingRequest.result.map(m => m.queueIndex || 0)) + 1;
      for (const existing of existingRequest.result) {
        if (existing.queueStatus === "conflict") mutation.queueStatus = "conflict";
        if (existing.queueStatus === "rejected") mutations.delete(existing.mutationId);
        if (!existing.sent && ["pending", "failed"].includes(existing.queueStatus)) mutations.delete(existing.mutationId);
      }
      mutations.put(mutation);
    };
  });
  return mutation;
}

export async function getDailyLog(id) {
  const database = await openDatabase();
  try { return await requestResult(database.transaction(DAILY_LOG_STORE, "readonly").objectStore(DAILY_LOG_STORE).get(id)); }
  finally { database.close(); }
}

export async function getDailyLogs(userId) {
  const database = await openDatabase();
  try {
    const logs = await requestResult(database.transaction(DAILY_LOG_STORE, "readonly").objectStore(DAILY_LOG_STORE).getAll());
    return logs.filter(log => !userId || log.owner.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  finally { database.close(); }
}

export async function getPendingMutations(userId, limit = 100) {
  const database = await openDatabase();
  try {
    const all = await requestResult(database.transaction(MUTATION_STORE, "readonly").objectStore(MUTATION_STORE).getAll());
    const blocked = new Set(all.filter(m => ["conflict", "rejected"].includes(m.queueStatus)).map(m => m.entityId));
    const seen = new Set();
    return all.filter(m => m.payload.owner.userId === userId && !blocked.has(m.entityId) && ["pending", "failed", "sending"].includes(m.queueStatus))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).filter(m => {
        if (seen.has(m.entityId)) return false;
        seen.add(m.entityId); return true;
      }).slice(0, limit);
  } finally { database.close(); }
}

export async function applySyncAcknowledgements(acknowledgements) {
  return transact([MUTATION_STORE, DAILY_LOG_STORE], "readwrite", (transaction) => {
    const mutations = transaction.objectStore(MUTATION_STORE);
    const logs = transaction.objectStore(DAILY_LOG_STORE);
    for (const acknowledgement of acknowledgements) {
      const request = mutations.get(acknowledgement.mutationId);
      request.onsuccess = () => {
        const mutation = request.result;
        if (!mutation) return;
        if (acknowledgement.status === "applied" || acknowledgement.status === "duplicate") {
          mutations.delete(mutation.mutationId);
          if (acknowledgement.serverRevision != null) {
            const logRequest = logs.get(mutation.entityId);
            logRequest.onsuccess = () => {
              if (!logRequest.result) return;
              logs.put({ ...logRequest.result, serverRevision: acknowledgement.serverRevision, locallySynchronizedAt: new Date().toISOString() });
            };
            const queuedRequest = mutations.index("byEntity").getAll([mutation.entityType, mutation.entityId]);
            queuedRequest.onsuccess = () => {
              for (const queued of queuedRequest.result) {
                if (queued.queueStatus === "pending" && queued.mutationId !== mutation.mutationId) {
                  if (!queued.sent) mutations.put({ ...queued, baseRevision: acknowledgement.serverRevision });
                }
              }
            };
          }
        } else {
          mutations.put({
            ...mutation,
            queueStatus: acknowledgement.status,
            errorCode: acknowledgement.errorCode || null,
            message: acknowledgement.message || null,
            attempts: mutation.attempts + 1,
          });
        }
      };
    }
  });
}

export async function setSyncMetadata(metadata) {
  return transact([META_STORE], "readwrite", (transaction) => transaction.objectStore(META_STORE).put(metadata, "sync"));
}

export async function getSyncMetadata() {
  const database = await openDatabase();
  try { return await requestResult(database.transaction(META_STORE, "readonly").objectStore(META_STORE).get("sync")); }
  finally { database.close(); }
}

export async function markMutations(mutations, status, message = null) {
  return transact([MUTATION_STORE], "readwrite", transaction => {
    const store = transaction.objectStore(MUTATION_STORE);
    for (const mutation of mutations) {
      const request = store.get(mutation.mutationId);
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, sent: true, queueStatus: status, message });
      };
    }
  });
}

export async function claimPendingMutations(userId, limit = 100) {
  const claimed = [];
  await transact([MUTATION_STORE], "readwrite", transaction => {
    const store = transaction.objectStore(MUTATION_STORE), request = store.getAll();
    request.onsuccess = () => {
      const blocked = new Set(request.result.filter(m => ["conflict", "rejected"].includes(m.queueStatus)).map(m => m.entityId));
      const seen = new Set();
      for (const mutation of request.result.sort((a, b) => (a.queueIndex || 0) - (b.queueIndex || 0) || a.occurredAt.localeCompare(b.occurredAt))) {
        if (claimed.length >= limit || seen.has(mutation.entityId) || blocked.has(mutation.entityId) || mutation.payload.owner.userId !== userId) continue;
        if (!["pending", "failed", "sending"].includes(mutation.queueStatus)) continue;
        seen.add(mutation.entityId);
        const sending = { ...mutation, sent: true, queueStatus: "sending" };
        store.put(sending); claimed.push(sending);
      }
    };
  });
  return claimed;
}

export async function getQueueState(userId) {
  const database = await openDatabase();
  try {
    return (await requestResult(database.transaction(MUTATION_STORE, "readonly").objectStore(MUTATION_STORE).getAll()))
      .filter(m => m.payload.owner.userId === userId);
  } finally { database.close(); }
}

export async function mergeServerLogs(logs) {
  return transact([DAILY_LOG_STORE, MUTATION_STORE, "submissions", META_STORE], "readwrite", transaction => {
    const store = transaction.objectStore(DAILY_LOG_STORE);
    for (const log of logs) {
      const pending = transaction.objectStore(MUTATION_STORE).index("byEntity").getAll(["daily_log", log.id]);
      pending.onsuccess = () => {
        const intent = transaction.objectStore("submissions").get(log.id);
        intent.onsuccess = () => {
          if (!pending.result.length && (!intent.result || intent.result.state === "completed")) {
            const tombstone = transaction.objectStore(META_STORE).get(`purged:${log.id}`);
            tombstone.onsuccess = () => {
              if (log.status === "approved" && tombstone.result?.serverRevision === log.serverRevision) return;
              const old = store.get(log.id);
              old.onsuccess = () => store.put({ ...log, locallySynchronizedAt: old.result?.serverRevision === log.serverRevision ? old.result.locallySynchronizedAt || new Date().toISOString() : new Date().toISOString() });
            };
          }
        };
      };
    }
  });
}

export function setActiveLog(userId, id) {
  return transact([META_STORE], "readwrite", transaction => transaction.objectStore(META_STORE).put(id, `active:${userId}`));
}

export async function getActiveLog(userId) {
  const database = await openDatabase();
  try { return await requestResult(database.transaction(META_STORE, "readonly").objectStore(META_STORE).get(`active:${userId}`)); }
  finally { database.close(); }
}

export function putEditor(key, fields) {
  return transact([META_STORE], "readwrite", transaction => transaction.objectStore(META_STORE).put(fields, `editor:${key}`));
}
export async function getEditor(key) {
  const database = await openDatabase();
  try { return await requestResult(database.transaction(META_STORE, "readonly").objectStore(META_STORE).get(`editor:${key}`)); }
  finally { database.close(); }
}
export function clearEditor(key) {
  return transact([META_STORE], "readwrite", transaction => transaction.objectStore(META_STORE).delete(`editor:${key}`));
}

export async function resolveLocalConflict(log, serverLog, choice) {
  const resolved = choice === "server" ? serverLog : { ...log, serverRevision: serverLog.serverRevision };
  const intent = (await getWorkflowRecords("submissions")).find(i => i.logId === log.id);
  if (intent?.sent && !intent.confirmedRejected && intent.state !== "completed") throw new Error("The submission outcome is uncertain. Reconnect and retry the existing request first.");
  await transact([META_STORE, DAILY_LOG_STORE, MUTATION_STORE, "submissions"], "readwrite", transaction => {
    if (intent) {
      transaction.objectStore(META_STORE).put(intent, `submission-history:${intent.requestId}`);
      transaction.objectStore("submissions").delete(log.id);
    }
    transaction.objectStore(META_STORE).put({ local: log, server: serverLog, choice, resolvedAt: new Date().toISOString() }, `conflict:${log.id}:${randomId()}`);
    transaction.objectStore(DAILY_LOG_STORE).put(resolved);
    const store = transaction.objectStore(MUTATION_STORE);
    const request = store.index("byEntity").getAll(["daily_log", log.id]);
    request.onsuccess = () => { for (const mutation of request.result) store.delete(mutation.mutationId); };
  });
  if (choice === "local") await saveDailyLog(resolved, serverLog.serverRevision);
  return resolved;
}

export async function getWorkflowRecords(storeName, userId) {
  const database = await openDatabase();
  try {
    const records = await requestResult(database.transaction(storeName).objectStore(storeName).getAll());
    return userId ? records.filter(row => row.userId === userId) : records;
  } finally { database.close(); }
}

export function putWorkflowRecord(storeName, record) {
  if (storeName === "submissions") return transact([storeName], "readwrite", tx => {
    const store = tx.objectStore(storeName), request = store.get(record.logId);
    request.onsuccess = () => { if (request.result?.requestId === record.requestId && request.result.state !== "completed") store.put(record); };
  });
  return transact([storeName], "readwrite", tx => tx.objectStore(storeName).put(record));
}
export function deleteWorkflowRecord(storeName, key) {
  return transact([storeName], "readwrite", tx => tx.objectStore(storeName).delete(key));
}

export async function queueSubmission(logId, userId) {
  const log = await getDailyLog(logId);
  if (!log || log.owner.userId !== userId || !["draft", "returned", "reopened"].includes(log.status)) throw new Error("Only your editable record can be submitted.");
  assertSubmittable(log);
  const intent = { logId, userId, requestId: randomId(), snapshot: log, contentHash: await contentHash(submissionContent(log)), state: "pending", createdAt: new Date().toISOString() };
  await transact([DAILY_LOG_STORE, "submissions"], "readwrite", tx => {
    const saved = tx.objectStore(DAILY_LOG_STORE).get(logId);
    saved.onsuccess = () => {
      if (canonical(submissionContent(saved.result)) !== canonical(submissionContent(log))) { tx.abort(); return; }
      const previous = tx.objectStore("submissions").get(logId);
      previous.onsuccess = () => { if (!previous.result || previous.result.state === "completed") tx.objectStore("submissions").put(intent); };
    };
  });
  return intent;
}

export function completeSubmission(intent, response) {
  return transact([DAILY_LOG_STORE, "submissions"], "readwrite", tx => {
    tx.objectStore(DAILY_LOG_STORE).put({ ...response.log, locallySynchronizedAt: new Date().toISOString() });
    tx.objectStore("submissions").put({ ...intent, state: "completed", completedAt: new Date().toISOString(), document: response.document });
  });
}

export async function claimSubmission(intent, baseRevision) {
  let claimed = null;
  await transact(["submissions"], "readwrite", tx => {
    const store = tx.objectStore("submissions"), request = store.get(intent.logId);
    request.onsuccess = () => {
      const current = request.result;
      if (!current || current.requestId !== intent.requestId || current.state === "completed" || current.confirmedRejected) return;
      claimed = current.sent ? current : { ...current, sent: true, baseRevision, state: "sending" };
      store.put(claimed);
    };
  });
  return claimed;
}

export async function cancelUnsentSubmission(logId) {
  return transact(["submissions", META_STORE], "readwrite", tx => {
    const store = tx.objectStore("submissions"), request = store.get(logId);
    request.onsuccess = () => {
      if (request.result?.sent && !request.result.confirmedRejected) { tx.abort(); return; }
      if (request.result) tx.objectStore(META_STORE).put(request.result, `submission-history:${request.result.requestId}`);
      store.delete(logId);
    };
  });
}

export async function purgeEligibleLogs(userId, now = Date.now()) {
  const removed = [];
  await transact([DAILY_LOG_STORE, MUTATION_STORE, META_STORE, "signatures", "submissions", "deliveries"], "readwrite", tx => {
    const values = {}, names = [DAILY_LOG_STORE, MUTATION_STORE, "signatures", "submissions", "deliveries", META_STORE];
    let remaining = names.length;
    for (const name of names) {
      const request = name === META_STORE ? tx.objectStore(name).openCursor() : tx.objectStore(name).getAll();
      if (name === META_STORE) {
        values.metadata = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { values.metadata.push([cursor.key, cursor.value]); cursor.continue(); }
          else { remaining--; finish(); }
        };
      } else request.onsuccess = () => { values[name] = request.result; remaining--; finish(); };
    }
    function finish() {
      if (remaining) return;
      for (const log of values.dailyLogs) {
        if (log.owner.userId !== userId || !retentionEligible(log, { mutations: values.mutations, signatures: values.signatures, intentions: values.submissions, deliveries: values.deliveries, now })) continue;
        tx.objectStore(DAILY_LOG_STORE).delete(log.id); removed.push(log.id);
        tx.objectStore(META_STORE).put({ serverRevision: log.serverRevision, purgedAt: new Date(now).toISOString() }, `purged:${log.id}`);
        for (const asset of values.signatures.filter(s => s.logId === log.id)) tx.objectStore("signatures").delete(asset.id);
        tx.objectStore("submissions").delete(log.id);
        for (const [key, value] of values.metadata) {
          if (typeof key === "string" && !key.startsWith("purged:") && (key.includes(log.id) || (key === `active:${userId}` && value === log.id) || (key === `editor:ui:${userId}` && (value.previous?.id === log.id || value.sheet?.local?.id === log.id)))) tx.objectStore(META_STORE).delete(key);
        }
      }
    }
  });
  return removed;
}
