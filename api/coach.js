// Coach: Anfrage an die Claude-API mit eigenem Schlüssel (ANTHROPIC_API_KEY). Antwort als Stream (SSE).
import { guarded, readJson, fail } from '../lib/http.js';

export const config = { maxDuration: 120 };

export const POST = guarded(async (req) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail('coach_not_configured', 'Für den Coach fehlt der Claude-API-Schlüssel (ANTHROPIC_API_KEY in Vercel).', 503);
  const b = await readJson(req, 1_500_000);
  if (!Array.isArray(b.messages) || !b.messages.length) return fail('bad_request', 'messages fehlt');
  const body = {
    model: process.env.COACH_MODEL || 'claude-sonnet-5-5',
    max_tokens: Math.min(Math.max(+b.max_tokens || 2000, 256), 8000),
    messages: b.messages,
    stream: true,
  };
  if (typeof b.system === 'string' && b.system) body.system = b.system;
  if (Array.isArray(b.tools) && b.tools.length) body.tools = b.tools.slice(0, 20);
  const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: req.signal,
  });
  if (!r.ok) {
    const t = await r.text();
    let msg = t.slice(0, 300);
    try { const j = JSON.parse(t); msg = (j.error && j.error.message) || msg; } catch (e) { /* Text */ }
    return fail(r.status === 429 ? 'rate_limited' : r.status === 401 ? 'coach_key_invalid' : 'coach_error', 'Claude-API: ' + msg, r.status === 429 ? 429 : 502);
  }
  return new Response(r.body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
});
