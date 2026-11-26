import { h, Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { GoalRow } from './overview.jsx';
import { useData, ActRow, RouteShape } from './common.jsx';
import { Top, Section, Icon, Seg, Chips, Mark, Cell, Sheet, Stepper, Scale, Note, sportColor } from '../ui/kit.jsx';
import { push, openSheet, closeSheet } from '../nav.js';
import { getState, setDoc, newId, toast } from '../store.js';
import { SPORT_ORDER, SPORTS, sportLabel, dsport, sportIcon } from '../sports.js';
import { aggregate, recurringSegments, recurringClimbs, splitCompare, routeMetric, median } from '../analysis.js';
import { climbCandidates, climbProgress, scanClimbs } from '../climbs.js';
import { labelsNear } from '../ui/basemap.js';
import { hours, km, hm, int, num, monthName, dateMid, dateShort, clock, dur, today, NB } from '../format.js';
import { ACT_SRC } from '../env.js';

export function Activities({ sport: initSport, range, label, tab: initTab }) {
  const d = useData();
  const [tab, setTab] = useState(initTab || 'list');
  const [sport, setSport] = useState(initSport || 'all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(120);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return d.list.filter((a) => (sport === 'all' || dsport(a) === sport) && (!range || (a.date >= range[0] && a.date <= range[1])) && (!qq || (a.name + ' ' + (a.notes || '') + ' ' + (a.place || '') + ' ' + (a.desc || '')).toLowerCase().includes(qq)));
  }, [d, sport, q, range]);
  const groups = useMemo(() => {
    const g = [];
    for (const a of list.slice(0, limit)) {
      const m = a.date.slice(0, 7);
      if (!g.length || g[g.length - 1].m !== m) g.push({ m, items: [] });
      g[g.length - 1].items.push(a);
    }
    return g;
  }, [list, limit]);
  const monthAgg = useMemo(() => {
    const r = {};
    for (const a of list) { const m = a.date.slice(0, 7); (r[m] || (r[m] = [])).push(a); }
    for (const k in r) r[k] = aggregate(r[k]);
    return r;
  }, [list]);
  return (
    <div class="view" style="position:relative">
      <Top title={range ? label || "Aktivitäten" : "Aktivitäten"} back={!!range || !!initSport} large={false} actions={<button type="button" class="iconbtn" aria-label="Neue Einheit erfassen" onClick={openAdd}><Icon.plus /></button>} />
      {!range ? <div class="pad" style="margin-bottom:10px"><Seg value={tab} onChange={setTab} label="Ansicht" options={[['list', 'Einheiten'], ['routes', 'Strecken'], ['climbs', 'Anstiege']]} /></div> : null}
      {tab === 'list' ? (
        <Fragment>
          <div class="search"><Icon.search /><input type="search" placeholder="Name, Ort oder Notiz" aria-label="Aktivitäten durchsuchen" value={q} onInput={(e) => setQ(e.target.value)} /></div>
          <Chips value={sport} onChange={setSport} label="Sportart" options={[['all', 'Alle'], ...SPORT_ORDER.filter((s) => d.list.some((a) => dsport(a) === s)).map((s) => [s, SPORTS[s].short, null, sportIcon(s)])]} />
          {sport !== 'all' && !range ? <SportGoals d={d} sport={sport} /> : null}
          {sport === 'gym' ? <div class="pad" style="margin:4px 0 8px"><button type="button" class="btn sec2 wide" onClick={() => push('gym-exercises')}>Übungen und Fortschritt</button></div> : null}
          {range ? <div class="subhead">{dateMid(range[0])} – {dateMid(range[1])} · {list.length} Einheiten</div> : null}
          {!list.length ? <div class="empty"><h3>Keine Einheiten</h3>{q ? 'Keine Treffer für „' + q + '".' : 'Für diese Auswahl gibt es noch nichts.'}</div> : null}
          {groups.map((g) => (
            <Fragment>
              <div class="sec"><h2>{monthName(g.m)}</h2><span class="small muted num">{monthAgg[g.m].count} · {hours(monthAgg[g.m].time)}{monthAgg[g.m].gain ? ' · ' + hm(monthAgg[g.m].gain) + ' Hm' : ''}</span></div>
              <div class="list">{g.items.map((a) => <ActRow a={a} />)}</div>
            </Fragment>
          ))}
          {list.length > limit ? <div class="pad" style="margin-top:12px"><button type="button" class="btn sec2 wide" onClick={() => setLimit(limit + 200)}>Weitere {Math.min(200, list.length - limit)} laden</button></div> : null}
        </Fragment>
      ) : tab === 'routes' ? <RouteList d={d} /> : <ClimbList d={d} />}
      <div class="spacer" />
    </div>
  );
}

