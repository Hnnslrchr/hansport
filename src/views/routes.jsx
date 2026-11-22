import { h, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useData, ActRow, gearName, link3d } from './common.jsx';
import { Top, Section, Icon, Mark, Cell, Sheet, Note, Stat, sportColor, Stepper } from '../ui/kit.jsx';
import { Points, Profile, GapChart, Series } from '../ui/charts.jsx';
import { MapView, appleMapsUrl } from '../ui/map.jsx';
import { push, openSheet, closeSheet, pop } from '../nav.js';
import { getState, setDoc, patchDoc, newId, toast } from '../store.js';
import { loadStreams, explain } from '../strava.js';
import { routeMetric, median, effortLimits, splitCompare } from '../analysis.js';
import { routeFlags, alignStreams, effortOnMark, passesThrough, similarActs } from '../routes.js';
import { decode } from '../geo.js';
import { pauseIntervals } from '../sections.js';
import { km, hm, dur, int, num, clock, dateShort, dateMid, speedKmh, signedDur } from '../format.js';
import { heatItems } from './mapview.jsx';

const rmain = () => getState().routes.main || {};
const saveR = (p) => setDoc('routes/main', { ...rmain(), ...p });

export function RouteView({ key: _k, rkey }) {
  const d = useData();
  const c = d.clusters.find((x) => x.key === rkey);
  const [sel, setSel] = useState(null);
  const [prof, setProf] = useState(null);
  useEffect(() => { if (c) loadStreams(c.members[0].id).then(setProf).catch(() => {}); }, [rkey]);
  if (!c) return <div class="view"><Top title="Strecke" /><div class="empty"><h3>Strecke nicht gefunden</h3>Die Zuordnung hat sich geändert.</div></div>;
  const M = routeMetric(c);
  const fav = (rmain().fav || []).includes(c.key);
  const members = c.members.filter((m) => !m.excluded);
  const vals = members.map((m) => ({ m, v: M.get(m), flags: routeFlags(m, c) }));
  const clean = vals.filter((x) => x.v != null && !x.flags.some((f) => f.k === 'variant'));
  const best = clean.slice().sort((a, b) => (M.higherBetter ? b.v - a.v : a.v - b.v))[0];
  const med = median(clean.map((x) => x.v));
  const pts = c.members.map((m) => decode(m.poly));
  const rev = c.reverseKey ? d.clusters.find((x) => x.key === c.reverseKey) : null;
  const cmp = splitCompare(clean.slice().reverse(), (x) => x.v);
  return (
    <div class="view">
      <Top title="Strecke" actions={<button type="button" class="iconbtn" aria-label={fav ? 'Aus Favoriten entfernen' : 'Als Favorit merken'} onClick={() => saveR({ fav: fav ? (rmain().fav || []).filter((k) => k !== c.key) : [...(rmain().fav || []), c.key] })}>{fav ? '★' : '☆'}</button>} />
      <div class="pad stack" style="gap:4px;margin-bottom:10px">
        <div class="row"><Mark sport={c.sport} /><h1 class="grow" style="font-family:var(--display);font-size:var(--fs-t1);line-height:1.1">{c.name}</h1><button type="button" class="btn ghost" onClick={() => openSheet(() => <RenameSheet c={c} />)}>Umbenennen</button></div>
        <div class="small muted">{c.members.length} Einheiten · {km(c.medLen)} km · {c.loop ? 'Rundkurs' : 'Strecke'}{c.indoor ? ' · indoor' : ''} · gleiche Richtung</div>
      </div>
      {!c.indoor ? (
        <div style="margin:0 16px;border-radius:14px;overflow:hidden;box-shadow:var(--shadow)">
          <MapView height="230px" heat={pts.map((p, i) => ({ id: c.members[i].id, pts: p }))} heatAlpha={0.9} fit={[pts[0]]} fitKey={c.key}
            lines={[{ pts: pts[0], color: sportColor(c.sport), width: 3 }]} markers={[{ pt: pts[0][0], color: '#19774A' }]} onTap={(r) => r.ids[0] && push('activity', { id: r.ids[0] })} label={'Karte der Strecke ' + c.name} />
        </div>
      ) : null}
      <div class="card p" style="margin-top:12px">
        <div class="stats">
          <Stat v={best ? M.fmt(best.v).split(' ')[0] : '–'} u={best ? M.fmt(best.v).split(' ').slice(1).join(' ') : ''} l="Bestwert" />
          <Stat v={med != null ? M.fmt(med).split(' ')[0] : '–'} u={med != null ? M.fmt(med).split(' ').slice(1).join(' ') : ''} l="Typisch (Median)" />
          <Stat v={clean.length} l="vergleichbar" />
        </div>
        {cmp ? <div class="small" style="margin-top:8px">Letzte {cmp.k} gegen die {cmp.k} davor: <b>{M.fmt(cmp.mr)}</b> statt {M.fmt(cmp.me)}.</div> : null}
        <div class="chart-sum">{M.label}. Varianten mit mehr als 6 % anderer Länge sind ausgenommen.</div>
      </div>
      {!c.indoor && link3d([{}]) !== null ? <div class="pad" style="margin-top:10px"><a class="btn sec2 wide" href={link3d([{ pts: pts[0], title: c.name, date: c.members[0].date, sport: c.sport, dist: c.members[0].dist }])} target="_blank" rel="noopener">Strecke in 3D ansehen</a></div> : null}
      {prof && prof.alt ? <Section title="Höhenprofil (letzte Einheit)"><div class="card p"><Profile d={prof.d} alt={prof.alt} label={'Höhenprofil ' + c.name} /></div></Section> : null}
      <Section title="Verlauf">
        <div class="card p">
          <Points items={clean.slice().reverse().map((x) => ({ id: x.m.id, date: x.m.date, y: x.v, label: dateShort(x.m.date), best: best && x.m.id === best.m.id, color: sportColor(x.m.sport) }))}
            fmt={M.fmt} lowerBetter={!M.higherBetter} median={med} label={M.label + ' über die Zeit'} onSelect={(i) => push('activity', { id: i.id })} />
        </div>
      </Section>
      <Section title="Zwei Einheiten vergleichen">
        <div class="card p stack" style="gap:8px">
          <div class="small muted">{sel ? 'Zweite Einheit in der Liste antippen.' : 'Tippe auf „Vergleichen" bei einer Einheit und dann auf eine zweite.'}</div>
          {sel ? <div class="row"><span class="pill">A: {dateShort(d.byId[sel].date)}</span><button type="button" class="btn ghost" onClick={() => setSel(null)}>Auswahl aufheben</button></div> : null}
        </div>
      </Section>
      <div class="list" style="margin-top:10px">
        {vals.map(({ m, v, flags }) => (
          <div class="cell" style="padding:8px 10px 8px 14px">
            <Mark sport={m.sport} sm />
            <button type="button" class="main" style="background:none;border:0;text-align:left;padding:0;color:var(--ink)" onClick={() => push('activity', { id: m.id })}>
              <div class="t1">{dateShort(m.date)} · {M.fmt(v)}{best && best.m.id === m.id ? ' · Bestwert' : ''}</div>
              <div class="t2">{dur(m.mov)} · {km(m.dist)} km{m.gear ? ' · ' + gearName(d, m.gear) : ''}{flags.length ? ' · ' + flags.map((f) => f.text).join(', ') : ''}</div>
            </button>
            {sel && sel !== m.id ? <button type="button" class="btn sec2" style="min-height:36px;padding:6px 10px" onClick={() => push('compare', { a: sel, b: m.id })}>mit A</button>
              : <button type="button" class="btn sec2" style="min-height:36px;padding:6px 10px" aria-pressed={String(sel === m.id)} onClick={() => setSel(sel === m.id ? null : m.id)}>{sel === m.id ? 'A' : 'Vergleichen'}</button>}
          </div>
        ))}
      </div>
      {rev ? <div class="pad" style="margin-top:12px"><button type="button" class="btn sec2 wide" onClick={() => push('route', { rkey: rev.key })}>Gegenrichtung: {rev.name} ({rev.members.length}×)</button></div> : null}
      <Section title="Zuordnung korrigieren">
        <div class="list">
          {c.members.slice(0, 50).map((m) => <Cell onClick={() => { const o = { ...(rmain().overrides || {}) }; o[m.id] = 'none'; saveR({ overrides: o }); toast('„' + m.name + '" aus der Strecke entfernt'); }} chev={false} title={'Entfernen: ' + m.name} sub={dateShort(m.date)} right={<span class="small" style="color:var(--bad)">Entfernen</span>} />)}
        </div>
        <div class="pad" style="margin-top:8px"><button type="button" class="btn sec2 wide" onClick={() => openSheet(() => <AddToRoute c={c} d={d} />)}>Ähnliche Fahrt hinzufügen …</button></div>
        <div class="subhead" style="margin-top:6px">Entfernte Einheiten bleiben erhalten, zählen aber nicht mehr zu dieser Strecke.</div>
      </Section>
      <div class="spacer" />
    </div>
  );
}

