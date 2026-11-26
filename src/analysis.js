// Auswertungen: Zeiträume, Trends, Erkenntnisse, Zonen, Bestwerte, Gym, Rückblicke, Zusammenhänge.
import { parseDate, isoDate, today, dur, hours, km, hm, num, int, clock, signedDur, monthName, dateMid, pct } from './format.js';
import { SPORT_ORDER, SPORTS, sportLabel, dsport } from './sports.js';
import { hav } from './geo.js';

export const median = (arr) => {
  const a = arr.filter((x) => x != null && !isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const addDays = (d, n) => { const x = parseDate(d); x.setDate(x.getDate() + n); return isoDate(x); };
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export { addDays, daysBetween };

// ---------- Zeiträume ----------
export function periodOf(kind, d) {
  const dt = parseDate(d);
  if (kind === 'week') {
    const wd = (dt.getDay() + 6) % 7;
    const s = addDays(d, -wd);
    return { kind, start: s, end: addDays(s, 6), label: 'KW ' + isoWeek(s) };
  }
  if (kind === 'month') {
    const s = d.slice(0, 7) + '-01';
    const e = isoDate(new Date(dt.getFullYear(), dt.getMonth() + 1, 0));
    return { kind, start: s, end: e, label: monthName(d.slice(0, 7)) };
  }
  if (kind === 'season') {
    const m = dt.getMonth() + 1, y = dt.getFullYear();
    if (m >= 5 && m <= 10) return { kind, start: y + '-05-01', end: y + '-10-31', label: 'Sommersaison ' + y, winter: false };
    const y0 = m >= 11 ? y : y - 1;
    return { kind, start: y0 + '-11-01', end: (y0 + 1) + '-04-30', label: 'Wintersaison ' + y0 + '/' + String(y0 + 1).slice(2), winter: true };
  }
  const y = dt.getFullYear();
  return { kind: 'year', start: y + '-01-01', end: y + '-12-31', label: String(y) };
}

export function isoWeek(d) {
  const dt = parseDate(d);
  const t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

export function previousPeriod(p) {
  return periodOf(p.kind, addDays(p.start, -1));
}

export function shiftYear(d, n = -1) {
  const [y, m, dd] = d.split('-').map(Number);
  const last = new Date(y + n, m, 0).getDate();
  return (y + n) + '-' + String(m).padStart(2, '0') + '-' + String(Math.min(dd, last)).padStart(2, '0');
}

export const inRange = (a, s, e) => a.date >= s && a.date <= e;

export function aggregate(acts) {
  const r = { count: 0, days: 0, time: 0, dist: 0, gain: 0, re: 0, reTime: 0, rpeLoad: 0, rpeN: 0, rpeSum: 0, bySport: {} };
  const days = new Set();
  for (const a of acts) {
    if (a.excluded) continue;
    r.count++;
    days.add(a.date);
    r.time += a.mov || 0;
    r.dist += a.indoor ? 0 : a.dist || 0;
    r.gain += a.indoor ? 0 : a.gain || 0;
    if (a.re != null) { r.re += a.re; r.reTime += a.mov || 0; }
    if (a.rpe) { r.rpeLoad += a.rpe * (a.mov || 0) / 60; r.rpeN++; r.rpeSum += a.rpe; }
    const ds = dsport(a); const s = r.bySport[ds] || (r.bySport[ds] = { count: 0, time: 0, dist: 0, gain: 0, days: new Set() });
    s.count++; s.time += a.mov || 0; s.dist += a.indoor ? 0 : a.dist || 0; s.gain += a.indoor ? 0 : a.gain || 0; s.days.add(a.date);
  }
  r.days = days.size;
  for (const k in r.bySport) r.bySport[k].days = r.bySport[k].days.size;
  r.reRate = r.reTime ? r.re / (r.reTime / 3600) : null;
  r.rpeAvg = r.rpeN ? r.rpeSum / r.rpeN : null;
  return r;
}

// Aktueller Zeitraum bis heute + Vergleiche
export function periodComparison(acts, kind, ref = today()) {
  const p = periodOf(kind, ref);
  const end = ref < p.end ? ref : p.end;
  const elapsed = daysBetween(p.start, end) + 1;
  const cur = acts.filter((a) => inRange(a, p.start, end));
  const prevEnd = addDays(p.start, -1);
  const prevStart = addDays(p.start, -elapsed);
  const prev = acts.filter((a) => inRange(a, prevStart, prevEnd));
  const lyStart = shiftYear(p.start), lyEnd = shiftYear(end);
  const ly = acts.filter((a) => inRange(a, lyStart, lyEnd));
  return {
    period: p, end, elapsed, total: daysBetween(p.start, p.end) + 1,
    cur: aggregate(cur), prev: aggregate(prev), ly: aggregate(ly),
    curActs: cur, prevActs: prev, lyActs: ly,
    ranges: { cur: [p.start, end], prev: [prevStart, prevEnd], ly: [lyStart, lyEnd] },
  };
}

// Abgeschlossene Zeiträume für Balken
export function periodSeries(acts, kind, n, ref = today()) {
  const out = [];
  let p = periodOf(kind, ref);
  for (let i = 0; i < n; i++) {
    const as = acts.filter((a) => inRange(a, p.start, p.end));
    out.unshift({ ...p, agg: aggregate(as), acts: as, current: i === 0 });
    p = previousPeriod(p);
  }
  return out;
}

// ---------- Segmente (Strava) ----------
export function segmentIndex(perfs, actsById) {
  const idx = {};
  for (const [aid, p] of Object.entries(perfs || {})) {
    const a = actsById[aid];
    if (!a || a.excluded || !p || !p.seg) continue;
    for (const e of p.seg) {
      const s = idx[e.id] || (idx[e.id] = { id: e.id, name: e.n, dist: e.d, gain: e.g, efforts: [] });
      if (s.efforts.some((x) => x.act === aid)) {
        const ex = s.efforts.find((x) => x.act === aid);
        if (e.mt < ex.mt) Object.assign(ex, { et: e.et, mt: e.mt, hr: e.hr });
        continue;
      }
      s.efforts.push({ act: aid, date: a.date, start: a.start, et: e.et, mt: e.mt, hr: e.hr, gear: a.gear, sport: a.sport, ebike: a.ebike });
    }
  }
  for (const s of Object.values(idx)) {
    s.efforts.sort((a, b) => (a.start < b.start ? -1 : 1));
    s.grade = s.dist ? s.gain / s.dist : 0;
    s.kind = s.gain >= 25 && s.grade >= 0.03 ? 'climb' : /down|abfahrt|discesa|descent|trail/i.test(s.name) ? 'descent' : 'flat';
    s.best = s.efforts.reduce((b, e) => (!b || e.mt < b.mt ? e : b), null);
    s.median = median(s.efforts.map((e) => e.mt));
    s.last = s.efforts[s.efforts.length - 1];
  }
  return idx;
}

// ---------- Eigene Anstiege: wiederkehrende Anstiege aus den eigenen Aufzeichnungen ----------
// Grundlage sind die je Aktivität erkannten Anstiege (perf/<id>.sum.cl) mit Start- und Gipfelpunkt.
// Zwei Anstiege gelten als derselbe, wenn Start und Gipfel je höchstens 250 m auseinanderliegen
// und die Länge um höchstens 30 % abweicht. Keine Strava-Daten nötig.
export function climbIndex(perfs, actsById) {
  const items = [];
  for (const [aid, p] of Object.entries(perfs || {})) {
    const a = actsById[aid];
    if (!a || a.excluded) continue;
    const cl = p && p.sum && p.sum.cl;
    if (!cl) continue;
    for (const c of cl) if (c.a && c.b) items.push({ ...c, act: aid, date: a.date, start: a.start, sport: a.sport, gear: a.gear, ebike: a.ebike, name: a.name });
  }
  items.sort((x, y) => y.g - x.g);
  const groups = [];
  for (const it of items) {
    let G = null;
    for (const g of groups) {
      if (hav(g.a, it.a) > 250 || hav(g.b, it.b) > 250) continue;
      if (Math.abs(g.dist - it.d) / Math.max(1, g.dist) > 0.3) continue;
      G = g; break;
    }
    if (!G) { G = { a: it.a, b: it.b, dist: it.d, gain: it.g, avg: it.avg, alt: it.alt, sport: it.sport, efforts: [] }; groups.push(G); }
    if (G.efforts.some((e) => e.act === it.act)) continue;
    G.efforts.push({ act: it.act, date: it.date, start: it.start, mt: it.t, vam: it.vam, dist: it.d, gain: it.g, gear: it.gear, ebike: it.ebike, sport: it.sport, name: it.name });
  }
  for (const G of groups) {
    G.efforts.sort((x, y) => ((x.start || x.date) < (y.start || y.date) ? -1 : 1));
    G.n = G.efforts.length;
    const times = G.efforts.map((e) => e.mt).filter((t) => t > 0);
    G.best = G.efforts.reduce((b, e) => (e.mt > 0 && (!b || e.mt < b.mt) ? e : b), null);
    G.median = times.length ? median(times) : null;
    G.last = G.efforts[G.efforts.length - 1];
    G.dist = Math.round(median(G.efforts.map((e) => e.dist)));
    G.gain = Math.round(median(G.efforts.map((e) => e.gain)));
    G.grade = G.dist ? G.gain / G.dist : 0;
    G.id = 'c' + Math.round(G.a[0] * 2000) + '_' + Math.round(G.a[1] * 2000) + '_' + Math.round(G.dist / 100);
  }
  return groups;
}
export const recurringClimbs = (groups, min = 3) => groups.filter((g) => g.n >= min).sort((a, b) => b.n - a.n || b.gain - a.gain);

export function recurringSegments(idx, min = 3) {
  return Object.values(idx).filter((s) => s.efforts.length >= min).sort((a, b) => b.efforts.length - a.efforts.length || b.gain - a.gain);
}

// Vergleich: jüngere Hälfte gegen ältere Hälfte
export function splitCompare(values, getT) {
  const n = values.length;
  if (n < 4) return null;
  const k = Math.min(Math.floor(n / 2), 5);
  const recent = values.slice(-k), earlier = values.slice(-2 * k, -k);
  const mr = median(recent.map(getT)), me = median(earlier.map(getT));
  return { recent, earlier, mr, me, diff: mr - me, rel: me ? (mr - me) / me : 0, k };
}

export function effortLimits(recent, earlier, gearNames = {}) {
  const lim = [];
  const n = recent.length + earlier.length;
  if (n < 8) lim.push('Kleine Stichprobe: ' + recent.length + ' gegen ' + earlier.length + ' Fahrten');
  const gears = new Set([...recent, ...earlier].map((e) => e.gear || '?'));
  if (gears.size > 1) lim.push('Unterschiedliche Ausrüstung: ' + [...gears].map((g) => gearNames[g] || (g === '?' ? 'unbekannt' : g)).join(', '));
  if ([...recent, ...earlier].some((e) => e.ebike)) lim.push('Mindestens eine Fahrt mit E-MTB');
  const hrR = median(recent.map((e) => e.hr)), hrE = median(earlier.map((e) => e.hr));
  if (hrR && hrE && Math.abs(hrR - hrE) >= 6) lim.push('Puls im Median ' + int(Math.abs(hrR - hrE)) + ' bpm ' + (hrR > hrE ? 'höher' : 'niedriger') + ' – andere Intensität');
  if (!hrR || !hrE) lim.push('Pulsdaten unvollständig');
  const stops = [...recent, ...earlier].filter((e) => e.et - e.mt > 30).length;
  if (stops) lim.push(stops + '× Stopps innerhalb des Abschnitts (Bewegungszeit verwendet)');
  return lim;
}

// ---------- Strecken-Leistung aus Zusammenfassungen ----------
export function routeMetric(cluster) {
  const sp = cluster.sport;
  const gain = median(cluster.members.map((m) => m.gain)) || 0;
  if ((sp === 'hike' || sp === 'mtb' || sp === 'splitboard') && gain >= 150) {
    return { k: 'vam', label: 'Höhenmeter pro Stunde', unit: 'Hm/h', get: (a) => (a.mov ? a.gain / (a.mov / 3600) : null), fmt: (v) => int(v) + ' Hm/h', higherBetter: true };
  }
  if (sp === 'hike' || cluster.family === 'foot') {
    return { k: 'pace', label: 'Bewegungszeit', unit: '', get: (a) => a.mov, fmt: (v) => dur(v), higherBetter: false };
  }
  return { k: 'speed', label: 'Ø Geschwindigkeit', unit: 'km/h', get: (a) => (a.mov ? (a.dist / a.mov) * 3.6 : null), fmt: (v) => num(v, 1) + ' km/h', higherBetter: true };
}

// ---------- Erkenntnisse ----------
export function buildInsights(ctx) {
  const { acts, clusters, segIdx, journal, gymSessions, goals, gearNames, now = today() } = ctx;
  const out = [];
  const valid = acts.filter((a) => !a.excluded);

  // 1) Umfang: letzte 4 Wochen gegen die 4 Wochen davor
  {
    const s1 = addDays(now, -27), p0 = addDays(now, -55), p1 = addDays(now, -28);
    const cur = valid.filter((a) => inRange(a, s1, now));
    const prev = valid.filter((a) => inRange(a, p0, p1));
    const A = aggregate(cur), B = aggregate(prev);
    if (A.count + B.count >= 4 && B.time > 0) {
      const rel = (A.time - B.time) / B.time;
      const lim = [];
      if (A.count < 4 || B.count < 4) lim.push('Wenige Einheiten in einem der Zeiträume');
      const sportShift = mixShift(A, B);
      if (sportShift) lim.push(sportShift);
      out.push({
        id: 'volume28', kind: 'volume', score: Math.abs(rel) * 2 + 0.4,
        dir: rel > 0.05 ? 'up' : rel < -0.05 ? 'down' : 'flat',
        title: 'Trainingszeit ' + pct(rel),
        text: hours(A.time) + ' in den letzten 4 Wochen, ' + hours(B.time) + ' in den 4 Wochen davor.',
        compare: 'Vergleich: ' + dateMid(s1) + ' – ' + dateMid(now) + ' gegen ' + dateMid(p0) + ' – ' + dateMid(p1),
        basis: A.count + ' gegen ' + B.count + ' Einheiten, alle Sportarten, Bewegungszeit laut Strava',
        limits: lim, aspect: 'Umfang',
        refs: { acts: cur.map((a) => a.id), prevActs: prev.map((a) => a.id) },
        detail: { cur: A, prev: B, ranges: [[s1, now], [p0, p1]] },
      });
    }
  }

  // 2) Saison: aktive Tage je Sportart gegen Vorjahressaison
  {
    const p = periodOf('season', now);
    const lyS = shiftYear(p.start), lyE = shiftYear(now);
    const cur = valid.filter((a) => inRange(a, p.start, now));
    const ly = valid.filter((a) => inRange(a, lyS, lyE));
    const A = aggregate(cur), B = aggregate(ly);
    const focus = p.winter ? ['splitboard', 'snowboard', 'road', 'gym'] : ['road', 'mtb', 'hike'];
    let best = null;
    for (const s of focus) {
      const a = A.bySport[s]?.days || 0, b = B.bySport[s]?.days || 0;
      if (a + b < 2) continue;
      const d = a - b;
      const score = Math.abs(d) / Math.max(2, b) + (s === 'splitboard' || s === 'snowboard' ? 0.2 : 0);
      if (!best || score > best.score) best = { s, a, b, d, score };
    }
    if (best) {
      const lim = [];
      if (best.a + best.b < 6) lim.push('Kleine Zahl: ' + best.a + ' gegen ' + best.b + ' Tage');
      const el = daysBetween(p.start, now) + 1;
      if (el < 30) lim.push('Saison erst ' + el + ' Tage alt');
      out.push({
        id: 'season-' + best.s, kind: 'season', score: best.score + 0.3,
        dir: best.d > 0 ? 'up' : best.d < 0 ? 'down' : 'flat',
        title: sportLabel(best.s) + ': ' + (best.d > 0 ? '+' : best.d < 0 ? '−' : '±') + Math.abs(best.d) + ' Tage',
        text: best.a + ' ' + (best.a === 1 ? 'Tag' : 'Tage') + ' in der ' + p.label + ' bisher, ' + best.b + ' im gleichen Zeitraum der Vorsaison.',
        compare: 'Vergleich: ' + dateMid(p.start) + ' – ' + dateMid(now) + ' gegen ' + dateMid(lyS) + ' – ' + dateMid(lyE),
        basis: 'Aktive Tage mit ' + sportLabel(best.s) + ', ' + (A.bySport[best.s]?.count || 0) + ' gegen ' + (B.bySport[best.s]?.count || 0) + ' Einheiten',
        limits: lim, aspect: 'Umfang',
        refs: { acts: cur.filter((a) => a.sport === best.s).map((a) => a.id), prevActs: ly.filter((a) => a.sport === best.s).map((a) => a.id) },
        sport: best.s,
      });
    }
  }

  // 3) Leistung auf wiederkehrenden Anstiegen (Strava-Segmente)
  {
    const cands = [];
    for (const s of Object.values(segIdx || {})) {
      if (s.kind !== 'climb' || s.efforts.length < 4 || s.dist < 800) continue;
      const recentDate = s.efforts[s.efforts.length - 1].date;
      if (daysBetween(recentDate, now) > 120) continue;
      const c = splitCompare(s.efforts, (e) => e.mt);
      if (!c) continue;
      const score = Math.abs(c.rel) * 4 * Math.sqrt(c.k) + Math.min(1, s.gain / 400) * 0.5;
      cands.push({ s, c, score });
    }
    cands.sort((a, b) => b.score - a.score);
    for (const { s, c, score } of cands.slice(0, 2)) {
      const faster = c.diff < 0;
      out.push({
        id: 'seg-' + s.id, kind: 'segment', score: score + 0.6,
        dir: faster ? 'up' : c.diff > 0 ? 'down' : 'flat', good: faster,
        title: s.name.trim() + ': ' + (faster ? 'schneller' : 'langsamer'),
        text: 'Bei den letzten ' + c.k + ' Fahrten warst du im Median ' + clock(Math.abs(c.diff)) + ' min ' + (faster ? 'schneller' : 'langsamer') + ' als bei den ' + c.k + ' davor (' + clock(c.mr) + ' gegen ' + clock(c.me) + ').',
        compare: 'Vergleich: ' + dateMid(c.recent[0].date) + ' – ' + dateMid(c.recent[c.k - 1].date) + ' gegen ' + dateMid(c.earlier[0].date) + ' – ' + dateMid(c.earlier[c.k - 1].date),
        basis: s.efforts.length + ' Fahrten über ' + km(s.dist) + ' km und ' + hm(s.gain) + ' Hm (Strava-Segment), Bewegungszeit',
        limits: effortLimits(c.recent, c.earlier, gearNames), aspect: 'Leistung',
        refs: { segId: s.id, acts: c.recent.map((e) => e.act), prevActs: c.earlier.map((e) => e.act) },
      });
    }
  }

  // 4) Leistung auf wiederkehrenden Strecken (aus Zusammenfassungen)
  {
    const cands = [];
    for (const c of clusters || []) {
      if (c.indoor) continue;
      const ms = c.members.filter((m) => !m.excluded && Math.abs(m.dist - c.medLen) / (c.medLen || 1) <= 0.06).slice().reverse();
      if (ms.length < 4) continue;
      if (daysBetween(ms[ms.length - 1].date, now) > 150) continue;
      const M = routeMetric(c);
      const cmp = splitCompare(ms, M.get);
      if (!cmp || !cmp.me) continue;
      const better = M.higherBetter ? cmp.diff > 0 : cmp.diff < 0;
      cands.push({ c, cmp, M, better, score: Math.abs(cmp.rel) * 3 * Math.sqrt(cmp.k) });
    }
    cands.sort((a, b) => b.score - a.score);
    for (const { c, cmp, M, better, score } of cands.slice(0, 2)) {
      const lim = [];
      if (cmp.k < 4) lim.push('Kleine Stichprobe: ' + cmp.k + ' gegen ' + cmp.k + ' Einheiten');
      const pauseShare = (arr) => median(arr.map((a) => (a.ela && a.mov ? (a.ela - a.mov) / a.ela : 0)));
      if (Math.abs(pauseShare(cmp.recent) - pauseShare(cmp.earlier)) > 0.15) lim.push('Unterschiedlich lange Pausen');
      const gears = new Set([...cmp.recent, ...cmp.earlier].map((a) => a.gear || '?'));
      if (gears.size > 1) lim.push('Unterschiedliche Ausrüstung');
      lim.push('Ganze Strecke, Bedingungen (Wind, Hitze) nicht berücksichtigt');
      out.push({
        id: 'route-' + c.key, kind: 'route', score: score + 0.35,
        dir: better ? 'up' : 'down', good: better,
        title: c.name + ': ' + (better ? 'besser' : 'schwächer'),
        text: M.label + ' im Median ' + M.fmt(cmp.mr) + ' bei den letzten ' + cmp.k + ', ' + M.fmt(cmp.me) + ' bei den ' + cmp.k + ' davor (' + pct(cmp.rel) + ').',
        compare: 'Vergleich: ' + dateMid(cmp.recent[0].date) + ' – ' + dateMid(cmp.recent[cmp.k - 1].date) + ' gegen ' + dateMid(cmp.earlier[0].date) + ' – ' + dateMid(cmp.earlier[cmp.k - 1].date),
        basis: c.members.length + ' Einheiten auf derselben Strecke (GPS, gleiche Richtung), Varianten ausgeschlossen',
        limits: lim, aspect: 'Leistung',
        refs: { routeKey: c.key, acts: cmp.recent.map((a) => a.id), prevActs: cmp.earlier.map((a) => a.id) },
      });
    }
  }

  // 5) Intensität (Relative Effort pro Stunde)
  {
    const s1 = addDays(now, -27), p0 = addDays(now, -55), p1 = addDays(now, -28);
    const cur = valid.filter((a) => inRange(a, s1, now) && a.re != null);
    const prev = valid.filter((a) => inRange(a, p0, p1) && a.re != null);
    if (cur.length >= 3 && prev.length >= 3) {
      const A = aggregate(cur), B = aggregate(prev);
      const rel = B.reRate ? (A.reRate - B.reRate) / B.reRate : 0;
      if (Math.abs(rel) >= 0.12) {
        out.push({
          id: 'intensity', kind: 'intensity', score: Math.abs(rel) * 1.5,
          dir: rel > 0 ? 'up' : 'down',
          title: 'Intensität ' + pct(rel),
          text: 'Relative Effort pro Stunde: ' + int(A.reRate) + ' in den letzten 4 Wochen, ' + int(B.reRate) + ' davor.',
          compare: 'Vergleich: letzte 4 Wochen gegen die 4 Wochen davor',
          basis: cur.length + ' gegen ' + prev.length + ' Einheiten mit Pulsdaten (Strava Relative Effort)',
          limits: ['Nur Einheiten mit Puls', 'Strava-Kennzahl, abhängig von den Pulszonen'], aspect: 'Intensität',
          refs: { acts: cur.map((a) => a.id), prevActs: prev.map((a) => a.id) },
        });
      }
    }
  }

  // 6) Gym-Regelmäßigkeit
  {
    const goal = (goals || []).find((g) => g.kind === 'freq' && g.sport === 'gym');
    const s1 = addDays(now, -27);
    const n = valid.filter((a) => a.sport === 'gym' && inRange(a, s1, now));
    const prev = valid.filter((a) => a.sport === 'gym' && inRange(a, addDays(now, -55), addDays(now, -28)));
    if (goal || n.length + prev.length >= 2) {
      const perWeek = n.length / 4;
      const target = goal ? goal.target / (goal.per === 'month' ? 4.3 : 1) : null;
      out.push({
        id: 'gym-freq', kind: 'gym', score: target ? Math.abs(perWeek - target) / target + 0.2 : 0.25,
        dir: n.length > prev.length ? 'up' : n.length < prev.length ? 'down' : 'flat', good: target ? perWeek >= target : null,
        title: 'Gym: ' + num(perWeek, 1) + '× pro Woche',
        text: n.length + ' Einheiten in den letzten 4 Wochen, ' + prev.length + ' in den 4 Wochen davor' + (target ? '. Ziel: ' + num(target, 1) + '× pro Woche.' : '.'),
        compare: 'Vergleich: letzte 4 Wochen gegen die 4 Wochen davor',
        basis: 'Gym-Einheiten aus Strava und deinem Trainingslog (verknüpfte zählen einmal)',
        limits: [], aspect: 'Umfang',
        refs: { acts: n.map((a) => a.id), prevActs: prev.map((a) => a.id) },
      });
    }
  }

  // 7) Journal-Zusammenhang
  const corr = correlations(journal, valid);
  const strong = corr.filter((c) => c.ok).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0];
  if (strong) {
    out.push({
      id: 'corr-' + strong.k, kind: 'journal', score: 0.5 + Math.abs(strong.effect) * 0.5,
      dir: 'flat', title: strong.title, text: strong.text,
      compare: strong.compare, basis: strong.basis,
      limits: ['Beobachteter Zusammenhang, keine Ursache', ...(strong.limits || [])], aspect: 'Erholung',
      refs: { acts: strong.acts || [] },
    });
  }

  out.sort((a, b) => b.score - a.score);
  // höchstens eine Erkenntnis je Art
  const seen = new Set();
  return out.filter((i) => (seen.has(i.kind) ? false : (seen.add(i.kind), true)));
}

function mixShift(A, B) {
  const ups = [], downs = [];
  for (const s of SPORT_ORDER) {
    const a = A.bySport[s]?.time || 0, b = B.bySport[s]?.time || 0;
    if (a - b > 3 * 3600) ups.push(sportLabel(s) + ' +' + num((a - b) / 3600, 0) + ' h');
    if (b - a > 3 * 3600) downs.push(sportLabel(s) + ' −' + num((b - a) / 3600, 0) + ' h');
  }
  if (ups.length && downs.length) return 'Sportartenwechsel: ' + downs.join(', ') + '; ' + ups.join(', ');
  return null;
}

// ---------- Zonen ----------
export function zonesAt(hist, date) {
  if (!hist || !hist.length) return null;
  let z = hist[0];
  for (const h of hist) if (h.from <= date) z = h;
  return z;
}

export function timeInZones(values, times, maxes) {
  if (!values || !maxes) return null;
  const n = maxes.length + 1;
  const out = new Array(n).fill(0);
  let any = false;
  const dts = [];
  for (let i = 1; i < times.length; i++) dts.push(times[i] - times[i - 1]);
  const cap = Math.max(30, (median(dts) || 1) * 4);
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const dt = times[i] - times[i - 1];
    if (dt <= 0 || dt > cap) continue;
    let z = maxes.findIndex((m) => v <= m);
    if (z < 0) z = n - 1;
    out[z] += dt; any = true;
  }
  return any ? out : null;
}

// ---------- Leistungs-Bestwerte ----------
export const CURVE_DURS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

export function powerCurve(watts, times) {
  if (!watts || !times || watts.length < 10) return null;
  const dts = [];
  for (let i = 1; i < times.length; i++) dts.push(times[i] - times[i - 1]);
  const step = median(dts) || 1;
  const cum = [0];
  for (let i = 1; i < times.length; i++) {
    const dt = Math.min(times[i] - times[i - 1], Math.max(10, step * 3));
    cum.push(cum[i - 1] + (watts[i] || 0) * dt);
  }
  const total = times[times.length - 1] - times[0];
  const res = [];
  for (const D of CURVE_DURS) {
    if (D > total || step > D / 2) continue;
    let best = 0, j = 0;
    for (let i = 0; i < times.length; i++) {
      while (j < times.length && times[j] - times[i] < D) j++;
      if (j >= times.length) break;
      const span = times[j] - times[i];
      const e = (cum[j] - cum[i]) / span;
      if (e > best) best = e;
    }
    if (best > 0) res.push({ d: D, w: Math.round(best) });
  }
  return { step, res };
}

// ---------- Gym ----------
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 && reps <= 12 ? kg * (1 + reps / 30) : null);

