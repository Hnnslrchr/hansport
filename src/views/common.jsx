import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { subscribe, getVersion, derived, getState } from '../store.js';
import { Mark, Cell, Est, Icon } from '../ui/kit.jsx';
import { listMetrics } from './sportcard.jsx';
import { dsport, sportLabel } from '../sports.js';
import { km, hm, dur, dateShort, relDate, speedKmh, int, num, timeOf } from '../format.js';
import { push } from '../nav.js';
import { decode, merc, encode } from '../geo.js';
import { ACT_SRC, WEB } from '../env.js';

export function useData() {
  const [, setV] = useState(getVersion());
  useEffect(() => subscribe(() => setV(getVersion())), []);
  return derived();
}

export function useStatus() {
  const [, setV] = useState(0);
  useEffect(() => subscribe(() => setV((x) => x + 1)), []);
  return getState().status;
}

export function keyMetric(a) {
  if (a.sport === 'gym') return { v: dur(a.mov), s: a.gymId ? 'mit Trainingslog' : '' };
  if (a.indoor) return { v: km(a.dist) + ' km', s: speedKmh(a.mov ? a.dist / a.mov : 0) + ' km/h' };
  if (a.sport === 'road') return { v: km(a.dist) + ' km', s: hm(a.gain) + ' Hm' };
  if (a.sport === 'mtb') return { v: hm(a.gain) + ' Hm', s: km(a.dist) + ' km' };
  if (a.sport === 'hike' || a.sport === 'splitboard') return { v: hm(a.gain) + ' Hm', s: dur(a.mov) };
  if (a.sport === 'snowboard') return { v: dur(a.mov), s: km(a.dist) + ' km' };
  return { v: a.dist ? km(a.dist) + ' km' : dur(a.mov), s: a.dist ? dur(a.mov) : '' };
}

export function ActRow({ a, sub }) {
  const S = getState();
  const [top, bot] = listMetrics(a, S.perf[a.id], S.strength[a.id]);
  const flags = [];
  if (a.src === 'manual') flags.push('manuell');
  if (a.src === 'gym') flags.push('Trainingslog');
  if (a.edited && a.src === 'strava') flags.push('ergänzt');
  if (a.media && a.media.length) flags.push(a.media.length + ' Medien');
  const kind = a.sub && !/indoor/i.test(a.sub) ? a.sub : sportLabel(dsport(a));
  return (
    <button type="button" class="cell arow" onClick={() => push('activity', { id: a.id })}>
      <Mark a={a} />
      <div class="main"><div class="t1">{a.name}</div><div class="t2">{sub || (dateShort(a.date) + ' · ' + kind + (flags.length ? ' · ' + flags.join(' · ') : ''))}</div></div>
      <div class="val"><b>{top || '–'}</b>{bot ? <span>{bot}</span> : null}</div>
      <Icon.chev />
    </button>
  );
}

// Kleine Streckenform aus der Polyline
export function RouteShape({ poly, pts, color = 'var(--ink)', w = 72, hgt = 54 }) {
  const p = pts || (poly ? decode(poly) : null);
  if (!p || p.length < 2) return null;
  const xy = p.map(([a, b]) => merc(a, b));
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const [x, y] of xy) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = Math.min((w - 8) / (x1 - x0 || 1e-9), (hgt - 8) / (y1 - y0 || 1e-9));
  const ox = (w - (x1 - x0) * s) / 2, oy = (hgt - (y1 - y0) * s) / 2;
  const d = xy.map(([x, y], i) => (i ? 'L' : 'M') + ((x - x0) * s + ox).toFixed(1) + ',' + ((y - y0) * s + oy).toFixed(1)).join('');
  const P = (k) => [((xy[k][0] - x0) * s + ox), ((xy[k][1] - y0) * s + oy)];
  const [sx, sy] = P(0), [ex, ey] = P(xy.length - 1);
  return (
    <svg width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} aria-hidden="true" style="flex:none;overflow:visible">
      <path d={d} fill="none" stroke={color} stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx={ex} cy={ey} r="3.2" fill="var(--tile)" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx={sx} cy={sy} r="3.2" fill="var(--ink)" />
    </svg>
  );
}

