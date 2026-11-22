// Lesender Durchgang zur Garmin Personal API (nur freigegebene Endpunkte).
// GET /api/garmin?p=/usersummary-service/v2/dailysummaries&startDate=…&endDate=…
import { guarded, json } from '../lib/http.js';
import { garminFetch, checkPath } from '../lib/garmin.js';

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const path = u.searchParams.get('p');
  checkPath(path);
  const q = {};
  for (const [k, v] of u.searchParams) if (k !== 'p') q[k] = v;
  const data = await garminFetch(path, q);
  return json(data);
});
