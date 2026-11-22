import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { merc, unmerc, PLACES, distToSegment } from '../geo.js';
import { int } from '../format.js';
import { drawBase, onBaseChange, isDark, landColor, ATTRIBUTION, baseReady } from './basemap.js';

const wcache = new WeakMap();
function world(pts) {
  let w = wcache.get(pts);
  if (w) return w;
  const xy = new Float64Array(pts.length * 2);
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = merc(pts[i][0], pts[i][1]);
    xy[i * 2] = x; xy[i * 2 + 1] = y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  w = { xy, bb: [x0, y0, x1, y1] };
  wcache.set(pts, w);
  return w;
}

// Farbskala für Durchfahrten
const RAMP = [
  [1, [150, 150, 155, 170]], [2, [127, 207, 221, 205]], [4, [40, 190, 215, 230]], [10, [1, 147, 169, 245]], [25, [0, 98, 116, 255]],
];
const rampLUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let c = 1; c < 256; c++) {
    let col = RAMP[0][1];
    for (const [min, cc] of RAMP) if (c >= min) col = cc;
    lut.set(col, c * 4);
  }
  return lut;
})();
export const HEAT_LEGEND = [['1×', 'rgb(150,150,155)'], ['2–3×', 'rgb(127,207,221)'], ['4–9×', 'rgb(40,190,215)'], ['10–24×', 'rgb(1,147,169)'], ['25×+', 'rgb(0,98,116)']];

