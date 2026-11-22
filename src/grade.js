// Steigungen und Anstiege aus Distanz/Höhe/Zeit.
// Höhe wird auf ein gleichmäßiges Distanzraster gelegt und über 100 m geglättet,
// Steigungen immer über mindestens 100 m gemittelt – so erzeugt Höhenrauschen keine falschen Spitzen.

export const GRADE_CLASSES = [
  { max: 3, label: '< 3 %' }, { max: 6, label: '3–6 %' }, { max: 9, label: '6–9 %' }, { max: 12, label: '9–12 %' }, { max: Infinity, label: '> 12 %' },
];
export const gradeClass = (g) => (g < 3 ? 0 : g < 6 ? 1 : g < 9 ? 2 : g < 12 ? 3 : 4);
// Farben: unter 3 % grau, darüber Stufen der Aktivitätsfarbe (je steiler, desto kräftiger)
export const GRADE_COLORS = [
  'color-mix(in oklab, var(--neutral) 45%, var(--tile))',
  'color-mix(in oklab, var(--c-akt) 35%, var(--tile))',
  'color-mix(in oklab, var(--c-akt) 62%, var(--tile))',
  'color-mix(in oklab, var(--c-akt) 88%, var(--tile))',
  'color-mix(in oklab, var(--c-akt) 70%, var(--ink))',
];

// Gleichmäßiges Raster (step Meter) aus Rohdaten
export function toGrid({ d, alt, t }, step) {
  const P = [];
  for (let i = 0; i < (d ? d.length : 0); i++) if (d[i] != null && alt && alt[i] != null) P.push([d[i], alt[i], t ? t[i] : null]);
  if (P.length < 5) return null;
  const D = P[P.length - 1][0] - P[0][0];
  if (D < 500) return null;
  const n = Math.floor(D / step) + 1;
  const ga = new Array(n), gt = new Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const x = P[0][0] + k * step;
    while (j < P.length - 2 && P[j + 1][0] < x) j++;
    const [x0, a0, t0] = P[j], [x1, a1, t1] = P[j + 1];
    const f = x1 > x0 ? Math.max(0, Math.min(1, (x - x0) / (x1 - x0))) : 0;
    ga[k] = a0 + (a1 - a0) * f;
    gt[k] = t0 != null && t1 != null ? t0 + (t1 - t0) * f : null;
  }
  return { step, d0: P[0][0], alt: ga, t: gt, spacing: D / Math.max(1, P.length - 1) };
}

export function gradeModel(grid) {
  if (!grid) return null;
  const { step, d0 } = grid;
  const n = grid.alt.length;
  const w = Math.max(1, Math.round(50 / step));
  const as = new Array(n);
  let sum = 0, cnt = 0;
  // gleitendes Mittel über ±50 m
  for (let k = 0; k < n; k++) {
    let s = 0, c = 0;
    for (let q = Math.max(0, k - w); q <= Math.min(n - 1, k + w); q++) { s += grid.alt[q]; c++; }
    as[k] = s / c;
  }
  const dist = (k) => d0 + k * step;
  const gradeAt = (k) => { const a = Math.max(0, k - w), b = Math.min(n - 1, k + w); return b > a ? ((as[b] - as[a]) / ((b - a) * step)) * 100 : 0; };
  // 100-m-Abschnitte
  const m = Math.max(1, Math.round(100 / step));
  const segs = [];
  for (let k = 0; k + m < n; k += m) { const dz = as[k + m] - as[k]; segs.push({ k0: k, k1: k + m, d0: dist(k), d1: dist(k + m), dz, g: (dz / (m * step)) * 100 }); }
  let upH = 0, upD = 0, dnH = 0, dnD = 0, steep = null, steepDn = null;
  for (const s of segs) {
    if (s.dz > 0) { upH += s.dz; upD += s.d1 - s.d0; } else if (s.dz < 0) { dnH -= s.dz; dnD += s.d1 - s.d0; }
    if (!steep || s.g > steep.g) steep = s;
    if (!steepDn || s.g < steepDn.g) steepDn = s;
  }
  // Anstiege: vom Tiefpunkt bis zum Hochpunkt; Ende, wenn es deutlich abwärts geht oder lange flach bleibt
  const climbs = [];
  const fin = (i0, ip) => {
    const gain = as[ip] - as[i0], len = (ip - i0) * step;
    if (gain < 30 || len < 300 || (gain / len) * 100 < 3) return;
    let mx = -Infinity;
    for (const s of segs) if (s.k0 >= i0 && s.k1 <= ip && s.g > mx) mx = s.g;
    if (!isFinite(mx)) mx = (gain / len) * 100;
    const tt = grid.t[ip] != null && grid.t[i0] != null ? grid.t[ip] - grid.t[i0] : null;
    climbs.push({ i0, ip, d0: dist(i0), d1: dist(ip), len, gain, avg: (gain / len) * 100, max: mx, time: tt, vam: tt ? gain / (tt / 3600) : null, a0: as[i0], a1: as[ip] });
  };
  let i0 = 0, ip = 0;
  for (let k = 1; k < n; k++) {
    if (as[k] > as[ip]) ip = k;
    if (as[ip] - as[i0] < 10 && as[k] < as[i0]) { i0 = k; ip = k; continue; }
    const drop = as[ip] - as[k], flat = (k - ip) * step;
    if (drop > Math.max(15, 0.15 * (as[ip] - as[i0])) || flat > 1000) {
      fin(i0, ip);
      let lo = ip; for (let q = ip; q <= k; q++) if (as[q] < as[lo]) lo = q;
      i0 = lo; ip = lo;
      for (let q = lo; q <= k; q++) if (as[q] > as[ip]) ip = q;
    }
  }
  fin(i0, ip);
  return {
    step, d0, n, as, dist, gradeAt, segs, climbs, steep, steepDn,
    up: { h: upH, d: upD, avg: upD ? (upH / upD) * 100 : null },
    down: { h: dnH, d: dnD, avg: dnD ? -(dnH / dnD) * 100 : null },
    spacing: grid.spacing,
  };
}

// Speicherbares Raster (50 m) aus voller Auflösung
export function compactGrid(st) {
  const g = toGrid(st, 50);
  if (!g) return null;
  return { step: 50, d0: g.d0, alt: g.alt.map((v) => Math.round(v * 10) / 10), t: g.t.map((v) => (v == null ? null : Math.round(v))), spacing: Math.round(g.spacing * 10) / 10, src: 'full', at: Date.now() };
}
