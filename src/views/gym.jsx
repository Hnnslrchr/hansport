import { h, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useData } from './common.jsx';
import { Top, Section, Icon, Sheet, Stepper, Scale, Note, Cell, Mark, Seg, Est } from '../ui/kit.jsx';
import { Points } from '../ui/charts.jsx';
import { push, pop, openSheet, closeSheet } from '../nav.js';
import { getState, setDoc, patchDoc, delDoc, newId, toast } from '../store.js';
import { exerciseHistory, comparableLoad, e1rm, median } from '../analysis.js';
import { num, int, dur, dateShort, dateLong, clock } from '../format.js';
import { startGym } from './activities.jsx';

const KINDS = [['weight', 'Gewicht'], ['bodyweight', 'Körpergewicht'], ['assisted', 'Unterstützt'], ['time', 'Zeit']];
const kindLabel = (k) => (KINDS.find((x) => x[0] === k) || KINDS[0])[1];
const kg = (v) => (v == null ? '' : num(v, v % 1 ? 1 : 0));
export function setText(s, kind) {
  if (!s) return '';
  const r = [];
  if (kind === 'time') r.push((s.sec || 0) + ' s');
  else r.push((s.reps ?? '–') + ' Wdh.');
  if (kind === 'weight' && s.kg != null) r.push(kg(s.kg) + ' kg');
  if (kind === 'bodyweight' && s.kg) r.push('+' + kg(s.kg) + ' kg');
  if (kind === 'assisted' && s.kg != null) r.push('−' + kg(s.kg) + ' kg Hilfe');
  if (s.rir != null) r.push('RIR ' + s.rir);
  else if (s.rpe != null) r.push('RPE ' + s.rpe);
  return r.join(' · ');
}

function useHistory(excludeId) {
  const d = useData();
  return useMemo(() => exerciseHistory(d.gymSessions.filter((s) => s.id !== excludeId)), [d.v, excludeId]);
}

