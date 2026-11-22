// Zentraler Zustand. Zwei Schichten: Strava-Kopie (acts, perf, strength, meta)
// und deine Ergänzungen (edits, manual, gym, journal, …). Ergänzungen liegen in
// eigenen Dokumenten und werden beim erneuten Import nie überschrieben.
import { caps, kvGet, kvSet, isTransient } from './platform.js';
import { mapSport } from './sports.js';
import { clusterRoutes } from './routes.js';
import { segmentIndex } from './analysis.js';

export const COLLS = ['acts', 'edits', 'manual', 'gym', 'gymtpl', 'journal', 'breaks', 'gear', 'goals', 'routes', 'reviews', 'settings', 'meta', 'perf', 'strength', 'health'];

const state = {
  streams: {},
  status: {
    boot: true, db: 'loading', mcp: 'unknown', online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    syncing: false, progress: null, analysis: null, error: null, pending: 0, fromCache: true, localOnly: false,
  },
  toast: null,
};
for (const c of COLLS) state[c] = {};

let version = 0;
const listeners = new Set();
export const getState = () => state;
export const getVersion = () => version;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let emitQueued = false;
export function emit() {
  version++;
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => { emitQueued = false; listeners.forEach((f) => f()); });
}

export function setStatus(p) { Object.assign(state.status, p); emit(); }
let toastTimer = null;
export function toast(text, kind = 'info') {
  state.toast = { text, kind, at: Date.now() };
  emit();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; emit(); }, kind === 'error' ? 6000 : 3200);
}

// ---------- Lokaler Zwischenspeicher ----------
let cacheTimer = null;
function saveCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const snap = {};
    for (const c of COLLS) snap[c] = state[c];
    kvSet('snapshot', { at: Date.now(), data: snap });
  }, 800);
}

// ---------- Schreiben (eine Schreibung pro Dokument gleichzeitig, Ausstehendes wird nachgeholt) ----------
let db = null;
const pending = new Map(); // path -> op
const running = new Set();
let outbox = {};

async function runPath(path) {
  if (running.has(path)) return;
  running.add(path);
  try {
    while (pending.has(path)) {
      const op = pending.get(path);
      pending.delete(path);
      try {
        if (!db) throw { code: 'local' };
        if (op.op === 'del') await db.doc(path).delete();
        else await db.doc(path).set(op.data);
        if (outbox[path]) { delete outbox[path]; kvSet('outbox', outbox); }
      } catch (e) {
        if (e && e.code === 'local') { /* nur lokal */ }
        else if (isTransient(e)) { outbox[path] = op; kvSet('outbox', outbox); }
        else if (e && e.code === 'quota_exceeded') toast('Speicher voll: ' + (e.message || 'Bitte alte Daten löschen.'), 'error');
        else if (e && e.code === 'invalid_argument') toast('Speichern abgelehnt (' + path.split('/')[0] + '). ' + (e.message || ''), 'error');
        else { outbox[path] = op; kvSet('outbox', outbox); }
      }
    }
  } finally {
    running.delete(path);
    state.status.pending = Object.keys(outbox).length;
    emit();
  }
}

function enqueue(path, op) {
  pending.set(path, op);
  runPath(path);
}

export async function flushOutbox() {
  if (!db) return;
  const paths = Object.keys(outbox);
  for (const p of paths) if (!pending.has(p)) { pending.set(p, outbox[p]); runPath(p); }
}

const split = (path) => { const i = path.indexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };

export function setDoc(path, data) {
  const [c, id] = split(path);
  state[c] = { ...state[c], [id]: data };
  emit(); saveCache();
  enqueue(path, { op: 'set', data });
}

export function patchDoc(path, partial) {
  const [c, id] = split(path);
  const cur = state[c][id] || {};
  const next = { ...cur };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  setDoc(path, next);
  return next;
}

export function delDoc(path) {
  const [c, id] = split(path);
  const m = { ...state[c] };
  delete m[id];
  state[c] = m;
  emit(); saveCache();
  enqueue(path, { op: 'del' });
}

export const newId = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Start ----------
export async function boot() {
  const cached = await kvGet('snapshot');
  if (cached && cached.data) {
    for (const c of COLLS) if (cached.data[c]) state[c] = cached.data[c];
    state.status.cacheAt = cached.at;
  }
  outbox = (await kvGet('outbox')) || {};
  state.status.pending = Object.keys(outbox).length;
  emit();
  const cp = await caps();
  if (cp.none || !cp.db) {
    setStatus({ db: 'none', localOnly: true, boot: false, mcp: cp.mcp ? 'ready' : 'none' });
    return cp;
  }
  db = cp.db;
  setStatus({ mcp: cp.mcp ? 'ready' : 'none' });
  let first = new Set(COLLS);
  const timer = setTimeout(() => { if (first.size) setStatus({ db: 'slow', boot: false }); }, 10000);
  for (const c of COLLS) {
    try {
      db.collection(c).onSnapshot((snap) => {
        const m = {};
        for (const d of snap.docs) m[d.id] = d.data();
        // eigene ausstehende Schreibungen behalten
        for (const p of Object.keys(outbox)) {
          const [cc, id] = split(p);
          if (cc === c) { if (outbox[p].op === 'del') delete m[id]; else m[id] = outbox[p].data; }
        }
        state[c] = m;
        if (!snap.metadata.fromCache) first.delete(c);
        if (!first.size) { clearTimeout(timer); state.status.db = 'ok'; state.status.boot = false; state.status.fromCache = false; }
        emit(); saveCache();
      }, (err) => {
        first.delete(c);
        state.status.db = err && err.code === 'revoked' ? 'revoked' : 'error';
        state.status.boot = false;
        emit();
      });
    } catch (e) { first.delete(c); }
  }
  flushOutbox();
  setInterval(() => { if (Object.keys(outbox).length && navigator.onLine) flushOutbox(); }, 30000);
  window.addEventListener('online', () => { setStatus({ online: true }); flushOutbox(); });
  window.addEventListener('offline', () => setStatus({ online: false }));
  return cp;
}

