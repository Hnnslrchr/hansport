// Anmeldung: ein Passwort (APP_PASSWORD), Sitzung als signiertes, httpOnly-Cookie.
// Ändert sich das Passwort, werden alle bestehenden Sitzungen ungültig.
const enc = new TextEncoder();
export const COOKIE = 'hs_session';
const MAX_AGE = 60 * 60 * 24 * 180; // 180 Tage

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
async function sha(s) { return Buffer.from(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

function secret() {
  const p = process.env.APP_PASSWORD;
  if (!p) return null;
  return 'hansport-v1|' + p + '|' + (process.env.SESSION_SECRET || '');
}

export const configured = () => !!process.env.APP_PASSWORD;

// Zeitkonstanter Vergleich über Hashes gleicher Länge
export async function passwordOk(given) {
  const p = process.env.APP_PASSWORD;
  if (!p || typeof given !== 'string') return false;
  const a = await sha('pw|' + given), b = await sha('pw|' + p);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function makeSession() {
  const s = secret();
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return exp + '.' + (await hmac(s, 'session:' + exp));
}

export function readCookie(req, name) {
  const h = req.headers.get('cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export async function sessionOk(req) {
  const s = secret();
  if (!s) return false;
  const v = readCookie(req, COOKIE);
  if (!v) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || +exp < Date.now() / 1000) return false;
  const want = await hmac(s, 'session:' + exp);
  if (want.length !== sig.length) return false;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}

export function sessionCookie(v) {
  return `${COOKIE}=${v}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// Kurzlebige, signierte Werte (z. B. OAuth-state)
export async function sign(value, ttlSec = 900) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return value + '.' + exp + '.' + (await hmac(secret(), 'sig:' + value + ':' + exp));
}
export async function unsign(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [value, exp, sig] = parts;
  if (+exp < Date.now() / 1000) return null;
  return (await hmac(secret(), 'sig:' + value + ':' + exp)) === sig ? value : null;
}
