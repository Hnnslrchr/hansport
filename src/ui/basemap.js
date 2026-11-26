// Grundkarte aus OpenStreetMap-Vektorkacheln (Schema OpenMapTiles, Daten von OpenFreeMap).
// Die Kacheln liegen als eigene Dateien im Artifact (map/i.txt + map/c<n>.txt, Base64, weil das Artifact nur Text- und Medientypen ausliefert): keine Abrufe bei Kartendiensten,
// GPS-Spuren verlassen die App nicht. Gezeichnet wird auf Canvas 2D, je Kachel einmal gerastert und zwischengespeichert.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const BASE = 'map/';
export const ATTRIBUTION = '© OpenStreetMap-Mitwirkende · OpenMapTiles · OpenFreeMap · Relief: Terrain Tiles (Copernicus EU-DEM, SRTM)';
const MINZ = 4, MAXDATA = 14, MAXZ = 18;

// ---------- Index & Laden ----------
let idx = null; // Map key -> [chunk, off, len]
let idxState = 'idle'; // idle | loading | ready | none
const chunkP = new Map();
const tiles = new Map(); // 'z/x/y' -> {state, groups, labels, extent} (LRU über Map-Reihenfolge)
const listeners = new Set();
let notifyT = 0;
const notify = () => { if (notifyT) return; notifyT = requestAnimationFrame(() => { notifyT = 0; for (const f of listeners) f(); }); };
export function onBaseChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const key = (z, x, y) => z + '/' + x + '/' + y;
function b64(txt) {
  const t = txt.replace(/\s+/g, '');
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(t).buffer;
  const bin = atob(t), n = bin.length, u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
const getBin = (name) => fetch(BASE + name + '.txt').then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(b64);
export function baseReady() {
  if (idxState === 'idle') loadIndex();
  return idxState === 'ready';
}
function loadIndex() {
  idxState = 'loading';
  if (typeof DecompressionStream === 'undefined') { idxState = 'none'; return; }
  getBin('i').then((buf) => {
    const dv = new DataView(buf);
    if (dv.getUint32(0) !== 0x484b4d31) throw new Error('Format');
    const n = dv.getUint32(4, true);
    const m = new Map();
    for (let i = 0, o = 8; i < n; i++, o += 16) m.set(key(dv.getUint8(o), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true)), [dv.getUint16(o + 6, true), dv.getUint32(o + 8, true), dv.getUint32(o + 12, true)]);
    idx = m; idxState = 'ready'; notify();
  }).catch(() => { idxState = 'none'; notify(); });
}
// Datenkachel für eine Anzeigekachel: gleiche oder nächstgröbere Zoomstufe
export function dataFor(z, x, y) {
  if (!idx) return null;
  for (let pz = Math.min(z, MAXDATA); pz >= MINZ; pz--) {
    const s = z - pz, px = x >> s, py = y >> s;
    if (idx.has(key(pz, px, py))) return [pz, px, py];
  }
  return null;
}
function chunk(c) {
  let p = chunkP.get(c);
  if (!p) { p = getBin('c' + c); p.catch(() => chunkP.delete(c)); chunkP.set(c, p); }
  return p;
}
async function gunzip(u8) {
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
export function getTile(z, x, y) {
  const k = key(z, x, y);
  let t = tiles.get(k);
  if (t) { tiles.delete(k); tiles.set(k, t); return t; }
  const e = idx && idx.get(k);
  if (!e) return null;
  t = { state: 'loading' };
  tiles.set(k, t);
  if (tiles.size > 260) { for (const [kk, tt] of tiles) { if (tiles.size <= 220) break; if (tt.state !== 'loading') tiles.delete(kk); } }
  chunk(e[0]).then((buf) => gunzip(new Uint8Array(buf, e[1], e[2]))).then((raw) => {
    Object.assign(t, parse(raw, z, x, y), { state: 'ready' });
    notify();
  }).catch(() => { t.state = 'error'; tiles.delete(k); });
  return t;
}

// ---------- Stil ----------
const PAL = {
  light: {
    land: '#F2F2EF', wood: '#DFE7D8', grass: '#E8EDE0', farm: '#ECEEE4', wet: '#E1EAE5', rock: '#E5E2DC', sand: '#EEE9DE', ice: '#F9FBFD', iceLine: '#D5E0E8',
    resid: '#E8E6E3', indus: '#E6E4E1', cem: '#E0E6DB',
    water: '#C6D9E6', river: '#B0C9DB', building: '#DCD9D4',
    casing: '#CFCCC7', road: '#FFFFFF', major: '#FFFFFF', majorCasing: '#BFBCB6', minor: '#FFFFFF', track: '#A39C91', rail: '#B3B0AB', lift: '#8F8B86', tunnel: '#E2E0DC',
    border: '#A29EA9',
    town: '#2B2B30', village: '#45454B', hamlet: '#6C6C72', peak: '#6A6359', waterTxt: '#4A7592', halo: 'rgba(242,242,239,.92)',
  },
  dark: {
    land: '#161618', wood: '#19201B', grass: '#1B1F19', farm: '#1B1D19', wet: '#172019', rock: '#201F1D', sand: '#211F1B', ice: '#24282C', iceLine: '#353B42',
    resid: '#1E1E21', indus: '#1F1F22', cem: '#1B211C',
    water: '#0D2231', river: '#163650', building: '#29292D',
    casing: '#0F0F11', road: '#3A3A40', major: '#4A4A51', majorCasing: '#0B0B0C', minor: '#323237', track: '#615B52', rail: '#3E3E44', lift: '#6E6A64', tunnel: '#2A2A2F',
    border: '#5D5A63',
    town: '#EDEDF0', village: '#C9C9CE', hamlet: '#96969D', peak: '#ABA295', waterTxt: '#7FA9C6', halo: 'rgba(22,22,24,.9)',
  },
};
export function isDark(el) {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
}
export const landColor = (dark) => PAL[dark ? 'dark' : 'light'].land;

// Flächen- und Linienklassen
const FILL = { wood: 'wood', forest: 'wood', grass: 'grass', farmland: 'farm', wetland: 'wet', rock: 'rock', sand: 'sand', ice: 'ice', glacier: 'ice' };
const LANDUSE = { residential: 'resid', suburb: 'resid', neighbourhood: 'resid', commercial: 'indus', industrial: 'indus', retail: 'indus', railway: 'indus', cemetery: 'cem', quarry: 'rock' };
const ROAD = { motorway: 'mw', trunk: 'mw', primary: 'pri', secondary: 'sec', tertiary: 'ter', minor: 'min', service: 'svc', track: 'trk', path: 'pth', raceway: 'min', busway: 'min', bus_guideway: 'min' };
// Linienbreite (CSS-px) nach Zoomstufe, lineare Stützstellen
const W = {
  mw: [[6, 0.8], [9, 1.4], [12, 3], [14, 5], [17, 12]],
  pri: [[7, 0.6], [9, 1], [12, 2.6], [14, 4.4], [17, 10]],
  sec: [[9, 0.6], [12, 2], [14, 3.6], [17, 8]],
  ter: [[10, 0.5], [12, 1.5], [14, 3], [17, 7]],
  min: [[12, 0.6], [14, 2], [17, 5]],
  svc: [[13, 0.5], [14, 1.2], [17, 3.4]],
  trk: [[12, 0.5], [14, 1], [17, 2]],
  pth: [[13, 0.5], [14, 0.8], [17, 1.6]],
  rail: [[10, 0.5], [14, 1], [17, 1.8]],
  lift: [[12, 0.5], [14, 0.9], [17, 1.4]],
  river: [[8, 0.6], [11, 1.2], [14, 2.6], [17, 5]],
  canal: [[11, 0.6], [14, 1.6], [17, 3]],
  stream: [[12, 0.4], [14, 1], [17, 2]],
  b2: [[4, 0.6], [10, 1], [14, 1.6]],
  b4: [[7, 0.4], [12, 0.8]],
};
const minZ = { min: 11.5, svc: 13, trk: 12, pth: 13, stream: 11.5, lift: 12, rail: 10, ter: 9.5, sec: 8, b4: 6 };
function width(cls, z) {
  const s = W[cls]; if (!s) return 1;
  if (z <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) if (z <= s[i][0]) { const [z0, w0] = s[i - 1], [z1, w1] = s[i]; return w0 + (w1 - w0) * (z - z0) / (z1 - z0); }
  return s[s.length - 1][1];
}

// ---------- Kachel auswerten ----------
function nameOf(p) { return p['name:de'] || p.name_de || p.name || ''; }
function parse(raw, z, x, y) {
  const vt = new VectorTile(new Pbf(raw));
  const groups = new Map(); // style -> Path2D
  let extent = 4096;
  const P = (k) => { let p = groups.get(k); if (!p) { p = new Path2D(); groups.set(k, p); } return p; };
  const add = (path, geom, close) => {
    for (const ring of geom) {
      if (!ring.length) continue;
      path.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i++) path.lineTo(ring[i].x, ring[i].y);
      if (close) path.closePath();
    }
  };
  const labels = [];
  const L = vt.layers;
  const each = (name, fn) => { const l = L[name]; if (!l) return; extent = l.extent || extent; for (let i = 0; i < l.length; i++) fn(l.feature(i)); };
  each('landcover', (f) => { const c = FILL[f.properties.class] || FILL[f.properties.subclass]; if (c && f.type === 3) add(P('f:' + c), f.loadGeometry(), true); });
  each('landuse', (f) => { const c = LANDUSE[f.properties.class]; if (c && f.type === 3) add(P('f:' + c), f.loadGeometry(), true); });
  each('water', (f) => { if (f.type === 3 && f.properties.brunnel !== 'tunnel') add(P('f:water'), f.loadGeometry(), true); });
  each('waterway', (f) => {
    if (f.type !== 2 || f.properties.brunnel === 'tunnel') return;
    const c = f.properties.class === 'river' ? 'river' : f.properties.class === 'canal' ? 'canal' : 'stream';
    add(P('w:' + c), f.loadGeometry(), false);
  });
  each('building', (f) => { if (f.type === 3) add(P('f:building'), f.loadGeometry(), true); });
  each('boundary', (f) => {
    const p = f.properties; if (p.maritime === 1 || p.maritime === true) return;
    const lv = +p.admin_level; const c = lv <= 2 ? 'b2' : lv <= 4 ? 'b4' : null;
    if (c && f.type === 2) add(P('b:' + c), f.loadGeometry(), false);
  });
  each('transportation', (f) => {
    if (f.type !== 2) return;
    const p = f.properties; let c = ROAD[p.class];
    if (p.class === 'rail' || p.class === 'transit') c = p.subclass === 'rail' || p.class === 'rail' ? 'rail' : null;
    else if (p.class === 'aerialway' || p.subclass === 'cable_car' || p.subclass === 'gondola' || p.subclass === 'chair_lift') c = 'lift';
    if (!c) return;
    const pre = p.brunnel === 'tunnel' ? 't:' : 'r:';
    add(P(pre + c), f.loadGeometry(), false);
  });
  const lab = (kind, f) => {
    const p = f.properties; const nm = nameOf(p); if (!nm || f.type !== 1) return;
    const g = f.loadGeometry(); const pt = g[0] && g[0][0]; if (!pt) return;
    if (pt.x < 0 || pt.y < 0 || pt.x > extent || pt.y > extent) return; // Puffer der Nachbarkachel
    const s = 2 ** z;
    labels.push({ kind, cls: p.class, rank: +p.rank || 0, name: nm, ele: p.ele != null ? Math.round(+p.ele) : null, wx: (x + pt.x / extent) / s, wy: (y + pt.y / extent) / s });
  };
  each('place', (f) => lab('place', f));
  each('mountain_peak', (f) => { if (f.properties.class !== 'saddle') lab('peak', f); });
  each('water_name', (f) => lab('water', f));
  return { groups, labels, extent };
}