export async function getDocOnce(path) {
  if (!db) return null;
  try { const s = await db.doc(path).get(); return s.exists ? s.data() : null; } catch (e) { return null; }
}

// ---------- Abgeleitete Daten ----------
let dCache = { v: -1 };
export function derived() {
  if (dCache.v === version) return dCache;
  const st = state;
  const gearMeta = st.meta.gear || {};
  const frame = {};
  for (const b of gearMeta.bikes || []) frame[b.id] = b.frame;
  const assign = gearMeta.assign || {};
  const list = [];
  const byId = {};
  for (const chunk of Object.values(st.acts)) {
    for (const a of chunk.items || []) {
      const e = st.edits[a.id] || {};
      const gearId = e.gearId || assign[a.id] || a.gear || null;
      const m = mapSport(a.type, { trainer: a.trainer, bikeFrame: frame[gearId] });
      const x = {
        ...a, src: 'strava', origin: a.gid && String(a.id).startsWith('gc') ? 'garmin' : 'strava',
        sport: e.sport || m.sport, autoSport: m.sport, sub: e.sport && e.sport !== m.sport ? null : m.sub,
        indoor: e.indoor ?? m.indoor, ebike: e.ebike ?? m.ebike, derived: e.sport ? null : m.derived,
        gear: gearId, rpe: e.rpe ?? null, notes: e.notes || '', ctx: e.ctx || {}, media: e.media || [],
        excluded: !!e.excluded, edited: Object.keys(e).length > 0, hasGps: !!a.poly, hasHr: a.re != null || a.hrAvg != null,
        name: e.name || a.name,
      };
      list.push(x); byId[x.id] = x;
    }
  }
  for (const m of Object.values(st.manual)) {
    const e = st.edits[m.id] || {};
    const x = { ...m, src: 'manual', sport: e.sport || m.sport, rpe: e.rpe ?? m.rpe ?? null, notes: e.notes || m.notes || '', ctx: e.ctx || {}, media: e.media || [], excluded: !!e.excluded, hasGps: false, dist: m.dist || 0, gain: m.gain || 0, mov: m.mov || 0, ela: m.mov || 0, gear: e.gearId || m.gear || null };
    list.push(x); byId[x.id] = x;
  }
  const gymSessions = Object.values(st.gym).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const s of gymSessions) {
    if (s.linked && byId[s.linked]) { byId[s.linked].gymId = s.id; continue; }
    const id = 'g-' + s.id;
    const e = st.edits[id] || {};
    const x = { id, src: 'gym', gymId: s.id, sport: 'gym', name: s.title || 'Gym-Einheit', date: s.date, start: s.start || s.date + 'T18:00:00', mov: s.dur || estGymDur(s), ela: s.dur || estGymDur(s), dist: 0, gain: 0, rpe: e.rpe ?? s.rpe ?? null, notes: e.notes || s.note || '', ctx: {}, media: e.media || [], excluded: !!e.excluded, hasGps: false };
    list.push(x); byId[id] = x;
  }
  list.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  // mögliche Doppelaufzeichnungen (zwei Geräte)
  const dups = {};
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (a.excluded || b.excluded || a.src !== 'strava' || b.src !== 'strava') continue;
    if (a.sport !== b.sport || a.indoor !== b.indoor) continue;
    const dt = Math.abs(new Date(a.start) - new Date(b.start)) / 60000;
    if (dt <= 15 && a.mov && b.mov && Math.abs(a.mov - b.mov) / Math.max(a.mov, b.mov) < 0.35) { dups[a.id] = b.id; dups[b.id] = a.id; }
  }
  const rmain = st.routes.main || {};
  const { clusters, byAct } = clusterRoutes(list, rmain.overrides || {}, rmain.names || {});
  const segIdx = segmentIndex(st.perf, byId);
  const journal = {};
  for (const ch of Object.values(st.journal)) Object.assign(journal, ch.days || {});
  const gearNames = {};
  for (const b of gearMeta.bikes || []) gearNames[b.id] = b.name;
  for (const g of Object.values(st.gear)) gearNames[g.id] = g.name;
  dCache = { v: version, list, byId, clusters, byAct, segIdx, journal, gymSessions, gearNames, dups };
  return dCache;
}

function estGymDur(s) {
  let n = 0;
  for (const e of s.exercises || []) n += (e.sets || []).length;
  return Math.max(15, n * 3) * 60;
}

// Bearbeitungen an Aktivitäten
export function editAct(id, partial) { return patchDoc('edits/' + id, { ...partial, at: Date.now() }); }
