// „Heute“ als Cockpit (Runde 7): eine Hauptkarte je Tageszeit, darunter Gesundheit, Training und die letzte Aktivität.
// Morgens Tagesform mit Empfehlung, tagsüber der Fortschritt, abends der Tagesabschluss mit „Heute Nacht“ und „Morgen“.
// Berichte (Morgenbericht, Tagesabschluss) öffnen als Blatt; frühere Tage über das Datum.
import { h, Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useData, useStatus } from './common.jsx';
import HansportLogo from '../ui/HansportLogo.jsx';
import { Ico, usePullToRefresh, PtrIndicator } from '../ui/hp.jsx';
import { Sheet } from '../ui/kit.jsx';
import { MapView } from '../ui/map.jsx';
import { Spectrum } from '../ui/r5.jsx';
import { push, openSheet, closeSheet, setTab } from '../nav.js';
import { getState } from '../store.js';
import * as Acts from '../strava.js';
import { healthDays, healthMeta, todayLocal } from '../health.js';
import { M, latest, formWord } from '../metrics.js';
import { aggregate, addDays } from '../analysis.js';
import { readiness, recommendation, balance, recFor, loadRatio, nutrition, LEVELS } from '../coach-logic.js';
import { hmm } from '../viz-data.js';
import { km, hm as hmFmt, int, num, dateShort, dayMon, NB } from '../format.js';
import { actIcon, dsport, sportLabel } from '../sports.js';
import { listMetrics } from './sportcard.jsx';
import { decode } from '../geo.js';
import { WEB, ACT_SRC } from '../env.js';
import { refreshAll } from './today.jsx';

const n0 = (v) => (v == null ? '–' : num(v, 0).replace('-', '−'));
const sgn0 = (v) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), 0));
const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const kick = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const wdIdx = (d) => (new Date(d + 'T12:00:00').getDay() + 6) % 7;
const durHM = (s) => (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.round((s % 3600) / 60)).padStart(2, '0') : String(Math.round(s / 60)));
const durU = (s) => (s >= 3600 ? 'h' : 'min');
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const minClock = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// Tageszeit: Morgen 4–11, Tag 11–19, Abend ab 19 (bis 4 Uhr gilt noch der Vortag)
export function modeAt(now = new Date()) { const h0 = now.getHours(); return h0 < 4 ? 'abend' : h0 < 11 ? 'morgen' : h0 < 19 ? 'tag' : 'abend'; }
const GREET = { morgen: 'Guten Morgen', tag: 'Guten Tag', abend: 'Guten Abend' };

