// Gesundheit: Zustand auf einen Blick, Bento nach Gruppen, Langzeit, Zusammenhänge, Wochenmuster.
import { heroOpen } from '../ui/hp.jsx';
import { h, Fragment } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { Ico, usePullToRefresh, PtrIndicator, Stages } from '../ui/hp.jsx';
import { TimeChart, Line, Points, Bars, Band, RefLine, Seg2, Legend } from '../ui/viz.jsx';
import { daily, weekly, stats, niceTicks, tOf, addD, dShort, hmm, nightMin, DAY, isoOf } from '../viz-data.js';
import { healthDays, healthMeta, todayLocal } from '../health.js';
import { M, latest } from '../metrics.js';
import { num, lastMeas, dayMon, NB } from '../format.js';
import { DayBars, MeasureLine } from '../ui/r5.jsx';
import { push } from '../nav.js';
import { getState } from '../store.js';
import { useStatus, useData } from './common.jsx';
import { refreshAll } from './today.jsx';
import { GROUP } from './metric.jsx';
import { WEB } from '../env.js';

const n0 = (v) => num(v, 0), n1 = (v) => num(v, 1);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : null; };
const bandOf = (b) => (b && b[0] != null && b[1] != null ? [b[0] - b[1], b[0] + b[1]] : null);
const FRESH = { weight: 21, fatPct: 21, muscle: 21, vo2: 30 };

// Status einer Kennzahl: Wert, Normalbereich, Lage, Trend gegenüber den letzten 28 Tagen
function statusOf(H, k, today) {
  const m = M[k];
  const l = latest(H.list, k, today);
  if (!m || !l) return null;
  const age = Math.round((tOf(today) - tOf(l.date)) / DAY);
  const prev = daily(H.list, m.get, addD(l.date, -90), addD(l.date, -1)).map((q) => q.v);
  const p28 = daily(H.list, m.get, addD(l.date, -28), addD(l.date, -1)).map((q) => q.v);
  let range = null, rangeSrc = null;
  const b = l.r.base && { rhr: l.r.base.rhr, hrv: l.r.base.hrv, resp: l.r.base.resp }[k];
  if (b) { range = bandOf(b); rangeSrc = WEB ? 'eigene 90 Tage' : 'athletedata'; } else if (prev.length >= 10) { const mu = mean(prev), s = sd(prev); range = [mu - s, mu + s]; rangeSrc = 'eigene 90 Tage'; }
  if (k === 'akcal') { range = null; rangeSrc = null; }
  const pos = range ? (l.v < range[0] ? 'low' : l.v > range[1] ? 'high' : 'in') : null;
  const bad = pos && pos !== 'in' && (m.better === 'up' ? pos === 'low' : m.better === 'down' ? pos === 'high' : true);
  let trend = null;
  if (p28.length >= 7 && k !== 'akcal') { const mu = mean(p28), s = sd(p28) || 1, d = l.v - mu; trend = { d, mu, dir: Math.abs(d) < 0.5 * s ? 0 : d > 0 ? 1 : -1 }; }
  const stale = age > (FRESH[k] || 3);
  return { k, m, v: l.v, date: l.date, r: l.r, age, stale, range, rangeSrc, pos, bad, trend };
}

const POS = { low: 'darunter', in: 'im Bereich', high: 'darüber' };
const GL = ['rhr', 'hrv', 'resp', 'sleep', 'slScore', 'bb', 'stress', 'weight'];

