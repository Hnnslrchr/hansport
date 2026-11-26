import { h, Fragment } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { useData, ActRow, zoneHist, gearName, SPUR3D_DEFAULT } from './common.jsx';
import { GoalRow, unitOf } from './overview.jsx';
import { Top, Section, Icon, Sheet, Stepper, Note, Cell, Mark, Seg, Progress, sportColor, Stat } from '../ui/kit.jsx';
import { HBars } from '../ui/charts.jsx';
import { GBar } from '../ui/r4.jsx';
import HansportLogo from '../ui/HansportLogo.jsx';
import { MapView } from '../ui/map.jsx';
import { push, pop, openSheet, closeSheet } from '../nav.js';
import { getState, setDoc, patchDoc, delDoc, newId, toast, COLLS } from '../store.js';
import { caps, kvDel } from '../platform.js';
import { monthlyReview, goalProgress, aggregate } from '../analysis.js';
import { SPORT_ORDER, sportLabel } from '../sports.js';
import { km, hm, int, num, hours, dur, dateShort, dateMid, monthName, today } from '../format.js';
import { heatItems } from './mapview.jsx';
import { doSync } from './overview.jsx';
import { hav } from '../geo.js';
import { WEB } from '../env.js';
import { WebConnections, WebImport } from '../web/views.jsx';
import { gearInfo, gearTotals, odometerAt, gearSeed, LOG_KINDS, logKindName } from '../gear.js';

export function More() {
  return (
    <div class="view">
      <div class="hp-hero" style="padding-top:18px"><div style="flex:1"><div class="hp-lbl">hansport</div><h1>Mehr</h1></div></div>
      <div class="list">
        <Cell onClick={() => push('overview')} title="Erkenntnisse und Entwicklung" sub="Vergleiche, Strecken, Anstiege, Ziele" />
        <Cell onClick={() => push('reviews')} title="Monatsrückblicke" sub="Jeder Monat mit Vergleich zum Vormonat" />
        <Cell onClick={() => push('goals')} title="Ziele" sub="Höhenmeter, Stunden, Anstiege …" />
        <Cell onClick={() => push('gear')} title="Ausrüstung" sub="Räder, Kilometer, Wartung" />
        <Cell onClick={() => push('gym-exercises')} title="Krafttraining" sub="Übungen, Fortschritt, Vorlagen" />
      </div>
      <div class="list" style="margin-top:14px">
        {WEB ? <Cell onClick={() => push('sources')} title="Datenquellen" sub="Status und letzter Abgleich" /> : null}
        <Cell onClick={() => push('settings')} title="Zonen und Einstellungen" />
        <Cell onClick={() => push('share')} title="Karte teilen" sub="Mit Privatzone um Start und Ziel" />
        <Cell onClick={() => push('data')} title="Daten und Datenschutz" sub="Export, Löschen, Abgleich" />
        <Cell onClick={() => push('about-insights')} title="Wie Erkenntnisse entstehen" />
        <Cell onClick={() => push('guide')} title="Über hansport und Anleitung" sub="Version, Datenquellen, Kurzanleitung" />
      </div>
      <div class="spacer" />
    </div>
  );
}

// ---------- Ziele ----------
export function Goals() {
  const d = useData();
  const goals = Object.values(getState().goals).sort((a, b) => (a.created || 0) - (b.created || 0));
  return (
    <div class="view">
      <Top title="Ziele" actions={<button type="button" class="iconbtn" aria-label="Neues Ziel" onClick={() => openSheet(() => <GoalSheet />)}><Icon.plus /></button>} />
      {goals.length ? (
        <div class="list">{goals.map((g) => (
          <div>
            <GoalRow g={g} d={d} />
          </div>
        ))}</div>
      ) : <div class="empty"><h3>Noch keine Ziele</h3>Zum Beispiel 15.000 Höhenmeter MTB in der Sommersaison oder eine Zeit für einen Anstieg (im Anstieg selbst setzen).</div>}
      {goals.length ? <Section title="Bearbeiten"><div class="list">{goals.map((g) => <Cell onClick={() => openSheet(() => <GoalSheet g={g} />)} title={g.title} sub="Ändern oder löschen" />)}</div></Section> : null}
      <div class="subhead" style="margin-top:10px">Fortschritt rechnet nur mit Aktivitäten, die nicht ausgeblendet sind. „Im Plan" vergleicht mit dem anteiligen Ziel bis heute.</div>
      <div class="spacer" />
    </div>
  );
}

function GoalSheet({ g }) {
  const [f, setF] = useState(g || { metric: 'gain', per: 'season', sport: 'mtb', target: 10000 });
  const set = (k, v) => setF({ ...f, [k]: v });
  if (g && g.kind === 'segment') {
    return (
      <Sheet title="Ziel">
        <div class="small">{g.title}</div>
        <button type="button" class="btn sec2 wide" onClick={() => { closeSheet(); push('segment', { id: g.segId }); }}>Anstieg öffnen</button>
        <button type="button" class="btn danger wide" onClick={() => { delDoc('goals/' + g.id); closeSheet(); }}>Ziel löschen</button>
      </Sheet>
    );
  }
  const title = (f.sport ? sportLabel(f.sport) + ': ' : '') + num(f.target, 0) + ' ' + unitOf(f) + ' ' + { week: 'pro Woche', month: 'pro Monat', season: 'in der Saison', year: 'im Jahr' }[f.per];
  return (
    <Sheet title={g ? 'Ziel bearbeiten' : 'Neues Ziel'}>
      <div class="field"><label for="go-s">Sportart</label><select id="go-s" class="input" value={f.sport || ''} onChange={(e) => set('sport', e.target.value || null)}><option value="">Alle</option>{SPORT_ORDER.map((s) => <option value={s}>{sportLabel(s)}</option>)}</select></div>
      <div class="field"><label for="go-m">Kennzahl</label><select id="go-m" class="input" value={f.metric} onChange={(e) => set('metric', e.target.value)}><option value="gain">Höhenmeter</option><option value="dist">Kilometer</option><option value="time">Stunden</option><option value="days">Aktive Tage</option><option value="count">Einheiten</option></select></div>
      <Seg value={f.per} onChange={(v) => set('per', v)} label="Zeitraum" options={[['week', 'Woche'], ['month', 'Monat'], ['season', 'Saison'], ['year', 'Jahr']]} />
      <Stepper id="go-t" label="Ziel" unit={unitOf(f)} value={f.target} step={f.metric === 'gain' ? 500 : f.metric === 'dist' ? 50 : f.metric === 'time' ? 5 : 1} max={1000000} onChange={(v) => set('target', v)} />
      <div class="small muted">{title}</div>
      <button type="button" class="btn wide" onClick={() => { const id = (g && g.id) || newId('g'); setDoc('goals/' + id, { ...f, id, kind: 'volume', title, created: (g && g.created) || Date.now() }); closeSheet(); }}>Speichern</button>
      {g ? <button type="button" class="btn danger wide" onClick={() => { delDoc('goals/' + g.id); closeSheet(); }}>Löschen</button> : null}
    </Sheet>
  );
}