export function exerciseHistory(sessions) {
  const ex = {};
  for (const s of sessions) {
    for (const e of s.exercises || []) {
      const key = e.name.trim().toLowerCase();
      const x = ex[key] || (ex[key] = { name: e.name.trim(), kind: e.kind || 'weight', entries: [] });
      const work = (e.sets || []).filter((st) => !st.warm);
      if (!work.length) continue;
      const vol = sum(work, (st) => (st.reps || 0) * (st.kg || 0));
      const bestE = Math.max(0, ...work.map((st) => e1rm(st.kg, st.reps) || 0));
      const topKg = Math.max(0, ...work.map((st) => st.kg || 0));
      const maxReps = Math.max(0, ...work.map((st) => st.reps || 0));
      const maxSec = Math.max(0, ...work.map((st) => st.sec || 0));
      const minAssist = Math.min(...work.map((st) => (st.kg != null ? st.kg : Infinity)));
      x.entries.push({ session: s.id, date: s.date, sets: work, vol, e1rm: bestE || null, topKg, maxReps, maxSec, minAssist: isFinite(minAssist) ? minAssist : null, rpe: median(work.map((st) => st.rpe)) });
    }
  }
  for (const x of Object.values(ex)) {
    x.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
    x.last = x.entries[x.entries.length - 1];
    if (x.kind === 'weight') {
      x.pr = x.entries.reduce((b, e) => (e.e1rm && (!b || e.e1rm > b.e1rm) ? e : b), null);
      x.prKg = x.entries.reduce((b, e) => (!b || e.topKg > b.topKg ? e : b), null);
    } else if (x.kind === 'bodyweight') x.pr = x.entries.reduce((b, e) => (!b || e.maxReps > b.maxReps ? e : b), null);
    else if (x.kind === 'time') x.pr = x.entries.reduce((b, e) => (!b || e.maxSec > b.maxSec ? e : b), null);
    else if (x.kind === 'assisted') x.pr = x.entries.reduce((b, e) => (e.minAssist != null && (!b || e.minAssist < b.minAssist) ? e : b), null);
  }
  return ex;
}