// ---------- Daten je Tag ----------
function dayStats(list, H, date) {
  const acts = list.filter((a) => a.date === date && !a.excluded).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const r = H.map[date] || {};
  const mov = acts.reduce((s, a) => s + (a.mov || 0), 0);
  const load = r.load != null ? r.load : acts.length ? acts.reduce((s, a) => s + (a.re || 0), 0) || null : 0;
  const kcalActs = acts.reduce((s, a) => s + (a.cal || 0), 0);
  const kcal = r.akcal ? r.akcal : kcalActs || (acts.length ? null : 0);
  const stress = M.stress.get(r);
  return { acts, mov, load, kcal, stress, r };
}
function weekStats(list, date) {
  const w0 = addDays(date, -wdIdx(date));
  const A = aggregate(list.filter((a) => a.date >= w0 && a.date <= date));
  const P = aggregate(list.filter((a) => a.date >= addDays(w0, -28) && a.date < w0));
  return { A, avg: P.count ? P.time / 4 : null };
}
// übliche Weckzeit (Median der letzten 14 Nächte) und Schlafbedarf
function sleepPlan(H, date) {
  const ends = [], needs = [];
  for (let i = 0; i < 14; i++) { const r = H.map[addDays(date, -i)]; if (!r) continue; const e = r.sl && toMin(r.sl.end); if (e != null) ends.push(e); if (r.need) needs.push(r.need); }
  const wake = ends.length >= 3 ? median(ends) : null;
  const need = needs.length ? needs[0] : null;
  const target = need || 480;
  return { wake, need, target, std: !need, bed: wake != null ? wake - target : null };
}
function dayVerdict(st, H, date) {
  if (!st.acts.length) return { k: 'rest', a: 'Ruhetag.', b: 'Kraft für morgen.' };
  const lr = loadRatio(H, date);
  const L = st.load || 0, ch = lr ? lr.chronic : null;
  const hi = ch ? L >= Math.max(1.5 * ch, 80) : L >= 100;
  const mid = ch ? L >= 0.8 * ch : L >= 50;
  if (hi) return { k: 'hi', a: 'Intensiver Tag.', b: 'Zeit zum Erholen.' };
  if (mid) return { k: 'mid', a: 'Solider Tag.', b: 'Gut für die Form.' };
  return { k: 'lo', a: 'Lockerer Tag.', b: 'Frisch für morgen.' };
}
function outlook(v, H, date) {
  const tsb = (H.map[date] || {}).tsb;
  if (v.k === 'hi' || (tsb != null && tsb < -20)) return { t: 'Locker oder Ruhetag', s: 'Der Morgenbericht bestätigt das mit Schlaf und Erholung.' };
  if (v.k === 'rest' && (tsb == null || tsb >= -10)) return { t: 'Normal möglich', s: 'Nach dem Ruhetag passt eine normale Einheit, wenn Schlaf und Erholung mitspielen.' };
  return { t: 'Locker bis normal', s: 'Der Morgenbericht sagt dir nach dem Aufwachen, welche Stufe passt.' };
}
// Tagesform mit Empfehlung; ohne Gesundheitswerte die Belastungsbilanz (nur aus Training)
function formOf(H, date) {
  const S = getState();
  const R = readiness(H, date);
  if (R) {
    const rec = recommendation(R, H, date, S.meta && S.meta['coach-plan']);
    const r0 = recFor(rec.k);
    return { score: R.score, level: R.level, k: rec.k, head: r0.head, line: rec.notes && rec.notes.length ? rec.notes[0] : r0.line, R, rec };
  }
  const B = balance(H, date);
  if (B) { const r0 = recFor(B.k); return { score: null, k: B.k, head: r0.head, line: r0.line, B }; }
  return null;
}

// ---------- Cockpit ----------
export function Cockpit() {
  const d = useData();
  const st = useStatus();
  const H = healthDays();
  const meta = healthMeta();
  const scroller = useRef();
  usePullToRefresh(scroller, refreshAll);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const mode = modeAt(now);
  const today = todayLocal();
  const day = now.getHours() < 4 ? addDays(today, -1) : today;
  const S = getState();
  const stand = Math.max((S.meta.sync && S.meta.sync.lastSync) || 0, meta.lastSync || 0) || null;
  const busy = st.syncing || st.healthSyncing;
  const ds = useMemo(() => dayStats(d.list, H, day), [d.v, H, day]);
  const F = useMemo(() => formOf(H, day), [H, day]);
  const noHealth = !H.list.length;
  const trained = ds.acts.length > 0;
  return (
    <div class="view root ck" ref={scroller}>
      <PtrIndicator />
      <div class="ck-top">
        <HansportLogo size={20} title="hansport" />
        <span class="ck-stand">{busy ? 'Gleiche ab …' : stand ? 'Stand ' + clock(stand) : 'Noch nicht abgeglichen'}</span>
        <button type="button" class={'hp-round' + (busy ? ' spin' : '')} aria-label="Alles abgleichen" onClick={refreshAll}><Ico n="refresh-double" /></button>
      </div>
      <div class="ck-title">
        <button type="button" class="ck-date" onClick={() => openSheet(() => <DaysSheet today={today} />, 'Frühere Tage')} aria-label={fmtLong(day) + ', frühere Tage und Berichte öffnen'}>{fmtLong(day)}</button>
        <h1>{GREET[mode]}</h1>
      </div>
      {st.healthError ? <div class="hp-banner ck-pad" role="status"><Ico n="warning-triangle" /><div><b>Abgleich unvollständig.</b> Angezeigt wird der letzte Stand.<span class="ck-err">{st.healthError}</span></div></div> : null}
      {noHealth && !busy && !d.list.length ? <div class="hp-banner ck-pad"><Ico n="info-circle" /><div class="grow" style="flex:1">Noch keine Daten. Gleiche {WEB ? 'Garmin und Withings' : ACT_SRC} ab.<div style="margin-top:8px"><button type="button" class="btn" disabled={busy} onClick={refreshAll}>Jetzt abgleichen</button></div></div></div> : null}

      {mode === 'morgen' ? <HeroMorning F={F} H={H} day={day} /> : mode === 'tag' ? <HeroDay F={F} ds={ds} day={day} now={now} /> : <HeroEvening ds={ds} H={H} day={day} now={now} />}
      {mode === 'abend' ? <NightCard H={H} day={day} /> : null}
      {mode === 'abend' ? <TomorrowCard ds={ds} H={H} day={day} /> : null}
      {mode === 'abend' && trained ? <LastRow d={d} title="Heute trainiert" a={ds.acts[ds.acts.length - 1]} today={today} /> : null}

      <HealthGrid H={H} day={day} />
      <TrainingRow d={d} H={H} day={day} />
      {!(mode === 'abend' && trained) ? <LastRow d={d} title={trained ? 'Heute trainiert' : 'Letzte Aktivität'} a={d.list.find((x) => !x.excluded)} today={today} /> : null}
      <div class="ck-foot">{WEB ? 'Garmin und Withings · Tagesform und Belastung berechnet hansport.' : 'Garmin und Withings über athletedata, Aktivitäten aus Strava.'}</div>
    </div>
  );
}

