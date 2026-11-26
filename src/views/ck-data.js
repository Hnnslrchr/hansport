// Rechnungen für das Cockpit „Heute“ (Runde 7/8). Kompakt- und Detailansicht nutzen dieselben Werte.
// Fehlende Werte bleiben null; nichts wird geschätzt.
import { getState } from '../store.js';
import { M, latest, series } from '../metrics.js';
import { aggregate, addDays } from '../analysis.js';
import { readiness, recommendation, balance, recFor, loadRatio, nutrition } from '../coach-logic.js';
import { num } from '../format.js';
import { daily, rolling, tOf, addD, DAY } from '../viz-data.js';

export const n0 = (v) => (v == null ? '–' : num(v, 0).replace('-', '−'));
export const n1 = (v) => (v == null ? '–' : num(v, 1).replace('-', '−'));
export const sgn0 = (v) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), 0));
export const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
export const fmtLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
export const kick = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
export const wdIdx = (d) => (new Date(d + 'T12:00:00').getDay() + 6) % 7;
export const durHM = (s) => (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.round((s % 3600) / 60)).padStart(2, '0') : String(Math.round(s / 60)));
export const durU = (s) => (s >= 3600 ? 'h' : 'min');
export const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
export const minClock = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
export const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// Tageszeit: Morgen 4–11, Tag 11–19, Abend ab 19 (bis 4 Uhr gilt noch der Vortag)
export function modeAt(now = new Date()) { const h0 = now.getHours(); return h0 < 4 ? 'abend' : h0 < 11 ? 'morgen' : h0 < 19 ? 'tag' : 'abend'; }
export const GREET = { morgen: 'Guten Morgen', tag: 'Guten Tag', abend: 'Guten Abend' };

export function dayStats(list, H, date) {
  const acts = list.filter((a) => a.date === date && !a.excluded).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const r = H.map[date] || {};
  const mov = acts.reduce((s, a) => s + (a.mov || 0), 0);
  const load = r.load != null ? r.load : acts.length ? acts.reduce((s, a) => s + (a.re || 0), 0) || null : 0;
  const kcalActs = acts.reduce((s, a) => s + (a.cal || 0), 0);
  const kcal = r.akcal ? r.akcal : kcalActs || (acts.length ? null : 0);
  const stress = M.stress.get(r);
  return { acts, mov, load, kcal, stress, r };
}

// Woche ab Montag bis einschließlich Datum, dazu der Schnitt der vier vollen Wochen davor
export function weekStats(list, date) {
  const w0 = addDays(date, -wdIdx(date));
  const cur = list.filter((a) => a.date >= w0 && a.date <= date);
  const A = aggregate(cur);
  const P = aggregate(list.filter((a) => a.date >= addDays(w0, -28) && a.date < w0));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dd = addDays(w0, i);
    const acts = cur.filter((a) => a.date === dd);
    days.push({ date: dd, v: dd <= date ? acts.reduce((s, a) => s + (a.mov || 0), 0) / 60 : null, n: acts.length });
  }
  const avg = P.count ? { time: P.time / 4, dist: P.dist / 4, gain: P.gain / 4, count: P.count / 4 } : null;
  // Vorwoche als Kontext hinter den Tagesbalken
  const pw = list.filter((a) => a.date >= addDays(w0, -7) && a.date < w0);
  const prevDays = [];
  for (let i = 0; i < 7; i++) { const dd = addDays(w0, i - 7); const v = pw.filter((a) => a.date === dd).reduce((s2, a) => s2 + (a.mov || 0), 0) / 60; prevDays.push(v || null); }
  return { A, avg, days, prevDays: prevDays.some((v) => v) ? prevDays : null, week: cur, from: w0 };
}

// übliche Weckzeit (Median der letzten 14 Nächte), Schlafbedarf, Schlafschuld und Zubettgehzeiten
export function sleepPlan(H, date) {
  const ends = [], needs = [];
  for (let i = 0; i < 14; i++) { const r = H.map[addDays(date, -i)]; if (!r) continue; const e = r.sl && toMin(r.sl.end); if (e != null) ends.push(e); if (r.need) needs.push(r.need); }
  const wake = ends.length >= 3 ? median(ends) : null;
  const need = needs.length ? needs[0] : null;
  const target = need || 480;
  // Schlafschuld: Garmins Wert, sonst aus Bedarf minus Dauer der letzten 3 Nächte
  const row = H.map[date] || {};
  let debt = row.debt != null ? debt0(row.debt) : null;
  if (debt == null) {
    let sum = 0, n = 0;
    for (let i = 0; i < 3; i++) { const r = H.map[addDays(date, -i)]; const t = r && (r.sl ? r.sl.total : r.slMin); if (t == null || !(r.need || need)) continue; sum += Math.max(0, (r.need || need) - t); n++; }
    if (n) debt = { v: sum, n, own: true };
  }
  const bedDots = [];
  for (let i = 6; i >= 0; i--) { const dd = addDays(date, -i); const r = H.map[dd]; bedDots.push({ date: dd, v: r && r.sl ? toMin(r.sl.start) : null }); }
  return { wake, need, target, std: !need, bed: wake != null ? wake - target : null, debt, bedDots };
}
const debt0 = (v) => (v == null ? null : { v, n: 3, own: false });