// Volumen bei vergleichbaren Sätzen (gleicher Wiederholungsbereich)
export function comparableLoad(entries, lo = 6, hi = 12) {
  return entries.map((e) => {
    const sets = e.sets.filter((s) => s.reps >= lo && s.reps <= hi && s.kg);
    return { date: e.date, avgKg: sets.length ? sum(sets, (s) => s.kg) / sets.length : null, sets: sets.length };
  }).filter((x) => x.avgKg != null);
}

// ---------- Zusammenhänge Journal ----------
export function correlations(journal, acts) {
  const days = Object.entries(journal || {}).map(([d, e]) => ({ d, ...e }));
  const byDate = {};
  for (const a of acts) (byDate[a.date] || (byDate[a.date] = [])).push(a);
  const res = [];
  const load = (d) => sum(byDate[d] || [], (a) => (a.mov || 0) / 3600);
  const rpeOf = (d) => median((byDate[d] || []).map((a) => a.rpe));
  const prevLoad = (d, n) => { let s = 0; for (let i = 1; i <= n; i++) s += load(addDays(d, -i)); return s; };

  // Schlaf → Anstrengung am selben Tag
  {
    const rows = days.filter((x) => x.sleep != null && rpeOf(x.d) != null);
    const lo = rows.filter((x) => x.sleep < 7), hi = rows.filter((x) => x.sleep >= 7);
    const ok = lo.length >= 4 && hi.length >= 4;
    const mLo = median(lo.map((x) => rpeOf(x.d))), mHi = median(hi.map((x) => rpeOf(x.d)));
    res.push({
      k: 'sleep-rpe', ok, n: rows.length, effect: ok ? (mLo - mHi) / 3 : 0,
      title: 'Schlaf und Anstrengung',
      text: ok ? 'Nach weniger als 7 h Schlaf lag deine Anstrengung im Median bei ' + num(mLo, 1) + ', sonst bei ' + num(mHi, 1) + ' (Skala 1–10).' : 'Noch zu wenige Tage mit Schlaf und Anstrengung (' + rows.length + '). Ab je 4 Tagen pro Gruppe zeigen wir eine Beobachtung.',
      compare: 'Tage mit < 7 h Schlaf gegen Tage mit ≥ 7 h', basis: lo.length + ' gegen ' + hi.length + ' Tage mit Eintrag und bewerteter Einheit',
      acts: rows.flatMap((x) => (byDate[x.d] || []).map((a) => a.id)), lo: lo.length, hi: hi.length,
    });
  }
  // Muskelkater ↔ Umfang der zwei Vortage
  {
    const rows = days.filter((x) => x.soreness != null);
    const sore = rows.filter((x) => x.soreness >= 2), fine = rows.filter((x) => x.soreness < 2);
    const ok = sore.length >= 4 && fine.length >= 4;
    const mS = median(sore.map((x) => prevLoad(x.d, 2))), mF = median(fine.map((x) => prevLoad(x.d, 2)));
    res.push({
      k: 'soreness-load', ok, n: rows.length, effect: ok && mF ? (mS - mF) / Math.max(1, mF) : 0,
      title: 'Muskelkater und Vortage',
      text: ok ? 'An Tagen mit deutlichem Muskelkater hattest du in den zwei Tagen davor im Median ' + num(mS, 1) + ' h trainiert, sonst ' + num(mF, 1) + ' h.' : 'Noch zu wenige Einträge zu Muskelkater (' + rows.length + ').',
      compare: 'Muskelkater ≥ „deutlich" gegen weniger', basis: sore.length + ' gegen ' + fine.length + ' Journaltage',
    });
  }
  // Ruhepuls ↔ Umfang der letzten 7 Tage
  {
    const rows = days.filter((x) => x.rhr != null);
    const med = median(rows.map((x) => x.rhr));
    const hi = rows.filter((x) => x.rhr > med), lo = rows.filter((x) => x.rhr <= med);
    const ok = hi.length >= 4 && lo.length >= 4;
    const mH = median(hi.map((x) => prevLoad(x.d, 7))), mL = median(lo.map((x) => prevLoad(x.d, 7)));
    res.push({
      k: 'rhr-load', ok, n: rows.length, effect: ok && mL ? (mH - mL) / Math.max(1, mL) : 0,
      title: 'Ruhepuls und Wochenumfang',
      text: ok ? 'Bei erhöhtem Ruhepuls (über ' + int(med) + ' bpm) lagen in den 7 Tagen davor im Median ' + num(mH, 1) + ' h Training, sonst ' + num(mL, 1) + ' h.' : 'Noch zu wenige Ruhepuls-Einträge (' + rows.length + ').',
      compare: 'Ruhepuls über deinem Median gegen darunter', basis: hi.length + ' gegen ' + lo.length + ' Journaltage',
    });
  }
  // Energie ↔ Schlaf
  {
    const rows = days.filter((x) => x.energy != null && x.sleep != null);
    const lo = rows.filter((x) => x.sleep < 7), hi = rows.filter((x) => x.sleep >= 7);
    const ok = lo.length >= 4 && hi.length >= 4;
    const mLo = median(lo.map((x) => x.energy)), mHi = median(hi.map((x) => x.energy));
    res.push({
      k: 'sleep-energy', ok, n: rows.length, effect: ok ? (mHi - mLo) / 2 : 0,
      title: 'Schlaf und Energie',
      text: ok ? 'Nach weniger als 7 h Schlaf hast du deine Energie im Median mit ' + num(mLo, 1) + ' von 5 bewertet, sonst mit ' + num(mHi, 1) + '.' : 'Noch zu wenige Tage mit Schlaf und Energie (' + rows.length + ').',
      compare: 'Tage mit < 7 h Schlaf gegen ≥ 7 h', basis: lo.length + ' gegen ' + hi.length + ' Journaltage',
    });
  }
  return res;
}

