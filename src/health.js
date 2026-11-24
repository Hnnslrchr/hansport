// Gesundheitsdaten über den athletedata-Connector (Garmin, Withings).
// Nur gemessene Werte werden übernommen; fehlt etwas, bleibt das Feld leer.
import { caps } from './platform.js';
import { getState, setDoc, setStatus, toast } from './store.js';

const SERVER = 'athletedata';
const TZ = 'Europe/Rome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HealthError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

export function explainHealth(e) {
  const c = e && e.code;
  switch (c) {
    case 'no_mcp': case 'not_granted': case 'capability_disabled': case 'capability_removed':
      return 'Gesundheitsdaten sind in dieser Ansicht nicht erreichbar. Öffne hansport auf claude.ai.';
    case 'server_not_connected': return 'athletedata ist in Claude nicht verbunden. Füge den Connector unter claude.ai → Einstellungen → Connectors hinzu.';
    case 'needs_reauth': return 'Die athletedata-Verbindung ist abgelaufen. Verbinde sie in Claude neu.';
    case 'approval_required': case 'consent_required': case 'not_in_manifest': return 'hansport braucht deine Erlaubnis für athletedata. Tippe auf Abgleichen und bestätige.';
    case 'server_unavailable': case 'upstream_error': case 'rate_limited': return 'athletedata antwortet gerade nicht. Versuch es gleich noch einmal.';
    case 'tool_error': return 'athletedata meldet: ' + String(e.message || '').slice(0, 160);
    default: return 'Gesundheitsdaten konnten nicht geladen werden' + (e && e.message ? ': ' + String(e.message).slice(0, 140) : '.');
  }
}

// Antworten können Text mit vorangestellten Hinweisen enthalten: das erste vollständige JSON herauslösen
export function loose(p) {
  if (p && typeof p === 'object' && !Array.isArray(p) && p.content && Array.isArray(p.content)) p = p.content.map((c) => c.text || '').join('\n');
  if (typeof p !== 'string') return p;
  try { return JSON.parse(p); } catch (e) { /* weiter */ }
  for (let i = p.indexOf('{'), n = 0; i >= 0 && n < 12; i = p.indexOf('{', i + 1), n++) {
    const end = p.lastIndexOf('}');
    for (let j = end; j > i && j >= end - 2000; j = p.lastIndexOf('}', j - 1)) {
      try { return JSON.parse(p.slice(i, j + 1)); } catch (e) { /* nächster Versuch */ }
    }
  }
  return { _text: p };
}

// Alle vollständigen JSON-Objekte in einem Text finden (Klammern zählen, Strings beachten)
export function jsonObjects(text) {
  const out = [];
  for (let i = 0; i < text.length && out.length < 8; i++) {
    const c0 = text[i];
    if (c0 !== '{' && c0 !== '[') continue;
    let depth = 0, inStr = false, esc = false, j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (depth === 0) break; }
    }
    if (depth === 0 && j < text.length) {
      try { out.push(JSON.parse(text.slice(i, j + 1))); i = j; continue; } catch (e) { /* kein JSON */ }
    }
  }
  return out;
}

// Ergebnis lesen: das Objekt wählen, das die erwartete Liste enthält
// (athletedata stellt manchen Antworten Hinweistexte voran oder hängt sie an)
export function fromResult(r, key) {
  if (!r) return null;
  const cands = [];
  if (r.structuredContent && typeof r.structuredContent === 'object') cands.push(r.structuredContent);
  if (r.payload && typeof r.payload === 'object') cands.push(r.payload);
  const texts = Array.isArray(r.content) ? r.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text) : [];
  if (typeof r.payload === 'string') texts.push(r.payload);
  for (const t of texts) for (const o of jsonObjects(t)) cands.push(o);
  // athletedata liefert je nach Umfang ein Objekt ({records:[…], truncated}) oder direkt eine Liste ([…])
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const isList = (o) => Array.isArray(o) && (o.length === 0 || (o[0] && typeof o[0] === 'object'));
  return (key && cands.find((o) => isObj(o) && Array.isArray(o[key])))
    || cands.find((o) => isList(o) && o.length)
    || cands.find(isObj)
    || cands.find(isList)
    || (texts.length ? { _text: texts.join('\n') } : null);
}