// ---------- Rastern ----------
const rasters = new Map(); // LRU
const MAXR = 72;
export function rasterKey(dz, x, y, dark, R) { return dz + '/' + x + '/' + y + (dark ? 'd' : 'l') + R; }
export function getRaster(k) { const r = rasters.get(k); if (r) { rasters.delete(k); rasters.set(k, r); } return r; }
const queue = new Map();
let qBusy = false;
export function requestRaster(dz, x, y, dark, R) {
  const k = rasterKey(dz, x, y, dark, R);
  if (rasters.has(k)) return;
  queue.delete(k);
  queue.set(k, [dz, x, y, dark, R]);
  while (queue.size > 64) queue.delete(queue.keys().next().value);
  pump();
}
function pump() {
  if (qBusy) return;
  qBusy = true;
  requestAnimationFrame(() => {
    qBusy = false;
    const t0 = performance.now();
    let did = 0;
    for (const [k, a] of [...queue]) {
      if (performance.now() - t0 > 12 && did) break;
      const r = rasterize(...a);
      if (r === 'wait') continue;
      queue.delete(k);
      if (r) { rasters.set(k, r); did++; if (rasters.size > MAXR) rasters.delete(rasters.keys().next().value); }
    }
    if (did) notify();
    if (queue.size) { if (did) pump(); else setTimeout(pump, 120); }
  });
}

