import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SPORT_ORDER, sportLabel } from '../sports.js';
import { sportColor } from './kit.jsx';
import { num, km, int } from '../format.js';

export function useWidth(init = 340) {
  const ref = useRef();
  const [w, setW] = useState(init);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const set = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    set();
    let ro;
    try { ro = new ResizeObserver(set); ro.observe(el); } catch (e) { window.addEventListener('resize', set); }
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', set); };
  }, []);
  return [ref, w];
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

// Gestapelte Balken je Sportart
export function StackBars({ items, value, total, fmt, axisFmt, label, onSelect, selected, height = 150 }) {
  const [ref, W] = useWidth();
  const L = 34, B = 20, T = 14;
  const maxV = niceMax(Math.max(...items.map((it) => total(it.agg)), 0.0001));
  const iw = (W - L) / Math.max(1, items.length);
  const bw = Math.max(4, Math.min(34, iw * 0.66));
  const y = (v) => T + (height - T - B) * (1 - v / maxV);
  const ticks = [0, maxV / 2, maxV];
  const best = items.reduce((b, it) => (!b || total(it.agg) > total(b.agg) ? it : b), null);
  const cur = items.find((it) => it.current);
  const labelEvery = Math.ceil(items.length / Math.max(1, Math.floor((W - L) / 44)));
  return (
    <div ref={ref}>
      <svg class="chart" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        {ticks.map((t) => <g><line class="grid" x1={L} x2={W} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 3.5} text-anchor="end">{(axisFmt || fmt)(t)}</text></g>)}
        {items.map((it, i) => {
          const x = L + iw * i + (iw - bw) / 2;
          let acc = 0;
          const segs = SPORT_ORDER.map((s) => {
            const v = value(it.agg, s) || 0;
            if (!v) return null;
            const y0 = y(acc), y1 = y(acc + v);
            acc += v;
            return <rect x={x} y={y1} width={bw} height={Math.max(0.5, y0 - y1)} fill={sportColor(s)} opacity={it.current ? 0.55 : 1} />;
          });
          const sel = selected === it.key;
          return (
            <g>
              {sel ? <rect class="sel" x={L + iw * i} y={T - 6} width={iw} height={height - T - B + 6} rx="4" /> : null}
              {segs}
              {it.current ? <rect x={x} y={y(acc) - 1} width={bw} height="2" fill="var(--ink)" opacity=".5" /> : null}
              {(i % labelEvery === 0 || i === items.length - 1) ? <text x={L + iw * i + iw / 2} y={height - 5} text-anchor="middle" style={sel ? 'font-weight:700;fill:var(--ink)' : ''}>{it.label}</text> : null}
              {sel ? <text x={Math.min(W - 20, Math.max(L + 16, L + iw * i + iw / 2))} y={Math.max(10, y(acc) - 4)} text-anchor="middle" style="font-weight:700;fill:var(--ink)">{fmt(total(it.agg))}</text> : null}
              <rect class="hit" x={L + iw * i} y={0} width={iw} height={height} onClick={() => onSelect && onSelect(it)} role="button" aria-label={it.label + ': ' + fmt(total(it.agg))} tabindex="0" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect && onSelect(it); } }} />
            </g>
          );
        })}
      </svg>
      <div class="chart-sum">Höchster Wert: {best ? best.label + ' mit ' + fmt(total(best.agg)) : '–'}.{cur ? ' Laufend (' + cur.label + '): ' + fmt(total(cur.agg)) + ', noch nicht abgeschlossen.' : ''} Balken antippen für Details.</div>
      <details class="data"><summary>Werte als Tabelle</summary>
        <table><thead><tr><th>Zeitraum</th><th>Gesamt</th>{SPORT_ORDER.filter((s) => items.some((it) => value(it.agg, s))).map((s) => <th>{sportLabel(s)}</th>)}</tr></thead>
          <tbody>{items.map((it) => <tr><td>{it.label}{it.current ? ' (läuft)' : ''}</td><td>{fmt(total(it.agg))}</td>{SPORT_ORDER.filter((s) => items.some((x) => value(x.agg, s))).map((s) => <td>{value(it.agg, s) ? fmt(value(it.agg, s)) : '–'}</td>)}</tr>)}</tbody></table>
      </details>
    </div>
  );
}

