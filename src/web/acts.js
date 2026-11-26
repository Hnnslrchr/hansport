// Web-Version: Aktivitäten direkt von Garmin (Personal API) statt Strava.
// Bestehende, aus Strava übernommene Aktivitäten bleiben erhalten; passende Garmin-Aufzeichnungen
// werden über die Startzeit verknüpft (gid), damit Zeitreihen und Runden aus der Garmin-Originaldatei kommen.
import { compactGrid } from '../grade.js';
import { kvGet, kvSet } from '../platform.js';
import { getState, setDoc, patchDoc, setStatus, toast, derived, getDocOnce } from '../store.js';
import { encode, decode } from '../geo.js';
import { powerCurve } from '../analysis.js';
import { actSummary } from '../actsum.js';
import { normalizeStreams, normalizeStrength } from '../strava.js';
import { garmin, fit } from './api.js';
import { recomputeHealth } from './health.js';

export { normalizeStreams, normalizeStrength };
export const SERVER = 'Garmin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SyncError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

export function explain(e) {
  const c = e && e.code;
  switch (c) {
    case 'garmin_not_configured': return 'Garmin ist noch nicht eingerichtet: Trage deinen Garmin-API-Schlüssel in Vercel als GARMIN_API_KEY ein.';
    case 'garmin_key_invalid': return 'Garmin lehnt den API-Schlüssel ab. Erzeuge in Garmin Connect einen neuen und trage ihn in Vercel ein.';
    case 'garmin_rate_limited': case 'rate_limited': return 'Garmin drosselt gerade die Abfragen. Versuch es in ein paar Minuten noch einmal.';
    case 'unavailable': return 'Keine Verbindung. Prüfe das Internet und versuch es erneut.';
    case 'no_source': return e.message;
    case 'unauthorized': return 'Bitte melde dich neu an.';
    default: return 'Abgleich fehlgeschlagen' + (e && e.message ? ': ' + String(e.message).slice(0, 160) : '.');
  }
}

// Garmin-Sportart → bisherige (Strava-)Typen, damit Zuordnung und Auswertungen gleich bleiben
const TYPE = {
  road_biking: 'Ride', cycling: 'Ride', gravel_cycling: 'GravelRide', cyclocross: 'GravelRide', recumbent_cycling: 'Ride', track_cycling: 'Ride', bmx: 'Ride',
  mountain_biking: 'MountainBikeRide', downhill_biking: 'MountainBikeRide', enduro_mtb: 'MountainBikeRide',
  e_bike_fitness: 'EBikeRide', e_bike_mountain: 'EMountainBikeRide', e_mountain_biking: 'EMountainBikeRide',
  virtual_ride: 'VirtualRide', indoor_cycling: 'Ride', spinning: 'Ride',
  running: 'Run', street_running: 'Run', treadmill_running: 'Run', indoor_running: 'Run', track_running: 'Run', trail_running: 'TrailRun', virtual_run: 'Run', ultra_run: 'TrailRun',
  hiking: 'Hike', mountaineering: 'Hike', walking: 'Walk', casual_walking: 'Walk', speed_walking: 'Walk', rucking: 'Hike',
  backcountry_skiing: 'BackcountrySki', backcountry_snowboarding: 'BackcountrySki', skate_skiing_ws: 'NordicSki', cross_country_skiing_ws: 'NordicSki',
  resort_skiing_snowboarding_ws: 'Snowboard', resort_snowboarding: 'Snowboard', snowboarding_ws: 'Snowboard', resort_skiing: 'AlpineSki', skiing_ws: 'AlpineSki',
  strength_training: 'WeightTraining', fitness_equipment: 'Workout', hiit: 'HighIntensityIntervalTraining', cardio: 'Workout', indoor_cardio: 'Workout', pilates: 'Pilates', elliptical: 'Elliptical', stair_climbing: 'StairStepper', floor_climbing: 'StairStepper',
  yoga: 'Yoga', lap_swimming: 'Swim', open_water_swimming: 'Swim', swimming: 'Swim', indoor_rowing: 'Rowing', rowing: 'Rowing', stand_up_paddleboarding: 'StandUpPaddling',
  rock_climbing: 'RockClimbing', bouldering: 'RockClimbing', indoor_climbing: 'RockClimbing',
};
const INDOOR = new Set(['indoor_cycling', 'spinning', 'treadmill_running', 'indoor_running', 'indoor_rowing']);

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const numOr = (v, d = null) => (typeof v === 'number' && isFinite(v) ? v : d);

