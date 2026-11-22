import { actIcon, dsport } from '../sports.js';
import { h, Fragment } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { useData, useStatus } from './common.jsx';
import { MapView } from '../ui/map.jsx';
import HansportLogo from '../ui/HansportLogo.jsx';
import { VScale, GBar } from '../ui/r4.jsx';
import { ATTRIBUTION } from '../ui/basemap.js';
import { decode } from '../geo.js';
import { Tile, Head, Big, NoData, Chg, Rings, Bars, ScaleG, Gauge, ArcArea, Stages, Ico, SPORT_ICON, usePullToRefresh, PtrIndicator, srcName } from '../ui/hp.jsx';
import { push, openSheet } from '../nav.js';
import { getState } from '../store.js';
import { sync } from '../strava.js';
import { syncHealth, healthDays, healthMeta, todayLocal, explainHealth } from '../health.js';
import { M, latest, series, formWord, hmin } from '../metrics.js';
import { aggregate, addDays } from '../analysis.js';
import { km, hm as hmFmt, dur, int, num, dateShort, relDate, endDot } from '../format.js';
import { sportLabel } from '../sports.js';
import { MetricSheet } from './health.jsx';
import { explain } from '../strava.js';
import { toast } from '../store.js';
import { WEB, ACT_SRC } from '../env.js';

const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const wdIdx = (d) => (new Date(d + 'T12:00:00').getDay() + 6) % 7;
const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const ago = (d, ref) => Math.round((new Date(ref + 'T12:00:00') - new Date(d + 'T12:00:00')) / 864e5);

export async function refreshAll() {
  const r = await Promise.allSettled([sync({}), syncHealth()]);
  if (r[0].status === 'rejected') toast(explain(r[0].reason), 'error');
  if (r[1].status === 'rejected') toast(explainHealth(r[1].reason), 'error');
}

