// Runde 5: Mini-Graphen für Kacheln. Kopf → Wert → Graph (füllt den Platz) → Fußzeile.
// Mengen beginnen bei 0, die Skala steht am Graphen, Anfang/Ende bzw. Tage sind beschriftet,
// Kontext grau, der neueste Wert in der Gruppenfarbe. Fehlende Tage bleiben als klare Lücke leer.
import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { num, int, dayMon, NB } from '../format.js';

const WDS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const wdOf = (d) => WDS[new Date(d + 'T12:00:00').getDay()];

// schöne Obergrenze für eine Skala ab 0
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
const fmtScale = (v) => (v >= 10000 ? num(v / 1000, 0) + NB + 'Tsd.' : int(v));

export function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.round(el.getBoundingClientRect().width));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref.current]);
  return w;
}

// Balken ab 0 mit Tagesbeschriftung. items: [{ date, v }], v = null → keine Daten (Lücke)
export function DayBars({ items, max, avg, avgLabel, goal, goalLabel = 'Ziel', label, fmt = int, unit = '', hlIndex, labels = 'days', topFmt = fmtScale, ends, xLabels, ariaItem }) {
  const vals = items.map((x) => x.v).filter((v) => v != null);
  let top = niceMax(Math.max(max || 0, ...vals, avg || 0, goal || 0));
  // Ziel- oder Ø-Linie nicht auf die oberste Skalenlinie legen (sonst kollidiert sie mit dem Skalenwert)
  if (!max && Math.max(goal || 0, avg || 0) > top * 0.85) top = niceMax(Math.max(goal || 0, avg || 0) * 1.18);
  const hl = hlIndex != null ? hlIndex : items.length - 1;
  const pct = (v) => Math.max(0, Math.min(100, (v / top) * 100));
  const aria = label + ': ' + items.map((x, i) => (ariaItem ? ariaItem(x, i) : xLabels ? xLabels[i] : wdOf(x.date)) + ' ' + (x.v == null ? 'keine Daten' : fmt(x.v) + (unit ? ' ' + unit : ''))).join(', ');
  return (
    <div class="db" role="img" aria-label={aria}>
      <div class="db-plot">
        <span class="db-top">{topFmt(top)}</span>
        {goal ? <span class="db-ref goal" style={{ bottom: pct(goal) + '%' }}><i>{goalLabel}</i></span> : null}
        {avg != null ? <span class="db-ref" style={{ bottom: pct(avg) + '%' }}><i>{avgLabel || 'Ø ' + fmt(avg)}</i></span> : null}
        <div class="db-bars">
          {items.map((x, i) => (
            <span class="db-col">
              {x.v == null ? null : <i class={(i === hl ? 'on' : '') + (x.v === 0 ? ' zero' : '')} style={{ height: x.v === 0 ? '2px' : 'max(3px, ' + pct(x.v) + '%)' }} />}
            </span>
          ))}
        </div>
      </div>
      <div class={'db-ax' + (!xLabels && labels !== 'days' ? ' ends' : '')}>
        {xLabels
          ? items.map((x, i) => <span class={(i === hl ? 'on' : '') + (x.v == null ? ' na' : '')}>{xLabels[i]}</span>)
          : labels === 'days'
          ? items.map((x, i) => <span class={(i === hl ? 'on' : '') + (x.v == null ? ' na' : '')}>{wdOf(x.date)}</span>)
          : <Fragment><span>{ends ? ends[0] : dayMon(items[0].date)}</span><span class="on">{ends ? ends[1] : dayMon(items[items.length - 1].date)}</span></Fragment>}
      </div>
    </div>
  );
}

