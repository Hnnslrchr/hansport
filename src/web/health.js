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
let adOn = null;
export async function athletedataOn() {
  if (adOn != null) return adOn;
  try { const s = await api('/api/status'); adOn = !!(s.athletedata && s.athletedata.configured); } catch (e) { return false; }
  globalThis.__hsFlags = { ...(globalThis.__hsFlags || {}), athletedata: adOn };
  return adOn;
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
  running = athletedataOn().then((on) => (on ? AD.syncHealth(opts) : doSync(opts))).finally(() => { running = null; });
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
  let firstErr = null;
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
      const bFrom = fresh ? addDays(today, -13) : from;
      for (let d = bFrom; d <= today; d = addDays(d, 1)) {
        const x = await garmin('/usersummary-service/usersummary/daily', { calendarDate: d });
        if (x && !x._empty) put(d, { g: clean({ bbWake: n(x.bodyBatteryAtWakeTime), bbHi: d === today ? null : n(x.bodyBatteryHighestValue), bbLo: d === today ? null : n(x.bodyBatteryLowestValue) }) });
      }
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
    computeBaselines(merged, Object.keys(days));
    const pmc = computePmc(merged, today);
    // Erholung/Bereitschaft (berechnet, offengelegt wie im Coach) für Tage ohne athletedata-Wert
    for (const d of Object.keys(merged)) {
      const x = merged[d];
      if (!x.__dirty || x.rec != null) continue;
      const R = readiness({ map: merged }, d);
      if (R && R.date === d) { x.rdy = R.score; x.rdyK = R.level.k; } else { delete x.rdy; delete x.rdyK; }
    }
    // schreiben
    const byMonth = {};
    for (const d of Object.keys(merged)) if (merged[d].__dirty) (byMonth[d.slice(0, 7)] || (byMonth[d.slice(0, 7)] = {}))[d] = merged[d];
    for (const [ym, add] of Object.entries(byMonth)) {
      const cur = (getState().health[ym] && getState().health[ym].days) || {};
      const next = { ...cur };
      for (const [d, v] of Object.entries(add)) { const { __dirty, ...rest } = v; next[d] = rest; }
      setDoc('health/' + ym, { days: next });
    }
    const allDays = Object.keys(days).sort();
    setDoc('meta/health', clean({
      v: 6, src: 'garmin', lastSync: Date.now(), lastDay: allDays.length ? allDays[allDays.length - 1] : (meta.lastDay || today),
      pmc: pmc || meta.pmc || null,
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

// Basiswerte: Mittel, Streuung und Anzahl der 60 Tage davor (gemessene Werte)
function computeBaselines(all, dates) {
  const keys = { hrv: (r) => r.hrv, rhr: (r) => r.rhr, resp: (r) => r.resp };
  for (const d of dates) {
    const x = all[d];
    if (!x) continue;
    const base = {};
    for (const [k, get] of Object.entries(keys)) {
      const v = [];
      for (let i = 1; i <= 60; i++) { const r = all[addDays(d, -i)]; const q = r ? get(r) : null; if (q != null && isFinite(q)) v.push(q); }
      if (v.length >= 10) { const mu = v.reduce((s, y) => s + y, 0) / v.length; const sd = Math.sqrt(v.reduce((s, y) => s + (y - mu) ** 2, 0) / (v.length - 1)); base[k] = [r1(mu), r1(sd), v.length]; }
    }
    if (Object.keys(base).length) { x.base = base; x.__dirty = true; }
  }
}

// Fitness (CTL, 42 Tage), Ermüdung (ATL, 7 Tage), Form (TSB = CTL − ATL) aus der Garmin-Trainingslast.
// Anschluss an die bisherige athletedata-Reihe: Startwerte vom letzten athletedata-Tag, Skalierung über
// den Vergleich beider Belastungswerte in den 120 Tagen davor.
function computePmc(all, today) {
  const loadOf = {};
  const acts = derived().list;
  for (const a of acts) {
    if (a.excluded || !a.date) continue;
    const l = a.load != null ? a.load : null;
    if (l != null) loadOf[a.date] = (loadOf[a.date] || 0) + l;
  }
  const dates = Object.keys(all).sort();
  let anchor = null;
  for (const d of dates) { const x = all[d]; if (x.ctl != null && x.atl != null && !(x.src && x.src.pmc === 'hansport') && d < today) anchor = d; }
  const firstLoad = Object.keys(loadOf).sort()[0];
  if (!anchor && !firstLoad) return null;
  // Skalierung
  let k = 1, pairs = 0;
  if (anchor) {
    const ratios = [];
    for (let i = 0; i < 120; i++) { const d = addDays(anchor, -i); const x = all[d]; const g = loadOf[d]; if (x && x.load > 5 && g > 5) ratios.push(x.load / g); }
    pairs = ratios.length;
    if (ratios.length >= 8) { ratios.sort((a, b) => a - b); k = Math.min(3, Math.max(0.3, ratios[Math.floor(ratios.length / 2)])); }
  }
  let ctl = anchor ? all[anchor].ctl : 0, atl = anchor ? all[anchor].atl : 0;
  let d = anchor ? addDays(anchor, 1) : addDays(firstLoad, -1);
  if (!anchor && addDays(today, -400) > d) d = addDays(today, -400);
  let last = null, prevCtl7 = null;
  const hist = [];
  for (; d <= today; d = addDays(d, 1)) {
    const L = (loadOf[d] || 0) * k;
    ctl += (L - ctl) / 42; atl += (L - atl) / 7;
    const x = all[d] || (all[d] = {});
    x.ctl = r1(ctl); x.atl = r1(atl); x.tsb = r1(ctl - atl); x.load = r1(L);
    x.src = { ...(x.src || {}), pmc: 'hansport' };
    x.__dirty = true;
    hist.push([d, ctl]);
    last = d;
  }
  if (!last) return null;
  const c7 = hist.length > 7 ? hist[hist.length - 8][1] : null;
  const tsb = ctl - atl;
  const form = tsb > 15 ? 'fresh' : tsb > 5 ? 'rested' : tsb > -10 ? 'neutral' : tsb > -30 ? 'optimal' : 'overreached';
  return clean({
    ctl: r1(ctl), atl: r1(atl), tsb: r1(tsb), form, ramp: c7 != null ? r1(ctl - c7) : null, trend: c7 == null ? null : ctl - c7 > 1 ? 'rising' : ctl - c7 < -1 ? 'falling' : 'stable',
    date: last, conf: anchor ? (pairs >= 8 ? 'medium' : 'low') : 'low', since: anchor || firstLoad, k: Math.round(k * 100) / 100, src: 'hansport',
  });
}