// ---------- Relief (Schummerung) ----------
// Graustufen-Atlanten rel/r<z>_<ax>_<ay>.jpg (4×4 Kacheln à 256 px, 128 = eben), berechnet aus AWS Terrain Tiles.
const RBASE = 'rel/', RMIN = 9, RMAX = 12;
let rIdx = null, rState = 'idle';
const rBits = new Map(); // key -> {state, bm}
const rOver = new Map(); // key+theme -> canvas (LRU)
const RK = { light: [0.44, 0.4], dark: [0.62, 0.13] };
// bei starker Vergrößerung zurücknehmen (Relief stammt aus Zoom 12)
const rAtt = (dz) => (dz <= 11 ? 1 : dz === 12 ? 0.88 : dz === 13 ? 0.7 : dz === 14 ? 0.55 : 0.45); // Stärke Schatten, Licht
function reliefIndex() {
  if (rState !== 'idle') return;
  rState = 'loading';
  fetch(RBASE + 'index.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
    const m = new Set();
    for (const [z, keys] of Object.entries(j.levels || {})) for (const [ax, ay] of keys) m.add(z + '_' + ax + '_' + ay);
    rIdx = m; rState = 'ready'; notify();
  }).catch(() => { rState = 'none'; notify(); });
}
function reliefOverlay(k, dark) {
  const ok = k + (dark ? 'd' : 'l');
  let cv = rOver.get(ok);
  if (cv) { rOver.delete(ok); rOver.set(ok, cv); return cv; }
  let b = rBits.get(k);
  if (!b) {
    b = { state: 'loading' }; rBits.set(k, b);
    fetch(RBASE + 'r' + k + '.jpg').then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then((bl) => createImageBitmap(bl)).then((bm) => { b.bm = bm; b.state = 'ready'; notify(); })
      .catch(() => { b.state = 'error'; notify(); });
  }
  if (b.state === 'loading') return 'wait';
  if (b.state !== 'ready') return null;
  const N = b.bm.width;
  cv = document.createElement('canvas'); cv.width = cv.height = N;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(b.bm, 0, 0);
  const img = cx.getImageData(0, 0, N, N), d = img.data;
  const [ks, kh] = RK[dark ? 'dark' : 'light'];
  for (let i = 0; i < d.length; i += 4) {
    const dv = d[i] - 128;
    if (dv > -3 && dv < 3) { d[i + 3] = 0; continue; }
    if (dv < 0) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = Math.min(255, (-dv / 128) * ks * 255); }
    else { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, (dv / 127) * kh * 255); }
  }
  cx.putImageData(img, 0, 0);
  rOver.set(ok, cv);
  if (rOver.size > 10) rOver.delete(rOver.keys().next().value);
  return cv;
}
// Relief für eine Anzeigekachel: null (keins), 'wait' (lädt) oder {cv, sx, sy, sw}
function reliefFor(dz, x, y, dark) {
  if (dz < RMIN) return null;
  reliefIndex();
  if (rState === 'loading' || rState === 'idle') return 'wait';
  if (rState !== 'ready') return null;
  const rz = Math.min(RMAX, dz), k = dz - rz;
  const px = x >> k, py = y >> k, ax = px >> 2, ay = py >> 2;
  const key = rz + '_' + ax + '_' + ay;
  if (!rIdx.has(key)) return null;
  const cv = reliefOverlay(key, dark);
  if (!cv || cv === 'wait') return cv;
  const f = 256 / 2 ** k;
  return { cv, sx: (px & 3) * 256 + (x - (px << k)) * f, sy: (py & 3) * 256 + (y - (py << k)) * f, sw: f };
}

