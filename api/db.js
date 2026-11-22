// GET: ganze Datenbank (gzip, mit ETag; 304 wenn unverändert). POST: Änderungen als Stapel.
import { guarded, json, readJson, fail } from '../lib/http.js';
import { readRaw, write } from '../lib/db.js';

export const GET = guarded(async (req) => {
  const inm = req.headers.get('if-none-match') || undefined;
  const r = await readRaw(inm);
  if (!r) return json({ v: 1, rev: 0, at: 0, colls: {} }, 200, { etag: '"empty"' });
  if (r.notModified) return new Response(null, { status: 304, headers: { etag: r.etag, 'cache-control': 'no-store' } });
  return new Response(r.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip', etag: r.etag, 'cache-control': 'no-store' } });
});

export const POST = guarded(async (req) => {
  const b = await readJson(req);
  if (!Array.isArray(b.ops) || !b.ops.length) return fail('bad_request', 'ops fehlt');
  if (b.ops.length > 5000) return fail('too_many', 'Zu viele Änderungen auf einmal');
  const r = await write(b.ops);
  return json({ ok: true, etag: r.etag, prev: r.prev, rev: r.rev, size: r.size });
});