// ---------- Ausrüstung ----------
const GEAR_KINDS = [['bike', 'Rad'], ['snowboard', 'Snowboard'], ['splitboard', 'Splitboard'], ['shoes', 'Schuhe'], ['other', 'Sonstiges']];
const NB = ' ';
const hmin2 = (sec) => { const m = Math.round((sec || 0) / 60); return [Math.floor(m / 60), m % 60]; };
const asOfTxt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
function GearStats({ t }) {
  const [hh, mm] = hmin2(t.mov);
  return (
    <div class="stats two gear-stats">
      <Stat v={km(t.dist)} u="km" l="draußen" />
      <Stat v={hm(t.gain)} u="Hm" l="Höhenmeter" />
      <div class="stat"><div class="v">{int(hh)}<small>h</small> {mm}<small>min</small></div><div class="l">Fahrzeit</div></div>
      <Stat v={int(t.n)} l={t.n === 1 ? 'Fahrt' : 'Fahrten'} />
    </div>
  );
}
function statsFor(list, id, g) {
  if (g && g.base) return gearTotals(list, id, g);
  const acts = list.filter((a) => a.gear === id && !a.excluded && !a.indoor);
  return { dist: acts.reduce((s, a) => s + (a.dist || 0), 0), gain: acts.reduce((s, a) => s + (a.gain || 0), 0), mov: acts.reduce((s, a) => s + (a.mov || 0), 0), n: acts.length, acts };
}
export function GearList() {
  const d = useData();
  const S = getState();
  const meta = S.meta.gear || {};
  const own = Object.values(S.gear);
  const row = (id, name, sub, retired) => {
    const { g } = gearInfo(id);
    const t = statsFor(d.list, id, g);
    const due = dueOf(g, null, d, id);
    const [hh] = hmin2(t.mov);
    return <Cell onClick={() => push('gear-item', { id })} title={name + (retired ? ' (ausgemustert)' : '')} sub={(t.n ? km(t.dist) + NB + 'km · ' + hm(t.gain) + NB + 'Hm · ' + int(hh) + NB + 'h · ' + t.n + ' ' + (t.n === 1 ? 'Fahrt' : 'Fahrten') : 'noch keine Fahrt') + (sub ? ' · ' + sub : '')} right={due ? <span class={'pill' + (due.over ? ' warn' : '')}>{due.text}</span> : null} />;
  };
  const bikesOwn = own.filter((g) => g.kind === 'bike');
  const other = own.filter((g) => g.kind !== 'bike');
  const seed = gearSeed();
  return (
    <div class="view">
      <Top title="Ausrüstung" actions={<button type="button" class="iconbtn" aria-label="Ausrüstung hinzufügen" onClick={() => openSheet(() => <GearSheet />)}><Icon.plus /></button>} />
      <Section title="Räder">
        {(meta.bikes || []).length || bikesOwn.length ? <div class="list">{(meta.bikes || []).map((b) => row(b.id, b.name, b.frame ? frameName(b.frame) : '', b.retired))}{bikesOwn.map((g) => row(g.id, g.name, g.role === 'mtb' ? 'MTB' : g.role === 'road' ? 'Rennrad' : ''))}</div> : <div class="card p small muted">Noch keine Räder.</div>}
      </Section>
      {(meta.shoes || []).length ? <Section title="Schuhe aus Strava"><div class="list">{meta.shoes.map((b) => row(b.id, b.name, '', b.retired))}</div></Section> : null}
      <Section title="Weitere Ausrüstung" action="Hinzufügen" onAction={() => openSheet(() => <GearSheet />)}>
        {other.length ? <div class="list">{other.map((g) => row(g.id, g.name, GEAR_KINDS.find((k) => k[0] === g.kind)?.[1]))}</div> : <div class="card p small muted">Zum Beispiel Snowboard oder Wanderschuhe.</div>}
      </Section>
      <div class="subhead" style="margin-top:8px">{seed ? 'Startwerte Stand ' + asOfTxt(seed.asOf) + ', danach kommt jede neue Fahrt dazu. Ohne Zuordnung: MTB → Scalpel, Rennrad draußen → SuperSix. ' : ''}Indoor zählt nicht. Die Zuordnung änderst du in der Aktivität.</div>
      <div class="spacer" />
    </div>
  );
}
// Bewegungszeit in Stunden (unter 10 h mit einer Nachkommastelle)
const hTot = (sec) => num((sec || 0) / 3600, sec < 36000 ? 1 : 0);
const frameName = (f) => ({ 1: 'MTB', 2: 'Cross', 3: 'Rennrad', 4: 'Zeitfahrrad', 5: 'Gravel' }[f] || '');

function dueOf(g, x, d, id) {
  const r = g && g.reminder;
  if (!r || !r.every) return null;
  const since = r.since || '0000';
  const acts = d.list.filter((a) => a.gear === id && !a.excluded && a.date >= since);
  const v = r.unit === 'km' ? acts.reduce((s, a) => s + (a.indoor ? 0 : a.dist || 0), 0) / 1000 : r.unit === 'days' ? new Set(acts.map((a) => a.date)).size : acts.length;
  const left = r.every - v;
  return { over: left <= 0, v, left, text: left <= 0 ? (r.what || 'Wartung') + ' fällig' : 'noch ' + num(left, 0) + ' ' + ({ km: 'km', days: 'Tage', tours: 'Touren' }[r.unit]) };
}

