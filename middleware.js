// Alles außer Anmeldeseite, Symbolen und den API-Funktionen (die selbst prüfen) braucht eine gültige Sitzung.
// So bleiben auch die Kartenausschnitte (sie zeigen, wo du unterwegs bist) privat.
import { sessionOk } from './lib/auth.js';

export const config = {
  matcher: ['/((?!api/|login\\.html|login\\.css|icons/|manifest\\.webmanifest|favicon\\.ico|robots\\.txt).*)'],
};

export default async function middleware(request) {
  if (await sessionOk(request)) return;
  const url = new URL(request.url);
  const p = url.pathname;
  if (p === '/' || p.endsWith('.html')) return Response.redirect(new URL('/login.html', request.url), 302);
  return new Response('Bitte anmelden.', { status: 401, headers: { 'cache-control': 'no-store' } });
}
