// Diagramme für die Detailansicht des Cockpits (Runde 9).
// Je Kennzahl die Form, die ihre Aufgabe erfüllt: Zusammensetzung → gestapelte Säulen,
// Wert gegen den eigenen Normalbereich → Linie mit Band, Spanne je Tag → Spannenbalken,
// Zeitanteile → Anteilssäulen, Mengen mit Ziel → Säulen mit Ziellinie, Verlauf mit Ziel → Trendlinie.
// Regeln: Säulen höchstens 24 px breit mit 4 px runder Datenkante, Linien 2 px, Punkte ab 8 px
// mit 2 px Saum in Flächenfarbe, Flächen 10 %, Hilfslinien haarfein und durchgezogen,
// Beschriftung nur am Ende bzw. am Extrem, Legende ab zwei Reihen.
import { h, Fragment } from 'preact';
import { useRef } from 'preact/hooks';
import { useWidth } from './r5.jsx';
import { num, NB } from '../format.js';

const WDS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const wdOf = (d) => WDS[new Date(d + 'T12:00:00').getDay()];
const BAR = 24, GAP = 2, R = 4;

// Säule mit runder Datenkante oben und eckigem Fuß auf der Grundlinie
function topRect(x, y, w, hh, r = R) {
  const rr = Math.max(0, Math.min(r, hh, w / 2));
  if (hh <= 0.6) return `M${x},${y + 0.6}h${w}v-0.6h${-w}z`;
  return `M${x},${y + hh}V${y + rr}a${rr},${rr} 0 0 1 ${rr},${-rr}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}V${y + hh}z`;
}
function pillRect(x, y, w, hh) {
  const rr = Math.min(w / 2, hh / 2);
  return `M${x},${y + hh - rr}V${y + rr}a${rr},${rr} 0 0 1 ${w},0V${y + hh - rr}a${rr},${rr} 0 0 1 ${-w},0z`;
}
const Axis = ({ items, hl }) => (
  <div class="cc-ax" aria-hidden="true">{items.map((x, i) => <span class={i === hl ? 'on' : ''}>{x.date ? wdOf(x.date) : x.l}</span>)}</div>
);

// ---------- Schlafphasen: gestapelte Säulen je Nacht ----------
export function StageBars({ nights, need, label }) {
  const ref = useRef();
  const W = useWidth(ref);
  const H = 104, B = 4;
  const has = nights.some((n) => n.total);
  const top = Math.max(need || 0, ...nights.map((n) => n.total || 0)) * 1.12 || 1;
  const slot = W ? W / nights.length : 0;
  const bw = Math.min(BAR, Math.max(10, slot - 10));
  const y = (v) => B + (1 - v / top) * (H - B * 2);
  const segs = [['deep', 'var(--sl-d)'], ['light', 'var(--sl-l)'], ['rem', 'var(--sl-r)']];
  return (
    <div class="cc" ref={ref}>
      {W && has ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {need ? <Fragment><line x1="0" x2={W} y1={y(need)} y2={y(need)} class="cc-ref" /><text x={W} y={y(need) - 5} text-anchor="end" class="cc-t">Bedarf</text></Fragment> : null}
          {nights.map((n, i) => {
            if (!n.total) return null;
            let acc = 0;
            const parts = segs.map(([k, c]) => { const v = n[k] || 0; const o = acc; acc += v; return [o, v, c]; });
            const rest = n.total - acc;
            if (rest > 0) parts.push([acc, rest, 'var(--sl-l)']);
            const x = i * slot + (slot - bw) / 2;
            return parts.filter((p) => p[1] > 0).map((p, j) => {
              const y0 = y(p[0] + p[1]), y1 = y(p[0]);
              const hh = Math.max(1.5, y1 - y0 - (p[0] > 0 ? GAP : 0));
              const dd = j === parts.length - 1 ? topRect(x, y0, bw, hh) : topRect(x, y0, bw, hh, 1.5);
              return <path d={dd} fill={p[2]} opacity={i === nights.length - 1 ? 1 : 0.82} />;
            });
          })}
        </svg>
      ) : <div class="cc-none">{W ? 'keine Schlafdaten' : ''}</div>}
      <Axis items={nights} hl={nights.length - 1} />
      <div class="cc-lg"><span><i style="background:var(--sl-d)" />Tief</span><span><i style="background:var(--sl-l)" />Leicht</span><span><i style="background:var(--sl-r)" />REM</span></div>
    </div>
  );
}

