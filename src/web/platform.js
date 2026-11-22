// Web-Version der Plattform-Fähigkeiten: eigener Speicher, Coach über die Claude-API, Medien im privaten Speicher.
export { kvGet, kvSet, kvDel, lsGet, lsSet, isTransient } from '../platform.js';
import { webDb } from './db.js';
import { sample } from './sample.js';
import { assets } from './assets.js';

// MCP-Aufrufe: nur athletedata, über die eigene Serverfunktion /api/ad (Schlüssel bleibt auf dem Server)
const noMcp = {
  web: true,
  async callTool(server, tool, input) {
    if (server !== 'athletedata') { const e = new Error('In der Web-Version nicht verfügbar'); e.code = 'no_mcp'; throw e; }
    let r;
    try { r = await fetch('/api/ad', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, input: input || {} }), credentials: 'same-origin' }); }
    catch (x) { const e = new Error('Keine Verbindung'); e.code = 'unavailable'; e.retryable = true; throw e; }
    if (r.status === 401) { try { location.replace('/login.html'); } catch (x) { /* Test */ } }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error((j && j.error && j.error.message) || 'Fehler ' + r.status); e.code = (j && j.error && j.error.code) || 'tool_error'; e.retryable = r.status === 429 || r.status === 503; e.retryAfterMs = 2500; throw e; }
    return j.result;
  },
};
let capsP = null;
export function caps() {
  return (capsP ||= Promise.resolve({ db: webDb, mcp: noMcp, user: null, assets, downloads: null, sample, web: true }));
}
