// Ende-zu-Ende: Login → Import → Garmin-Abgleich (Nachbildung) → Aktivität mit FIT-Zeitreihen → Gesundheit → Neu laden
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync('/tmp/hsdata', { recursive: true, force: true }); mkdirSync('/tmp/hsdata/sys', { recursive: true });
writeFileSync('/tmp/hsdata/sys/withings.json', JSON.stringify({ access: 'wtok', refresh: 'r', exp: Date.now() + 3600_000, userid: '1', at: Date.now() }));
const AD = process.argv[2] === 'ad';
const env = { ...process.env, ...(AD ? { ATHLETEDATA_API_KEY: 'sk_soma_test', ATHLETEDATA_MCP_URL: 'http://localhost:8790/mcp' } : {}), APP_PASSWORD: 'pw-test-123456', HANSPORT_LOCAL_DATA: '/tmp/hsdata', GARMIN_API_KEY: 'test-key', GARMIN_BASE_URL: 'http://localhost:8790', WITHINGS_CLIENT_ID: 'wid', WITHINGS_CLIENT_SECRET: 'wsec', WITHINGS_BASE_URL: 'http://localhost:8790', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://localhost:8790' };
const mock = spawn('node', ['test/web/mock-garmin.mjs', '8790'], { env, stdio: 'inherit' });
const srv = spawn('node', ['tools/dev-server.mjs', '8787'], { env, stdio: ['ignore', 'inherit', 'inherit'] });
await sleep(1500);
const fails = [];
const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
try {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Rome' });
  await ctx.addInitScript(() => { window.__SPUR_TEST__ = true; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // 1) Zugang gesperrt ohne Anmeldung
  const r0 = await page.goto('http://localhost:8787/');
  check(page.url().endsWith('/login.html'), 'ohne Sitzung → Anmeldeseite (' + page.url() + ')');
  const mapRes = await page.request.get('http://localhost:8787/map/i.txt');
  check(mapRes.status() === 401, 'Kartendaten ohne Sitzung gesperrt (' + mapRes.status() + ')');
  const apiRes = await page.request.get('http://localhost:8787/api/db');
  check(apiRes.status() === 401, 'API ohne Sitzung gesperrt (' + apiRes.status() + ')');
  await page.fill('#pw', 'falsch');
  await page.click('#go');
  await page.waitForFunction(() => document.getElementById('err').textContent.length > 0, null, { timeout: 5000 });
  check(/stimmt nicht/.test(await page.textContent('#err')), 'falsches Passwort abgelehnt');
  await page.screenshot({ path: 'test/shots/web-login.png' });
  await page.fill('#pw', 'pw-test-123456');
  await page.click('#go');
  await page.waitForURL('http://localhost:8787/', { timeout: 8000 });
  await page.waitForFunction(() => window.__spur && document.querySelector('.tabs-app'), null, { timeout: 15000 });
  check(true, 'angemeldet, App geladen');

  // 2) Import
  await page.evaluate(() => { window.__spur.setTab('more'); window.__spur.push('data'); });
  await page.waitForSelector('text=Export-Datei wählen');
  await page.setInputFiles('input[type=file][accept*="json"]', '/tmp/hs-export.json');
  await page.waitForSelector('text=/Dokumente aus dem Export vom/', { timeout: 20000 });
  const nActs = await page.evaluate(() => window.__spur.derived().list.length);
  check(nActs >= 100, 'Import: ' + nActs + ' Aktivitäten im Speicher');
  await page.screenshot({ path: 'test/shots/web-import.png' });

  // 3) Abgleich Garmin
  await page.evaluate(() => window.__spur.sync({}));
  const st = await page.evaluate(() => { const l = window.__spur.derived().list; return { n: l.length, linked: l.filter((a) => a.gid && a.origin === 'strava').length, garmin: l.filter((a) => a.origin === 'garmin').map((a) => ({ id: a.id, poly: !!a.poly, sport: a.sport, hasHr: a.hasHr })), note: (window.__spur.getState().edits['21025335202'] || {}).notes }; });
  check(st.linked >= 100, 'übernommene Aktivitäten mit Garmin verknüpft: ' + st.linked);
  check(st.garmin.length === 2, 'neue Garmin-Aktivitäten: ' + JSON.stringify(st.garmin));
  check(st.garmin.some((a) => a.poly && a.sport === 'road'), 'neue Ausfahrt hat Strecke aus FIT');
  check(st.note === 'Testnotiz bleibt erhalten', 'eigene Notiz bleibt erhalten');

  // 4) Gesundheit
  await page.evaluate(() => window.__spur.syncHealth({}));
  const hs = await page.evaluate(() => { const H = window.__spur.getState().health; const days = {}; for (const d of Object.values(H)) Object.assign(days, d.days); const t = Object.keys(days).sort().pop(); const x = days[t]; const meta = window.__spur.getState().meta.health; return { t, x, meta }; });
  if (AD) {
    const ad = await page.evaluate(() => { const H = window.__spur.getState().health; let n = 0, rec = 0, tl = 0; for (const d of Object.values(H)) for (const x of Object.values(d.days)) { n++; if (x.rec != null) rec++; if (x.sl && x.sl.tl) tl++; } return { n, rec, tl, meta: window.__spur.getState().meta.health }; });
    check(ad.meta.v === 5 && ad.rec > 0, 'athletedata: Gesundheit wie bisher (v' + ad.meta.v + ', ' + ad.rec + ' Tage mit Erholung, ' + ad.tl + ' mit Schlafphasen, Hinweise: ' + JSON.stringify(ad.meta.notes || null) + ')');
    await page.evaluate(() => { window.__spur.setTab('more'); window.__spur.push('settings'); });
    await page.waitForSelector('text=athletedata prüfen');
    await page.click('text=athletedata prüfen');
    await page.waitForSelector('text=/Abo aktiv bis 28.11.2026/', { timeout: 8000 });
    await page.screenshot({ path: 'test/shots/web-settings-ad.png' });
    check(true, 'athletedata-Verbindung geprüft (Abo, verbundene Apps)');
  } else {
  check(hs.x && hs.x.hrv != null && hs.x.rhr != null && hs.x.sl && hs.x.sl.total, 'Tageswerte heute (' + hs.t + '): HRV ' + (hs.x && hs.x.hrv) + ', Ruhepuls ' + (hs.x && hs.x.rhr) + ', Schlaf ' + (hs.x && hs.x.sl && hs.x.sl.total));
  check(hs.x && hs.x.src && hs.x.src.pmc === 'hansport' && hs.x.ctl != null && hs.meta.pmc && Math.abs(hs.meta.pmc.k - 0.71) < 0.05, 'Form berechnet: CTL ' + (hs.x && hs.x.ctl) + ' TSB ' + (hs.x && hs.x.tsb) + ' k=' + (hs.meta.pmc && hs.meta.pmc.k));
  check(hs.x && hs.x.rdy != null, 'Erholung berechnet: ' + (hs.x && hs.x.rdy) + ' (' + (hs.x && hs.x.rdyK) + ')');
  check(hs.x && hs.x.base && hs.x.base.hrv, 'Basiswerte berechnet: ' + JSON.stringify(hs.x && hs.x.base));
  const wi = await page.evaluate(() => { const H = window.__spur.getState().health; return (H['2026-11'] && H['2026-11'].days['2026-11-21']) || {}; });
  check(wi.wi && wi.wi.weight === 78.1 && wi.wi.fatPct === 17.1 && wi.weight === 78.1 && wi.src.weight === 'withings', 'Withings: ' + JSON.stringify(wi.wi));
  check(hs.meta.v === 6 && hs.meta.src === 'garmin', 'meta/health v6 (' + JSON.stringify(hs.meta.notes || null) + ')');
  }

  // 5) Aktivität mit Zeitreihen aus FIT
  const id = st.garmin.find((a) => a.sport === 'road').id;
  await page.evaluate((id) => { window.__spur.setTab('activities'); window.__spur.push('activity', { id }); }, id);
  await page.waitForSelector('text=In Garmin Connect öffnen', { timeout: 15000 });
  await sleep(2500);
  await page.screenshot({ path: 'test/shots/web-activity.png', fullPage: false });
  const perf = await page.evaluate((id) => window.__spur.getState().perf[id], id);
  check(perf && perf.laps === 2 && perf.src === 'garmin', 'Runden aus FIT: ' + (perf && perf.laps));

  // 6) Heute und Einstellungen
  await page.evaluate(() => { window.__spur.setTab('today'); });
  await sleep(1200);
  await page.screenshot({ path: 'test/shots/web-today.png' });
  await page.evaluate(() => { window.__spur.setTab('more'); window.__spur.push('settings'); });
  await page.waitForSelector('text=Verbindungen');
  await page.waitForSelector('text=Verbindung prüfen');
  await page.click('text=Verbindung prüfen');
  await page.waitForSelector('text=verbunden', { timeout: 8000 });
  await page.screenshot({ path: 'test/shots/web-settings.png' });
  check(true, 'Einstellungen: Garmin-Verbindung geprüft');

  // 6b) Coach: Werkzeug-Schleife über /api/coach (Stream)
  await page.evaluate(() => window.__spur.setTab('coach'));
  await page.waitForSelector('input[aria-label="Frage an den Coach"]', { timeout: 10000 });
  await page.fill('input[aria-label="Frage an den Coach"]', 'Wie ist meine HRV?');
  await page.click('button[aria-label="Senden"]');
  await page.waitForSelector('text=/Werkzeug sagte/', { timeout: 15000 });
  const coachTxt = await page.textContent('.chat');
  check(/Werkzeug sagte: \[\["2026-11-1/.test(coachTxt), 'Coach: Werkzeug ausgeführt, Antwort gestreamt');
  await page.screenshot({ path: 'test/shots/web-coach.png' });

  // 7) Neu laden: Daten kommen vom Server
  await page.evaluate(() => indexedDB.deleteDatabase('spur'));
  await sleep(1500);
  await page.reload();
  await page.waitForFunction(() => window.__spur && window.__spur.derived().list.length > 100, null, { timeout: 15000 });
  const after = await page.evaluate(() => ({ n: window.__spur.derived().list.length, note: (window.__spur.getState().edits['21025335202'] || {}).notes }));
  check(after.n === st.n && after.note === 'Testnotiz bleibt erhalten', 'nach Neuladen vom Server: ' + after.n + ' Aktivitäten, Notiz erhalten');
  const calls = await (await fetch('http://localhost:8790/__calls')).json();
  console.log('Garmin-Aufrufe:', JSON.stringify(calls));
  const errs = errors.filter((e) => !/status of 401/.test(e));
  check(!errs.length, 'keine Fehler in der Konsole' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.error(e); fails.push(String(e.message || e)); }
await browser.close();
mock.kill(); srv.kill();
console.log(fails.length ? '\n' + fails.length + ' Fehler' : '\nalles grün');
process.exit(fails.length ? 1 : 0);