export function SyncLine() {
  const st = useStatus();
  const s = getState();
  const last = s.meta.sync && s.meta.sync.lastSync;
  let dot = 'dot', txt;
  if (st.syncing) txt = (st.progress ? st.progress.step + (st.progress.n ? ' · ' + st.progress.n : '') : 'Abgleich läuft') + ' …';
  else if (st.error) { dot = 'dot warn'; txt = 'Abgleich fehlgeschlagen · zuletzt ' + agoShort(last); }
  else if (!st.online) { dot = 'dot off'; txt = 'Offline · gespeicherte Daten · letzter Abgleich ' + agoShort(last); }
  else if (st.localOnly) { dot = 'dot off'; txt = 'Nur auf diesem Gerät gespeichert'; }
  else txt = 'Letzter Abgleich mit ' + ACT_SRC + ': ' + agoShort(last);
  return (
    <div class="status" aria-live="polite">
      {st.syncing ? <span class="spin" aria-hidden="true" /> : <span class={dot} aria-hidden="true" />}
      <span>{txt}{st.pending ? ' · ' + st.pending + ' Änderung' + (st.pending === 1 ? '' : 'en') + ' warten auf Verbindung' : ''}{st.analysis ? ' · Analyse ' + st.analysis.n + '/' + st.analysis.total : ''}</span>
    </div>
  );
}

function agoShort(ts) {
  if (!ts) return 'noch nie';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 90) return 'gerade eben';
  if (s < 3600) return 'vor ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'vor ' + Math.round(s / 3600) + ' h';
  const d = new Date(ts);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export const gearName = (d, id) => (id ? d.gearNames[id] || 'Ausrüstung ' + id : null);

// Zonen-Verlauf: Strava-Zonen plus eigene Einstellungen (eigene gelten ab ihrem Datum)
export function zoneHist() {
  const S = getState();
  const a = (S.meta.zones && S.meta.zones.hist) || [];
  const u = ((S.settings.main && S.settings.main.zones) || []).map((z) => ({ ...z, src: 'user' }));
  const all = [...a, ...u].sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.src === 'user' ? 1 : -1));
  return all.length ? all : null;
}

// Link zur eigenen 3D-Kartenseite (außerhalb von Claude). Die Strecke steht nur
// hinter dem # und wird deshalb nie an einen Server gesendet.
export const SPUR_URL = 'https://claude.ai/artifact/2nZ6hXzZDVyCXHgGidz527';
// Web-App: ohne eigene Einstellung die eigene Seite Spur 3D (GitHub Pages)
export const SPUR3D_DEFAULT = 'https://hnnslrchr.github.io/spur-3d/';
export function map3dBase() {
  const u = ((getState().settings.main || {}).map3d || (WEB ? SPUR3D_DEFAULT : '')).trim();
  return /^https:\/\/[^\s#]+$/.test(u) ? u.replace(/\/?$/, '/') : null;
}
function thin(pts, max = 1500) {
  if (!pts || pts.length <= max) return pts;
  const step = pts.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}
export function link3d(items, view) {
  const base = map3dBase();
  if (!base) return null;
  const q = new URLSearchParams();
  (items || []).slice(0, 2).forEach((it, i) => {
    const sfx = i ? '2' : '';
    const pts = thin(it.pts);
    if (!pts || pts.length < 2) return;
    q.set('p' + sfx, encode(pts));
    if (it.title) q.set('t' + sfx, it.title);
    if (it.date) q.set('d' + sfx, it.date);
    if (it.sport) q.set('s' + sfx, it.sport);
    if (it.dist) q.set('k' + sfx, String(Math.round(it.dist)));
  });
  if (view) { q.set('c', view.lat.toFixed(5) + ',' + view.lng.toFixed(5)); q.set('z', String(Math.round(view.z * 10) / 10)); }
  q.set('r', WEB && typeof location !== 'undefined' ? location.origin + '/' : SPUR_URL);
  return base + '#' + q.toString();
}
