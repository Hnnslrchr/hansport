// Datenaufbereitung für Detailgraphen: Zeiträume, Bündelung, Trends, Kennwerte.
// Rechnet nur mit vorhandenen Messwerten; Lücken bleiben Lücken.

export const DAY = 864e5;
export const tOf = (iso) => Date.parse(iso + 'T12:00:00Z');
export const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
export const addD = (iso, n) => isoOf(tOf(iso) + n * DAY);

export const PERIODS = {
  d: { label: 'Tag', short: 'T', days: 1 },
  w: { label: 'Woche', short: 'W', days: 7 },
  m: { label: 'Monat', short: 'M', days: 30 },
  h: { label: '6 Monate', short: '6M', days: 182, bucket: 'week' },
  y: { label: 'Jahr', short: 'J', days: 365, bucket: 'week' },
};

// Zeitfenster [von, bis] (ISO-Daten inklusive) und Vorzeitraum
export function windowOf(p, end) {
  const n = PERIODS[p].days;
  const from = addD(end, -(n - 1));
  return { from, to: end, prevFrom: addD(from, -n), prevTo: addD(from, -1), n };
}

const MO = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MOD = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const dShort = (iso) => { const d = new Date(tOf(iso)); return d.getUTCDate() + '. ' + MOD[d.getUTCMonth()]; };
export const dWeek = (iso) => { const d = new Date(tOf(iso)); return WD[d.getUTCDay()] + '., ' + d.getUTCDate() + '. ' + MOD[d.getUTCMonth()]; };
export const dYear = (iso) => { const d = new Date(tOf(iso)); return d.getUTCDate() + '. ' + MOD[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
export const monthOf = (iso) => MO[new Date(tOf(iso)).getUTCMonth()];

// Zeitachsen-Marken passend zum Zeitraum
export function timeTicks(p, from, to) {
  const out = [];
  if (p === 'w') {
    for (let s = from; s <= to; s = addD(s, 1)) out.push({ t: tOf(s), label: WD[new Date(tOf(s)).getUTCDay()] });
  } else if (p === 'm') {
    for (let s = to; s >= from; s = addD(s, -7)) out.unshift({ t: tOf(s), label: new Date(tOf(s)).getUTCDate() + '.' + (new Date(tOf(s)).getUTCMonth() + 1) + '.' });
  } else {
    // Monatsanfänge
    const a = new Date(tOf(from)); a.setUTCDate(1); a.setUTCMonth(a.getUTCMonth() + 1);
    for (; a.getTime() <= tOf(to); a.setUTCMonth(a.getUTCMonth() + 1)) {
      const t = a.getTime() - 12 * 3600e3 + 12 * 3600e3; // Mittag
      out.push({ t, label: MO[a.getUTCMonth()] });
    }
    if (p === 'y' && out.length > 8) out.forEach((x, i) => { if (i % 2) x.label = ''; });
  }
  return out;
}

// Werte je Tag aus der Liste der Gesundheitstage
export function daily(list, get, from, to) {
  const out = [];
  for (const r of list) {
    if (r.date < from || r.date > to) continue;
    const v = get(r);
    if (v != null && !Number.isNaN(v)) out.push({ date: r.date, t: tOf(r.date), v, r });
  }
  return out;
}

// Wochenbündel (Montag als Start): mean/min/max/n
export function weekly(points, agg = 'mean') {
  const by = new Map();
  for (const p of points) {
    const d = new Date(p.t); const wd = (d.getUTCDay() + 6) % 7;
    const k = isoOf(p.t - wd * DAY);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, ps]) => {
    const vs = ps.map((p) => p.v);
    const sum = vs.reduce((a, b) => a + b, 0);
    return { date: k, t: tOf(k) + 3 * DAY, v: agg === 'sum' ? sum : sum / vs.length, lo: Math.min(...vs), hi: Math.max(...vs), n: vs.length, to: addD(k, 6), ps };
  });
}

export function stats(points) {
  if (!points.length) return null;
  let min = points[0], max = points[0], sum = 0;
  for (const p of points) { sum += p.v; if (p.v < min.v) min = p; if (p.v > max.v) max = p; }
  return { mean: sum / points.length, min, max, n: points.length, first: points[0], last: points[points.length - 1] };
}

// Gleitendes Mittel über die letzten `days` Tage (nur vorhandene Werte).
// Liegt zwischen zwei Messungen mehr als `gap` Tage, bricht die Linie ab (null-Eintrag).
export function rolling(points, days = 7, gap = 10) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0 && p.t - points[i - 1].t > gap * DAY) out.push({ t: (p.t + points[i - 1].t) / 2, v: null });
    let s = 0, n = 0;
    for (let j = i; j >= 0 && p.t - points[j].t < days * DAY; j--) { s += points[j].v; n++; }
    out.push({ t: p.t, date: p.date, v: s / n, n });
  }
  return out;
}

// „schöne“ Achsenschritte
export function niceTicks(lo, hi, count = 4, int = false) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = (int ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map((m) => Math.max(int ? 1 : 0, m * mag)).find((s) => s >= raw) || 10 * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step / 1e6; v += step) ticks.push(+v.toFixed(6));
  return { min: a, max: b, step, ticks };
}

// Minuten → „7:20“
export const hmm = (m) => (m == null ? '–' : Math.floor(m / 60) + ':' + String(Math.round(m % 60)).padStart(2, '0'));
// "HH:MM" → Minuten auf einer Nacht-Achse (Mittag = 720; nach Mitternacht +1440)
export const nightMin = (s) => { if (!s) return null; const [h, m] = s.split(':').map(Number); const v = h * 60 + m; return v < 720 ? v + 1440 : v; };
export const clockOfMin = (m) => { const v = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