// ---------- Hauptkarten ----------
function Orb({ k }) { return <div class={'ck-orb ' + k} aria-hidden="true" />; }

function HeroMorning({ F, H, day }) {
  const r = H.map[day] || {};
  const wake = r.sl && r.sl.end;
  return (
    <section class="ck-hero" aria-label="Morgenbericht">
      <Orb k="morning" />
      <div class="ck-kick"><Ico n="sun-light" />Morgenbericht{wake ? ' · ' + wake : ''}</div>
      <div class="ck-big"><b>{F && F.score != null ? F.score : '–'}</b><span>{F && F.score != null ? 'Tagesform' : F && F.B ? 'Tagesform: keine Gesundheitswerte' : 'Tagesform: keine Daten'}</span></div>
      {F ? <Fragment><h2 class="ck-head">{F.head}</h2><p class="ck-line">{F.line}{F.B ? ' Nur aus dem Training berechnet.' : ''}</p></Fragment> : <p class="ck-line">Sobald Garmin Schlaf, HRV und Ruhepuls liefert, steht hier deine Tagesform.</p>}
      <Spectrum value={F && F.score != null ? F.score : null} label={F && F.score != null ? 'Tagesform ' + F.score + ' von 100, ' + F.level.name : 'Tagesform ohne Wert'} />
      <ReportLink kind="morgen" day={day} />
    </section>
  );
}

function HeroDay({ F, ds, day, now }) {
  const done = ds.acts.length > 0;
  const a = done ? ds.acts[ds.acts.length - 1] : null;
  return (
    <section class="ck-hero" aria-label="Tagesverlauf">
      <Orb k="day" />
      <div class="ck-kick"><Ico n="activity" />Tagesverlauf · {clock(now)}</div>
      {done ? (
        <Fragment>
          <div class="ck-big"><b>{durHM(ds.mov)}<small>{durU(ds.mov)}</small></b><span>Training heute</span></div>
          <h2 class="ck-head">Training erledigt</h2>
          <p class="ck-line">{ds.acts.length > 1 ? ds.acts.length + ' Einheiten, zuletzt ' : ''}{a.name}{a.dist > 0 && !a.indoor ? ', ' + km(a.dist) + NB + 'km' : ''}{a.gain > 50 ? ', ' + hmFmt(a.gain) + NB + 'Hm' : ''}.{F && F.score != null ? ' Empfehlung war ' + F.level.name.toLowerCase() + '.' : ''}</p>
        </Fragment>
      ) : (
        <Fragment>
          <div class="ck-big"><b>{F && F.score != null ? F.score : '–'}</b><span>Tagesform</span></div>
          <h2 class="ck-head">Training offen{F ? ' · ' + F.head.replace(/^Heute /, '') : ''}</h2>
          <p class="ck-line">{F ? F.line : 'Noch keine Empfehlung – es fehlen Gesundheits- und Trainingswerte.'}</p>
          <Spectrum value={F && F.score != null ? F.score : null} label={F && F.score != null ? 'Tagesform ' + F.score + ' von 100' : 'Tagesform ohne Wert'} />
        </Fragment>
      )}
      <ReportLink kind="morgen" day={day} />
    </section>
  );
}

