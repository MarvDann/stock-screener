/**
 * Minimal IndexedDB key-value store for data worth keeping across reloads
 * (chart cards, the last breakout scan). Every call quietly does nothing when
 * IndexedDB is unavailable or fails — private browsing, a full quota, tests —
 * so callers can treat it as a best-effort cache.
 */
const DB_NAME = "stock-screener-cache";
/** Bump when the shape of anything cached changes; upgrading drops all old entries. */
const SCHEMA_VERSION = 1;
const STORE = "entries";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
        db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = op(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export function cacheGet<T>(key: string): Promise<T | undefined> {
  return run<T>("readonly", (store) => store.get(key));
}

/** Every value whose key starts with `prefix`, e.g. all "card:" entries. */
export async function cacheGetByPrefix<T>(prefix: string): Promise<T[]> {
  // The range is built inside `run` so a missing IndexedDB never reaches IDBKeyRange.
  return (await run<T[]>("readonly", (store) => store.getAll(IDBKeyRange.bound(prefix, `${prefix}￿`)))) ?? [];
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  await run("readwrite", (store) => store.put(value, key));
}

export async function cacheClear(): Promise<void> {
  await run("readwrite", (store) => store.clear());
}

/** Test hook: forget the open connection so the next call reopens (e.g. against a fresh fake IndexedDB). */
export function resetPersistentCacheConnection(): void {
  void dbPromise?.then((db) => db?.close());
  dbPromise = null;
}
