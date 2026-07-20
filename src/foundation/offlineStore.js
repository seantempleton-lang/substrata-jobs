const DB_NAME = "substrata-jobs";
const DB_VERSION = 1;
const STORE = "foundation";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function cacheFoundation(payload) {
  return transact("readwrite", (store) => store.put(payload, "latest"));
}

export function getCachedFoundation() {
  return transact("readonly", (store) => store.get("latest"));
}

export function clearFoundationCache() {
  return transact("readwrite", (store) => store.delete("latest"));
}