export function normalizeGarmin(x) {
  const tk = (x.activityType && x.activityType.typeKey) || 'other';
  const start = String(x.startTimeLocal || '').replace(' ', 'T').slice(0, 19);
  const z = [1, 2, 3, 4, 5].map((i) => numOr(x['hrTimeInZone_' + i]));
  return {
    id: 'gc' + x.activityId, gid: String(x.activityId),
    name: x.activityName || 'Aktivität', desc: x.description || '',
    type: TYPE[tk] || 'Workout', gtype: tk, start, date: start.slice(0, 10), place: x.locationName || '',
    trainer: INDOOR.has(tk), commute: false, tags: [], gear: null,
    dist: numOr(x.distance, 0), mov: Math.round(numOr(x.movingDuration) ?? numOr(x.duration, 0)), ela: Math.round(numOr(x.elapsedDuration) ?? numOr(x.duration, 0)),
    gain: numOr(x.elevationGain, 0), avgSpd: numOr(x.averageSpeed, 0), maxSpd: numOr(x.maxSpeed, 0),
    cad: numOr(x.averageBikingCadenceInRevPerMinute) ?? numOr(x.averageRunningCadenceInStepsPerMinute), cal: numOr(x.calories),
    re: null, kudos: 0, ach: 0, pr: 0, poly: null, wx: null,
    ...garminExtras(x),
    hasPoly: !!x.hasPolyline,
  };
}

// Messwerte von Garmin, die auch an übernommene Strava-Aktivitäten angehängt werden
function garminExtras(x) {
  const z = [1, 2, 3, 4, 5].map((i) => numOr(x['hrTimeInZone_' + i]));
  const o = {
    gid: String(x.activityId),
    hrAvg: numOr(x.averageHR), hrMax: numOr(x.maxHR), wAvg: numOr(x.avgPower), np: numOr(x.normPower),
    tss: r1(numOr(x.trainingStressScore)), load: r1(numOr(x.activityTrainingLoad)), te: r1(numOr(x.aerobicTrainingEffect)), teAn: r1(numOr(x.anaerobicTrainingEffect)),
    vo2: numOr(x.vO2MaxValue), hrz: z.some((v) => v != null) ? z.map((v) => (v == null ? 0 : Math.round(v))) : null,
  };
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];
  return o;
}

// Strecke nachladen? Alles mit möglichem GPS, nicht Indoor/Kraft; nach Fehlern mit wachsender Pause erneut
const NO_GPS = new Set(['WeightTraining', 'Workout', 'Yoga', 'Pilates', 'Elliptical', 'StairStepper', 'Rowing', 'HighIntensityIntervalTraining', 'VirtualRide']);
function wantsPoly(a) {
  if (!a || a.id !== 'gc' + a.gid || a.poly || a.noGps || a.trainer || NO_GPS.has(a.type)) return false;
  if (a.hasPoly === false && !(a.dist > 0)) return false;
  const n = a.polyTry || 0;
  return !n || Date.now() - (a.polyAt || 0) > Math.min(7, 2 ** n) * 3600000;
}

const naive = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/.exec(s || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN; };
const monthOf = (a) => (a.date || '0000-00').slice(0, 7);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayIso = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

