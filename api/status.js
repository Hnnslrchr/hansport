// Welche Verbindungen eingerichtet sind (nur Ja/Nein, nie Schlüssel). ?test=garmin prüft den Garmin-Zugang.
import { guarded, json } from '../lib/http.js';
import { garminConfigured, garminPing } from '../lib/garmin.js';
import { withingsConfigured, status as wStatus } from '../lib/withings.js';

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const out = {
    garmin: { configured: garminConfigured() },
    withings: { configured: withingsConfigured() },
    coach: { configured: !!process.env.ANTHROPIC_API_KEY, model: process.env.COACH_MODEL || 'claude-sonnet-5-5' },
    storage: { local: !!process.env.HANSPORT_LOCAL_DATA },
    region: process.env.VERCEL_REGION || null,
  };
  try { Object.assign(out.withings, await wStatus()); } catch (e) { out.withings.error = String(e.message || e).slice(0, 120); }
  if (u.searchParams.get('test') === 'garmin' && out.garmin.configured) {
    try { await garminPing(); out.garmin.ok = true; } catch (e) { out.garmin.ok = false; out.garmin.error = String(e.message || e).slice(0, 200); }
  }
  return json(out);
});
