import { h, Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useData, ActRow } from './common.jsx';
import { Top, Section, Icon, Sheet, Stepper, Scale, Note, Cell, Mark, sportColor } from '../ui/kit.jsx';
import { push, openSheet, closeSheet } from '../nav.js';
import { getState, setDoc, delDoc, newId, toast, patchDoc } from '../store.js';
import { correlations, median, periodOf, addDays, aggregate, isoWeek } from '../analysis.js';
import { today, dateLong, dateShort, monthName, num, int, hours, parseDate, isoDate, dateMid } from '../format.js';
import { MediaBlock } from './activity.jsx';
import { WEB } from '../env.js';

const ENERGY = ['1 · leer', '2 · müde', '3 · normal', '4 · gut', '5 · voller Energie'];
const SORE = ['0 · kein', '1 · leicht', '2 · deutlich', '3 · stark'];
const BREAK_KINDS = ['Geplante Pause', 'Krank', 'Verletzung', 'Urlaub', 'Reise / Arbeit', 'Sonstiges'];

export function journalEntry(date) {
  const m = getState().journal[date.slice(0, 7)];
  return (m && m.days && m.days[date]) || null;
}
function saveEntry(date, entry) {
  const ym = date.slice(0, 7);
  const cur = getState().journal[ym] || { days: {} };
  const days = { ...(cur.days || {}) };
  if (entry) days[date] = { ...entry, at: Date.now() }; else delete days[date];
  setDoc('journal/' + ym, { days });
}

export function Journal() {
  const d = useData();
  const S = getState();
  const t = today();
  const [ym, setYm] = useState(t.slice(0, 7));
  const e = d.journal[t];
  const corr = useMemo(() => correlations(d.journal, d.list.filter((a) => !a.excluded)), [d.v]);
  const breaks = Object.values(S.breaks).sort((a, b) => (a.from < b.from ? 1 : -1));
  const nEntries = Object.keys(d.journal).length;
  return (
    <div class="view">
      <Top title="Journal" back={false} large actions={<button type="button" class="iconbtn" aria-label="Eintrag für heute" onClick={() => openSheet(() => <EntrySheet date={t} />)}><Icon.plus /></button>} />
      <div class="card p">
        <div class="row"><b class="grow">Heute, {dateShort(t)}</b>{e ? <button type="button" class="btn ghost" onClick={() => openSheet(() => <EntrySheet date={t} />)}>Bearbeiten</button> : null}</div>
        {e ? <EntrySummary e={e} /> : (
          <Fragment>
            <div class="small muted" style="margin:6px 0 10px">Schlaf, Ruhepuls, HRV, Gewicht, Energie, Muskelkater – alles optional.</div>
            <button type="button" class="btn wide" onClick={() => openSheet(() => <EntrySheet date={t} />)}>Eintrag für heute</button>
          </Fragment>
        )}
      </div>
      <Section title="Kalender">
        <div class="card p"><Calendar ym={ym} setYm={setYm} d={d} breaks={breaks} /></div>
      </Section>
      <Section title="Training und Erholung je Woche">
        <WeekTable d={d} />
      </Section>
      <Section title="Beobachtete Zusammenhänge">
        <div class="stack pad" style="padding:0 16px">
          {corr.map((c) => (
            <div class="card p" style="margin:0">
              <div class="row"><b class="grow">{c.title}</b><span class={'pill' + (c.ok ? ' good' : '')}>{c.ok ? 'n = ' + c.n : 'zu wenig Daten'}</span></div>
              <p class="small" style="margin:6px 0 0">{c.text}</p>
              {c.ok ? <div class="tiny muted" style="margin-top:4px">{c.compare}. Grundlage: {c.basis}. Beobachtung, keine Ursache.</div> : null}
            </div>
          ))}
        </div>
        <div class="subhead" style="margin-top:6px">{nEntries} Journaleinträge bisher. Zusammenhänge erscheinen ab vier Einträgen pro Gruppe.</div>
      </Section>
      <Section title="Pausen und Umstände" action="Hinzufügen" onAction={() => openSheet(() => <BreakSheet />)}>
        {breaks.length ? <div class="list">{breaks.map((b) => <Cell onClick={() => openSheet(() => <BreakSheet b={b} />)} title={b.kind} sub={dateMid(b.from) + (b.to && b.to !== b.from ? ' – ' + dateMid(b.to) : '') + (b.note ? ' · ' + b.note : '')} />)}</div>
          : <div class="card p small muted">Trag geplante Pausen, Krankheit oder Reisen ein. Sie erscheinen im Kalender und erklären Lücken in Rückblicken.</div>}
      </Section>
      <Section title="Apple Health">
        <Note>hansport läuft als Web-App{WEB ? '' : ' in Claude'}. Ein direkter Zugriff auf Apple Health ist nur in einer nativen iPhone-App möglich. Bis dahin funktioniert die manuelle Eingabe vollständig: Werte aus der Health-App einfach hier eintragen.</Note>
      </Section>
      <div class="spacer" />
    </div>
  );
}