// ---------- Monatsrückblick ----------
export function monthlyReview(ym, ctx) {
  const { acts, segIdx, journal, edits, now = today() } = ctx;
  const start = ym + '-01';
  const [y, m] = ym.split('-').map(Number);
  const endFull = isoDate(new Date(y, m, 0));
  const partial = now < endFull;
  const end = partial ? now : endFull;
  const day = parseDate(end).getDate();
  const prevYm = isoDate(new Date(y, m - 2, 1)).slice(0, 7);
  const prevStart = prevYm + '-01';
  const prevEndFull = isoDate(new Date(y, m - 1, 0));
  const prevEnd = partial ? isoDate(new Date(y, m - 2, Math.min(day, parseDate(prevEndFull).getDate()))) : prevEndFull;
  const valid = acts.filter((a) => !a.excluded);
  const cur = valid.filter((a) => inRange(a, start, end));
  const prev = valid.filter((a) => inRange(a, prevStart, prevEnd));
  const A = aggregate(cur), B = aggregate(prev);
  const changes = [];
  const add = (k, label, a, b, f) => { if (a == null || b == null) return; changes.push({ k, label, a, b, f, diff: a - b, rel: b ? (a - b) / b : null }); };
  add('days', 'Aktive Tage', A.days, B.days, (v) => int(v));
  add('time', 'Trainingszeit', A.time, B.time, hours);
  add('gain', 'Höhenmeter (draußen)', A.gain, B.gain, (v) => hm(v) + ' Hm');
  add('dist', 'Distanz (draußen)', A.dist, B.dist, (v) => km(v) + ' km');
  const sportRows = SPORT_ORDER.map((s) => ({ s, a: A.bySport[s]?.time || 0, b: B.bySport[s]?.time || 0, ac: A.bySport[s]?.count || 0, bc: B.bySport[s]?.count || 0 })).filter((r) => r.a || r.b);
  const declines = [];
  for (const c of changes) if (c.diff < 0 && (c.rel == null || c.rel <= -0.1)) declines.push(c.label + ': ' + c.f(c.a) + ' statt ' + c.f(c.b));
  for (const r of sportRows) if (r.b - r.a >= 2 * 3600) declines.push(sportLabel(r.s) + ': ' + hours(r.a) + ' statt ' + hours(r.b) + ' (' + r.ac + ' statt ' + r.bc + ' Einheiten)');
  const ups = sportRows.filter((r) => r.a - r.b >= 2 * 3600), downs = sportRows.filter((r) => r.b - r.a >= 2 * 3600);
  let seasonNote = null;
  if (ups.length && downs.length) seasonNote = 'Saisonwechsel: weniger ' + downs.map((r) => sportLabel(r.s)).join(' und ') + ', mehr ' + ups.map((r) => sportLabel(r.s)).join(' und ') + '. Der Rückgang einzelner Sportarten ist teilweise Verlagerung.';
  // Bestleistungen
  const prs = cur.filter((a) => a.pr > 0).sort((a, b) => b.pr - a.pr).slice(0, 5);
  const segBests = [];
  for (const s of Object.values(segIdx || {})) {
    if (s.efforts.length < 3 || s.kind !== 'climb') continue;
    const inMonth = s.efforts.filter((e) => e.date >= start && e.date <= end);
    for (const e of inMonth) {
      const before = s.efforts.filter((x) => x.start < e.start);
      if (before.length >= 2 && e.mt < Math.min(...before.map((x) => x.mt))) segBests.push({ seg: s, e });
    }
  }
  const highlights = [];
  const byGain = cur.filter((a) => !a.indoor).sort((a, b) => b.gain - a.gain)[0];
  if (byGain && byGain.gain > 200) highlights.push({ label: 'Meiste Höhenmeter', act: byGain, value: hm(byGain.gain) + ' Hm' });
  const byDist = cur.filter((a) => !a.indoor).sort((a, b) => b.dist - a.dist)[0];
  if (byDist && byDist !== byGain && byDist.dist > 5000) highlights.push({ label: 'Längste Strecke', act: byDist, value: km(byDist.dist) + ' km' });
  const byTime = cur.slice().sort((a, b) => b.mov - a.mov)[0];
  if (byTime && byTime !== byGain && byTime !== byDist) highlights.push({ label: 'Längste Einheit', act: byTime, value: dur(byTime.mov) });
  const media = [];
  for (const a of cur) for (const md of (edits[a.id]?.media || [])) media.push({ act: a, m: md });
  const jDays = Object.keys(journal || {}).filter((d) => d >= start && d <= end).length;
  const summary = buildMonthText(ym, A, B, partial, day, prevYm);
  return { ym, partial, day, start, end, prevYm, prevRange: [prevStart, prevEnd], A, B, changes, sportRows, declines, seasonNote, prs, segBests: segBests.slice(0, 5), highlights, media, jDays, summary, actIds: cur.map((a) => a.id) };
}