function AddToRoute({ c, d }) {
  const sim = similarActs(c.members[0], d.list, 12).filter((x) => d.byAct[x.a.id] !== c.key);
  return (
    <Sheet title="Zur Strecke hinzufügen">
      {sim.length ? <div class="list" style="margin:0">{sim.map(({ a, m }) => <Cell onClick={() => { const o = { ...(rmain().overrides || {}) }; o[a.id] = c.key; saveR({ overrides: o }); closeSheet(); toast('Hinzugefügt'); }} left={<Mark sport={a.sport} sm />} title={a.name} sub={a.date + ' · ' + km(a.dist) + ' km · Ø Abweichung ' + int(m) + ' m'} />)}</div>
        : <div class="small muted">Keine ähnlichen Fahrten in der Nähe gefunden.</div>}
    </Sheet>
  );
}

function RenameSheet({ c }) {
  const [n, setN] = useState(c.name);
  return (
    <Sheet title="Strecke benennen">
      <div class="field"><label for="rn">Name</label><input id="rn" class="input" value={n} onInput={(e) => setN(e.target.value)} /></div>
      <button type="button" class="btn wide" onClick={() => { saveR({ names: { ...(rmain().names || {}), [c.key]: n } }); closeSheet(); }}>Speichern</button>
    </Sheet>
  );
}

