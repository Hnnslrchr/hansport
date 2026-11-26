// Web-Version: Gesundheitsdaten direkt von Garmin (Personal API) und Withings (eigene OAuth-App).
// Nur gemessene Werte werden übernommen; fehlt etwas, bleibt das Feld leer.
// Berechnet (und so gekennzeichnet): Basiswerte (60-Tage-Mittel) und Fitness/Ermüdung/Form.
import { getState, setDoc, setStatus, derived } from '../store.js';
import { healthDays, healthMeta, todayLocal, timeline, loose, jsonObjects, fromResult, arr } from '../health.js';
import { garmin, api } from './api.js';
import { readiness } from '../coach-logic.js';
import * as AD from '../health.js';

export { healthDays, healthMeta, todayLocal, timeline, loose, jsonObjects, fromResult, arr };

const TZ = 'Europe/Rome';
export class HealthError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

export function explainHealth(e) {
  const c = e && e.code;
  switch (c) {
    case 'garmin_not_configured': return 'Garmin ist noch nicht eingerichtet: GARMIN_API_KEY fehlt in Vercel.';
    case 'garmin_key_invalid': return 'Garmin lehnt den API-Schlüssel ab. Erzeuge in Garmin Connect einen neuen und trage ihn in Vercel ein.';
    case 'garmin_rate_limited': return 'Garmin drosselt gerade. Versuch es gleich noch einmal.';
    case 'withings_not_configured': return 'Withings ist nicht eingerichtet (WITHINGS_CLIENT_ID/SECRET in Vercel).';
    case 'withings_not_connected': return 'Withings ist noch nicht verbunden (Mehr → Einstellungen).';
    case 'unavailable': return 'Keine Verbindung zum Server.';
    case 'no_mcp': return 'Diese Funktion gibt es in der Web-Version nicht.';
    case 'athletedata_key_invalid': return 'athletedata lehnt den Schlüssel ab. Ist das Abo aktiv? Neuen Schlüssel unter athletedata.health/dashboard/mcp erzeugen und in Vercel eintragen.';
    case 'athletedata_not_configured': return 'athletedata ist nicht eingerichtet (ATHLETEDATA_API_KEY in Vercel).';
    case 'athletedata_unavailable': return 'athletedata ist gerade nicht erreichbar.';
    default: return 'Gesundheitsdaten konnten nicht geladen werden' + (e && e.message ? ': ' + String(e.message).slice(0, 140) : '.');
  }
}

// athletedata (optional, eigener Schlüssel): dann laufen Gesundheitsdaten und Coach-Gedächtnis wie in der Claude-Version
// Standard: aus. Einschalten unter Mehr → Datenquellen (braucht ATHLETEDATA_API_KEY in Vercel).
let adOn = null;
export const athletedataWanted = () => !!(((getState().settings || {}).main || {}).sources || {}).athletedata;
export async function athletedataOn() {
  if (!athletedataWanted()) { globalThis.__hsFlags = { ...(globalThis.__hsFlags || {}), athletedata: false }; return false; }
  if (adOn != null) return adOn;
  try { const s = await api('/api/status'); adOn = !!(s.athletedata && s.athletedata.configured); } catch (e) { return false; }
  globalThis.__hsFlags = { ...(globalThis.__hsFlags || {}), athletedata: adOn };
  return adOn;
}
export function setAthletedataUse(on) {
  const cur = (getState().settings || {}).main || {};
  setDoc('settings/main', { ...cur, sources: { ...(cur.sources || {}), athletedata: !!on } });
  adOn = null;
}
export async function adCall(tool, input) {
  if (!(await athletedataOn())) throw new HealthError('no_mcp', 'athletedata ist nicht eingerichtet');
  return AD.adCall(tool, input);
}