export function Today() {
  const d = useData();
  const st = useStatus();
  const H = healthDays();
  const meta = healthMeta();
  const today = todayLocal();
  const [sel, setSel] = useState(today);
  const scroller = useRef();
  usePullToRefresh(scroller, refreshAll);
  const weekStart = addDays(today, -wdIdx(today));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const actDays = useMemo(() => new Set(d.list.filter((a) => !a.excluded).map((a) => a.date)), [d.v]);
  const row = H.map[sel] || { date: sel };
  const open = (key) => push('metric', { k: key });
  const noHealth = !H.list.length;
  const busy = st.syncing || st.healthSyncing;
  const L = (k) => latest(H.list, k, sel);

  return (
    <div class="view root" ref={scroller}>
      <PtrIndicator />
      <div class="brandrow">
        <HansportLogo size={20} title="hansport" />
        <button type="button" class={'hp-round' + (busy ? ' spin' : '')} aria-label="Alles abgleichen" onClick={refreshAll}><Ico n="refresh-double" /></button>
      </div>
      <div class="hp-hero" style="padding-top:var(--s-2)">
        <div class="grow" style="flex:1">
          <div class="hp-lbl">{sel === today ? 'Heute' : relDate(sel)}</div>
          <h1>{fmtDay(sel)}</h1>
        </div>
      </div>
      <div class="week" role="group" aria-label="Woche">
        {week.map((w, i) => (
          <button type="button" class={w === today ? 'today' : ''} aria-pressed={String(w === sel)} disabled={w > today} onClick={() => setSel(w)} aria-label={fmtDay(w) + (actDays.has(w) ? ', mit Training' : '')}>
            <span>{WD[i]}</span><span class="d">{+w.slice(8)}</span><span class={'dot' + (actDays.has(w) ? '' : ' off')} />
          </button>
        ))}
      </div>
      {st.healthError ? <div class="hp-banner"><Ico n="warning-triangle" /><div>{st.healthError}</div></div> : meta.notes && meta.notes.length ? <div class="hp-banner"><Ico n="info-circle" /><div>Teilweise abgeglichen: {meta.notes.join(' · ')}</div></div> : null}
      {noHealth && busy ? <div class="bento" aria-busy="true" aria-label="Gesundheitsdaten werden geladen"><div class="skel skel-tile w2" /><div class="skel skel-tile" /><div class="skel skel-tile" /></div> : null}
      {noHealth && !busy ? <div class="hp-banner"><Ico n="info-circle" /><div class="grow" style="flex:1">{WEB ? 'Noch keine Gesundheitsdaten. Gleiche Garmin und Withings ab.' : 'Noch keine Gesundheitsdaten. Gleiche Garmin und Withings über athletedata ab; beim ersten Mal fragt Claude nach deiner Erlaubnis.'}<div style="margin-top:8px"><button type="button" class="btn" disabled={busy} onClick={refreshAll}>{busy ? 'Gleiche ab …' : 'Jetzt abgleichen'}</button></div></div></div> : null}

      <div class="bento">
        <RingsTile row={row} onOpen={open} v4 />
        <LastActivity d={d} />
        <FormTile H={H} meta={meta} sel={sel} onOpen={open} v4 />
        <FitnessTile H={H} sel={sel} onOpen={open} />
        <HrvTile row={row} L={L} H={H} sel={sel} onOpen={open} v4 />
        <RhrTile row={row} L={L} H={H} sel={sel} onOpen={open} v4 />
        <SleepTile row={row} onOpen={open} v4 />
        <BBTile row={row} onOpen={open} />
        <StressTile H={H} sel={sel} onOpen={open} />
        <Vo2Tile L={L} H={H} sel={sel} onOpen={open} />
        <StepsTile H={H} sel={sel} onOpen={open} />
        <WeightTile H={H} L={L} sel={sel} onOpen={open} />
        <WeekTile d={d} today={today} H={H} />
        <RecordsTile d={d} today={today} />
      </div>

      <div class="sec"><h2>Letzte Aktivitäten</h2><button type="button" class="link" onClick={() => push('activities', {}, 'activities')}>Alle</button></div>
      <div class="list">
        {d.list.slice(0, 4).map((a) => (
          <button type="button" class="mrow" onClick={() => push('activity', { id: a.id })}>
            <span class="ic"><Ico n={actIcon(a)} /></span>
            <span><div class="t1">{a.name}</div><div class="t2">{relDate(a.date)} · {sportLabel(dsport(a))}</div></span>
            <span class="v"><b>{a.dist && !a.indoor ? km(a.dist) : dur(a.mov).split(' ')[0]}</b><small>{a.dist && !a.indoor ? 'km' : a.mov >= 3600 ? 'h' : 'min'}</small></span>
          </button>
        ))}
      </div>
      <div class="hp-sub" style="padding:10px 16px 0">
        Gesundheitsdaten {meta.lastSync ? 'abgeglichen ' + new Date(meta.lastSync).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'noch nicht abgeglichen'}{WEB ? ' · Garmin und Withings, Aktivitäten aus Garmin.' : ' · Garmin und Withings über athletedata, Aktivitäten aus Strava.'}
      </div>
    </div>
  );
}

export function RingsTile({ row, onOpen, v4 }) {
  const items = [
    { k: 'rec', v: M.rec.get(row), max: 100, color: 'var(--c-erh)', name: 'Erholung' },
    { k: 'slScore', v: row.slScore, max: 100, color: 'var(--c-sch)', name: 'Schlaf' },
    { k: 'bb', v: row.g && row.g.bbWake, max: 100, color: 'var(--ink-2)', name: 'Body Battery' },
  ];
  const say = M.rec.say(M.rec.get(row), row) || M.slScore.say(row.slScore) || null;
  return (
    <Tile cls={'w2 g-erh ' + (v4 ? 'glow multi' : 'mesh')} style={v4 ? '--gc1:var(--glow-erh);--ga1:var(--ga-erh);--gc2:var(--glow-sch);--ga2:var(--ga-sch)' : null} onClick={() => onOpen('rec')} label="Erholung, Schlaf und Body Battery, Details">
      <Head icon="battery-full" label="Bereitschaft" />
      <div class="rings">
        <Rings items={items} label={items.map((x) => x.name + ' ' + (x.v ?? 'keine Daten')).join(', ')} />
        <div class="ring-leg">
          {items.map((x) => (
            <div class="it"><span class="sw" style={{ background: x.color }} /><span class="hp-lbl">{x.name}</span><b>{x.v != null ? x.v : '–'}</b></div>
          ))}
          <div class="hp-sub" style="margin-top:0">{say || 'Für diesen Tag liegen keine Werte vor.'}</div>
        </div>
      </div>
      <div class="hp-sub" style="font-size:var(--fs-cap2)">{row.rec == null && row.rdy != null ? 'Erholung: von hansport berechnet' : 'Erholung: athletedata'} · Schlaf und Body Battery: Garmin</div>
    </Tile>
  );
}