// ---------- Einheit erfassen ----------
export function GymSession({ id }) {
  const d = useData();
  const S = getState();
  const s = S.gym[id];
  const hist = useHistory(id);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!s) return <div class="view"><Top title="Gym" /><div class="empty"><h3>Einheit nicht gefunden</h3></div></div>;
  const save = (p) => patchDoc('gym/' + id, p);
  const exs = s.exercises || [];
  const setEx = (i, e) => save({ exercises: exs.map((x, k) => (k === i ? e : x)) });
  const lastSetAt = Math.max(0, ...exs.flatMap((e) => (e.sets || []).map((x) => x.at || 0)));
  const rest = lastSetAt && now - lastSetAt < 15 * 60000 ? Math.round((now - lastSetAt) / 1000) : null;
  const nSets = exs.reduce((x, e) => x + (e.sets || []).length, 0);
  const candidates = d.list.filter((a) => a.src === 'strava' && a.sport === 'gym' && a.date === s.date && !a.gymId);
  const linked = s.linked ? d.byId[s.linked] : null;

  const addSet = (i, copyFrom) => {
    const e = exs[i];
    const prevInSession = (e.sets || [])[(e.sets || []).length - 1];
    const hx = hist[e.name.trim().toLowerCase()];
    const lastSess = hx && hx.last ? hx.last.sets[Math.min((e.sets || []).length, hx.last.sets.length - 1)] : null;
    const base = copyFrom || prevInSession || lastSess || (e.kind === 'time' ? { sec: 30 } : { reps: 10, kg: e.kind === 'weight' ? 20 : null });
    const set = { reps: base.reps ?? null, kg: base.kg ?? null, sec: base.sec ?? null, rpe: null, rir: null, at: Date.now() };
    setEx(i, { ...e, sets: [...(e.sets || []), set] });
    return (e.sets || []).length;
  };
  return (
    <div class="view">
      <Top title="Gym" actions={<button type="button" class="iconbtn" aria-label="Einheit bearbeiten, als Vorlage speichern oder löschen" onClick={() => openSheet(() => <SessionMenu s={s} />)}><Icon.dots /></button>} />
      <div class="pad stack" style="gap:2px;margin-bottom:8px">
        <h1 style="font-family:var(--display);font-size:var(--fs-t1)">{s.title}</h1>
        <div class="small muted">{dateLong(s.date)} · {nSets} {nSets === 1 ? 'Satz' : 'Sätze'}{s.tpl && S.gymtpl[s.tpl] ? ' · Vorlage „' + S.gymtpl[s.tpl].name + '"' : ''}</div>
      </div>
      {rest != null ? <div class="pad"><span class="pill" aria-live="off">Pause seit letztem Satz: {clock(rest)}</span></div> : null}
      {exs.map((e, i) => {
        const hx = hist[e.name.trim().toLowerCase()];
        return (
          <div class="card p" style="margin-top:12px">
            <div class="row">
              <div class="grow"><b>{e.name}</b><div class="tiny muted">{kindLabel(e.kind)}{hx && hx.last ? ' · zuletzt ' + dateShort(hx.last.date) + ': ' + hx.last.sets.map((x) => setText(x, e.kind).split(' · ').slice(0, 2).join(' ')).join(', ') : ' · neu'}</div></div>
              <button type="button" class="iconbtn" aria-label={'Übung ' + e.name + ' bearbeiten'} onClick={() => openSheet(() => <ExerciseMenu s={s} i={i} />)}><Icon.dots /></button>
            </div>
            <div class="sets" style="margin-top:8px">
              {(e.sets || []).map((st, k) => (
                <button type="button" class="setrow" onClick={() => openSheet(() => <SetSheet sid={id} i={i} k={k} />)} aria-label={'Satz ' + (k + 1) + ': ' + setText(st, e.kind) + '. Bearbeiten'}>
                  <span class="n">{k + 1}</span><span class="grow">{setText(st, e.kind)}</span>{st.warm ? <span class="pill">Aufwärmen</span> : null}
                  {k > 0 && st.at && e.sets[k - 1].at ? <span class="tiny faint">Pause {clock(Math.round((st.at - e.sets[k - 1].at) / 1000))}</span> : null}
                </button>
              ))}
            </div>
            <div class="row" style="margin-top:8px">
              <button type="button" class="btn grow" onClick={() => addSet(i)}>
                + Satz {(e.sets || []).length ? 'wie eben' : hx && hx.last ? 'wie zuletzt' : ''}
              </button>
              <button type="button" class="btn sec2" onClick={() => { const k = addSet(i); openSheet(() => <SetSheet sid={id} i={i} k={k} />); }}>Anders …</button>
            </div>
          </div>
        );
      })}
      <div class="pad" style="margin-top:12px"><button type="button" class="btn sec2 wide" onClick={() => openSheet(() => <AddExercise sid={id} hist={hist} />)}>+ Übung hinzufügen</button></div>
      <Section title="Abschluss">
        <div class="card p stack" style="gap:10px">
          <Scale label="Anstrengung der Einheit (1–10)" value={s.rpe} onChange={(v) => save({ rpe: v })} />
          <Stepper id="g-dur" label="Dauer" unit="min" value={s.dur ? Math.round(s.dur / 60) : null} step={5} onChange={(v) => save({ dur: v ? v * 60 : undefined })} />
          {linked ? <Note>Verknüpft mit der Aufzeichnung „{linked.name}". Die Einheit zählt einmal, Dauer und Puls kommen von dort. <button type="button" class="btn ghost" onClick={() => save({ linked: undefined })}>Lösen</button></Note>
            : candidates.length ? candidates.map((a) => <button type="button" class="btn sec2" onClick={() => { save({ linked: a.id }); toast('Verknüpft'); }}>Mit Aufzeichnung „{a.name}" ({dur(a.mov)}) verknüpfen</button>)
            : <div class="tiny faint">Hast du die Einheit auch mit der Uhr aufgezeichnet? Nach dem nächsten Abgleich kannst du sie hier verknüpfen, damit sie nur einmal zählt.</div>}
          <button type="button" class="btn wide" onClick={() => { if (!s.dur && !linked && lastSetAt) save({ dur: Math.max(600, Math.round((lastSetAt - (s.createdAt || lastSetAt)) / 1000) + 120) }); pop(); toast('Einheit gespeichert'); }}>Fertig</button>
        </div>
      </Section>
      <div class="spacer" />
    </div>
  );
}

