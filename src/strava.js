// Abgleich mit Strava über den in Claude verbundenen Strava-Connector.
import { compactGrid } from './grade.js';
import { caps, kvGet, kvSet } from './platform.js';
import { getState, setDoc, patchDoc, setStatus, toast, derived, getDocOnce } from './store.js';
import { encode, decode } from './geo.js';
import { powerCurve } from './analysis.js';

export const SERVER = 'Strava';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SyncError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

export function explain(e) {
  const c = e && e.code;
  switch (c) {
    case 'no_mcp': case 'not_granted': case 'capability_disabled': case 'capability_removed':
      return 'Strava ist in dieser Ansicht nicht erreichbar. Öffne die App auf claude.ai, angemeldet mit deinem Konto.';
    case 'needs_reauth': return 'Die Strava-Verbindung ist abgelaufen. Verbinde Strava neu unter claude.ai → Einstellungen → Connectors.';
    case 'server_not_connected': return 'Strava ist in Claude nicht verbunden. Füge Strava unter claude.ai → Einstellungen → Connectors hinzu.';
    case 'selection_required': return 'Es gibt mehrere Strava-Verbindungen. Wähle in Claude, welche diese App nutzen soll.';
    case 'approval_required': case 'consent_required': case 'not_in_manifest':
      return 'Die App braucht deine Erlaubnis für Strava. Tippe auf „Mit Strava abgleichen“ und bestätige die Anfrage.';
    case 'blocked_by_policy': return 'Deine Organisation erlaubt Strava für diese Seite nicht.';
    case 'server_unavailable': case 'upstream_error': case 'rate_limited':
      return 'Strava antwortet gerade nicht. Versuch es in ein paar Minuten noch einmal.';
    case 'tool_error': return 'Strava hat einen Fehler gemeldet: ' + (e.message || '').slice(0, 140);
    default: return 'Abgleich fehlgeschlagen' + (e && e.message ? ': ' + String(e.message).slice(0, 140) : '.');
  }
}

export async function stravaCall(tool, input) { return call(tool, input); }
async function call(tool, input, retry = true) {
  const cp = await caps();
  if (!cp.mcp) throw new SyncError('no_mcp');
  try {
    const r = await cp.mcp.callTool(SERVER, tool, input || {}, { cache: false });
    let p = r && (r.payload !== undefined ? r.payload : r);
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { /* Text */ } }
    return p;
  } catch (e) {
    if (retry && e && e.retryable) {
      await sleep(Math.min(e.retryAfterMs || 1500 + Math.random() * 1000, 20000));
      return call(tool, input, false);
    }
    throw new SyncError(e && e.code ? e.code : 'unknown', e && e.message);
  }
}

export function normalizeActivity(raw) {
  const s = raw.summary || {};
  const w = raw.weather;
  return {
    id: String(raw.id),
    name: raw.name || 'Aktivität',
    desc: raw.description || '',
    type: raw.sport_type || raw.type || 'Workout',
    start: raw.start_local || raw.start_date_local || '',
    date: (raw.start_local || '').slice(0, 10),
    place: raw.location_summary || '',
    trainer: !!raw.is_trainer,
    commute: !!raw.is_commute,
    tags: raw.activity_tags || [],
    gear: raw.gear_id ? String(raw.gear_id) : null,
    dist: s.distance || 0,
    mov: s.moving_time || 0,
    ela: s.elapsed_time || 0,
    gain: s.elevation_gain || 0,
    avgSpd: s.avg_speed || 0,
    maxSpd: s.max_speed || 0,
    cad: s.avg_cadence ?? null,
    cal: s.total_calories ?? null,
    re: s.relative_effort ?? null,
    kudos: s.kudos_count || 0,
    ach: s.achievement_count || 0,
    pr: s.pr_count || 0,
    poly: raw.reduced_polyline || null,
    wx: w ? { c: w.condition || null, t: w.temperature ?? null, wind: w.wind_speed ?? null } : null,
  };
}