const ORDER_FILL = ['wood', 'grass', 'farm', 'wet', 'rock', 'sand', 'ice', 'resid', 'indus', 'cem'];
function rasterize(dz, x, y, dark, R) {
  const d = dataFor(dz, x, y);
  if (!d) return null;
  const [pz, px, py] = d;
  const t = getTile(pz, px, py);
  if (!t) return null;
  if (t.state !== 'ready') return 'wait';
  const k = dz - pz, s2 = 2 ** k;
  const cv = document.createElement('canvas');
  cv.width = cv.height = R;
  const ctx = cv.getContext('2d');
  const c = PAL[dark ? 'dark' : 'light'];
  ctx.fillStyle = c.land; ctx.fillRect(0, 0, R, R);
  const sc = (R * s2) / t.extent; // Kachelkoordinate -> Rasterpixel
  const ox = -(x - (px << k)) * R, oy = -(y - (py << k)) * R;
  ctx.setTransform(sc, 0, 0, sc, ox, oy);
  const px1 = R / 256; // Rasterpixel je CSS-Pixel
  const lw = (css) => (css * px1) / sc;
  const G = t.groups;
  const fill = (g, col) => { const p = G.get(g); if (p) { ctx.fillStyle = col; ctx.fill(p); } };
  const line = (g, col, w, dash) => { const p = G.get(g); if (!p || w <= 0) return; ctx.strokeStyle = col; ctx.lineWidth = lw(w); ctx.setLineDash(dash ? dash.map(lw) : []); ctx.stroke(p); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const rl = reliefFor(dz, x, y, dark);
  if (rl === 'wait') return 'wait';
  for (const f of ORDER_FILL) fill('f:' + f, c[f]);
  if (rl) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.globalAlpha = rAtt(dz);
    ctx.drawImage(rl.cv, rl.sx, rl.sy, rl.sw, rl.sw, 0, 0, R, R);
    ctx.restore();
  }
  const ice = G.get('f:ice'); if (ice && dz >= 10) { ctx.strokeStyle = c.iceLine; ctx.lineWidth = lw(0.8); ctx.stroke(ice); }
  fill('f:water', c.water);
  if (dz >= 7) line('w:river', c.river, width('river', dz));
  if (dz >= 10) line('w:canal', c.river, width('canal', dz));
  if (dz >= minZ.stream) line('w:stream', c.river, width('stream', dz));
  if (dz >= 14) fill('f:building', c.building);
  if (dz >= minZ.b4) line('b:b4', c.border, width('b4', dz), [4, 3]);
  line('b:b2', c.border, width('b2', dz), [6, 3, 1.5, 3]);
  // Straßen: Tunnel, Wege, dann Hülle und Füllung von klein nach groß
  const z = dz;
  for (const r of ['ter', 'sec', 'pri', 'mw']) if (z >= (minZ[r] || 0)) line('t:' + r, c.tunnel, width(r, z) * 0.8, [3, 2]);
  if (z >= minZ.rail) line('r:rail', c.rail, width('rail', z), z >= 13 ? [5, 3] : null);
  if (z >= minZ.lift) line('r:lift', c.lift, width('lift', z), [1, 3]);
  if (z >= minZ.trk) line('r:trk', c.track, width('trk', z), [4, 2.5]);
  if (z >= minZ.pth) line('r:pth', c.track, width('pth', z), [2, 2]);
  const roads = ['svc', 'min', 'ter', 'sec', 'pri', 'mw'].filter((r) => z >= (minZ[r] || 0));
  const casing = z >= 11;
  if (casing) for (const r of roads) { const w = width(r, z); line('r:' + r, r === 'mw' || r === 'pri' ? c.majorCasing : c.casing, w + (w > 2 ? 1.6 : 1)); }
  for (const r of roads) line('r:' + r, r === 'mw' || r === 'pri' ? c.major : r === 'min' || r === 'svc' ? c.minor : c.road, width(r, z));
  return cv;
}

