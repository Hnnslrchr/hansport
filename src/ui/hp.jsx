import { springTo, setValue, getValue, stop, project, tracker, haptic, reducedMotion } from './spring.js';
import { h, Fragment } from 'preact';
import { pop } from '../nav.js';
import { useState, useRef, useEffect } from 'preact/hooks';
import { ICONS } from './icons.js';

// ---------- Icons (Iconoir, 1,5 px Strich) ----------
export function Ico({ n, cls = '', label }) {
  const inner = ICONS[n] || ICONS['info-circle'];
  return <svg class={'ico ' + cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} dangerouslySetInnerHTML={{ __html: inner }} />;
}
export const SPORT_ICON = { mtb: 'cycling', road: 'bicycle', indoor: 'modern-tv', hike: 'trekking', gym: 'gym', snowboard: 'skateboarding', splitboard: 'snow', other: 'activity' };

// ---------- Kacheln ----------
export function Tile({ tone, onClick, cls = '', label, children, style }) {
  const click = onClick ? (e) => heroOpen(e.currentTarget, label, onClick) : null;
  const glow = /\bg-(herz|akt|erh|sch|kor|trn)\b/.test(cls) && !/\b(noglow|glow)\b/.test(cls) ? ' glow' : '';
  const c = 'tile ' + (tone || '') + (onClick ? ' tap' : '') + ' ' + cls + glow;
  return onClick
    ? <button type="button" class={c} onClick={click} aria-label={label} style={style}>{children}</button>
    : <div class={c} style={style}>{children}</div>;
}
const SRC = { garmin: 'Garmin', withings: 'Withings', athletedata: 'athletedata', strava: 'Strava', computed_strava: 'athletedata', hansport: 'berechnet', acts: 'Aktivitäten' };
export const srcName = (s) => SRC[s] || (s ? String(s) : '');
export function Head({ icon, label, src }) {
  return (
    <div class="hp-head">
      {icon ? <Ico n={icon} cls="s" /> : null}
      <span class="hp-lbl">{label}</span>
      {src ? <span class="hp-src">{srcName(src)}</span> : null}
    </div>
  );
}
export function Big({ v, u, cls = '' }) {
  return <div class={'big ' + cls}>{v}{u ? <small>{u}</small> : null}</div>;
}
export function NoData({ text = 'keine Daten' }) { return <div class="hp-none">{text}</div>; }
export function Chg({ d, fmt = (x) => x, better, unit = '', label }) {
  if (d == null || !isFinite(d)) return null;
  const up = d > 0, same = Math.abs(d) < 1e-9;
  const good = better == null || same ? null : better === 'up' ? up : !up;
  return <span class={'hp-delta' + (good === false ? ' hi' : '')}>{same ? '＝' : up ? '▲' : '▼'} {same ? 'gleich' : (up ? '+' : '−') + fmt(Math.abs(d)) + unit}{label ? ' ' + label : ''}</span>;
}