const GL_NAME = { resp: 'Atmung', sleep: 'Schlaf', slScore: 'Schlafscore', bb: 'Body Battery', weight: 'Gewicht' };
function Glance({ S }) {
  const act = S.filter((s) => s && !s.stale && s.pos);
  const inR = act.filter((s) => s.pos === 'in').length;
  const odd = act.filter((s) => s.bad);
  const txt = !act.length ? 'Noch zu wenige Daten für eine Einordnung.'
    : `${inR} von ${act.length} Werten liegen in deinem persönlichen Normalbereich.` + (odd.length ? ' Auffällig: ' + odd.map((s) => `${s.m.label} ${POS[s.pos]}`).join(', ') + '.' : ' Nichts fällt aus dem Rahmen.');
  const gs = [...new Set(S.filter(Boolean).map((s) => GROUP[s.k] || 'trn'))].filter((g) => g !== 'trn').slice(0, 3);
  const gv = gs.map((g, i) => `--gc${i + 1}:var(--glow-${g});--ga${i + 1}:var(--ga-${g})`).join(';');
  return (
    <div class={'t2 glance glow multi' + (odd.length ? ' gl-hi' : '')} style={gv}>
      <div class="lbl2">Zustand heute</div>
      <p class="say2" style="margin-top:6px">{txt}</p>
      <div class="gl-list">
        {S.filter(Boolean).map((s) => (
          <button type="button" class={'gl-li g-' + (GROUP[s.k] || 'trn') + (s.stale ? ' stale' : s.bad ? ' bad' : '')} onClick={() => push('metric', { k: s.k })} aria-label={s.m.label + ' ' + s.m.fmt(s.v) + ' ' + (s.m.unit || '') + ', ' + (s.stale ? lastMeas(s.date) : s.pos ? POS[s.pos] : 'ohne Bereich')}>
            <Ico n={s.m.icon} />
            <span class="nm">{GL_NAME[s.k] || s.m.label}</span>
            <span class="vv">{s.m.fmt(s.v)}{s.m.unit && s.m.unit !== '/100' ? <small>{s.m.unit}</small> : null}</span>
            <span class="ps">{s.stale ? lastMeas(s.date) : s.pos ? (s.pos === 'high' ? '▲ ' : s.pos === 'low' ? '▼ ' : '● ') + POS[s.pos] : 'ohne Bereich'}</span>
          </button>
        ))}
      </div>
      <div class="sub2" style="margin-top:10px">Bereich: Mittel ± 1 Standardabweichung deiner {WEB ? 'eigenen' : ''} letzten 90 Tage{WEB ? '' : ' (Ruhepuls, HRV, Atmung von athletedata)'}.</div>
    </div>
  );
}

// ---------- Schlafenszeiten: Uhrzeit-Leiste der letzten 7 Nächte (Einschlafen bis Aufwachen) ----------
const clk = (m) => { const v = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
const WD1 = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function SleepWindows({ H, today, avgStart }) {
  const rows = [];
  for (let j = 6; j >= 0; j--) {
    const d = addD(today, -j), r = H.map[d], sl = r && r.sl;
    const a = sl && sl.start ? nightMin(sl.start) : null, b = sl && sl.end ? nightMin(sl.end) : null;
    rows.push({ d, a, b: a != null && b != null && b < a ? b + 1440 : b });
  }
  const ok = rows.filter((x) => x.a != null && x.b != null);
  if (!ok.length) return null;
  const lo = Math.floor(Math.min(...ok.map((x) => x.a)) / 60) * 60, hi = Math.ceil(Math.max(...ok.map((x) => x.b)) / 60) * 60;
  const span = Math.max(60, hi - lo);
  const pos = (m) => ((m - lo) / span) * 100;
  const step = span > 600 ? 240 : span > 360 ? 180 : 120;
  const ticks = []; for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const avgEnd = ok.reduce((s, x) => s + x.b, 0) / ok.length;
  const last = rows.length - 1;
  return (
    <div class="swin" role="img" aria-label={'Schlafenszeiten der letzten 7 Nächte: ' + rows.map((x) => WD1[new Date(x.d + 'T12:00:00').getDay()] + ' ' + (x.a != null ? clk(x.a) + ' bis ' + clk(x.b) : 'keine Daten')).join(', ')}>
      <div class="swin-plot">
        <span class="swin-avg" style={{ left: pos(avgStart) + '%' }} />
        <span class="swin-avg" style={{ left: pos(avgEnd) + '%' }} />
        {rows.map((x, i) => (
          <div class="swin-row">
            <span class={'swin-d' + (i === last ? ' on' : '')}>{WD1[new Date(x.d + 'T12:00:00').getDay()]}</span>
            <span class="swin-tr">{x.a != null && x.b != null ? <i class={i === last ? 'on' : ''} style={{ left: pos(x.a) + '%', width: Math.max(2, pos(x.b) - pos(x.a)) + '%' }} /> : null}</span>
          </div>
        ))}
      </div>
      <div class="swin-ax">{ticks.map((t) => <span style={{ left: pos(t) + '%' }}>{clk(t).slice(0, 2)}</span>)}</div>
      <div class="swin-leg"><i />Ø {clk(avgStart)} – {clk(avgEnd)}</div>
    </div>
  );
}

// ---------- Mini-Graphen (ohne Achsen; Werte stehen in der Kachel) ----------
function MiniDots({ pts, band, w = 300, hgt = 64 }) {
  if (pts.length < 2) return <div style={`height:${hgt / 2}px`} />;
  const vs = pts.map((q) => q.v).concat(band || []);
  const lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const X = (t) => 5 + ((t - t0) / (t1 - t0 || 1)) * (w - 10), Y = (v) => 6 + (1 - (v - lo) / sp) * (hgt - 12);
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} class="mini" aria-hidden="true">
      {band ? <rect x="0" y={Y(band[1])} width={w} height={Y(band[0]) - Y(band[1])} fill="var(--c)" fill-opacity=".14" rx="3" /> : null}
      {pts.map((q, i) => <circle cx={X(q.t)} cy={Y(q.v)} r={i === pts.length - 1 ? 4 : 2.6} fill={i === pts.length - 1 ? 'var(--c)' : band && (q.v < band[0] || q.v > band[1]) ? 'var(--ink)' : 'var(--neutral)'} />)}
    </svg>
  );
}
function MiniBars({ vals, line, w = 300, hgt = 64, max }) {
  const mx = max || Math.max(1, ...vals.map((q) => q.v || 0), line || 0);
  const bw = w / vals.length;
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} class="mini" aria-hidden="true">
      {vals.map((q, i) => { const hh = q.v ? Math.max(2, (q.v / mx) * (hgt - 4)) : 0; return hh ? <rect x={i * bw + bw * 0.2} y={hgt - hh} width={bw * 0.6} height={hh} rx="3" fill={i === vals.length - 1 ? 'var(--c)' : 'var(--neutral)'} /> : <rect x={i * bw + bw * 0.2} y={hgt - 2} width={bw * 0.6} height="2" rx="1" fill="var(--tile-2)" />; })}
      {line ? <line x1="0" x2={w} y1={hgt - (line / mx) * (hgt - 4)} y2={hgt - (line / mx) * (hgt - 4)} stroke="var(--ink)" stroke-dasharray="4 3" stroke-width="1.2" /> : null}
    </svg>
  );
}
function MiniLine({ pts, w = 300, hgt = 64 }) {
  if (pts.length < 2) return <div style={`height:${hgt / 2}px`} />;
  const vs = pts.map((q) => q.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1, t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const X = (t) => 4 + ((t - t0) / (t1 - t0 || 1)) * (w - 8), Y = (v) => 6 + (1 - (v - lo) / sp) * (hgt - 12);
  const d = pts.map((q, i) => (i ? 'L' : 'M') + X(q.t).toFixed(1) + ',' + Y(q.v).toFixed(1)).join('');
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} class="mini" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--c)" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <circle cx={X(pts[pts.length - 1].t)} cy={Y(pts[pts.length - 1].v)} r="3.5" fill="var(--c)" />
    </svg>
  );
}

