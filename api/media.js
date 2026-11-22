// Private Fotos: POST (roher Inhalt, max. 4 MB) → speichern; GET ?id= → ausliefern; POST ?a=del&id= → löschen
import { guarded, json, fail } from '../lib/http.js';
import { getObj, putObj, delObj } from '../lib/blob.js';

const ID = /^[a-z0-9]{8,40}$/;
const TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'];

export const GET = guarded(async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!ID.test(id)) return fail('bad_id', 'Ungültige ID');
  const r = await getObj('media/' + id, { fresh: false, ifNoneMatch: req.headers.get('if-none-match') || undefined });
  if (!r) return fail('not_found', 'Nicht gefunden', 404);
  if (r.notModified) return new Response(null, { status: 304, headers: { etag: r.etag } });
  return new Response(r.body, { headers: { 'content-type': r.contentType || 'application/octet-stream', etag: r.etag, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
});

export const POST = guarded(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get('a') === 'del') {
    const id = u.searchParams.get('id') || '';
    if (!ID.test(id)) return fail('bad_id', 'Ungültige ID');
    await delObj('media/' + id);
    return json({ ok: true });
  }
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.includes(type)) return fail('bad_type', 'Dateityp nicht unterstützt');
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > 4_400_000) return fail('too_large', 'Datei zu groß (max. 4 MB)', 413);
  const id = Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await putObj('media/' + id, buf, { contentType: type, create: true });
  return json({ id, contentType: type });
});
