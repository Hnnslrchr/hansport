// Eigenständige Web-App (Vercel): gleiche Oberfläche, aber Garmin/Withings direkt, eigener Speicher, Login.
// Ausgabe: public/ (statisch) – die Serverfunktionen liegen in api/, die Zugangsprüfung in middleware.js.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';

const prod = !process.argv.includes('--dev');
const SRC = path.resolve('src');
const WEBDIR = path.join(SRC, 'web');
// Module der Claude-Version durch die Web-Varianten ersetzen (nicht innerhalb von src/web selbst)
const swap = {
  name: 'web-swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)(platform|strava|health)\.js$/ }, (args) => {
      if (args.importer.startsWith(WEBDIR)) return null;
      const target = path.resolve(args.resolveDir, args.path);
      const map = { [path.join(SRC, 'platform.js')]: 'platform.js', [path.join(SRC, 'strava.js')]: 'acts.js', [path.join(SRC, 'health.js')]: 'health.js' };
      return map[target] ? { path: path.join(WEBDIR, map[target]) } : null;
    });
  },
};

const r = await esbuild.build({
  entryPoints: ['src/main.jsx'], bundle: true, write: false, format: 'iife', target: ['safari15', 'chrome100'],
  jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment', minify: prod, legalComments: 'none',
  loader: { '.css': 'css', '.woff2': 'dataurl' }, outdir: 'out', plugins: [swap],
  define: { 'process.env.NODE_ENV': '"production"', __WEB__: 'true' },
});
let js = '', css = '';
for (const f of r.outputFiles) { if (f.path.endsWith('.js')) js = f.text; else if (f.path.endsWith('.css')) css = f.text; }

const OUT = 'public';
mkdirSync(OUT + '/icons', { recursive: true });
const LOGO = '/home/claude/logopkg/hansport-logo-paket';
const logoDir = existsSync(LOGO) ? LOGO : 'assets/logo';
for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'favicon-32.png']) cpSync(path.join(logoDir, 'png', f), path.join(OUT, 'icons', f));
cpSync(path.join(logoDir, 'svg', 'favicon.svg'), path.join(OUT, 'icons', 'favicon.svg'));
cpSync(path.join(logoDir, 'favicon.ico'), path.join(OUT, 'favicon.ico'));
const logoSvg = readFileSync(path.join(logoDir, 'svg', 'hansport-icon.svg'), 'utf8').replace(/<\?xml[^>]*>/, '').trim();

// Kartendaten (offline): nur kopieren, wenn sich etwas geändert hat
const copyDir = (from, to) => { if (!existsSync(from)) return 0; mkdirSync(to, { recursive: true }); let n = 0; for (const f of readdirSync(from)) { const a = path.join(from, f), b = path.join(to, f); if (statSync(a).isDirectory()) continue; if (!existsSync(b) || statSync(b).size !== statSync(a).size) { cpSync(a, b); n++; } } return n; };
const nMap = copyDir('dist/map', OUT + '/map');
const nRel = copyDir('/home/claude/reliefdata/rel', OUT + '/rel');
const hashDir = (d) => { const h = createHash('sha1'); if (existsSync(d)) for (const f of readdirSync(d).sort()) h.update(f + ':' + statSync(path.join(d, f)).size); return h.digest('hex').slice(0, 10); };
const dataVer = hashDir(OUT + '/map') + hashDir(OUT + '/rel');
const appVer = createHash('sha1').update(js + css).digest('hex').slice(0, 10);

