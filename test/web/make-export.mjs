// Testexport im Format der Claude-Version (acts aus den Strava-Fixtures, Gesundheit aus real_state.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeActivity } from '../../src/strava.js';
const FX = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url)));
const H = JSON.parse(readFileSync(new URL('../real_state.json', import.meta.url)));
const acts = {};
for (const r of FX.activities) { const a = normalizeActivity(r); const m = a.date.slice(0, 7); (acts[m] ||= { items: [] }).items.push({ ...a, seen: 1 }); }
for (const m of Object.values(acts)) m.items.sort((a, b) => (a.start < b.start ? -1 : 1));
const health = {};
for (const [ym, doc] of Object.entries(H)) health[ym] = doc;
let lastDay = '';
for (const doc of Object.values(health)) for (const d of Object.keys(doc.days || {})) if (d > lastDay) lastDay = d;
const first = FX.activities[0];
const out = {
  app: 'Spur', exportedAt: '2026-11-22T10:00:00.000Z',
  acts, health,
  edits: { [String(first.id)]: { notes: 'Testnotiz bleibt erhalten', rpe: 6, at: 1 } },
  meta: { sync: { lastSync: Date.now() - 3600_000, lastResult: { added: 0 } }, health: { v: 5, lastSync: Date.now() - 3600_000, lastDay } },
  settings: { main: { theme: 'auto' } },
};
writeFileSync('/tmp/hs-export.json', JSON.stringify(out));
console.log('acts months', Object.keys(acts).length, 'health months', Object.keys(health).length, 'lastDay', lastDay, 'first act', first.id, first.start_local);
