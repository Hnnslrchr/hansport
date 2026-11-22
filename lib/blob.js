// Privater Speicher: Vercel Blob (access: private). Lokal zum Testen ein Ordner (HANSPORT_LOCAL_DATA).
import { createHash } from 'node:crypto';
import { AppError } from './http.js';

const LOCAL = process.env.HANSPORT_LOCAL_DATA || null;
let blobMod = null;
const blob = async () => (blobMod ||= await import('@vercel/blob'));
const fsMod = async () => ({ fs: await import('node:fs/promises'), path: await import('node:path') });

const etagOf = (buf) => '"' + createHash('sha1').update(buf).digest('hex') + '"';

// Lesen. fresh: am Cache vorbei (immer der neueste Stand).
export async function getObj(pathname, { ifNoneMatch, fresh = true } = {}) {
  if (LOCAL) {
    const { fs, path } = await fsMod();
    try {
      const buf = await fs.readFile(path.join(LOCAL, pathname));
      const etag = etagOf(buf);
      if (ifNoneMatch && ifNoneMatch === etag) return { etag, notModified: true };
      return { etag, body: buf };
    } catch (e) { return null; }
  }
  const { get } = await blob();
  const r = await get(pathname, { access: 'private', useCache: !fresh, ifNoneMatch: ifNoneMatch || undefined });
  if (!r) return null;
  if (r.statusCode === 304) return { etag: r.blob.etag, notModified: true };
  const body = Buffer.from(await new Response(r.stream).arrayBuffer());
  return { etag: r.blob.etag, body, contentType: r.blob.contentType || null };
}

// Schreiben. ifMatch: nur, wenn sich der Stand seit dem Lesen nicht geändert hat.
// create: nur anlegen, wenn noch nichts existiert.
export async function putObj(pathname, body, { ifMatch, create = false, contentType = 'application/octet-stream' } = {}) {
  if (LOCAL) {
    const { fs, path } = await fsMod();
    const p = path.join(LOCAL, pathname);
    await fs.mkdir(path.dirname(p), { recursive: true });
    let cur = null;
    try { cur = await fs.readFile(p); } catch (e) { /* neu */ }
    if (create && cur) throw new AppError('conflict', 'Existiert bereits', 409);
    if (ifMatch && (!cur || etagOf(cur) !== ifMatch)) throw new AppError('conflict', 'Stand hat sich geändert', 409);
    await fs.writeFile(p, body);
    return { etag: etagOf(body) };
  }
  const { put, BlobPreconditionFailedError } = await blob();
  try {
    const r = await put(pathname, body, {
      access: 'private', contentType, addRandomSuffix: false, cacheControlMaxAge: 60,
      ...(ifMatch ? { ifMatch } : create ? { allowOverwrite: false } : { allowOverwrite: true }),
    });
    return { etag: r.etag || null };
  } catch (e) {
    if ((BlobPreconditionFailedError && e instanceof BlobPreconditionFailedError) || /precondition|already exists/i.test(String(e && e.message))) throw new AppError('conflict', 'Stand hat sich geändert', 409);
    throw e;
  }
}

export async function delObj(pathname) {
  if (LOCAL) {
    const { fs, path } = await fsMod();
    try { await fs.unlink(path.join(LOCAL, pathname)); } catch (e) { /* weg */ }
    return;
  }
  const { del } = await blob();
  try { await del(pathname); } catch (e) { /* weg */ }
}

// JSON bequem lesen/schreiben (für kleine Systemdateien)
export async function getJson(pathname) {
  const r = await getObj(pathname);
  if (!r || !r.body) return null;
  try { return JSON.parse(r.body.toString('utf8')); } catch (e) { return null; }
}
export async function putJson(pathname, data) {
  return putObj(pathname, Buffer.from(JSON.stringify(data)), { contentType: 'application/json' });
}