async function listGarmin(from, to, progress) {
  const out = [];
  for (let start = 0, page = 0; page < 80; page++, start += 100) {
    const q = { start, limit: 100, sortOrder: 'asc' };
    if (from) q.startDate = from;
    if (to) q.endDate = to;
    const r = await garmin('/activitylist-service/activities/search/activities', q);
    const items = Array.isArray(r) ? r : [];
    out.push(...items);
    progress('Aktivitäten laden', out.length, null);
    if (items.length < 100) break;
  }
  return out;
}

// ---------- Aktivitäten ----------
async function syncActivities(full, progress) {
  const st = getState();
  const gmeta = st.meta.garmin || {};
  const all = [];
  for (const ch of Object.values(st.acts)) for (const a of ch.items || []) all.push(a);
  let latestG = null;
  for (const a of all) if (a.gid && (!latestG || a.start > latestG)) latestG = a.start;
  const first = full || !gmeta.linkedAt;
  const from = first ? null : addDays((latestG || gmeta.last || todayIso()).slice(0, 10), -4);
  const raw = await listGarmin(from, null, progress);
  // vorhandene nach Startzeit indizieren
  const byStart = all.filter((a) => !a.gid || a.id === 'gc' + a.gid).map((a) => ({ a, t: naive(a.start) })).filter((x) => isFinite(x.t)).sort((p, q) => p.t - q.t);
  const byGid = new Map(all.filter((a) => a.gid).map((a) => [a.gid, a]));
  const changes = new Map(); // id -> neues Objekt
  const touched = new Set();
  let added = 0, updated = 0, linked = 0;
  const needPoly = [];
  for (const x of raw) {
    if (!x || x.activityId == null) continue;
    const g = normalizeGarmin(x);
    const known = byGid.get(g.gid);
    if (known && known.id !== g.id) {
      // übernommene Strava-Aktivität: nur Garmin-Messwerte aktualisieren
      const next = { ...known, ...garminExtras(x) };
      if (!same(next, known)) { changes.set(known.id, next); touched.add(monthOf(known)); updated++; }
      continue;
    }
    if (known) {
      const next = { ...g, poly: known.poly || null, seen: known.seen || Date.now() };
      for (const k of ['noGps', 'polyTry', 'polyAt']) if (known[k] != null) next[k] = known[k];
      if (!same(next, known)) { changes.set(g.id, next); touched.add(monthOf(g)); updated++; }
      if (wantsPoly(next)) needPoly.push(g.id);
      continue;
    }
    // passende Strava-Aufzeichnung suchen (gleiche lokale Startzeit ±3 min, ähnliche Distanz)
    const t = naive(g.start);
    let match = null, best = 1e9;
    for (const c of byStart) {
      if (c.a.gid) continue;
      const dt = Math.abs(c.t - t);
      if (dt > 180000 || dt >= best) continue;
      const dd = Math.max(c.a.dist || 0, g.dist || 0);
      if (dd > 500 && Math.abs((c.a.dist || 0) - (g.dist || 0)) / dd > 0.2) continue;
      match = c.a; best = dt;
    }
    if (match) {
      const next = { ...match, ...garminExtras(x) };
      match.gid = g.gid;
      changes.set(match.id, next); touched.add(monthOf(match)); linked++;
      continue;
    }
    const item = { ...g, seen: Date.now() };
    changes.set(item.id, item); touched.add(monthOf(item)); added++;
    byGid.set(g.gid, item);
    if (wantsPoly(item)) needPoly.push(item.id);
  }
  writeMonths(changes, touched);
  // Karte (vereinfachte GPS-Linie) und Runden aus der Originaldatei: neueste zuerst, der Rest läuft im Hintergrund weiter
  needPoly.sort((p, q) => { const a = findAct(p), b = findAct(q); return a && b && a.start < b.start ? 1 : -1; });
  await fillFromFit(needPoly, progress, 25);
  patchDoc('meta/garmin', { linkedAt: gmeta.linkedAt || Date.now(), last: todayIso(), n: (gmeta.n || 0) + added });
  return { fetched: raw.length, added, updated, linked };
}

