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
    payload: log,
    queueStatus: "pending",
    attempts: 0,
  };
  await transact([DAILY_LOG_STORE, MUTATION_STORE], "readwrite", (transaction) => {
    transaction.objectStore(DAILY_LOG_STORE).put(log);
    const mutations = transaction.objectStore(MUTATION_STORE);
    const existingRequest = mutations.index("byEntity").getAll(["daily_log", log.id]);
    existingRequest.onsuccess = () => {
      for (const existing of existingRequest.result) {
        if (["pending", "failed"].includes(existing.queueStatus)) mutations.delete(existing.mutationId);
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

export async function getDailyLogs() {
  const database = await openDatabase();
  try { return await requestResult(database.transaction(DAILY_LOG_STORE, "readonly").objectStore(DAILY_LOG_STORE).getAll()); }
  finally { database.close(); }
}

export async function getPendingMutations(limit = 100) {
  const database = await openDatabase();
  try {
    const all = await requestResult(database.transaction(MUTATION_STORE, "readonly").objectStore(MUTATION_STORE).getAll());
    return all.filter((mutation) => mutation.queueStatus === "pending" || mutation.queueStatus === "failed")
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).slice(0, limit);
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
                  mutations.put({ ...queued, baseRevision: acknowledgement.serverRevision });
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