function SportGoals({ d, sport }) {
  const goals = Object.values(getState().goals).filter((g) => g.sport === sport || (g.kind === 'segment' && d.segIdx[g.segId] && d.segIdx[g.segId].efforts.some((e) => e.sport === sport)));
  if (!goals.length) return null;
  return <div class="list" style="margin-bottom:10px">{goals.map((g) => <GoalRow g={g} d={d} />)}</div>;
}

function openAdd() {
  openSheet(() => (
    <Sheet title="Neu erfassen">
      <button type="button" class="btn wide" onClick={() => { closeSheet(); startGym(); }}>Gym-Einheit starten</button>
      <button type="button" class="btn sec2 wide" onClick={() => { closeSheet(); openSheet(() => <ManualForm />); }}>Aktivität ohne Aufzeichnung erfassen</button>
      <button type="button" class="btn sec2 wide" onClick={() => { closeSheet(); push('gym-templates'); }}>Gym-Vorlagen verwalten</button>
      <div class="tiny faint">{'Aufgezeichnete Aktivitäten kommen automatisch aus ' + ACT_SRC + '. Eine Gym-Einheit kannst du später mit der passenden Aufzeichnung verknüpfen, damit sie nur einmal zählt.'}</div>
    </Sheet>
  ));
}

export function startGym(templateId) {
  const S = getState();
  const tpl = templateId ? S.gymtpl[templateId] : null;
  const id = newId('s');
  const now = new Date();
  const doc = {
    id, date: today(), start: today() + 'T' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':00',
    title: tpl ? tpl.name : 'Gym-Einheit', tpl: templateId || null,
    exercises: tpl ? tpl.exercises.map((e) => ({ name: e.name, kind: e.kind || 'weight', sets: [] })) : [], linked: null, createdAt: Date.now(),
  };
  setDoc('gym/' + id, doc);
  push('gym', { id }, 'activities');
}

function ManualForm() {
  const [f, setF] = useState({ name: '', sport: 'snowboard', date: today(), mins: 60, dist: null, gain: null, rpe: null, notes: '' });
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = () => {
    const id = newId('m-');
    setDoc('manual/' + id, { id, name: f.name || sportLabel(f.sport), sport: f.sport, date: f.date, start: f.date + 'T10:00:00', mov: (f.mins || 0) * 60, dist: (f.dist || 0) * 1000, gain: f.gain || 0, rpe: f.rpe, notes: f.notes, createdAt: Date.now() });
    closeSheet();
    toast('Aktivität gespeichert (manuell)');
  };
  return (
    <Sheet title="Aktivität ohne Aufzeichnung">
      <div class="field"><label for="mf-name">Name</label><input id="mf-name" class="input" value={f.name} onInput={(e) => set('name', e.target.value)} placeholder={sportLabel(f.sport)} /></div>
      <div class="field"><label for="mf-sport">Sportart</label><select id="mf-sport" class="input" value={f.sport} onChange={(e) => set('sport', e.target.value)}>{SPORT_ORDER.map((s) => <option value={s}>{sportLabel(s)}</option>)}</select></div>
      <div class="field"><label for="mf-date">Datum</label><input id="mf-date" class="input" type="date" value={f.date} onInput={(e) => set('date', e.target.value)} /></div>
      <Stepper id="mf-min" label="Dauer" unit="min" value={f.mins} step={5} onChange={(v) => set('mins', v)} />
      <div class="row"><div class="grow"><Stepper id="mf-km" label="Distanz" unit="km" value={f.dist} step={1} decimals={1} onChange={(v) => set('dist', v)} /></div><div class="grow"><Stepper id="mf-hm" label="Höhenmeter" unit="Hm" value={f.gain} step={50} onChange={(v) => set('gain', v)} /></div></div>
      <Scale label="Anstrengung" value={f.rpe} onChange={(v) => set('rpe', v)} labels={RPE_LABELS} />
      <div class="field"><label for="mf-n">Notiz</label><textarea id="mf-n" class="input" value={f.notes} onInput={(e) => set('notes', e.target.value)} /></div>
      <button type="button" class="btn wide" onClick={save}>Speichern</button>
      <div class="tiny faint">Wird als „manuell" gekennzeichnet und zählt im Trainingsumfang mit.</div>
    </Sheet>
  );
}

export const RPE_LABELS = ['1 · sehr leicht', '2 · leicht', '3 · locker', '4 · moderat', '5 · etwas fordernd', '6 · fordernd', '7 · intensiv', '8 · sehr intensiv', '9 · fast maximal', '10 · maximal'];