export function dayVerdict(st, H, date) {
  if (!st.acts.length) return { k: 'rest', a: 'Ruhetag.', b: 'Kraft für morgen.' };
  const lr = loadRatio(H, date);
  const L = st.load || 0, ch = lr ? lr.chronic : null;
  const hi = ch ? L >= Math.max(1.5 * ch, 80) : L >= 100;
  const mid = ch ? L >= 0.8 * ch : L >= 50;
  if (hi) return { k: 'hi', a: 'Intensiver Tag.', b: 'Zeit zum Erholen.' };
  if (mid) return { k: 'mid', a: 'Solider Tag.', b: 'Gut für die Form.' };
  return { k: 'lo', a: 'Lockerer Tag.', b: 'Frisch für morgen.' };
}

export function outlook(v, H, date) {
  const tsb = (H.map[date] || {}).tsb;
  if (v.k === 'hi' || (tsb != null && tsb < -20)) return { t: 'Locker oder Ruhetag', s: 'Der Morgenbericht bestätigt das mit Schlaf und Erholung.' };
  if (v.k === 'rest' && (tsb == null || tsb >= -10)) return { t: 'Normal möglich', s: 'Nach dem Ruhetag passt eine normale Einheit, wenn Schlaf und Erholung mitspielen.' };
  return { t: 'Locker bis normal', s: 'Der Morgenbericht sagt dir nach dem Aufwachen, welche Stufe passt.' };
}

// Tagesform mit Empfehlung; ohne Gesundheitswerte die Belastungsbilanz (nur aus Training)
export function formOf(H, date) {
  const S = getState();
  const R = readiness(H, date);
  if (R) {
    const rec = recommendation(R, H, date, S.meta && S.meta['coach-plan']);
    const r0 = recFor(rec.k);
    return { score: R.score, level: R.level, k: rec.k, head: r0.head, line: rec.notes && rec.notes.length ? rec.notes[0] : r0.line, R, rec };
  }
  const B = balance(H, date);
  if (B) { const r0 = recFor(B.k); return { score: null, k: B.k, head: r0.head, line: r0.line, B }; }
  return null;
}

export function nutriOf(H, date) {
  const S = getState();
  const goalWeight = S.settings.main && S.settings.main.healthGoals && S.settings.main.healthGoals.weight;
  return nutrition(H, date, S.meta && S.meta['coach-plan'], goalWeight);
}

// ---------- Gesundheitswerte für das Cockpit ----------
// Rangfolge: erst die aussagekräftigsten. Kompakt die ersten 4, im Detail bis zu 8.
export const RANK = ['slScore', 'hrv', 'rhr', 'bb', 'stress', 'akcal', 'weight', 'steps', 'resp', 'vo2'];
export const H_ICON = { slScore: 'half-moon', sleep: 'half-moon', hrv: 'activity', rhr: 'heart', bb: 'flash', stress: 'brain', akcal: 'fire-flame', weight: 'weight', steps: 'walking', resp: 'droplet', vo2: 'graph-up' };
export const H_NAME = { slScore: 'Schlaf', sleep: 'Schlaf', hrv: 'HRV', rhr: 'Ruhepuls', bb: 'Body Battery', stress: 'Stress', akcal: 'Energie', weight: 'Gewicht', steps: 'Schritte', resp: 'Atmung', vo2: 'VO2max' };
export const H_GRP = { slScore: 'g-sch', sleep: 'g-sch', hrv: 'g-erh', rhr: 'g-herz', bb: 'g-erh', stress: 'g-erh', akcal: 'g-akt', weight: 'g-kor', steps: 'g-akt', resp: 'g-herz', vo2: 'g-herz' };
export const H_UNIT = { hrv: 'ms', rhr: 'bpm', akcal: 'kcal', weight: 'kg', resp: '/min', vo2: '' };
export const STALE = { weight: 14, akcal: 0, vo2: 30 };

