// Graph-Bausteine (SVG): Achsen mit Einheit, Hilfslinien, Bänder, Referenzlinien,
// Punkte, Linien mit sichtbaren Lücken, Balken ab 0, Spannen, Fadenkreuz.
import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useWidth(fallback = 340) {
  const ref = useRef();
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => { const cw = Math.round(es[0].contentRect.width); if (cw > 0) setW(Math.max(220, cw)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Zahlen erscheinen direkt (keine hochzählenden Ziffern: sie würden das Layout in jedem Bild neu berechnen)
export function useCountUp(v) {
  const x = v;
  return x;
}

const PAD = { l: 2, r: 40, t: 18, b: 22 };

// Zeitgraph. layers(s) liefert die Ebenen; snap = Liste {t, ...} für das Fadenkreuz.
export function TimeChart({ height = 200, x, y, unit, layers, snap = [], sel, onSel, label, marks, pad: padIn, yFmt = (v) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(v), animKey }) {
  const [ref, W] = useWidth();
  const pad = { ...PAD, ...(padIn || {}) };
  const H = height;
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const sx = (t) => pad.l + ((t - x.min) / (x.max - x.min)) * pw;
  const sy = y.reverse ? (v) => pad.t + ((v - y.min) / (y.max - y.min)) * ph : (v) => pad.t + (1 - (v - y.min) / (y.max - y.min)) * ph;
  const s = { sx, sy, W, H, pad, pw, ph, x, y, sel };

  const idxAt = (clientX) => {
    const svg = ref.current && ref.current.querySelector('svg');
    if (!svg || !snap.length) return -1;
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = -1, bd = Infinity;
    snap.forEach((p, i) => { const d = Math.abs(sx(p.t) - px); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const selIdx = sel ? snap.findIndex((p) => p.t === sel.t) : -1;
  const move = (e) => { const i = idxAt(e.clientX); if (i >= 0 && onSel) onSel(snap[i]); };
  const key = (e) => {
    if (!snap.length || !onSel) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const i = selIdx < 0 ? (e.key === 'ArrowRight' ? 0 : snap.length - 1) : Math.max(0, Math.min(snap.length - 1, selIdx + (e.key === 'ArrowRight' ? 1 : -1)));
      onSel(snap[i]);
    } else if (e.key === 'Escape') onSel(null);
  };
  const xs = selIdx >= 0 ? sx(snap[selIdx].t) : null;
  const xt = x.ticks || [];
  return (
    <div ref={ref} style="position:relative">
      <svg class="viz" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={snap.length ? 0 : -1}
        onPointerDown={(e) => { move(e); }} onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) move(e); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse' && onSel) onSel(null); }} onKeyDown={key} onBlur={() => onSel && onSel(null)}>
        {/* Hilfslinien und y-Achse rechts */}
        {(y.ticks || []).map((v) => (
          <g>
            <line class={v === 0 && !y.reverse ? 'bl' : 'gl'} x1={pad.l} x2={pad.l + pw} y1={Math.round(sy(v)) + 0.5} y2={Math.round(sy(v)) + 0.5} />
            <text class="tk" x={W - 2} y={sy(v)} text-anchor="end" dominant-baseline="middle">{yFmt(v)}</text>
          </g>
        ))}
        {unit ? <text class="un" x={W - 2} y={9} text-anchor="end">{unit}</text> : null}
        {/* x-Achse */}
        {(() => {
          // Marken ohne Überlappung: von rechts (neuester Wert) nach links, zu nahe Marken entfallen
          let lastX = Infinity;
          return xt.slice().reverse().map((tk) => {
            const px = sx(tk.t);
            if (px < pad.l - 1 || px > pad.l + pw + 1 || !tk.label) return null;
            const wl = tk.label.length * 6.2;
            const anchor = px < pad.l + 12 ? 'start' : px > pad.l + pw - 12 ? 'end' : 'middle';
            const right = anchor === 'end' ? px : anchor === 'start' ? px + wl : px + wl / 2;
            const left = right - wl;
            if (right > lastX - 6) return null;
            lastX = left;
            return <text class="tk" x={px} y={H - 5} text-anchor={anchor}>{tk.label}</text>;
          });
        })()}
        <g key={animKey}>{layers(s)}</g>
        {xs != null ? (
          <g>
            <line class="xh" x1={Math.round(xs) + 0.5} x2={Math.round(xs) + 0.5} y1={pad.t - 6} y2={pad.t + ph} />
            {(marks ? marks(snap[selIdx], s) : []).map((m) => (m.v == null ? null : <circle class="dot" cx={xs} cy={sy(m.v)} r={m.r || 5} fill={m.color} />))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

// ---------- Ebenen ----------
export function Band({ s, lo, hi }) {
  if (lo == null || hi == null) return null;
  const y1 = s.sy(Math.min(Math.max(hi, s.y.min), s.y.max)), y0 = s.sy(Math.max(Math.min(lo, s.y.max), s.y.min));
  return <rect class="band v-fade" x={s.pad.l} y={Math.min(y0, y1)} width={s.pw} height={Math.abs(y0 - y1)} rx="3" />;
}

// Referenzlinie (Durchschnitt, Ziel, Bedarf) mit Beschriftung links
export function RefLine({ s, v, label, kind = 'ref', side = 'left' }) {
  if (v == null || v < s.y.min || v > s.y.max) return null;
  const yy = Math.round(s.sy(v)) + 0.5;
  const tx = side === 'left' ? s.pad.l + 2 : s.pad.l + s.pw - 2;
  const est = label ? label.length * 6.1 + 6 : 0;
  return (
    <g class="v-fade">
      <line class={kind === 'goal' ? 'goal' : 'ref'} x1={s.pad.l} x2={s.pad.l + s.pw} y1={yy} y2={yy} />
      {label ? <rect class="rl-bg" x={side === 'left' ? tx - 2 : tx - est + 2} y={yy - 14} width={est} height={12} rx="3" /> : null}
      {label ? <text class={'rl' + (kind === 'goal' ? ' k' : '')} x={tx} y={yy - 5} text-anchor={side === 'left' ? 'start' : 'end'}>{label}</text> : null}
    </g>
  );
}

// Bereich ohne Daten (z. B. vor Beginn der Aufzeichnung)
export function NoDataSpan({ s, t0, t1, text = 'keine Daten' }) {
  const a = Math.max(s.pad.l, s.sx(t0)), b = Math.min(s.pad.l + s.pw, s.sx(t1));
  if (b - a < 2) return null;
  return (
    <g>
      <rect class="gap" x={a} y={s.pad.t} width={b - a} height={s.ph} rx="4" />
      {b - a > 64 ? <text class="gapt" x={(a + b) / 2} y={s.pad.t + 12} text-anchor="middle">{text}</text> : null}
    </g>
  );
}

// Linie; null-Werte unterbrechen sie
export function Line({ s, data, color, width = 2, cls = '', opacity = 1, dash }) {
  const segs = [];
  let cur = [];
  for (const p of data) {
    if (p.v == null) { if (cur.length) segs.push(cur); cur = []; continue; }
    cur.push([s.sx(p.t), s.sy(p.v)]);
  }
  if (cur.length) segs.push(cur);
  return (
    <g opacity={opacity}>
      {segs.map((pts) => (pts.length === 1
        ? <circle cx={pts[0][0]} cy={pts[0][1]} r={width} fill={color} />
        : <path class={'v-draw ' + cls} pathLength="1" d={'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L')} fill="none" stroke={color} stroke-width={width} stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={dash} />))}
    </g>
  );
}

// Fläche unter einer Linie, blendet nach unten aus
let gid = 0;
export function Area({ s, data, color }) {
  const [id] = useState(() => 'ga' + (++gid));
  const pts = data.filter((p) => p.v != null);
  if (pts.length < 2) return null;
  const base = s.sy(s.y.min);
  const d = 'M' + pts.map((p) => s.sx(p.t).toFixed(1) + ',' + s.sy(p.v).toFixed(1)).join('L') + `L${s.sx(pts[pts.length - 1].t).toFixed(1)},${base}L${s.sx(pts[0].t).toFixed(1)},${base}Z`;
  return (
    <g class="v-fade">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color={color} style="stop-opacity:var(--fill-top)" /><stop offset="1" stop-color={color} stop-opacity="0" /></linearGradient></defs>
      <path d={d} fill={`url(#${id})`} />
    </g>
  );
}

export function Points({ s, data, color, r = 3.5, ring = true, opacity = 1 }) {
  return (
    <g class="v-fade" opacity={opacity}>
      {data.map((p) => (p.v == null ? null : <circle class={ring ? 'dot' : ''} cx={s.sx(p.t)} cy={s.sy(p.v)} r={r} fill={color} />))}
    </g>
  );
}

// Min/Max-Beschriftung an den Extrempunkten
export function MinMax({ s, min, max, fmt }) {
  const lab = (p, txt, above) => {
    if (!p) return null;
    const px = s.sx(p.t), py = s.sy(p.v);
    const anchor = px < s.pad.l + 30 ? 'start' : px > s.pad.l + s.pw - 30 ? 'end' : 'middle';
    return <text class="mm v-fade" x={px} y={above ? py - 9 : py + 15} text-anchor={anchor}>{txt + ' ' + fmt(p.v)}</text>;
  };
  return <g>{lab(max, 'max', true)}{min && max && min.t === max.t ? null : lab(min, 'min', false)}</g>;
}

const barPath = (x, y0, y1, w, r) => {
  const hh = y0 - y1; if (hh <= 0) return '';
  r = Math.min(r, w / 2, hh);
  return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
};
export const barW = (s, n) => Math.max(2, Math.min(24, (s.pw / Math.max(1, n)) * 0.62));

// Balken ab 0; hl = hervorgehoben (Kennzahlfarbe), sonst grau
export function Bars({ s, data, n, color, neutral = 'var(--neutral)' }) {
  const w = barW(s, n || data.length);
  return (
    <g>
      {data.map((p, i) => (p.v == null || p.v <= 0 ? null : (
        <path class="v-grow" style={`animation-delay:${Math.min(i * 12, 300)}ms`} d={barPath(s.sx(p.t) - w / 2, s.sy(Math.max(0, s.y.min)), s.sy(p.v), w, 4)} fill={p.hl || (s.sel && s.sel.t === p.t) ? color : neutral} />
      )))}
    </g>
  );
}

// Gestapelte Balken: parts [{v, c}] von unten nach oben; 2px Trennfuge
export function Stack({ s, data, n }) {
  const w = barW(s, n || data.length);
  return (
    <g>
      {data.map((p, i) => {
        let acc = 0;
        const parts = p.parts.filter((q) => q.v > 0);
        return (
          <g class="v-grow" style={`animation-delay:${Math.min(i * 12, 300)}ms`} opacity={s.sel && s.sel.t !== p.t ? 0.45 : 1}>
            {parts.map((q, j) => {
              const y0 = s.sy(acc), y1 = s.sy(acc + q.v);
              acc += q.v;
              const top = j === parts.length - 1;
              const yb = j === 0 ? y0 : y0 - 1, yt = top ? y1 : y1 + 1;
              return top ? <path d={barPath(s.sx(p.t) - w / 2, yb, yt, w, 4)} fill={q.c} /> : <rect x={s.sx(p.t) - w / 2} y={yt} width={w} height={Math.max(0, yb - yt)} fill={q.c} />;
            })}
          </g>
        );
      })}
    </g>
  );
}

// Spannen (z. B. Puls min–max je Tag) als Kapseln
export function Ranges({ s, data, n, color = 'var(--neutral)', w: wIn }) {
  const w = wIn || Math.max(3, Math.min(10, barW(s, n || data.length) * 0.7));
  return (
    <g class="v-fade">
      {data.map((p) => {
        if (p.lo == null || p.hi == null) return null;
        const y1 = s.sy(p.hi), y0 = s.sy(p.lo);
        return <rect x={s.sx(p.t) - w / 2} y={y1} width={w} height={Math.max(w, y0 - y1)} rx={w / 2} fill={color} opacity={s.sel && s.sel.t !== p.t ? 0.5 : 1} />;
      })}
    </g>
  );
}

// ---------- Kopfzeile, Legende, Tabelle, Skala ----------
export function Headline({ label, value, unit, sub, fmt = (v) => v }) {
  const n = useCountUp(typeof value === 'number' ? value : null);
  const shown = typeof value === 'number' ? fmt(n) : value;
  return (
    <div class="hd2" aria-live="polite">
      <div class="lbl2">{label}</div>
      <div class="big2">{shown == null ? '–' : shown}{unit && shown != null && shown !== 'keine Daten' ? <small>{unit}</small> : null}</div>
      {sub ? <div class="sub2">{sub}</div> : null}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div class="lg2">
      {items.map((it) => <span><i class={it.kind || 'ln'} style={it.kind === 'ds' ? '' : `background:${it.color}`} />{it.label}</span>)}
    </div>
  );
}

export function Table({ head, rows, summary = 'Werte als Tabelle' }) {
  return (
    <details class="tbl2">
      <summary>{summary} ({rows.length})</summary>
      <div class="scroll">
        <table>
          <thead><tr>{head.map((c) => <th>{c}</th>)}</tr></thead>
          <tbody>{rows.slice().reverse().map((r) => <tr>{r.map((c) => <td>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

export function Seg2({ value, options, onChange, label }) {
  return (
    <div class="seg2" role="group" aria-label={label}>
      {options.map(([v, l, dis]) => <button type="button" disabled={dis} aria-pressed={String(value === v)} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

// Skala mit Spannen-Balken und Dreieck-Markern; Werte stehen darunter in einer Zeile (keine Überlappung)
export function RangeScale({ min, max, lo, hi, markers = [], ticks = [], unit, stats }) {
  const pos = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)) + '%';
  return (
    <div>
      <div class="scale2" role="img" aria-label={(stats || markers).map((m) => m.label + ' ' + m.v + ' ' + (unit || '')).join(', ')}>
        <div class="tr" />
        {lo != null && hi != null ? <div class="rg" style={`left:${pos(lo)};width:calc(${pos(hi)} - ${pos(lo)})`} /> : null}
        {markers.map((m) => <div class={'tri' + (m.hollow ? ' ho' : '')} style={`left:${pos(m.v)}`} />)}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:var(--fs-cap2);color:var(--ink-2);margin:0 0 0">{ticks.map((t) => <span>{t}</span>)}</div>
      {stats ? (
        <div class="st2">{stats.map((m) => <div><span class="lbl2">{m.sym ? <i class={'tri-s' + (m.hollow ? ' ho' : '')} /> : null}{m.label}</span><b>{m.v != null ? m.v : '–'}</b></div>)}</div>
      ) : null}
    </div>
  );
}

// ---------- Hypnogramm: Schlafphasen über die Zeit ----------
export const STAGES = [
  { k: 'a', name: 'Wach', c: 'var(--sl-a)' },
  { k: 'r', name: 'REM', c: 'var(--sl-r)' },
  { k: 'l', name: 'Leicht', c: 'var(--sl-l)' },
  { k: 'd', name: 'Tief', c: 'var(--sl-d)' },
];
const clk = (m) => { const v = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
export function Hypnogram({ tl, height = 176, sel, onSel, label }) {
  const [ref, W] = useWidth();
  const pad = { l: 52, r: 8, t: 16, b: 22 };
  const segs = tl.seg;
  const end = Math.max(...segs.map((x) => x[2]));
  const pw = W - pad.l - pad.r, ph = height - pad.t - pad.b;
  const sx = (m) => pad.l + (m / end) * pw;
  const rowH = ph / 4;
  const row = (k) => STAGES.findIndex((st) => st.k === k);
  const bh = Math.min(22, rowH * 0.64);
  const cy = (k) => pad.t + row(k) * rowH + rowH / 2;
  // Stundenmarken
  const step = end > 420 ? 120 : 60;
  const ticks = [];
  for (let m = Math.ceil(tl.s0 / step) * step - tl.s0; m <= end; m += step) ticks.push(m);
  const at = (clientX) => {
    const svg = ref.current && ref.current.querySelector('svg'); if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const m = Math.max(0, Math.min(end, (((clientX - r.left) / r.width) * W - pad.l) / pw * end));
    const sg = segs.find((x) => m >= x[1] && m < x[2]) || null;
    return { m, sg };
  };
  const move = (e) => { const a = at(e.clientX); if (a && onSel) onSel(a); };
  const key = (e) => {
    if (!onSel) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const i = sel && sel.sg ? segs.indexOf(sel.sg) : -1;
      const j = Math.max(0, Math.min(segs.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowRight' ? 1 : -1)));
      onSel({ m: (segs[j][1] + segs[j][2]) / 2, sg: segs[j] });
    } else if (e.key === 'Escape') onSel(null);
  };
  return (
    <div ref={ref}>
      <svg class="viz" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} tabIndex={0}
        onPointerDown={move} onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) move(e); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse' && onSel) onSel(null); }} onKeyDown={key} onBlur={() => onSel && onSel(null)}>
        {STAGES.map((st, i) => (
          <g>
            <line class="gl" x1={pad.l} x2={pad.l + pw} y1={Math.round(pad.t + i * rowH + rowH / 2) + 0.5} y2={Math.round(pad.t + i * rowH + rowH / 2) + 0.5} opacity=".6" />
            <text class="tk" x={0} y={pad.t + i * rowH + rowH / 2} dominant-baseline="middle">{st.name}</text>
          </g>
        ))}
        {ticks.map((m) => <text class="tk" x={sx(m)} y={height - 5} text-anchor="middle">{clk(tl.s0 + m).slice(0, 2)}</text>)}
        <text class="un" x={pad.l + pw} y={9} text-anchor="end">Uhr</text>
        <g>
          {segs.map((x, i) => {
            const prev = segs[i - 1];
            return prev && prev[0] !== x[0] ? <line x1={sx(x[1])} x2={sx(x[1])} y1={cy(prev[0])} y2={cy(x[0])} stroke="var(--axis)" stroke-width="1" /> : null;
          })}
          {segs.map((x, i) => {
            const st = STAGES[row(x[0])];
            const w = Math.max(1.5, sx(x[2]) - sx(x[1]) - 0.5);
            return <rect class="v-fade" style={`animation-delay:${Math.min(i * 18, 500)}ms`} x={sx(x[1])} y={cy(x[0]) - bh / 2} width={w} height={bh} rx={Math.min(4, w / 2)} fill={st.c} opacity={sel && sel.sg && sel.sg !== x ? 0.45 : 1} />;
          })}
        </g>
        {sel ? <line class="xh" x1={sx(sel.m)} x2={sx(sel.m)} y1={pad.t} y2={pad.t + ph} /> : null}
      </svg>
    </div>
  );
}
export { clk as clockOfMinute };
