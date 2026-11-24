// Withings (Waage): OAuth 2 mit eigener Withings-App (WITHINGS_CLIENT_ID / WITHINGS_CLIENT_SECRET).
// Tokens liegen privat im Speicher (sys/withings.json) und werden automatisch erneuert.
import { AppError } from './http.js';
import { getJson, putJson, delObj } from './blob.js';

const TOK = 'sys/withings.json';
const API = () => (process.env.WITHINGS_BASE_URL || 'https://wbsapi.withings.net').replace(/\/$/, '');
export const AUTH_URL = 'https://account.withings.com/oauth2_user/authorize2';
export const withingsConfigured = () => !!(process.env.WITHINGS_CLIENT_ID && process.env.WITHINGS_CLIENT_SECRET);

export function redirectUri(req) {
  if (process.env.WITHINGS_REDIRECT_URI) return process.env.WITHINGS_REDIRECT_URI;
  const u = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') || u.host;
  return 'https://' + host + '/api/withings-callback';
}

async function tokenCall(params) {
  const body = new URLSearchParams({ action: 'requesttoken', client_id: process.env.WITHINGS_CLIENT_ID, client_secret: process.env.WITHINGS_CLIENT_SECRET, ...params });
  const r = await fetch(API() + '/v2/oauth2', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => null);
  if (!j || j.status !== 0 || !j.body || !j.body.access_token) throw new AppError('withings_auth_failed', 'Withings-Anmeldung fehlgeschlagen' + (j && j.error ? ': ' + String(j.error).slice(0, 120) : ' (Status ' + (j ? j.status : r.status) + ')'), 502);
  const t = j.body;
  const doc = { access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (t.expires_in || 10800) * 1000, userid: String(t.userid || ''), scope: t.scope || '', at: Date.now() };
  await putJson(TOK, doc);
  return doc;
}

export const exchangeCode = (code, redirect_uri) => tokenCall({ grant_type: 'authorization_code', code, redirect_uri });
export const status = async () => { const t = await getJson(TOK); return t ? { connected: true, since: t.at, scope: t.scope } : { connected: false }; };
export const disconnect = () => delObj(TOK);

async function access() {
  if (!withingsConfigured()) throw new AppError('withings_not_configured', 'Withings ist nicht eingerichtet (WITHINGS_CLIENT_ID/SECRET in Vercel).', 503);
  const t = await getJson(TOK);
  if (!t) throw new AppError('withings_not_connected', 'Withings ist noch nicht verbunden.', 409);
  if (t.exp > Date.now() + 120000) return t.access;
  return (await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refresh })).access;
}

// Messungen der Waage/Blutdruckmessung, mit Blättern über "more/offset"
export async function measures(startdate, enddate) {
  const tok = await access();
  const groups = [];
  let offset = 0, guard = 0;
  do {
    const body = new URLSearchParams({ action: 'getmeas', meastypes: '1,5,6,8,9,10,11,76,77,88,91,155,170,226', category: '1', startdate: String(startdate), enddate: String(enddate) });
    if (offset) body.set('offset', String(offset));
    const r = await fetch(API() + '/measure', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json().catch(() => null);
    if (!j || j.status !== 0) throw new AppError('withings_error', 'Withings meldet Status ' + (j ? j.status : r.status), 502);
    const b = j.body || {};
    for (const g of b.measuregrps || []) groups.push({ date: g.date, tz: b.timezone || g.timezone || null, measures: (g.measures || []).map((m) => ({ type: m.type, v: m.value * Math.pow(10, m.unit) })) });
    offset = b.more ? b.offset : 0;
  } while (offset && ++guard < 20);
  return groups;
}

async function post(path, params, tok) {
  const r = await fetch(API() + path, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => null);
  if (!j || j.status !== 0) throw new AppError('withings_error', 'Withings meldet Status ' + (j ? j.status : r.status), 502);
  return j.body || {};
}

// EKG-Aufnahmen (z. B. Body Scan): Zeitpunkt, Withings-Klassifizierung (0 unauffällig, 1 Vorhofflimmern, 2 nicht eindeutig), Puls, Signal-ID
export async function heartList(startdate, enddate) {
  const tok = await access();
  const out = [];
  let offset = 0, guard = 0;
  do {
    const p = { action: 'list', startdate: String(startdate), enddate: String(enddate) };
    if (offset) p.offset = String(offset);
    const b = await post('/v2/heart', p, tok);
    for (const s of b.series || []) {
      if (!s || !s.ecg || s.timestamp == null) continue;
      out.push({ t: s.timestamp, tz: s.timezone || b.timezone || null, afib: s.ecg.afib ?? null, sid: s.ecg.signalid ?? null, hr: typeof s.heart_rate === 'number' ? s.heart_rate : (s.heart_rate && s.heart_rate.value) ?? null });
    }
    offset = b.more ? b.offset : 0;
  } while (offset && ++guard < 20);
  return out;
}

// EKG-Intervalle (QRS, PR, QT, QTc), falls Withings sie für das Konto herausgibt
export async function ecgIntervals(startdate, enddate) {
  const tok = await access();
  const groups = [];
  let offset = 0, guard = 0;
  do {
    const p = { action: 'getmeas', meastypes: '135,136,137,138', category: '1', startdate: String(startdate), enddate: String(enddate) };
    if (offset) p.offset = String(offset);
    const b = await post('/measure', p, tok);
    for (const g of b.measuregrps || []) groups.push({ date: g.date, tz: b.timezone || g.timezone || null, measures: (g.measures || []).map((m) => ({ type: m.type, v: m.value * Math.pow(10, m.unit) })) });
    offset = b.more ? b.offset : 0;
  } while (offset && ++guard < 20);
  return groups;
}

// EKG-Kurve einer Aufnahme: nur zur Anzeige, wird nicht gespeichert. Gekürzt auf 10 s und ca. 150 Hz.
export async function heartSignal(signalid) {
  const tok = await access();
  const b = await post('/v2/heart', { action: 'get', signalid: String(signalid) }, tok);
  let sig = b.signal;
  if (Array.isArray(sig) && Array.isArray(sig[0])) sig = sig[0];
  const fs = Number(b.sampling_frequency) || 0;
  if (!Array.isArray(sig) || !sig.length || !fs) return { ok: false };
  const step = Math.max(1, Math.round(fs / 150));
  const n = Math.min(sig.length, Math.round(fs * 10));
  const pts = [];
  for (let i = 0; i < n; i += step) pts.push(Math.round(Number(sig[i]) || 0));
  return { ok: true, fs: fs / step, pts, dur: sig.length / fs, wp: b.wearposition ?? null };
}
