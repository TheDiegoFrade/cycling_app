const DB_NAME = 'rodillo';
const DB_VERSION = 1;

export const STORES = {
  profile: 'profile',
  workouts: 'workouts',
  sessions: 'sessions',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.profile)) db.createObjectStore(STORES.profile);
      if (!db.objectStoreNames.contains(STORES.workouts)) db.createObjectStore(STORES.workouts, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.sessions)) db.createObjectStore(STORES.sessions, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return tx<T>(storeName, 'readonly', (store) => store.get(key));
}

export function dbGetAll<T>(storeName: string): Promise<T[]> {
  return tx<T[]>(storeName, 'readonly', (store) => store.getAll());
}

export function dbPut<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
  return tx<IDBValidKey>(storeName, 'readwrite', (store) => (key === undefined ? store.put(value) : store.put(value, key)));
}

export function dbDelete(storeName: string, key: IDBValidKey): Promise<undefined> {
  return tx<undefined>(storeName, 'readwrite', (store) => store.delete(key));
}
