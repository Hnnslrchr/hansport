// Alle Screens hell und dunkel auf 402 × 874 (Design-Check), mit Testdaten
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync('/tmp/hsdata3', { recursive: true, force: true }); mkdirSync('/tmp/hsdata3', { recursive: true });
const env = { ...process.env, APP_PASSWORD: 'pw', HANSPORT_LOCAL_DATA: '/tmp/hsdata3', GARMIN_API_KEY: 'test-key', GARMIN_BASE_URL: 'http://localhost:8790', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://localhost:8790' };
const mock = spawn('node', ['test/web/mock-garmin.mjs', '8790'], { env, stdio: 'ignore' });
const srv = spawn('node', ['tools/dev-server.mjs', '8787'], { env, stdio: 'ignore' });
await sleep(1500);
mkdirSync('test/shots/screens', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
let first = true;
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Rome', colorScheme: scheme });
  await ctx.addInitScript(() => { window.__SPUR_TEST__ = true; });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8787/login.html');
  if (first) await page.screenshot({ path: `test/shots/screens/${scheme}-00-login.png` });
  await page.fill('#pw', 'pw'); await page.click('#go');
  await page.waitForFunction(() => window.__spur && document.querySelector('.tabs-app'), null, { timeout: 15000 });
  if (first) {
    await page.evaluate(() => { window.__spur.setTab('more'); window.__spur.push('data'); });
    await page.setInputFiles('input[type=file][accept*="json"]', '/tmp/hs-export.json');
    await page.waitForSelector('text=/Dokumente aus dem Export vom/', { timeout: 20000 });
    await page.evaluate(() => window.__spur.sync({}));
    await page.evaluate(() => window.__spur.syncHealth({}));
    first = false;
  }
  const ids = await page.evaluate(() => { const l = window.__spur.derived().list; return { road: (l.find((a) => a.poly && a.sport === 'road') || {}).id, gym: (l.find((a) => a.sport === 'gym') || {}).id }; });
  const shots = [
    ['01-heute', () => window.__spur.setTab('today'), 3000, 3000],
    ['02-aktivitaeten', () => window.__spur.setTab('activities'), 2000, 3600],
    ['03-detail', (id) => { window.__spur.setTab('activities'); window.__spur.push('activity', { id }); }, 4000, 2600, ids.road],
    ['04-gesundheit', () => window.__spur.setTab('health'), 2500, 3000],
    ['05-kennzahl-hrv', () => { window.__spur.setTab('health'); window.__spur.push('metric', { k: 'hrv' }); }, 2500, 1800],
    ['06-coach', () => window.__spur.setTab('coach'), 2500, 2200],
    ['07-berichte', () => { window.__spur.setTab('more'); window.__spur.push('reviews'); }, 2000, 1400],
    ['08-karte', () => { window.__spur.setTab('more'); window.__spur.push('map'); }, 5000, 874],
    ['09-ausruestung', () => { window.__spur.setTab('more'); window.__spur.push('gear'); }, 1500, 1200],
    ['10-rad', () => { window.__spur.setTab('more'); window.__spur.push('gear-item', { id: '14788475' }); }, 2000, 2000],
    ['11-einstellungen', () => { window.__spur.setTab('more'); window.__spur.push('settings'); }, 2000, 2200],
    ['14-schlaf', () => { window.__spur.setTab('health'); window.__spur.push('metric', { k: 'sleep' }); }, 2500, 1400],
    ['13-datenquellen', () => { window.__spur.setTab('more'); window.__spur.push('sources'); }, 2500, 2000],
    ['12-mehr', () => window.__spur.setTab('more'), 1200, 1300],
  ];
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  for (const [name, fn, wait, hgt, arg] of shots) {
    if (only && !only.test(name)) continue;
    await page.setViewportSize({ width: 402, height: hgt });
    await page.evaluate(fn, arg);
    await sleep(wait);
    await page.screenshot({ path: `test/shots/screens/${scheme}-${name}.png` });
  }
  await ctx.close();
}
await browser.close(); mock.kill(); srv.kill();
console.log('ok');