function RouteList({ d }) {
  const fav = (getState().routes.main || {}).fav || [];
  const cl = d.clusters.filter((c) => c.members.length >= 2).sort((a, b) => (fav.includes(b.key) - fav.includes(a.key)) || b.members.length - a.members.length);
  if (!cl.length) return <div class="empty"><h3>Noch keine wiederkehrenden Strecken</h3>Sobald du eine Strecke zweimal in derselben Richtung fährst oder gehst, erscheint sie hier.</div>;
  return (
    <Fragment>
      <div class="subhead">Aus den GPS-Spuren erkannt: gleiche Strecke und Richtung, kleine Abweichungen toleriert.</div>
      <div class="list">
        {cl.map((c) => {
          const M = routeMetric(c);
          const vals = c.members.map(M.get).filter((v) => v != null);
          const best = M.higherBetter ? Math.max(...vals) : Math.min(...vals);
          return (
            <Cell onClick={() => push('route', { key: c.key })} left={<RouteShape pts={c.sig.r} color={sportColor(c.sport)} w={48} hgt={40} />}
              title={(fav.includes(c.key) ? '★ ' : '') + c.name + (c.indoor ? ' · indoor' : '')}
              sub={c.members.length + '× · ' + km(c.medLen) + ' km · zuletzt ' + dateShort(c.members[0].date)}
              right={<Fragment><b>{M.fmt(median(vals))}</b><div class="faint tiny">Best {M.fmt(best)}</div></Fragment>} />
          );
        })}
      </div>
    </Fragment>
  );
}

// Wiederkehrende Anstiege: ohne Strava kommen sie aus den eigenen Aufzeichnungen.
const climbNames = new Map();
function useClimbName(g) {
  const [n, setN] = useState(() => climbNames.get(g.id));
  useEffect(() => {
    if (n !== undefined) return;
    let alive = true;
    // Name aus der Offline-Karte: Gipfel oder Joch am Ende des Anstiegs, sonst der nächste Ort
    labelsNear(g.b[0], g.b[1], 2500, ['peak', 'saddle', 'place']).then((ls) => {
      const top = ls.find((l) => (l.kind === 'peak' || l.kind === 'saddle') && l.dist <= 800);
      const place = ls.filter((l) => l.kind === 'place').sort((x, y) => x.dist - y.dist)[0];
      const nm = top ? top.name : place ? 'nach ' + place.name : '';
      climbNames.set(g.id, nm);
      if (alive) setN(nm);
    }).catch(() => { climbNames.set(g.id, ''); if (alive) setN(''); });
    return () => { alive = false; };
  }, [g.id]);
  return n || '';
}
const climbTitle = (g, name) => (name ? name.replace(/^nach /, 'Anstieg nach ') : km(g.dist) + NB + 'km · ' + hm(g.gain) + NB + 'Hm');

function ClimbRow({ g }) {
  const name = useClimbName(g);
  return (
    <Cell onClick={() => openSheet(() => <ClimbSheet g={g} name={name} />, 'Anstieg')}
      left={<span class="pill" style="width:44px;justify-content:center">{num(g.grade * 100, 0)}{NB}%</span>}
      title={climbTitle(g, name)}
      sub={g.n + '× · ' + km(g.dist) + NB + 'km · ' + hm(g.gain) + NB + 'Hm'}
      right={<Fragment><b>{g.best && g.best.mt ? clock(g.best.mt) : '–'}</b><div class="faint tiny">{g.median ? 'Median ' + clock(g.median) : ''}</div></Fragment>} />
  );
}

function ClimbSheet({ g, name }) {
  const cmp = splitCompare(g.efforts.filter((e) => e.mt > 0), (e) => e.mt);
  const efforts = g.efforts.slice().reverse();
  return (
    <Sheet title={climbTitle(g, name)}>
      <div class="pad">
        <div class="stats three">
          <div class="stat"><div class="v">{km(g.dist)}<small>km</small></div><div class="l">Länge</div></div>
          <div class="stat"><div class="v">{hm(g.gain)}<small>Hm</small></div><div class="l">Aufstieg</div></div>
          <div class="stat"><div class="v">{num(g.grade * 100, 1)}<small>%</small></div><div class="l">Ø Steigung</div></div>
        </div>
        <div class="small muted" style="margin-top:10px">
          {g.n}× aufgezeichnet{g.best && g.best.mt ? ', beste Zeit ' + clock(g.best.mt) + ' (' + dateShort(g.best.date) + ')' : ''}{g.median ? ', Median ' + clock(g.median) : ''}.
          {cmp ? ' Die letzten ' + cmp.k + ' gegen die ' + cmp.k + ' davor: ' + (Math.abs(cmp.diff) < 15 ? 'gleich schnell' : (cmp.diff < 0 ? clock(Math.abs(cmp.diff)) + ' schneller' : clock(Math.abs(cmp.diff)) + ' langsamer')) + '.' : ''}
        </div>
        <div class="list" style="margin-top:12px">
          {efforts.map((e) => (
            <Cell onClick={() => { closeSheet(); push('activity', { id: e.act }); }}
              title={e.mt > 0 ? clock(e.mt) : 'keine Zeit'}
              sub={dateShort(e.date) + (e.vam ? ' · ' + int(e.vam) + NB + 'Hm/h' : '')}
              right={e === g.best ? <span class="pill">beste</span> : null} />
          ))}
        </div>
        <div class="tiny faint" style="margin-top:12px">Aus deinen eigenen Aufzeichnungen erkannt: Anstiege ab 50 Hm und 400 m. Als derselbe Anstieg gilt, was mit höchstens 250 m Abstand an Start und Gipfel und ähnlicher Länge wieder vorkommt. Gefahrene Zeit ohne Pausen.</div>
      </div>
    </Sheet>
  );
}