// Linie mit Messpunkten, Lücken über gapDays gestrichelt, optional 7-Tage-Trend und Ziellinie
export function MeasureLine({ pts, from, to, step = 2, gapDays = 14, trend = true, goal, label, fmt = (v) => num(v, 1), height = 128 }) {
  const ref = useRef();
  const W = useWidth(ref);
  const t = (d) => Date.parse(d + 'T12:00:00Z');
  const ok = pts.filter((p) => p.v != null);
  const body = () => {
    if (!W || ok.length < 2) return null;
    const vs = ok.map((p) => p.v).concat(goal ? [goal] : []);
    let y0 = Math.floor(Math.min(...vs) / step) * step, y1 = Math.ceil(Math.max(...vs) / step) * step;
    if (y1 - y0 < step) y1 = y0 + step;
    if ((y1 - y0) / step > 4) { const s2 = step * Math.ceil((y1 - y0) / step / 3); y0 = Math.floor(Math.min(...vs) / s2) * s2; y1 = Math.ceil(Math.max(...vs) / s2) * s2; step = s2; }
    const L = 30, R = 6, T = 8, B = 20, H = height;
    const t0 = t(from || ok[0].date), t1 = t(to || ok[ok.length - 1].date);
    const X = (d) => L + ((t(d) - t0) / (t1 - t0 || 1)) * (W - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    const ticks = []; for (let v = y0; v <= y1 + 1e-9; v += step) ticks.push(v);
    const segs = [];
    for (let i = 1; i < ok.length; i++) {
      const gap = (t(ok[i].date) - t(ok[i - 1].date)) / 864e5 > gapDays;
      segs.push(<line x1={X(ok[i - 1].date)} y1={Y(ok[i - 1].v)} x2={X(ok[i].date)} y2={Y(ok[i].v)} class={'ml-seg' + (gap ? ' gap' : '')} />);
    }
    // 7-Tage-Trend: Mittel der Messungen der vorangegangenen 7 Tage je Messpunkt
    let tr = null;
    if (trend) {
      const tp = ok.map((p) => { const w = ok.filter((q) => q.date <= p.date && t(p.date) - t(q.date) < 7 * 864e5); return [X(p.date), Y(w.reduce((s, q) => s + q.v, 0) / w.length)]; });
      tr = <path d={'M' + tp.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L')} class="ml-trend" />;
    }
    const last = ok[ok.length - 1];
    const lastX = X(last.date);
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {ticks.map((v) => <Fragment><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} class="ml-grid" /><text x={L - 6} y={Y(v) + 4} text-anchor="end" class="ml-t">{num(v, 0)}</text></Fragment>)}
        {to && lastX < W - R - 30 ? <Fragment><rect x={lastX + 6} y={T} width={W - R - lastX - 6} height={H - T - B} class="ml-none" rx="6" /><text x={(lastX + W - R) / 2 + 3} y={(H - B + T) / 2 + 4} text-anchor="middle" class="ml-t">keine Messung</text></Fragment> : null}
        {goal ? <Fragment><line x1={L} x2={W - R} y1={Y(goal)} y2={Y(goal)} class="ml-goal" /><text x={W - R - 2} y={Y(goal) - 5} text-anchor="end" class="ml-t ink">Ziel {fmt(goal)}</text></Fragment> : null}
        {segs}{tr}
        {ok.map((p, i) => <circle cx={X(p.date)} cy={Y(p.v)} r={i === ok.length - 1 ? 4.5 : 2.6} class={i === ok.length - 1 ? 'ml-last' : 'ml-pt'} />)}
        <text x={L} y={H - 4} class="ml-t">{dayMon(from || ok[0].date)}</text>
        {to && lastX < W - R - 70 && lastX > L + 60 ? <text x={lastX} y={H - 4} text-anchor="middle" class="ml-t">{dayMon(last.date)}</text> : null}
        <text x={W - R} y={H - 4} text-anchor="end" class="ml-t">{to ? 'heute' : dayMon(last.date)}</text>
      </svg>
    );
  };
  return <div class="ml" ref={ref} role="img" aria-label={label} style={{ height: height + 'px' }}>{body()}</div>;
}

// Bogen-Instrument, das die Kachelbreite nutzt; Skalenwerte an den Bogenenden
export function Arc({ min, max, value, center, unit, label, maxSize = 168 }) {
  const ref = useRef();
  const W = useWidth(ref);
  const size = Math.max(96, Math.min(maxSize, W || 120));
  const c = size / 2, r = size / 2 - 10, sw = Math.max(8, size * 0.075);
  const a0 = 135, a1 = 405;
  const f = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const pt = (a, rr) => [c + rr * Math.cos((a * Math.PI) / 180), c + rr * Math.sin((a * Math.PI) / 180)];
  const arc = (from, to) => { const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
  const [ex0, ey0] = pt(a0, r), [ex1, ey1] = pt(a1, r);
  const H = Math.ceil(c + r * Math.sin((45 * Math.PI) / 180) + 22);
  return (
    <div class="arc" ref={ref}>
      <svg width={size} height={H} viewBox={`0 0 ${size} ${H}`} role="img" aria-label={label}>
        <path d={arc(a0, a1)} fill="none" stroke="var(--track)" stroke-width={sw} stroke-linecap="round" />
        {f > 0.005 ? <path d={arc(a0, a0 + f * (a1 - a0))} fill="none" stroke="var(--c, var(--ink))" stroke-width={sw} stroke-linecap="round" /> : null}
        <text x={c} y={c + size * 0.07} text-anchor="middle" class="arc-v" font-size={size * 0.26}>{center != null ? center : '–'}</text>
        {unit ? <text x={c} y={c + size * 0.07 + 16} text-anchor="middle" class="arc-u">{unit}</text> : null}
        <text x={ex0} y={ey0 + sw / 2 + 14} text-anchor="middle" class="arc-s">{min}</text>
        <text x={ex1} y={ey1 + sw / 2 + 14} text-anchor="middle" class="arc-s">{max}</text>
      </svg>
    </div>
  );
}

// Spektrum Ruhe – Locker – Normal – Intensiv mit Markierung
export const ZONES = [[0, 40, 'Ruhe'], [40, 55, 'Locker'], [55, 75, 'Normal'], [75, 100, 'Intensiv']];
export function Spectrum({ value, label }) {
  const cur = value == null ? null : ZONES.find((z) => value >= z[0] && (value < z[1] || z[1] === 100));
  return (
    <div class="spec">
      <div class="spec-bar" role="img" aria-label={label}>
        {ZONES.slice(1).map((z) => <span class="spec-tick" style={{ left: z[0] + '%' }} />)}
        {value != null ? <span class="spec-mk" style={{ left: value + '%' }} /> : null}
      </div>
      <div class="spec-ax" aria-hidden="true">{ZONES.map((z) => <span class={cur && cur[2] === z[2] ? 'on' : ''} style={{ left: z[0] + '%', width: z[1] - z[0] + '%' }}>{z[2]}</span>)}</div>
    </div>
  );
}

// Abweichungsbalken je Faktor: links belastet, rechts erholt
export function DevBar({ dev, label, color }) {
  const p = Math.abs(dev) * 50;
  return (
    <div class="dev" role="img" aria-label={label}>
      <span class="dev-mid" />
      <span class={'dev-fill' + (dev < 0 ? ' neg' : '')} style={{ ...(dev < 0 ? { right: '50%' } : { left: '50%' }), width: Math.max(1.5, p) + '%', ...(color && dev >= 0 ? { background: color } : {}) }} />
    </div>
  );
}