// ---------- Beschriftung ----------
const PLACE_MIN = { city: 5, town: 8, village: 10.5, suburb: 12.5, hamlet: 12.5, isolated_dwelling: 14.6, locality: 14.6, farm: 14.6, neighbourhood: 14.6 };
const PLACE_PRIO = { city: 0, town: 1, village: 3, suburb: 5, hamlet: 6, isolated_dwelling: 8, locality: 8, farm: 8, neighbourhood: 8 };
export function collectLabels(dataKeys, z) {
  const out = [];
  const seen = new Set();
  for (const k of dataKeys) {
    const t = tiles.get(k); if (!t || t.state !== 'ready') continue;
    for (const l of t.labels) {
      let prio;
      if (l.kind === 'place') { const m = PLACE_MIN[l.cls]; if (m == null || z < m) continue; prio = PLACE_PRIO[l.cls] + (l.rank || 0) * 0.01; }
      else if (l.kind === 'peak') { if (z < 11 || (z < 12.5 && l.rank > 2) || (z < 13.5 && l.rank > 6)) continue; prio = 4 + (l.rank || 0) * 0.05; }
      else { if (z < 10) continue; prio = 2.5; }
      const s = l.name + '|' + Math.round(l.wx * 2e5) + '|' + Math.round(l.wy * 2e5);
      if (seen.has(s)) continue; seen.add(s);
      out.push({ ...l, prio });
    }
  }
  return out.sort((a, b) => a.prio - b.prio);
}
const wcache = new Map();
function tw(ctx, font, s) { const k = font + s; let w = wcache.get(k); if (w == null) { w = ctx.measureText(s).width; if (wcache.size > 4000) wcache.clear(); wcache.set(k, w); } return w; }
export function drawLabels(ctx, labels, toScreen, W, H, dark, z, family, avoid) {
  const c = PAL[dark ? 'dark' : 'light'];
  const placed = [];
  const hit = (r) => placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let n = 0;
  for (const l of labels) {
    if (n > 60) break;
    const [sx, sy] = toScreen(l.wx, l.wy);
    if (sx < -60 || sy < -20 || sx > W + 60 || sy > H + 20) continue;
    let font, col, dy = 0, sub = null;
    if (l.kind === 'place') {
      const big = l.cls === 'city' || (l.cls === 'town' && z < 11);
      font = (big ? '600 ' + (l.cls === 'city' ? 13.5 : 12.5) : l.cls === 'town' ? '600 12.5' : l.cls === 'village' ? '500 11.5' : '500 10.5') + 'px ' + family;
      col = l.cls === 'city' || l.cls === 'town' ? c.town : l.cls === 'village' ? c.village : c.hamlet;
    } else if (l.kind === 'peak') {
      font = '500 10.5px ' + family; col = c.peak; dy = -9;
      if (l.ele && l.ele > 300 && z >= 12) sub = l.ele.toLocaleString('de-DE') + ' m';
    } else { font = '500 11px ' + family; col = c.waterTxt; }
    ctx.font = font;
    const w = tw(ctx, font, l.name);
    const fh = l.kind === 'place' && (l.cls === 'city' || l.cls === 'town') ? 14 : 12;
    const top = sy + dy - fh / 2 - 2, bot = sy + dy + fh / 2 + (sub ? 11 : 0) + 2;
    const rect = [sx - w / 2 - 3, top, sx + w / 2 + 3, bot];
    if (rect[0] < 2 || rect[2] > W - 2 || rect[1] < 1 || rect[3] > H - 1) continue;
    if (hit(rect) || (avoid && avoid(rect))) continue;
    placed.push(rect); n++;
    if (l.kind === 'peak') {
      ctx.beginPath(); ctx.moveTo(sx, sy - 3.4); ctx.lineTo(sx + 3.6, sy + 2.8); ctx.lineTo(sx - 3.6, sy + 2.8); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    }
    ctx.strokeStyle = c.halo; ctx.lineWidth = 3;
    ctx.strokeText(l.name, sx, sy + dy); ctx.fillStyle = col; ctx.fillText(l.name, sx, sy + dy);
    if (sub) { ctx.font = '500 9.5px ' + family; ctx.strokeText(sub, sx, sy + dy + 11); ctx.fillText(sub, sx, sy + dy + 11); }
  }
}