function SetSheet({ sid, i, k }) {
  const s = getState().gym[sid];
  const e = s.exercises[i];
  const [st, setSt] = useState({ ...e.sets[k] });
  const set = (key, v) => setSt({ ...st, [key]: v });
  const write = (sets) => patchDoc('gym/' + sid, { exercises: s.exercises.map((x, n) => (n === i ? { ...x, sets } : x)) });
  return (
    <Sheet title={e.name + ' · Satz ' + (k + 1)}>
      {e.kind === 'time' ? <Stepper id="st-sec" label="Dauer" unit="s" value={st.sec} step={5} max={3600} onChange={(v) => set('sec', v)} />
        : <Stepper id="st-reps" label="Wiederholungen" value={st.reps} step={1} max={200} onChange={(v) => set('reps', v)} />}
      {e.kind !== 'time' ? <Stepper id="st-kg" label={e.kind === 'assisted' ? 'Unterstützung' : e.kind === 'bodyweight' ? 'Zusatzgewicht' : 'Gewicht'} unit="kg" value={st.kg} step={e.kind === 'weight' ? 2.5 : 5} decimals={1} max={500} onChange={(v) => set('kg', v)} /> : null}
      <Seg value={st.rir != null ? 'rir' : 'rpe'} onChange={(v) => setSt({ ...st, rir: v === 'rir' ? (st.rir ?? 2) : null, rpe: v === 'rpe' ? (st.rpe ?? 8) : null })} label="Anstrengung als" options={[['rpe', 'RPE'], ['rir', 'Wdh. in Reserve']]} />
      {st.rir != null ? <Scale label="Wiederholungen in Reserve" from={0} to={5} value={st.rir} onChange={(v) => set('rir', v)} /> : <Scale label="RPE (optional)" from={5} to={10} value={st.rpe} onChange={(v) => set('rpe', v === st.rpe ? null : v)} />}
      <label class="row small"><input type="checkbox" checked={!!st.warm} onChange={(ev) => set('warm', ev.target.checked || undefined)} /> Aufwärmsatz (zählt nicht für Fortschritt)</label>
      <button type="button" class="btn wide" onClick={() => { write(e.sets.map((x, n) => (n === k ? st : x))); closeSheet(); }}>Speichern</button>
      <button type="button" class="btn sec2 wide" onClick={() => { write(e.sets.filter((x, n) => n !== k)); closeSheet(); }}>Satz löschen</button>
    </Sheet>
  );
}

