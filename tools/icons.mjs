// Erzeugt src/ui/icons.js aus den Iconoir-SVGs (MIT-Lizenz, https://iconoir.com)
import fs from 'node:fs';
const dir = 'vendor/package/icons/regular/';
const names = ['view-grid', 'activity', 'heart', 'sparks', 'more-horiz', 'refresh-double', 'nav-arrow-left', 'nav-arrow-right', 'xmark', 'plus', 'search', 'filter', 'map', 'map-pin', 'bicycle', 'cycling', 'trekking', 'walking', 'running', 'gym', 'snow-flake', 'snow', 'swimming', 'half-moon', 'battery-full', 'flash', 'weight', 'timer', 'clock', 'path-arrow', 'media-image', 'media-video', 'camera', 'trophy', 'fire-flame', 'calendar', 'stats-report', 'graph-up', 'graph-down', 'settings', 'wrench', 'brain', 'droplet', 'info-circle', 'warning-triangle', 'edit-pencil', 'trash', 'download', 'compass', 'sun-light', 'play', 'expand', 'user', 'shield-check', 'antenna-signal', 'arrow-up', 'arrow-down', 'percentage-circle', 'chat-lines', 'stat-up', 'stat-down', 'database-stats', 'cutlery', 'apple', 'leaf', 'ruler', 'menu', 'check', 'send', 'lock', 'modern-tv', 'skateboarding', 'yoga', 'stretching'];
const out = {};
for (const n of names) {
  const f = dir + n + '.svg';
  if (!fs.existsSync(f)) { console.log('fehlt', n); continue; }
  const s = fs.readFileSync(f, 'utf8');
  out[n] = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
}
fs.writeFileSync('src/ui/icons.js', '// Iconoir ' + JSON.parse(fs.readFileSync('vendor/package/package.json')).version + ' – MIT-Lizenz, https://iconoir.com\nexport const ICONS = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length, 'Icons', fs.statSync('src/ui/icons.js').size, 'Bytes');