// Punkte über die Zeit (z. B. Zeiten auf einem Anstieg)
export function Points({ items, fmt, label, lowerBetter, onSelect, selected, height = 160, median: med }) {
  const [ref, W] = useWidth();
  if (!items.length) return null;
  const L = 44, B = 22, T = 12, Rr = 10;
  const xs = items.map((i) => new Date(i.date).getTime());
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ys = items.map((i) => i.y);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.15 || Math.abs(y1) * 0.1 || 1;
  y0 -= pad; y1 += pad;
  const X = (t) => (x1 === x0 ? (L + W - Rr) / 2 : L + ((t - x0) / (x1 - x0)) * (W - L - Rr));
  const Y = (v) => (lowerBetter ? T + ((v - y0) / (y1 - y0)) * (height - T - B) : T + (1 - (v - y0) / (y1 - y0)) * (height - T - B));
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad];
  const yr = (t) => new Date(t).getFullYear();
  const xt = x1 === x0 ? [x0] : [x0, (x0 + x1) / 2, x1];
  return (
    <div ref={ref}>
      <svg class="chart" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        {ticks.map((t) => <g><line class="grid" x1={L} x2={W} y1={Y(t)} y2={Y(t)} /><text x={L - 6} y={Y(t) + 3.5} text-anchor="end">{fmt(t)}</text></g>)}
        {xt.map((t) => <text x={Math.max(L + 18, Math.min(W - 24, X(t)))} y={height - 5} text-anchor="middle">{new Date(t).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })}</text>)}
        {med != null ? <line x1={L} x2={W} y1={Y(med)} y2={Y(med)} stroke="var(--ink-3)" stroke-dasharray="4 4" /> : null}
        <polyline points={items.map((i) => X(new Date(i.date).getTime()) + ',' + Y(i.y)).join(' ')} fill="none" stroke="var(--ink-3)" stroke-width="1" opacity=".5" />
        {items.map((i) => {
          const sel = selected === i.id;
          return (
            <g>
              <circle cx={X(new Date(i.date).getTime())} cy={Y(i.y)} r={sel ? 7 : 5} fill={i.color || 'var(--ink)'} stroke="var(--surface)" stroke-width="2" />
              {i.best ? <circle cx={X(new Date(i.date).getTime())} cy={Y(i.y)} r="9" fill="none" stroke="var(--good)" stroke-width="2" /> : null}
              <circle class="hit" cx={X(new Date(i.date).getTime())} cy={Y(i.y)} r="16" onClick={() => onSelect && onSelect(i)} role="button" tabindex="0" aria-label={i.label + ': ' + fmt(i.y)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect && onSelect(i); }} />
            </g>
          );
        })}
      </svg>
      <div class="chart-sum">{lowerBetter ? 'Oben = schneller. ' : ''}{med != null ? 'Gestrichelt: Median ' + fmt(med) + '. ' : ''}Grün umrandet: Bestwert. Punkt antippen öffnet die Aktivität.</div>
    </div>
  );
}

// Abschnitte in der Aktivitätsfarbe (Türkis) nach Stärke; Pausen/Lift neutral
const SEC_COLOR = { climb: '#0193A9', ascent: '#0193A9', walkup: '#0193A9', descent: '#7FCFDD', run: '#7FCFDD', flat: '#A3A3A9', pause: '#6B6B70', lift: '#3A3A3D', transition: '#6B6B70' };
export const secColor = (t) => SEC_COLOR[t] || '#9AA2A6';

