// Erzeugt das App-Icon „Orb“ in allen Schnitten: node tools/orb-icons.mjs → assets/orb/
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { orbInner, blende } from '../src/ui/hansport-logo.js';

const OUT = 'assets/orb';
mkdirSync(OUT + '/png', { recursive: true });
const svg = (px, opt = {}) => {
  const o = orbInner({ px: opt.cut || px, uid: 'o', ...opt });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">${o.defs}${o.bg}${o.ball}${o.mark(blende('#FFFFFF', o.sw, false))}</svg>`;
};
// SVG-Favicon im 16-px-Schnitt (so erscheint es im Tab), Login-Logo im großen Schnitt
writeFileSync(OUT + '/favicon.svg', svg(16).replace('width="16" height="16"', ''));
writeFileSync(OUT + '/hansport-icon.svg', svg(180).replace('width="180" height="180"', ''));

const jobs = [
  ['orb-16.png', 16, {}], ['orb-32.png', 32, {}], ['orb-48.png', 48, {}], ['orb-64.png', 64, {}],
  ['apple-touch-icon.png', 180, { tile: 'square' }],
  ['icon-192.png', 192, {}], ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { tile: 'square', inner: 0.62 / 0.78 }],
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
a=[Image.open('${OUT}/png/orb-%d.png'%s).convert('RGBA') for s in (48,32,16)]
a[0].save('${OUT}/favicon.ico', sizes=[(48,48),(32,32),(16,16)], append_images=a[1:])
`]);
console.log('Orb-Icons in', OUT);
