// Die App-Datenbank liegt als EINE gzip-komprimierte JSON-Datei im privaten Speicher.
// Das spart Speicher-Operationen (Hobby-Kontingent) und hält alles konsistent:
// Lesen = 1 Operation, Schreiben = 1 Lesen + 1 Schreiben, mit ETag gegen verlorene Änderungen.
import { gzipSync, gunzipSync } from 'node:zlib';
import { getObj, putObj } from './blob.js';
import { AppError } from './http.js';

export const DB_PATH = 'db/hansport.json.gz';
const ID_RE = /^[A-Za-z0-9_.:@-]{1,120}$/;
const COLL_RE = /^[a-z][a-z0-9_-]{0,30}$/;

export const emptyDb = () => ({ v: 1, rev: 0, at: 0, colls: {} });

export async function readRaw(ifNoneMatch) {
  return getObj(DB_PATH, { ifNoneMatch, fresh: true });
}

export function decode(body) {
  const o = JSON.parse(gunzipSync(body).toString('utf8'));
  if (!o || typeof o !== 'object' || !o.colls) throw new Error('Datenbank beschädigt');
  return o;
}
export const encode = (o) => gzipSync(Buffer.from(JSON.stringify(o)), { level: 6 });

// ops: [{ path: 'coll/id', op: 'set' | 'del', data }]
export function applyOps(dbo, ops) {
  let n = 0;
  for (const o of ops) {
    const [c, id, extra] = String(o.path || '').split('/');
    if (extra !== undefined || !COLL_RE.test(c || '') || !ID_RE.test(id || '')) throw new AppError('bad_path', 'Ungültiger Pfad: ' + String(o.path).slice(0, 60), 400);
    if (o.op === 'del') { if (dbo.colls[c]) { delete dbo.colls[c][id]; n++; } continue; }
    if (o.op !== 'set' || o.data === undefined || o.data === null || typeof o.data !== 'object') throw new AppError('bad_op', 'Ungültige Operation', 400);
    (dbo.colls[c] ||= {})[id] = o.data;
    n++;
  }
  return n;
}

export async function write(ops) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await readRaw();
    const dbo = cur && cur.body ? decode(cur.body) : emptyDb();
    const prevEtag = cur ? cur.etag : null;
    applyOps(dbo, ops);
    dbo.rev = (dbo.rev || 0) + 1;
    dbo.at = Date.now();
    const body = encode(dbo);
    if (body.length > 40_000_000) throw new AppError('too_large', 'Datenbank zu groß', 507);
    try {
      const r = await putObj(DB_PATH, body, prevEtag ? { ifMatch: prevEtag, contentType: 'application/gzip' } : { create: true, contentType: 'application/gzip' });
      return { etag: r.etag, prev: prevEtag, rev: dbo.rev, size: body.length };
    } catch (e) {
      if (e && e.code === 'conflict') { await new Promise((r) => setTimeout(r, 150 + Math.random() * 400 * (attempt + 1))); continue; }
      throw e;
    }
  }
  throw new AppError('busy', 'Speicher ist gerade beschäftigt, bitte erneut versuchen', 503);
}
