// Lokaler Testserver: public/ + api/*.js + middleware.js, wie auf Vercel (Web-Request/Response).
// Start: APP_PASSWORD=… HANSPORT_LOCAL_DATA=/tmp/hsdata node tools/dev-server.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve('.');
const PORT = +process.argv[2] || 8787;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.jpg': 'image/jpeg' };
const mw = (await import(pathToFileURL(path.join(ROOT, 'middleware.js')))).default;
const mwRe = /^\/((?!api\/|login\.html|login\.css|icons\/|manifest\.webmanifest|favicon\.ico|robots\.txt).*)$/;

async function toWeb(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request('http://localhost:' + PORT + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, duplex: 'half' });
}
async function send(res, r) {
  const h = {};
  r.headers.forEach((v, k) => { h[k] = k === 'set-cookie' ? r.headers.getSetCookie() : v; });
  res.writeHead(r.status, h);
  if (r.body) { const reader = r.body.getReader(); for (;;) { const { value, done } = await reader.read(); if (done) break; res.write(Buffer.from(value)); } }
  res.end();
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const wreq = await toWeb(req);
    if (mwRe.test(u.pathname)) { const r = await mw(wreq); if (r) return send(res, r); }
    if (u.pathname.startsWith('/api/')) {
      const name = u.pathname.slice(5).replace(/[^a-z-]/g, '');
      const mod = await import(pathToFileURL(path.join(ROOT, 'api', name + '.js')));
      const fn = mod[req.method];
      if (!fn) { res.writeHead(405); return res.end(); }
      return send(res, await fn(wreq));
    }
    let p = path.join(ROOT, 'public', decodeURIComponent(u.pathname));
    if (u.pathname === '/') p = path.join(ROOT, 'public', 'index.html');
    if (!p.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
    const st = await stat(p).catch(() => null);
    if (!st || st.isDirectory()) { res.writeHead(404); return res.end('nicht gefunden'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e.message || e)); }
}).listen(PORT, () => console.log('hansport dev http://localhost:' + PORT));