function EntrySummary({ e }) {
  const items = [
    e.sleep != null ? ['Schlaf', num(e.sleep, 1) + ' h'] : null, e.rhr != null ? ['Ruhepuls', e.rhr + ' bpm'] : null,
    e.hrv != null ? ['HRV', e.hrv + ' ms'] : null, e.weight != null ? ['Gewicht', num(e.weight, 1) + ' kg'] : null,
    e.energy != null ? ['Energie', ENERGY[e.energy - 1]] : null, e.soreness != null ? ['Muskelkater', SORE[e.soreness]] : null,
  ].filter(Boolean);
  return (
    <div style="margin-top:8px">
      <dl class="kv">{items.map(([k, v]) => <Fragment><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
      {e.note ? <p class="small" style="margin:8px 0 0">{e.note}</p> : null}
    </div>
  );
}

export function EntrySheet({ date }) {
  const prev = journalEntry(date) || {};
  const [f, setF] = useState({ sleep: null, rhr: null, hrv: null, weight: null, energy: null, soreness: null, note: '', ...prev });
  const [dt, setDt] = useState(date);
  const set = (k, v) => setF({ ...f, [k]: v });
  const lastWeight = useMemo(() => { const j = Object.entries(useDataJournal()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).find(([, x]) => x.weight != null); return j ? j[1].weight : null; }, []);
  return (
    <Sheet title={'Journal · ' + dateShort(dt)}>
      <div class="field"><label for="j-date">Datum</label><input id="j-date" class="input" type="date" value={dt} onInput={(e) => setDt(e.target.value)} /></div>
      <div class="row"><div class="grow"><Stepper id="j-sleep" label="Schlaf" unit="h" value={f.sleep} step={0.5} decimals={1} max={16} onChange={(v) => set('sleep', v)} /></div><div class="grow"><Stepper id="j-rhr" label="Ruhepuls" unit="bpm" value={f.rhr} step={1} max={140} onChange={(v) => set('rhr', v)} /></div></div>
      <div class="row"><div class="grow"><Stepper id="j-hrv" label="HRV" unit="ms" value={f.hrv} step={1} max={300} onChange={(v) => set('hrv', v)} /></div><div class="grow"><Stepper id="j-w" label="Gewicht" unit="kg" value={f.weight ?? null} step={0.1} decimals={1} max={250} onChange={(v) => set('weight', v)} /></div></div>
      {f.weight == null && lastWeight ? <button type="button" class="btn ghost" onClick={() => set('weight', lastWeight)}>Gewicht wie zuletzt: {num(lastWeight, 1)} kg</button> : null}
      <Scale label="Energie" from={1} to={5} value={f.energy} onChange={(v) => set('energy', v)} labels={ENERGY} />
      <Scale label="Muskelkater" from={0} to={3} value={f.soreness} onChange={(v) => set('soreness', v)} labels={SORE} />
      <div class="field"><label for="j-note">Notiz</label><textarea id="j-note" class="input" value={f.note} onInput={(e) => set('note', e.target.value)} placeholder="Stimmung, Stress, Besonderes …" /></div>
      <button type="button" class="btn wide" onClick={() => { const clean = {}; for (const [k, v] of Object.entries(f)) if (v != null && v !== '' && k !== 'at') clean[k] = v; if (dt !== date && journalEntry(date)) saveEntry(date, null); saveEntry(dt, clean); closeSheet(); toast('Gespeichert'); }}>Speichern</button>
      {journalEntry(date) ? <button type="button" class="btn sec2 wide" onClick={() => { saveEntry(date, null); closeSheet(); toast('Eintrag gelöscht'); }}>Eintrag löschen</button> : null}
    </Sheet>
  );
}
function useDataJournal() { const j = {}; for (const ch of Object.values(getState().journal)) Object.assign(j, ch.days || {}); return j; }

function BreakSheet({ b }) {
  const [f, setF] = useState(b || { kind: 'Geplante Pause', from: today(), to: today(), note: '' });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Sheet title={b ? 'Pause bearbeiten' : 'Pause oder Umstand'}>
      <div class="field"><label for="b-kind">Art</label><select id="b-kind" class="input" value={f.kind} onChange={(e) => set('kind', e.target.value)}>{BREAK_KINDS.map((k) => <option>{k}</option>)}</select></div>
      <div class="row"><div class="field grow"><label for="b-from">Von</label><input id="b-from" class="input" type="date" value={f.from} onInput={(e) => set('from', e.target.value)} /></div><div class="field grow"><label for="b-to">Bis</label><input id="b-to" class="input" type="date" value={f.to} onInput={(e) => set('to', e.target.value)} /></div></div>
      <div class="field"><label for="b-note">Notiz</label><input id="b-note" class="input" value={f.note} onInput={(e) => set('note', e.target.value)} /></div>
      <button type="button" class="btn wide" onClick={() => { const id = (b && b.id) || newId('b'); setDoc('breaks/' + id, { ...f, id, to: f.to < f.from ? f.from : f.to }); closeSheet(); }}>Speichern</button>
      {b ? <button type="button" class="btn sec2 wide" onClick={() => { delDoc('breaks/' + b.id); closeSheet(); }}>Löschen</button> : null}
    </Sheet>
  );
}

function Calendar({ ym, setYm, d, breaks }) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startWd = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let i = 1; i <= days; i++) cells.push(ym + '-' + String(i).padStart(2, '0'));
  const byDate = {};
  for (const a of d.list) if (a.date.startsWith(ym)) (byDate[a.date] || (byDate[a.date] = [])).push(a);
  const inBreak = (dt) => breaks.find((b) => dt >= b.from && dt <= (b.to || b.from));
  const t = today();
  const shift = (n) => { const x = new Date(y, m - 1 + n, 1); setYm(isoDate(x).slice(0, 7)); };
  return (
    <div>
      <div class="row" style="margin-bottom:8px"><button type="button" class="iconbtn" aria-label="Vorheriger Monat" onClick={() => shift(-1)}>‹</button><b class="grow" style="text-align:center">{monthName(ym)}</b><button type="button" class="iconbtn" aria-label="Nächster Monat" onClick={() => shift(1)}>›</button></div>
      <div class="cal">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => <div class="h">{w}</div>)}
        {cells.map((dt) => {
          if (!dt) return <div />;
          const acts = byDate[dt] || [];
          const j = d.journal[dt];
          const br = inBreak(dt);
          return (
            <button type="button" class={(dt === t ? 'today ' : '') + (br ? 'brk' : '')} onClick={() => openSheet(() => <DaySheet date={dt} />)}
              aria-label={dateLong(dt) + ': ' + (acts.length ? acts.length + ' Aktivitäten' : 'keine Aktivität') + (j ? ', Journaleintrag' : '') + (br ? ', ' + br.kind : '')}>
              <span>{+dt.slice(8)}</span>
              {j ? <span class="j" aria-hidden="true" /> : null}
              <span class="dots" aria-hidden="true">{acts.slice(0, 4).map((a) => <i style={{ background: sportColor(a.sport) }} />)}</span>
            </button>
          );
        })}
      </div>
      <div class="legend-row" style="margin-top:8px"><span><i style="background:var(--focus);border-radius:50%" />Journal</span><span><i style="background:repeating-linear-gradient(135deg,var(--surface),var(--surface) 2px,var(--line) 2px,var(--line) 4px)" />Pause</span><span>Farbpunkte: Sportarten</span></div>
    </div>
  );
}

