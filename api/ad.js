// Durchgang zu athletedata (nur die Werkzeuge, die hansport nutzt). POST { tool, input }
import { guarded, json, readJson, fail } from '../lib/http.js';
import { adTool } from '../lib/athletedata.js';

export const config = { maxDuration: 60 };

const ALLOWED = new Set([
  // lesen
  'get_daily_metrics', 'garmin_get_sleep', 'garmin_get_daily_summaries', 'garmin_get_user_metrics', 'withings_get_measurements',
  'get_pmc_status', 'get_athlete_context', 'athletedata_subscription_status', 'get_readiness_today', 'coaching_note_get',
  // Coach-Gedächtnis spiegeln (wie in der Claude-Version, nur nach Bestätigung im Chat)
  'athlete_preference_update', 'coaching_note_create',
]);

export const POST = guarded(async (req) => {
  const b = await readJson(req, 200000);
  if (!ALLOWED.has(b.tool)) return fail('not_allowed', 'Dieses athletedata-Werkzeug ist nicht freigegeben.');
  const result = await adTool(b.tool, b.input && typeof b.input === 'object' ? b.input : {});
  return json({ result });
});
