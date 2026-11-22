// Web-Version: Datenbank-Anbindung im Stil der bisherigen Claude-Datenbank (collection/onSnapshot, doc/get/set/delete).
// Alle Sammlungen kommen in einem Stück von /api/db (privater Speicher), Änderungen werden gebündelt gesendet.
import { kvGet, kvSet } from '../platform.js';

const st = { colls: null, etag: null, loading: null, subs: new Map(), queue: [], timer: null, flushing: null, loadedOnce: false, tries: 0, retryAt: 0 };

export class DbError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

const toLogin = () => { try { if (!/login\.html/.test(location.pathname)) location.replace('/login.html'); } catch (e) { /* Test */ } };

function snapOf(c, fromCache) {
  const m = (st.colls && st.colls[c]) || {};
  return { docs: Object.keys(m).map((id) => ({ id, data: () => m[id] })), metadata: { fromCache: !!fromCache } };
}
function emit(c, fromCache) {
  const subs = st.subs.get(c);
  if (!subs) return;
  const snap = snapOf(c, fromCache);
  for (const s of subs) { try { s.next(snap); } catch (e) { console.error(e); } }
}
const emitAll = (fromCache) => { for (const c of st.subs.keys()) emit(c, fromCache); };
function emitError(err) { for (const subs of st.subs.values()) for (const s of subs) { try { s.error && s.error(err); } catch (e) { /* weiter */ } } }

let persistT = null;
function persist() {
  clearTimeout(persistT);
  persistT = setTimeout(() => kvSet('webdb', { colls: st.colls, etag: st.etag, at: Date.now() }), 600);
}

// Beim Zurückkehren in die App neu laden (Änderungen von anderen Geräten)
let watching = false;
function watch() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.loadedOnce && !st.queue.length) load().catch(() => {}); });
}

export async function load({ force = false } = {}) {
  watch();
  if (st.loading) return st.loading;
  st.loading = (async () => {
    if (!st.colls) {
      const c = await kvGet('webdb');
      if (c && c.colls) { st.colls = c.colls; st.etag = c.etag || null; emitAll(true); }
    }
    let r;
    try {
      r = await fetch('/api/db', { headers: !force && st.etag && st.colls ? { 'if-none-match': st.etag } : {}, credentials: 'same-origin', cache: 'no-store' });
    } catch (e) { throw new DbError('unavailable', 'Keine Verbindung'); }
    if (r.status === 401) { toLogin(); throw new DbError('unauthorized', 'Bitte anmelden'); }
    if (r.status === 304) { st.loadedOnce = true; emitAll(false); return; }
    if (!r.ok) throw new DbError('server_unavailable', 'Speicher antwortet mit ' + r.status);
    const j = await r.json();
    st.colls = (j && j.colls) || {};
    st.etag = r.headers.get('etag');
    st.loadedOnce = true;
    persist();
    emitAll(false);
  })().catch((e) => { emitError(e); throw e; }).finally(() => { st.loading = null; });
  return st.loading;
}

function applyLocal(path, op) {
  const i = path.indexOf('/');
  const c = path.slice(0, i), id = path.slice(i + 1);
  st.colls = st.colls || {};
  if (op.op === 'del') { if (st.colls[c]) { const m = { ...st.colls[c] }; delete m[id]; st.colls[c] = m; } }
  else st.colls[c] = { ...(st.colls[c] || {}), [id]: op.data };
}

function schedule() {
  clearTimeout(st.timer);
  // Änderungen etwas länger sammeln: weniger Schreibvorgänge, weniger Konflikte zwischen Geräten
  st.timer = setTimeout(flush, st.retryAt > Date.now() ? st.retryAt - Date.now() : st.queue.length > 300 ? 0 : 1200);
}