function writeMonths(changes, touched) {
  if (!changes.size) return;
  const st = getState();
  const months = new Set(touched);
  for (const m of months) {
    const old = (st.acts[m] && st.acts[m].items) || [];
    const map = new Map(old.map((a) => [a.id, a]));
    for (const [id, a] of changes) if (monthOf(a) === m) map.set(id, a);
    const items = [...map.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
    if (!same(items, old)) setDoc('acts/' + m, { items });
  }
}

function findAct(id) {
  for (const ch of Object.values(getState().acts)) for (const a of ch.items || []) if (a.id === id) return a;
  return null;
}

export function perfFromSummary(a, s) {
  const laps = (s && s.laps) || [];
  return {
    hasHr: a.hrAvg != null, hasW: a.wAvg != null, avgHr: a.hrAvg ?? null, maxHr: a.hrMax ?? null, avgW: a.wAvg ?? null,
    cad: a.cad ?? null, rpe: null, seg: [], best: [], laps: laps.length, lapList: laps.slice(0, 200), src: 'garmin', at: Date.now(),
  };
}

// Garmin drosselt bei vielen Abrufen hintereinander (HTTP 429): Abstand halten und bei Drosselung pausieren
let fitPauseUntil = 0;
export const fitPaused = () => fitPauseUntil > Date.now();
async function fillFromFit(ids, progress, max = 40) {
  if (fitPaused()) return;
  const list = ids.slice(0, max);
  const changes = new Map(), touched = new Set();
  let n = 0;
  for (const id of list) {
    const a = findAct(id);
    if (!a || !a.gid) continue;
    progress('Strecken laden', ++n, list.length);
    try {
      const s = await fit(a.gid, 'summary');
      const next = { ...a, poly: s.poly || null };
      delete next.polyTried; delete next.polyTry; delete next.polyAt;
      if (!s.poly) next.noGps = true;
      changes.set(id, next); touched.add(monthOf(a));
      if (!getState().perf[id]) setDoc('perf/' + id, perfFromSummary(a, s));
      if (s.sets && s.sets.length && !getState().strength[id]) setDoc('strength/' + id, { sets: s.sets, src: 'garmin', at: Date.now() });
    } catch (e) {
      if (e && (e.code === 'unauthorized' || e.code === 'garmin_not_configured' || e.code === 'garmin_key_invalid')) break;
      if (e && (e.code === 'garmin_rate_limited' || e.status === 429)) { fitPauseUntil = Date.now() + Math.max(60, e.retry || 0) * 1000; break; }
      changes.set(id, { ...a, polyTry: (a.polyTry || 0) + 1, polyAt: Date.now() }); touched.add(monthOf(a));
    }
    await sleep(700);
  }
  writeMonths(changes, touched);
}

// ---------- Zonen ----------
async function syncZones() {
  const prev = getState().meta.zones || { hist: [] };
  if (prev.gAt && Date.now() - prev.gAt < 7 * 86400000) return;
  const r = await garmin('/biometric-service/heartRateZones/v2');
  const arr = Array.isArray(r) ? r : [];
  const z = arr.find((x) => x && /cycl/i.test(x.sport || '')) || arr.find((x) => x && /default/i.test(x.sport || '')) || arr[0];
  if (!z || z.zone2Floor == null) { patchDoc('meta/zones', { ...prev, gAt: Date.now() }); return; }
  const hr = [z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor].map((v) => Math.round(v));
  const hist = (prev.hist || []).slice();
  const last = hist[hist.length - 1];
  if (!last || JSON.stringify(last.hr) !== JSON.stringify(hr)) {
    hist.push({ from: todayIso(), hr, power: last ? last.power : null, ftp: last ? last.ftp : null, ftpEst: last ? last.ftpEst : false, hrSrc: 'garmin', pwSrc: last ? last.pwSrc : '', src: 'garmin', max: z.maxHeartRateUsed || null, rest: z.restingHeartRateUsed || null });
    if (hist.length === 1) hist[0].from = '2000-01-01';
  }
  setDoc('meta/zones', { ...prev, hist, at: prev.at || Date.now(), gAt: Date.now() });
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
      const r = await syncActivities(full, progress);
      try { await syncZones(); } catch (e) { /* optional */ }
      patchDoc('meta/sync', { lastSync: Date.now(), src: 'garmin', lastFull: full ? Date.now() : (st.meta.sync || {}).lastFull || null, lastResult: r });
      try { recomputeHealth(); } catch (e) { console.warn(e); }
      setStatus({ syncing: false, progress: null, mcp: 'ok' });
      toast(r.added ? r.added + ' neue Aktivität' + (r.added === 1 ? '' : 'en') + ' von Garmin' : r.linked ? r.linked + ' Aktivitäten mit Garmin verknüpft' : 'Alles aktuell' + (r.updated ? ' (' + r.updated + ' aktualisiert)' : ''));
      analyzeQueue();
      return r;
    } catch (e) {
      const msg = explain(e);
      setStatus({ syncing: false, progress: null, error: { code: e.code, msg }, mcp: ['garmin_not_configured', 'garmin_key_invalid', 'unauthorized'].includes(e.code) ? 'blocked' : getState().status.mcp });
      throw e;
    } finally { syncing = null; }
  })();
  return syncing;
}