// ---------- Zeichnen einer Ansicht ----------
// view: {x,y,z} in Weltkoordinaten (0..1), Kachelgröße 256 CSS-px. Gibt zurück, ob die Grundkarte die Ansicht abdeckt.
export function drawBase(ctx, view, W, H, dpr, opts = {}) {
  if (!baseReady()) return false;
  const dark = opts.dark;
  const dz = Math.max(MINZ, Math.min(MAXZ, Math.round(view.z)));
  const n = 2 ** dz;
  const scale = 256 * 2 ** view.z; // CSS-px je Welteinheit
  const tx0 = Math.floor((view.x - W / 2 / scale) * n), tx1 = Math.floor((view.x + W / 2 / scale) * n);
  const ty0 = Math.max(0, Math.floor((view.y - H / 2 / scale) * n)), ty1 = Math.min(n - 1, Math.floor((view.y + H / 2 / scale) * n));
  const R = Math.min(512, Math.round(256 * Math.min(2, dpr) * (opts.lowRes ? 0.75 : 1)));
  const tsz = scale / n; // CSS-px je Anzeigekachel
  const dataKeys = new Map();
  let covered = 0, total = 0;
  ctx.imageSmoothingEnabled = true;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    total++;
    const x = ((tx % n) + n) % n;
    const d = dataFor(dz, x, ty);
    if (!d) continue;
    covered++;
    dataKeys.set(key(...d), d);
    const sx = (tx / n - view.x) * scale + W / 2, sy = (ty / n - view.y) * scale + H / 2;
    const rk = rasterKey(dz, x, ty, dark, R);
    const r = getRaster(rk);
    if (r) { ctx.drawImage(r, sx, sy, tsz + 0.5, tsz + 0.5); continue; }
    requestRaster(dz, x, ty, dark, R);
    // Ersatz: gröbere Kachel aus dem Zwischenspeicher vergrößern
    for (let a = dz - 1; a >= Math.max(MINZ, dz - 6); a--) {
      const s = dz - a, ax = x >> s, ay = ty >> s;
      const pr = getRaster(rasterKey(a, ax, ay, dark, R));
      if (!pr) continue;
      const f = R / 2 ** s;
      ctx.drawImage(pr, (x - (ax << s)) * f, (ty - (ay << s)) * f, f, f, sx, sy, tsz + 0.5, tsz + 0.5);
      break;
    }
  }
  if (opts.labels !== false && covered) {
    for (const d of dataKeys.values()) getTile(...d);
    const labs = collectLabels(dataKeys.keys(), view.z);
    drawLabels(ctx, labs, (wx, wy) => [(wx - view.x) * scale + W / 2, (wy - view.y) * scale + H / 2], W, H, dark, view.z, opts.family || 'Geist, ui-sans-serif, system-ui, sans-serif', opts.avoid);
  }
  return total > 0 && covered / total > 0.5;
}