async function flush() {
  if (st.flushing) { await st.flushing.catch(() => {}); if (!st.queue.length) return; }
  const batch = st.queue.splice(0, 2000);
  if (!batch.length) return;
  // je Pfad zählt die letzte Änderung
  const last = new Map();
  for (const q of batch) last.set(q.path, q);
  const ops = [...last.values()].map((q) => (q.op === 'del' ? { path: q.path, op: 'del' } : { path: q.path, op: 'set', data: q.data }));
  // große Änderungen (z. B. Neuberechnung aller Monate) in Paketen bis ca. 2,5 MB senden
  const parts = [];
  { let cur = [], size = 0; for (const o of ops) { const n = JSON.stringify(o).length; if (cur.length && size + n > 2_500_000) { parts.push(cur); cur = []; size = 0; } cur.push(o); size += n; } if (cur.length) parts.push(cur); }
  st.flushing = (async () => {
    let foreign = false, noTag = false;
    for (const part of parts) {
      let r;
      try {
        r = await fetch('/api/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: part }), credentials: 'same-origin' });
      } catch (e) { throw new DbError('unavailable', 'Keine Verbindung'); }
      if (r.status === 401) { toLogin(); throw new DbError('unauthorized', 'Bitte anmelden'); }
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new DbError(r.status === 413 ? 'invalid_argument' : r.status >= 500 ? 'server_unavailable' : 'invalid_argument', (j && j.error && j.error.message) || 'Speichern fehlgeschlagen (' + r.status + ')');
      if (j.prev && st.etag && j.prev !== st.etag) foreign = true;
      if (!j.etag) noTag = true;
      st.etag = j.etag || null;
    }
    persist();
    if (foreign || noTag) load({ force: true }).catch(() => {});
  })();
  try { await st.flushing; st.tries = 0; st.retryAt = 0; for (const q of batch) q.resolve(); }
  catch (e) {
    // Speicher kurz beschäftigt oder keine Verbindung: nichts verwerfen, später erneut senden
    if ((e.code === 'server_unavailable' || e.code === 'unavailable') && (st.tries || 0) < 8) {
      st.tries = (st.tries || 0) + 1;
      st.retryAt = Date.now() + Math.min(60000, 1500 * 2 ** (st.tries - 1));
      st.queue.unshift(...batch);
    } else { st.tries = 0; st.retryAt = 0; for (const q of batch) q.reject(e); }
  }
  finally { st.flushing = null; if (st.queue.length) schedule(); }
}

function enqueue(path, op) {
  applyLocal(path, op);
  persist();
  return new Promise((resolve, reject) => { st.queue.push({ path, op: op.op, data: op.data, resolve, reject }); schedule(); });
}

export const webDb = {
  collection(c) {
    return {
      onSnapshot(next, error) {
        if (!st.subs.has(c)) st.subs.set(c, new Set());
        const sub = { next, error };
        st.subs.get(c).add(sub);
        if (st.loadedOnce) Promise.resolve().then(() => next(snapOf(c, false)));
        else load().catch(() => {});
        return () => st.subs.get(c).delete(sub);
      },
      async get() { if (!st.loadedOnce) await load(); return snapOf(c, false); },
    };
  },
  doc(path) {
    return {
      async get() {
        if (!st.loadedOnce) { try { await load(); } catch (e) { /* Zwischenspeicher */ } }
        const i = path.indexOf('/');
        const v = st.colls && st.colls[path.slice(0, i)] && st.colls[path.slice(0, i)][path.slice(i + 1)];
        return { exists: v != null, data: () => v };
      },
      set(data) { return enqueue(path, { op: 'set', data }); },
      delete() { return enqueue(path, { op: 'del' }); },
    };
  },
};


// Für den Import: viele Dokumente auf einmal schreiben, in Paketen
export async function bulkWrite(ops, onProgress) {
  // Pakete bis ca. 2,5 MB (Grenze einer Serverfunktion: 4,5 MB)
  const parts = [];
  let cur = [], size = 0;
  for (const o of ops) {
    const n = JSON.stringify(o).length;
    if (cur.length && (size + n > 2_500_000 || cur.length >= 400)) { parts.push(cur); cur = []; size = 0; }
    cur.push(o); size += n;
  }
  if (cur.length) parts.push(cur);
  let done = 0;
  for (const part of parts) {
    const r = await fetch('/api/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: part }), credentials: 'same-origin' });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new DbError('import_failed', (j && j.error && j.error.message) || 'Import fehlgeschlagen (' + r.status + ')');
    done += part.length;
    if (onProgress) onProgress(done, ops.length);
  }
  await load({ force: true });
}
