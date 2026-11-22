// Aufrufe an die eigenen Serverfunktionen (Garmin, FIT, Withings)
export class ApiError extends Error { constructor(code, message, status) { super(message || code); this.code = code; this.status = status; } }

export async function api(url, opts = {}) {
  let r;
  try { r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...opts }); }
  catch (e) { throw new ApiError('unavailable', 'Keine Verbindung zum Server'); }
  if (r.status === 401) { try { location.replace('/login.html'); } catch (e) { /* Test */ } throw new ApiError('unauthorized', 'Bitte anmelden', 401); }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError((j && j.error && j.error.code) || 'http_' + r.status, (j && j.error && j.error.message) || 'Fehler ' + r.status, r.status);
  return j;
}

export function garmin(path, query = {}) {
  const q = new URLSearchParams({ p: path });
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') q.append(k, String(v));
  return api('/api/garmin?' + q);
}

export const fit = (gid, want, extra = {}) => api('/api/fit?' + new URLSearchParams({ id: gid, want, ...extra }));