function HeroEvening({ ds, H, day, now }) {
  const v = dayVerdict(ds, H, day);
  return (
    <section class="ck-hero eve" aria-label="Tagesabschluss">
      <Orb k="evening" />
      <div class="ck-kick"><Ico n="half-moon" />Tagesabschluss · {clock(now)}</div>
      <h2 class="ck-say"><span>{v.a}</span><span class="b">{v.b}</span></h2>
      <div class="ck-three">
        <div><b>{ds.load != null ? n0(ds.load) : '–'}</b><span>Belastung</span></div>
        <div><b>{ds.kcal != null ? n0(ds.kcal) : '–'}</b><span>kcal Training</span></div>
        <div><b>{ds.stress != null ? n0(ds.stress) : '–'}</b><span>Stress Ø</span></div>
      </div>
      <ReportLink kind="abend" day={day} />
    </section>
  );
}

function ReportLink({ kind, day }) {
  const t = kind === 'morgen' ? 'Morgenbericht lesen' : 'Tagesabschluss lesen';
  return <button type="button" class="ck-link" onClick={() => openReport(kind, day)}>{t}<Ico n="nav-arrow-right" /></button>;
}

function NightCard({ H, day }) {
  const p = sleepPlan(H, day);
  return (
    <section class="ck-card night" aria-label="Heute Nacht">
      <Orb k="night" />
      <div class="ck-kick"><Ico n="half-moon" />Heute Nacht</div>
      <div class="ck-night">
        <div><span class="l">Ins Bett bis</span>{p.bed != null ? <b>{minClock(p.bed)}</b> : <b class="ph" aria-label="noch keine Uhrzeit">––:––</b>}</div>
        <div class="r"><span class="l">Ziel</span><b>{hmm(p.target).replace(/:00$/, '')}<small>h</small></b></div>
      </div>
      <p class="ck-line s">{p.wake != null ? 'Für ' + hmm(p.target) + ' h Schlaf bis zu deiner üblichen Weckzeit ' + minClock(p.wake) + (p.std ? ' (Ziel: Standard, Garmin liefert noch keinen Schlafbedarf).' : '.') : 'Die Uhrzeit kommt aus deiner üblichen Weckzeit, sobald wieder Schlafdaten da sind.'}</p>
    </section>
  );
}

function TomorrowCard({ ds, H, day }) {
  const o = outlook(dayVerdict(ds, H, day), H, day);
  return (
    <section class="ck-card" aria-label="Morgen">
      <div class="ck-kick"><Ico n="sun-light" />Morgen</div>
      <h3 class="ck-h3">{o.t}</h3>
      <p class="ck-line s">{o.s}</p>
    </section>
  );
}