function Tile({ s, wide, children, sub }) {
  if (!s) return null;
  const { m } = s;
  const tr = s.stale ? null : s.trend;
  return (
    <button type="button" class={'t2 htile glow g-' + (GROUP[s.k] || 'trn') + (wide ? ' w2' : '') + (s.bad ? ' gl-hi' : '')} style={wide ? '--gx:100%;--gy:100%;--gs:55% 120%' : '--gx:100%;--gy:100%'} onClick={(e) => heroOpen(e.currentTarget, m.label + ', Details', () => push('metric', { k: s.k }))} aria-label={m.label + ', Details'}>
      <div class="t2-h"><Ico n={m.icon} /><span class="lb">{m.label}</span>{s.pos && !s.stale ? <span class={'pos ' + s.pos + (s.bad ? ' bad' : '')}>{POS[s.pos]}</span> : null}</div>
      <div class="hv"><span class="mid2">{m.fmt(s.v)}<small>{m.unit}</small></span>
        {tr ? <span class="trd" title="gegenüber Ø der letzten 28 Tage">{tr.dir > 0 ? '↑' : tr.dir < 0 ? '↓' : '→'} {tr.d > 0 ? '+' : tr.d < 0 ? '−' : '±'}{m.fmt(Math.abs(tr.d))}</span> : null}</div>
      {children ? <div class="t2-g">{children}</div> : null}
      <div class="sub2">{sub || lastMeas(s.date)}{tr ? ' · Ø 28 Tage ' + m.fmt(tr.mu) : ''}</div>
    </button>
  );
}

// ---------- Langzeit, Zusammenhänge, Wochenmuster ----------
const pearson = (xs, ys) => { const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; } return b && c ? a / Math.sqrt(b * c) : 0; };
const rWord = (r) => { const a = Math.abs(r); return a < 0.1 ? 'keinen erkennbaren' : a < 0.3 ? 'einen schwachen' : a < 0.5 ? 'einen mittleren' : 'einen deutlichen'; };