// Höhenprofil mit Abschnitten und Positionsanzeige
export function Profile({ d, alt, sections, cursor, onCursor, height = 150, label = 'Höhenprofil', extra }) {
  const [ref, W] = useWidth();
  if (!d || !alt || d.length < 2) return null;
  const L = 38, B = 26, T = 18;
  const dmax = d[d.length - 1] || 1;
  const vals = alt.filter((v) => v != null);
  let a0 = Math.min(...vals), a1 = Math.max(...vals);
  const pad = Math.max(10, (a1 - a0) * 0.08);
  a0 = Math.floor((a0 - pad) / 50) * 50; a1 = Math.ceil((a1 + pad) / 50) * 50;
  const X = (v) => L + (v / dmax) * (W - L - 4);
  const Y = (v) => T + (1 - (v - a0) / (a1 - a0)) * (height - T - B);
  let path = '';
  for (let i = 0; i < d.length; i++) if (alt[i] != null) path += (path ? 'L' : 'M') + X(d[i]).toFixed(1) + ',' + Y(alt[i]).toFixed(1);
  const area = path + 'L' + X(d[d.length - 1]).toFixed(1) + ',' + (height - B) + 'L' + X(d[0]).toFixed(1) + ',' + (height - B) + 'Z';
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const dv = ((px - L) / (W - L - 4)) * dmax;
    let best = 0, bd = Infinity;
    for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i] - dv); if (x < bd) { bd = x; best = i; } }
    onCursor && onCursor(best);
  };
  const ticks = [a0, (a0 + a1) / 2, a1];
  const dkm = dmax / 1000;
  const step = dkm > 60 ? 20 : dkm > 25 ? 10 : dkm > 10 ? 5 : dkm > 4 ? 2 : 1;
  const xt = [];
  for (let k = 0; k <= dkm; k += step) xt.push(k);
  return (
    <div ref={ref}>
      <svg class="chart" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}
        onPointerDown={move} onPointerMove={(e) => (e.buttons || e.pointerType === 'touch') && move(e)} style="touch-action: pan-y">
        {ticks.map((t) => <g><line class="grid" x1={L} x2={W} y1={Y(t)} y2={Y(t)} /><text x={L - 5} y={Y(t) + 3.5} text-anchor="end">{int(t)}</text></g>)}
        {xt.map((k) => <text x={X(k * 1000)} y={height - 3} text-anchor="middle">{k}</text>)}
        <text x={W - 2} y={height - 3} text-anchor="end">km</text>
        <path d={area} fill="var(--ink)" opacity=".07" />
        <path d={path} fill="none" stroke="var(--ink)" stroke-width="1.6" />
        <text x="0" y="10">Höhe · m</text>
        {(sections || []).filter((s) => !s.point).map((s) => <rect x={X(d[s.i0])} y={height - B + 3} width={Math.max(1, X(d[s.i1]) - X(d[s.i0]))} height="6" fill={secColor(s.type)} />)}
        {(sections || []).filter((s) => s.type === 'pause').map((s) => <circle cx={X(d[s.i1])} cy={Y(alt[s.i1] ?? a0)} r="3.5" fill={secColor('pause')} stroke="var(--surface)" />)}
        {extra}
        {cursor != null && d[cursor] != null ? (
          <g>
            <line x1={X(d[cursor])} x2={X(d[cursor])} y1={T} y2={height - B} stroke="var(--focus)" stroke-width="1.5" />
            <circle cx={X(d[cursor])} cy={Y(alt[cursor])} r="4" fill="var(--focus)" />
            <text x={Math.min(W - 60, Math.max(L + 30, X(d[cursor])))} y={T + 2} text-anchor="middle" style="fill:var(--ink);font-weight:600">{km(d[cursor])} km · {int(alt[cursor])} m</text>
          </g>
        ) : null}
      </svg>
      <label class="sr" for="scrub">Position auf der Strecke</label>
      <input id="scrub" class="sr" type="range" min="0" max={d.length - 1} value={cursor || 0} onInput={(e) => onCursor && onCursor(+e.target.value)} />
    </div>
  );
}

// Linie über die Distanz (Puls, Tempo, Leistung)
export function Series({ d, y, cursor, height = 112, color = 'var(--ink)', label, unit, fmt = (v) => int(v), y2, color2, label2 }) {
  const [ref, W] = useWidth();
  if (!d || !y || !y.some((v) => v != null)) return null;
  const L = 38, B = 8, T = 8;
  const dmax = d[d.length - 1] || 1;
  const all = y.concat(y2 || []).filter((v) => v != null);
  let v0 = Math.min(...all), v1 = Math.max(...all);
  if (v1 === v0) v1 = v0 + 1;
  const X = (v) => L + (v / dmax) * (W - L - 4);
  const Y = (v) => T + (1 - (v - v0) / (v1 - v0)) * (height - T - B);
  const line = (arr) => { let p = ''; for (let i = 0; i < d.length; i++) if (arr[i] != null) p += (p ? 'L' : 'M') + X(d[i]).toFixed(1) + ',' + Y(arr[i]).toFixed(1); return p; };
  const vy = y.filter((v) => v != null && v > 0);
  const avg = vy.length ? vy.reduce((a, b) => a + b, 0) / vy.length : null;
  let first = -1, lastI = -1; for (let i = 0; i < d.length; i++) if (y[i] != null) { if (first < 0) first = i; lastI = i; }
  const area = !y2 && first >= 0 ? line(y) + 'L' + X(d[lastI]).toFixed(1) + ',' + (height - B) + 'L' + X(d[first]).toFixed(1) + ',' + (height - B) + 'Z' : null;
  return (
    <div ref={ref} class="ser">
      <div class="ser-h"><span><b>{label}</b>{unit ? ' · ' + unit : ''}</span>{label2 ? <b style={'color:' + color2}>{label2}</b> : avg != null ? <span>Ø {fmt(avg)}{unit ? '\u202F' + unit : ''}</span> : null}</div>
      <svg class="chart" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label + (avg != null ? ', Durchschnitt ' + fmt(avg) + ' ' + (unit || '') : '')}>
        <defs><linearGradient id={'sg' + label} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color={color} style="stop-opacity:var(--fill-top)" /><stop offset="1" stop-color={color} stop-opacity="0" /></linearGradient></defs>
        <line class="grid" x1={L} x2={W} y1={Y(v1)} y2={Y(v1)} /><line class="grid" x1={L} x2={W} y1={Y(v0)} y2={Y(v0)} />
        <text x={L - 5} y={Y(v1) + 3.5} text-anchor="end">{fmt(v1)}</text>
        <text x={L - 5} y={Y(v0) + 3.5} text-anchor="end">{fmt(v0)}</text>
        {area ? <path d={area} fill={`url(#sg${label})`} /> : null}
        {avg != null ? <line x1={L} x2={W} y1={Y(avg)} y2={Y(avg)} stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="3 3" /> : null}
        <path d={line(y)} fill="none" stroke={color} stroke-width="1.6" />
        {y2 ? <path d={line(y2)} fill="none" stroke={color2} stroke-width="1.4" /> : null}
        {cursor != null && d[cursor] != null ? <g><line x1={X(d[cursor])} x2={X(d[cursor])} y1={T} y2={height - B} stroke="var(--focus)" />{y[cursor] != null ? <text x={Math.min(W - 30, X(d[cursor]) + 4)} y={T + 9} style="fill:var(--focus);font-weight:600">{fmt(y[cursor])} {unit}</text> : null}</g> : null}
      </svg>
    </div>
  );
}