const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex, nofollow">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="hansport">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">`;

const html = `<!DOCTYPE html>
<html lang="de">
<head>
${head}
<title>hansport</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));</script>
</body>
</html>`;
writeFileSync(OUT + '/index.html', html);

// Anmeldeseite (ohne App-Code, ohne externe Abrufe)
const login = `<!DOCTYPE html>
<html lang="de">
<head>
${head}
<title>hansport · Anmelden</title>
<style>
:root { color-scheme: light dark; --bg:#fff; --ink:#0b0b10; --ink2:#5b5b66; --line:rgba(0,0,0,.12); --field:#f2f2f5; --acc:#0a0a12; --accInk:#fff; --bad:#c62828; }
@media (prefers-color-scheme: dark) { :root { --bg:#000; --ink:#f4f4f7; --ink2:#a0a0ab; --line:rgba(255,255,255,.14); --field:#16161c; --acc:#f4f4f7; --accInk:#000; --bad:#ff6b6b; } }
* { box-sizing: border-box; }
html, body { margin:0; height:100%; background:var(--bg); color:var(--ink); font: 17px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; -webkit-text-size-adjust:100%; }
main { min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)); }
.logo { width:72px; height:72px; border-radius:17px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
.logo svg { width:100%; height:100%; display:block; }
h1 { font-size:28px; letter-spacing:-0.02em; margin:18px 0 4px; }
p { margin:0 0 22px; color:var(--ink2); font-size:15px; text-align:center; }
form { width:100%; max-width:340px; display:flex; flex-direction:column; gap:12px; }
input { font:inherit; font-size:17px; width:100%; min-height:50px; padding:12px 14px; border-radius:12px; border:0.5px solid var(--line); background:var(--field); color:var(--ink); }
input:focus { outline: 2px solid var(--ink); outline-offset: 1px; }
button { font:inherit; font-weight:600; min-height:50px; border-radius:14px; border:0; background:var(--acc); color:var(--accInk); cursor:pointer; }
button:disabled { opacity:.5; }
.err { color:var(--bad); font-size:15px; min-height:20px; text-align:center; }
.foot { margin-top:28px; font-size:13px; color:var(--ink2); text-align:center; max-width:340px; }
.sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
</style>
</head>
<body>
<main>
  <div class="logo" aria-hidden="true">${logoSvg}</div>
  <h1>hansport</h1>
  <p>Deine Trainings- und Gesundheitsdaten. Privat.</p>
  <form id="f" autocomplete="on">
    <input class="sr" type="text" name="username" autocomplete="username" value="hansport" tabindex="-1" aria-hidden="true">
    <label class="sr" for="pw">Passwort</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" placeholder="Passwort" required autofocus>
    <button id="go" type="submit">Anmelden</button>
    <div class="err" id="err" role="alert"></div>
  </form>
  <div class="foot">Nur für dich. Die Sitzung bleibt auf diesem Gerät 180 Tage angemeldet.</div>
</main>
<script>
const f = document.getElementById('f'), err = document.getElementById('err'), go = document.getElementById('go');
f.addEventListener('submit', async (e) => {
  e.preventDefault(); err.textContent = ''; go.disabled = true; go.textContent = 'Prüfe …';
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value }), credentials: 'same-origin' });
    const j = await r.json().catch(() => null);
    if (r.ok) { location.replace('/'); return; }
    err.textContent = (j && j.error && j.error.message) || 'Anmeldung fehlgeschlagen.';
  } catch (x) { err.textContent = 'Keine Verbindung.'; }
  go.disabled = false; go.textContent = 'Anmelden';
});
</script>
</body>
</html>`;
writeFileSync(OUT + '/login.html', login);

writeFileSync(OUT + '/manifest.webmanifest', JSON.stringify({
  name: 'hansport', short_name: 'hansport', description: 'Training, Gesundheit und Coach – privat.', lang: 'de', id: '/', start_url: '/', scope: '/',
  display: 'standalone', orientation: 'portrait', background_color: '#000000', theme_color: '#000000',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 1));

// Service Worker: App offline verfügbar, Kartendaten bleiben im Gerät; API nie zwischenspeichern
writeFileSync(OUT + '/sw.js', `// hansport ${appVer} / Daten ${dataVer}
const APP = 'hs-app-${appVer}', DATA = 'hs-data-${dataVer}';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== APP && k !== DATA) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/login.html') return;
  if (u.pathname.startsWith('/map/') || u.pathname.startsWith('/rel/') || u.pathname.startsWith('/icons/')) {
    e.respondWith((async () => { const c = await caches.open(DATA); const hit = await c.match(e.request); if (hit) return hit; const r = await fetch(e.request); if (r.ok && !r.redirected) c.put(e.request, r.clone()); return r; })());
    return;
  }
  if (e.request.mode === 'navigate' || u.pathname === '/' || u.pathname === '/index.html') {
    e.respondWith((async () => {
      const c = await caches.open(APP);
      try { const r = await fetch(e.request); if (r.ok && !r.redirected && new URL(r.url).pathname !== '/login.html') c.put('/', r.clone()); return r; }
      catch (x) { return (await c.match('/')) || Response.error(); }
    })());
  }
});
`);
writeFileSync(OUT + '/robots.txt', 'User-agent: *\nDisallow: /\n');
console.log('public/index.html', (html.length / 1024).toFixed(0) + ' KiB', '· Karte kopiert', nMap, '· Relief kopiert', nRel, '· app', appVer, 'daten', dataVer);
