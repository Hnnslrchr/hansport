// Garmin Personal API: API-Schlüssel (GARMIN_API_KEY) gegen ein Zugriffstoken tauschen (ca. 24 h gültig)
// und nur freigegebene, lesende Endpunkte abfragen.
import { AppError } from './http.js';
import { getJson, putJson } from './blob.js';

const BASE = () => (process.env.GARMIN_BASE_URL || 'https://personal.connectapi.garmin.com').replace(/\/$/, '');
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';
const TOKEN_CACHE = 'sys/garmin-token.json';

// Nur diese Pfade dürfen abgefragt werden (alles nur lesend)
export const ALLOWED = [
  /^\/usersummary-service\/v2\/dailysummaries$/,
  /^\/usersummary-service\/usersummary\/daily$/,
  /^\/usersummary-service\/stats\/(steps|stress|hydration)\/daily\/\d{4}-\d\d-\d\d\/\d{4}-\d\d-\d\d$/,
  /^\/sleep-service\/sleep\/dailySleep$/,
  /^\/sleep-service\/sleep\/dailySleepSummariesByDate$/,
  /^\/hrv-service\/hrv\/\d{4}-\d\d-\d\d$/,
  /^\/hrv-service\/hrv\/daily\/\d{4}-\d\d-\d\d\/\d{4}-\d\d-\d\d$/,
  /^\/wellness-service\/wellness\/bodyBattery\/reports\/daily$/,
  /^\/wellness-service\/wellness\/dailyHeartRate$/,
  /^\/metrics-service\/metrics\/maxmet\/daily\/\d{4}-\d\d-\d\d\/\d{4}-\d\d-\d\d$/,
  /^\/fitnessage-service\/fitnessage\/v2\/\d{4}-\d\d-\d\d$/,
  /^\/weight-service\/weight\/range\/\d{4}-\d\d-\d\d\/\d{4}-\d\d-\d\d$/,
  /^\/goal-service\/goal\/user\/effective\/weightgoal\/\d{4}-\d\d-\d\d\/\d{4}-\d\d-\d\d$/,
  /^\/userprofile-service\/userprofile\/settings$/,
  /^\/biometric-service\/heartRateZones\/v2$/,
  /^\/activitylist-service\/activities\/search\/activities$/,
  /^\/activity-service\/activity\/\d{1,15}$/,
  /^\/activity-service\/activity\/\d{1,15}\/workouts$/,
];

let mem = null; // { jwt, exp }

function jwtExp(jwt) {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (p && p.exp) return p.exp * 1000;
  } catch (e) { /* kein JWT-Format */ }
  return Date.now() + 20 * 3600 * 1000;
}

export const garminConfigured = () => !!process.env.GARMIN_API_KEY;

async function fetchToken() {
  const key = process.env.GARMIN_API_KEY;
  if (!key) throw new AppError('garmin_not_configured', 'Der Garmin-Schlüssel fehlt. Trage GARMIN_API_KEY in Vercel ein.', 503);
  const r = await fetch(BASE() + TOKEN_PATH, { method: 'POST', headers: { Accept: '*/*', Authorization: 'ApiKey ' + key.trim() } });
  const txt = (await r.text()).trim();
  if (!r.ok) throw new AppError(r.status === 401 || r.status === 403 ? 'garmin_key_invalid' : 'garmin_token_failed', 'Garmin lehnt den Schlüssel ab (HTTP ' + r.status + ').', 502);
  let jwt = txt;
  try { const j = JSON.parse(txt); jwt = (j && (j.accessToken || j.access_token || j.token)) || (typeof j === 'string' ? j : txt); } catch (e) { /* reiner Text */ }
  if (!jwt || jwt.length < 20) throw new AppError('garmin_token_failed', 'Garmin hat kein Token geliefert.', 502);
  mem = { jwt, exp: jwtExp(jwt) };
  try { await putJson(TOKEN_CACHE, mem); } catch (e) { /* Zwischenspeicher optional */ }
  return mem.jwt;
}

async function token(force = false) {
  if (!force && mem && mem.exp > Date.now() + 120000) return mem.jwt;
  if (!force && !mem) {
    try { const c = await getJson(TOKEN_CACHE); if (c && c.jwt && c.exp > Date.now() + 120000) { mem = c; return c.jwt; } } catch (e) { /* weiter */ }
  }
  return fetchToken();
}

export function checkPath(path) {
  if (typeof path !== 'string' || !ALLOWED.some((re) => re.test(path))) throw new AppError('not_allowed', 'Dieser Garmin-Endpunkt ist nicht freigegeben.', 400);
}

// Abfrage mit einem Wiederholversuch bei abgelaufenem Token und bei Drosselung
export async function garminFetch(path, query = {}, { raw = false } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') qs.append(k, String(v));
  const url = BASE() + path + (qs.toString() ? '?' + qs : '');
  let force = false;
  for (let i = 0; i < 3; i++) {
    const jwt = await token(force);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + jwt, Accept: raw ? '*/*' : 'application/json' } });
    if (r.status === 401 && !force) { force = true; continue; }
    if (r.status === 429 && i < 2) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue; }
    if (r.status === 204 || r.status === 404) return raw ? null : { _empty: true, status: r.status };
    if (!r.ok) {
      const t = (await r.text()).slice(0, 300);
      throw new AppError(r.status === 429 ? 'garmin_rate_limited' : 'garmin_http_' + r.status, 'Garmin antwortet mit HTTP ' + r.status + (t ? ': ' + t : ''), r.status === 429 ? 429 : 502);
    }
    if (raw) return Buffer.from(await r.arrayBuffer());
    const t = await r.text();
    if (!t) return { _empty: true, status: r.status };
    try { return JSON.parse(t); } catch (e) { return { _text: t.slice(0, 2000) }; }
  }
  throw new AppError('garmin_unavailable', 'Garmin ist gerade nicht erreichbar.', 502);
}

export async function garminPing() {
  await token(true);
  return true;
}