function buildMonthText(ym, A, B, partial, day, prevYm) {
  const pm = monthName(prevYm).split(' ')[0];
  const head = partial ? 'Zwischenstand nach ' + day + ' Tagen: ' : '';
  if (!A.count) return head + 'Keine Aktivitäten erfasst.';
  const top = Object.entries(A.bySport).sort((a, b) => b[1].time - a[1].time)[0];
  return head + 'An ' + A.days + ' Tagen aktiv (' + pm + (partial ? ' bis Tag ' + day : '') + ': ' + B.days + '), ' + hours(A.time) + ' Training, ' + hm(A.gain) + ' Hm. Meiste Zeit: ' + sportLabel(top[0]) + ' mit ' + hours(top[1].time) + '.';
}

// ---------- Ziele ----------
export function goalProgress(g, acts, segIdx, now = today()) {
  if (g.kind === 'segment') {
    const s = segIdx?.[g.segId];
    const best = s?.best;
    const lastE = s?.last;
    const tgt = g.targetTime;
    return { value: best ? best.mt : null, last: lastE ? lastE.mt : null, target: tgt, pct: best && tgt ? Math.min(1, tgt / best.mt) : 0, done: best && tgt ? best.mt <= tgt : false, label: s ? s.name : 'Anstieg', n: s?.efforts.length || 0 };
  }
  const per = g.per || 'month';
  const p = periodOf(per === 'season' ? 'season' : per, now);
  const as = acts.filter((a) => !a.excluded && inRange(a, p.start, now) && (!g.sport || a.sport === g.sport));
  const agg = aggregate(as);
  const value = g.metric === 'gain' ? agg.gain : g.metric === 'dist' ? agg.dist / 1000 : g.metric === 'time' ? agg.time / 3600 : g.metric === 'days' ? agg.days : agg.count;
  const elapsed = daysBetween(p.start, now) + 1, total = daysBetween(p.start, p.end) + 1;
  const expected = g.target * (elapsed / total);
  return { value, target: g.target, pct: g.target ? Math.min(1, value / g.target) : 0, period: p, onTrack: value >= expected, expected, acts: as.map((a) => a.id), done: value >= g.target };
}
