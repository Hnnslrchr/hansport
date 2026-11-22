// Welche Verbindungen eingerichtet sind (nur Ja/Nein, nie Schlüssel). ?test=garmin prüft den Garmin-Zugang.
import { guarded, json } from '../lib/http.js';
import { garminConfigured, garminPing } from '../lib/garmin.js';
import { withingsConfigured, status as wStatus } from '../lib/withings.js';
import { adConfigured, adTool } from '../lib/athletedata.js';

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const out = {
    garmin: { configured: garminConfigured() },
    withings: { configured: withingsConfigured() },
    athletedata: { configured: adConfigured() },
    coach: { configured: !!process.env.ANTHROPIC_API_KEY, model: process.env.COACH_MODEL || 'claude-sonnet-5-5' },
    storage: { local: !!process.env.HANSPORT_LOCAL_DATA },
    region: process.env.VERCEL_REGION || null,
  };
  try { Object.assign(out.withings, await wStatus()); } catch (e) { out.withings.error = String(e.message || e).slice(0, 120); }
  if (u.searchParams.get('test') === 'garmin' && out.garmin.configured) {
    try { await garminPing(); out.garmin.ok = true; } catch (e) { out.garmin.ok = false; out.garmin.error = String(e.message || e).slice(0, 200); }
  }
  if (u.searchParams.get('test') === 'athletedata' && out.athletedata.configured) {
    try {
      const r = await adTool('athletedata_subscription_status', {});
      const t = Array.isArray(r && r.content) ? r.content.map((c) => c && c.text).filter(Boolean).join(' ') : '';
      out.athletedata.ok = true;
      out.athletedata.plan = (/plan is ([A-Z]+)/.exec(t) || [])[1] || null;
      out.athletedata.until = (/runs to (\d{4}-\d\d-\d\d)/.exec(t) || [])[1] || null;
      out.athletedata.apps = ((/connected to this athletedata account right now: ([a-z_, ]+)\./.exec(t) || [])[1] || '').split(/,\s*/).filter(Boolean);
    } catch (e) { out.athletedata.ok = false; out.athletedata.error = String(e.message || e).slice(0, 200); }
  }
  return json(out);
});
