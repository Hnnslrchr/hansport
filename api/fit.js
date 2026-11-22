// Zeitreihen, Runden und Sätze aus der Garmin-Originaldatei.
// GET /api/fit?id=123&want=streams&res=1000 | want=full&keys=time,distance,altitude | want=summary | want=sets
import { guarded, json, fail } from '../lib/http.js';
import { loadFitBytes, decodeFit, series, sample, summaryPolyline, laps, sets, sessionInfo } from '../lib/fit.js';

export const config = { maxDuration: 30 };

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get('id');
  const want = u.searchParams.get('want') || 'streams';
  const m = decodeFit(await loadFitBytes(id));
  if (want === 'sets') return json({ sets: sets(m) }, 200, { 'cache-control': 'private, max-age=3600' });
  const s = series(m);
  if (want === 'summary') {
    return json({ poly: summaryPolyline(s), laps: laps(m), sets: sets(m), session: sessionInfo(m), points: s ? s.n : 0 }, 200, { 'cache-control': 'private, max-age=3600' });
  }
  if (!s) return fail('no_streams', 'Diese Aktivität hat keine Zeitreihen.', 404);
  if (want === 'full') {
    const keys = (u.searchParams.get('keys') || 'time').split(',').filter((k) => /^[a-z_]+$/.test(k)).slice(0, 10);
    return json(sample(s, 0, keys), 200, { 'cache-control': 'private, max-age=3600' });
  }
  const res = Math.max(100, Math.min(5000, +u.searchParams.get('res') || 1000));
  return json({ ...sample(s, res), res }, 200, { 'cache-control': 'private, max-age=3600' });
});