const monthOf = (a) => (a.date || '0000-00').slice(0, 7);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Aktivitäten ----------
async function syncActivities(full, progress) {
  const st = getState();
  let latest = null;
  for (const ch of Object.values(st.acts)) for (const a of ch.items || []) if (!latest || a.start > latest) latest = a.start;
  const input = { first: 100, include_polyline: true, include_tags: true, ordering: 'StartDateLocalAsc' };
  if (!full && latest) {
    const d = new Date(latest.slice(0, 10)); d.setDate(d.getDate() - 4);
    input.range_start = d.toISOString().slice(0, 10) + 'T00:00:00';
  }
  const fetched = [];
  let after = null, page = 0;
  do {
    const p = await call('list_activities', after ? { ...input, after } : input);
    const items = (p && p.activities) || [];
    for (const r of items) fetched.push(normalizeActivity(r));
    after = p && p.has_next_page ? p.end_cursor : null;
    page++;
    progress('Aktivitäten laden', fetched.length, null);
    if (page > 60) break;
  } while (after);
  // nach Monaten zusammenführen, nur geänderte Monate schreiben
  const byMonth = {};
  for (const a of fetched) (byMonth[monthOf(a)] || (byMonth[monthOf(a)] = [])).push(a);
  const seen = new Set(fetched.map((a) => a.id));
  let added = 0, updated = 0, gone = 0;
  const months = new Set(Object.keys(byMonth));
  if (full) for (const m of Object.keys(st.acts)) months.add(m);
  for (const m of months) {
    const old = (st.acts[m] && st.acts[m].items) || [];
    const map = new Map(old.map((a) => [a.id, a]));
    for (const a of byMonth[m] || []) {
      const prev = map.get(a.id);
      if (!prev) { added++; map.set(a.id, { ...a, seen: Date.now() }); }
      else {
        const { seen: s0, gone: g0, ...rest } = prev;
        if (!same(rest, a) || g0) { updated++; map.set(a.id, { ...a, seen: s0 || Date.now() }); }
      }
    }
    if (full) {
      for (const [id, a] of map) if (!seen.has(id) && !a.gone) { gone++; map.set(id, { ...a, gone: true }); }
    }
    const items = [...map.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
    if (!same(items, old)) setDoc('acts/' + m, { items });
  }
  return { fetched: fetched.length, added, updated, gone };
}

// ---------- Ausrüstung ----------
async function syncGear(full, progress) {
  const st = getState();
  const prev = st.meta.gear || {};
  const g = await call('get_gear', {});
  const items = (g && g.gear) || [];
  const bikes = items.filter((x) => x.gear_id && x.gear_id.gear_type === 'Bike').map((x) => ({ id: String(x.gear_id.id), name: (x.name || '').trim(), frame: x.frame_type || null, dist: x.total_distance || 0, retired: !!x.retired, weight: x.weight || null, desc: x.description || '' }));
  const shoes = items.filter((x) => x.gear_id && x.gear_id.gear_type === 'Shoe').map((x) => ({ id: String(x.gear_id.id), name: (x.name || '').trim(), dist: x.total_distance || 0, retired: !!x.retired, brand: x.brand || '', model: x.model_name || '' }));
  const assign = { ...(prev.assign || {}) };
  const since = !full && prev.at ? new Date(prev.at - 5 * 86400000).toISOString().slice(0, 10) + 'T00:00:00' : null;
  for (const b of [...bikes, ...shoes]) {
    let offset = 0, guard = 0;
    while (guard++ < 40) {
      const input = { first: 100, offset };
      if (bikes.includes(b)) input.bike_id = b.id; else input.athlete_gear_id = b.id;
      if (since) input.start_date_min = since;
      const r = await call('search_activities', input);
      for (const a of (r && r.activities) || []) assign[String(a.id)] = b.id;
      progress('Ausrüstung zuordnen', Object.keys(assign).length, null);
      if (!r || !r.has_next_page) break;
      offset = r.next_offset;
    }
  }
  setDoc('meta/gear', { bikes, shoes, assign, at: Date.now() });
}

// ---------- Zonen (auch historisch) ----------
function zoneEntry(z, from) {
  if (!z) return null;
  const hr = (z.heart_rate_zones || []).slice(0, -1).map((x) => x.max);
  const power = (z.power_zones || []).slice(0, -1).map((x) => x.max);
  return { from, hr, power: power.length ? power : null, ftp: z.ftp || null, ftpEst: !!z.ftp_is_estimated, hrSrc: z.heart_rate_zone_source || '', pwSrc: z.power_zone_source || '', src: 'strava' };
}

async function syncZones(progress) {
  const st = getState();
  const prev = st.meta.zones;
  if (prev && prev.at && Date.now() - prev.at < 20 * 86400000) return;
  const d = derived();
  const first = d.list.length ? d.list[d.list.length - 1].date : null;
  const dates = [];
  if (first) {
    const t = new Date(first.slice(0, 7) + '-01');
    const now = new Date();
    while (t < now) { dates.push(t.toISOString().slice(0, 10)); t.setMonth(t.getMonth() + 3); }
  }
  const hist = [];
  for (const dt of dates) {
    try {
      const z = await call('get_athlete_zones', { as_of_date: dt });
      const e = zoneEntry(z, dt);
      const last = hist[hist.length - 1];
      if (e && (!last || JSON.stringify([last.hr, last.power, last.ftp]) !== JSON.stringify([e.hr, e.power, e.ftp]))) hist.push(e);
    } catch (e) { /* einzelne Daten dürfen fehlen */ }
    progress('Zonen-Verlauf', hist.length, null);
  }
  const cur = zoneEntry(await call('get_athlete_zones', {}), new Date().toISOString().slice(0, 10));
  const last = hist[hist.length - 1];
  if (cur && (!last || JSON.stringify([last.hr, last.power, last.ftp]) !== JSON.stringify([cur.hr, cur.power, cur.ftp]))) hist.push(cur);
  if (hist.length) hist[0].from = '2000-01-01';
  setDoc('meta/zones', { hist, at: Date.now() });
}

// ---------- Gesamter Abgleich ----------
let syncing = null;
export function sync({ full = false } = {}) {
  if (syncing) return syncing;
  syncing = (async () => {
    setStatus({ syncing: true, error: null, progress: { step: 'Verbinden', n: 0 } });
    const progress = (step, n, total) => setStatus({ progress: { step, n, total } });
    try {
      const st = getState();
      const firstRun = !Object.keys(st.acts).length;
      const r = await syncActivities(full || firstRun, progress);
      try { await syncGear(full || firstRun, progress); } catch (e) { if (['needs_reauth', 'server_not_connected'].includes(e.code)) throw e; }
      try { await syncZones(progress); } catch (e) { /* optional */ }
      patchDoc('meta/sync', { lastSync: Date.now(), lastFull: full || firstRun ? Date.now() : (st.meta.sync || {}).lastFull || null, lastResult: r });
      setStatus({ syncing: false, progress: null, mcp: 'ok' });
      toast(r.added ? r.added + ' neue Aktivität' + (r.added === 1 ? '' : 'en') + ' übernommen' : 'Alles aktuell' + (r.updated ? ' (' + r.updated + ' aktualisiert)' : ''));
      analyzeQueue();
      return r;
    } catch (e) {
      const msg = explain(e);
      setStatus({ syncing: false, progress: null, error: { code: e.code, msg }, mcp: ['needs_reauth', 'server_not_connected', 'no_mcp', 'not_granted', 'approval_required', 'consent_required', 'not_in_manifest'].includes(e.code) ? 'blocked' : getState().status.mcp });
      throw e;
    } finally { syncing = null; }
  })();
  return syncing;
}

// ---------- Hintergrund-Analyse: Segmente und Kraftsätze ----------
export function trimPerf(p) {
  return {
    hasHr: !!p.has_heartrate, hasW: !!p.has_device_watts,
    avgHr: p.average_heartrate ?? null, maxHr: p.max_heartrate ?? null,
    avgW: p.average_watts ?? null, cad: p.average_cadence ?? null, rpe: p.perceived_exertion ?? null,
    seg: (p.segment_efforts || []).map((e) => ({ id: String(e.segment_id), n: (e.segment_name || '').trim(), d: Math.round(e.distance || 0), g: Math.round((e.elev_gain || 0) * 10) / 10, et: e.elapsed_time, mt: e.moving_time, hr: e.avg_hr ? Math.round(e.avg_hr) : null })),
    best: (p.best_efforts || []).map((b) => ({ t: b.type_value || b.name, v: b.value, u: b.unit })),
    laps: (p.laps || []).length,
    at: Date.now(),
  };
}

let analyzing = false;
export async function analyzeQueue(max = 30) {
  if (analyzing) return;
  analyzing = true;
  try {
    const d = derived();
    const st = getState();
    const todo = d.list.filter((a) => a.src === 'strava' && !a.indoor && a.hasGps && ['road', 'mtb', 'hike', 'splitboard'].includes(a.sport) && !st.perf[a.id]).slice(0, max);
    const gymTodo = d.list.filter((a) => a.src === 'strava' && a.sport === 'gym' && ['WeightTraining', 'Workout', 'Crossfit'].includes(a.type) && !st.strength[a.id]).slice(0, 40).map((a) => a.id);
    const total = todo.length + (gymTodo.length ? 1 : 0);
    let n = 0;
    for (const a of todo) {
      setStatus({ analysis: { n, total } });
      try { const p = await call('get_activity_performance', { activity_id: a.id }); setDoc('perf/' + a.id, trimPerf(p)); }
      catch (e) { if (['needs_reauth', 'server_not_connected', 'no_mcp', 'not_granted', 'approval_required'].includes(e.code)) break; }
      n++;
      await sleep(600);
    }
    if (gymTodo.length) {
      try {
        const r = await call('get_strength_workout_details', { activity_ids: gymTodo });
        const arr = Array.isArray(r) ? r : (r && r.workouts) || [];
        const got = new Set();
        for (const w of arr) { got.add(String(w.activity_id)); setDoc('strength/' + w.activity_id, { sets: normalizeStrength(w.exercise_sets || []), at: Date.now() }); }
        for (const id of gymTodo) if (!got.has(id)) setDoc('strength/' + id, { sets: [], at: Date.now() });
      } catch (e) { /* später erneut */ }
    }
  } finally {
    analyzing = false;
    setStatus({ analysis: null });
  }
}

export function normalizeStrength(sets) {
  const num = (s) => { const m = /([\d.,]+)/.exec(s || ''); return m ? parseFloat(m[1].replace(',', '.')) : null; };
  const secs = (s) => { if (!s) return null; let t = 0; const h = /(\d+)h/.exec(s), m = /(\d+)m(?!s)/.exec(s), x = /(\d+)s/.exec(s); if (h) t += +h[1] * 3600; if (m) t += +m[1] * 60; if (x) t += +x[1]; return t || null; };
  return sets.map((s) => ({ name: s.exercise_name || 'Unbekannt', muscles: s.muscle_groups || [], kg: s.weight ? num(s.weight.value) : null, unit: s.weight && /lb/.test(s.weight.value) ? 'lb' : 'kg', reps: s.reps ? num(s.reps.value) : null, sec: s.duration ? secs(s.duration.value) : null }));
}

// ---------- Zeitreihen ----------
function compactStream(s) {
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    ll: s.ll ? encode(s.ll) : null,
    t: s.t, d: s.d ? s.d.map((v) => Math.round(v)) : null, alt: s.alt ? s.alt.map(r1) : null,
    hr: s.hr, w: s.w, cad: s.cad ? s.cad.map((v) => (v == null ? null : Math.round(v))) : null,
    v: s.v ? s.v.map(r2) : null, mov: s.mov ? s.mov.map((b) => (b ? 1 : 0)).join('') : null,
    res: s.res, at: s.at,
  };
}
function expandStream(c) {
  return { ...c, ll: c.ll ? decode(c.ll) : null, mov: c.mov ? [...c.mov].map((x) => x === '1') : null };
}

