import { h, Fragment } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { useData, ActRow, link3d } from './common.jsx';
import { unmerc } from '../geo.js';
import { Chips, Seg, Icon, sportColor } from '../ui/kit.jsx';
import { MapView, HEAT_LEGEND, appleMapsUrl } from '../ui/map.jsx';
import { ATTRIBUTION } from '../ui/basemap.js';
import { decode } from '../geo.js';
import { SPORT_ORDER, SPORTS } from '../sports.js';
import { today } from '../format.js';
import { addDays, periodOf } from '../analysis.js';

const decCache = new Map();
const dec = (a) => { let p = decCache.get(a.id); if (!p || p.s !== a.poly) { p = { s: a.poly, pts: decode(a.poly) }; decCache.set(a.id, p); } return p.pts; };

let hiCache = { v: -1, items: [] };
export function heatItems(d) {
  if (hiCache.v === d.v) return hiCache.items;
  const items = d.list.filter((a) => a.poly && !a.indoor && !a.excluded).map((a) => ({ id: a.id, pts: dec(a), sport: a.sport, date: a.date, color: sportColor(a.sport) }));
  hiCache = { v: d.v, items };
  return items;
}

export function MapTab() {
  const d = useData();
  const [sport, setSport] = useState('all');
  const [range, setRange] = useState('all');
  const [mode, setMode] = useState('heat');
  const [hits, setHits] = useState(null);
  const core = useRef();
  const all = heatItems(d);
  const now = today();
  const from = range === 'all' ? '0000' : range === '12m' ? addDays(now, -365) : range === 'season' ? periodOf('season', now).start : range === 'year' ? now.slice(0, 4) + '-01-01' : addDays(now, -90);
  const items = useMemo(() => all.filter((x) => (sport === 'all' || x.sport === sport) && x.date >= from), [all, sport, from]);
  const fit = useMemo(() => {
    // dichtestes Gebiet: Median der Startpunkte
    if (!items.length) return null;
    const starts = items.map((x) => x.pts[0]).sort((a, b) => a[0] - b[0]);
    const mid = starts[Math.floor(starts.length / 2)];
    const near = items.filter((x) => Math.abs(x.pts[0][0] - mid[0]) < 0.35 && Math.abs(x.pts[0][1] - mid[1]) < 0.5);
    return (near.length ? near : items).map((x) => x.pts);
  }, [items.length, sport, range]);
  const hitActs = hits ? hits.ids.map((id) => d.byId[id]).filter(Boolean) : [];
  return (
    <div class="view flush">
      <div style="position:relative;flex:1;min-height:0;display:flex">
        <MapView class="map-full" heat={items} mode={mode === 'lines' ? 'lines' : 'heat'} fit={fit} fitKey={sport + range} coreRef={core} scaleTop={150}
          onTap={(r) => setHits(r.ids.length ? r : null)} label={'Heatmap deiner GPS-Aktivitäten, ' + items.length + ' Spuren. Für eine Liste die Aktivitäten-Ansicht verwenden.'} />
        <div class="map-tools">
          <Chips value={sport} onChange={(v) => { setSport(v); setHits(null); }} label="Sportart" options={[['all', 'Alle'], ...SPORT_ORDER.filter((s) => s !== 'gym').map((s) => [s, SPORTS[s].short, sportColor(s)])]} />
          <div class="pad"><Seg value={range} onChange={(v) => { setRange(v); setHits(null); }} label="Zeitraum" options={[['all', 'Alles'], ['12m', '12 Monate'], ['season', 'Saison'], ['year', 'Jahr']]} /></div>
        </div>
        {hits ? (
          <div class="map-panel" role="dialog" aria-label="Aktivitäten an dieser Stelle">
            <div class="ph"><h3>{hitActs.length} {hitActs.length === 1 ? 'Aktivität' : 'Aktivitäten'} an dieser Stelle</h3><button type="button" class="iconbtn" aria-label="Schließen" onClick={() => setHits(null)}><Icon.close /></button></div>
            <div class="pb"><div class="list" style="margin:0 0 8px;box-shadow:none">{hitActs.slice(0, 60).map((a) => <ActRow a={a} />)}</div></div>
          </div>
        ) : (
          <div class="map-foot">
            {mode === 'heat' ? <div class="legend-in" aria-label="Legende: Anzahl Durchfahrten">{HEAT_LEGEND.map(([l, c]) => <span><i style={{ background: c }} />{l}</span>)}</div> : null}
            <div class="row">
              <span class="grow tiny muted">{items.length} Spuren{mode === 'heat' ? ', Farbe = Durchfahrten' : ''} · Spur antippen zeigt die Aktivitäten</span>
              <button type="button" class="btn sec2" style="min-height:34px;padding:4px 10px;font-size:var(--fs-foot)" onClick={() => setMode(mode === 'heat' ? 'lines' : 'heat')} aria-label={mode === 'heat' ? 'Einzelne Spuren zeigen' : 'Häufigkeit zeigen'}>{mode === 'heat' ? 'Einzeln' : 'Häufigkeit'}</button>
            </div>
            <div class="row tiny" style="gap:12px">
              {link3d([{}]) !== null ? <a href="#" onClick={(e) => { const c = core.current; if (!c) return; const [lat, lng] = unmerc(c.view.x, c.view.y); e.currentTarget.href = link3d([], { lat, lng, z: c.view.z }); }} target="_blank" rel="noopener">Ausschnitt in 3D</a> : null}
              <a href={appleMapsUrl(core.current) || 'https://maps.apple.com'} target="_blank" rel="noopener">Satellit in Apple Karten</a>
            </div>
            <div class="tiny faint">{ATTRIBUTION}</div>
          </div>
        )}
      </div>
    </div>
  );
}