// ---------- Wert gegen den eigenen Normalbereich: Linie mit Band ----------
export function BandLine({ pts, band, fmt = (v) => num(v, 0), label, unit }) {
  const ref = useRef();
  const W = useWidth(ref);
  const H = 92, B = 10, L = 0, Rr = 30;
  const vals = pts.map((p) => p.v).filter((v) => v != null);
  const lo0 = Math.min(...vals, band ? band[0] : Infinity);
  const hi0 = Math.max(...vals, band ? band[1] : -Infinity);
  const pad = Math.max((hi0 - lo0) * 0.25, hi0 * 0.02, 0.5);
  const lo = lo0 - pad, hi = hi0 + pad;
  const slot = W ? (W - Rr) / Math.max(1, pts.length - 1) : 0;
  const x = (i) => L + i * slot;
  const y = (v) => B + (1 - (v - lo) / (hi - lo || 1)) * (H - B * 2);
  let dd = '', prev = -2;
  pts.forEach((p, i) => { if (p.v == null) { prev = -2; return; } dd += (prev === i - 1 ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1); prev = i; });
  const li = pts.map((p, i) => (p.v != null ? i : -1)).filter((i) => i >= 0).pop();
  return (
    <div class="cc" ref={ref}>
      {W && vals.length ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {band ? (
            <Fragment>
              <rect x="0" y={y(band[1])} width={W - Rr + 10} height={Math.max(2, y(band[0]) - y(band[1]))} class="cc-band" />
              <text x={W} y={y(band[1]) + 4} text-anchor="end" class="cc-t">{fmt(band[1])}</text>
              <text x={W} y={y(band[0]) + 4} text-anchor="end" class="cc-t">{fmt(band[0])}</text>
            </Fragment>
          ) : null}
          <path d={dd} class="cc-line" />
          {pts.map((p, i) => (p.v == null || i === li ? null : <circle cx={x(i)} cy={y(p.v)} r="2.6" class="cc-dot" />))}
          {li != null ? <circle cx={x(li)} cy={y(pts[li].v)} r="4.5" class="cc-last" /> : null}
        </svg>
      ) : <div class="cc-none">{W ? 'keine Werte' : ''}</div>}
      {pts.length > 10
        ? <div class="cc-ax two" aria-hidden="true"><span>vor {pts.length} Tagen</span><span class="on">heute</span></div>
        : <Axis items={pts} hl={pts.length - 1} />}
      {band ? <div class="cc-lg"><span><i class="bandkey" />dein Normalbereich</span></div> : null}
    </div>
  );
}

// ---------- Spanne je Tag (Body Battery): Balken von Tief bis Hoch mit Marke ----------
export function RangeBars({ items, mark0 = 'wake', label }) {
  const ref = useRef();
  const W = useWidth(ref);
  const H = 104, B = 6;
  const slot = W ? W / items.length : 0;
  const bw = Math.min(14, Math.max(8, slot - 20));
  const y = (v) => B + (1 - v / 100) * (H - B * 2);
  const has = items.some((x) => x.hi != null);
  return (
    <div class="cc" ref={ref}>
      {W && has ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          <line x1="0" x2={W} y1={y(100)} y2={y(100)} class="cc-ref" />
          <text x={W} y={y(100) - 5} text-anchor="end" class="cc-t">100</text>
          {items.map((it, i) => {
            if (it.hi == null) return null;
            const x = i * slot + (slot - bw) / 2;
            const y0 = y(it.hi), y1 = y(it.lo != null ? it.lo : 0);
            return (
              <Fragment>
                <path d={pillRect(x, y0, bw, Math.max(bw, y1 - y0))} class={'cc-range' + (i === items.length - 1 ? ' on' : '')} />
                {it[mark0] != null ? <circle cx={x + bw / 2} cy={y(it[mark0])} r="4" class="cc-mark" /> : null}
              </Fragment>
            );
          })}
        </svg>
      ) : <div class="cc-none">{W ? 'keine Werte' : ''}</div>}
      <Axis items={items} hl={items.length - 1} />
      <div class="cc-lg"><span><i class="rangekey" />Tief bis Hoch</span><span><i class="markkey" />beim Aufwachen</span></div>
    </div>
  );
}