function LastActivity({ d }) {
  const a = d.list.find((x) => !x.excluded);
  const pts = useMemo(() => (a && a.poly && !a.indoor ? decode(a.poly) : null), [a && a.id, a && a.poly]);
  if (!a) return <Tile cls="w2 g-akt"><Head icon="activity" label="Letzte Aktivität" /><NoData text={'Noch keine Aktivitäten – gleiche ' + ACT_SRC + ' ab.'} /></Tile>;
  return (
    <Tile cls="w2 g-akt" style="--gx:100%;--gy:0%;--gs:60% 70%" onClick={() => push('activity', { id: a.id })} label={'Letzte Aktivität: ' + a.name}>
      <Head icon={actIcon(a)} label={'Letzte Aktivität · ' + relDate(a.date)} src={a.origin || 'strava'} />
      <div style="font-size:var(--fs-t3);font-weight:600;letter-spacing:-.04em;line-height:1.15">{a.name}</div>
      <div class="hp-sub">{sportLabel(dsport(a))}</div>
      {pts && pts.length > 1 ? (
        <div class="la-map">
          <MapView still pad={16} maxFit={15} height="156px" fit={[pts]} fitKey={a.id}
            lines={[{ pts, color: 'var(--c-akt)', width: 3.2 }]}
            markers={[{ pt: pts[pts.length - 1], color: 'var(--ink)', ring: true, r: 4.5 }, { pt: pts[0], color: 'var(--ink)', r: 4.5 }]}
            label={'Karte der Strecke ' + a.name} attr={false} />
        </div>
      ) : null}
      {pts && pts.length > 1 ? <div class="la-attr">{ATTRIBUTION}</div> : null}
      <div class="stats-mini">
        <div><b>{a.dist ? km(a.dist) : '–'}</b><span>{a.indoor ? 'km virtuell' : 'km'}</span></div>
        <div><b>{dur(a.mov).replace(' h', '').replace(' min', '')}</b><span>{a.mov >= 3600 ? 'Std.' : 'Min.'}</span></div>
        <div><b>{a.gain ? hmFmt(a.gain) : '–'}</b><span>{a.indoor ? 'Hm virtuell' : 'Hm'}</span></div>
      </div>
    </Tile>
  );
}

export function FormTile({ H, meta, sel, onOpen, v4 }) {
  const l = latest(H.list, 'tsb', sel);
  const v = l ? l.v : null;
  const conf = meta.pmc && meta.pmc.conf;
  return (
    <Tile cls={v4 ? 'g-trn glow' + (v != null && (v < -20 || v > 15) ? ' gl-hi' : '') : ''} style={v4 ? '--gx:0%;--gy:100%' : null} onClick={() => onOpen('tsb')} label="Form, Details">
      <Head icon="compass" label="Form" src={v != null ? M.tsb.src(l.r) : null} />
      {v != null ? <Big v={(v > 0 ? '+' : '') + num(v, 0)} cls="m" /> : <NoData />}
      <ScaleG min={-40} max={30} value={v} ticks={['−40', '0', '+30']} label={'Form ' + (v ?? 'keine Daten')} />
      <div class="hp-sub">{v != null ? cap(formWord(v)) + '.' : ''}{conf === 'low' ? ' Noch wenig Verlauf.' : ''}</div>
    </Tile>
  );
}

function FitnessTile({ H, sel, onOpen }) {
  const s = series(H.map, 'ctl', sel, 42);
  const l = latest(H.list, 'ctl', sel), a = latest(H.list, 'atl', sel);
  const prev = s.slice(0, 35).reverse().find((x) => x.v != null);
  return (
    <Tile cls="g-trn" style="--gx:100%;--gy:100%" onClick={() => onOpen('ctl')} label="Fitness und Belastung, Details">
      <Head icon="graph-up" label="Fitness" />
      {l ? <Big v={num(l.v, 0)} cls="m" /> : <NoData />}
      <ArcArea values={s.map((x) => x.v)} height={46} label="Fitness über 42 Tage" />
      <div class="hp-sub">{a ? 'Belastung ' + num(a.v, 0) : 'Belastung –'}{l && prev ? ' · vor 7 T. ' + num(prev.v, 0) : ''}</div>
    </Tile>
  );
}