export function normalizeStreams(p, res) {
  const get = (k) => (p && Array.isArray(p[k]) ? p[k] : null);
  const t = get('time');
  if (!t) return null;
  return {
    t, d: get('distance'), alt: get('altitude'), ll: get('location'), hr: get('heart_rate'), w: get('watts'),
    cad: get('cadence'), v: get('velocity_smooth'), mov: get('moving'), res, at: Date.now(),
  };
}

const memStreams = {};
export async function loadStreams(id, { fetch = true } = {}) {
  if (memStreams[id]) return memStreams[id];
  const local = await kvGet('st:' + id);
  if (local) return (memStreams[id] = expandStream(local));
  const remote = await getDocOnce('streams/' + id);
  if (remote) { kvSet('st:' + id, remote); return (memStreams[id] = expandStream(remote)); }
  if (!fetch) return null;
  const p = await call('get_activity_streams', { activity_id: id, streams: ['time', 'distance', 'altitude', 'location', 'heart_rate', 'watts', 'cadence', 'velocity_smooth', 'moving'], resolution: 1000 });
  const s = normalizeStreams(p, 1000);
  if (!s) throw new SyncError('tool_error', 'Keine Zeitreihen für diese Aktivität');
  const c = compactStream(s);
  kvSet('st:' + id, c);
  setDoc('streams/' + id, c);
  return (memStreams[id] = expandStream(c));
}

