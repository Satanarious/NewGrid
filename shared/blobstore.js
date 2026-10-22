// Wallpaper files are stored as Blobs in IndexedDB, not as data URLs in chrome.storage,
// so large videos and GIFs don't count against the storage quota of the metadata store.
const DB_NAME = 'newgrid';
const STORE = 'blobs';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const putBlob = (key, blob) => run('readwrite', (s) => s.put(blob, key));
export const getBlob = (key) => run('readonly', (s) => s.get(key));
export const deleteBlob = (key) => run('readwrite', (s) => s.delete(key));