function LongTerm({ H, end }) {
  const [k, setK] = useState('rhr');
  const [sel, setSel] = useState(null);
  const m = M[k];
  const from = addD(end, -364);
  const all = daily(H.list, m.get, from, end);
  const pts = k === 'vo2' || k === 'weight' ? all : weekly(all).map((b) => ({ ...b, v: Math.round(b.v * 10) / 10 }));
  const st = stats(pts);
  const x = { min: tOf(from), max: tOf(end), ticks: [] };
  { const a = new Date(tOf(from)); a.setUTCDate(1); a.setUTCMonth(a.getUTCMonth() + 1); for (let i = 0; a.getTime() <= tOf(end); a.setUTCMonth(a.getUTCMonth() + 1), i++) x.ticks.push({ t: a.getTime(), label: i % 2 ? '' : ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][a.getUTCMonth()] }); }
  const y = pts.length ? niceTicks(Math.min(...pts.map((q) => q.v)) - 1, Math.max(...pts.map((q) => q.v)) + 1, 4, true) : null;
  const weeks = pts.length;
  let say = '';
  if (st && weeks >= 4) {
    const firstN = pts.slice(0, Math.min(3, pts.length)), lastN = pts.slice(-Math.min(3, pts.length));
    const d = mean(lastN.map((q) => q.v)) - mean(firstN.map((q) => q.v));
    const better = m.better === 'down' ? d < 0 : m.better === 'up' ? d > 0 : null;
    say = `Seit ${dShort(pts[0].date)}: ${d > 0 ? '+' : d < 0 ? '−' : '±'}${n1(Math.abs(d))} ${m.unit} (Mittel der ersten und letzten ${firstN.length} ${k === 'vo2' || k === 'weight' ? 'Messungen' : 'Wochen'}).` + (better == null || Math.abs(d) < ({ rhr: 1.5, hrv: 3, vo2: 1, weight: 0.5 }[k] || 0) ? ' Bisher ohne klare Richtung.' : better ? ' Die Richtung spricht für bessere Fitness.' : ' Die Richtung spricht eher gegen einen Fitnessgewinn.');
  }
  return (
    <div class={'g-' + (GROUP[k] || 'trn')}>
      <Seg2 value={k} onChange={(v) => { setK(v); setSel(null); }} label="Kennzahl" options={[['rhr', 'Ruhepuls'], ['hrv', 'HRV'], ['vo2', 'VO2max'], ['weight', 'Gewicht']]} />
      <div class="t2" style="padding:8px 10px 6px;margin-top:10px">
        {pts.length >= 2 ? (
          <TimeChart height={170} x={x} y={y} unit={m.unit} label={m.label + ' über ein Jahr'} snap={pts} sel={sel} onSel={setSel} marks={(q) => [{ v: q.v, color: 'var(--c)' }]} animKey={k}
            layers={(s) => [<Line s={s} data={pts} color="var(--c)" width={2} />, <Points s={s} data={pts} color="var(--c)" r={3} />]} />
        ) : <div class="empty2">Zu wenige Werte für einen Langzeittrend. Er erscheint, sobald mehr Tage abgeglichen sind.</div>}
      </div>
      <p class="say2">{sel ? `${k === 'vo2' || k === 'weight' ? dShort(sel.date) : 'Woche ab ' + dShort(sel.date)}: ${m.fmt(sel.v)} ${m.unit}. ` : ''}{weeks < 4 ? `Erst ${weeks} ${k === 'vo2' || k === 'weight' ? 'Messungen' : 'Wochen'} mit Daten${all.length ? ' (ab ' + dShort(all[0].date) + ')' : ''} – der Trend wird mit jeder Woche aussagekräftiger.` : say}</p>
    </div>
  );
}