// ---------- Gesundheit: die 4 aussagekräftigsten verfügbaren Werte ----------
const RANK = ['slScore', 'hrv', 'rhr', 'bb', 'stress', 'akcal', 'weight'];
const H_ICON = { slScore: 'half-moon', hrv: 'activity', rhr: 'heart', bb: 'flash', stress: 'brain', akcal: 'fire-flame', weight: 'weight' };
const H_NAME = { slScore: 'Schlaf', hrv: 'HRV', rhr: 'Ruhepuls', bb: 'Body Battery', stress: 'Stress', akcal: 'Energie', weight: 'Gewicht' };
const H_GRP = { slScore: 'g-sch', hrv: 'g-erh', rhr: 'g-herz', bb: 'g-erh', stress: 'g-erh', akcal: 'g-akt', weight: 'g-kor' };
const H_UNIT = { hrv: 'ms', rhr: 'bpm', akcal: 'kcal', weight: 'kg' };
const STALE = { weight: 14, akcal: 0 };
function bandTxt(v, b) { if (!b || !b[1]) return null; return v < b[0] - b[1] ? 'unter Bereich' : v > b[0] + b[1] ? 'über Bereich' : 'im Bereich'; }
function healthItems(H, day) {
  const out = [];
  for (const k of RANK) {
    if (k === 'akcal') { const r = H.map[day]; if (r && r.akcal > 0) out.push({ k, v: r.akcal, date: day, r }); continue; }
    const l = latest(H.list, k === 'slScore' ? 'slScore' : k, day);
    if (l && (new Date(day) - new Date(l.date)) / 864e5 <= 120) out.push({ k, ...l });
    else if (k === 'slScore') { const s = latest(H.list, 'sleep', day); if (s && (new Date(day) - new Date(s.date)) / 864e5 <= 120) out.push({ k: 'sleep', ...s }); }
  }
  return out.slice(0, 4);
}
function HealthGrid({ H, day }) {
  const items = healthItems(H, day);
  if (!items.length) return null;
  return (
    <Fragment>
      <SecHead title="Gesundheit" onAll={() => setTab('health')} />
      <div class="ck-grid">{items.map((x) => <HealthTile x={x} day={day} />)}</div>
    </Fragment>
  );
}
function HealthTile({ x, day }) {
  const k = x.k, r = x.r || {};
  const age = Math.round((new Date(day + 'T12:00:00') - new Date(x.date + 'T12:00:00')) / 864e5);
  const lim = STALE[k] != null ? STALE[k] : 1;
  const stale = age > lim;
  let val = n0(x.v), unit = H_UNIT[k] || '', note = null;
  if (k === 'sleep') { val = hmm(x.v); unit = 'h'; note = r.need ? (x.v >= r.need ? 'Bedarf gedeckt' : 'unter Bedarf') : null; }
  if (k === 'slScore') note = x.v >= 90 ? 'sehr gut' : x.v >= 80 ? 'gut' : x.v >= 60 ? 'solide' : 'schwach';
  if (k === 'hrv') note = bandTxt(x.v, r.base && r.base.hrv);
  if (k === 'rhr') note = bandTxt(x.v, r.base && r.base.rhr);
  if (k === 'bb') note = r.g && r.g.bbCh != null ? '+' + n0(r.g.bbCh) + ' Nacht' : 'beim Aufwachen';
  if (k === 'stress') note = x.v <= 25 ? 'ruhig' : x.v <= 50 ? 'niedrig' : x.v <= 75 ? 'mittel' : 'hoch';
  if (k === 'akcal') note = 'Training';
  if (k === 'weight') { val = num(x.v, 1); note = age === 0 ? 'heute' : age === 1 ? 'gestern' : 'vor ' + age + ' Tagen'; }
  if (stale) note = dayMon(x.date);
  else if (age === 1 && k !== 'weight') note = 'gestern';
  const mk = k === 'sleep' ? 'sleep' : k;
  return (
    <button type="button" class={'ck-tile glow ' + H_GRP[k]} onClick={() => push('metric', { k: mk })} aria-label={(k === 'sleep' ? 'Schlafdauer' : H_NAME[k]) + ' ' + val + ' ' + unit + (note ? ', ' + note : '') + ', Details'}>
      <span class="ck-tn"><Ico n={H_ICON[k] || 'half-moon'} />{k === 'sleep' ? 'Schlaf' : H_NAME[k]}</span>
      <span class="ck-tv"><b>{val}{unit ? <small>{unit}</small> : null}</b>{note ? <em class={stale ? 'warn' : ''}>{note}</em> : null}</span>
    </button>
  );
}

// ---------- Training ----------
function TrainingRow({ d, H, day }) {
  const f = latest(H.list, 'tsb', day);
  const pts = []; for (let i = 13; i >= 0; i--) { const r = H.map[addDays(day, -i)]; pts.push(r && r.tsb != null ? r.tsb : null); }
  const w = weekStats(d.list, day);
  if (!f && !w.A.count && w.avg == null) return null;
  return (
    <Fragment>
      <SecHead title="Training" onAll={() => setTab('activities')} />
      <div class="ck-grid two">
        <button type="button" class="ck-tile tall glow g-trn" onClick={() => push('metric', { k: 'tsb' })} aria-label={'Form ' + (f ? n0(f.v) + ', ' + formWord(f.v) : 'keine Daten') + ', Details'}>
          <span class="ck-tn">Form · 14 Tage</span>
          <b class="ck-mid">{f ? sgn0(f.v) : '–'}</b>
          <span class="ck-sub">{f ? formWord(f.v) : 'keine Daten'}</span>
          <FormSpark pts={pts} />
        </button>
        <button type="button" class="ck-tile tall glow g-akt" onClick={() => push('reviews')} aria-label={'Diese Woche ' + durHM(w.A.time) + ' ' + durU(w.A.time) + (w.avg ? ', Durchschnitt ' + durHM(w.avg) + ' ' + durU(w.avg) : '') + ', zu den Rückblicken'}>
          <span class="ck-tn">Diese Woche</span>
          <b class="ck-mid">{durHM(w.A.time)}<small>{durU(w.A.time)}</small></b>
          <span class="ck-sub">{w.avg ? 'von Ø ' + durHM(w.avg) + NB + durU(w.avg) : 'noch kein Schnitt'}</span>
          <span class="ck-bar" aria-hidden="true"><i style={{ width: Math.min(100, w.avg ? (w.A.time / w.avg) * 100 : 0) + '%' }} /></span>
          <span class="ck-sub s">{w.A.count ? km(w.A.dist) + NB + 'km · ' + hmFmt(w.A.gain) + NB + 'Hm · ' + w.A.count + '×' : 'Noch keine Einheit'}</span>
        </button>
      </div>
    </Fragment>
  );
}
function FormSpark({ pts }) {
  const v = pts.filter((x) => x != null);
  if (v.length < 2) return <span class="ck-spark" />;
  const lo = Math.min(0, ...v) - 2, hi = Math.max(0, ...v) + 2, W = 140, Hh = 30;
  const X = (i) => (i / (pts.length - 1)) * W, Y = (y) => 2 + (1 - (y - lo) / (hi - lo)) * (Hh - 4);
  let dd = '', area = '', first = null, last = null;
  pts.forEach((y, i) => { if (y == null) return; dd += (dd ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(y).toFixed(1); if (first == null) first = i; last = i; });
  area = dd + `L${X(last)},${Y(0)}L${X(first)},${Y(0)}Z`;
  return (
    <svg class="ck-spark" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} class="a" /><line x1="0" x2={W} y1={Y(0)} y2={Y(0)} class="z" /><path d={dd} class="l" />
    </svg>
  );
}