export function GearItem({ id }) {
  const d = useData();
  const S = getState();
  const { own, extra, sb, g } = gearInfo(id);
  const t = statsFor(d.list, id, g);
  const acts = d.list.filter((a) => a.gear === id && !a.excluded);
  const due = dueOf(g, null, d, id);
  // Letzter Service: jüngster Eintrag „Service“ oder Neustart der Erinnerung
  const lastSvc = [...(g.log || []).filter((l) => !l.kind || l.kind === 'service').map((l) => l.date), g.reminder && g.reminder.since].filter(Boolean).sort().pop() || null;
  const sinceA = lastSvc ? acts.filter((a) => a.date >= lastSvc && !a.indoor) : [];
  const sinceT = { dist: sinceA.reduce((s2, a) => s2 + (a.dist || 0), 0), gain: sinceA.reduce((s2, a) => s2 + (a.gain || 0), 0), mov: sinceA.reduce((s2, a) => s2 + (a.mov || 0), 0), n: sinceA.length };
  const save = (p) => {
    if (own) patchDoc('gear/' + id, p);
    else { const cur = S.settings.main || {}; setDoc('settings/main', { ...cur, gearMeta: { ...(cur.gearMeta || {}), [id]: { ...extra, ...p } } }); }
  };
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('service');
  const [ldate, setLdate] = useState(today());
  const log = (g.log || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  // Abgleich mit dem Strava-Gesamtwert (Stand des letzten Strava-Abgleichs)
  const stravaAt = S.meta.gear && S.meta.gear.at ? new Date(S.meta.gear.at).toISOString().slice(0, 10) : null;
  const cmp = sb && sb.dist && stravaAt ? odometerAt(d.list, id, g, stravaAt) - sb.dist : null;
  const add = () => { const text = note.trim(); if (!text) return; save({ log: [...(g.log || []), { date: ldate, kind, text, km: Math.round(odometerAt(d.list, id, g, ldate) / 1000) }] }); setNote(''); toast('Eingetragen'); };
  return (
    <div class="view">
      <Top title="Ausrüstung" actions={own ? <button type="button" class="iconbtn" aria-label="Bearbeiten" onClick={() => openSheet(() => <GearSheet g={own} />)}><Icon.edit /></button> : null} />
      <div class="pad" style="margin-bottom:8px"><h1 style="font-family:var(--display);font-size:var(--fs-t1)">{g.name}</h1><div class="small muted">{[sb ? 'aus Strava' : GEAR_KINDS.find((k) => k[0] === g.kind)?.[1], g.role === 'mtb' ? 'MTB' : g.role === 'road' ? 'Rennrad' : null, g.base ? 'Startwerte ' + asOfTxt(g.base.asOf) + (t.newN ? ' + ' + t.newN + ' neue ' + (t.newN === 1 ? 'Fahrt' : 'Fahrten') : '') : null].filter(Boolean).join(' · ')}</div></div>
      <div class="card p"><GearStats t={t} /></div>
      {cmp != null ? <div class="subhead" style="margin-top:8px">{Math.abs(cmp) < 1000 ? 'Stimmt mit Strava überein: ' + km(sb.dist) + NB + 'km, Stand ' + asOfTxt(stravaAt) + '.' : 'Abweichung zu Strava: ' + (cmp > 0 ? '+' : '−') + km(Math.abs(cmp)) + NB + 'km. Strava ' + km(sb.dist) + NB + 'km, Stand ' + asOfTxt(stravaAt) + '.'}</div> : null}
      <Section title={'Seit dem letzten Service' + (lastSvc ? ' · ' + dateMid(lastSvc) : '')}>
        <div class="card p">
          {lastSvc ? <GearStats t={sinceT} /> : <div class="small muted">Noch kein Service eingetragen.</div>}
        </div>
      </Section>
      <Section title="Erinnerung">
        <div class="card p stack" style="gap:8px">
          {due ? <div class="g-akt"><div class="small" style={due.over ? 'font-weight:600' : ''}>{(g.reminder.what || 'Wartung')}: {due.text}, seit {g.reminder.since ? dateMid(g.reminder.since) : 'Beginn'}</div><GBar value={due.v} max={g.reminder.every} left={num(due.v, 0) + ' von ' + num(g.reminder.every, 0) + ' ' + ({ km: 'km', days: 'Tagen', tours: 'Touren' }[g.reminder.unit] || '')} right={Math.min(100, Math.round((due.v / g.reminder.every) * 100)) + ' %'} label={'Service-Intervall ' + Math.round((due.v / g.reminder.every) * 100) + ' Prozent'} /></div> : <div class="small muted">Keine Erinnerung.</div>}
          <button type="button" class="btn sec2" onClick={() => openSheet(() => <ReminderSheet g={g} save={save} />)}>{due ? 'Erinnerung ändern' : 'Erinnerung einrichten'}</button>
          {due ? <button type="button" class="btn" onClick={() => { save({ reminder: { ...g.reminder, since: today() }, log: [...(g.log || []), { date: today(), kind: 'service', text: (g.reminder.what || 'Wartung') + ' erledigt', km: Math.round(odometerAt(d.list, id, g, today()) / 1000) }] }); toast('Erledigt, Zähler neu gestartet'); }}>Erledigt – Zähler neu starten</button> : null}
        </div>
      </Section>
      <Section title="Wartungslogbuch">
        <div class="card p stack" style="gap:10px">
          {log.length ? log.map((l) => (
            <div class="logrow">
              <div class="grow"><div class="small"><b>{logKindName(l.kind)}</b> · {dateMid(l.date)}{l.km != null ? ' · bei ' + int(l.km) + NB + 'km' : ''}</div><div class="small muted">{l.text}</div></div>
              <button type="button" class="iconbtn" aria-label={'Eintrag vom ' + dateMid(l.date) + ' löschen'} onClick={() => save({ log: (g.log || []).filter((x) => x !== l) })}><Icon.trash /></button>
            </div>
          )) : <div class="small muted">Noch keine Einträge.</div>}
          <Seg value={kind} onChange={setKind} label="Art" options={LOG_KINDS} />
          <div class="row" style="gap:8px">
            <div class="field" style="flex:0 0 auto"><label for="lg-d">Datum</label><input id="lg-d" class="input" type="date" value={ldate} max={today()} onInput={(e) => setLdate(e.target.value || today())} /></div>
            <div class="field grow"><label for="lg-t">Was wurde gemacht?</label><input id="lg-t" class="input" value={note} onInput={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="z. B. Kette gewechselt" /></div>
          </div>
          <div class="tiny faint">Kilometerstand am {dateMid(ldate)}: {km(odometerAt(d.list, id, g, ldate))}{NB}km, wird automatisch eingetragen.</div>
          <button type="button" class="btn" disabled={!note.trim()} onClick={add}>Hinzufügen</button>
        </div>
      </Section>
      <Section title="Fahrten">
        {acts.length ? <div class="list">{acts.slice(0, 30).map((a) => <ActRow a={a} />)}</div> : <div class="card p small muted">{g.base ? 'Neue Fahrten erscheinen hier.' : 'Noch keine Fahrten.'}</div>}
      </Section>
      {own ? <div class="pad" style="margin-top:12px"><button type="button" class="btn danger" onClick={() => { delDoc('gear/' + id); pop(); }}>Ausrüstung löschen</button></div> : null}
      <div class="spacer" />
    </div>
  );
}

function ReminderSheet({ g, save }) {
  const r = g.reminder || {};
  const [f, setF] = useState({ what: r.what || 'Service', unit: r.unit || 'km', every: r.every || 2000, since: r.since || today() });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Sheet title="Erinnerung">
      <div class="field"><label for="rm-w">Was?</label><input id="rm-w" class="input" value={f.what} onInput={(e) => set('what', e.target.value)} placeholder="z. B. Gabelservice, Belag wachsen" /></div>
      <Seg value={f.unit} onChange={(v) => set('unit', v)} label="Zählen nach" options={[['km', 'Kilometer'], ['tours', 'Touren'], ['days', 'Tage']]} />
      <Stepper id="rm-e" label="Alle" unit={{ km: 'km', tours: 'Touren', days: 'Tage' }[f.unit]} value={f.every} step={f.unit === 'km' ? 100 : 1} max={100000} onChange={(v) => set('every', v)} />
      <div class="field"><label for="rm-s">Zählen ab</label><input id="rm-s" class="input" type="date" value={f.since} onInput={(e) => set('since', e.target.value)} /></div>
      <button type="button" class="btn wide" onClick={() => { save({ reminder: f }); closeSheet(); }}>Speichern</button>
      {g.reminder ? <button type="button" class="btn sec2 wide" onClick={() => { save({ reminder: undefined }); closeSheet(); }}>Erinnerung entfernen</button> : null}
    </Sheet>
  );
}

function GearSheet({ g }) {
  const [f, setF] = useState(g || { name: '', kind: 'snowboard', since: today() });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Sheet title={g ? 'Ausrüstung bearbeiten' : 'Ausrüstung hinzufügen'}>
      <div class="field"><label for="gr-n">Name</label><input id="gr-n" class="input" value={f.name} onInput={(e) => set('name', e.target.value)} placeholder="z. B. Splitboard Jones" /></div>
      <div class="field"><label for="gr-k">Art</label><select id="gr-k" class="input" value={f.kind} onChange={(e) => set('kind', e.target.value)}>{GEAR_KINDS.map(([k, l]) => <option value={k}>{l}</option>)}</select></div>
      <div class="field"><label for="gr-s">Im Einsatz seit</label><input id="gr-s" class="input" type="date" value={f.since} onInput={(e) => set('since', e.target.value)} /></div>
      <button type="button" class="btn wide" disabled={!f.name.trim()} onClick={() => { const id = (g && g.id) || newId('gear-'); setDoc('gear/' + id, { ...f, id, name: f.name.trim() }); closeSheet(); }}>Speichern</button>
    </Sheet>
  );
}