function Relations({ H, end, acts }) {
  const [k, setK] = useState('load');
  const [sel, setSel] = useState(null);
  const R = useMemo(() => {
    if (k === 'load') {
      const P = [];
      for (const r of H.list) { if (r.date > end || r.hrv == null) continue; const nx = H.map[addD(r.date, 1)]; if (!nx || nx.hrv == null) continue; P.push({ x: r.load || 0, y: nx.hrv, date: r.date }); }
      return { P, xl: 'Belastung am Tag', xu: 'Last', yl: 'HRV am Folgetag', yu: 'ms', g: 'erh', hi: (x, d) => `An Tagen mit hoher Belastung (oberes Drittel, ab ${num(x, 0)}) lag deine HRV am Folgetag im Mittel ${d}ms ${''}gegenüber den Tagen mit der geringsten Belastung.` };
    }
    if (k === 'sleep') {
      const P = []; for (const r of H.list) { const v = M.rec.get(r); if (r.date <= end && r.sl && r.sl.total && v != null) P.push({ x: r.sl.total / 60, y: v, date: r.date }); }
      return { P, xl: 'Schlafdauer', xu: 'h', yl: 'Bereitschaft am Morgen', yu: '/100', g: 'sch', hi: (x, d) => `Nach den längsten Nächten (oberes Drittel, ab ${num(x, 1)} h) lag deine Bereitschaft im Mittel ${d}Punkte gegenüber den kürzesten Nächten.` };
    }
    // Trainingsumfang je Woche ↔ Gewichtsänderung zur Vorwoche
    const wk = (iso) => { const d = new Date(tOf(iso)); return isoOf(tOf(iso) - ((d.getUTCDay() + 6) % 7) * DAY); };
    const vol = {}; for (const a of acts) { if (a.excluded) continue; const w = wk(a.date); vol[w] = (vol[w] || 0) + (a.mov || 0) / 3600; }
    const wt = {}; for (const r of H.list) if (r.wi && r.wi.weight) { const w = wk(r.date); (wt[w] = wt[w] || []).push(r.wi.weight); }
    const P = []; for (const w of Object.keys(wt)) { const pw = isoOf(tOf(w) - 7 * DAY); if (!wt[pw]) continue; P.push({ x: vol[w] || 0, y: mean(wt[w]) - mean(wt[pw]), date: w }); }
    return { P, xl: 'Training pro Woche', xu: 'h', yl: 'Gewichtsänderung zur Vorwoche', yu: 'kg', g: 'kor', hi: (x, d) => `In Wochen mit viel Training (oberes Drittel, ab ${num(x, 1)} h) veränderte sich dein Gewicht im Mittel um ${d}kg gegenüber den Wochen mit wenig Training.` };
  }, [H, k, acts]);
  const P = R.P.map((p, i) => ({ ...p, t: p.x, v: p.y, i }));
  const enough = P.length >= (k === 'weight' ? 8 : 20) && new Set(P.map((p) => Math.round(p.x * 10))).size >= 5;
  const r = enough ? pearson(P.map((p) => p.x), P.map((p) => p.y)) : null;
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const xt = P.length ? niceTicks(Math.min(0, ...xs), Math.max(...xs), 4, k !== 'weight') : null;
  const yt = P.length ? niceTicks(Math.min(...ys), Math.max(...ys), 4, k !== 'weight') : null;
  let say = '';
  if (enough) {
    const sorted = [...P].sort((a, b) => a.x - b.x), third = Math.max(3, Math.floor(P.length / 3));
    const lo = sorted.slice(0, third), hi = sorted.slice(-third);
    const d = mean(hi.map((p) => p.y)) - mean(lo.map((p) => p.y));
    const f = (v) => (k === 'weight' ? num(v, 2) : num(v, 1));
    say = `Es gibt ${rWord(r)} Zusammenhang (r = ${num(r, 2)}, n = ${P.length}). ` + R.hi(hi[0].x, (d > 0 ? '+' : d < 0 ? '−' : '±') + f(Math.abs(d)) + ' ');
  }
  return (
    <div class={'g-' + R.g}>
      <Seg2 value={k} onChange={(v) => { setK(v); setSel(null); }} label="Zusammenhang" options={[['load', 'Last → HRV'], ['sleep', 'Schlaf → Bereitschaft'], ['weight', 'Umfang → Gewicht']]} />
      <div class="t2" style="padding:8px 10px 6px;margin-top:10px">
        {P.length >= 3 ? (
          <TimeChart height={190} x={{ min: xt.min, max: xt.max, ticks: xt.ticks.map((v) => ({ t: v, label: num(v, k === 'weight' ? 0 : 0) })) }} y={yt} unit={R.yu} label={R.yl + ' gegen ' + R.xl} snap={P} sel={sel} onSel={setSel} marks={(q) => [{ v: q.v, color: 'var(--c)' }]} animKey={k}
            yFmt={(v) => num(v, k === 'weight' ? 1 : 0)} layers={(s) => [k === 'weight' ? <RefLine s={s} v={0} /> : null, <Points s={s} data={P} color="var(--c)" r={3.5} />]} />
        ) : <div class="empty2">Noch zu wenige gemeinsame Tage. Ab 20 Tagen mit beiden Werten erscheint der Zusammenhang.</div>}
        <div class="sub2" style="text-align:right;margin:2px 4px 0">x: {R.xl} ({R.xu})</div>
      </div>
      <p class="say2">{sel ? `${dShort(sel.date)}: ${num(sel.x, 1)} ${R.xu} → ${num(sel.y, k === 'weight' ? 2 : 0)} ${R.yu}. ` : ''}{enough ? say + ' Das ist ein Zusammenhang, keine Ursache.' : `Für eine Aussage braucht es mindestens ${k === 'weight' ? 8 : 20} gemeinsame ${k === 'weight' ? 'Wochen' : 'Tage'} mit unterschiedlichen Werten; bisher ${P.length}.`}</p>
    </div>
  );
}

