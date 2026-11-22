// Zugriff auf die Fähigkeiten der Seite (Speicher, Strava, Medien, Download)
// und ein lokaler Zwischenspeicher für schlechte Verbindung.

let capsP = null;

function waitForClaude(ms = 1500) {
  return new Promise((res) => {
    const t0 = Date.now();
    const tick = () => {
      if (window.claude && typeof window.claude.use === 'function') return res(window.claude);
      if (Date.now() - t0 > ms) return res(null);
      setTimeout(tick, 50);
    };
    tick();
  });
}

export function caps() {
  if (capsP) return capsP;
  capsP = (async () => {
    const c = await waitForClaude();
    if (!c) return { none: true };
    const get = (n) => Promise.resolve().then(() => c.use(n)).catch(() => null);
    const [db, mcp, user, assets, downloads, sample] = await Promise.all(['db', 'mcp', 'user', 'assets', 'downloads', 'sample'].map(get));
    return { db, mcp, user, assets, downloads, sample };
  })();
  return capsP;
}

// ---- IndexedDB (nur Komfort, darf fehlen) ----
let idbP = null;
function idb() {
  if (idbP) return idbP;
  idbP = new Promise((res) => {
    try {
      const r = indexedDB.open('spur', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return idbP;
}

export async function kvGet(k) {
  try {
    const db = await idb();
    if (!db) return null;
    return await new Promise((res) => {
      const tx = db.transaction('kv', 'readonly');
      const q = tx.objectStore('kv').get(k);
      q.onsuccess = () => res(q.result ?? null);
      q.onerror = () => res(null);
    });
  } catch (e) { return null; }
}

export async function kvSet(k, v) {
  try {
    const db = await idb();
    if (!db) return false;
    return await new Promise((res) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch (e) { return false; }
}

export async function kvDel(k) {
  try {
    const db = await idb();
    if (!db) return;
    await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; tx.onerror = res; });
  } catch (e) { /* egal */ }
}

export function lsGet(k, d = null) { try { const v = localStorage.getItem('spur:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem('spur:' + k, JSON.stringify(v)); } catch (e) { /* egal */ } }

export const isTransient = (e) => !e || ['unavailable', 'server_unavailable', 'upstream_error', 'resource_exhausted', 'rate_limited'].includes(e.code) || !navigator.onLine;