// Zeitabstand zweier Fahrten entlang der Strecke
export function GapChart({ rows, height = 140, nameA, nameB }) {
  const [ref, W] = useWidth();
  if (!rows || rows.length < 3) return null;
  const L = 44, B = 22, T = 12;
  const gaps = rows.map((r) => r.tB - r.tA);
  let g0 = Math.min(0, ...gaps), g1 = Math.max(0, ...gaps);
  if (g1 === g0) g1 = g0 + 60;
  const dmax = rows[rows.length - 1].d || 1;
  const X = (v) => L + (v / dmax) * (W - L - 4);
  const Y = (v) => T + (1 - (v - g0) / (g1 - g0)) * (height - T - B);
  let p = '';
  rows.forEach((r, i) => { p += (i ? 'L' : 'M') + X(r.d).toFixed(1) + ',' + Y(gaps[i]).toFixed(1); });
  const off = rows.filter((r) => r.off >= 80);
  const fmtG = (s) => (s >= 0 ? '+' : '−') + Math.floor(Math.abs(s) / 60) + ':' + String(Math.round(Math.abs(s) % 60)).padStart(2, '0');
  return (
    <div ref={ref}>
      <svg class="chart" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={'Zeitabstand von ' + nameB + ' zu ' + nameA + ' entlang der Strecke'}>
        {off.map((r) => <rect x={X(r.d) - 2} y={T} width="4" height={height - T - B} fill="var(--warn)" opacity=".18" />)}
        <line class="axis" x1={L} x2={W} y1={Y(0)} y2={Y(0)} />
        <text x={L - 5} y={Y(g1) + 3.5} text-anchor="end">{fmtG(g1)}</text>
        <text x={L - 5} y={Y(g0) + 3.5} text-anchor="end">{fmtG(g0)}</text>
        <path d={p} fill="none" stroke="var(--focus)" stroke-width="2" />
        <text x={W - 2} y={height - 6} text-anchor="end">{km(dmax)} km</text>
      </svg>
    </div>
  );
}

export function Ridge({ alt, color = 'var(--ink)' }) {
  if (!alt || alt.length < 2) return null;
  const W = 300, H = 56;
  const v = alt.filter((x) => x != null);
  const a0 = Math.min(...v), a1 = Math.max(...v) || a0 + 1;
  const n = alt.length;
  let p = '';
  alt.forEach((a, i) => { if (a == null) return; p += (p ? 'L' : 'M') + ((i / (n - 1)) * W).toFixed(1) + ',' + (H - 4 - ((a - a0) / (a1 - a0 || 1)) * (H - 10)).toFixed(1); });
  return <svg class="ridge" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><path d={p + `L${W},${H}L0,${H}Z`} fill={color} opacity=".1" /><path d={p} fill="none" stroke={color} stroke-width="2" vector-effect="non-scaling-stroke" /></svg>;
}

export function HBars({ rows, fmt, onSelect, max }) {
  const m = max || Math.max(...rows.map((r) => Math.max(r.value, r.prev || 0)), 0.0001);
  return (
    <div class="bars-h">
      {rows.map((r) => (
        <button type="button" onClick={() => onSelect && onSelect(r)} aria-label={r.label + ': ' + fmt(r.value) + (r.prev != null ? ', Vorperiode ' + fmt(r.prev) : '')}>
          {r.left || <span />}
          <div><div class="small" style="margin-bottom:3px">{r.label}</div><div class="track"><div class="fill" style={{ width: (r.value / m) * 100 + '%', background: r.color }} />{r.prev != null ? <div class="ghost" style={{ left: 0, width: (r.prev / m) * 100 + '%' }} /> : null}</div></div>
          <div class="right num small"><b>{fmt(r.value)}</b>{r.prev != null ? <div class="faint tiny">vorher {fmt(r.prev)}</div> : null}</div>
        </button>
      ))}
    </div>
  );
}