// ---------- Letzte Aktivität ----------
function LastRow({ d, title, a, today }) {
  const wantMap = !!(a && !a.poly && a.gid && !a.indoor && !a.trainer && !a.noGps && a.dist > 0 && dsport(a) !== 'gym');
  useEffect(() => { if (wantMap && Acts.ensurePoly) Acts.ensurePoly(a.id).catch(() => {}); }, [wantMap, a && a.id]);
  if (!a) return null;
  const S = getState();
  const pts = a.poly && !a.indoor ? decode(a.poly) : null;
  const [m1, m2] = listMetrics(a, S.perf[a.id], S.strength[a.id]);
  const when = a.date === today ? 'Heute' + (a.start ? ', ' + a.start.slice(11, 16) : '') : dateShort(a.date);
  return (
    <Fragment>
      <SecHead title={title} />
      <button type="button" class="ck-last" onClick={() => push('activity', { id: a.id })} aria-label={title + ': ' + a.name + ', ' + when}>
        <span class="ck-prev">{pts && pts.length > 1 ? <MapView still pad={8} maxFit={14} height="88px" fit={[pts]} fitKey={a.id} lines={[{ pts, color: 'var(--c-akt)', width: 2.6 }]} markers={[]} label={'Kartenvorschau ' + a.name} attr={false} /> : <Ico n={actIcon(a)} />}</span>
        <span class="ck-lt">
          <span class="ck-lm"><Ico n={actIcon(a)} />{sportLabel(dsport(a))} · {when}</span>
          <b>{a.name}</b>
          <span class="ck-lv">{[m1, m2].filter(Boolean).join(' · ')}</span>
        </span>
        <Ico n="nav-arrow-right" cls="chev" />
      </button>
    </Fragment>
  );
}

function SecHead({ title, onAll }) {
  return <div class="ck-sec"><h2>{title}</h2>{onAll ? <button type="button" class="ck-all" onClick={onAll}>Alle<Ico n="nav-arrow-right" /></button> : null}</div>;
}

// ---------- Berichte ----------
export function openReport(kind, day) { openSheet(() => <ReportSheet kind={kind} day={day} />, kind === 'morgen' ? 'Morgenbericht' : 'Tagesabschluss'); }

function Row({ icon, t, children, grp }) {
  return <div class="rp-row"><span class={'rp-ic ' + (grp || '')}><Ico n={icon} /></span><div><b>{t}</b><p>{children}</p></div></div>;
}
function actLine(a, perf) {
  const p = [];
  if (a.dist > 0 && !a.indoor) p.push(km(a.dist) + NB + 'km');
  if (a.gain > 50 && !a.indoor) p.push(hmFmt(a.gain) + NB + 'Hm');
  if (a.mov) p.push(durHM(a.mov) + NB + durU(a.mov));
  const hr = perf && perf.avgHr != null ? perf.avgHr : a.hrAvg;
  if (hr) p.push('Ø Puls ' + n0(hr));
  if (a.pr > 0) p.push(a.pr + (a.pr === 1 ? ' Bestzeit' : ' Bestzeiten'));
  return a.name + ': ' + p.join(', ') + '.';
}