const KEY = { get_daily_metrics: 'rows', garmin_get_sleep: 'records', garmin_get_daily_summaries: 'records', garmin_get_user_metrics: 'records', withings_get_measurements: 'measurements' };
async function call(tool, input, retry = true) {
  const cp = await caps();
  if (!cp.mcp) throw new HealthError('no_mcp');
  try {
    const r = await cp.mcp.callTool(SERVER, tool, input || {}, { cache: false });
    return fromResult(r, KEY[tool]);
  } catch (e) {
    if (retry && e && e.retryable) { await sleep(Math.min(e.retryAfterMs || 1500, 15000)); return call(tool, input, false); }
    throw new HealthError(e && e.code ? e.code : 'unknown', e && e.message);
  }
}

// Allgemeiner athletedata-Aufruf (für den Coach): Ergebnis als Objekt
export async function adCall(tool, input) { return call(tool, input); }

// Listen robust lesen: nur echte Arrays, sonst das erste Array mit Datumsfeldern im Objekt
export function arr(r, key) {
  if (!r || typeof r !== 'object') return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r[key])) return r[key];
  for (const v of Object.values(r)) if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && ('calendarDate' in v[0] || 'date' in v[0])) return v;
  return [];
}

// ---------- Datumshilfen ----------
const iso = (d) => d.toISOString().slice(0, 10);
export const todayLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
const localDate = (ts, tz) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz || TZ }).format(new Date(ts));
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const clockOf = (sec, off) => { const d = new Date((sec + (off || 0)) * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
const clean = (o) => { for (const k of Object.keys(o)) { const v = o[k]; if (v == null || (typeof v === 'number' && !isFinite(v)) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(clean(v)).length)) delete o[k]; } return o; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// ---------- Abgleich ----------
let running = null;
// Schlafphasen-Zeitleiste kompakt: Start (lokale Minuten seit Mitternacht des Einschlaftags) und [Phase, von, bis] in Minuten ab Start
const STAGE = { deep: 'd', light: 'l', rem: 'r', awake: 'a' };
export function timeline(x) {
  const map = x && x.sleepLevelsMap;
  if (!map || x.startTimeInSeconds == null) return null;
  const t0 = x.startTimeInSeconds, off = x.startTimeOffsetInSeconds || 0;
  const segs = [];
  for (const k of Object.keys(STAGE)) for (const r of map[k] || []) {
    if (r && r.startTimeInSeconds != null && r.endTimeInSeconds > r.startTimeInSeconds) segs.push([STAGE[k], Math.round((r.startTimeInSeconds - t0) / 60), Math.round((r.endTimeInSeconds - t0) / 60)]);
  }
  if (!segs.length) return null;
  segs.sort((a, b) => a[1] - b[1]);
  const d = new Date((t0 + off) * 1000);
  return { s0: d.getUTCHours() * 60 + d.getUTCMinutes(), seg: segs };
}

export function syncHealth(opts = {}) {
  if (running) return running;
  running = doSync(opts).finally(() => { running = null; });
  return running;
}

async function doSync({ full = false } = {}) {
  const S = getState();
  const meta = (S.meta && S.meta.health) || {};
  const today = todayLocal();
  const first = full || !meta.lastSync || meta.v !== 5;
  const from = first ? addDays(today, -365) : addDays((meta.lastDay || today), -4);
  const gFrom = first ? addDays(today, -60) : addDays((meta.lastDay || today), -4);
  setStatus({ healthSyncing: true, healthError: null });
  const days = {};
  const put = (d, patch) => { const x = days[d] || (days[d] = {}); for (const [k, v] of Object.entries(patch)) if (v != null) x[k] = v; };
  const notes = [];
  try {
    // 1) Zusammengeführte Tageswerte inkl. Fitness/Form (athletedata)
    let cursor, pages = 0, firstErr = null;
    const msg = (err) => (err && err.code && err.code !== 'unknown' ? explainHealth(err) : String((err && err.message) || err));
    try { do {
      const r = await call('get_daily_metrics', cursor ? { start: from, end: today, cursor } : { start: from, end: today });
      for (const x of arr(r, 'rows')) {
        if (!x || !x.date) continue;
        const b = x.baselineSpread || {};
        put(x.date, clean({
          ctl: x.ctl, atl: x.atl, tsb: x.tsb, load: x.dailyLoad,
          rhr: x.restingHr, hrv: x.hrv, steps: x.steps, resp: r1(x.respiratoryRate), weight: x.weight, fat: x.bodyFat,
          slMin: x.sleepDurationMin, slScore: x.sleepScore, need: x.sleepNeedMin, debt: x.sleepDebtMin,
          rec: x.recoveryScore, ready: x.readinessScoreV2, verdict: x.readinessVerdict,
          bmr: x.bmrKcal, act: x.activeKcal, burn: x.burnPartial ? null : x.burnKcal,
          base: clean({ hrv: b.hrv && [r1(b.hrv.mean), r1(b.hrv.sd), b.hrv.n], rhr: b.restingHr && [r1(b.restingHr.mean), r1(b.restingHr.sd), b.restingHr.n], resp: b.respiratoryRate && [r1(b.respiratoryRate.mean), r1(b.respiratoryRate.sd), b.respiratoryRate.n] }),
          src: clean({ rhr: x.restingHrSource, hrv: x.hrvSource, sleep: x.sleepSource, steps: x.stepsSource, weight: x.weightSource, resp: x.respiratoryRateSource, pmc: x.pmcSource && 'athletedata' }),
          night: x.night_of || null,
        }));
      }
      cursor = r && r.next_cursor;
      pages++;
      setStatus({ healthProgress: 'Tageswerte ' + Object.keys(days).length });
    } while (cursor && pages < 30); } catch (err) { firstErr = firstErr || err; notes.push('Tageswerte: ' + msg(err)); }

    // 2) Garmin-Details in 14-Tage-Fenstern
    for (let s = gFrom; s <= today; s = addDays(s, 7)) {
      const e = addDays(s, 6) > today ? today : addDays(s, 6);
      try {
      const [sl, ds, um] = await Promise.all([
        call('garmin_get_sleep', { start_date: s, end_date: e, limit: 100, include_stage_timeline: true }).catch((err) => { notes.push('Schlafphasen: ' + explainHealth(err)); return null; }),
        call('garmin_get_daily_summaries', { start_date: s, end_date: e, limit: 100 }).catch((err) => { notes.push('Tageswerte Garmin: ' + explainHealth(err)); return null; }),
        call('garmin_get_user_metrics', { start_date: s, end_date: e, limit: 100 }).catch(() => null),
      ]);
      for (const x of arr(sl, 'records')) {
        if (!x || !x.calendarDate || (x.deepSleepDurationInSeconds == null && x.lightSleepDurationInSeconds == null)) continue;
        const m = (v) => (v == null ? null : Math.round(v / 60));
        put(x.calendarDate, { sl: clean({ deep: m(x.deepSleepDurationInSeconds), light: m(x.lightSleepDurationInSeconds), rem: m(x.remSleepInSeconds), awake: m(x.awakeDurationInSeconds), total: m(x.durationInSeconds), score: x.overallSleepScore && x.overallSleepScore.value, start: x.startTimeInSeconds != null ? clockOf(x.startTimeInSeconds, x.startTimeOffsetInSeconds) : null, end: x.startTimeInSeconds != null && x.durationInSeconds ? clockOf(x.startTimeInSeconds + x.durationInSeconds + (x.awakeDurationInSeconds || 0), x.startTimeOffsetInSeconds) : null, respA: x.sleepRespirationSummary && r1(x.sleepRespirationSummary.avg), spo2: x.sleepSpo2Summary && r1(x.sleepSpo2Summary.avg), spo2Min: x.sleepSpo2Summary && x.sleepSpo2Summary.min, tl: timeline(x) }) });
      }
      for (const x of arr(ds, 'records')) {
        if (!x || !x.calendarDate) continue;
        put(x.calendarDate, { g: clean({
          steps: x.steps, stepsGoal: x.stepsGoal, floors: x.floorsClimbed, stress: x.averageStressLevel > 0 ? x.averageStressLevel : null, stressMax: x.maxStressLevel,
          stressMin: clean({ rest: m60(x.restStressDurationInSeconds), low: m60(x.lowStressDurationInSeconds), med: m60(x.mediumStressDurationInSeconds), high: m60(x.highStressDurationInSeconds) }),
          bbWake: x.bodyBatteryAtWakeTime, bbHi: x.is_partial_day ? null : x.bodyBatteryHighestValue, bbLo: x.is_partial_day ? null : x.bodyBatteryLowestValue, bbLast: x.bodyBatteryLatestValue, bbCh: x.bodyBatteryChargedValue, bbDr: x.bodyBatteryDrainedValue,
          im: x.intensity_minutes, imGoal: x.intensityDurationGoalInSeconds ? Math.round(x.intensityDurationGoalInSeconds / 60) : null,
          hrMax: x.maxHeartRateInBeatsPerMinute, hrMin: x.minHeartRateInBeatsPerMinute, rhrG: x.restingHeartRateInBeatsPerMinute, hrAvg: x.averageHeartRateInBeatsPerMinute, act: x.activeKilocalories, partial: x.is_partial_day || null,
        }) });
      }
      for (const x of arr(um, 'records')) if (x && x.calendarDate) put(x.calendarDate, clean({ vo2: x.vo2MaxCycling || x.vo2Max, vo2Run: x.vo2MaxCycling && x.vo2Max && x.vo2Max !== x.vo2MaxCycling ? x.vo2Max : null, fitAge: x.fitnessAge }));
      } catch (err) { firstErr = firstErr || err; notes.push('Garmin ' + s + ': ' + msg(err)); }
      setStatus({ healthProgress: 'Garmin bis ' + e });
    }

    // 3) Withings: Gewicht und Körperzusammensetzung
    const wFrom = first ? addDays(today, -730) : addDays(meta.lastDay || today, -10);
    for (let ws = wFrom; ws <= today; ws = addDays(ws, 92)) try {
      const we = addDays(ws, 92) > today ? addDays(today, 1) : addDays(ws, 92);
      let w;
      try { w = await call('withings_get_measurements', { startdate: ws, enddate: we }); }
      catch (err) { if (err && (err.code === 'tool_error' || err.code === 'server_unavailable')) { await sleep(2500); w = await call('withings_get_measurements', { startdate: ws, enddate: we }); } else throw err; }
      setStatus({ healthProgress: 'Withings bis ' + we });
      for (const x of arr(w, 'measurements')) {
        if (!x || !x.date) continue;
        const d = localDate(x.date, x.timezone);
        const o = clean({ weight: r1(x.weight_kg), fatPct: r1(x.fat_ratio_pct), fatKg: r1(x.fat_mass_kg), muscle: r1(x.muscle_mass_kg), bone: r1(x.bone_mass_kg), water: r1(x.hydration_kg), visceral: r1(x.visceral_fat_index), bmr: x.basal_metabolic_rate, pwv: r1(x.pulse_wave_velocity), vasc: r1(x.vascular_age), pulse: x.heart_pulse, sys: x.systolic_blood_pressure, dia: x.diastolic_blood_pressure });
        if (Object.keys(o).length) put(d, { wi: { ...((days[d] && days[d].wi) || {}), ...o, t: x.date } });
      }
    } catch (err) { firstErr = firstErr || err; notes.push('Withings: ' + msg(err)); }

    // 4) Aktueller Stand Fitness/Form
    let pmc = null;
    try { pmc = await call('get_pmc_status', {}); } catch (err) { /* optional */ }

    if (!Object.keys(days).length && firstErr) throw new HealthError(firstErr.code || 'unknown', notes.join(' · '));
    // Speichern: je Monat ein Dokument, vorhandene Tage zusammenführen
    const byMonth = {};
    for (const [d, v] of Object.entries(days)) (byMonth[d.slice(0, 7)] || (byMonth[d.slice(0, 7)] = {}))[d] = v;
    for (const [ym, add] of Object.entries(byMonth)) {
      const cur = (getState().health[ym] && getState().health[ym].days) || {};
      const merged = { ...cur };
      for (const [d, v] of Object.entries(add)) merged[d] = { ...(cur[d] || {}), ...v };
      await setDoc('health/' + ym, { days: merged });
    }
    const allDays = Object.keys(days).sort();
    await setDoc('meta/health', clean({
      v: 5, lastSync: Date.now(), lastDay: allDays.length ? allDays[allDays.length - 1] : today,
      pmc: pmc && pmc.available !== false ? clean({ ctl: pmc.ctl, atl: pmc.atl, tsb: pmc.tsb, form: pmc.form_status, trend: pmc.fitness_trend, ramp: pmc.ramp_rate, date: pmc.date, conf: pmc.data_confidence && pmc.data_confidence.overall, since: pmc.data_confidence && pmc.data_confidence.history_start }) : (meta.pmc || null),
      notes: notes.length ? notes.slice(0, 5) : null,
    }));
    setStatus({ healthSyncing: false, healthProgress: null });
    return { days: allDays.length };
  } catch (e) {
    setStatus({ healthSyncing: false, healthProgress: null, healthError: explainHealth(e) });
    throw e;
  }
}
function m60(v) { return v == null ? null : Math.round(v / 60); }

// ---------- Lesen ----------
let cache = { v: null, list: [], map: {} };
export function healthDays() {
  const H = getState().health;
  if (cache.v === H) return cache;
  const map = {};
  for (const doc of Object.values(H)) Object.assign(map, (doc && doc.days) || {});
  const list = Object.keys(map).sort().map((d) => ({ date: d, ...map[d] }));
  cache = { v: H, list, map };
  return cache;
}
// Nur die Web-Version rechnet Belastung und Bereitschaft selbst nach
export const recomputeHealth = () => null;
export const ecgSignal = async () => ({ ok: false });
export const healthMeta = () => (getState().meta && getState().meta.health) || {};