// ---------- Monatsrückblicke ----------
export function Reviews() {
  const d = useData();
  const [q, setQ] = useState('');
  const months = useMemo(() => {
    const s = new Set(d.list.map((a) => a.date.slice(0, 7)));
    s.add(today().slice(0, 7));
    return [...s].sort().reverse();
  }, [d.v]);
  const ctx = { acts: d.list, segIdx: d.segIdx, journal: d.journal, edits: getState().edits };
  const items = useMemo(() => months.map((ym) => ({ ym, r: monthlyReview(ym, ctx) })), [d.v]);
  const ql = q.trim().toLowerCase();
  const shown = ql ? items.filter(({ ym, r }) => (monthName(ym) + ' ' + r.summary + ' ' + r.actIds.map((id) => d.byId[id]?.name + ' ' + (d.byId[id]?.notes || '')).join(' ') + ' ' + r.declines.join(' ')).toLowerCase().includes(ql)) : items;
  return (
    <div class="view">
      <Top title="Monatsrückblicke" />
      <div class="pad" style="margin-bottom:8px"><input class="input" type="search" aria-label="Rückblicke durchsuchen" placeholder="Suchen: Monat, Aktivität, Notiz …" value={q} onInput={(e) => setQ(e.target.value)} /></div>
      <div class="list">
        {shown.slice(0, 60).map(({ ym, r }) => (
          <Cell onClick={() => push('review', { ym })} title={monthName(ym) + (r.partial ? ' · Zwischenstand' : '')} sub={r.summary} right={<span class="small">{r.A.days} Tage</span>} />
        ))}
      </div>
      {!shown.length ? <div class="empty">Nichts gefunden. Prüf die Schreibweise oder such nach Ort oder Sportart.</div> : null}
      <div class="spacer" />
    </div>
  );
}