export function healthItems(H, day, n) {
  const out = [];
  for (const k of RANK) {
    if (k === 'akcal') { const r = H.map[day]; if (r && r.akcal > 0) out.push({ k, v: r.akcal, date: day, r }); continue; }
    const l = latest(H.list, k, day);
    if (l && (new Date(day) - new Date(l.date)) / 864e5 <= 120) out.push({ k, ...l });
    else if (k === 'slScore') { const s = latest(H.list, 'sleep', day); if (s && (new Date(day) - new Date(s.date)) / 864e5 <= 120) out.push({ k: 'sleep', ...s }); }
  }
  return out.slice(0, n);
}

const bandTxt = (v, b) => (!b || !b[1] ? null : v < b[0] - b[1] ? 'unter Bereich' : v > b[0] + b[1] ? 'über Bereich' : 'im Bereich');

// Anzeige eines Gesundheitswerts: Zahl, Einheit, kurze Einordnung, veraltet?
export function healthView(x, day) {
  const k = x.k, r = x.r || {};
  const age = Math.round((new Date(day + 'T12:00:00') - new Date(x.date + 'T12:00:00')) / 864e5);
  const lim = STALE[k] != null ? STALE[k] : 1;
  const stale = age > lim;
  let val = n0(x.v), unit = H_UNIT[k] || '', note = null;
  if (k === 'sleep') { val = hmmOf(x.v); unit = 'h'; note = r.need ? (x.v >= r.need ? 'Bedarf gedeckt' : 'unter Bedarf') : null; }
  if (k === 'slScore') note = x.v >= 90 ? 'sehr gut' : x.v >= 80 ? 'gut' : x.v >= 60 ? 'solide' : 'schwach';
  if (k === 'hrv') note = bandTxt(x.v, r.base && r.base.hrv);
  if (k === 'rhr') note = bandTxt(x.v, r.base && r.base.rhr);
  if (k === 'resp') { val = n1(x.v); note = bandTxt(x.v, r.base && r.base.resp); }
  if (k === 'bb') note = r.g && r.g.bbCh != null ? '+' + n0(r.g.bbCh) + ' Nacht' : 'beim Aufwachen';
  if (k === 'stress') note = x.v <= 25 ? 'ruhig' : x.v <= 50 ? 'niedrig' : x.v <= 75 ? 'mittel' : 'hoch';
  if (k === 'akcal') note = 'Training';
  if (k === 'steps') { val = num(x.v, 0); note = r.g && r.g.stepsGoal ? (x.v >= r.g.stepsGoal ? 'Ziel erreicht' : 'Ziel ' + num(r.g.stepsGoal, 0)) : null; }
  if (k === 'weight') { val = n1(x.v); note = age === 0 ? 'heute' : age === 1 ? 'gestern' : 'vor ' + age + ' Tagen'; }
  if (stale) note = dayMonOf(x.date);
  else if (age === 1 && k !== 'weight') note = 'gestern';
  return { k, val, unit, note, stale, age, name: H_NAME[k], icon: H_ICON[k], grp: H_GRP[k], mk: k };
}
const hmmOf = (m) => (m == null ? '–' : Math.floor(m / 60) + ':' + String(Math.round(m % 60)).padStart(2, '0'));
const dayMonOf = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

// 7-Tage-Verlauf, Normalbereich und Abstand zum Schnitt der letzten 28 Tage
export function trendOf(H, day, k) {
  const pts = series(H.map, k, day, 7);
  const m28 = series(H.map, k, day, 28).map((p) => p.v).filter((v) => v != null);
  const avg = m28.length >= 4 ? mean(m28) : null;
  const row = (pts.filter((p) => p.v != null).pop() || {}).r;
  const band = row && M[k].normal ? M[k].normal(row) : null;
  return { pts, avg, band, vals: pts.map((p) => p.v).filter((v) => v != null) };
}

// ---------- Reihen für die Diagramme der Detailansicht ----------

