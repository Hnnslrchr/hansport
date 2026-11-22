// Screenshots der Startseite mit Testdaten (hell/dunkel, iPhone und breiter)
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = process.argv[2] || 'now';
rmSync('/tmp/hsdata', { recursive: true, force: true }); mkdirSync('/tmp/hsdata/sys', { recursive: true });
const env = { ...process.env, APP_PASSWORD: 'pw-test-123456', HANSPORT_LOCAL_DATA: '/tmp/hsdata', GARMIN_API_KEY: 'test-key', GARMIN_BASE_URL: 'http://localhost:8790' };
const mock = spawn('node', ['test/web/mock-garmin.mjs', '8790'], { env, stdio: 'ignore' });
const srv = spawn('node', ['tools/dev-server.mjs', '8787'], { env, stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
try {
  for (const [w, h, scheme] of [[402, 3400, 'dark'], [560, 3000, 'dark'], [402, 3400, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Rome', colorScheme: scheme });
    await ctx.addInitScript(() => { window.__SPUR_TEST__ = true; });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8787/login.html');
    await page.fill('#pw', 'pw-test-123456'); await page.click('#go');
    await page.waitForFunction(() => window.__spur && document.querySelector('.tabs-app'), null, { timeout: 15000 });
    if (w === 402 && scheme === 'dark' && !process.env.NOIMPORT) {
      await page.evaluate(() => { window.__spur.setTab('more'); window.__spur.push('data'); });
      await page.waitForSelector('text=Export-Datei wählen');
      await page.setInputFiles('input[type=file][accept*="json"]', process.env.EXPORT || '/tmp/hs-export.json');
      await page.waitForSelector('text=/Dokumente aus dem Export vom/', { timeout: 20000 });
      await page.evaluate(() => window.__spur.sync({}));
      await page.evaluate(() => window.__spur.syncHealth({}));
    }
    await page.evaluate(() => window.__spur.setTab('today'));
    await sleep(2500);
    await page.screenshot({ path: `test/shots/today-${tag}-${w}-${scheme}.png`, fullPage: true });
    if (w === 402 && scheme === 'dark') {
      await page.setViewportSize({ width: 402, height: 874 });
      await page.evaluate(() => window.__spur.setTab('activities'));
      await sleep(1500);
      await page.screenshot({ path: `test/shots/list-${tag}.png` });
      await page.click('text=Karte');
      await sleep(5000);
      await page.screenshot({ path: `test/shots/map-${tag}.png` });
    }
    await ctx.close();
  }
} catch (e) { console.error(e); }
await browser.close(); mock.kill(); srv.kill();
console.log('ok');