function ClimbList({ d }) {
  const S = getState();
  const segs = recurringSegments(d.segIdx, 3);
  const marks = ((S.routes.main || {}).marks || []);
  const groups = useMemo(() => recurringClimbs(d.climbIdx || [], 3), [d.v, d.climbIdx]);
  const near = useMemo(() => recurringClimbs(d.climbIdx || [], 2).filter((g) => g.n === 2), [d.v, d.climbIdx]);
  const prog = climbProgress(d.list);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);
  const stop = useRef(false);
  const start = async () => {
    stop.current = false;
    setBusy(true);
    setRun({ done: 0, total: prog.rest.length });
    try { await scanClimbs(prog.rest, { onProgress: setRun, shouldStop: () => stop.current }); } catch (e) { toast('Auswertung abgebrochen'); }
    setBusy(false);
    setRun(null);
  };
  const left = prog.total - prog.done;
  return (
    <Fragment>
      <div class="subhead">Anstiege, die du mindestens dreimal gefahren oder gegangen bist – aus deinen eigenen Aufzeichnungen erkannt, dazu deine markierten Teilstrecken.</div>
      {marks.length ? (
        <Section title="Eigene Teilstrecken">
          <div class="list">{marks.map((m) => <Cell onClick={() => push('mark', { id: m.id })} left={<Mark sport={m.sport || 'mtb'} sm />} title={m.name} sub={(m.kind === 'trail' ? 'Trail / Abfahrt' : 'Anstieg') + ' · ' + Object.keys(m.results || {}).length + ' Zeiten'} />)}</div>
        </Section>
      ) : null}
      <Section title="Anstiege aus deinen Fahrten">
        {groups.length ? <div class="list">{groups.slice(0, 60).map((g) => <ClimbRow g={g} />)}</div> : null}
        {!groups.length && !left ? <div class="empty">Noch kein Anstieg dreimal aufgezeichnet.{near.length ? ' ' + near.length + ' ' + (near.length === 1 ? 'Anstieg wurde' : 'Anstiege wurden') + ' bisher zweimal gefahren.' : ''}</div> : null}
        {left ? (
          <div class="card p stack" style="gap:10px;margin-top:10px">
            <div class="small">{prog.done ? prog.done + ' von ' + prog.total + ' Aufzeichnungen ausgewertet.' : 'Noch nichts ausgewertet.'} Für die restlichen {left} lädt die App die Höhen- und Streckendaten und sucht darin die Anstiege.</div>
            {busy && run ? (
              <Fragment>
                <div class="gbar"><div class="tr"><div class="fl" style={{ width: Math.round(((run.done || 0) / Math.max(1, run.total)) * 100) + '%' }} /></div></div>
                <div class="small muted">{run.done} von {run.total} · {run.found || 0} Anstiege gefunden{run.failed ? ' · ' + run.failed + ' ohne Daten' : ''}</div>
                <button type="button" class="btn sec2" onClick={() => { stop.current = true; }}>Anhalten</button>
              </Fragment>
            ) : (
              <button type="button" class="btn" onClick={start}>Aufzeichnungen auswerten</button>
            )}
            <div class="tiny faint">Läuft nur, solange diese Seite offen ist. Zwischenstände bleiben gespeichert, du kannst jederzeit anhalten und später weitermachen.</div>
          </div>
        ) : null}
      </Section>
      {segs.length ? (
        <Section title="Strava-Segmente">
          <div class="list">
            {segs.slice(0, 80).map((s) => (
              <Cell onClick={() => push('segment', { id: s.id })} left={<span class="pill" style="width:44px;justify-content:center">{s.kind === 'climb' ? num(s.grade * 100, 0) + ' %' : s.kind === 'descent' ? '↘' : '→'}</span>}
                title={s.name}
                sub={s.efforts.length + '× · ' + km(s.dist) + ' km · ' + hm(s.gain) + ' Hm'}
                right={<Fragment><b>{clock(s.best.mt)}</b><div class="faint tiny">Median {clock(s.median)}</div></Fragment>} />
            ))}
          </div>
        </Section>
      ) : null}
    </Fragment>
  );
}