export function Review({ ym }) {
  const d = useData();
  const r = useMemo(() => monthlyReview(ym, { acts: d.list, segIdx: d.segIdx, journal: d.journal, edits: getState().edits }), [d.v, ym]);
  const pm = monthName(r.prevYm);
  const goTo = (n) => { const [y, m] = ym.split('-').map(Number); const x = new Date(y, m - 1 + n, 1); const ny = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); push('review', { ym: ny }); };
  const listActs = r.actIds.map((id) => d.byId[id]).filter(Boolean);
  return (
    <div class="view">
      <Top title="Rückblick" />
      <div class="pad row" style="margin-bottom:6px"><button type="button" class="iconbtn" aria-label="Vormonat" onClick={() => goTo(-1)}>‹</button><h1 class="grow" style="font-family:var(--display);font-size:var(--fs-t1);text-align:center">{monthName(ym)}</h1><button type="button" class="iconbtn" aria-label="Folgemonat" disabled={ym >= today().slice(0, 7)} onClick={() => goTo(1)}>›</button></div>
      {r.partial ? <div style="margin-bottom:8px"><Note>Zwischenstand nach {r.day} Tagen. Verglichen wird mit den ersten {r.day} Tagen im {pm}.</Note></div> : null}
      <div class="card p"><p style="margin:0">{r.summary}</p></div>
      <Section title={'Gegenüber ' + pm + (r.partial ? ' (gleich viele Tage)' : '')}>
        <div class="card" style="padding:4px 10px">
          <table class="table nw">
            <thead><tr><th></th><th>{monthName(ym).split(' ')[0]}</th><th>{pm.split(' ')[0]}</th><th>Änderung</th></tr></thead>
            <tbody>{r.changes.map((c) => <tr><td>{c.label}</td><td><b>{c.f(c.a)}</b></td><td>{c.f(c.b)}</td><td>{c.diff === 0 ? '±0' : (c.diff > 0 ? '▲ +' : '▼ −') + (c.rel != null ? Math.round(Math.abs(c.rel) * 100) + ' %' : c.f(Math.abs(c.diff)))}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>
      <Section title="Sportarten">
        <div class="card p">
          <HBars rows={r.sportRows.map((x) => ({ key: x.s, label: sportLabel(x.s), value: x.a, prev: x.b, color: sportColor(x.s), sub: x.ac + ' Einheiten (' + pm.split(' ')[0] + ': ' + x.bc + ')' }))} fmt={hours} onSelect={(row) => push('activities', { sport: row.key, range: [r.start, r.end], label: monthName(ym) })} />
          <div class="chart-sum">Balken: Trainingszeit. Strich: {pm.split(' ')[0]}.</div>
          {r.seasonNote ? <div class="small" style="margin-top:8px">{r.seasonNote}</div> : null}
        </div>
      </Section>
      {r.declines.length ? (
        <Section title="Weniger als im Vormonat">
          <div class="note warn"><Icon.warn /><div><ul style="margin:0;padding-left:16px">{r.declines.map((x) => <li>{x}</li>)}</ul><div class="tiny" style="margin-top:6px">Grundlage: alle nicht ausgeblendeten Aktivitäten, {r.start} bis {r.end} gegen {r.prevRange[0]} bis {r.prevRange[1]}.{breaksIn(r) ? ' Eingetragene Pausen: ' + breaksIn(r) + '.' : ''}</div></div></div>
        </Section>
      ) : null}
      {r.segBests.length || r.prs.length ? (
        <Section title="Bestleistungen">
          <div class="list">
            {r.segBests.map(({ seg, e }) => <Cell onClick={() => push('segment', { id: seg.id })} title={seg.name} sub={'Neue Bestzeit ' + Math.floor(e.mt / 60) + ':' + String(e.mt % 60).padStart(2, '0') + ' min · ' + dateShort(e.date)} />)}
            {r.prs.map((a) => <Cell onClick={() => push('activity', { id: a.id })} title={a.name} sub={a.pr + ' Strava-Bestleistungen · ' + dateShort(a.date)} />)}
          </div>
        </Section>
      ) : null}
      {r.highlights.length ? <Section title="Auffällig"><div class="list">{r.highlights.map((x) => <ActRow a={x.act} sub={x.label + ': ' + x.value + ' · ' + dateShort(x.act.date)} />)}</div></Section> : null}
      {r.media.length ? (
        <Section title="Fotos">
          <div class="card p"><div class="media">{r.media.slice(0, 9).map(({ act, m }) => <button type="button" class="m" style="border:0;padding:0" onClick={() => push('activity', { id: act.id })} aria-label={'Foto aus ' + act.name}>{m.type === 'video' ? <video src={m.url} preload="metadata" muted /> : <img src={m.url} alt="" loading="lazy" />}</button>)}</div></div>
        </Section>
      ) : null}
      <Section title={'Alle Einheiten (' + listActs.length + ')'}>
        <div class="list">{listActs.map((a) => <ActRow a={a} />)}</div>
      </Section>
      {r.jDays ? <div class="subhead" style="margin-top:8px">{r.jDays} Journaleinträge in diesem Monat.</div> : null}
      <div class="spacer" />
    </div>
  );
}
function breaksIn(r) {
  const b = Object.values(getState().breaks).filter((x) => x.from <= r.end && (x.to || x.from) >= r.prevRange[0]);
  return b.map((x) => x.kind + ' ' + dateShort(x.from) + (x.to && x.to !== x.from ? '–' + dateShort(x.to) : '')).join(', ');
}

// ---------- Zonen und Einstellungen ----------
export function Settings() {
  useData();
  const S = getState();
  const hist = zoneHist() || [];
  const set = S.settings.main || {};
  const [edit, setEdit] = useState(null);
  return (
    <div class="view">
      <Top title="Einstellungen" />
      {WEB ? <div class="list" style="margin-bottom:8px"><Cell onClick={() => push('sources')} title="Datenquellen" sub="Garmin, Withings, Strava, athletedata" /></div> : null}
      <Section title="Zonen-Verlauf">
        <div class="list">
          {hist.slice().reverse().map((z) => (
            <Cell chev={z.src === 'user'} onClick={z.src === 'user' ? () => setEdit(z) : undefined} title={'ab ' + (z.from === '2000-01-01' ? 'Beginn' : dateMid(z.from)) + (z.src === 'user' ? ' · eigene' : z.src === 'garmin' ? ' · Garmin' : ' · Strava')}
              sub={'Puls ' + (z.hr || []).join(' / ') + ' bpm' + (z.ftp ? ' · FTP ' + z.ftp + ' W' + (z.ftpEst ? ' (geschätzt)' : '') : '')} />
          ))}
        </div>
        <div class="pad" style="margin-top:8px"><button type="button" class="btn sec2 wide" onClick={() => setEdit({ from: today(), hr: (hist[hist.length - 1] || {}).hr || [130, 150, 165, 178], ftp: (hist[hist.length - 1] || {}).ftp || 250, src: 'user', isNew: true })}>Eigene Zonen ab einem Datum festlegen</button></div>
        <div class="subhead" style="margin-top:6px">Auswertungen nutzen immer die Zonen, die am Tag der Aktivität galten. {WEB ? 'Garmin-Pulszonen werden wöchentlich nachgeladen; Leistungszonen legst du hier selbst fest.' : 'Strava-Zonen werden etwa alle drei Wochen nachgeladen.'}</div>
      </Section>
      {edit ? <ZoneEditor z={edit} onDone={() => setEdit(null)} /> : null}
      <Map3dSetting set={set} />
      <Section title="Darstellung">
        <div class="card p stack" style="gap:8px">
          <Seg value={set.theme || 'auto'} onChange={(v) => { setDoc('settings/main', { ...set, theme: v }); document.documentElement.dataset.theme = v === 'auto' ? '' : v; }} label="Erscheinungsbild" options={[['auto', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']]} />
          <div class="tiny faint">Schriftgröße folgt der Einstellung deines iPhones (Dynamic Type).</div>
        </div>
      </Section>
      <div class="spacer" />
    </div>
  );
}

function Map3dSetting({ set }) {
  const [url, setUrl] = useState(set.map3d || (WEB ? SPUR3D_DEFAULT : ''));
  // Eingabe tolerant machen: ohne https://, mit http:// oder als github.com-Repo-Link
  const norm = (u) => {
    let x = u.trim().replace(/#.*$/, '');
    if (!x) return '';
    x = x.replace(/^http:\/\//i, 'https://');
    if (!/^https:\/\//i.test(x)) x = 'https://' + x;
    const gh = /^https:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)/i.exec(x);
    if (gh) x = 'https://' + gh[1].toLowerCase() + '.github.io/' + gh[2] + '/';
    return x;
  };
  const n = norm(url);
  const ok = !n || /^https:\/\/[^\s#]+\.[^\s#]+$/.test(n);
  return (
    <Section title="3D-Karte">
      <div class="card p stack" style="gap:8px">
        <div class="small">{WEB ? 'Satellitenbild und 3D-Gelände laufen auf einer eigenen Seite (Spur 3D).' : 'Satellitenbild und 3D-Gelände laufen auf einer eigenen Seite außerhalb von Claude, weil Claude hier keine Kartenbilder laden darf.'} Trag die Adresse deiner Seite ein, zum Beispiel https://deinname.github.io/spur-3d/.</div>
        <div class="field"><label for="m3d">Adresse der 3D-Karte</label><input id="m3d" class="input" inputMode="url" autocapitalize="off" spellcheck="false" placeholder="https://…github.io/spur-3d/" value={url} onInput={(e) => setUrl(e.target.value)} /></div>
        {!ok ? <div class="small" style="color:var(--bad)">Das sieht nicht nach einer Web-Adresse aus.</div> : n && n !== url.trim() ? <div class="small muted">Wird gespeichert als: {n}</div> : null}
        <button type="button" class="btn" disabled={!ok} onClick={() => { setUrl(n); setDoc('settings/main', { ...(getState().settings.main || {}), map3d: n || undefined }); toast(n ? '3D-Karte verbunden' : '3D-Karte entfernt'); }}>Speichern</button>
        {set.map3d || WEB ? <a class="btn sec2" href={set.map3d || SPUR3D_DEFAULT} target="_blank" rel="noopener">3D-Karte testen</a> : null}
        <div class="tiny faint">Die Strecke wird nur im Link hinter dem # übergeben. Dieser Teil geht an keinen Server. Die Kartendienste sehen nur, welche Kartenausschnitte geladen werden.</div>
      </div>
    </Section>
  );
}

function ZoneEditor({ z, onDone }) {
  const [f, setF] = useState({ from: z.from, hr: z.hr.slice(), ftp: z.ftp });
  const S = getState();
  const cur = S.settings.main || {};
  const list = (cur.zones || []).filter((x) => !(x.from === z.from && !z.isNew));
  const powerFrom = (ftp) => [0.55, 0.75, 0.9, 1.05, 1.2, 1.5].map((p) => Math.round(ftp * p));
  return (
    <div class="card p stack" style="margin-top:10px;gap:8px">
      <b>Zonen ab Datum</b>
      <div class="field"><label for="zn-f">Gültig ab</label><input id="zn-f" class="input" type="date" value={f.from} onInput={(e) => setF({ ...f, from: e.target.value })} /></div>
      {f.hr.map((v, i) => <Stepper id={'zn-h' + i} label={'Puls Z' + (i + 1) + ' bis'} unit="bpm" value={v} onChange={(x) => { const hr = f.hr.slice(); hr[i] = x; setF({ ...f, hr }); }} max={230} />)}
      <Stepper id="zn-ftp" label="FTP" unit="W" value={f.ftp} step={5} max={600} onChange={(x) => setF({ ...f, ftp: x })} />
      <div class="tiny faint">Leistungszonen werden aus der FTP nach Coggan berechnet: {powerFrom(f.ftp || 0).join(' / ')} W.</div>
      <div class="row">
        <button type="button" class="btn grow" onClick={() => { setDoc('settings/main', { ...cur, zones: [...list, { from: f.from, hr: f.hr, ftp: f.ftp, power: powerFrom(f.ftp), ftpEst: false }] }); onDone(); }}>Speichern</button>
        {!z.isNew ? <button type="button" class="btn danger" onClick={() => { setDoc('settings/main', { ...cur, zones: list }); onDone(); }}>Löschen</button> : null}
        <button type="button" class="btn sec2" onClick={onDone}>Abbrechen</button>
      </div>
    </div>
  );
}

// ---------- Daten und Datenschutz ----------
export function DataView() {
  const d = useData();
  const S = getState();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const counts = COLLS.map((c) => [c, Object.keys(S[c]).length]);
  const exportAll = async () => {
    const out = { app: 'hansport', exportedAt: new Date().toISOString(), note: 'Strava-Kopie (acts, perf, strength, meta) und deine Ergänzungen. Medien als Verweise.' };
    for (const c of COLLS) out[c] = S[c];
    const data = JSON.stringify(out, null, 1);
    const cp = await caps();
    const name = 'hansport-export-' + today() + '.json';
    try {
      if (cp.downloads) { await cp.downloads.save({ filename: name, data }); toast('Export gespeichert'); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; a.click(); }
    } catch (e) { if (e && e.code !== 'declined') toast('Export fehlgeschlagen: ' + (e.message || e.code || ''), 'error'); }
  };
  const wipe = async (which) => {
    setBusy(true);
    const own = ['edits', 'manual', 'gym', 'gymtpl', 'journal', 'breaks', 'gear', 'goals', 'routes', 'reviews', 'settings'];
    const copy = ['acts', 'perf', 'strength', 'meta', 'health'];
    const cols = which === 'all' ? COLLS : which === 'copy' ? copy : which === 'journal' ? ['journal'] : own;
    const cp = await caps();
    if (which === 'all' || which === 'own') {
      // Medien zuerst löschen
      for (const e of Object.values(S.edits)) for (const m of e.media || []) { try { await cp.assets.delete(m.id); } catch (err) { /* weiter */ } }
    }
    for (const c of cols) for (const id of Object.keys(S[c])) delDoc(c + '/' + id);
    if (which === 'all' || which === 'copy') { await kvDel('snapshot'); for (const id of Object.keys(S.perf)) await kvDel('st:' + id); }
    setBusy(false); setConfirm(null);
    toast('Gelöscht');
  };
  const Confirm = ({ which, label }) => confirm === which ? (
    <div class="note bad"><Icon.warn /><div class="grow">{label} Das lässt sich nicht rückgängig machen.<div class="row" style="margin-top:8px"><button type="button" class="btn danger" disabled={busy} onClick={() => wipe(which)}>{busy ? 'Lösche …' : 'Endgültig löschen'}</button><button type="button" class="btn sec2" onClick={() => setConfirm(null)}>Abbrechen</button></div></div></div>
  ) : null;
  return (
    <div class="view">
      <Top title="Daten" />
      <Section title="Was hansport speichert">
        <div class="card p small stack" style="gap:6px">
          <div><b>{WEB ? 'Aktivitäten (Garmin, früher Strava):' : 'Strava-Kopie:'}</b> Zusammenfassungen deiner Aktivitäten ({d.list.filter((a) => a.src === 'strava').length}), vereinfachte GPS-Linien, Abschnittszeiten, Krafttrainingssätze, Ausrüstung und Zonen. Zeitreihen nur für geöffnete Aktivitäten, stark vereinfacht.</div>
          <div><b>Deine Ergänzungen:</b> Notizen, Anstrengung, Korrekturen, Journal, Gym-Log, Ziele, Ausrüstung, Fotos und Videos.</div>
          <div>{WEB ? 'Alles liegt privat in deinem eigenen Speicher (Vercel) und ist nur mit deinem Passwort erreichbar. Keine Kontakte, keine Daten anderer Personen. Die Schlüssel zu Garmin, Withings und der Claude-API liegen nur auf dem Server, nie in der App.' : 'Alles liegt privat in deinem Claude-Konto, nur du kannst es lesen. Keine Kontakte, keine Kudos, keine Daten anderer Personen. Zugangsdaten zu Strava verwaltet Claude, hansport sieht sie nie.'}</div>
          <details class="data"><summary>Dokumente je Bereich</summary><table class="table"><tbody>{counts.map(([c, n]) => <tr><td>{c}</td><td>{n}</td></tr>)}</tbody></table></details>
        </div>
      </Section>
      <Section title="Abgleich">
        <div class="card p stack" style="gap:8px">
          <button type="button" class="btn sec2" onClick={() => doSync(true)}>Alles neu abgleichen</button>
          <div class="tiny faint">{WEB ? 'Holt alle Garmin-Aktivitäten erneut und verknüpft sie mit den übernommenen. Doppelte entstehen nicht, deine Ergänzungen bleiben unverändert.' : 'Holt alle Aktivitäten erneut. Doppelte entstehen nicht (gleiche Strava-ID), deine Ergänzungen bleiben unverändert. In Strava gelöschte Aktivitäten werden markiert, nicht entfernt.'}</div>
        </div>
      </Section>
      {WEB ? <WebImport /> : null}
      <Section title="Export">
        <div class="card p stack" style="gap:8px"><button type="button" class="btn" onClick={exportAll}>Alle Daten als JSON exportieren</button><div class="tiny faint">Enthält auch GPS-Linien und Journal. Sicher aufbewahren.</div></div>
      </Section>
      <Section title="Löschen">
        <div class="card p stack" style="gap:8px">
          <button type="button" class="btn sec2" onClick={() => setConfirm('journal')}>Altes Journal löschen</button><Confirm which="journal" label="Alle früheren Journaleinträge werden gelöscht." />
          <button type="button" class="btn sec2" onClick={() => setConfirm('copy')}>{WEB ? 'Kopie der Quelldaten löschen' : 'Strava-Kopie löschen'}</button><Confirm which="copy" label={WEB ? 'Die Kopie der Aktivitäts- und Gesundheitsdaten wird gelöscht. Aus Strava übernommene Aktivitäten lassen sich nicht neu laden; sie kommen als Garmin-Aktivitäten zurück, deine Notizen hängen dann nicht mehr daran.' : 'Die Kopie der Strava-Daten wird gelöscht. Deine Ergänzungen bleiben und hängen sich beim nächsten Abgleich wieder an.'} />
          <button type="button" class="btn sec2" onClick={() => setConfirm('own')}>Meine Ergänzungen löschen</button><Confirm which="own" label="Notizen, Korrekturen, Journal, Gym-Log, Ziele, Ausrüstung, Fotos und Videos werden gelöscht." />
          <button type="button" class="btn danger" onClick={() => setConfirm('all')}>Alles löschen</button><Confirm which="all" label="Alle Daten in hansport werden gelöscht." />
          <div class="tiny faint">{'Deine Daten bei ' + (WEB ? 'Garmin und Withings' : 'Strava') + ' bleiben in jedem Fall unberührt. hansport liest nur.'}</div>
        </div>
      </Section>
      <div class="spacer" />
    </div>
  );
}

// ---------- Karte teilen mit Privatzone ----------
function trimPrivate(pts, r) {
  if (!pts.length) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  return pts.filter((p) => hav(p, a) > r && hav(p, b) > r);
}
export function ShareMap() {
  const d = useData();
  const [r, setR] = useState(500);
  const [sport, setSport] = useState('all');
  const core = useRef();
  const items = useMemo(() => heatItems(d).filter((x) => sport === 'all' || x.sport === sport).map((x) => ({ ...x, pts: trimPrivate(x.pts, r) })).filter((x) => x.pts.length > 1), [d.v, r, sport]);
  const save = async () => {
    const c = core.current;
    if (!c || !c.cv) return;
    const blob = await new Promise((res) => c.cv.toBlob(res, 'image/png'));
    const cp = await caps();
    try {
      if (cp.downloads) { await cp.downloads.save({ filename: 'hansport-karte-' + today() + '.png', data: blob }); toast('Bild gespeichert'); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spur-karte.png'; a.click(); }
    } catch (e) { if (e && e.code !== 'declined') toast('Speichern fehlgeschlagen', 'error'); }
  };
  return (
    <div class="view">
      <Top title="Karte teilen" />
      <Note kind="warn">Start und Ziel verraten oft Wohnort oder Arbeitsplatz. hansport schneidet deshalb um jeden Start- und Endpunkt einen Kreis aus. Ortsnamen werden im Bild nicht gezeigt.</Note>
      <div class="card p stack" style="margin-top:10px;gap:8px">
        <Seg value={String(r)} onChange={(v) => setR(+v)} label="Privatzone" options={[['200', '200 m'], ['500', '500 m'], ['1000', '1 km'], ['2000', '2 km']]} />
        <Seg value={sport} onChange={setSport} label="Sportart" options={[['all', 'Alle'], ['mtb', 'MTB'], ['road', 'Rennrad'], ['hike', 'Wandern'], ['splitboard', 'Split']]} />
      </div>
      <div style="margin:10px 16px 0;border-radius:14px;overflow:hidden;box-shadow:var(--shadow)">
        <MapView height="360px" heat={items} fit={items.length ? items.slice(0, 200).map((x) => x.pts) : null} fitKey={sport + r} labels={false} coreRef={core} label="Vorschau der geteilten Karte ohne Start- und Zielbereiche" />
      </div>
      <div class="pad" style="margin-top:10px"><button type="button" class="btn wide" onClick={save}>Als Bild sichern</button></div>
      <div class="subhead" style="margin-top:6px">Es wird nur das Bild gespeichert. hansport teilt nichts selbst.</div>
      <div class="spacer" />
    </div>
  );
}

// ---------- Kurzanleitung ----------
export const APP_VERSION = 'Runde 6 · 26. Nov. 2026';
export function Guide() {
  return (
    <div class="view">
      <Top title="Über hansport" />
      <div class="about">
        <HansportLogo variant="icon" size={72} title="hansport App-Icon" class="about-icon" />
        <HansportLogo size={28} title="hansport" style={{ marginTop: 'var(--s-4)' }} />
        <div class="small muted" style="margin-top:var(--s-3)">Version {APP_VERSION}</div>
      </div>
      <Section title="Datenquellen">
        <div class="card p stack small" style="gap:var(--s-2)">
          <div><b>Aktivitäten:</b> {WEB ? 'Garmin (frühere aus Strava übernommen)' : 'Strava'}</div>
          <div><b>Gesundheit:</b> {WEB ? 'Garmin und Withings, direkt' : 'Garmin und Withings über athletedata'}</div>
          <div><b>Karte:</b> © OpenStreetMap-Mitwirkende · OpenMapTiles · OpenFreeMap, offline in der App</div>
          <div><b>Relief:</b> Terrain Tiles (Copernicus EU-DEM, SRTM)</div>
          <div><b>Schrift und Icons:</b> Geist (SIL OFL 1.1), Iconoir (MIT)</div>
          <div class="muted">Deine Daten liegen im privaten Speicher dieser App. GPS-Spuren, Fotos und Gesundheitswerte verlassen sie nicht; Export und Löschen unter „Daten und Datenschutz“.</div>
        </div>
      </Section>
      <Section title="Kurzanleitung">
        <div class="card p stack small" style="gap:var(--s-3)">
          <div><b>1. Abgleichen.</b> Auf „Heute“ oben ⟳ tippen oder die Seite nach unten ziehen. {WEB ? 'Garmin, Withings und Coach richtest du unter Mehr → Einstellungen → Verbindungen ein.' : 'Beim ersten Mal fragt Claude, ob hansport auf Strava und athletedata zugreifen darf.'} Danach gleicht die App beim Öffnen ab, wenn der letzte Abgleich älter als 30 Minuten ist, und stündlich, solange sie offen ist.</div>
          <div><b>2. Heute.</b> Kachel antippen öffnet die Details mit Verlauf, Normalbereich und Tabelle. Oben einen Wochentag wählen, um einen anderen Tag zu sehen.</div>
          <div><b>3. Aktivitäten.</b> Liste oder Karte. Eine Aktivität zeigt Karte, Höhenprofil mit Steigung und Anstiegen, Splits und Leistungskurve; Anstrengung, Notizen und Fotos ergänzt du dort.</div>
          <div><b>4. Gesundheit.</b> Zustand heute, Herz, Schlaf, Erholung und Körper, dazu Langzeit, Zusammenhänge und Wochenmuster.</div>
          <div><b>5. Coach.</b> Tagesbereitschaft mit offengelegter Berechnung, Erkenntnisse, Wochenplan, Ernährung und Chat. Der Coach stellt keine Diagnosen.</div>
          <div><b>6. Mehr.</b> Ziele, Ausrüstung mit Service-Erinnerung, Monatsrückblicke, Krafttraining, Einstellungen sowie Export und Löschen deiner Daten.</div>
          <div><b>Kennzeichnungen:</b> <span class="est">gesch.</span> geschätzt, <span class="est man">manuell</span> von dir eingetragen. Pfeile ▲▼ zeigen die Richtung einer Änderung, nicht nur Farben.</div>
        </div>
      </Section>
      <div class="spacer" />
    </div>
  );
}