// ---------- Zeitanteile (Stress): Anteilssäulen je Tag ----------
const SHARE = ['Ruhe', 'niedrig', 'mittel', 'hoch'];
export function ShareBars({ items, label }) {
  const ref = useRef();
  const W = useWidth(ref);
  const H = 96, B = 4;
  const slot = W ? W / items.length : 0;
  const bw = Math.min(BAR, Math.max(10, slot - 10));
  const has = items.some((x) => x.parts && x.parts.some((v) => v > 0));
  return (
    <div class="cc" ref={ref}>
      {W && has ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {items.map((it, i) => {
            const tot = it.parts ? it.parts.reduce((a, b) => a + b, 0) : 0;
            if (!tot) return null;
            const x = i * slot + (slot - bw) / 2;
            let acc = 0;
            return it.parts.map((v, j) => {
              if (!v) return null;
              const y0 = B + (acc / tot) * (H - 2 * B);
              acc += v;
              const y1 = B + (acc / tot) * (H - 2 * B);
              const hh = Math.max(1.5, y1 - y0 - GAP);
              return <path d={j === 0 ? topRect(x, y0, bw, hh) : topRect(x, y0, bw, hh, 1.5)} class={'cc-s' + j} opacity={i === items.length - 1 ? 1 : 0.82} />;
            });
          })}
        </svg>
      ) : <div class="cc-none">{W ? 'keine Werte' : ''}</div>}
      <Axis items={items} hl={items.length - 1} />
      <div class="cc-lg">{SHARE.map((s, i) => <span><i class={'cc-k' + i} />{s}</span>)}</div>
    </div>
  );
}

// ---------- Mengen mit Ziel oder Schnitt: Säulen ----------
export function GoalCols({ items, goal, goalLabel = 'Ziel', avg, fmt = (v) => num(v, 0), label, prev }) {
  const ref = useRef();
  const W = useWidth(ref);
  const H = 100, B = 6;
  const vals = items.map((x) => x.v).filter((v) => v != null);
  const top = Math.max(...vals, goal || 0, avg || 0, ...(prev || []).filter((v) => v != null)) * 1.12 || 1;
  const slot = W ? W / items.length : 0;
  const bw = Math.min(BAR, Math.max(10, slot - 10));
  const y = (v) => B + (1 - v / top) * (H - B * 2);
  const has = vals.length > 0;
  return (
    <div class="cc" ref={ref}>
      {W && has ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {prev ? prev.map((v, i) => (v == null || !(v > 0) ? null : <path d={topRect(i * slot + (slot - bw) / 2 - 3, y(v), bw + 6, H - B - y(v), 2)} class="cc-prev" />)) : null}
          {goal ? <Fragment><line x1="0" x2={W} y1={y(goal)} y2={y(goal)} class="cc-ref" /><text x={W} y={y(goal) - 5} text-anchor="end" class="cc-t">{goalLabel}</text></Fragment> : null}
          {avg ? <Fragment><line x1="0" x2={W} y1={y(avg)} y2={y(avg)} class="cc-ref soft" /><text x={W} y={y(avg) - 5} text-anchor="end" class="cc-t">Ø {fmt(avg)}</text></Fragment> : null}
          {items.map((it, i) => (it.v == null ? null : <path d={topRect(i * slot + (slot - bw) / 2, y(it.v), bw, Math.max(1.5, H - B - y(it.v)))} class={'cc-col' + (i === items.length - 1 ? ' on' : '')} />))}
        </svg>
      ) : <div class="cc-none">{W ? 'keine Werte' : ''}</div>}
      <Axis items={items} hl={items.length - 1} />
      {prev ? <div class="cc-lg"><span><i class="colkey" />diese Woche</span><span><i class="prevkey" />Woche davor</span></div> : null}
    </div>
  );
}

// ---------- Belastung: Fitness als Fläche, Ermüdung als Linie, Form als Säulen um Null ----------
export function PmcChart({ pts, label }) {
  const ref = useRef();
  const W = useWidth(ref);
  const H = 132, B = 10;
  const all = [];
  for (const p of pts) for (const k of ['ctl', 'atl', 'tsb']) if (p[k] != null) all.push(p[k]);
  const lo = Math.min(0, ...all) * 1.1, hi = Math.max(...all) * 1.12 || 1;
  const slot = W ? W / Math.max(1, pts.length - 1) : 0;
  const x = (i) => i * slot;
  const y = (v) => B + (1 - (v - lo) / (hi - lo || 1)) * (H - B * 2);
  const path = (k) => { let dd = '', prev = -2; pts.forEach((p, i) => { if (p[k] == null) { prev = -2; return; } dd += (prev === i - 1 ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p[k]).toFixed(1); prev = i; }); return dd; };
  const ctl = path('ctl');
  const bw = Math.min(10, Math.max(4, slot - 8));
  const last = pts[pts.length - 1] || {};
  return (
    <div class="cc" ref={ref}>
      {W && all.length >= 4 ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} class="cc-ref" />
          {ctl ? <path d={ctl + `L${x(pts.length - 1)},${y(0)}L0,${y(0)}Z`} class="cc-area" /> : null}
          {pts.map((p, i) => (p.tsb == null ? null : <rect x={x(i) - bw / 2} y={Math.min(y(0), y(p.tsb))} width={bw} height={Math.max(1.5, Math.abs(y(p.tsb) - y(0)))} rx="1.5" class="cc-tsb" />))}
          <path d={ctl} class="cc-ctl" />
          <path d={path('atl')} class="cc-atl" />
          {last.ctl != null ? <circle cx={x(pts.length - 1)} cy={y(last.ctl)} r="4" class="cc-last ctl" /> : null}
        </svg>
      ) : <div class="cc-none">{W ? 'noch kein Verlauf' : ''}</div>}
      <div class="cc-ax two" aria-hidden="true"><span>vor 14 Tagen</span><span class="on">heute</span></div>
      <div class="cc-lg"><span><i class="ctlkey" />Fitness</span><span><i class="atlkey" />Ermüdung</span><span><i class="tsbkey" />Form</span></div>
    </div>
  );
}