// Gipfel aus den Offline-Kartendaten im Umkreis eines Punkts (Meter); nächster zuerst. Ohne Kartendaten: []
export function peaksNear(lat, lng, radius = 150, timeout = 6000) {
  const wx = (lng + 180) / 360;
  const s0 = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  const wy = 0.5 - Math.log((1 + s0) / (1 - s0)) / (4 * Math.PI);
  const mPerUnit = 40075016.686 * Math.cos((lat * Math.PI) / 180);
  return new Promise((resolve) => {
    let off = null, tm = null, done = false;
    const end = (v) => { if (done) return; done = true; if (off) off(); clearTimeout(tm); resolve(v); };
    const look = () => {
      if (!baseReady()) return idxState === 'none' ? end([]) : null;
      const z = MAXDATA, n = 2 ** z;
      const keys = new Set();
      // Nachbarkacheln mitnehmen, falls der Punkt am Rand liegt
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        const tx = Math.floor(wx * n) + dx, ty = Math.floor(wy * n) + dy;
        const dk = dataFor(z, tx, ty); if (dk) keys.add(dk.join('/'));
      }
      if (!keys.size) return end([]);
      const out = [];
      for (const k of keys) {
        const [pz, px, py] = k.split('/').map(Number);
        const t = getTile(pz, px, py);
        if (!t) continue;
        if (t.state === 'loading') return null;
        for (const l of t.labels || []) {
          if (l.kind !== 'peak') continue;
          const dist = Math.hypot(l.wx - wx, l.wy - wy) * mPerUnit;
          if (dist <= radius) out.push({ name: l.name, ele: l.ele, dist: Math.round(dist) });
        }
      }
      const seen = new Set();
      end(out.sort((a, b) => a.dist - b.dist).filter((p) => (seen.has(p.name) ? false : seen.add(p.name))));
    };
    off = onBaseChange(look);
    tm = setTimeout(() => end([]), timeout);
    look();
  });
}
