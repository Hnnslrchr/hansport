import { h, render, Fragment } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import './styles.css';
import './hp.css';
import './hp2.css';
import './r4.css';
import { navState, onNav, setTab, fromHash, push, pop } from './nav.js';
import { boot, getState, subscribe, derived } from './store.js';
import { sync, analyzeQueue } from './strava.js';
import { Icon, Seg } from './ui/kit.jsx';
import HansportLogo from './ui/HansportLogo.jsx';
import { Ico, useSwipeBack, pageApply, vtRunning, clearSwiped } from './ui/hp.jsx';
import { springTo, setValue, reducedMotion } from './ui/spring.js';
import { Today } from './views/today.jsx';
import { Coach } from './views/coach.jsx';
import { Health } from './views/health2.jsx';
import { MetricView } from './views/metric.jsx';
import { syncHealth } from './health.js';
import { Overview, InsightDetail, AboutInsights } from './views/overview.jsx';
import { Activities } from './views/activities.jsx';
import { ActivityDetail } from './views/activity.jsx';
import { RouteView, SegmentView, MarkView, CompareView } from './views/routes.jsx';
import { MapTab } from './views/mapview.jsx';
import { GymSession, GymExercises, GymExercise, GymTemplates } from './views/gym.jsx';
import { More, Goals, GearList, GearItem, Reviews, Review, Settings, DataView, ShareMap, Guide } from './views/more.jsx';
import { WEB } from './env.js';
import { webBoot } from './web/views.jsx';

// Aktivitäten mit Umschalter Liste | Karte
function ActivitiesRoot() {
  const [mode, setMode] = useState(() => (location.hash === '#karte' ? 'map' : 'list'));
  return (
    <div class="view flush root" style="padding-bottom:0">
      <div style="padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 8px;flex:none"><Seg value={mode} onChange={setMode} label="Ansicht" options={[['list', 'Liste'], ['map', 'Karte']]} /></div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">{mode === 'list' ? <Activities /> : <MapTab />}</div>
    </div>
  );
}
const ROOT = { today: Today, activities: ActivitiesRoot, health: Health, coach: Coach, more: More };
const VIEWS = {
  activity: (p) => <ActivityDetail id={p.id} />,
  activities: (p) => <Activities sport={p.sport} range={p.range} label={p.label} tab={p.tab} />,
  insight: (p) => <InsightDetail id={p.id} />,
  'about-insights': () => <AboutInsights />,
  route: (p) => <RouteView rkey={p.key || p.rkey} />,
  segment: (p) => <SegmentView id={p.id} />,
  mark: (p) => <MarkView id={p.id} />,
  compare: (p) => <CompareView a={p.a} b={p.b} />,
  gym: (p) => <GymSession id={p.id} />,
  'gym-exercises': () => <GymExercises />,
  'gym-exercise': (p) => <GymExercise name={p.name} />,
  'gym-templates': () => <GymTemplates />,
  more: () => <More />,
  goals: () => <Goals />,
  metric: (p) => <MetricView k={p.k} />,
  gear: () => <GearList />,
  'gear-item': (p) => <GearItem id={p.id} />,
  reviews: () => <Reviews />,
  review: (p) => <Review ym={p.ym} />,
  settings: () => <Settings />,
  data: () => <DataView />,
  share: () => <ShareMap />,
  guide: () => <Guide />,
  overview: () => <Overview />,
  insights: () => <Overview />,
  map: () => <MapTab />,
};

const TABS = [
  ['today', 'Heute', 'view-grid'],
  ['activities', 'Aktivitäten', 'activity'],
  ['health', 'Gesundheit', 'heart'],
  ['coach', 'Coach', 'sparks'],
  ['more', 'Mehr', 'more-horiz'],
];

// Ladebildschirm: Zeichen zeichnet sich ein (ca. 0,9 s), dann blendet er aus
let splashState = { show: true, out: false };
const splashLs = new Set();
function hideSplash() {
  if (!splashState.show || splashState.out) return;
  splashState = { show: true, out: true }; splashLs.forEach((f) => f());
  setTimeout(() => { splashState = { show: false, out: true }; splashLs.forEach((f) => f()); }, 320);
}
function Splash() {
  const [, setV] = useState(0);
  useEffect(() => { const f = () => setV((x) => x + 1); splashLs.add(f); return () => splashLs.delete(f); }, []);
  if (!splashState.show) return null;
  return <div class={'splash' + (splashState.out ? ' out' : '')} aria-hidden="true"><HansportLogo variant="icon" size={96} animated title="hansport" /></div>;
}

