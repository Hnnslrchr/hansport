// Packt die geladenen OpenStreetMap-Vektorkacheln (OpenFreeMap / OpenMapTiles-Schema) für hansport:
// unnötige Attribute und Ebenen entfernen, gzip je Kachel, räumlich sortiert in Teildateien ≤ ~1,5 MB.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { gunzipSync, gzipSync } from 'zlib';

const [inFile, outDir] = process.argv.slice(2);
const buf = readFileSync(inFile);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
if (dv.getUint32(0) !== 0x484b5431) throw new Error('magic');
const n = dv.getUint32(4, true);
let o = 8, d = 8 + n * 13;
const tiles = [];
for (let i = 0; i < n; i++) { const z = dv.getUint8(o), x = dv.getUint32(o + 1, true), y = dv.getUint32(o + 5, true), len = dv.getUint32(o + 9, true); o += 13; tiles.push({ z, x, y, gz: buf.subarray(d, d + len) }); d += len; }

// --- Protobuf-Helfer ---
function rd(b) {
  let i = 0;
  const varint = () => { let v = 0, s = 0, c; do { c = b[i++]; v += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return v; };
  return {
    get pos() { return i; }, set pos(v) { i = v; }, end: () => i >= b.length, varint,
    field() { const t = varint(); return [t >>> 3, t & 7]; },
    bytes() { const l = varint(); const r = b.subarray(i, i + l); i += l; return r; },
    skip(w) { if (w === 0) varint(); else if (w === 2) { const l = varint(); i += l; } else if (w === 5) i += 4; else if (w === 1) i += 8; else throw new Error('wire ' + w); },
  };
}
function wr() {
  const parts = []; let cur = [];
  const flush = () => { if (cur.length) { parts.push(Uint8Array.from(cur)); cur = []; } };
  const api = {
    varint(v) { while (v >= 0x80) { cur.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); } cur.push(v); },
    tag(f, w) { api.varint(f * 8 + w); },
    bytes(f, u8) { api.tag(f, 2); api.varint(u8.length); flush(); parts.push(u8); },
    packed(f, arr) { const w2 = wr(); for (const v of arr) w2.varint(v); api.bytes(f, w2.done()); },
    done() { flush(); let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; },
  };
  return api;
}
const td = new TextDecoder(), te = new TextEncoder();

const NAMES = ['name', 'name:de', 'name_de'];
const KEEP = {
  water: ['class', 'intermittent', 'brunnel'],
  waterway: ['class', 'intermittent', 'brunnel', ...NAMES],
  landcover: ['class', 'subclass'],
  landuse: ['class'],
  transportation: ['class', 'subclass', 'brunnel', 'ramp', 'layer'],
  building: [],
  boundary: ['admin_level', 'maritime', 'disputed'],
  place: ['class', 'rank', 'capital', ...NAMES],
  mountain_peak: ['class', 'ele', 'rank', ...NAMES],
  water_name: ['class', ...NAMES],
};