// Hintergrund: fehlende Strecken nachladen (z. B. wenn ein Abgleich abgebrochen wurde)
let analyzing = false;
export async function analyzeQueue(max = 20) {
  if (analyzing) return;
  analyzing = true;
  try {
    // in Paketen, neueste zuerst, bis alles da ist (zwischendurch kurz Luft für die Oberfläche)
    for (let round = 0; round < 40; round++) {
      const list = [];
      for (const ch of Object.values(getState().acts)) for (const a of ch.items || []) if (wantsPoly(a)) list.push(a);
      if (!list.length) break;
      list.sort((p, q) => (p.start < q.start ? 1 : -1));
      if (fitPaused()) { setStatus({ analysis: { step: 'Garmin pausiert kurz', n: 0, total: list.length } }); await sleep(fitPauseUntil - Date.now() + 500); continue; }
      setStatus({ analysis: { step: 'Strecken laden', n: 0, total: list.length } });
      await fillFromFit(list.map((a) => a.id), (step, n) => setStatus({ analysis: { step, n, total: list.length } }), max);
      await sleep(2000);
    }
  } finally { analyzing = false; setStatus({ analysis: null }); }
}

// Strecke einer einzelnen Aktivität sofort nachladen (für „Letzte Aktivität“ und die Liste)
const polyBusy = new Set();
export async function ensurePoly(id) {
  const a = findAct(id);
  if (!a || a.poly || !a.gid || a.noGps || a.trainer || NO_GPS.has(a.type) || polyBusy.has(id) || fitPaused()) return (a && a.poly) || null;
  const n = a.polyTry || 0;
  if (n && Date.now() - (a.polyAt || 0) < Math.min(7, 2 ** n) * 3600000) return null;
  polyBusy.add(id);
  try { await fillFromFit([id], () => {}, 1); } finally { polyBusy.delete(id); }
  const b = findAct(id);
  return (b && b.poly) || null;
}

// ---------- Zeitreihen ----------
function compactStream(s) {
  const r1x = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    ll: s.ll ? encode(s.ll) : null,
    t: s.t, d: s.d ? s.d.map((v) => Math.round(v)) : null, alt: s.alt ? s.alt.map(r1x) : null,
    hr: s.hr, w: s.w, cad: s.cad ? s.cad.map((v) => (v == null ? null : Math.round(v))) : null,
    v: s.v ? s.v.map(r2) : null, mov: s.mov ? s.mov.map((b) => (b ? 1 : 0)).join('') : null,
    res: s.res, at: s.at,
  };
}
function expandStream(c) { return { ...c, ll: c.ll ? decode(c.ll) : null, mov: c.mov ? [...c.mov].map((x) => x === '1') : null }; }