const SCROLL = {};
let lastShown = null;

function App() {
  const [, setV] = useState(0);
  useEffect(() => onNav(() => setV((x) => x + 1)), []);
  useEffect(() => subscribe(() => setV((x) => x + 1)), []);
  const nav = navState();
  const stack = nav.stacks[nav.tab];
  const top = stack[stack.length - 1];
  const Root = ROOT[nav.tab];
  const S = getState();
  const stageRef = useRef();
  const shown = nav.tab + ':' + (top ? top.key : 'root');
  // Neue Seite gleitet von rechts herein (Feder, unterbrechbar); zurück an die alte Scrollposition
  useEffect(() => {
    const v = document.querySelector('.stage > .view');
    if (v) v.scrollTop = nav.dir < 0 && SCROLL[shown] != null ? SCROLL[shown] : 0;
    const el = stageRef.current;
    if (el && top && nav.dir > 0 && !vtRunning && !reducedMotion()) { const ap = pageApply(el); setValue(el, 'x', el.offsetWidth * 0.3, ap); springTo(el, 'x', 0, { response: 0.38, apply: ap }); }
    clearSwiped();
  }, [shown]);
  useEffect(() => onNav(() => { const v = document.querySelector('.stage > .view'); if (v && lastShown) SCROLL[lastShown] = v.scrollTop; }), []);
  lastShown = shown;
  useSwipeBack(stageRef, pop, !!top);
  return (
    <div class="shell hp2 r4">
      <main class={'stage' + (top && nav.dir > 0 ? ' in-push' : '')} key={nav.tab + (top ? top.key : '')} ref={stageRef}>
        {top ? (VIEWS[top.view] ? VIEWS[top.view](top.params || {}) : <div class="view"><div class="empty">Unbekannte Ansicht.</div></div>) : <Root />}
      </main>
      <nav class="tabs2 tabs-app" aria-label="Bereiche">
        <div class="pill">
          {TABS.slice(0, 4).map(([k, l, ic]) => (
            <button type="button" aria-current={nav.tab === k ? 'page' : undefined} onClick={() => setTab(k)}><Ico n={ic} />{l}</button>
          ))}
        </div>
        <button type="button" class="more" aria-label="Mehr" aria-current={nav.tab === 'more' ? 'page' : undefined} onClick={() => setTab('more')}><Ico n="more-horiz" /></button>
      </nav>
      {nav.sheet ? <Fragment key={nav.sheet.key}>{nav.sheet.render()}</Fragment> : null}
      <Splash />
      {S.toast ? <div class={'toast' + (S.toast.kind === 'error' ? ' error' : '')} role="status" aria-live="polite">{S.toast.text}</div> : null}
    </div>
  );
}

async function start() {
  if (WEB) webBoot();
  fromHash();
  // iOS: :active (Druck-Zustand) sofort beim Berühren
  document.addEventListener('touchstart', () => {}, { passive: true });
  if (window.__SPUR_TEST__) window.__spur = { push, setTab, getState, derived, sync, syncHealth };
  render(<App />, document.getElementById('app'));
  const t0 = Date.now();
  const cp = await boot().finally(() => setTimeout(hideSplash, Math.max(0, (reducedMotion() ? 250 : 1100) - (Date.now() - t0))));
  const set = getState().settings.main || {};
  if (set.theme && set.theme !== 'auto') document.documentElement.dataset.theme = set.theme;
  // Automatisch abgleichen (Strava, Garmin, Withings): beim Öffnen und beim Zurückkehren,
  // wenn der letzte Abgleich älter als 30 Minuten ist – und stündlich, solange die App offen ist.
  const tryAuto = (maxAge = 30 * 60000) => {
    const S = getState();
    if (!cp || !cp.mcp || S.status.syncing || !navigator.onLine) return;
    const last = (S.meta.sync && S.meta.sync.lastSync) || 0;
    if (Date.now() - last > maxAge && last) sync({}).catch(() => {});
    else if (last) analyzeQueue(10).catch(() => {});
    const hl = (S.meta.health && S.meta.health.lastSync) || 0;
    if (Date.now() - hl > maxAge && !S.status.healthSyncing) syncHealth().catch(() => {});
  };
  setTimeout(() => tryAuto(), 2500);
  setInterval(() => { if (document.visibilityState === 'visible') tryAuto(55 * 60000); }, 60 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tryAuto(); });
}
start();
