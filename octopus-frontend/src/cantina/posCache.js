const DB_NAME = 'octopus-pos';
const STORE_NAME = 'datos';
const DB_VERSION = 1;

let dbPromise;

function abrirDb() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  return dbPromise;
}

export async function leerCachePos(clave) {
  const db = await abrirDb();
  if (!db) return null;
  return new Promise(resolve => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(clave);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

export async function guardarCachePos(clave, valor) {
  const db = await abrirDb();
  if (!db) return;
  await new Promise(resolve => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(
      { valor, actualizadoEn: new Date().toISOString() }, clave,
    );
    request.onsuccess = request.onerror = () => resolve();
  });
}

export const valorCachePos = registro => registro?.valor ?? null;
