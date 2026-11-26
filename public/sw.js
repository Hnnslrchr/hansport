// hansport b34e6a607c / Daten 8d76d46ca8203577a7df
const APP = 'hs-app-b34e6a607c', DATA = 'hs-data-8d76d46ca8203577a7df';
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
