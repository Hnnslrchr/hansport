import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
const dir = process.argv[2];
const ib = readFileSync(dir + '/i.bin'); const dv = new DataView(ib.buffer, ib.byteOffset, ib.byteLength);
const n = dv.getUint32(4, true); const chunks = {};
const stat = {}; const feat = {};
for (let i = 0; i < n; i++) {
  const o = 8 + i * 16; const z = dv.getUint8(o), c = dv.getUint16(o + 6, true), off = dv.getUint32(o + 8, true), len = dv.getUint32(o + 12, true);
  const cb = chunks[c] || (chunks[c] = readFileSync(`${dir}/c${c}.bin`));
  const raw = gunzipSync(cb.subarray(off, off + len));
  const vt = new VectorTile(new Pbf(raw));
  for (const [name, l] of Object.entries(vt.layers)) { const k = 'z' + z; stat[k] = stat[k] || {}; stat[k][name] = (stat[k][name] || 0) + l.length; }
}
for (const [z, s] of Object.entries(stat)) console.log(z, JSON.stringify(s));