// ---------- Strava-Segment (Anstieg) ----------
export function SegmentView({ id }) {
  const d = useData();
  const s = d.segIdx[id];
  const [sel, setSel] = useState(null);
  if (!s) return <div class="view"><Top title="Anstieg" /><div class="empty"><h3>Keine Daten</h3>Dieser Abschnitt ist (noch) nicht in deinen analysierten Aktivitäten.</div></div>;
  const items = s.efforts.map((e) => ({ id: e.act, date: e.date, y: e.mt, label: dateShort(e.date), best: e === s.best, color: sportColor(e.sport), e }));
  const c = splitCompare(s.efforts, (e) => e.mt);
  const lim = c ? effortLimits(c.recent, c.earlier, d.gearNames) : [];
  const goal = Object.values(getState().goals).find((g) => g.kind === 'segment' && g.segId === id);
  return (
    <div class="view">
      <Top title="Anstieg" />
      <div class="pad stack" style="gap:4px;margin-bottom:10px">
        <h1 style="font-family:var(--display);font-size:var(--fs-t1);line-height:1.1">{s.name}</h1>
        <div class="small muted">{km(s.dist)} km · {hm(s.gain)} Hm · Ø {num(s.grade * 100, 1)} % · Strava-Segment, nur in dieser Richtung</div>
      </div>
      <div class="card p">
        <div class="stats">
          <Stat v={clock(s.best.mt)} u={s.best.mt >= 3600 ? 'h' : 'min'} l={'Bestzeit · ' + dateShort(s.best.date)} />
          <Stat v={clock(s.median)} u={s.median >= 3600 ? 'h' : 'min'} l="Typisch (Median)" />
          <Stat v={clock(s.last.mt)} u={s.last.mt >= 3600 ? 'h' : 'min'} l={'Zuletzt · ' + dateShort(s.last.date)} />
        </div>
        {c ? <div class="small" style="margin-top:8px">Letzte {c.k} gegen die {c.k} davor: <b>{c.diff < 0 ? clock(-c.diff) + ' min schneller' : clock(c.diff) + ' min langsamer'}</b> im Median.</div> : null}
        {s.gain > 0 ? <div class="chart-sum">Höhenmeter pro Stunde bei Bestzeit: {int((s.gain / s.best.mt) * 3600)} Hm/h.</div> : null}
        {goal ? <div class="small" style="margin-top:6px">Ziel: {clock(goal.targetTime)} min {s.best.mt <= goal.targetTime ? '– erreicht' : '– noch ' + clock(s.best.mt - goal.targetTime) + ' min'}</div> : <button type="button" class="btn ghost" onClick={() => openSheet(() => <SegGoalSheet s={s} />)}>Ziel für diesen Anstieg setzen</button>}
      </div>
      {lim.length ? <Section title="Einschränkungen des Vergleichs"><div class="note warn"><Icon.warn /><ul style="margin:0;padding-left:16px">{lim.map((l) => <li>{l}</li>)}</ul></div></Section> : null}
      <Section title="Zeiten">
        <div class="card p"><Points items={items} fmt={(v) => clock(v)} lowerBetter median={s.median} label={'Zeiten auf ' + s.name} selected={sel} onSelect={(i) => push('activity', { id: i.id })} /></div>
      </Section>
      <Section title="Alle Fahrten">
        <div class="card" style="overflow-x:auto">
          <table class="table nw" style="min-width:420px">
            <thead><tr><th>Datum</th><th>Zeit</th><th>Hm/h</th><th>Puls</th><th>Kontext</th></tr></thead>
            <tbody>
              {s.efforts.slice().reverse().map((e) => {
                const a = d.byId[e.act];
                const ctx = a ? [a.ctx && a.ctx.surface, a.ctx && a.ctx.conditions, a.ctx && a.ctx.feel, gearName(d, a.gear), a.ebike ? 'E-MTB' : null].filter(Boolean).join(', ') : '';
                return (
                  <tr class={'click' + (e === s.best ? ' best' : '')} onClick={() => push('activity', { id: e.act })}>
                    <td>{dateShort(e.date)}</td><td>{clock(e.mt)}{e.et - e.mt > 30 ? ' *' : ''}</td><td>{int((s.gain / e.mt) * 3600)}</td><td>{e.hr || '–'}</td><td class="small" style="text-align:left">{ctx || (a && a.notes ? 'Notiz' : '–')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div class="subhead" style="margin-top:6px">Bewegungszeit. * = Stopp im Abschnitt. Kontext aus deinen Notizen und der Ausrüstung.</div>
      </Section>
      <div class="spacer" />
    </div>
  );
}

function SegGoalSheet({ s }) {
  const [min, setMin] = useState(Math.floor((s.best.mt * 0.97) / 60));
  const [sec, setSec] = useState(Math.round((s.best.mt * 0.97) % 60));
  return (
    <Sheet title="Ziel für den Anstieg">
      <div class="small muted">Bestzeit bisher {clock(s.best.mt)} min.</div>
      <div class="row"><div class="grow"><Stepper id="sg-m" label="Minuten" value={min} onChange={setMin} /></div><div class="grow"><Stepper id="sg-s" label="Sekunden" value={sec} max={59} onChange={setSec} /></div></div>
      <button type="button" class="btn wide" onClick={() => { const id = newId('g'); setDoc('goals/' + id, { id, kind: 'segment', segId: s.id, targetTime: min * 60 + sec, title: s.name.trim() + ' unter ' + min + ':' + String(sec).padStart(2, '0'), created: Date.now() }); closeSheet(); toast('Ziel gespeichert'); }}>Ziel speichern</button>
    </Sheet>
  );
}

// ---------- eigene Teilstrecke ----------
export function MarkView({ id }) {
  const d = useData();
  const r = rmain();
  const m = (r.marks || []).find((x) => x.id === id);
  const [busy, setBusy] = useState(null);
  const cands = useMemo(() => {
    if (!m) return [];
    return d.list.filter((a) => a.poly && !a.excluded && !a.indoor && passesThrough(decode(a.poly), m.a, m.b, 160));
  }, [d.v, id]);
  if (!m) return <div class="view"><Top title="Teilstrecke" /><div class="empty"><h3>Nicht gefunden</h3></div></div>;
  const results = m.results || {};
  const missing = cands.filter((a) => !results[a.id]);
  const save = (res) => { const marks = (rmain().marks || []).map((x) => (x.id === id ? { ...x, results: res } : x)); saveR({ marks }); };
  const compute = async () => {
    let res = { ...results };
    let n = 0;
    for (const a of missing.slice(0, 25)) {
      setBusy(++n + ' / ' + Math.min(25, missing.length));
      try {
        const s = await loadStreams(a.id);
        const e = effortOnMark(s, m.a, m.b);
        res[a.id] = e ? { time: e.time, dist: Math.round(e.dist), gain: Math.round(e.gain), hr: e.hr ? Math.round(e.hr) : null, date: a.date } : { none: true, date: a.date };
      } catch (err) { toast(explain(err), 'error'); break; }
    }
    save(res);
    setBusy(null);
  };
  const rows = Object.entries(results).filter(([, v]) => !v.none && v.time).map(([aid, v]) => ({ aid, ...v })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const lenOk = (v) => !m.len || Math.abs(v.dist - m.len) / m.len < 0.25;
  const valid = rows.filter(lenOk);
  const best = valid.slice().sort((a, b) => a.time - b.time)[0];
  const med = median(valid.map((v) => v.time));
  return (
    <div class="view">
      <Top title="Teilstrecke" />
      <div class="pad stack" style="gap:4px;margin-bottom:10px">
        <h1 style="font-family:var(--display);font-size:var(--fs-t1)">{m.name}</h1>
        <div class="small muted">{m.kind === 'trail' ? 'Trail / Abfahrt' : 'Anstieg'} · {km(m.len)} km · {m.gain ? '+' + hm(m.gain) + ' Hm · ' : ''}Richtung wie markiert</div>
      </div>
      <div style="margin:0 16px;border-radius:14px;overflow:hidden;box-shadow:var(--shadow)">
        <MapView height="220px" heat={heatItems(d)} heatAlpha={0.35} fit={[m.path ? decode(m.path) : [m.a, m.b]]} fitKey={id} lines={m.path ? [{ pts: decode(m.path), color: m.kind === 'trail' ? '#7FCFDD' : '#0193A9', width: 4 }] : []} markers={[{ pt: m.a, color: '#0193A9', label: 'A', r: 8 }, { pt: m.b, color: '#6B6B70', label: 'B', r: 8 }]} label="Teilstrecke von A nach B" />
      </div>
      <div class="card p" style="margin-top:12px">
        <div class="stats"><Stat v={best ? clock(best.time) : '–'} u={best && best.time >= 3600 ? 'h' : 'min'} l="Bestzeit" /><Stat v={med ? clock(med) : '–'} u={med >= 3600 ? 'h' : 'min'} l="Median" /><Stat v={valid.length} l="Zeiten" /></div>
        <div class="chart-sum">{cands.length} Aktivitäten führen durch A und danach B. {missing.length ? missing.length + ' davon noch ohne Zeit.' : ''}</div>
        {missing.length ? <button type="button" class="btn wide" style="margin-top:8px" disabled={!!busy} onClick={compute}>{busy ? 'Berechne ' + busy + ' …' : 'Zeiten berechnen (' + Math.min(25, missing.length) + ' Aktivitäten laden)'}</button> : null}
      </div>
      {valid.length ? <Section title="Zeiten"><div class="card p"><Points items={valid.map((v) => ({ id: v.aid, date: v.date, y: v.time, label: dateShort(v.date), best: v === best }))} fmt={clock} lowerBetter median={med} label={'Zeiten auf ' + m.name} onSelect={(i) => push('activity', { id: i.id })} /></div></Section> : null}
      {rows.length ? (
        <Section title="Einzelne Durchgänge">
          <div class="list">{rows.slice().reverse().map((v) => { const a = d.byId[v.aid]; return a ? <ActRow a={a} sub={dateShort(v.date) + ' · ' + clock(v.time) + ' min' + (v.hr ? ' · ' + v.hr + ' bpm' : '') + (!lenOk(v) ? ' · Variante, nicht gewertet' : '') + (a.notes ? ' · Notiz' : '')} /> : null; })}</div>
        </Section>
      ) : null}
      <div class="pad" style="margin-top:14px"><button type="button" class="btn danger" onClick={() => { saveR({ marks: (rmain().marks || []).filter((x) => x.id !== id) }); pop(); }}>Teilstrecke löschen</button></div>
      <div class="spacer" />
    </div>
  );
}

// ---------- Zwei Aktivitäten übereinander ----------
export function CompareView({ a: ida, b: idb }) {
  const d = useData();
  const A = d.byId[ida], B = d.byId[idb];
  const [st, setSt] = useState({ loading: true });
  useEffect(() => {
    Promise.all([loadStreams(ida), loadStreams(idb)]).then(([sa, sb]) => setSt({ sa, sb })).catch((e) => setSt({ error: e }));
  }, [ida, idb]);
  if (!A || !B) return <div class="view"><Top title="Vergleich" /><div class="empty">Aktivität fehlt. Gleiche Strava ab und öffne den Vergleich erneut.</div></div>;
  // Uhr ohne Pausen: nur Bewegungszeit zählt
  const movClock = (s) => { const P = pauseIntervals(s); const t = [0]; for (let i = 1; i < s.t.length; i++) t.push(t[i - 1] + (P.has(i) ? 0 : s.t[i] - s.t[i - 1])); return { ...s, t }; };
  const al = st.sa && st.sb ? alignStreams(movClock(st.sa), movClock(st.sb)) : null;
  const c = d.clusters.find((x) => x.key === d.byAct[ida]);
  const flags = [...routeFlags(A, c).map((f) => 'A: ' + f.text), ...routeFlags(B, c).map((f) => 'B: ' + f.text)];
  if (al && al.matched < 0.9) flags.push('Nur ' + Math.round(al.matched * 100) + ' % der Strecke decken sich (gelb markiert)');
  if (A.gear !== B.gear) flags.push('Unterschiedliche Ausrüstung: ' + (gearName(d, A.gear) || '–') + ' / ' + (gearName(d, B.gear) || '–'));
  const row = (l, va, vb, f, lower) => {
    const better = va != null && vb != null && va !== vb ? ((lower ? va < vb : va > vb) ? 'A' : 'B') : null;
    return <tr><td>{l}</td><td style={better === 'A' ? 'font-weight:700' : ''}>{va != null ? f(va) : '–'}</td><td style={better === 'B' ? 'font-weight:700' : ''}>{vb != null ? f(vb) : '–'}</td></tr>;
  };
  const end = al && al.rows.length ? al.rows[al.rows.length - 1] : null;
  return (
    <div class="view">
      <Top title="Vergleich" />
      <div class="pad small" style="margin-bottom:8px"><b style="color:var(--c-akt)">A ━</b> {A.name} · {dateShort(A.date)}<br /><b style="color:var(--ink-2)">B ╍</b> {B.name} · {dateShort(B.date)}</div>
      {A.poly && B.poly && !A.indoor ? (
        <div style="margin:0 16px;border-radius:14px;overflow:hidden;box-shadow:var(--shadow)">
          <MapView height="220px" fit={[decode(A.poly)]} fitKey={ida + idb} lines={[{ pts: st.sa && st.sa.ll ? st.sa.ll : decode(A.poly), color: '#0193A9', width: 4 }, { pts: st.sb && st.sb.ll ? st.sb.ll : decode(B.poly), color: '#8A8A8F', width: 2.5, dash: [6, 5], halo: false }]} label="Beide Strecken übereinander" />
        </div>
      ) : null}
      <div class="card" style="margin-top:12px;padding:6px 10px">
        <table class="table">
          <thead><tr><th></th><th>A</th><th>B</th></tr></thead>
          <tbody>
            {row('Bewegungszeit', A.mov, B.mov, dur, true)}
            {row('Gesamtzeit', A.ela, B.ela, dur, true)}
            {row('Distanz', A.dist, B.dist, (v) => km(v) + ' km')}
            {row('Höhenmeter', A.gain, B.gain, (v) => hm(v))}
            {row('Ø Tempo', A.mov ? (A.dist / A.mov) * 3.6 : null, B.mov ? (B.dist / B.mov) * 3.6 : null, (v) => num(v, 1) + ' km/h')}
            {row('Puls Ø', getState().perf[ida]?.avgHr, getState().perf[idb]?.avgHr, (v) => int(v) + ' bpm', true)}
            {row('Anstrengung', A.rpe, B.rpe, (v) => v + '/10', true)}
          </tbody>
        </table>
      </div>
      {A.poly && B.poly && !A.indoor && link3d([{}]) !== null ? <div class="pad" style="margin-top:10px"><a class="btn sec2 wide" href={link3d([{ pts: st.sa && st.sa.ll ? st.sa.ll : decode(A.poly), title: A.name, date: A.date, sport: A.sport, dist: A.dist }, { pts: st.sb && st.sb.ll ? st.sb.ll : decode(B.poly), title: B.name, date: B.date, sport: B.sport, dist: B.dist }])} target="_blank" rel="noopener">Beide in 3D ansehen</a></div> : null}
      {flags.length ? <div style="margin-top:10px"><Note kind="warn"><ul style="margin:0;padding-left:16px">{flags.map((f) => <li>{f}</li>)}</ul></Note></div> : <div style="margin-top:10px"><Note>Gleiche Strecke, gleiche Richtung, keine besonderen Einschränkungen.</Note></div>}
      <Section title="Zeitabstand entlang der Strecke">
        <div class="card p">
          {st.loading ? <div aria-busy="true" aria-label="Zeitreihen werden geladen"><div class="skel skel-chart" /><div class="skel skel-line" style="width:60%" /></div> : null}
          {st.error ? <Note kind="warn">{explain(st.error)}</Note> : null}
          {al ? (
            <Fragment>
              <GapChart rows={al.rows} nameA="A" nameB="B" />
              {end ? <div class="small" style="margin-top:6px">Am Ende liegt B <b>{end.tB - end.tA > 0 ? clock(end.tB - end.tA) + ' min hinter' : clock(end.tA - end.tB) + ' min vor'}</b> A, gerechnet in Bewegungszeit (Pausen herausgenommen).</div> : null}
              <div class="chart-sum">Linie über 0: B ist bis zu dieser Stelle langsamer als A, darunter schneller. Gemessen entlang der Strecke von A. Gelb hinterlegt: B weicht dort mehr als 80 m ab, der Vergleich ist an diesen Stellen unsicher.</div>
              {st.sa.hr && st.sb.hr ? <Series d={al.rows.map((r) => r.d)} y={al.rows.map((r) => r.hrA)} y2={al.rows.map((r) => r.hrB)} color="var(--c-akt)" color2="var(--ink-2)" label="Puls A" label2="Puls B" unit="bpm" /> : null}
            </Fragment>
          ) : null}
        </div>
      </Section>
      <div class="spacer" />
    </div>
  );
}
