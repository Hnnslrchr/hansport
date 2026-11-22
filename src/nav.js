// Navigation: fünf Tabs, je ein Stapel von Unterseiten, ein Blatt von unten.
const TABS = ['today', 'activities', 'health', 'coach', 'more'];
const HASH = { today: 'heute', activities: 'aktivitaeten', health: 'gesundheit', coach: 'coach', more: 'mehr' };

const nav = { tab: 'today', stacks: { today: [], activities: [], health: [], coach: [], more: [] }, sheet: null, v: 0, dir: 0 };
const ls = new Set();
const emit = () => { nav.v++; ls.forEach((f) => f()); };
export const navState = () => nav;
export const onNav = (f) => { ls.add(f); return () => ls.delete(f); };

export function fromHash() {
  const h = (location.hash || '').replace('#', '');
  const t = Object.keys(HASH).find((k) => HASH[k] === h);
  if (t) nav.tab = t;
}

export function setTab(t) {
  if (!TABS.includes(t)) return;
  if (nav.tab === t) nav.stacks[t] = [];
  nav.tab = t;
  nav.dir = 0;
  try { history.replaceState(null, '', '#' + HASH[t]); } catch (e) { /* egal */ }
  emit();
}

let k = 0;
export function push(view, params = {}, tab) {
  if (tab && tab !== nav.tab) { nav.tab = tab; try { history.replaceState(null, '', '#' + HASH[tab]); } catch (e) { /* egal */ } }
  nav.stacks[nav.tab] = [...nav.stacks[nav.tab], { view, params, key: ++k }];
  nav.dir = 1;
  emit();
}
export function replaceTop(view, params = {}) {
  const s = nav.stacks[nav.tab];
  nav.stacks[nav.tab] = [...s.slice(0, -1), { view, params, key: ++k }];
  emit();
}
export function pop() {
  nav.stacks[nav.tab] = nav.stacks[nav.tab].slice(0, -1);
  nav.dir = -1;
  emit();
}
export function openSheet(render, title) { nav.sheet = { render, title, key: ++k }; emit(); }
// Ein offenes Blatt schließt animiert über seinen eigenen Weg; danach wird es entfernt.
let sheetCloser = null;
export function setSheetCloser(f) { sheetCloser = f; }
export function closeSheet() {
  if (sheetCloser) { const f = sheetCloser; sheetCloser = null; f(); return; }
  nav.sheet = null; emit();
}
export const current = () => { const s = nav.stacks[nav.tab]; return s[s.length - 1] || null; };