const WDN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
function Weekdays({ H, end }) {
  const [k, setK] = useState('sleep');
  const [sel, setSel] = useState(null);
  const cfg = { sleep: { get: (r) => (r.sl && r.sl.total ? r.sl.total : null), fmt: (v) => hmm(v), unit: 'h', g: 'sch', lab: 'Schlaf in der Nacht auf', better: 1 }, rec: { get: (r) => M.rec.get(r), fmt: n0, unit: '/100', g: 'erh', lab: 'Bereitschaft am', better: 1 }, hrv: { get: (r) => r.hrv, fmt: n0, unit: 'ms', g: 'erh', lab: 'HRV am', better: 1 } }[k];
  const by = [[], [], [], [], [], [], []];
  for (const q of daily(H.list, cfg.get, addD(end, -89), end)) by[(new Date(q.t).getUTCDay() + 6) % 7].push(q.v);
  const rows = by.map((a, i) => ({ t: i + 1, i, n: a.length, v: a.length ? mean(a) : null }));
  const valid = rows.filter((r) => r.v != null && r.n >= 3);
  const best = valid.length ? valid.reduce((a, b) => (b.v > a.v ? b : a)) : null, worst = valid.length ? valid.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const y = niceTicks(0, Math.max(1, ...valid.map((r) => r.v)), 4, true);
  return (
    <div class={'g-' + cfg.g}>
      <Seg2 value={k} onChange={(v) => { setK(v); setSel(null); }} label="Kennzahl" options={[['sleep', 'Schlaf'], ['rec', 'Bereitschaft'], ['hrv', 'HRV']]} />
      <div class="t2" style="padding:8px 10px 6px;margin-top:10px">
        {valid.length >= 4 ? (
          <TimeChart height={160} x={{ min: 0.5, max: 7.5, ticks: rows.map((r) => ({ t: r.t, label: WDN[r.i] })) }} y={y} unit={cfg.unit} label="Mittel je Wochentag" snap={valid} sel={sel} onSel={setSel} animKey={k} yFmt={k === 'sleep' ? (v) => num(v / 60, 0) : (v) => num(v, 0)}
            layers={(s) => [<Bars s={s} data={rows.map((r) => ({ t: r.t, v: r.n >= 3 ? r.v : null, hl: best && r.i === best.i }))} n={7} color="var(--c)" />]} />
        ) : <div class="empty2">Noch zu wenige Wochen für ein Muster. Es erscheint ab drei Werten je Wochentag.</div>}
      </div>
      <p class="say2">{sel ? `${WDN[sel.i]}: Ø ${cfg.fmt(sel.v)} ${cfg.unit} aus ${sel.n} Tagen. ` : ''}{best && worst && best !== worst ? `Am besten: ${k === 'sleep' ? 'Nacht auf ' : ''}${WDN[best.i]} (Ø ${cfg.fmt(best.v)} ${cfg.unit}), am schwächsten: ${k === 'sleep' ? 'Nacht auf ' : ''}${WDN[worst.i]} (Ø ${cfg.fmt(worst.v)} ${cfg.unit}). Letzte 90 Tage, nur Wochentage mit mindestens 3 Werten.` : ''}</p>
    </div>
  );
}