function gidOf(id) {
  const a = findAct(id);
  if (a && a.gid) return a.gid;
  if (/^gc\d+$/.test(id)) return id.slice(2);
  return null;
}
const noSource = () => new SyncError('no_source', 'Für diese Aktivität gibt es keine Garmin-Aufzeichnung (nur aus Strava übernommen). Zeitreihen sind daher nicht verfügbar.');

const memStreams = {};
export async function loadStreams(id, { fetch: doFetch = true } = {}) {
  if (memStreams[id]) return memStreams[id];
  const local = await kvGet('st:' + id);
  if (local) return (memStreams[id] = expandStream(local));
  const remote = await getDocOnce('streams/' + id);
  if (remote) { kvSet('st:' + id, remote); return (memStreams[id] = expandStream(remote)); }
  if (!doFetch) return null;
  const gid = gidOf(id);
  if (!gid) throw noSource();
  const p = await fit(gid, 'streams', { res: 1000 });
  const s = normalizeStreams(p, 1000);
  if (!s) throw new SyncError('tool_error', 'Keine Zeitreihen für diese Aktivität');
  const c = compactStream(s);
  kvSet('st:' + id, c);
  return (memStreams[id] = expandStream(c));
}
export function hasStreamsCached(id) { return !!memStreams[id]; }

export async function ensurePowerCurve(id) {
  const p = getState().perf[id];
  if (p && p.pc) return p.pc;
  const gid = gidOf(id);
  if (!gid) throw noSource();
  const r = await fit(gid, 'full', { keys: 'time,watts' });
  const pc = powerCurve(r && r.watts, r && r.time);
  patchDoc('perf/' + id, { ...(p || {}), pc: pc || { res: [], step: null }, at: (p && p.at) || Date.now() });
  return pc;
}

export async function ensureFullGrade(id) {
  const p = getState().perf[id];
  if (p && p.gr) return p.gr;
  const gid = gidOf(id);
  if (!gid) throw noSource();
  const r = await fit(gid, 'full', { keys: 'time,distance,altitude' });
  const s = normalizeStreams(r, 'full');
  const gr = s ? compactGrid({ d: s.d, alt: s.alt, t: s.t }) : null;
  if (!gr) throw new SyncError('tool_error', 'Keine Höhendaten in voller Auflösung');
  patchDoc('perf/' + id, { ...(p || {}), gr, at: (p && p.at) || Date.now() });
  return gr;
}

export async function ensurePerf(id) {
  const st = getState();
  if (st.perf[id]) return st.perf[id];
  const a = findAct(id);
  if (!a || !a.gid) throw noSource();
  const s = await fit(a.gid, 'summary');
  const t = perfFromSummary(a, s);
  setDoc('perf/' + id, t);
  return t;
}

export async function ensureStrength(id) {
  const st = getState();
  if (st.strength[id]) return st.strength[id];
  const gid = gidOf(id);
  if (!gid) throw noSource();
  const r = await fit(gid, 'sets');
  const doc = { sets: (r && r.sets) || [], src: 'garmin', at: Date.now() };
  setDoc('strength/' + id, doc);
  return doc;
}

// Kennzahlen je Sportart aus voller Auflösung (z. B. Abfahrten und Liftfahrten beim Snowboarden)
export async function ensureFullSummary(id) {
  const p = getState().perf[id];
  if (p && p.sum && p.sum.full) return p.sum;
  const a = findAct(id);
  const gid = gidOf(id);
  if (!a || !gid) throw noSource();
  const r = await fit(gid, 'full', { keys: 'time,distance,altitude' });
  const s = normalizeStreams(r, 'full');
  if (!s) throw new SyncError('tool_error', 'Keine Zeitreihen in voller Auflösung');
  const sum = actSummary(a, s, { full: true });
  if (sum) patchDoc('perf/' + id, { ...(getState().perf[id] || {}), sum });
  return sum;
}

export const connectStrava = () => sync({});
export const stravaCall = async () => { throw new SyncError('no_mcp', 'In der Web-Version nicht verfügbar'); };
