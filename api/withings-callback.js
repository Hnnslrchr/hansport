// Rückkehr von Withings nach der Freigabe: Code gegen Tokens tauschen, dann zurück in die App
import { guarded } from '../lib/http.js';
import { unsign } from '../lib/auth.js';
import { exchangeCode, redirectUri } from '../lib/withings.js';

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const back = (q) => new Response(null, { status: 302, headers: { location: '/?withings=' + q + '#mehr', 'cache-control': 'no-store' } });
  if (u.searchParams.get('error')) return back('denied');
  if ((await unsign(u.searchParams.get('state'))) !== 'withings') return back('state');
  const code = u.searchParams.get('code');
  if (!code) return back('nocode');
  try { await exchangeCode(code, redirectUri(req)); return back('ok'); } catch (e) { return back('failed'); }
});