function valStr(vb) { const r = rd(vb); while (!r.end()) { const [f, w] = r.field(); if (f === 1) return td.decode(r.bytes()); r.skip(w); } return null; }
// Welche Objekte je Zoomstufe gebraucht werden (Ortsnamen und Gipfel sonst sehr zahlreich)
function keepFeature(layer, cls, z) {
  if (layer === 'place') {
    if (cls === 'isolated_dwelling' || cls === 'farm' || cls === 'locality' || cls === 'neighbourhood' || cls === 'quarter' || cls === 'plot' || cls === 'city_block') return z >= 14;
    if (cls === 'hamlet') return z >= 12;
    if (cls === 'suburb') return z >= 12;
    if (cls === 'village') return z >= 9;
    if (cls === 'town') return z >= 7;
    return true;
  }
  if (layer === 'mountain_peak') { if (cls === 'saddle') return z >= 13; return true; }
  return true;
}
function packLayer(lb, z) {
  const r = rd(lb);
  let name = '', extent = 4096, version = 2;
  const feats = [], keys = [], vals = [];
  while (!r.end()) {
    const [f, w] = r.field();
    if (f === 1) name = td.decode(r.bytes());
    else if (f === 2) feats.push(r.bytes());
    else if (f === 3) keys.push(td.decode(r.bytes()));
    else if (f === 4) vals.push(r.bytes());
    else if (f === 5) extent = r.varint();
    else if (f === 15) version = r.varint();
    else r.skip(w);
  }
  const keep = KEEP[name];
  if (!keep) return null;
  if (name === 'landcover' && z <= 7) return null;
  if (name === 'building' && z < 14) return null;
  const kMap = new Map(), vMap = new Map(), nk = [], nv = [];
  const out = wr();
  out.tag(15, 0); out.varint(version);
  out.bytes(1, te.encode(name));
  for (const fb of feats) {
    const fr = rd(fb);
    let id = null, type = 0, geom = null, tags = [];
    while (!fr.end()) {
      const [f, w] = fr.field();
      if (f === 1) id = fr.varint();
      else if (f === 2) { const pb = fr.bytes(); const pr = rd(pb); while (!pr.end()) tags.push(pr.varint()); }
      else if (f === 3) type = fr.varint();
      else if (f === 4) geom = fr.bytes();
      else fr.skip(w);
    }
    const props = {};
    for (let i = 0; i < tags.length; i += 2) { const k = keys[tags[i]]; if (k === 'class') props.class = valStr(vals[tags[i + 1]]); }
    if (!keepFeature(name, props.class, z)) continue;
    const nt = [];
    for (let i = 0; i < tags.length; i += 2) {
      const k = keys[tags[i]];
      if (!keep.includes(k)) continue;
      if (!kMap.has(k)) { kMap.set(k, nk.length); nk.push(k); }
      const vi = tags[i + 1];
      if (!vMap.has(vi)) { vMap.set(vi, nv.length); nv.push(vals[vi]); }
      nt.push(kMap.get(k), vMap.get(vi));
    }
    const fw = wr();
    if (id != null && name === 'place') { fw.tag(1, 0); fw.varint(id); }
    if (nt.length) fw.packed(2, nt);
    fw.tag(3, 0); fw.varint(type);
    if (geom) fw.bytes(4, geom);
    out.bytes(2, fw.done());
  }
  for (const k of nk) out.bytes(3, te.encode(k));
  for (const v of nv) out.bytes(4, v);
  out.tag(5, 0); out.varint(extent);
  return out.done();
}

function packTile(raw, z) {
  const r = rd(raw);
  const out = wr();
  while (!r.end()) {
    const [f, w] = r.field();
    if (f === 3) { const l = packLayer(r.bytes(), z); if (l) out.bytes(3, l); }
    else r.skip(w);
  }
  return out.done();
}

const morton = (x, y) => { let m = 0; for (let b = 0; b < 16; b++) m += (((x >> b) & 1) * 2 ** (2 * b)) + (((y >> b) & 1) * 2 ** (2 * b + 1)); return m; };
let rawIn = 0, rawOut = 0;
const packed = tiles.map((t) => {
  const raw = gunzipSync(t.gz); rawIn += raw.length;
  const p = packTile(raw, t.z); rawOut += p.length;
  return { ...t, data: gzipSync(p, { level: 9 }) };
}).filter((t) => t.data.length > 20);
packed.sort((a, b) => a.z - b.z || morton(a.x, a.y) - morton(b.x, b.y));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const LIMIT = 1.5 * 1048576;
const chunks = [[]]; let size = 0, lastZ = -1;
for (const t of packed) {
  if ((size + t.data.length > LIMIT && chunks[chunks.length - 1].length) || (t.z !== lastZ && t.z >= 12 && size > 0)) { chunks.push([]); size = 0; }
  chunks[chunks.length - 1].push(t); size += t.data.length; lastZ = t.z;
}
const idx = new DataView(new ArrayBuffer(8 + packed.length * 16));
idx.setUint32(0, 0x484b4d31); idx.setUint32(4, packed.length, true);
let io = 8, total = 0;
chunks.forEach((c, ci) => {
  let off = 0; const parts = [];
  for (const t of c) {
    idx.setUint8(io, t.z); idx.setUint16(io + 2, t.x, true); idx.setUint16(io + 4, t.y, true); idx.setUint16(io + 6, ci, true);
    idx.setUint32(io + 8, off, true); idx.setUint32(io + 12, t.data.length, true); io += 16;
    parts.push(t.data); off += t.data.length;
  }
  const b = Buffer.concat(parts); total += b.length;
  writeFileSync(`${outDir}/c${ci}.bin`, b);
});
writeFileSync(`${outDir}/i.bin`, Buffer.from(idx.buffer));
const byZ = {};
for (const t of packed) { byZ[t.z] = (byZ[t.z] || 0) + t.data.length; }
console.log('tiles', packed.length, 'chunks', chunks.length, 'total MB', (total / 1048576).toFixed(1), 'raw in/out MB', (rawIn / 1048576).toFixed(1), (rawOut / 1048576).toFixed(1));
console.log(Object.entries(byZ).map(([z, b]) => 'z' + z + ' ' + (b / 1048576).toFixed(2)).join(', '));