// ---------- Ringe ----------
export function Rings({ items, size = 132, stroke = 13, gap = 4, label }) {
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {items.map((it, i) => {
        const r = c - stroke / 2 - i * (stroke + gap);
        const L = 2 * Math.PI * r;
        const f = it.v == null ? 0 : Math.max(0, Math.min(1, it.v / (it.max || 100)));
        return (
          <g key={i} transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={r} fill="none" stroke="var(--track)" stroke-width={stroke} />
            {f > 0 ? <circle cx={c} cy={c} r={r} fill="none" stroke={it.color} stroke-width={stroke} stroke-linecap="round" stroke-dasharray={`${(L * f).toFixed(1)} ${L.toFixed(1)}`} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Balken-Sparklines, antippbar ----------
export function Bars({ items, height = 44, onPick, picked, label }) {
  // items: [{v, label}], letzter Wert hervorgehoben
  const [sel, setSel] = useState(null);
  const vals = items.map((x) => x.v).filter((v) => v != null);
  if (!vals.length) return null;
  const max = Math.max(...vals), min = Math.min(...vals);
  const lo = min - (max - min) * 0.35 - 1e-9;
  const idx = picked != null ? picked : sel;
  const pick = (i) => { setSel(i === idx ? null : i); onPick && onPick(i === idx ? null : i); };
  return (
    <Fragment>
      <div class="sparks" style={{ height: height + 'px' }} role="group" aria-label={label}>
        {items.map((x, i) => (
          <i key={i} class={x.v == null ? 'na' : i === (idx != null ? idx : items.length - 1) ? 'on' : ''} style={{ height: x.v == null ? '2px' : Math.max(8, ((x.v - lo) / (max - lo)) * 100) + '%' }}
            onClick={(e) => { e.stopPropagation(); pick(i); }} title={x.label} />
        ))}
      </div>
      {idx != null && items[idx] ? <div class="hp-sub" aria-live="polite">{items[idx].label}</div> : null}
    </Fragment>
  );
}

// ---------- Skala mit Verlauf (UV-Stil) ----------
export function ScaleG({ min, max, value, band, ticks, label }) {
  const pos = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  return (
    <div role="img" aria-label={label}>
      <div class="scale-g">
        {band ? <span class="band" style={{ left: pos(band[0]) + '%', width: Math.max(2, pos(band[1]) - pos(band[0])) + '%' }} /> : null}
        {value != null ? <span class="mk" style={{ left: pos(value) + '%' }} /> : null}
      </div>
      {ticks ? <div class="scale-ax">{ticks.map((t) => <span>{t}</span>)}</div> : null}
    </div>
  );
}

// ---------- Rundes Instrument mit Skalenstrichen ----------
export function Gauge({ min, max, value, size = 132, label, center, sub }) {
  const c = size / 2, r = size / 2 - 12;
  const a0 = 135, a1 = 405; // 270°-Bogen
  const ang = (v) => a0 + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (a1 - a0);
  const pt = (a, rr) => [c + rr * Math.cos((a * Math.PI) / 180), c + rr * Math.sin((a * Math.PI) / 180)];
  const ticks = [];
  for (let i = 0; i <= 40; i++) {
    const a = a0 + (i / 40) * (a1 - a0);
    const on = value != null && a <= ang(value);
    const [x1, y1] = pt(a, r), [x2, y2] = pt(a, r - (i % 5 === 0 ? 10 : 6));
    ticks.push(<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? 'var(--c, var(--ink))' : 'currentColor'} stroke-opacity={on ? 1 : 0.22} stroke-width={i % 5 === 0 ? 2 : 1.4} stroke-linecap="round" />);
  }
  let needle = null;
  if (value != null) { const [x, y] = pt(ang(value), r - 16); needle = <circle cx={x} cy={y} r="4.5" fill="var(--c, var(--ink))" />; }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} style="display:block;margin:0 auto">
      {ticks}{needle}
      <text x={c} y={c + (sub ? 2 : 6)} text-anchor="middle" font-family="var(--display)" font-size={size * 0.24} font-weight="600" fill="currentColor" letter-spacing="-1">{center != null ? center : '–'}</text>
      {sub ? <text x={c} y={c + size * 0.15} text-anchor="middle" font-size="9.5" font-weight="500" letter-spacing="0.6" fill="currentColor" fill-opacity="0.6">{sub}</text> : null}
      <text x={pt(a0, r)[0] + 2} y={size - 4} text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.5">{min}</text>
      <text x={pt(a1, r)[0] - 2} y={size - 4} text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.5">{max}</text>
    </svg>
  );
}

// ---------- Bogenkurve mit Verlauf ----------
let gid = 0;
export function ArcArea({ values, height = 70, label }) {
  const pts = values.map((v, i) => [i, v]).filter((p) => p[1] != null);
  const [id] = useState(() => 'g' + ++gid);
  if (pts.length < 2) return null;
  const W = 300, H = height;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x) => ((x - x0) / (x1 - x0 || 1)) * (W - 8) + 4, Y = (y) => H - 6 - ((y - y0) / (y1 - y0 || 1)) * (H - 16);
  let d = 'M' + X(pts[0][0]) + ',' + Y(pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = [X(pts[i - 1][0]), Y(pts[i - 1][1])], [bx, by] = [X(pts[i][0]), Y(pts[i][1])];
    const mx = (ax + bx) / 2;
    d += ` C${mx},${ay} ${mx},${by} ${bx},${by}`;
  }
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="sparkline" style={{ height: H + 'px' }} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c, var(--ink))" stop-opacity="0.35" /><stop offset="1" stop-color="var(--c, var(--ink))" stop-opacity="0" /></linearGradient></defs>
      <path d={d + ` L${X(last[0])},${H} L${X(pts[0][0])},${H} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="var(--c, var(--ink))" stroke-width="2.2" vector-effect="non-scaling-stroke" />
      <circle cx={X(last[0])} cy={Y(last[1])} r="3.5" fill="var(--c, var(--ink))" />
    </svg>
  );
}

// ---------- Linie mit Antippen für Details (Sheets, Gesundheit) ----------
export function LineChart({ points, fmt = (v) => v, band, height = 150, label, bars }) {
  // points: [{date, v, label}]
  const ref = useRef();
  const [sel, setSel] = useState(null);
  const ok = points.filter((p) => p.v != null);
  if (!ok.length) return <div class="hp-none" style="padding:20px 0">keine Daten in diesem Zeitraum</div>;
  const W = 340, H = height, L = 4, R = 4, T = 12, B = 18;
  const vs = ok.map((p) => p.v).concat(band ? band : []);
  let y0 = Math.min(...vs), y1 = Math.max(...vs);
  if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.12; y0 -= pad; y1 += pad;
  const n = points.length;
  const X = (i) => L + (n > 1 ? (i / (n - 1)) * (W - L - R) : (W - L - R) / 2), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const segs = []; let cur = [];
  points.forEach((p, i) => { if (p.v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(p.v)]); });
  if (cur.length) segs.push(cur);
  const s = sel != null ? points[sel] : null;
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = null, bd = 1e9;
    points.forEach((p, i) => { if (p.v != null && Math.abs(X(i) - x) < bd) { bd = Math.abs(X(i) - x); best = i; } });
    setSel(best);
  };
  const bw = Math.max(2, ((W - L - R) / n) * 0.62);
  return (
    <div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H + 'px', touchAction: 'pan-y', display: 'block' }} preserveAspectRatio="none" role="img" aria-label={label}
        onPointerDown={onMove} onPointerMove={(e) => e.buttons && onMove(e)}>
        {band ? <rect x={L} width={W - L - R} y={Y(band[1])} height={Math.max(1, Y(band[0]) - Y(band[1]))} fill="var(--track)" rx="4" /> : null}
        {bars ? points.map((p, i) => p.v == null ? null : <rect x={X(i) - bw / 2} width={bw} y={Y(p.v)} height={Math.max(1, H - B - Y(p.v))} rx="2" fill={i === sel ? 'var(--c, var(--ink))' : 'var(--ink)'} fill-opacity={i === sel ? 1 : 0.8} />)
          : segs.map((sg) => <Fragment><path d={'M' + sg.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L')} fill="none" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />{sg.length === 1 ? <circle cx={sg[0][0]} cy={sg[0][1]} r="3" fill="var(--ink)" /> : null}</Fragment>)}
        {s && s.v != null && !bars ? <Fragment><line x1={X(sel)} x2={X(sel)} y1={T - 6} y2={H - B} stroke="var(--c, var(--ink))" stroke-width="1" vector-effect="non-scaling-stroke" /><circle cx={X(sel)} cy={Y(s.v)} r="4.5" fill="var(--c, var(--ink))" /></Fragment> : null}
        <text x={L} y={H - 4} font-size="11" fill="var(--ink-3)">{points[0].tick || ''}</text>
        <text x={W - R} y={H - 4} font-size="11" fill="var(--ink-3)" text-anchor="end">{points[n - 1].tick || ''}</text>
      </svg>
      <div class="hp-sub" aria-live="polite" style="min-height:1.3em">{s ? s.label + ': ' + fmt(s.v) : 'Antippen oder ziehen für Einzelwerte.'}</div>
    </div>
  );
}

// ---------- Schlafphasen ----------
export function Stages({ sl }) {
  if (!sl) return null;
  const parts = [['deep', 'Tief'], ['light', 'Leicht'], ['rem', 'REM'], ['awake', 'Wach']].filter(([k]) => sl[k] != null);
  // Balken nur mit Schlafphasen; „Wach“ steht in der Legende (Farbe zu nah an REM)
  const bar = parts.filter(([k]) => k !== 'awake');
  const tot = bar.reduce((s, [k]) => s + sl[k], 0) || 1;
  const hm = (m) => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
  return (
    <Fragment>
      <div class="stages" role="img" aria-label={'Schlafphasen: ' + parts.map(([k, l]) => l + ' ' + hm(sl[k]) + ' h').join(', ')}>
        {bar.map(([k]) => (sl[k] > 0 ? <span class={'st-' + k} style={{ flex: sl[k] / tot }} /> : null))}
      </div>
      <div class="leg-s">{parts.map(([k, l]) => <span>{k === 'awake' ? null : <i class={'st-' + k} />}{l} {hm(sl[k])}</span>)}</div>
    </Fragment>
  );
}

// ---------- Ziehgesten: Pull-to-refresh und Wischen zum Zurück ----------
const rubber = (x, d = 300, c = 0.55) => (x * d * c) / (d + c * Math.abs(x));
export function usePullToRefresh(scrollRef, onRefresh) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ind = el.querySelector('.ptr .ind');
    let y0 = null, dy = 0, busy = false;
    const set = (v, anim) => { if (!ind) return; ind.style.transition = anim ? 'transform 300ms cubic-bezier(.2,.9,.25,1), opacity 200ms' : 'none'; ind.style.transform = `translateY(${v}px) rotate(${v * 4}deg)`; ind.style.opacity = String(Math.min(1, v / 50)); };
    const down = (e) => { if (busy || el.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; };
    const move = (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy <= 0) { set(0); return; } set(rubber(dy)); };
    const up = async () => {
      if (y0 == null) return;
      const go = rubber(dy) > 62; y0 = null;
      if (!go) { set(0, true); return; }
      busy = true; set(56, true); ind && ind.classList.add('spin');
      try { await onRefresh(); } finally { busy = false; ind && ind.classList.remove('spin'); set(0, true); }
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', up);
    return () => { el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', up); };
  }, [scrollRef.current]);
}
export function PtrIndicator() { return <div class="ptr" aria-hidden="true"><div class="ind"><Ico n="refresh-double" cls="s" /></div></div>; }

export const pageApply = (el) => (x) => {
  const w = el.offsetWidth || 400;
  el.style.transform = x ? `translate3d(${x}px,0,0)` : '';
  el.style.opacity = x > 0 ? String(1 - 0.3 * Math.min(1, x / w)) : '';
};
// Vom linken Rand zurückwischen: folgt dem Finger, übergibt die Geschwindigkeit an die Feder.
export function useSwipeBack(ref, onBack, enabled) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const apply = pageApply(el);
    let x0 = null, y0 = 0, base = 0, dx = 0, lock = null, tr = null, armed = false;
    const down = (e) => { const t = e.touches[0]; if (t.clientX > 28) return; x0 = t.clientX; y0 = t.clientY; lock = null; dx = 0; armed = false; };
    const move = (e) => {
      if (x0 == null) return;
      const t = e.touches[0]; const ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (lock == null && Math.abs(ddx) + Math.abs(ddy) > 10) { lock = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y'; if (lock === 'x') { stop(el, 'x'); base = getValue(el, 'x'); tr = tracker(); } }
      if (lock !== 'x') return;
      dx = Math.max(0, base + ddx); tr.add(dx);
      setValue(el, 'x', dx, apply);
      const w = el.offsetWidth; const go = dx > w * 0.45;
      if (go !== armed) { armed = go; if (go) haptic(); }
    };
    const up = () => {
      if (x0 == null) return;
      x0 = null;
      if (lock !== 'x') return;
      const v = tr.v(), w = el.offsetWidth;
      if (dx + project(v) > w * 0.45) { swipedBack = true; springTo(el, 'x', w, { response: 0.3, velocity: Math.max(v, 400), apply, onDone: onBack, eps: 2 }); }
      else springTo(el, 'x', 0, { response: 0.32, damping: Math.abs(v) > 300 ? 0.85 : 1, velocity: v, apply });
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    return () => { el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', up); el.removeEventListener('touchcancel', up); };
  }, [ref.current, enabled]);
}
export let swipedBack = false;
export const clearSwiped = () => { swipedBack = false; };

// ---------- Kachel ↔ Detail ----------
// Die Kachel wächst in den „Himmel“ der Detailansicht und schrumpft beim Zurückgehen wieder in die Kachel.
export let heroBack = null; // { label } der Kachel, aus der die Detailansicht geöffnet wurde
export let vtRunning = false;
const canVT = () => typeof document !== 'undefined' && !!document.startViewTransition && !reducedMotion();
const settle = () => new Promise((r) => setTimeout(r, 34));
export function heroOpen(el, label, go) {
  if (!canVT() || !el) { heroBack = null; go(); return; }
  el.style.viewTransitionName = 'hero';
  vtRunning = true;
  const t = document.startViewTransition(async () => { go(); await settle(); });
  heroBack = { label };
  t.finished.finally(() => { vtRunning = false; el.style.viewTransitionName = ''; });
}
export function heroClose(goBack) {
  const hb = heroBack; heroBack = null;
  if (!canVT() || !hb) return false;
  vtRunning = true;
  let tile = null;
  const t = document.startViewTransition(async () => {
    goBack(); await settle();
    tile = [...document.querySelectorAll('.tile, .htile')].find((x) => x.getAttribute('aria-label') === hb.label);
    if (tile) { tile.scrollIntoView({ block: 'nearest' }); tile.style.viewTransitionName = 'hero'; }
  });
  t.finished.finally(() => { vtRunning = false; if (tile) tile.style.viewTransitionName = ''; });
  return true;
}

// Zurück: Detail schrumpft in die Kachel; sonst gleitet die Seite nach rechts hinaus (gleicher Weg wie hinein)
export function back() {
  if (heroClose(pop)) return;
  const el = document.querySelector('.stage');
  if (!el || reducedMotion()) { pop(); return; }
  swipedBack = true;
  springTo(el, 'x', el.offsetWidth, { response: 0.3, apply: pageApply(el), onDone: pop, eps: 2 });
}
