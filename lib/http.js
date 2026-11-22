// Kleine Helfer für die Serverfunktionen (Web-Request/Response)
import { sessionOk } from './auth.js';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const fail = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

export class AppError extends Error {
  constructor(code, message, status = 500, extra = {}) { super(message || code); this.code = code; this.status = status; this.extra = extra; }
}

// Same-Origin-Prüfung für schreibende Aufrufe (zusätzlich zu SameSite=Lax)
function sameOrigin(req) {
  const o = req.headers.get('origin');
  if (!o) return true;
  try { return new URL(o).host === new URL(req.url).host; } catch (e) { return false; }
}

// Jede Funktion prüft die Sitzung selbst, unabhängig von der Middleware
export function guarded(handler) {
  return async (req) => {
    try {
      if (!(await sessionOk(req))) return fail('unauthorized', 'Bitte anmelden.', 401);
      if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return fail('forbidden', 'Fremder Ursprung.', 403);
      return await handler(req);
    } catch (e) {
      if (e instanceof AppError) return fail(e.code, e.message, e.status, e.extra);
      console.error(e);
      return fail('server_error', 'Interner Fehler: ' + String((e && e.message) || e).slice(0, 200), 500);
    }
  };
}

export async function readJson(req, max = 4_000_000) {
  const t = await req.text();
  if (t.length > max) throw new AppError('too_large', 'Anfrage zu groß', 413);
  try { return JSON.parse(t || '{}'); } catch (e) { throw new AppError('bad_json', 'Ungültiges JSON', 400); }
}