export function HrvTile({ row, L, H, sel, onOpen, v4 }) {
  const l = L('hrv');
  const r = l ? l.r : row;
  const b = r.base && r.base.hrv ? [r.base.hrv[0] - r.base.hrv[1], r.base.hrv[0] + r.base.hrv[1]] : null;
  const stale = l && l.date !== sel;
  const out = l && b && (l.v < b[0] || l.v > b[1]);
  const smin = b ? Math.max(0, Math.round(b[0] - (b[1] - b[0]))) : 20, smax = b ? Math.round(b[1] + (b[1] - b[0])) : 140;
  return (
    <Tile cls={'g-erh' + (v4 ? ' glow' + (out ? ' gl-hi' : '') : '')} style={v4 ? '--gx:100%;--gy:0%' : null} onClick={() => onOpen('hrv')} label="HRV, Details">
      <Head icon="activity" label="HRV" src={l ? M.hrv.src(l.r) : null} />
      {v4 ? (
        <div class="hp-row" style="align-items:center">
          <div class="grow">{l ? <Big v={int(l.v)} u="ms" cls="m" /> : <NoData />}</div>
          <VScale min={smin} max={smax} lo={b && b[0]} hi={b && b[1]} value={l && l.v} fmt={(x) => int(x)} label={'HRV ' + (l ? int(l.v) + ' ms' : 'keine Daten') + (b ? ', normal ' + int(b[0]) + ' bis ' + int(b[1]) : '')} />
        </div>
      ) : (
        <Fragment>
          {l ? <Big v={int(l.v)} u="ms" cls="m" /> : <NoData />}
          <ScaleG min={smin} max={smax} value={l && l.v} band={b} label="HRV im Vergleich zu deinem Normalbereich" />
        </Fragment>
      )}
      <div class="hp-sub">{l ? (M.hrv.say(l.v, l.r) || '') + (stale ? ' Stand ' + endDot(dateShort(l.date)) : '') : 'Keine Messung.'}{b && !v4 ? ' Normal ' + int(b[0]) + '–' + int(b[1]) + '.' : ''}</div>
    </Tile>
  );
}

export function RhrTile({ row, L, H, sel, onOpen, v4 }) {
  const l = L('rhr');
  const s = series(H.map, 'rhr', sel, 14);
  const bb = l && l.r.base && l.r.base.rhr ? l.r.base.rhr : null;
  const base = bb ? bb[0] : null;
  const lo = bb && bb[1] ? bb[0] - bb[1] : null, hi = bb && bb[1] ? bb[0] + bb[1] : null;
  const out = l && lo != null && (l.v < lo || l.v > hi);
  return (
    <Tile cls={'g-herz' + (v4 ? ' glow' + (out ? ' gl-hi' : '') : '')} style={v4 ? '--gx:100%;--gy:100%' : null} onClick={() => onOpen('rhr')} label="Ruhepuls, Details">
      <Head icon="heart" label="Ruhepuls" src={l ? M.rhr.src(l.r) : null} />
      {v4 ? (
        <div class="hp-row" style="align-items:center">
          <div class="grow">{l ? <Big v={int(l.v)} u="bpm" cls="m" /> : <NoData />}</div>
          {lo != null ? <VScale min={Math.floor(lo - (hi - lo))} max={Math.ceil(hi + (hi - lo))} lo={lo} hi={hi} value={l && l.v} fmt={(x) => int(x)} label={'Ruhepuls ' + (l ? int(l.v) + ' bpm' : 'keine Daten') + ', normal ' + int(lo) + ' bis ' + int(hi)} /> : null}
        </div>
      ) : (l ? <Big v={int(l.v)} u="bpm" cls="m" /> : <NoData />)}
      <div style="margin-top:10px"><Bars items={s.map((x) => ({ v: x.v, label: dateShort(x.date) + ': ' + (x.v != null ? x.v + ' bpm' : 'keine Daten') }))} height={34} label="Ruhepuls 14 Tage" /></div>
      <div class="hp-sub">{l && base != null ? <Fragment><Chg d={l.v - base} fmt={(x) => num(x, 0)} better="down" /> zu Ø {num(base, 0)}</Fragment> : null}{l && l.date !== sel ? ' (' + dateShort(l.date) + ')' : ''}</div>
    </Tile>
  );
}