function DaySheet({ date }) {
  const d = useData();
  const acts = d.list.filter((a) => a.date === date);
  const e = d.journal[date];
  const br = Object.values(getState().breaks).find((b) => date >= b.from && date <= (b.to || b.from));
  return (
    <Sheet title={dateLong(date)}>
      {br ? <div class="pill warn">{br.kind}{br.note ? ': ' + br.note : ''}</div> : null}
      {acts.length ? <div class="list" style="margin:0">{acts.map((a) => <div onClick={closeSheet}><ActRow a={a} /></div>)}</div> : <div class="small muted">Keine Aktivität.</div>}
      {e ? <div class="card p" style="margin:0"><EntrySummary e={e} /></div> : null}
      <button type="button" class="btn wide" onClick={() => { closeSheet(); openSheet(() => <EntrySheet date={date} />); }}>{e ? 'Journal bearbeiten' : 'Journaleintrag hinzufügen'}</button>
      <button type="button" class="btn sec2 wide" onClick={() => { closeSheet(); openSheet(() => <BreakSheet b={null} />); }}>Pause eintragen</button>
    </Sheet>
  );
}

function WeekTable({ d }) {
  const t = today();
  const rows = [];
  let p = periodOf('week', t);
  for (let i = 0; i < 8; i++) {
    const as = d.list.filter((a) => !a.excluded && a.date >= p.start && a.date <= p.end);
    const A = aggregate(as);
    const js = Object.entries(d.journal).filter(([k]) => k >= p.start && k <= p.end).map(([, v]) => v);
    rows.push({ p, A, sleep: median(js.map((x) => x.sleep)), rhr: median(js.map((x) => x.rhr)), energy: median(js.map((x) => x.energy)), n: js.length });
    p = periodOf('week', addDays(p.start, -1));
  }
  return (
    <div class="card" style="overflow-x:auto;padding:4px 8px">
      <table class="table nw" style="min-width:380px">
        <thead><tr><th>Woche</th><th>Training</th><th>Anstr.</th><th>Schlaf</th><th>Ruhepuls</th><th>Energie</th></tr></thead>
        <tbody>{rows.map((r) => <tr><td>KW {isoWeek(r.p.start)}{r.p.end >= t ? ' (läuft)' : ''}</td><td>{hours(r.A.time)}</td><td>{r.A.rpeAvg ? num(r.A.rpeAvg, 1) : r.A.reRate ? int(r.A.reRate) + ' RE/h' : '–'}</td><td>{r.sleep != null ? num(r.sleep, 1) + ' h' : '–'}</td><td>{r.rhr != null ? int(r.rhr) : '–'}</td><td>{r.energy != null ? num(r.energy, 1) : '–'}</td></tr>)}</tbody>
      </table>
      <div class="chart-sum" style="padding:0 6px 6px">Medianwerte der Woche. Anstrengung ist deine Bewertung (1–10), sonst Strava Relative Effort pro Stunde.</div>
    </div>
  );
}