export function hasStreamsCached(id) { return !!memStreams[id]; }

// Leistungs-Bestwerte aus voller Auflösung (einmalig je Fahrt)
export async function ensurePowerCurve(id) {
  const st = getState();
  const p = st.perf[id];
  if (p && p.pc) return p.pc;
  const r = await call('get_activity_streams', { activity_id: id, streams: ['time', 'watts'] });
  const pc = powerCurve(r && r.watts, r && r.time);
  patchDoc('perf/' + id, { ...(p || {}), pc: pc || { res: [], step: null }, at: (p && p.at) || Date.now() });
  return pc;
}

// Volle Auflösung für das Höhenprofil (als 50-m-Raster gespeichert)
export async function ensureFullGrade(id) {
  const p = getState().perf[id];
  if (p && p.gr) return p.gr;
  const r = await call('get_activity_streams', { activity_id: id, streams: ['time', 'distance', 'altitude'] });
  const s = normalizeStreams(r, 'full');
  const gr = s ? compactGrid({ d: s.d, alt: s.alt, t: s.t }) : null;
  if (!gr) throw new SyncError('tool_error', 'Keine Höhendaten in voller Auflösung');
  patchDoc('perf/' + id, { ...(p || {}), gr, at: (p && p.at) || Date.now() });
  return gr;
}

export async function ensurePerf(id) {
  const st = getState();
  if (st.perf[id]) return st.perf[id];
  const p = await call('get_activity_performance', { activity_id: id });
  const t = trimPerf(p);
  setDoc('perf/' + id, t);
  return t;
}

export async function ensureStrength(id) {
  const st = getState();
  if (st.strength[id]) return st.strength[id];
  const r = await call('get_strength_workout_details', { activity_ids: [id] });
  const arr = Array.isArray(r) ? r : (r && r.workouts) || [];
  const w = arr.find((x) => String(x.activity_id) === String(id));
  const doc = { sets: normalizeStrength((w && w.exercise_sets) || []), at: Date.now() };
  setDoc('strength/' + id, doc);
  return doc;
}

export async function connectStrava() {
  // Erster Aufruf nach einem Tipp: Claude fragt nach der Erlaubnis für Strava
  return sync({});
}

// In der Claude-Version: Zusammenfassung kommt aus den normalen Zeitreihen
export async function ensureFullSummary() { return null; }