const nightOf = (row) => { const m = row.night && /(\d{4}-\d{2}-\d{2})/.exec(row.night); const d = m ? m[1] : row.date ? addDays(row.date, -1) : null; return d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : null; };
export function SleepTile({ row, onOpen, v4 }) {
  const has = row.slMin != null || row.sl;
  const tot = row.slMin != null ? row.slMin : row.sl && row.sl.total;
  const reached = (row.slScore != null && row.slScore >= 80) || (tot != null && row.need && tot >= row.need);
  return (
    <Tile cls={'w2 g-sch' + (v4 ? ' glow' + (reached ? ' gl-hi' : '') : '')} style={v4 ? '--gx:0%;--gy:100%;--gs:70% 110%' : null} onClick={() => onOpen('sleep')} label="Schlaf, Details">
      <Head icon="half-moon" label={'Schlaf' + (nightOf(row) ? ' · Nacht vom ' + nightOf(row) : '')} src={has ? M.sleep.src(row) : null} />
      {has ? (
        <Fragment>
          <div class="hp-row" style="align-items:flex-end">
            <Big v={hmin(row.slMin != null ? row.slMin : row.sl.total)} u="h" cls="xl" />
            <span class="grow" />
            {row.slScore != null ? <div style="text-align:right"><div class="hp-lbl">Score</div><div class="big m">{row.slScore}</div></div> : null}
          </div>
          <Stages sl={row.sl} />
          <div class="hp-sub">{[M.sleep.say(row.slMin, row), row.sl && row.sl.start ? 'Eingeschlafen ' + row.sl.start + (row.sl.end ? ', wach ' + row.sl.end : '') + '.' : null].filter(Boolean).join(' ')}</div>
        </Fragment>
      ) : <NoData text="Für diese Nacht liegen keine Schlafdaten vor. Gleiche Garmin ab oder wähle eine andere Nacht." />}
    </Tile>
  );
}

function BBTile({ row, onOpen }) {
  const g = row.g || {};
  return (
    <Tile cls={'g-erh' + (g.bbWake != null && g.bbWake < 30 ? ' gl-hi' : '')} style="--gx:50%;--gy:45%;--gs:70% 70%" onClick={() => onOpen('bb')} label="Body Battery, Details">
      <Head icon="flash" label="Body Battery" src={g.bbWake != null ? 'garmin' : null} />
      <Gauge min={0} max={100} value={g.bbWake} center={g.bbWake != null ? g.bbWake : '–'} sub="AUFWACHEN" size={124} label={'Body Battery beim Aufwachen ' + (g.bbWake ?? 'keine Daten')} />
      <div class="hp-sub" style="text-align:center">{g.bbWake != null ? (g.bbCh != null ? '+' + g.bbCh + ' geladen · −' + (g.bbDr ?? '–') + ' verbraucht' : '') : 'keine Daten'}</div>
    </Tile>
  );
}

function StressTile({ H, sel, onOpen }) {
  const s = series(H.map, 'stress', sel, 14);
  const l = latest(H.list, 'stress', sel);
  return (
    <Tile cls={'g-erh' + (l && l.v > 50 ? ' gl-hi' : '')} style="--gx:100%;--gy:100%" onClick={() => onOpen('stress')} label="Stress, Details">
      <Head icon="brain" label="Stress Ø" src={l ? 'garmin' : null} />
      {l ? <Big v={l.v} u="/100" cls="m" /> : <NoData />}
      <div style="margin-top:10px"><Bars items={s.map((x) => ({ v: x.v, label: dateShort(x.date) + ': ' + (x.v != null ? 'Ø ' + x.v : 'keine Daten') }))} height={34} label="Stress 14 Tage" /></div>
      <div class="hp-sub">{l ? M.stress.say(l.v) + (l.date !== sel ? ' (' + dateShort(l.date) + ')' : '') : ''}</div>
    </Tile>
  );
}

function Vo2Tile({ L, onOpen }) {
  const l = L('vo2');
  return (
    <Tile cls="g-herz" style="--gx:50%;--gy:45%;--gs:70% 70%" onClick={() => onOpen('vo2')} label="VO2max, Details">
      <Head icon="graph-up" label="VO2max Rad" src={l ? 'garmin' : null} />
      <Gauge min={30} max={70} value={l && l.v} center={l ? l.v : '–'} sub="ML/KG/MIN" size={124} label={'VO2max ' + (l ? l.v : 'keine Daten')} />
      <div class="hp-sub" style="text-align:center">{l ? (l.r.fitAge ? 'Fitnessalter ' + l.r.fitAge : 'Schätzung von Garmin') : 'keine Daten'}</div>
    </Tile>
  );
}