// ---------- Helfer ----------
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const localDate = (ts, tz) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz || TZ }).format(new Date(ts));
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const n = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const pos = (v) => (n(v) != null && v > 0 ? v : null);
const m60 = (ms) => (n(ms) == null ? null : Math.round(ms / 60000));
const clean = (o) => { for (const k of Object.keys(o)) { const v = o[k]; if (v == null || (typeof v === 'number' && !isFinite(v)) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(clean(v)).length)) delete o[k]; } return o; };
// "lokale" Zeitstempel (ms) von Garmin: Uhrzeit direkt ablesen
const clockLocal = (ms) => { if (n(ms) == null) return null; const d = new Date(ms); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
const valOf = (o) => (o && typeof o === 'object' ? n(o.value) : n(o));

function* windows(from, to, len) {
  for (let s = from; s <= to; s = addDays(s, len)) { const e = addDays(s, len - 1); yield [s, e > to ? to : e]; }
}

// ---------- Abgleich ----------
let running = null;
export function syncHealth(opts = {}) {
  if (running) return running;
  running = athletedataOn().then(async (on) => {
    if (!on) return doSync(opts);
    try { return await AD.syncHealth(opts); }
    catch (e) {
      // athletedata-Schlüssel ungültig oder Dienst weg: direkt von Garmin (und Withings) holen
      if (/^athletedata|^unauthorized_ad/.test((e && e.code) || '')) { adOn = false; globalThis.__hsFlags = { ...(globalThis.__hsFlags || {}), athletedata: false }; return doSync(opts); }
      throw e;
    }
  }).finally(() => { running = null; });
  return running;
}

async function doSync({ full = false } = {}) {
  const S = getState();
  const meta = (S.meta && S.meta.health) || {};
  const today = todayLocal();
  const fresh = full || !meta.lastSync;
  const from = fresh ? addDays(today, -364) : addDays(meta.lastDay || today, -4);
  setStatus({ healthSyncing: true, healthError: null });
  const days = {};
  const put = (d, patch) => { if (!d) return; const x = days[d] || (days[d] = {}); for (const [k, v] of Object.entries(patch)) if (v != null) x[k] = v && typeof v === 'object' && !Array.isArray(v) && x[k] && typeof x[k] === 'object' ? { ...x[k], ...v } : v; };
  const notes = [];
  let firstErr = null, bbDone = false, slProbe = null, ecgDone = null;
  const step = async (label, fn) => { try { await fn(); } catch (e) { if (['unauthorized', 'garmin_not_configured', 'garmin_key_invalid'].includes(e && e.code)) throw e; firstErr = firstErr || e; notes.push(label + ': ' + explainHealth(e)); } };
  const prog = (t) => setStatus({ healthProgress: t });
  try {
    // 1) Tageswerte (Schritte, Puls, Stress, Body Battery, Kalorien, Atmung)
    await step('Tageswerte', async () => {
      for (const [s, e] of windows(from, today, 360)) {
        const r = await garmin('/usersummary-service/v2/dailysummaries', { startDate: s, endDate: e });
        for (const x of (r && r.data) || []) {
          const d = x && x.calendarDate;
          if (!d) continue;
          const mv = x.movement || {}, hr = x.heartRate || {}, im = x.intensityMinutes || {}, stv = x.stress || {}, bb = x.bodyBattery || {}, cal = x.calories || {}, rp = x.respiration || {};
          const partial = d === today;
          const imv = n(im.moderate) != null || n(im.vigorous) != null ? (im.moderate || 0) + 2 * (im.vigorous || 0) : null;
          put(d, clean({
            rhr: pos(hr.restingValue), steps: valOf(mv.steps), bmr: pos(cal.burnedResting), act: n(cal.burnedActive), burn: partial ? null : pos(cal.burnedTotal),
            respDay: r1(pos(rp.avgValue)),
            g: clean({
              steps: valOf(mv.steps), stepsGoal: mv.steps && n(mv.steps.goal), floors: valOf(mv.floorsAscended),
              stress: pos(stv.avgLevel), stressMax: pos(stv.maxLevel),
              stressMin: clean({ rest: m60(stv.restDurationInMillis), low: m60(stv.lowStressDurationInMillis), med: m60(stv.mediumStressDurationInMillis), high: m60(stv.highStressDurationInMillis) }),
              bbHi: partial ? null : n(bb.maxValue), bbLo: partial ? null : n(bb.minValue), bbLast: n(bb.latestValue) ?? n(bb.endOfDayValue), bbCh: n(bb.chargedValue), bbDr: n(bb.drainedValue),
              im: imv, imGoal: n(im.goal), hrMax: pos(hr.maxValue), hrMin: pos(hr.minValue), rhrG: pos(hr.restingValue), act: n(cal.burnedActive), partial: partial || null,
            }),
            src: { rhr: 'garmin', steps: 'garmin' },
          }));
        }
      }
      prog('Tageswerte');
    });

    // 2) Schlaf (max. 31 Tage je Abfrage)
    await step('Schlaf', async () => {
      for (const [s, e] of windows(from, today, 28)) {
        const r = await garmin('/sleep-service/sleep/dailySleepSummariesByDate', { startDate: s, endDate: e });
        const list = Array.isArray(r) ? r : (r && (r.dailySleepDTOList || r.data)) || [];
        for (const x of list) {
          if (!x || !x.calendarDate || !pos(x.sleepTimeSeconds)) continue;
          const m = (v) => (n(v) == null ? null : Math.round(v / 60));
          const sc = x.sleepScores && x.sleepScores.overall;
          const total = m(x.sleepTimeSeconds);
          put(x.calendarDate, clean({
            slMin: total, slScore: sc ? n(sc.value) : null, need: x.sleepNeed ? pos(x.sleepNeed.actual) ?? pos(x.sleepNeed.baseline) : null,
            resp: r1(pos(x.averageRespirationValue)),
            sl: clean({ deep: m(x.deepSleepSeconds), light: m(x.lightSleepSeconds), rem: m(x.remSleepSeconds), awake: m(x.awakeSleepSeconds), total, score: sc ? n(sc.value) : null, start: clockLocal(x.sleepStartTimestampLocal), end: clockLocal(x.sleepEndTimestampLocal), respA: r1(pos(x.averageRespirationValue)), spo2: r1(pos(x.averageSpO2Value)), spo2Min: pos(x.lowestSpO2Value), hr: pos(x.avgHeartRate) }),
            src: { sleep: 'garmin', resp: 'garmin' },
          }));
        }
        prog('Schlaf bis ' + e);
      }
    });

    // 2b) Phasenverlauf: Laut Garmins Spezifikation liefert die Personal API je Nacht nur die Summen je Phase.
    // Einmal je 30 Tage prüfen, ob die Einzelabfrage doch einen Verlauf (sleepLevels) enthält; wenn ja, für die letzten Nächte übernehmen.
    await step('Schlafphasen', async () => {
      const pr = meta.slProbe || {};
      if (pr.at && !pr.has && Date.now() - pr.at < 30 * 864e5) return;
      const nights = Object.keys(days).filter((d) => days[d].sl && days[d].sl.total).sort().slice(-3).reverse();
      let has = false;
      for (const d of nights) {
        const x = await garmin('/sleep-service/sleep/dailySleep', { date: d });
        const tl = levelsTimeline(x);
        if (tl) { put(d, { sl: { ...(days[d].sl || {}), tl } }); has = true; } else if (!has) break;
      }
      slProbe = { at: Date.now(), has };
    });

    // 3) HRV (Nachtmittel) und Garmins Normalbereich
    await step('HRV', async () => {
      for (const [s, e] of windows(from, today, 28)) {
        const r = await garmin('/hrv-service/hrv/daily/' + s + '/' + e);
        for (const x of (r && r.hrvSummaries) || []) {
          if (!x || !x.calendarDate) continue;
          const b = x.baseline || {};
          put(x.calendarDate, clean({ hrv: pos(x.lastNightAvg), hrvG: clean({ wk: pos(x.weeklyAvg), lo: pos(b.balancedLow), hi: pos(b.balancedUpper), st: x.status || null }), src: { hrv: 'garmin' } }));
        }
        prog('HRV bis ' + e);
      }
    });

    // 4) VO2max (Rad und allgemein) und Fitnessalter
    await step('VO2max', async () => {
      for (const [s, e] of windows(from, today, 90)) {
        const r = await garmin('/metrics-service/metrics/maxmet/daily/' + s + '/' + e);
        for (const x of Array.isArray(r) ? r : []) {
          const cy = x && x.cycling, ge = x && x.generic;
          const d = (cy && cy.calendarDate) || (ge && ge.calendarDate);
          if (!d) continue;
          const vc = cy ? pos(cy.vo2MaxPreciseValue) ?? pos(cy.vo2MaxValue) : null, vg = ge ? pos(ge.vo2MaxPreciseValue) ?? pos(ge.vo2MaxValue) : null;
          put(d, clean({ vo2: r1(vc ?? vg), vo2Run: vc != null && vg != null && Math.abs(vc - vg) > 0.05 ? r1(vg) : null }));
        }
      }
      const fa = await garmin('/fitnessage-service/fitnessage/v2/' + today);
      if (fa && pos(fa.fitnessAge)) put(today, { fitAge: r1(fa.fitnessAge) });
    });

    // 5) Body Battery beim Aufwachen (nur Einzeltage, daher die letzten Tage)
    await step('Body Battery', async () => {
      const bFrom = fresh || !meta.bb30 ? addDays(today, -29) : from;
      for (let d = bFrom; d <= today; d = addDays(d, 1)) {
        const x = await garmin('/usersummary-service/usersummary/daily', { calendarDate: d });
        if (x && !x._empty) put(d, { g: clean({ bbWake: n(x.bodyBatteryAtWakeTime), bbHi: d === today ? null : n(x.bodyBatteryHighestValue), bbLo: d === today ? null : n(x.bodyBatteryLowestValue) }) });
      }
      bbDone = true;
    });

    // 6) Gewicht aus Garmin Connect (falls dort erfasst)
    await step('Gewicht Garmin', async () => {
      const r = await garmin('/weight-service/weight/range/' + from + '/' + today, { includeAll: true });
      for (const x of (r && r.dailyWeightSummaries) || []) {
        const w = x && x.latestWeight;
        if (!w || !pos(w.weight)) continue;
        const d = x.summaryDate || w.calendarDate;
        const kg = (g) => (pos(g) ? r1(g > 1000 ? g / 1000 : g) : null);
        put(d, { gw: clean({ weight: kg(w.weight), fatPct: r1(pos(w.bodyFat)), muscle: kg(w.muscleMass), bone: kg(w.boneMass), water: r1(pos(w.bodyWater)), src: w.sourceType || null }) });
      }
    });

    // 7) Withings (wenn verbunden)
    await step('Withings', async () => {
      const ws = await api('/api/withings?a=status');
      if (!ws.configured || !ws.connected) return;
      const wFrom = fresh ? addDays(today, -730) : addDays(meta.lastDay || today, -10);
      const toTs = Math.floor(Date.now() / 1000) + 3600;
      const r = await api('/api/withings?a=meas&from=' + Math.floor(new Date(wFrom + 'T00:00:00Z').getTime() / 1000) + '&to=' + toTs);
      const T = { 1: 'weight', 6: 'fatPct', 8: 'fatKg', 76: 'muscle', 88: 'bone', 77: 'water', 170: 'visceral', 226: 'bmr', 91: 'pwv', 155: 'vasc', 11: 'pulse', 10: 'sys', 9: 'dia' };
      const groups = ((r && r.groups) || []).slice().sort((a, b) => a.date - b.date);
      for (const g of groups) {
        const d = localDate(g.date * 1000, g.tz || TZ);
        const o = {};
        for (const m of g.measures) if (T[m.type]) o[T[m.type]] = ['bmr', 'pulse', 'sys', 'dia'].includes(T[m.type]) ? Math.round(m.v) : r1(m.v);
        if (Object.keys(o).length) put(d, { wi: { ...((days[d] && days[d].wi) || {}), ...o, t: new Date(g.date * 1000).toISOString() } });
      }
      prog('Withings');
    });

    // EKG der Waage (Body Scan): Ergebnis laut Withings, Puls, Intervalle; beim ersten Mal 2 Jahre zurück
    await step('Withings EKG', async () => {
      const ws = await api('/api/withings?a=status');
      if (!ws.configured || !ws.connected) return;
      const eFrom = fresh || !meta.ecg ? addDays(today, -730) : addDays(meta.lastDay || today, -10);
      const toTs = Math.floor(Date.now() / 1000) + 3600;
      const r = await api('/api/withings?a=heart&from=' + Math.floor(new Date(eFrom + 'T00:00:00Z').getTime() / 1000) + '&to=' + toTs);
      const E = {};
      for (const x of ((r && r.records) || []).slice().sort((a, b) => a.t - b.t)) {
        const d = localDate(x.t * 1000, x.tz || TZ);
        const prev = E[d];
        E[d] = { t: new Date(x.t * 1000).toISOString(), afib: x.afib, hr: x.hr != null ? Math.round(x.hr) : null, sid: x.sid, n: (prev ? prev.n : 0) + 1 };
      }
      const IV = { 135: 'qrs', 136: 'pr', 137: 'qt', 138: 'qtc' };
      for (const g of (r && r.intervals) || []) {
        const d = localDate(g.date * 1000, g.tz || TZ);
        for (const m of g.measures) if (IV[m.type] && m.v > 0) (E[d] = E[d] || { n: 0 })[IV[m.type]] = Math.round(m.v < 5 ? m.v * 1000 : m.v);
      }
      for (const [d, e] of Object.entries(E)) put(d, { wi: { ...((days[d] && days[d].wi) || {}), ecg: e } });
      ecgDone = { at: Date.now(), n: Object.keys(E).length, iv: r && r.note ? 0 : 1 };
      prog('Withings EKG');
    });

    if (!Object.keys(days).length && firstErr) throw new HealthError(firstErr.code || 'unknown', notes.join(' · '));

    // Speichern: je Monat ein Dokument, vorhandene Tage zusammenführen (Unterobjekte ebenfalls)
    const merged = mergeDays(days);
    // Top-Werte Gewicht: Withings vor Garmin
    for (const d of Object.keys(days)) {
      const x = merged[d];
      const wi = x.wi, gw = x.gw;
      if (wi && wi.weight != null) { x.weight = wi.weight; if (wi.fatPct != null) x.fat = wi.fatPct; x.src = { ...(x.src || {}), weight: 'withings' }; }
      else if (gw && gw.weight != null) { x.weight = gw.weight; if (gw.fatPct != null) x.fat = gw.fatPct; x.src = { ...(x.src || {}), weight: 'garmin' }; }
      if (x.resp == null && x.respDay != null) x.resp = x.respDay;
    }
    const pmc = deriveAll(merged, today);
    writeDirty(merged);
    const allDays = Object.keys(days).sort();
    setDoc('meta/health', clean({
      v: 8, src: 'garmin', lastSync: Date.now(), lastDay: allDays.length ? allDays[allDays.length - 1] : (meta.lastDay || today),
      pmc: pmc || meta.pmc || null, bb30: meta.bb30 || bbDone || null, ecg: ecgDone || meta.ecg || null, slProbe: slProbe || meta.slProbe || null,
      notes: notes.length ? notes.slice(0, 5) : null,
    }));
    setStatus({ healthSyncing: false, healthProgress: null });
    return { days: allDays.length };
  } catch (e) {
    setStatus({ healthSyncing: false, healthProgress: null, healthError: explainHealth(e) });
    throw e;
  }
}

// Neue Tageswerte mit dem Bestand zusammenführen; Unterobjekte (Schlaf, Garmin, Withings …) feldweise
function mergeDays(add) {
  const H = healthDays().map;
  const out = {};
  for (const [d, row] of Object.entries(H)) { const { date, ...rest } = row; out[d] = { ...rest }; }
  for (const [d, v] of Object.entries(add)) {
    const cur = out[d] || {};
    const next = { ...cur };
    for (const [k, val] of Object.entries(v)) next[k] = val && typeof val === 'object' && !Array.isArray(val) && cur[k] && typeof cur[k] === 'object' ? { ...cur[k], ...val } : val;
    next.__dirty = true;
    out[d] = next;
  }
  return out;
}

// Schlafphasen-Verlauf aus einer Garmin-Antwort (falls vorhanden): sleepLevels [{ startGMT, endGMT, activityLevel }]
// activityLevel 0 = Tief, 1 = Leicht, 2 = REM, 3 = Wach. Ergebnis im Format der App: { s0: lokale Minuten, seg: [[Phase, von, bis]] }
function levelsTimeline(x) {
  if (!x || typeof x !== 'object') return null;
  const lv = Array.isArray(x.sleepLevels) ? x.sleepLevels : null;
  if (!lv || lv.length < 2) return null;
  const dto = x.dailySleepDTO || x;
  const t = (v) => (typeof v === 'number' ? v : v ? Date.parse(String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z')) : NaN);
  const off = isFinite(t(dto.sleepStartTimestampLocal)) && isFinite(t(dto.sleepStartTimestampGMT)) ? t(dto.sleepStartTimestampLocal) - t(dto.sleepStartTimestampGMT) : 0;
  const ST = { 0: 'd', 1: 'l', 2: 'r', 3: 'a' };
  const segs = lv.map((q) => [ST[Math.round(q.activityLevel)], t(q.startGMT), t(q.endGMT)]).filter((q) => q[0] && isFinite(q[1]) && q[2] > q[1]).sort((a, b) => a[1] - b[1]);
  if (segs.length < 2) return null;
  const t0 = segs[0][1];
  const d = new Date(t0 + off);
  return { s0: d.getUTCHours() * 60 + d.getUTCMinutes(), seg: segs.map((q) => [q[0], Math.round((q[1] - t0) / 6e4), Math.round((q[2] - t0) / 6e4)]) };
}

function writeDirty(merged) {
  const byMonth = {};
  for (const d of Object.keys(merged)) if (merged[d].__dirty) (byMonth[d.slice(0, 7)] || (byMonth[d.slice(0, 7)] = {}))[d] = merged[d];
  for (const [ym, add] of Object.entries(byMonth)) {
    const cur = (getState().health[ym] && getState().health[ym].days) || {};
    const next = { ...cur };
    for (const [d, v] of Object.entries(add)) { const { __dirty, ...rest } = v; next[d] = rest; }
    setDoc('health/' + ym, { days: next });
  }
}

// Alles, was hansport selbst berechnet: Normalbereiche, Belastung (Fitness/Ermüdung/Form) und Bereitschaft
function deriveAll(all, today) {
  migrateAthletedata(all);
  computeBaselines(all);
  const pmc = computePmc(all, today);
  for (const d of Object.keys(all)) {
    const x = all[d];
    const R = readiness({ map: all }, d);
    const v = R && R.date === d ? R.score : null, k = R && R.date === d ? R.level.k : null;
    if ((x.rdy ?? null) !== v || (x.rdyK ?? null) !== k) { if (v == null) { delete x.rdy; delete x.rdyK; } else { x.rdy = v; x.rdyK = k; } x.__dirty = true; }
  }
  return pmc;
}

// Nach einem Aktivitäten-Abgleich: Belastung und Bereitschaft neu rechnen (ohne Abruf)
export function recomputeHealth() {
  const H = healthDays().map;
  if (!Object.keys(H).length) return null;
  const all = {};
  for (const [d, row] of Object.entries(H)) { const { date, ...rest } = row; all[d] = { ...rest }; }
  const pmc = deriveAll(all, todayLocal());
  writeDirty(all);
  const meta = (getState().meta && getState().meta.health) || {};
  if ((pmc && JSON.stringify(pmc) !== JSON.stringify(meta.pmc)) || meta.v !== 8) setDoc('meta/health', { ...meta, v: 8, pmc: pmc || meta.pmc || null });
  return pmc;
}

// Frühere athletedata-Werte bleiben erhalten, werden aber nicht mehr angezeigt (eigene Felder)
function migrateAthletedata(all) {
  for (const x of Object.values(all)) {
    if (x.base && !x.baseOwn && !x.adBase) { x.adBase = x.base; x.__dirty = true; }
    if (x.ctl != null && !(x.src && x.src.pmc === 'hansport') && !x.adPmc) { x.adPmc = { ctl: x.ctl, atl: x.atl, tsb: x.tsb, load: x.load ?? null }; x.__dirty = true; }
  }
}

// Normalbereiche (Mittel ± 1 SD) aus eigenen Messwerten: 90 Tage für die Anzeige, 60 Tage für die Bereitschaft
const BKEYS = { hrv: (r) => r.hrv, rhr: (r) => r.rhr, resp: (r) => r.resp, bb: (r) => (r.g ? r.g.bbWake : null) };
const dayNo = (s) => Math.round(Date.parse(s + 'T12:00:00Z') / 864e5);
function computeBaselines(all) {
  const dates = Object.keys(all).sort();
  if (!dates.length) return;
  const n0 = dayNo(dates[0]), N = dayNo(dates[dates.length - 1]) - n0 + 1;
  const vals = {};
  for (const [k, get] of Object.entries(BKEYS)) { const a = new Array(N).fill(null); for (const d of dates) { const q = get(all[d]); if (q != null && isFinite(q)) a[dayNo(d) - n0] = q; } vals[k] = a; }
  const stat = (a, i, n) => { let c = 0, s1 = 0, s2 = 0; for (let j = Math.max(0, i - n); j < i; j++) { const q = a[j]; if (q != null) { c++; s1 += q; s2 += q * q; } } if (c < 10) return null; const mu = s1 / c; const sd = Math.sqrt(Math.max(0, (s2 - c * mu * mu) / (c - 1))); return [r1(mu), r1(sd), c]; };
  for (const d of dates) {
    const x = all[d], i = dayNo(d) - n0;
    const base = {}, rb = {};
    for (const k of Object.keys(BKEYS)) {
      if (k !== 'bb') { const b = stat(vals[k], i, 90); if (b) base[k] = b; }
      const q = stat(vals[k], i, 60); if (q) rb[k] = q;
    }
    const nb = Object.keys(base).length ? base : null, nr = Object.keys(rb).length ? rb : null;
    if (JSON.stringify(x.base || null) !== JSON.stringify(nb) || !x.baseOwn) { if (nb) x.base = nb; else delete x.base; x.baseOwn = 1; x.__dirty = true; }
    if (JSON.stringify(x.rb || null) !== JSON.stringify(nr)) { if (nr) x.rb = nr; else delete x.rb; x.__dirty = true; }
  }
}

// Belastung je Aktivität: Strava Relative Effort; ohne ihn pulsbasiert (TRIMP nach Banister),
// auf die Relative-Effort-Skala geeicht über Aktivitäten, die beides haben. Ohne Puls: Garmin-Trainingslast, ebenso geeicht.
export function activityLoads(acts, all) {
  const z = ((getState().meta.zones || {}).hist || []).slice(-1)[0] || {};
  const rhrs = Object.values(all).map((r) => r.rhr).filter((v) => v != null).sort((a, b) => a - b);
  const rest = z.rest || (rhrs.length ? rhrs[Math.floor(rhrs.length / 2)] : 50);
  const hmax = z.max || Math.max(185, ...acts.map((a) => a.hrMax || 0).filter((v) => v < 230));
  const trimp = (a) => { if (a.hrAvg == null || !(a.mov > 300)) return null; const f = Math.max(0, Math.min(1, (a.hrAvg - rest) / (hmax - rest))); return (a.mov / 60) * f * 0.64 * Math.exp(1.92 * f); };
  const med = (v) => { v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const rT = [], rG = [];
  for (const a of acts) { if (a.re > 3) { const t = trimp(a); if (t > 3) rT.push(a.re / t); if (a.load > 3) rG.push(a.re / a.load); } }
  const kT = rT.length >= 8 ? Math.min(4, Math.max(0.25, med(rT))) : 1, kG = rG.length >= 8 ? Math.min(4, Math.max(0.1, med(rG))) : 1;
  const out = {}, kcal = {};
  let nRe = 0, nHr = 0, nG = 0;
  for (const a of acts) {
    if (a.excluded || !a.date) continue;
    if (a.cal > 0) kcal[a.date] = (kcal[a.date] || 0) + a.cal;
    let l = null;
    if (a.re != null) { l = a.re; nRe++; }
    else { const t = trimp(a); if (t != null) { l = t * kT; nHr++; } else if (a.load != null) { l = a.load * kG; nG++; } }
    if (l != null) out[a.date] = (out[a.date] || 0) + l;
  }
  return { byDay: out, kcal, kT: Math.round(kT * 100) / 100, kG: Math.round(kG * 100) / 100, nRe, nHr, nG, calib: rT.length, rest, hmax };
}

// Fitness (42 Tage), Ermüdung (7 Tage), Form = Fitness − Ermüdung, vollständig aus den eigenen Aktivitäten
function computePmc(all, today) {
  const acts = derived().list.filter((a) => a.src === 'strava');
  const L = activityLoads(acts, all);
  const days = Object.keys(L.byDay).sort();
  if (!days.length) return null;
  let d = days[0] < addDays(today, -730) ? addDays(today, -730) : days[0];
  let ctl = 0, atl = 0;
  const hist = [];
  for (; d <= today; d = addDays(d, 1)) {
    const l = L.byDay[d] || 0;
    ctl += (l - ctl) / 42; atl += (l - atl) / 7;
    const x = all[d] || (all[d] = {});
    const nv = { ctl: r1(ctl), atl: r1(atl), tsb: r1(ctl - atl), load: r1(l), akcal: Math.round(L.kcal[d] || 0) };
    if (x.ctl !== nv.ctl || x.atl !== nv.atl || x.tsb !== nv.tsb || x.load !== nv.load || x.akcal !== nv.akcal || !(x.src && x.src.pmc === 'hansport')) {
      Object.assign(x, nv); x.src = { ...(x.src || {}), pmc: 'hansport' }; x.__dirty = true;
    }
    hist.push(ctl);
  }
  const c7 = hist.length > 7 ? hist[hist.length - 8] : null;
  const tsb = ctl - atl;
  const form = tsb > 15 ? 'fresh' : tsb > 5 ? 'rested' : tsb > -10 ? 'neutral' : tsb > -30 ? 'optimal' : 'overreached';
  return clean({
    ctl: r1(ctl), atl: r1(atl), tsb: r1(tsb), form, ramp: c7 != null ? r1(ctl - c7) : null, trend: c7 == null ? null : ctl - c7 > 1 ? 'rising' : ctl - c7 < -1 ? 'falling' : 'stable',
    date: today, conf: hist.length >= 42 ? 'medium' : 'low', since: days[0], src: 'hansport',
    n: clean({ re: L.nRe, hr: L.nHr, garmin: L.nG }), k: L.kT, calib: L.calib,
  });
}

// EKG-Kurve einer Withings-Aufnahme laden (nur zur Anzeige, wird nicht gespeichert)
export async function ecgSignal(sid) {
  try { return await api('/api/withings?a=signal&id=' + encodeURIComponent(sid)); } catch (e) { return { ok: false, err: explainHealth(e) }; }
}
