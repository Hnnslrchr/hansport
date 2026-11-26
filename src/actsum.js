// Kennzahlen je Sportart aus den Zeitreihen einer Aktivität (Runde 6).
// Wird beim Laden der Zeitreihen berechnet und kompakt in perf/<id>.sum gespeichert,
// damit Listenzeilen und Karten sie ohne erneutes Laden zeigen können.
import { computeSections, pauseIntervals } from './sections.js';
import { toGrid, gradeModel } from './grade.js';
import { dsport } from './sports.js';

export const SUM_V = 3;
const R = (v, k = 0) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** k) / 10 ** k);
const hav = (p, q) => {
  const rad = Math.PI / 180, dLat = (q[0] - p[0]) * rad, dLng = (q[1] - p[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(p[0] * rad) * Math.cos(q[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
};
const smoothArr = (a, k) => a.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(a.length - 1, i + k); j++) if (a[j] != null) { s += a[j]; c++; } return c ? s / c : null; });

// Abfahrten: alles zwischen zwei Liftfahrten, das mehr als 60 Hm verliert
export function snowRuns(secs) {
  const runs = [];
  let cur = null, lifts = 0;
  const close = () => { if (cur && cur.hm > 60) runs.push(cur); cur = null; };
  for (const s of secs.slice().sort((a, b) => a.i0 - b.i0)) {
    // Lift: vorhandene Lifterkennung; ein „Aufstieg“ über 80 Hm mit ≥ 500 Hm/h (inkl. Wartezeit) ist beim Snowboarden ebenfalls ein Lift
    if (s.type === 'lift' || (s.type === 'walkup' && s.net >= 80 && (s.rate || 0) >= 500)) { lifts++; close(); continue; }
    if (s.type === 'run' || s.type === 'descent') {
      cur = cur || { hm: 0, d: 0, t: 0, i0: s.i0, i1: s.i1 };
      cur.hm += s.loss; cur.d += s.dist; cur.t += s.mov; cur.i1 = s.i1;
    }
  }
  close();
  return { runs, lifts };
}

// Beste mittlere Leistung über w Sekunden (zeitgewichtet, auch bei ungleichmäßigen Abständen)
function bestAvg(t, y, w) {
  if (!t || t[t.length - 1] - t[0] < w) return null;
  let best = null, j = 0, acc = 0;
  const seg = (i) => (y[i] || 0) * (t[i] - t[i - 1]);
  for (let i = 1; i < t.length; i++) {
    acc += seg(i);
    while (j < i - 1 && t[i] - t[j + 1] >= w) { acc -= seg(j + 1); j++; }
    const span = t[i] - t[j];
    if (span >= w * 0.98) { const v = acc / span; if (best == null || v > best) best = v; }
  }
  return best;
}

export const W_BINS = [150, 200, 250, 300];

export function actSummary(a, s, { sections, full = false } = {}) {
  if (!a || !s || !s.t || s.t.length < 5) return null;
  const sp = dsport(a);
  const out = { v: SUM_V, n: s.t.length, full: !!full };
  const pauses = pauseIntervals(s);
  if (s.alt && s.alt.some((v) => v != null)) {
    let hi = -1, lo = -1;
    for (let i = 0; i < s.alt.length; i++) { const v = s.alt[i]; if (v == null) continue; if (hi < 0 || v > s.alt[hi]) hi = i; if (lo < 0 || v < s.alt[lo]) lo = i; }
    out.top = { alt: R(s.alt[hi]), d: s.d ? R(s.d[hi]) : null, t: R(s.t[hi]), ll: s.ll && s.ll[hi] ? [R(s.ll[hi][0], 5), R(s.ll[hi][1], 5)] : null };
    out.low = R(s.alt[lo]);
  }
  if (s.ll && s.ll.length > 1) {
    const p0 = s.ll.find((p) => p), p1 = s.ll.slice().reverse().find((p) => p);
    if (p0 && p1) out.loop = hav(p0, p1) < 300;
  }
  // Bergauf: Zeit in Bewegung und Höhenmeter, solange es (geglättet) aufwärts geht
  if (s.alt && (sp === 'hike' || sp === 'splitboard' || sp === 'mtb' || sp === 'other')) {
    const al = smoothArr(s.alt, s.t.length > 400 ? 3 : 1);
    let upT = 0, upH = 0;
    for (let i = 1; i < al.length; i++) {
      if (pauses.has(i) || al[i] == null || al[i - 1] == null) continue;
      const da = al[i] - al[i - 1];
      if (da > 0.3) { upT += s.t[i] - s.t[i - 1]; upH += da; }
    }
    if (upT > 300) out.up = { h: R(upH), t: R(upT), rate: R((upH / upT) * 3600) };
  }
  const secs = sections || (s.alt ? computeSections(s, a.sport) : []);
  if (sp === 'snowboard') {
    const { runs, lifts } = snowRuns(secs);
    out.runs = runs.map((r) => [R(r.hm), R(r.d), R(r.t)]);
    out.lifts = lifts;
  }
  if (sp === 'splitboard') {
    let gain = 0, t = 0;
    for (const x of secs) if (x.type === 'ascent' || x.type === 'walkup') { gain += x.gain; t += x.mov; }
    if (t > 300) out.up = { h: R(gain), t: R(t), rate: R((gain / t) * 3600) };
  }
  if ((sp === 'road' || sp === 'mtb' || sp === 'hike' || sp === 'other') && s.alt && s.d) {
    try {
      const gm = gradeModel(toGrid({ d: s.d, alt: s.alt, t: s.t }, 20));
      if (gm) {
        out.maxG = gm.steep ? R(gm.steep.g, 1) : null;
        const c = gm.climbs.slice().sort((x, y) => y.gain - x.gain)[0];
        if (c) out.climb = { d0: R(c.d0), d1: R(c.d1), len: R(c.len), gain: R(c.gain), avg: R(c.avg, 1), vam: R(c.vam) };
      }
    } catch (e) { /* keine Steigungen */ }
  }
  if (s.w && s.w.some((v) => v > 0)) {
    const bins = [0, 0, 0, 0, 0];
    let tot = 0, work = 0;
    for (let i = 1; i < s.t.length; i++) {
      const dt = s.t[i] - s.t[i - 1], w = s.w[i];
      if (w == null || dt <= 0 || dt > 120) continue;
      work += w * dt;
      if (w <= 0) continue;
      let b = 0; while (b < W_BINS.length && w >= W_BINS[b]) b++;
      bins[b] += dt; tot += dt;
    }
    if (tot) out.wd = bins.map((x) => R((x / tot) * 100));
    out.kj = R(work / 1000);
    out.b20 = R(bestAvg(s.t, s.w, 1200));
    out.b60 = R(bestAvg(s.t, s.w, 3600));
  }
  if (sp === 'other' && a.sub && /Lauf/.test(a.sub) && s.d) {
    const km = [];
    let last = 0, lastT = s.t[0];
    for (let i = 1; i < s.d.length; i++) {
      while (s.d[i] != null && s.d[i] >= (km.length + 1) * 1000) {
        const target = (km.length + 1) * 1000, f = (target - s.d[i - 1]) / Math.max(1e-6, s.d[i] - s.d[i - 1]);
        const tt = s.t[i - 1] + f * (s.t[i] - s.t[i - 1]);
        km.push(R(tt - lastT)); lastT = tt; last = target;
      }
    }
    if (km.length) out.km = km;
  }
  return out;
}