export function Health() {
  useStatus();
  const H = healthDays();
  const meta = healthMeta();
  const today = todayLocal();
  const d = useData();
  const scroller = useRef();
  usePullToRefresh(scroller, refreshAll);
  const S = useMemo(() => Object.fromEntries(['rhr', 'hrv', 'resp', 'vo2', 'sleep', 'slScore', 'bb', 'stress', 'rec', 'weight', 'fatPct', 'muscle', 'steps', 'im', 'kcal', 'akcal', 'tsb'].map((k) => [k, statusOf(H, k, today)])), [H, today]);
  const last7 = (get) => { const o = []; for (let j = 6; j >= 0; j--) { const r = H.map[addD(today, -j)]; o.push({ v: r ? get(r) : null }); } return o; };
  const days7 = (get) => { const o = []; for (let j = 6; j >= 0; j--) { const dd = addD(today, -j); const r = H.map[dd]; o.push({ date: dd, v: r ? get(r) ?? null : null }); } return o; };
  const weekIdx = (new Date(today + 'T12:00:00').getDay() + 6) % 7;
  const weekDays = (get) => { const o = []; for (let j = 0; j < 7; j++) { const dd = addD(today, j - weekIdx); const r = H.map[dd]; o.push({ date: dd, v: dd > today ? null : r ? get(r) ?? null : null }); } return o; };
  const week7 = (get) => weekDays(get).reduce((t, x) => t + (x.v || 0), 0);
  const sl = S.sleep && S.sleep.r.sl;
  const times = daily(H.list, (r) => (r.sl && r.sl.start ? nightMin(r.sl.start) : null), addD(today, -13), today).map((q) => q.v);
  return (
    <div class="view root" ref={scroller}>
      <PtrIndicator />
      <div class="hp-hero" style="padding-top:18px"><div style="flex:1"><div class="hp-lbl">{WEB ? 'Garmin · Withings · eigene Berechnung' : 'Garmin · Withings · athletedata'}</div><h1>Gesundheit</h1></div></div>
      <div class="md-body">
        {!H.list.length ? (getState().status.healthSyncing ? <div aria-busy="true" aria-label="Gesundheitsdaten werden geladen"><div class="skel skel-tile" /><div class="skel skel-tile" style="margin-top:var(--tile-gap)" /></div> : <div class="empty2">Noch keine Gesundheitsdaten abgeglichen. Ziehe nach unten zum Abgleichen.</div>) : (
          <Fragment>
            <Glance S={GL.map((k) => S[k])} />

            <div class="hsec"><Ico n="heart" />Herz</div>
            <div class="h-grid">
              <Tile s={S.rhr} wide><MiniDots pts={daily(H.list, (r) => r.rhr, addD(today, -27), today)} band={S.rhr && S.rhr.range} /></Tile>
              <Tile s={S.resp}><MiniLine pts={daily(H.list, (r) => r.resp, addD(today, -13), today)} w={150} hgt={44} /></Tile>
              <Tile s={S.vo2} sub={S.vo2 && S.vo2.r.fitAge ? 'Fitnessalter ' + S.vo2.r.fitAge : null}><MiniLine pts={daily(H.list, (r) => r.vo2, addD(today, -180), today)} w={150} hgt={44} /></Tile>
            </div>

            <div class="hsec"><Ico n="half-moon" />Schlaf</div>
            <div class="h-grid">
              <Tile s={S.sleep} wide sub={sl ? `${sl.start || ''}–${sl.end || ''}${S.sleep.r.need ? ' · Bedarf ' + hmm(S.sleep.r.need) + ' h' : ''}` : null}>
                {sl ? <Stages sl={sl} /> : null}
                <DayBars items={days7((r) => (r.sl ? r.sl.total : r.slMin))} goal={S.sleep && S.sleep.r.need} goalLabel="Bedarf" fmt={hmm} unit="h" topFmt={(v) => Math.round(v / 60) + NB + 'h'} label="Schlafdauer, 7 Nächte" />
              </Tile>
              <Tile s={S.slScore}><DayBars items={days7((r) => (r.sl && r.sl.score != null ? r.sl.score : r.slScore))} max={100} label="Schlafscore, 7 Nächte" /></Tile>
              {times.length >= 5 ? (
                <button type="button" class="t2 htile glow g-sch" style="--gx:100%;--gy:100%" onClick={() => push('metric', { k: 'sleep' })} aria-label="Schlafenszeiten, Details">
                  <div class="t2-h"><Ico n="clock" /><span class="lb">Einschlafzeit</span></div>
                  <div class="hv"><span class="mid2">{clk(mean(times))}</span></div>
                  <div class="t2-g"><SleepWindows H={H} today={today} avgStart={mean(times)} /></div>
                  <div class="sub2">Ø 14 Nächte · schwankt ± {hmm(sd(times))}{NB}h</div>
                </button>
              ) : null}
            </div>

            <div class="hsec"><Ico n="battery-full" />Erholung</div>
            <div class="h-grid">
              <Tile s={S.hrv} wide><MiniDots pts={daily(H.list, (r) => r.hrv, addD(today, -27), today)} band={S.hrv && S.hrv.range} /></Tile>
              <Tile s={S.bb}><DayBars items={days7((r) => (r.g ? r.g.bbWake : null))} max={100} label="Body Battery beim Aufwachen, 7 Tage" /></Tile>
              <Tile s={S.stress}><DayBars items={days7((r) => (r.g && !r.g.partial ? r.g.stress : null))} max={100} label="Stress, 7 Tage" /></Tile>
              <Tile s={S.rec} wide sub={S.rec ? lastMeas(S.rec.date) + ' · von hansport berechnet' : null}><DayBars items={days7((r) => M.rec.get(r))} max={100} label="Bereitschaft, 7 Tage" /></Tile>
            </div>

            <div class="hsec"><Ico n="weight" />Körper</div>
            <div class="h-grid">
              <Tile s={S.weight} wide sub={S.weight ? lastMeas(S.weight.date) + (S.weight.r.wi && S.weight.r.wi.fatPct != null ? ' · Körperfett ' + num(S.weight.r.wi.fatPct, 1) + NB + '%' : '') : null}>{(() => { const pts = H.list.filter((r) => r.wi && r.wi.weight != null && r.date >= addD(today, -180)).map((r) => ({ date: r.date, v: r.wi.weight })); return pts.length > 1 ? <MeasureLine pts={pts} from={pts[0].date} to={today} goal={((getState().settings.main || {}).healthGoals || {}).weight} label={'Gewicht seit ' + dayMon(pts[0].date)} height={120} /> : null; })()}</Tile>
              <Tile s={S.fatPct}><MiniLine pts={daily(H.list, (r) => (r.wi ? r.wi.fatPct : null), addD(today, -180), today)} w={150} hgt={44} /></Tile>
              <Tile s={S.muscle}><MiniLine pts={daily(H.list, (r) => (r.wi ? r.wi.muscle : null), addD(today, -180), today)} w={150} hgt={44} /></Tile>
            </div>

            <div class="hsec"><Ico n="walking" />Aktivität und Training</div>
            {S.akcal ? <div class="h-grid" style="margin-bottom:10px"><Tile s={S.akcal} wide sub={'Woche ' + num(week7((r) => r.akcal), 0) + NB + 'kcal · aus Aktivitäten' + (S.akcal.r.bmr != null ? ' · Ruhe ' + num(S.akcal.r.bmr, 0) + NB + 'kcal (Garmin)' : ' · Ruheumsatz: keine Quelle')}><DayBars items={weekDays((r) => r.akcal)} hlIndex={weekIdx} label="Kalorien aus Aktivitäten, diese Woche" unit="kcal" /></Tile></div> : null}
            <div class="list">
              {['steps', 'im', 'kcal', 'tsb'].map((k) => { const s = S[k]; const m = M[k]; return (
                <button type="button" class="mrow" onClick={() => push('metric', { k })}>
                  <span class="ic"><Ico n={m.icon} /></span>
                  <span><div class="t1">{k === 'tsb' ? 'Trainingsbelastung' : m.label}</div><div class="t2">{s ? (s.age > 1 ? dShort(s.date) : 'heute') + (s.trend ? ' · vs. Ø 28 T ' + m.fmt(s.trend.mu) : '') : 'keine Daten'}</div></span>
                  <span class="v">{s ? <Fragment><b>{m.fmt(s.v)}</b><small>{m.unit}</small></Fragment> : <span class="hp-none">–</span>}</span>
                </button>
              ); })}
            </div>

            <div class="hsec"><Ico n="graph-up" />Langzeit: wird die Fitness besser?</div>
            <LongTerm H={H} end={today} />
            <div class="hsec"><Ico n="stats-report" />Zusammenhänge</div>
            <Relations H={H} end={today} acts={d.list} />
            <div class="hsec"><Ico n="calendar" />Wochenmuster</div>
            <Weekdays H={H} end={today} />

            <div class="hsec"><Ico n="info-circle" />Nicht verfügbar</div>
            <div class="list">
              <div class="mrow"><span class="ic"><Ico n="heart" /></span><span><div class="t1">Blutdruck</div><div class="t2">Kein Messgerät verbunden (z. B. Withings BPM).</div></span><span class="v hp-none">–</span></div>
              <div class="mrow"><span class="ic"><Ico n="droplet" /></span><span><div class="t1">SpO2</div><div class="t2">Garmin liefert derzeit keine Werte.</div></span><span class="v hp-none">–</span></div>
            </div>
            <div class="sub2" style="padding:12px 2px 0">{meta.lastSync ? 'Zuletzt abgeglichen ' + new Date(meta.lastSync).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '. ' : ''}Automatischer Abgleich beim Öffnen und stündlich, solange hansport offen ist. {WEB ? 'Puls, Stress und Body Battery kommen von Garmin als Tageswerte.' : 'Puls, Stress und Body Battery liefert athletedata nur als Tageswerte.'}</div>
          </Fragment>
        )}
      </div>
    </div>
  );
}
