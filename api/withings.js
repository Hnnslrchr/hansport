// GET /api/withings?a=status | a=start (Weiterleitung zu Withings) | a=meas&from=…&to=… (Unix-Sekunden) | a=heart&from=…&to=… | a=signal&id=…
// POST /api/withings?a=disconnect
import { guarded, json, fail } from '../lib/http.js';
import { sign } from '../lib/auth.js';
import { withingsConfigured, status, measures, heartList, ecgIntervals, heartSignal, disconnect, redirectUri, AUTH_URL } from '../lib/withings.js';

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const a = u.searchParams.get('a') || 'status';
  if (a === 'status') return json({ configured: withingsConfigured(), ...(await status()) });
  if (a === 'start') {
    if (!withingsConfigured()) return fail('withings_not_configured', 'Withings ist nicht eingerichtet.', 503);
    const q = new URLSearchParams({ response_type: 'code', client_id: process.env.WITHINGS_CLIENT_ID, scope: 'user.metrics', redirect_uri: redirectUri(req), state: await sign('withings', 900) });
    return new Response(null, { status: 302, headers: { location: AUTH_URL + '?' + q, 'cache-control': 'no-store' } });
  }
  if (a === 'meas') {
    const from = Math.max(0, parseInt(u.searchParams.get('from'), 10) || 0);
    const to = parseInt(u.searchParams.get('to'), 10) || Math.floor(Date.now() / 1000);
    return json({ groups: await measures(from, to) });
  }
  if (a === 'heart') {
    const from = Math.max(0, parseInt(u.searchParams.get('from'), 10) || 0);
    const to = parseInt(u.searchParams.get('to'), 10) || Math.floor(Date.now() / 1000);
    const records = await heartList(from, to);
    let intervals = [], note = null;
    try { intervals = await ecgIntervals(from, to); } catch (e) { note = 'EKG-Intervalle nicht verfügbar'; }
    return json({ records, intervals, note });
  }
  if (a === 'signal') {
    const id = u.searchParams.get('id');
    if (!id || !/^\d{1,20}$/.test(id)) return fail('bad_request', 'Ungültige Signal-ID');
    return json(await heartSignal(id));
  }
  return fail('bad_request', 'Unbekannte Aktion');
});

export const POST = guarded(async (req) => {
  const a = new URL(req.url).searchParams.get('a');
  if (a === 'disconnect') { await disconnect(); return json({ ok: true }); }
  return fail('bad_request', 'Unbekannte Aktion');
});