function ReportSheet({ kind, day }) {
  const d = useData();
  const H = healthDays();
  const S = getState();
  const r = H.map[day] || {};
  const goalWeight = S.settings.main && S.settings.main.healthGoals && S.settings.main.healthGoals.weight;
  const plan = S.meta && S.meta['coach-plan'];
  const F = formOf(H, day);
  const rows = [];
  const basis = [];
  if (kind === 'morgen') {
    const sl = r.sl || {};
    const tot = sl.total != null ? sl.total : r.slMin;
    rows.push(<Row icon="half-moon" grp="g-sch" t="Schlaf">{tot != null ? [sl.score != null ? 'Score ' + sl.score : null, hmm(tot) + ' h' + (r.need ? ' (Bedarf ' + hmm(r.need) + ' h)' : ''), sl.deep != null ? 'Tief ' + hmm(sl.deep) + ', REM ' + hmm(sl.rem || 0) : null, sl.start && sl.end ? sl.start + '–' + sl.end : null].filter(Boolean).join(' · ') + '.' : 'Für diese Nacht liegen keine Schlafdaten vor.'}</Row>);
    const ep = [];
    if (F && F.score != null) ep.push('Tagesform ' + F.score + ' – ' + F.level.name.toLowerCase() + '.');
    if (r.hrv != null) ep.push('HRV ' + n0(r.hrv) + ' ms' + (r.rb && r.rb.hrv ? ' (Basis ' + n0(r.rb.hrv[0]) + ')' : '') + '.');
    if (r.rhr != null) ep.push('Ruhepuls ' + n0(r.rhr) + ' bpm.');
    if (r.g && r.g.bbWake != null) ep.push('Body Battery ' + n0(r.g.bbWake) + ' beim Aufwachen' + (r.g.bbCh != null ? ', über Nacht +' + n0(r.g.bbCh) + ' geladen' : '') + '.');
    rows.push(<Row icon="flash" grp="g-erh" t="Erholung">{ep.length ? ep.join(' ') : 'Keine Erholungswerte von Garmin für diesen Tag.'}</Row>);
    const f = latest(H.list, 'tsb', day);
    const recent = d.list.filter((a) => !a.excluded && a.date < day && a.date >= addDays(day, -7)).slice(0, 2);
    rows.push(<Row icon="activity" grp="g-akt" t="Belastung">{f ? 'Form ' + sgn0(f.v) + ': Fitness ' + n0(f.r.ctl) + ', Ermüdung ' + n0(f.r.atl) + '. ' : 'Noch keine Form berechnet. '}{recent.length ? 'Zuletzt: ' + recent.map((a) => a.name + ' (' + dayMon(a.date) + ')').join(', ') + '.' : 'In den letzten 7 Tagen kein Training.'}</Row>);
    rows.push(<Row icon="sparks" t="Empfehlung">{F ? F.head + '. ' + F.line + (F.rec && F.rec.planNote ? ' ' + F.rec.planNote : '') : 'Ohne Gesundheits- und Trainingswerte keine Empfehlung.'}</Row>);
    const N = nutrition(H, day, plan, goalWeight);
    rows.push(<Row icon="cutlery" t="Ernährung">{N.total ? 'Energiebedarf heute ca. ' + int(N.total) + ' kcal (Grundumsatz ' + int(N.bmr.v) + ' + Aktivität ' + int(N.act) + '). ' : ''}{N.tips.length ? N.tips[0].text : 'Normale Portionen, Eiweiß zu jeder Mahlzeit, ausreichend trinken.'}</Row>);
    const w = weekStats(d.list, day);
    rows.push(<Row icon="calendar" t="Woche">{durHM(w.A.time)}{NB}{durU(w.A.time)}, {km(w.A.dist)}{NB}km, {hmFmt(w.A.gain)}{NB}Hm in {w.A.count} {w.A.count === 1 ? 'Einheit' : 'Einheiten'}.{w.avg ? ' Ø der letzten 4 Wochen: ' + durHM(w.avg) + NB + durU(w.avg) + '.' : ''}</Row>);
    basis.push(WEB ? 'Garmin (Schlaf, HRV, Ruhepuls, Body Battery)' : 'Garmin über athletedata', 'Aktivitäten (' + ACT_SRC + ')', 'Tagesform und Belastung berechnet hansport');
  } else {
    const ds = dayStats(d.list, H, day);
    rows.push(<Row icon={ds.acts[0] ? actIcon(ds.acts[0]) : 'activity'} grp="g-akt" t="Heute">{ds.acts.length ? ds.acts.map((a) => actLine(a, S.perf[a.id])).join(' ') : 'Kein Training – Ruhetag.'}</Row>);
    const lr = loadRatio(H, day);
    const f = (H.map[day] || {}).tsb;
    rows.push(<Row icon="graph-up" t="Belastung">{'Belastung ' + n0(ds.load || 0)}{lr ? ' (Ø 28 Tage ' + n0(lr.chronic) + ' pro Tag)' : ''}.{f != null ? ' Form nach heute ' + sgn0(f) + '.' : ''}</Row>);
    const tg = [];
    if (ds.stress != null) tg.push('Stress Ø ' + n0(ds.stress) + ' – ' + (ds.stress <= 25 ? 'ruhig' : ds.stress <= 50 ? 'niedrig' : ds.stress <= 75 ? 'mittel' : 'hoch') + '.');
    if (ds.kcal) tg.push(n0(ds.kcal) + ' kcal im Training.');
    const steps = M.steps.get(r); if (steps) tg.push(int(steps) + ' Schritte.');
    rows.push(<Row icon="brain" grp="g-erh" t="Tag">{tg.length ? tg.join(' ') : 'Keine Tageswerte von Garmin.'}</Row>);
    const p = sleepPlan(H, day);
    rows.push(<Row icon="half-moon" grp="g-sch" t="Heute Nacht">{'Ziel ' + hmm(p.target) + ' h Schlaf' + (p.std ? ' (Standard)' : '') + '. '}{p.bed != null ? 'Ins Bett bis ' + minClock(p.bed) + ' (übliche Weckzeit ' + minClock(p.wake) + '). ' : 'Die Uhrzeit fürs Zubettgehen kommt, sobald wieder Schlafdaten da sind. '}Letzte große Mahlzeit 2–3 h vorher.</Row>);
    const N = nutrition(H, day, plan, goalWeight);
    const after = N.tips.find((t) => t.when === 'danach');
    rows.push(<Row icon="cutlery" t="Ernährung">{ds.acts.length ? (after && ds.mov >= 5400 ? after.text : 'Kohlenhydrate und Eiweiß zum Abendessen, ausreichend trinken.') : 'Normale Portionen, Eiweiß zu jeder Mahlzeit.'}</Row>);
    const o = outlook(dayVerdict(ds, H, day), H, day);
    rows.push(<Row icon="sun-light" t="Morgen">{o.t}. {o.s}</Row>);
    basis.push('Aktivitäten (' + ACT_SRC + ')', WEB ? 'Garmin (Stress, Schritte, Schlaf)' : 'Garmin über athletedata', 'Belastung berechnet hansport');
  }
  const time = kind === 'morgen' ? (r.sl && r.sl.end) || null : null;
  return (
    <Sheet title={kind === 'morgen' ? 'Morgenbericht' : 'Tagesabschluss'} kicker={kick(day) + (time ? ' · ' + time : '')} big>
      <div class={'rp ' + (kind === 'morgen' ? 'm' : 'a')}>
        <div class="rp-rows">{rows}</div>
        <p class="rp-basis">Grundlage: {basis.join(' · ')}. Fehlende Werte stehen als „keine Daten“ da, nichts ist geschätzt.</p>
      </div>
    </Sheet>
  );
}

// ---------- Frühere Tage ----------
function DaysSheet({ today }) {
  const d = useData();
  const H = healthDays();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  return (
    <Sheet title="Frühere Tage">
      <div class="ck-days">
        {days.map((x) => {
          const R = readiness(H, x);
          const acts = d.list.filter((a) => a.date === x && !a.excluded);
          return (
            <div class="ck-day">
              <div class="t"><b>{x === today ? 'Heute' : dateShort(x)}</b><span>{R && R.date === x ? 'Tagesform ' + R.score + ' · ' : ''}{acts.length ? acts.map((a) => a.name).join(', ') : 'kein Training'}</span></div>
              <div class="l"><button type="button" class="ck-link s" onClick={() => openReport('morgen', x)}>Morgenbericht</button><button type="button" class="ck-link s" onClick={() => openReport('abend', x)}>Tagesabschluss</button></div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