function StepsTile({ H, sel, onOpen }) {
  const r = H.map[sel];
  const g = r && r.g;
  const s = series(H.map, 'steps', sel, 7);
  const partial = g && g.partial;
  const v = g ? g.steps : r ? r.steps : null;
  return (
    <Tile cls={'g-akt' + (g && g.stepsGoal && v >= g.stepsGoal ? ' gl-hi' : '')} style="--gx:100%;--gy:100%" onClick={() => onOpen('steps')} label="Schritte, Details">
      <Head icon="walking" label={partial ? 'Schritte bisher' : 'Schritte'} src={v != null ? 'garmin' : null} />
      {v != null ? <Big v={int(v)} cls="m" /> : <NoData />}
      {g && g.stepsGoal && v != null ? <GBar value={v} max={g.stepsGoal} label={'Schritte ' + int(v) + ' von ' + int(g.stepsGoal)} /> : null}
      <div style="margin-top:6px"><Bars items={s.map((x) => ({ v: x.v, label: dateShort(x.date) + ': ' + (x.v != null ? int(x.v) + ' Schritte' : 'keine Daten') }))} height={30} label="Schritte 7 Tage" /></div>
      <div class="hp-sub">{g && g.stepsGoal ? 'Ziel ' + int(g.stepsGoal) + (g.floors != null ? ' · ' + g.floors + ' Stockwerke' : '') : ''}</div>
    </Tile>
  );
}

function WeightTile({ H, L, sel, onOpen }) {
  const l = L('weight');
  const goalW = ((getState().settings.main || {}).healthGoals || {}).weight;
  const pts = H.list.filter((r) => r.wi && r.wi.weight != null && r.date <= sel).slice(-10);
  const prev = pts.length > 1 ? pts[pts.length - 2] : null;
  const old = l ? ago(l.date, sel) : null;
  return (
    <Tile cls={'w2 g-kor' + (l && goalW && l.v <= goalW ? ' gl-hi' : '')} style="--gx:100%;--gy:100%;--gs:60% 110%" onClick={() => onOpen('weight')} label="Gewicht, Details">
      <Head icon="weight" label="Gewicht" src={l ? 'withings' : null} />
      {l ? (
        <div class="hp-row" style="align-items:flex-end;gap:16px">
          <div><Big v={num(l.v, 1)} u="kg" cls="xl" /><div style="margin-top:8px">{prev ? <Chg d={l.v - prev.wi.weight} fmt={(x) => num(x, 1)} unit=" kg" label={'zur Messung vom ' + dateShort(prev.date)} /> : null}</div></div>
          <div class="grow"><Bars items={pts.map((r) => ({ v: r.wi.weight, label: dateShort(r.date) + ': ' + num(r.wi.weight, 1) + ' kg' + (r.wi.fatPct != null ? ' · Fett ' + num(r.wi.fatPct, 1) + ' %' : '') }))} height={56} label="Letzte Wägungen" /></div>
        </div>
      ) : <NoData />}
      <div class="hp-sub">{l ? (old > 14 ? 'Letzte Messung vor ' + old + ' Tagen (' + dateShort(l.date) + '). ' : 'Gemessen ' + endDot(relDate(l.date)) + ' ') + (l.r.wi.fatPct != null ? 'Körperfett ' + num(l.r.wi.fatPct, 1) + ' %, Muskeln ' + num(l.r.wi.muscle, 1) + ' kg.' : '') : 'Keine Wägung vorhanden.'}</div>
    </Tile>
  );
}

