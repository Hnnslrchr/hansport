// POST /api/login { password } → Sitzungs-Cookie. Fehlversuche werden gebremst.
import { json, fail, readJson } from '../lib/http.js';
import { configured, passwordOk, makeSession, sessionCookie } from '../lib/auth.js';

const recent = []; // Fehlversuche dieser Instanz (zusätzliche Bremse)

export async function POST(req) {
  if (!configured()) return fail('not_configured', 'Für hansport ist noch kein Passwort hinterlegt (APP_PASSWORD in Vercel).', 503);
  const now = Date.now();
  while (recent.length && now - recent[0] > 15 * 60000) recent.shift();
  if (recent.length >= 20) return fail('locked', 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.', 429);
  let b = {};
  try { b = await readJson(req, 10000); } catch (e) { return fail('bad_request', 'Ungültige Anfrage'); }
  if (!(await passwordOk(String(b.password || '')))) {
    recent.push(now);
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 400));
    return fail('wrong_password', 'Das Passwort stimmt nicht.', 401);
  }
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeSession()) });
}