export function nightsOf(H, day, n = 7) {
  return series(H.map, 'sleep', day, n).map((p) => {
    const sl = (p.r && p.r.sl) || {};
    return { date: p.date, deep: sl.deep || 0, light: sl.light || 0, rem: sl.rem || 0, total: sl.total != null ? sl.total : p.v, score: sl.score != null ? sl.score : (p.r || {}).slScore };
  });
}
export function bbRange(H, day, n = 7) {
  return series(H.map, 'bb', day, n).map((p) => {
    const g = (p.r && p.r.g) || {};
    return { date: p.date, lo: g.bbLo != null ? g.bbLo : null, hi: g.bbHi != null ? g.bbHi : null, wake: g.bbWake != null ? g.bbWake : null };
  });
}
export function stressShare(H, day, n = 7) {
  return series(H.map, 'stress', day, n).map((p) => {
    const m = (p.r && p.r.g && p.r.g.stressMin) || null;
    return { date: p.date, parts: m ? [m.rest || 0, m.low || 0, m.med || 0, m.high || 0] : null, v: p.v };
  });
}
export function colsOf(H, day, k, n = 7) { return series(H.map, k, day, n).map((p) => ({ date: p.date, v: p.v, r: p.r })); }
export function avgOf(H, day, k, n) { const v = series(H.map, k, day, n).map((p) => p.v).filter((x) => x != null); return v.length ? mean(v) : null; }

// Gewicht: Messungen, geglätteter Trend, Rate je Woche, Fortschritt und Prognose zum Ziel
export function weightInfo(H, day, days = 90) {
  const S = getState();
  const goal = (S.settings.main && S.settings.main.healthGoals && S.settings.main.healthGoals.weight) || null;
  const all = daily(H.list, (r) => (r.wi ? r.wi.weight : null), '0000', day);
  if (!all.length) return null;
  const from = addD(day, -days);
  const win = all.filter((p) => p.date >= from);
  let pts = win.length >= 2 ? win : all.slice(-6);
  // Liegt im Fenster eine lange Messpause, beginnt die Kurve danach – sonst drückt ein alter
  // Wert die aktuelle Entwicklung flach und der Verlauf zeigt vor allem Leere.
  for (let i = pts.length - 1; i > 0; i--) {
    if ((pts[i].t - pts[i - 1].t) / DAY <= 21) continue;
    const rest = pts.slice(i);
    if (rest.length >= 3 && (pts[pts.length - 1].t - rest[0].t) / DAY >= 14) pts = rest;
    break;
  }
  const trend = rolling(all.filter((p) => p.date >= addD(from, -14)), 7, 21).filter((p) => p.v == null || p.t >= tOf(pts[0].date));
  const tl = trend.filter((p) => p.v != null);
  const tNow = tl.length ? tl[tl.length - 1].v : null;
  const last = all[all.length - 1];
  const prev = all.length > 1 ? all[all.length - 2] : null;
  const t28 = tl.filter((p) => p.t >= tOf(addD(day, -28)));
  const rate = t28.length >= 2 && t28[t28.length - 1].t > t28[0].t ? ((t28[t28.length - 1].v - t28[0].v) / ((t28[t28.length - 1].t - t28[0].t) / DAY)) * 7 : null;
  const d30 = (() => { const a = all.filter((p) => p.t >= tOf(addD(day, -30))); return a.length >= 2 ? a[a.length - 1].v - a[0].v : null; })();
  let eta = null;
  if (goal != null && tNow != null && rate && Math.abs(rate) >= 0.05) {
    const need = goal - tNow;
    if ((need < 0 && rate < 0) || (need > 0 && rate > 0)) {
      const weeks = Math.abs(need / rate);
      if (weeks <= 78) eta = new Date(tOf(day) + weeks * 7 * DAY);
    }
  }
  const span = Math.max(1, Math.round((pts[pts.length - 1].t - pts[0].t) / DAY));
  // Fortschritt misst gegen die älteste Messung des letzten halben Jahres, nicht gegen den
  // Beginn der gezeigten Kurve – sonst wäre der zurückgelegte Weg nicht zu sehen.
  const hist = all.filter((p) => p.t >= tOf(addD(day, -180)));
  const startRef = hist.length ? hist[0] : pts[0];
  const fat = daily(H.list, (r) => (r.wi ? r.wi.fatPct : null), pts[0].date, day);
  const fatD = fat.length >= 2 ? fat[fat.length - 1].v - fat[0].v : null;
  return { pts, trend, goal, tNow, last, prev, rate, d30, eta, start: startRef, from: pts[0], days: span, fat: fat.length ? fat[fat.length - 1] : null, fatD, fatFrom: fat.length ? fat[0] : null };
}

// VO2max-Messungen eines Zeitraums (selten, daher nur die vorhandenen Punkte)
export function vo2Series(H, day, days = 180) {
  return daily(H.list, (r) => r.vo2, addD(day, -days), day);
}
