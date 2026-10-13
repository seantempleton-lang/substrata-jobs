const DB_NAME = "substrata-jobs";
const DB_VERSION = 2;
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

export async function saveDailyLog(log, baseRevision = log.serverRevision || 0) {
  const occurredAt = new Date().toISOString();
  const mutation = {
    mutationId: crypto.randomUUID(),
    entityType: "daily_log",
    entityId: log.id,
    operation: "upsert",
    baseRevision,
    occurredAt,
    payload: structuredClone(log),
    queueStatus: "pending",
    attempts: 0,
  };
  await transact([DAILY_LOG_STORE, MUTATION_STORE], "readwrite", (transaction) => {
    const logs = transaction.objectStore(DAILY_LOG_STORE);
    const storedRequest = logs.get(log.id);
    storedRequest.onsuccess = () => {
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
              logs.put({ ...logRequest.result, serverRevision: acknowledgement.serverRevision });
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
  return transact([DAILY_LOG_STORE, MUTATION_STORE], "readwrite", transaction => {
    const store = transaction.objectStore(DAILY_LOG_STORE);
    for (const log of logs) {
      const pending = transaction.objectStore(MUTATION_STORE).index("byEntity").getAll(["daily_log", log.id]);
      pending.onsuccess = () => { if (!pending.result.length) store.put(log); };
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
  await transact([META_STORE, DAILY_LOG_STORE, MUTATION_STORE], "readwrite", transaction => {
    transaction.objectStore(META_STORE).put({ local: log, server: serverLog, choice, resolvedAt: new Date().toISOString() }, `conflict:${log.id}:${crypto.randomUUID()}`);
    transaction.objectStore(DAILY_LOG_STORE).put(resolved);
    const store = transaction.objectStore(MUTATION_STORE);
    const request = store.index("byEntity").getAll(["daily_log", log.id]);
    request.onsuccess = () => { for (const mutation of request.result) store.delete(mutation.mutationId); };
  });
  if (choice === "local") await saveDailyLog(resolved, serverLog.serverRevision);
  return resolved;
}