function AddExercise({ sid, hist }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('weight');
  const s = getState().gym[sid];
  const have = new Set((s.exercises || []).map((e) => e.name.trim().toLowerCase()));
  const tplNames = Object.values(getState().gymtpl).flatMap((t) => t.exercises || []);
  const known = {};
  for (const x of Object.values(hist)) known[x.name.toLowerCase()] = { name: x.name, kind: x.kind, n: x.entries.length };
  for (const e of tplNames) if (!known[e.name.toLowerCase()]) known[e.name.toLowerCase()] = { name: e.name, kind: e.kind || 'weight', n: 0 };
  const list = Object.values(known).filter((x) => !have.has(x.name.toLowerCase()) && (!q || x.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.n - a.n).slice(0, 30);
  const add = (name, k) => { patchDoc('gym/' + sid, { exercises: [...(s.exercises || []), { name: name.trim(), kind: k, sets: [] }] }); closeSheet(); };
  return (
    <Sheet title="Übung hinzufügen">
      <div class="field"><label for="ex-q">Übung suchen oder neu anlegen</label><input id="ex-q" class="input" value={q} onInput={(e) => setQ(e.target.value)} placeholder="z. B. Kniebeuge" /></div>
      {list.length ? <div class="list" style="margin:0">{list.map((x) => <Cell onClick={() => add(x.name, x.kind)} title={x.name} sub={kindLabel(x.kind) + (x.n ? ' · ' + x.n + '× trainiert' : '')} chev={false} />)}</div> : null}
      {q && !known[q.trim().toLowerCase()] ? (
        <Fragment>
          <Seg value={kind} onChange={setKind} label="Art" options={KINDS} />
          <button type="button" class="btn wide" onClick={() => add(q, kind)}>„{q.trim()}" anlegen</button>
        </Fragment>
      ) : null}
    </Sheet>
  );
}

function ExerciseMenu({ s, i }) {
  const e = s.exercises[i];
  const [name, setName] = useState(e.name);
  const [kind, setKind] = useState(e.kind || 'weight');
  const write = (exs) => { patchDoc('gym/' + s.id, { exercises: exs }); closeSheet(); };
  return (
    <Sheet title="Übung">
      <div class="field"><label for="em-n">Name</label><input id="em-n" class="input" value={name} onInput={(ev) => setName(ev.target.value)} /></div>
      <Seg value={kind} onChange={setKind} label="Art" options={KINDS} />
      <button type="button" class="btn wide" onClick={() => write(s.exercises.map((x, k) => (k === i ? { ...x, name: name.trim(), kind } : x)))}>Speichern</button>
      <div class="row">
        <button type="button" class="btn sec2 grow" disabled={i === 0} onClick={() => { const l = s.exercises.slice(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; write(l); }}>Nach oben</button>
        <button type="button" class="btn sec2 grow" onClick={() => push('gym-exercise', { name: e.name })}>Verlauf</button>
      </div>
      <button type="button" class="btn danger wide" onClick={() => write(s.exercises.filter((x, k) => k !== i))}>Übung aus dieser Einheit entfernen</button>
    </Sheet>
  );
}

function SessionMenu({ s }) {
  const [title, setTitle] = useState(s.title);
  const [date, setDate] = useState(s.date);
  const [sure, setSure] = useState(false);
  return (
    <Sheet title="Einheit">
      <div class="field"><label for="sm-t">Titel</label><input id="sm-t" class="input" value={title} onInput={(e) => setTitle(e.target.value)} /></div>
      <div class="field"><label for="sm-d">Datum</label><input id="sm-d" class="input" type="date" value={date} onInput={(e) => setDate(e.target.value)} /></div>
      <button type="button" class="btn wide" onClick={() => { patchDoc('gym/' + s.id, { title, date, start: date + (s.start || '').slice(10) }); closeSheet(); }}>Speichern</button>
      <button type="button" class="btn sec2 wide" onClick={() => { const id = newId('t'); setDoc('gymtpl/' + id, { id, name: title, exercises: (s.exercises || []).map((e) => ({ name: e.name, kind: e.kind || 'weight' })) }); closeSheet(); toast('Als Vorlage gespeichert'); }}>Als Vorlage speichern</button>
      {sure ? <button type="button" class="btn danger wide" onClick={() => { delDoc('gym/' + s.id); closeSheet(); pop(); toast('Einheit gelöscht'); }}>Wirklich löschen</button>
        : <button type="button" class="btn sec2 wide" onClick={() => setSure(true)}>Einheit löschen …</button>}
    </Sheet>
  );
}

// ---------- Übungen und Fortschritt ----------
export function GymExercises() {
  const d = useData();
  const hist = useMemo(() => exerciseHistory(d.gymSessions), [d.v]);
  const list = Object.values(hist).filter((x) => x.entries.length).sort((a, b) => (a.last.date < b.last.date ? 1 : -1));
  const tpls = Object.values(getState().gymtpl);
  return (
    <div class="view">
      <Top title="Krafttraining" />
      <div class="pad row" style="gap:8px;margin-bottom:6px">
        <button type="button" class="btn grow" onClick={() => startGym()}>Leere Einheit starten</button>
        <button type="button" class="btn sec2" onClick={() => push('gym-templates')}>Vorlagen</button>
      </div>
      {tpls.length ? <Section title="Mit Vorlage starten"><div class="list">{tpls.map((t) => <Cell onClick={() => startGym(t.id)} title={t.name} sub={(t.exercises || []).map((e) => e.name).join(', ')} />)}</div></Section> : null}
      <Section title="Übungen">
        {list.length ? <div class="list">{list.map((x) => <Cell onClick={() => push('gym-exercise', { name: x.name })} title={x.name} sub={kindLabel(x.kind) + ' · ' + x.entries.length + ' Einheiten · zuletzt ' + dateShort(x.last.date)} right={<span class="small">{prText(x)}</span>} />)}</div>
          : <div class="card p small muted">Noch keine Sätze erfasst. Starte eine Einheit – hansport merkt sich jede Übung und schlägt beim nächsten Mal deine letzten Werte vor.</div>}
      </Section>
      <Section title="Letzte Einheiten">
        <div class="list">{d.gymSessions.slice(0, 15).map((s) => <Cell onClick={() => push('gym', { id: s.id })} left={<Mark sport="gym" />} title={s.title} sub={dateShort(s.date) + ' · ' + (s.exercises || []).length + ' Übungen' + (s.linked ? ' · mit Strava verknüpft' : '')} />)}</div>
      </Section>
      <div class="spacer" />
    </div>
  );
}

function prText(x) {
  if (!x.pr) return '';
  if (x.kind === 'weight') return 'Bestwert ' + kg(x.prKg.topKg) + ' kg';
  if (x.kind === 'bodyweight') return 'Bestwert ' + x.pr.maxReps + ' Wdh.';
  if (x.kind === 'time') return 'Bestwert ' + x.pr.maxSec + ' s';
  if (x.kind === 'assisted') return 'Bestwert −' + kg(x.pr.minAssist) + ' kg';
  return '';
}

export function GymExercise({ name }) {
  const d = useData();
  const hist = useMemo(() => exerciseHistory(d.gymSessions), [d.v]);
  const x = hist[name.trim().toLowerCase()];
  const [metric, setMetric] = useState('top');
  if (!x || !x.entries.length) return <div class="view"><Top title={name} /><div class="empty">Noch keine Sätze zu dieser Übung. Trag sie in einer Krafteinheit ein.</div></div>;
  const E = x.entries;
  const get = { top: (e) => (x.kind === 'weight' ? e.topKg : x.kind === 'bodyweight' ? e.maxReps : x.kind === 'time' ? e.maxSec : e.minAssist), e1rm: (e) => e.e1rm, vol: (e) => e.vol }[metric];
  const fmt = metric === 'vol' ? (v) => int(v) + ' kg' : metric === 'e1rm' ? (v) => num(v, 1) + ' kg' : x.kind === 'weight' || x.kind === 'assisted' ? (v) => kg(v) + ' kg' : x.kind === 'time' ? (v) => v + ' s' : (v) => v + ' Wdh.';
  const pts = E.map((e) => ({ id: e.session, date: e.date, y: get(e), label: dateShort(e.date) })).filter((p) => p.y);
  const comp = x.kind === 'weight' ? comparableLoad(E) : [];
  const half = Math.floor(comp.length / 2);
  return (
    <div class="view">
      <Top title="Übung" />
      <div class="pad stack" style="gap:2px;margin-bottom:8px"><h1 style="font-family:var(--display);font-size:var(--fs-t1)">{x.name}</h1><div class="small muted">{kindLabel(x.kind)} · {E.length} Einheiten</div></div>
      <div class="card p">
        <div class="stats">
          {x.kind === 'weight' ? <Fragment>
            <div class="stat"><div class="v">{kg(x.prKg.topKg)}<small>kg</small></div><div class="l">Schwerster Satz · {dateShort(x.prKg.date)}</div></div>
            {x.pr ? <div class="stat"><div class="v">{num(x.pr.e1rm, 1)}<small>kg</small></div><div class="l">1RM <Est text="geschätzt" /></div></div> : null}
          </Fragment> : <div class="stat"><div class="v">{prText(x).replace('Bestwert ', '')}</div><div class="l">Bestwert · {dateShort(x.pr.date)}</div></div>}
          <div class="stat"><div class="v">{x.last.sets.length}<small>Sätze</small></div><div class="l">Zuletzt · {dateShort(x.last.date)}</div></div>
        </div>
        {x.kind === 'weight' ? <div class="chart-sum">1RM nach Epley aus Sätzen bis 12 Wiederholungen geschätzt, nicht gemessen. Aufwärmsätze zählen nicht.</div> : null}
      </div>
      <Section title="Verlauf">
        <div class="card p">
          {x.kind === 'weight' ? <Seg value={metric} onChange={setMetric} label="Kennzahl" options={[['top', 'Schwerster Satz'], ['e1rm', '1RM gesch.'], ['vol', 'Volumen']]} /> : null}
          <div style="margin-top:8px"><Points items={pts} fmt={fmt} label={x.name + ' Verlauf'} onSelect={(p) => push('gym', { id: p.id })} /></div>
        </div>
      </Section>
      {comp.length >= 4 ? (
        <Section title="Vergleichbare Sätze (6–12 Wdh.)">
          <div class="card p small">Ø Gewicht in Arbeitssätzen mit 6–12 Wiederholungen: zuletzt {num(median(comp.slice(half).map((c) => c.avgKg)), 1)} kg, davor {num(median(comp.slice(0, half).map((c) => c.avgKg)), 1)} kg (je {comp.length - half} und {half} Einheiten).</div>
        </Section>
      ) : null}
      <Section title="Alle Einheiten">
        <div class="list">{E.slice().reverse().map((e) => <Cell onClick={() => push('gym', { id: e.session })} title={dateShort(e.date)} sub={e.sets.map((st) => setText(st, x.kind).split(' · ').slice(0, 2).join(' ')).join(' | ')} right={e === x.pr || e === x.prKg ? <span class="pill good">Bestwert</span> : null} />)}</div>
      </Section>
      <div class="spacer" />
    </div>
  );
}

// ---------- Vorlagen ----------
export function GymTemplates() {
  useData();
  const tpls = Object.values(getState().gymtpl);
  return (
    <div class="view">
      <Top title="Vorlagen" actions={<button type="button" class="iconbtn" aria-label="Neue Vorlage" onClick={() => openSheet(() => <TplSheet />)}><Icon.plus /></button>} />
      {tpls.length ? <div class="list">{tpls.map((t) => <Cell title={t.name} sub={(t.exercises || []).map((e) => e.name).join(', ') || 'keine Übungen'} right={<div class="row" style="gap:6px"><button type="button" class="btn ghost" onClick={() => openSheet(() => <TplSheet t={t} />)}>Bearbeiten</button><button type="button" class="btn sec2" style="min-height:36px;padding:4px 12px" onClick={() => startGym(t.id)}>Start</button></div>} />)}</div>
        : <div class="empty"><h3>Noch keine Vorlagen</h3>Lege eine an oder speichere eine Einheit als Vorlage.</div>}
      <div class="spacer" />
    </div>
  );
}

function TplSheet({ t }) {
  const [name, setName] = useState(t ? t.name : '');
  const [exs, setExs] = useState(t ? t.exercises.slice() : []);
  const [nx, setNx] = useState('');
  const [kind, setKind] = useState('weight');
  return (
    <Sheet title={t ? 'Vorlage bearbeiten' : 'Neue Vorlage'}>
      <div class="field"><label for="tp-n">Name</label><input id="tp-n" class="input" value={name} onInput={(e) => setName(e.target.value)} placeholder="z. B. Oberkörper" /></div>
      {exs.map((e, i) => <div class="row small"><span class="grow">{i + 1}. {e.name} <span class="muted">({kindLabel(e.kind)})</span></span><button type="button" class="btn ghost" onClick={() => setExs(exs.filter((x, k) => k !== i))}>Entfernen</button></div>)}
      <div class="field"><label for="tp-x">Übung hinzufügen</label><input id="tp-x" class="input" value={nx} onInput={(e) => setNx(e.target.value)} /></div>
      <Seg value={kind} onChange={setKind} label="Art" options={KINDS} />
      <button type="button" class="btn sec2 wide" disabled={!nx.trim()} onClick={() => { setExs([...exs, { name: nx.trim(), kind }]); setNx(''); }}>Übung übernehmen</button>
      <button type="button" class="btn wide" disabled={!name.trim()} onClick={() => { const id = t ? t.id : newId('t'); setDoc('gymtpl/' + id, { id, name: name.trim(), exercises: exs }); closeSheet(); }}>Speichern</button>
      {t ? <button type="button" class="btn danger wide" onClick={() => { delDoc('gymtpl/' + t.id); closeSheet(); }}>Vorlage löschen</button> : null}
    </Sheet>
  );
}
