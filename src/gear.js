// Ausrüstung: Startwerte (Stand 22.11.2026), automatische Zuordnung und Fortschreibung.
// Die Startwerte enthalten alle Fahrten bis einschließlich Stichtag; danach zählt jede Aktivität einmal (über ihre ID).
import { getState, setDoc } from './store.js';

export const GEAR_START = {
  asOf: '2026-11-22',
  bikes: [
    { key: 'scalpel', name: 'Scalpel', role: 'mtb', match: /scalpel/i, dist: 934103, gain: 43016, mov: 83 * 3600, n: 39 },
    { key: 'supersix', name: 'SuperSix', role: 'road', match: /super\s*six/i, dist: 5969042, gain: 115779, mov: 277 * 3600, n: 130 },
  ],
};
export const LOG_KINDS = [['service', 'Service'], ['repair', 'Reparatur'], ['mod', 'Umbau']];
export const logKindName = (k) => (LOG_KINDS.find((x) => x[0] === k) || [null, 'Notiz'])[1];

const main = () => getState().settings.main || {};
export const gearSeed = () => main().gearSeed || null;

// Daten zu einer Ausrüstung: eigene (gear/…) oder aus Strava (settings.main.gearMeta)
export function gearInfo(id) {
  const S = getState();
  const own = S.gear[id];
  const extra = (main().gearMeta || {})[id] || {};
  const sb = (((S.meta.gear || {}).bikes) || []).concat(((S.meta.gear || {}).shoes) || []).find((b) => b.id === id) || null;
  return { own, extra, sb, g: own || { ...extra, id, name: sb ? sb.name : id } };
}

// Einmalig: Startwerte für Scalpel und SuperSix anlegen (vorhandene Strava-Räder werden über den Namen gefunden)
export function seedGear() {
  const S = getState();
  const m = main();
  if (m.gearSeed && m.gearSeed.v === 1) return false;
  const bikes = ((S.meta.gear || {}).bikes) || [];
  const ids = {};
  const gearMeta = { ...(m.gearMeta || {}) };
  for (const b of GEAR_START.bikes) {
    const base = { asOf: GEAR_START.asOf, dist: b.dist, gain: b.gain, mov: b.mov, n: b.n };
    const sb = bikes.find((x) => b.match.test(x.name || ''));
    const own = Object.values(S.gear).find((g) => b.match.test(g.name || ''));
    if (sb) { ids[b.key] = sb.id; gearMeta[sb.id] = { ...(gearMeta[sb.id] || {}), base: (gearMeta[sb.id] || {}).base || base, role: b.role }; }
    else if (own) { ids[b.key] = own.id; if (!own.base) setDoc('gear/' + own.id, { ...own, base, role: b.role }); }
    else { const id = 'gear-' + b.key; ids[b.key] = id; setDoc('gear/' + id, { id, name: b.name, kind: 'bike', role: b.role, since: '', base }); }
  }
  setDoc('settings/main', { ...m, gearMeta, gearSeed: { v: 1, at: Date.now(), asOf: GEAR_START.asOf, ids, roles: { mtb: ids.scalpel, road: ids.supersix } } });
  return true;
}

// Automatische Zuordnung, wenn eine Aktivität keine Ausrüstung hat: MTB → Scalpel, Rennrad draußen → SuperSix
export function autoGear(seed, a) {
  if (!seed || !seed.roles || a.indoor || a.ebike) return null;
  if (a.sport === 'mtb') return seed.roles.mtb || null;
  if (a.sport === 'road' && a.sub !== 'Gravel') return seed.roles.road || null;
  return null;
}

// Gesamtwerte: Startwerte plus alle Fahrten nach dem Stichtag (Indoor zählt nicht)
export function gearTotals(list, id, g) {
  const base = g && g.base;
  const asOf = base ? base.asOf : null;
  const acts = list.filter((a) => a.gear === id && !a.excluded && !a.indoor && (!asOf || a.date > asOf));
  const sum = (f) => acts.reduce((s, a) => s + (f(a) || 0), 0);
  return {
    dist: (base ? base.dist : 0) + sum((a) => a.dist), gain: (base ? base.gain : 0) + sum((a) => a.gain),
    mov: (base ? base.mov : 0) + sum((a) => a.mov), n: (base ? base.n : 0) + acts.length,
    asOf, newN: acts.length, last: acts.length ? acts.map((a) => a.date).sort().pop() : null, acts,
  };
}

// Kilometerstand an einem Datum (für das Wartungslogbuch)
export function odometerAt(list, id, g, date) {
  const base = g && g.base;
  const mine = list.filter((a) => a.gear === id && !a.excluded && !a.indoor);
  if (base) {
    if (date >= base.asOf) return base.dist + mine.filter((a) => a.date > base.asOf && a.date <= date).reduce((s, a) => s + (a.dist || 0), 0);
    return Math.max(0, base.dist - mine.filter((a) => a.date > date && a.date <= base.asOf).reduce((s, a) => s + (a.dist || 0), 0));
  }
  return mine.filter((a) => a.date <= date).reduce((s, a) => s + (a.dist || 0), 0);
}