class MapCore {
  constructor(host, canvas, props) {
    this.host = host; this.cv = canvas; this.props = props;
    this.view = { x: 0.531, y: 0.357, z: 9 };
    this.heatCv = document.createElement('canvas');
    this.heatView = null;
    this.ptrs = new Map();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!props.still) this.bind();
    if (props.basemap !== false) { baseReady(); this.unsub = onBaseChange(() => this.draw()); }
    this.resize();
  }
  destroy() { if (this.unsub) this.unsub(); cancelAnimationFrame(this.raf); this.raf = null; this.dead = true; }
  col(c, fb) { if (c && c.startsWith('var(')) return this.css(c.slice(4, -1).trim(), fb || '#0193A9'); return c || fb; }
  css(name, fb) { try { return getComputedStyle(this.host).getPropertyValue(name).trim() || fb; } catch (e) { return fb; } }
  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(50, r.width); this.h = Math.max(50, r.height);
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.heatDirty = true;
    this.draw();
  }
  scale() { return 256 * Math.pow(2, this.view.z); }
  toScreen(wx, wy) { const s = this.scale(); return [(wx - this.view.x) * s + this.w / 2, (wy - this.view.y) * s + this.h / 2]; }
  toWorld(sx, sy) { const s = this.scale(); return [(sx - this.w / 2) / s + this.view.x, (sy - this.h / 2) / s + this.view.y]; }
  fit(ptsList, pad = this.props.pad ?? 36) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, any = false;
    for (const pts of ptsList) {
      if (!pts || !pts.length) continue;
      const { bb } = world(pts);
      any = true;
      x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]); x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]);
    }
    if (!any) return;
    const dw = Math.max(1e-6, x1 - x0), dh = Math.max(1e-6, y1 - y0);
    // rechts Platz für die Zoom-Knöpfe lassen
    const rs = this.props.still ? 0 : 44;
    const sx = (this.w - pad * 2 - rs) / dw, sy = (this.h - pad * 2) / dh;
    const z = Math.max(3, Math.min(this.props.maxFit || 17, Math.log2(Math.min(sx, sy) / 256)));
    this.view = { x: (x0 + x1) / 2 + rs / 2 / (256 * 2 ** z), y: (y0 + y1) / 2, z };
    this.heatDirty = true;
    this.draw();
  }
  zoomAt(f, sx = this.w / 2, sy = this.h / 2) {
    const [wx, wy] = this.toWorld(sx, sy);
    const z = Math.max(3, Math.min(18, this.view.z + Math.log2(f)));
    const s = 256 * Math.pow(2, z);
    this.view = { z, x: wx - (sx - this.w / 2) / s, y: wy - (sy - this.h / 2) / s };
    this.scheduleHeat();
    this.draw();
  }
  scheduleHeat() {
    this.heatDirty = true;
    clearTimeout(this.ht);
    this.ht = setTimeout(() => { this.draw(); }, 140);
  }
  bind() {
    const c = this.cv;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.ptrs.set(e.pointerId, pos(e));
      this.down = { t: Date.now(), p: pos(e), moved: 0, n: this.ptrs.size };
      this.gesture = true;
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.ptrs.has(e.pointerId)) return;
      const p = pos(e);
      const prev = this.ptrs.get(e.pointerId);
      if (this.ptrs.size === 1) {
        const s = this.scale();
        this.view = { ...this.view, x: this.view.x - (p[0] - prev[0]) / s, y: this.view.y - (p[1] - prev[1]) / s };
        if (this.down) this.down.moved += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        this.ptrs.set(e.pointerId, p);
      } else if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()];
        const other = a === prev ? b : a;
        const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
        const d1 = Math.hypot(p[0] - other[0], p[1] - other[1]);
        this.ptrs.set(e.pointerId, p);
        if (d0 > 0) {
          const mid = [(p[0] + other[0]) / 2, (p[1] + other[1]) / 2];
          const pm = [(prev[0] + other[0]) / 2, (prev[1] + other[1]) / 2];
          const s = this.scale();
          this.view = { ...this.view, x: this.view.x - (mid[0] - pm[0]) / s, y: this.view.y - (mid[1] - pm[1]) / s };
          this.zoomAt(d1 / d0, mid[0], mid[1]);
        }
        if (this.down) this.down.moved += 20;
      }
      this.heatDirty = true;
      this.draw();
    });
    const up = (e) => {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.delete(e.pointerId);
      if (this.ptrs.size === 0) {
        this.gesture = false;
        const d = this.down;
        if (d && d.moved < 8 && Date.now() - d.t < 450 && d.n === 1) {
          const now = Date.now();
          if (this.lastTap && now - this.lastTap < 300) { this.zoomAt(2, d.p[0], d.p[1]); this.lastTap = 0; }
          else { this.lastTap = now; this.tap(d.p); }
        }
        this.scheduleHeat();
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), p[0], p[1]);
    }, { passive: false });
  }
  tap(p) {
    const cb = this.props.onTap;
    if (!cb) return;
    const [wx, wy] = this.toWorld(p[0], p[1]);
    const tol = 14 / this.scale();
    const hits = [];
    const test = (id, pts) => {
      if (!pts || pts.length < 2) return;
      const { xy, bb } = world(pts);
      if (wx < bb[0] - tol || wx > bb[2] + tol || wy < bb[1] - tol || wy > bb[3] + tol) return;
      let best = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const d = distToSegment(wx, wy, xy[i * 2 - 2], xy[i * 2 - 1], xy[i * 2], xy[i * 2 + 1]);
        if (d < best) best = d;
      }
      if (best <= tol) hits.push({ id, d: best });
    };
    const P = this.props;
    if (P.mode !== 'lines') for (const it of P.heat || []) test(it.id, it.pts);
    for (const l of P.lines || []) if (l.id) test(l.id, l.pts);
    const seen = new Set();
    const ids = hits.sort((a, b) => a.d - b.d).map((x) => x.id).filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
    cb({ latlng: unmerc(wx, wy), ids, screen: p });
  }
  buildHeat() {
    const P = this.props;
    const items = P.heat || [];
    const W = Math.round(this.w * this.dpr), H = Math.round(this.h * this.dpr);
    const hc = this.heatCv;
    hc.width = W; hc.height = H;
    const ctx = hc.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, W, H);
    if (!items.length) { this.heatView = { ...this.view, w: this.w, h: this.h }; return; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgb(1,0,0)';
    ctx.lineWidth = Math.max(2, 2.2 * this.dpr);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const s = this.scale() * this.dpr;
    const ox = this.view.x, oy = this.view.y, cx = W / 2, cy = H / 2;
    const [vx0, vy0] = this.toWorld(0, 0), [vx1, vy1] = this.toWorld(this.w, this.h);
    for (const it of items) {
      if (!it.pts || it.pts.length < 2) continue;
      const { xy, bb } = world(it.pts);
      if (bb[2] < vx0 || bb[0] > vx1 || bb[3] < vy0 || bb[1] > vy1) continue;
      ctx.beginPath();
      for (let i = 0; i < it.pts.length; i++) {
        const x = (xy[i * 2] - ox) * s + cx, y = (xy[i * 2 + 1] - oy) * s + cy;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    // einfarbig (z. B. blasse übrige Spuren hinter einer einzelnen Aktivität)
    const mono = P.heatMono ? (isDark() ? [120, 120, 128] : [150, 150, 158]) : null;
    for (let i = 0; i < d.length; i += 4) {
      const c = d[i];
      if (!c) { d[i + 3] = 0; continue; }
      if (mono) { d[i] = mono[0]; d[i + 1] = mono[1]; d[i + 2] = mono[2]; d[i + 3] = c > 1 ? 215 : 150; continue; }
      d[i] = rampLUT[c * 4]; d[i + 1] = rampLUT[c * 4 + 1]; d[i + 2] = rampLUT[c * 4 + 2]; d[i + 3] = rampLUT[c * 4 + 3];
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.putImageData(img, 0, 0);
    // heller bzw. dunkler Saum, damit die Spuren auf der Karte lesbar bleiben
    if (P.basemap !== false) {
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(hc, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.shadowColor = this.css('--bg', '#fff'); ctx.shadowBlur = 2.5 * this.dpr;
      ctx.drawImage(tmp, 0, 0); ctx.drawImage(tmp, 0, 0);
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      ctx.drawImage(tmp, 0, 0);
    }
    this.heatView = { ...this.view, w: this.w, h: this.h };
    this.heatDirty = false;
  }
  draw() {
    if (this.raf || this.dead) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.render(); });
  }
  // Beschriftungen der Grundkarte nicht über die eigene Strecke legen
  avoider() {
    const P = this.props;
    const lines = [];
    for (const l of P.lines || []) { if (l.segments) for (const sg of l.segments) lines.push(sg.pts); else lines.push(l.pts); }
    if (!lines.length && !(P.markers || []).length) return null;
    const cell = 8, gw = Math.ceil(this.w / cell) + 1, gh = Math.ceil(this.h / cell) + 1;
    const occ = new Uint8Array(gw * gh);
    const mark = (x, y) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell); if (cx >= 0 && cy >= 0 && cx < gw && cy < gh) occ[cy * gw + cx] = 1; };
    for (const pts of lines) {
      if (!pts || pts.length < 2) continue;
      const { xy } = world(pts);
      let [px, py] = this.toScreen(xy[0], xy[1]);
      mark(px, py);
      for (let i = 1; i < pts.length; i++) {
        const [x, y] = this.toScreen(xy[i * 2], xy[i * 2 + 1]);
        const n = Math.ceil(Math.hypot(x - px, y - py) / (cell / 2));
        for (let k = 1; k <= n; k++) mark(px + ((x - px) * k) / n, py + ((y - py) * k) / n);
        px = x; py = y;
      }
    }
    for (const m of P.markers || []) { const [x, y] = this.toScreen(...merc(m.pt[0], m.pt[1])); for (let dx = -8; dx <= 8; dx += 8) for (let dy = -8; dy <= 8; dy += 8) mark(x + dx, y + dy); }
    return (r) => {
      const x0 = Math.max(0, Math.floor(r[0] / cell)), x1 = Math.min(gw - 1, Math.floor(r[2] / cell));
      const y0 = Math.max(0, Math.floor(r[1] / cell)), y1 = Math.min(gh - 1, Math.floor(r[3] / cell));
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (occ[cy * gw + cx]) return true;
      return false;
    };
  }
  render() {
    const P = this.props;
    const ctx = this.cv.getContext('2d');
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = this.view.z;
    const dark = P.basemap !== false && isDark();
    ctx.fillStyle = P.basemap !== false && baseReady() ? landColor(dark) : this.css('--map-bg', '#E3E6DF');
    ctx.fillRect(0, 0, this.w, this.h);
    // Grundkarte (OpenStreetMap); außerhalb des Kartengebiets Gitter und grobe Ortsnamen
    this.covered = P.basemap !== false && drawBase(ctx, this.view, this.w, this.h, dpr, { dark, labels: P.labels !== false, lowRes: P.still, avoid: this.avoider() });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.covered) {
    // Gitter in Grad
    const stepDeg = z > 13 ? 0.01 : z > 11.5 ? 0.02 : z > 10 ? 0.05 : z > 8.5 ? 0.1 : z > 7 ? 0.25 : 1;
    const [tlx, tly] = this.toWorld(0, 0), [brx, bry] = this.toWorld(this.w, this.h);
    const [la1, lo0] = unmerc(tlx, tly), [la0, lo1] = unmerc(brx, bry);
    ctx.strokeStyle = this.css('--map-grid', 'rgba(0,0,0,.06)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lo = Math.ceil(lo0 / stepDeg) * stepDeg; lo < lo1; lo += stepDeg) { const [x] = this.toScreen(merc(0, lo)[0], 0); ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
    for (let la = Math.ceil(la0 / stepDeg) * stepDeg; la < la1; la += stepDeg) { const [, y] = this.toScreen(0, merc(la, 0)[1]); ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
    ctx.stroke();
    }
    // Heatmap
    if ((P.heat || []).length && P.mode !== 'lines') {
      if (this.heatDirty && !this.gesture) this.buildHeat();
      const hv = this.heatView;
      if (hv) {
        const k = Math.pow(2, this.view.z - hv.z);
        const s = this.scale();
        const dx = (hv.x - this.view.x) * s + this.w / 2 - (hv.w / 2) * k;
        const dy = (hv.y - this.view.y) * s + this.h / 2 - (hv.h / 2) * k;
        ctx.globalAlpha = P.heatAlpha ?? 1;
        ctx.drawImage(this.heatCv, dx, dy, hv.w * k, hv.h * k);
        ctx.globalAlpha = 1;
      }
    }
    // Linien
    const drawLine = (pts, color0, width, alpha = 1, halo = true, dash) => {
      if (!pts || pts.length < 2) return;
      const color = this.col(color0);
      const { xy } = world(pts);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const [x, y] = this.toScreen(xy[i * 2], xy[i * 2 + 1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (halo) { ctx.strokeStyle = this.css('--bg', '#fff'); ctx.globalAlpha = 0.85 * alpha; ctx.lineWidth = width + 3; ctx.setLineDash([]); ctx.stroke(); }
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    };
    if (P.mode === 'lines') for (const it of P.heat || []) drawLine(it.pts, it.color || '#0193A9', 1.6, 0.55, false);
    for (const l of P.lines || []) {
      if (l.segments) { for (const sg of l.segments) drawLine(sg.pts, sg.color, l.width || 3.5, l.alpha ?? 1, l.halo !== false); }
      else drawLine(l.pts, l.color, l.width || 3, l.alpha ?? 1, l.halo !== false, l.dash);
    }
    // Orte
    if (P.labels !== false && !this.covered) {
      ctx.font = '600 11px Geist, ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const placed = [];
      for (const [name, la, lo, tier] of PLACES) {
        if ((tier === 2 && z < 9.5) || (tier === 3 && z < 10.5)) continue;
        const [x, y] = this.toScreen(...merc(la, lo));
        if (x < -40 || y < -10 || x > this.w + 40 || y > this.h + 10) continue;
        if (placed.some(([px, py]) => Math.abs(px - x) < 70 && Math.abs(py - y) < 16)) continue;
        placed.push([x, y]);
        ctx.fillStyle = this.css('--bg', '#fff'); ctx.globalAlpha = 0.75;
        const tw = ctx.measureText(name).width;
        ctx.fillRect(x - tw / 2 - 3, y - 9, tw + 6, 14);
        ctx.globalAlpha = 1;
        ctx.fillStyle = tier === 3 ? this.css('--ink-2', '#555') : this.css('--ink', '#111');
        ctx.fillText(name, x, y + 2);
      }
    }
    // Marker
    for (const m of P.markers || []) {
      const [x, y] = this.toScreen(...merc(m.pt[0], m.pt[1]));
      ctx.beginPath(); ctx.arc(x, y, m.r || 6, 0, Math.PI * 2);
      if (m.ring) { ctx.fillStyle = this.css('--surface', '#fff'); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = this.col(m.color, '#111'); ctx.stroke(); continue; }
      ctx.fillStyle = this.col(m.color, '#111'); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = this.css('--bg', '#fff'); ctx.stroke();
      if (m.label) { ctx.font = '700 10px Geist, ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(m.label, x, y + 3.5); }
    }
    if (P.cursor) {
      const [x, y] = this.toScreen(...merc(P.cursor[0], P.cursor[1]));
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = this.css('--focus', '#2462A6'); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    // Maßstab
    if (P.still) return;
    const [, cla] = [0, unmerc(this.view.x, this.view.y)[0]];
    const mpp = (Math.cos((cla * Math.PI) / 180) * 40075016.686) / this.scale();
    const target = 90 * mpp;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((k) => k * pow).filter((v) => v <= target).pop() || pow;
    const px = nice / mpp;
    const top = P.basemap !== false || P.scaleTop != null;
    const bx = top ? 12 : this.w - px - 12, by = top ? (P.scaleTop ?? 10) + 12 : this.h - 14;
    ctx.strokeStyle = this.css('--ink', '#111'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by); ctx.lineTo(bx + px, by); ctx.lineTo(bx + px, by - 5); ctx.stroke();
    ctx.font = '600 10px Geist, ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = this.css('--ink', '#111'); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const st = nice >= 1000 ? int(nice / 1000) + ' km' : int(nice) + ' m';
    ctx.lineJoin = 'round'; ctx.strokeStyle = this.css('--bg', '#fff'); ctx.lineWidth = 3; ctx.strokeText(st, bx + px / 2, by - 7);
    ctx.fillText(st, bx + px / 2, by - 7);
  }
}

export function MapView(props) {
  const host = useRef(), cv = useRef(), core = useRef();
  useEffect(() => {
    core.current = new MapCore(host.current, cv.current, props);
    if (props.fit) core.current.fit(props.fit);
    let ro;
    try { ro = new ResizeObserver(() => core.current.resize()); ro.observe(host.current); } catch (e) { /* alt */ }
    if (props.coreRef) props.coreRef.current = core.current;
    return () => { if (ro) ro.disconnect(); core.current.destroy(); };
  }, []);
  useEffect(() => {
    const c = core.current;
    if (!c) return;
    const heatChanged = c.props.heat !== props.heat || c.props.mode !== props.mode;
    c.props = props;
    if (heatChanged) c.heatDirty = true;
    c.draw();
  });
  useEffect(() => { if (core.current && props.fit) core.current.fit(props.fit); }, [props.fitKey]);
  const lat = core.current ? unmerc(core.current.view.x, core.current.view.y) : null;
  return (
    <div class={'map ' + (props.class || '')} ref={host} style={props.height ? { height: props.height } : null}>
      <canvas ref={cv} role="img" aria-label={props.label || 'Karte'} style={props.still ? 'pointer-events:none' : null} />
      {props.legend}
      {props.still ? null : <div class="ctrl">
        <button type="button" aria-label="Hineinzoomen" onClick={() => core.current.zoomAt(2)}>+</button>
        <button type="button" aria-label="Herauszoomen" onClick={() => core.current.zoomAt(0.5)}>−</button>
        {props.fit ? <button type="button" aria-label="Alles zeigen" onClick={() => core.current.fit(props.fit)} style="font-size:var(--fs-foot);font-weight:700">⤢</button> : null}
      </div>}
      {props.attr === false ? null : <div class="attr">{props.basemap === false ? 'Eigene GPS-Spuren · Ortsnamen ungefähr' : ATTRIBUTION}</div>}
    </div>
  );
}

export function appleMapsUrl(core, pts) {
  let lat, lng, z = 12;
  if (core) { [lat, lng] = unmerc(core.view.x, core.view.y); z = Math.round(core.view.z); }
  else if (pts && pts.length) { lat = pts[Math.floor(pts.length / 2)][0]; lng = pts[Math.floor(pts.length / 2)][1]; }
  if (lat == null) return null;
  return 'https://maps.apple.com/?ll=' + lat.toFixed(5) + ',' + lng.toFixed(5) + '&z=' + z + '&t=k';
}
