// Erzeugt das App-Icon „Silber“ in allen Schnitten: node tools/app-icons.mjs → assets/icon/
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { appIconInner, blende } from '../src/ui/hansport-logo.js';

const OUT = 'assets/icon';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT + '/png', { recursive: true });
const svg = (px, opt = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">${appIconInner({ px, uid: 'i', marks: (c, sw) => blende(c, sw, false), ...opt })}</svg>`;
// SVG-Favicon im 16-px-Schnitt (so erscheint es im Tab), Login-Logo im großen Schnitt
writeFileSync(OUT + '/favicon.svg', svg(16).replace(' width="16" height="16"', ''));
writeFileSync(OUT + '/hansport-icon.svg', svg(180).replace(' width="180" height="180"', ''));

const jobs = [
  ['silber-16.png', 16, {}], ['silber-32.png', 32, {}], ['silber-48.png', 48, {}], ['silber-64.png', 64, {}],
  // iOS rundet die Ecken selbst; die Innenkante folgt dem Radius 14,2, die Fläche ist randlos und ohne Transparenz
  ['apple-touch-icon.png', 180, { tile: 'square' }],
  ['icon-192.png', 192, {}], ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { tile: 'square', edge: false, inner: 0.62 / 0.78 }],
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const p = await b.newPage({ deviceScaleFactor: 1, viewport: { width: 600, height: 600 } });
for (const [f, px, opt] of jobs) {
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg(px, opt)}</body></html>`);
  await p.screenshot({ path: `${OUT}/png/${f}`, omitBackground: !opt.tile || opt.tile === 'round', clip: { x: 0, y: 0, width: px, height: px } });
}
await b.close();
// favicon.ico mit den eigenen Schnitten 16/32/48
execFileSync('python3', ['-c', `
from PIL import Image
a=[Image.open('${OUT}/png/silber-%d.png'%s).convert('RGBA') for s in (48,32,16)]
a[0].save('${OUT}/favicon.ico', sizes=[(48,48),(32,32),(16,16)], append_images=a[1:])
`]);
console.log('App-Icons in', OUT);