function WeekTile({ d, today, H }) {
  const w0 = addDays(today, -wdIdx(today));
  const n = wdIdx(today);
  const cur = d.list.filter((a) => a.date >= w0 && a.date <= today);
  const prev = d.list.filter((a) => a.date >= addDays(w0, -7) && a.date <= addDays(today, -7));
  const A = aggregate(cur), B = aggregate(prev);
  const im = H.list.filter((r) => r.date >= w0 && r.date <= today).reduce((s, r) => s + ((r.g && r.g.im) || 0), 0);
  const imGoal = (H.list.slice().reverse().find((r) => r.g && r.g.imGoal) || {}).g;
  const rowsW = [
    ['Zeit', dur(A.time), A.time - B.time, (x) => dur(x)],
    ['Distanz', km(A.dist) + ' km', (A.dist - B.dist) / 1000, (x) => num(x, 0) + ' km'],
    ['Höhenmeter', hmFmt(A.gain), A.gain - B.gain, (x) => int(x)],
    ['Einheiten', A.count, A.count - B.count, (x) => x],
  ];
  return (
    <Tile cls={'w2 g-akt' + (imGoal && imGoal.imGoal && im >= imGoal.imGoal ? ' gl-hi' : '')} style="--gx:100%;--gy:100%;--gs:60% 110%" onClick={() => push('reviews')} label="Diese Woche, zu den Rückblicken">
      <Head icon="calendar" label={'Diese Woche · Mo–' + WD[n]} src={WEB ? 'garmin' : 'strava'} />
      <div class="cmp">
        <span class="lb" /><span class="lb" style="text-align:right">jetzt</span><span class="lb" style="text-align:right">zur Vorwoche</span>
        {rowsW.map(([l, v, dd, f]) => <Fragment><span>{l}</span><b>{v}</b><span style="text-align:right">{dd === 0 ? <span class="hp-delta">＝ gleich</span> : <Chg d={dd} fmt={f} />}</span></Fragment>)}
      </div>
      {imGoal && imGoal.imGoal ? <GBar value={im} max={imGoal.imGoal} left={'Intensitätsminuten ' + int(im)} right={im >= imGoal.imGoal ? 'Wochenziel erreicht' : 'Ziel ' + int(imGoal.imGoal)} label={'Intensitätsminuten ' + im + ' von ' + imGoal.imGoal} /> : null}
      <div class="hp-sub">Vergleich mit Mo–{WD[n]} der Vorwoche.{im && !(imGoal && imGoal.imGoal) ? ' Intensitätsminuten (Garmin): ' + im + '.' : ''}</div>
    </Tile>
  );
}

function RecordsTile({ d, today }) {
  const y = today.slice(0, 4);
  const acts = d.list.filter((a) => !a.excluded);
  const yr = acts.filter((a) => a.date.startsWith(y));
  const lyTo = (+y - 1) + today.slice(4);
  const ly = acts.filter((a) => a.date.startsWith(String(+y - 1)) && a.date <= lyTo);
  const gY = aggregate(yr).gain, gL = aggregate(ly).gain;
  const longest = yr.filter((a) => !a.indoor).sort((a, b) => b.dist - a.dist)[0];
  const highest = yr.filter((a) => !a.indoor).sort((a, b) => b.gain - a.gain)[0];
  // Serie: Wochen in Folge mit mindestens einer Einheit
  const weeks = new Set(acts.map((a) => addDays(a.date, -wdIdx(a.date))));
  let streak = 0, w = addDays(today, -wdIdx(today));
  if (!weeks.has(w)) w = addDays(w, -7);
  while (weeks.has(w)) { streak++; w = addDays(w, -7); }
  return (
    <Tile cls="w2 g-akt" style="--gx:0%;--gy:0%;--gs:60% 90%">
      <Head icon="trophy" label={'Rekorde und Serien ' + y} src={WEB ? null : 'strava'} />
      <div class="cmp">
        <span>Höhenmeter {y}</span><b>{hmFmt(gY)}</b><span style="text-align:right">{ly.length ? <Chg d={gY - gL} fmt={(x) => int(x)} label="zum Vorjahr" /> : null}</span>
        {longest ? <Fragment><span>Längste Tour</span><b>{km(longest.dist)} km</b><button type="button" class="hp-delta" style="border:0;justify-self:end" onClick={() => push('activity', { id: longest.id })}>{dateShort(longest.date)} ›</button></Fragment> : null}
        {highest ? <Fragment><span>Meiste Hm</span><b>{hmFmt(highest.gain)}</b><button type="button" class="hp-delta" style="border:0;justify-self:end" onClick={() => push('activity', { id: highest.id })}>{dateShort(highest.date)} ›</button></Fragment> : null}
        <span>Aktive Wochen in Folge</span><b>{streak}</b><span />
      </div>
      <div class="hp-sub">Vorjahr bis zum gleichen Datum ({dateShort(lyTo)}). Indoor zählt nicht zu Distanz und Höhenmetern.</div>
    </Tile>
  );
}
