// Schnellprüfung: Textkontrast (gegen deckenden Hintergrund) und Tippflächen < 44 px, je Screen und Modus
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync('/tmp/hsdata4', { recursive: true, force: true }); mkdirSync('/tmp/hsdata4', { recursive: true });
const env = { ...process.env, APP_PASSWORD: 'pw', HANSPORT_LOCAL_DATA: '/tmp/hsdata4', GARMIN_API_KEY: 'test-key', GARMIN_BASE_URL: 'http://localhost:8790' };
const mock = spawn('node', ['test/web/mock-garmin.mjs', '8790'], { env, stdio: 'ignore' });
const srv = spawn('node', ['tools/dev-server.mjs', '8787'], { env, stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const audit = () => {
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((x) => { x = +x / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const alpha = (c) => { const m = c.match(/[\d.]+/g); return m && m.length > 3 ? +m[3] : 1; };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (alpha(s.backgroundColor) > 0.85) return s.backgroundColor; } return getComputedStyle(document.body).backgroundColor; };
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity < 0.1) continue;
    const fg = lum(s.color), bg = lum(bgOf(el)); if (fg == null || bg == null) continue;
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) * (alpha(s.color) < 1 ? alpha(s.color) : 1);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(el.textContent.trim().slice(0, 30) + ' ' + ratio.toFixed(2) + ' ' + s.fontSize);
  }
  const small = [];
  for (const el of document.querySelectorAll('button, a, input, select, [role=button]')) {
    const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
    if (r.width < 44 || r.height < 44) small.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
  }
  return { contrast: bad, targets: small };
};
let first = true;
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, locale: 'de-DE', timezoneId: 'Europe/Rome', colorScheme: scheme });
  await ctx.addInitScript(() => { window.__SPUR_TEST__ = true; });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8787/login.html'); await page.fill('#pw', 'pw'); await page.click('#go');
  await page.waitForFunction(() => window.__spur && document.querySelector('.tabs-app'), null, { timeout: 15000 });
  if (first) {
    await page.evaluate(() => { window.__spur.setTab('more'); window.__spur.push('data'); });
    await page.setInputFiles('input[type=file][accept*="json"]', '/tmp/hs-export.json');
    await page.waitForSelector('text=/Dokumente aus dem Export vom/', { timeout: 20000 });
    await page.evaluate(() => window.__spur.sync({})); await page.evaluate(() => window.__spur.syncHealth({})); first = false;
  }
  await page.setViewportSize({ width: 402, height: 3000 });
  for (const [name, fn] of [['heute', () => window.__spur.setTab('today')], ['gesundheit', () => window.__spur.setTab('health')], ['aktivitaeten', () => window.__spur.setTab('activities')], ['coach', () => window.__spur.setTab('coach')], ['rad', () => { window.__spur.setTab('more'); window.__spur.push('gear-item', { id: '14788475' }); }], ['einstellungen', () => { window.__spur.setTab('more'); window.__spur.push('settings'); }]]) {
    await page.evaluate(fn); await sleep(2500);
    const r = await page.evaluate(audit);
    console.log(scheme, name, 'Kontrast<AA:', r.contrast.length, JSON.stringify(r.contrast.slice(0, 6)), '| Tippflächen<44:', r.targets.length, JSON.stringify(r.targets.slice(0, 8)));
  }
  await ctx.close();
}
await browser.close(); mock.kill(); srv.kill();