// ---------- Gewicht: Messpunkte, Trendlinie, Ziellinie ----------
export function WeightChart({ pts, trend, goal, from, fmt = (v) => num(v, 1), label }) {
  const ref = useRef();
  const W = useWidth(ref);
  const H = 132, B = 12, Rr = 40;
  const vals = pts.map((p) => p.v);
  if (!vals.length) return <div class="cc" ref={ref}><div class="cc-none">keine Messungen</div></div>;
  const lo0 = Math.min(...vals, goal != null ? goal : Infinity), hi0 = Math.max(...vals, goal != null ? goal : -Infinity);
  const pad = Math.max((hi0 - lo0) * 0.18, 0.4);
  const lo = lo0 - pad, hi = hi0 + pad;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const x = (t) => ((t - t0) / span) * (W - Rr);
  const y = (v) => B + (1 - (v - lo) / (hi - lo || 1)) * (H - B * 2);
  let dd = '', prev = null;
  for (const p of (trend || [])) {
    if (p.v == null) { prev = null; continue; }
    dd += (prev ? 'L' : 'M') + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1);
    prev = p;
  }
  const last = pts[pts.length - 1];
  return (
    <div class="cc" ref={ref}>
      {W ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {goal != null ? <Fragment><line x1="0" x2={W - Rr + 14} y1={y(goal)} y2={y(goal)} class="cc-ref goal" /><text x={W} y={y(goal) + 4} text-anchor="end" class="cc-t">Ziel {fmt(goal)}</text></Fragment> : null}
          {pts.map((p) => <circle cx={x(p.t)} cy={y(p.v)} r="2.4" class="cc-dot" />)}
          <path d={dd} class="cc-line" />
          <circle cx={x(last.t)} cy={y(last.v)} r="4.5" class="cc-last" />
          <text x={x(last.t) + 10} y={y(last.v) + 4} class="cc-v">{fmt(last.v)}</text>
        </svg>
      ) : null}
      <div class="cc-ax two" aria-hidden="true"><span>{from}</span><span class="on">heute</span></div>
      <div class="cc-lg"><span><i class="dotkey" />Messung</span><span><i class="linekey" />Trend (7 Tage)</span></div>
    </div>
  );
}

// ---------- Fortschritt zum Ziel: Start → heute → Ziel ----------
export function Bullet({ start, value, goal, fmt = (v) => num(v, 1), unit = 'kg', startLabel }) {
  if (start == null || goal == null || value == null) return null;
  const down = goal < start;
  const total = Math.abs(goal - start);
  const done = total > 0 ? Math.max(0, Math.min(1, (down ? start - value : value - start) / total)) : 0;
  const left = Math.abs(goal - value);
  return (
    <div class="cc-bul">
      <div class="tr" role="img" aria-label={'Fortschritt zum Ziel: ' + Math.round(done * 100) + ' Prozent, noch ' + fmt(left) + ' ' + unit}>
        <i style={{ width: (done * 100).toFixed(1) + '%' }} />
        <b style={{ left: (done * 100).toFixed(1) + '%' }} />
      </div>
      <div class="lb"><span>{fmt(start)}{NB}{unit}{startLabel ? ' · ' + startLabel : ''}</span><span>{left < 0.05 ? 'Ziel erreicht' : 'noch ' + fmt(left) + NB + unit}</span><span>{fmt(goal)}{NB}{unit}</span></div>
    </div>
  );
}
