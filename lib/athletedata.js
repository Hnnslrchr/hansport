// athletedata (optional): Gesundheitsdaten von Garmin und Withings über den MCP-Server von athletedata,
// mit eigenem API-Schlüssel (ATHLETEDATA_API_KEY). Kleiner MCP-Client für „Streamable HTTP“.
import { AppError } from './http.js';

const ENDPOINT = () => process.env.ATHLETEDATA_MCP_URL || 'https://mcp.athletedata.health/mcp';
export const adConfigured = () => !!process.env.ATHLETEDATA_API_KEY;

let sess = null; // { id, at, proto }
let seq = 1;

function parseSse(text, id) {
  let last = null;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
    if (!data) continue;
    try { const m = JSON.parse(data); if (m && (m.id === id || (m.result || m.error))) last = m.id === id ? m : last || m; } catch (e) { /* weiter */ }
  }
  return last;
}

async function rpc(method, params, { notify = false } = {}) {
  const key = process.env.ATHLETEDATA_API_KEY;
  if (!key) throw new AppError('athletedata_not_configured', 'athletedata ist nicht eingerichtet (ATHLETEDATA_API_KEY in Vercel).', 503);
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + key.trim() };
  if (sess && sess.id && method !== 'initialize') headers['mcp-session-id'] = sess.id;
  if (sess && sess.proto && method !== 'initialize') headers['mcp-protocol-version'] = sess.proto;
  const id = notify ? undefined : seq++;
  const body = notify ? { jsonrpc: '2.0', method, ...(params ? { params } : {}) } : { jsonrpc: '2.0', id, method, params: params || {} };
  let r;
  try { r = await fetch(ENDPOINT(), { method: 'POST', headers, body: JSON.stringify(body) }); }
  catch (e) { throw new AppError('athletedata_unavailable', 'athletedata ist nicht erreichbar.', 502); }
  if (r.status === 401 || r.status === 403) throw new AppError('athletedata_key_invalid', 'athletedata lehnt den Schlüssel ab (HTTP ' + r.status + '). Ist das Abo aktiv?', 502);
  if ((r.status === 404 || r.status === 400) && method !== 'initialize' && sess && sess.id) throw new AppError('session_expired', 'Sitzung abgelaufen', 409);
  if (r.status === 429) throw new AppError('rate_limited', 'athletedata drosselt gerade.', 429);
  if (notify) return null;
  if (!r.ok) throw new AppError('athletedata_http_' + r.status, 'athletedata antwortet mit HTTP ' + r.status, 502);
  const sid = r.headers.get('mcp-session-id');
  const ct = r.headers.get('content-type') || '';
  const msg = ct.includes('text/event-stream') ? parseSse(await r.text(), id) : await r.json().catch(() => null);
  if (!msg) throw new AppError('athletedata_bad_response', 'Unerwartete Antwort von athletedata', 502);
  if (msg.error) throw new AppError('athletedata_error', 'athletedata: ' + String(msg.error.message || msg.error.code).slice(0, 200), 502);
  return { result: msg.result, sid };
}

async function connect(force) {
  if (!force && sess && Date.now() - sess.at < 15 * 60000) return;
  sess = null;
  const { result, sid } = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hansport', version: '1.0' } });
  sess = { id: sid || null, at: Date.now(), proto: (result && result.protocolVersion) || '2025-06-18' };
  await rpc('notifications/initialized', null, { notify: true });
}

// Werkzeug aufrufen; Ergebnis im MCP-Format ({ content: [...], structuredContent? })
export async function adTool(name, args) {
  for (let i = 0; i < 2; i++) {
    await connect(i > 0);
    try {
      const { result } = await rpc('tools/call', { name, arguments: args || {} });
      sess.at = Date.now();
      if (result && result.isError) {
        const t = Array.isArray(result.content) ? result.content.map((c) => c && c.text).filter(Boolean).join(' ') : '';
        throw new AppError('tool_error', (t || 'Werkzeugfehler').slice(0, 300), 502);
      }
      return result;
    } catch (e) {
      if (e && e.code === 'session_expired' && i === 0) continue;
      throw e;
    }
  }
  throw new AppError('athletedata_unavailable', 'athletedata ist nicht erreichbar.', 502);
}
