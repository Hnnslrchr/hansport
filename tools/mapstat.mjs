import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
const buf = readFileSync(process.argv[2]);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
if (dv.getUint32(0) !== 0x484b5431) throw new Error('magic');
const n = dv.getUint32(4, true);
let o = 8, d = 8 + n * 13;
const tiles = [];
for (let i = 0; i < n; i++) { const z = dv.getUint8(o), x = dv.getUint32(o + 1, true), y = dv.getUint32(o + 5, true), len = dv.getUint32(o + 9, true); o += 13; tiles.push({ z, x, y, gz: buf.subarray(d, d + len) }); d += len; }
const varint = (b, p) => { let v = 0, s = 0, c; do { c = b[p.i++]; v += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return v; };
export function layers(b) { const p = { i: 0 }, res = []; while (p.i < b.length) { const st = p.i; const tag = varint(b, p); const len = varint(b, p); const s = p.i; p.i += len; let name = ''; const q = { i: s }; while (q.i < s + len) { const t = varint(b, q); const w = t & 7; if ((t >>> 3) === 1 && w === 2) { const l = varint(b, q); name = Buffer.from(b.subarray(q.i, q.i + l)).toString(); break; } if (w === 0) varint(b, q); else if (w === 2) { const l = varint(b, q); q.i += l; } else if (w === 5) q.i += 4; else q.i += 8; } res.push({ name, start: st, end: p.i }); } return res; }
const stat = {};
for (const t of tiles) { const raw = gunzipSync(t.gz); for (const l of layers(raw)) { const k = 'z' + t.z; stat[k] = stat[k] || {}; stat[k][l.name] = (stat[k][l.name] || 0) + (l.end - l.start); } }
for (const [z, s] of Object.entries(stat)) console.log(z, Object.entries(s).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + (v / 1048576).toFixed(2)).join(', '));
