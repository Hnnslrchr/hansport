// „Heute“ als Cockpit (Runde 7): eine Hauptkarte je Tageszeit, darunter Gesundheit, Training und die letzte Aktivität.
// Runde 8: Umschalter Kompakt/Detail. Kompakt ist Standard; Detail zeigt dieselben Abschnitte tiefer (cockpit-detail.jsx).
// Berichte (Morgenbericht, Tagesabschluss) öffnen als Blatt; frühere Tage über das Datum.
import { h, Fragment } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useData, useStatus } from './common.jsx';
import HansportLogo from '../ui/HansportLogo.jsx';
import { Ico, usePullToRefresh, PtrIndicator } from '../ui/hp.jsx';
import { Sheet } from '../ui/kit.jsx';
import { MapView } from '../ui/map.jsx';
import { Spectrum } from '../ui/r5.jsx';
import { reducedMotion, setValue, springTo, stop } from '../ui/spring.js';
import { push, openSheet, setTab } from '../nav.js';
import { getState } from '../store.js';
import * as Acts from '../strava.js';
import { computeSections } from '../sections.js';
import { healthDays, healthMeta, todayLocal } from '../health.js';
import { M, latest, formWord } from '../metrics.js';
import { addDays } from '../analysis.js';
import { readiness, loadRatio } from '../coach-logic.js';
import { hmm } from '../viz-data.js';
import { km, hm as hmFmt, int, dateShort, dayMon, NB } from '../format.js';
import { actIcon, dsport, sportLabel } from '../sports.js';
import { SportCard, listMetrics } from './sportcard.jsx';
import { decode } from '../geo.js';
import { WEB, ACT_SRC } from '../env.js';
import { refreshAll } from './today.jsx';
import {
  n0, sgn0, clock, fmtLong, kick, durHM, durU, minClock, modeAt, GREET,
  dayStats, weekStats, sleepPlan, dayVerdict, outlook, formOf, nutriOf, healthItems, healthView,
} from './ck-data.js';
import { FactorBars, nutriLine, LoadCompare, NightExtra, HealthTileBig, FormCard, WeekCard, ZoneCard, NutriCard, DayTimeline, BodyCard } from './cockpit-detail.jsx';

// Ansicht gilt für die Sitzung: beim Kaltstart und an einem neuen Tag wieder kompakt
let SESSION = { v: 'kompakt', date: null };

// ---------- Übergang: Karten wachsen bzw. schrumpfen an Ort und Stelle ----------
function useMorph(ref) {
  const pend = useRef(null);
  const capture = () => {
    const sc = ref.current;
    if (!sc) return;
    const top = sc.getBoundingClientRect().top;
    const boxes = new Map();
    let anchor = null;
    for (const el of sc.querySelectorAll('[data-m]')) {
      const b = el.getBoundingClientRect();
      boxes.set(el.dataset.m, { h: b.height, top: b.top - top + sc.scrollTop });
      if (!anchor && b.bottom - top > 24) anchor = el.dataset.m;
    }
    pend.current = { boxes, anchor, scroll: sc.scrollTop, aTop: anchor ? boxes.get(anchor).top : 0 };
  };
  useLayoutEffect(() => {
    const p = pend.current;
    pend.current = null;
    const sc = ref.current;
    if (!p || !sc) return;
    stop(sc, 'morph');
    const top = sc.getBoundingClientRect().top;
    const now = [];
    let aNew = null;
    // Reste eines laufenden Übergangs lösen, damit die neuen Höhen natürlich gemessen werden
    for (const el of sc.querySelectorAll('[data-m]')) { el.style.height = ''; el.style.overflow = ''; }
    for (const el of sc.querySelectorAll('[data-m]')) {
      const b = el.getBoundingClientRect();
      const k = el.dataset.m;
      now.push([k, el, b.height]);
      if (k === p.anchor) aNew = b.top - top + sc.scrollTop;
    }
    const sFrom = p.scroll;
    const sTo = aNew != null ? Math.max(0, sFrom + (aNew - p.aTop)) : sFrom;
    if (reducedMotion()) {
      sc.scrollTop = sTo;
      sc.classList.add('ck-xf');
      setTimeout(() => sc.classList.remove('ck-xf'), 260);
      return;
    }
    const anim = [];
    for (const [k, el, hNew] of now) {
      const o = p.boxes.get(k);
      const hOld = o ? o.h : 0;
      if (Math.abs(hOld - hNew) > 0.5) { el.style.overflow = 'hidden'; el.style.height = hOld + 'px'; anim.push([el, hOld, hNew]); }
    }
    sc.scrollTop = sFrom;
    let last = sFrom, free = false;
    const done = () => { for (const a of anim) { a[0].style.height = ''; a[0].style.overflow = ''; } if (!free) sc.scrollTop = sTo; };
    if (!anim.length && sFrom === sTo) return;
    setValue(sc, 'morph', 0);
    springTo(sc, 'morph', 1, {
      response: 0.35, eps: 0.004,
      apply: (x) => {
        for (const [el, a, b] of anim) el.style.height = (a + (b - a) * x).toFixed(1) + 'px';
        if (free) return;
        if (Math.abs(sc.scrollTop - last) > 2) { free = true; return; }
        sc.scrollTop = sFrom + (sTo - sFrom) * x;
        last = sc.scrollTop;
      },
      onDone: done,
    });
  });
  return capture;
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
  const [view, setView] = useState(() => (SESSION.date === day ? SESSION.v : 'kompakt'));
  const detail = view === 'detail';
  useEffect(() => { if (SESSION.date && SESSION.date !== day) { SESSION = { v: 'kompakt', date: day }; setView('kompakt'); } }, [day]);
  const capture = useMorph(scroller);
  const pick = (v) => { if (v === view) return; capture(); SESSION = { v, date: day }; setView(v); };
  const S = getState();
  const stand = Math.max((S.meta.sync && S.meta.sync.lastSync) || 0, meta.lastSync || 0) || null;
  const busy = st.syncing || st.healthSyncing;
  const ds = useMemo(() => dayStats(d.list, H, day), [d.v, H, day]);
  const F = useMemo(() => formOf(H, day), [H, day]);
  const w = useMemo(() => weekStats(d.list, day), [d.v, day]);
  const N = useMemo(() => (detail ? nutriOf(H, day) : null), [detail, H, day]);
  const noHealth = !H.list.length;
  const trained = ds.acts.length > 0;
  const lastAct = trained ? ds.acts[ds.acts.length - 1] : d.list.find((x) => !x.excluded);
  const lastTitle = trained ? 'Heute trainiert' : 'Letzte Aktivität';
  const eveFirst = mode === 'abend' && trained;
  const last = <LastSection d={d} title={lastTitle} a={lastAct} today={today} detail={detail} />;
  return (
    <div class={'view root ck' + (detail ? ' det' : '')} ref={scroller}>
      <PtrIndicator />
      <div class="ck-top">
        <HansportLogo size={20} title="hansport" />
        <span class="ck-stand">{busy ? 'Gleiche ab …' : stand ? 'Stand ' + clock(stand) : 'Noch nicht abgeglichen'}</span>
        <button type="button" class={'hp-round' + (busy ? ' spin' : '')} aria-label="Alles abgleichen" onClick={refreshAll}><Ico n="refresh-double" /></button>
      </div>
      <div class="ck-title">
        <button type="button" class="ck-date" onClick={() => openSheet(() => <DaysSheet today={today} />, 'Frühere Tage')} aria-label={fmtLong(day) + ', frühere Tage und Berichte öffnen'}>{fmtLong(day)}</button>
        <h1>{GREET[mode]}</h1>
        <div class="ck-segw">
          <div class="ck-seg" role="radiogroup" aria-label="Ansicht">
            <button type="button" role="radio" aria-checked={String(!detail)} aria-label="Kompaktansicht" class={!detail ? 'on' : ''} onClick={() => pick('kompakt')}><span>Kompakt</span></button>
            <button type="button" role="radio" aria-checked={String(detail)} aria-label="Detailansicht" class={detail ? 'on' : ''} onClick={() => pick('detail')}><span>Detail</span></button>
          </div>
        </div>
      </div>
      {st.healthError ? <div class="hp-banner ck-pad" role="status"><Ico n="warning-triangle" /><div><b>Abgleich unvollständig.</b> Angezeigt wird der letzte Stand.<span class="ck-err">{st.healthError}</span></div></div> : null}
      {noHealth && !busy && !d.list.length ? <div class="hp-banner ck-pad"><Ico n="info-circle" /><div style="flex:1">Noch keine Daten. Gleiche {WEB ? 'Garmin und Withings' : ACT_SRC} ab.<div style="margin-top:8px"><button type="button" class="btn" disabled={busy} onClick={refreshAll}>Jetzt abgleichen</button></div></div></div> : null}

      {mode === 'morgen' ? <HeroMorning F={F} H={H} day={day} detail={detail} N={N} />
        : mode === 'tag' ? <HeroDay F={F} ds={ds} day={day} now={now} detail={detail} H={H} />
        : <HeroEvening ds={ds} H={H} day={day} now={now} detail={detail} />}
      {mode === 'abend' ? <NightCard H={H} day={day} detail={detail} /> : null}
      {mode === 'abend' ? <TomorrowCard ds={ds} H={H} day={day} /> : null}
      {detail && mode === 'abend' ? <div data-m="tl"><DayTimeline ds={ds} H={H} day={day} now={now} /></div> : null}
      {detail && N ? <div data-m="nutri"><NutriCard N={N} evening={mode === 'abend'} today={day} /></div> : null}
      {eveFirst ? last : null}

      <HealthSection H={H} day={day} detail={detail} />
      {detail ? <div data-m="body"><BodyCard H={H} day={day} /></div> : null}
      <TrainingSection d={d} H={H} day={day} w={w} detail={detail} />
      {!eveFirst ? last : null}
      <div class="ck-foot">{WEB ? 'Garmin und Withings · Tagesform und Belastung berechnet hansport.' : 'Garmin und Withings über athletedata, Aktivitäten aus Strava.'}</div>
    </div>
  );
}

// ---------- Hauptkarten ----------
function Orb({ k }) { return <div class={'ck-orb ' + k} aria-hidden="true" />; }

function HeroMorning({ F, H, day, detail, N }) {
  const r = H.map[day] || {};
  const wake = r.sl && r.sl.end;
  return (
    <section class="ck-hero" data-m="hero" aria-label="Morgenbericht">
      <Orb k="morning" />
      <div class="ck-kick"><Ico n="sun-light" />Morgenbericht{wake ? ' · ' + wake : ''}</div>
      <div class="ck-big"><b>{F && F.score != null ? F.score : '–'}</b><span>{F && F.score != null ? 'Tagesform' : F && F.B ? 'Tagesform: keine Gesundheitswerte' : 'Tagesform: keine Daten'}</span></div>
      {F ? <Fragment><h2 class="ck-head">{F.head}</h2><p class="ck-line">{F.line}{F.B ? ' Nur aus dem Training berechnet.' : ''}</p></Fragment> : <p class="ck-line">Sobald Garmin Schlaf, HRV und Ruhepuls liefert, steht hier deine Tagesform.</p>}
      <Spectrum value={F && F.score != null ? F.score : null} label={F && F.score != null ? 'Tagesform ' + F.score + ' von 100, ' + F.level.name : 'Tagesform ohne Wert'} />
      {detail ? <div class="ck-xtra">{F && F.R ? <FactorBars R={F.R} /> : null}{N ? <p class="ck-line s"><Ico n="cutlery" cls="pre" />{nutriLine(N)}</p> : null}</div> : null}
      <ReportLink kind="morgen" day={day} />
    </section>
  );
}

function HeroDay({ F, ds, day, now, detail, H }) {
  const done = ds.acts.length > 0;
  const a = done ? ds.acts[ds.acts.length - 1] : null;
  return (
    <section class="ck-hero" data-m="hero" aria-label="Tagesverlauf">
      <Orb k="day" />
      <div class="ck-kick"><Ico n="activity" />Tagesverlauf · {clock(now)}</div>
      {done ? (
        <Fragment>
          <div class="ck-big"><b>{durHM(ds.mov)}<small>{durU(ds.mov)}</small></b><span>Training heute</span></div>
          <h2 class="ck-head">Training erledigt</h2>
          <p class="ck-line">{ds.acts.length > 1 ? ds.acts.length + ' Einheiten, zuletzt ' : ''}{a.name}{a.dist > 0 && !a.indoor ? ', ' + km(a.dist) + NB + 'km' : ''}{a.gain > 50 ? ', ' + hmFmt(a.gain) + NB + 'Hm' : ''}.{F && F.score != null ? ' Empfehlung war ' + F.level.name.toLowerCase() + '.' : ''}</p>
          {detail ? <div class="ck-xtra"><LoadCompare ds={ds} H={H} day={day} /></div> : null}
        </Fragment>
      ) : (
        <Fragment>
          <div class="ck-big"><b>{F && F.score != null ? F.score : '–'}</b><span>Tagesform</span></div>
          <h2 class="ck-head">Training offen{F ? ' · ' + F.head.replace(/^Heute /, '') : ''}</h2>
          <p class="ck-line">{F ? F.line : 'Noch keine Empfehlung – es fehlen Gesundheits- und Trainingswerte.'}</p>
          <Spectrum value={F && F.score != null ? F.score : null} label={F && F.score != null ? 'Tagesform ' + F.score + ' von 100' : 'Tagesform ohne Wert'} />
          {detail && F && F.R ? <div class="ck-xtra"><FactorBars R={F.R} /></div> : null}
        </Fragment>
      )}
      <ReportLink kind="morgen" day={day} />
    </section>
  );
}

function HeroEvening({ ds, H, day, now, detail }) {
  const v = dayVerdict(ds, H, day);
  return (
    <section class="ck-hero eve" data-m="hero" aria-label="Tagesabschluss">
      <Orb k="evening" />
      <div class="ck-kick"><Ico n="half-moon" />Tagesabschluss · {clock(now)}</div>
      <h2 class="ck-say"><span>{v.a}</span><span class="b">{v.b}</span></h2>
      <div class="ck-three">
        <div><b>{ds.load != null ? n0(ds.load) : '–'}</b><span>Belastung</span></div>
        <div><b>{ds.kcal != null ? n0(ds.kcal) : '–'}</b><span>kcal Training</span></div>
        <div><b>{ds.stress != null ? n0(ds.stress) : '–'}</b><span>Stress Ø</span></div>
      </div>
      {detail ? <div class="ck-xtra"><LoadCompare ds={ds} H={H} day={day} /></div> : null}
      <ReportLink kind="abend" day={day} />
    </section>
  );
}

function ReportLink({ kind, day }) {
  const t = kind === 'morgen' ? 'Morgenbericht lesen' : 'Tagesabschluss lesen';
  return <button type="button" class="ck-link" onClick={() => openReport(kind, day)}>{t}<Ico n="nav-arrow-right" /></button>;
}

function NightCard({ H, day, detail }) {
  const p = sleepPlan(H, day);
  return (
    <section class="ck-card night" data-m="night" aria-label="Heute Nacht">
      <Orb k="night" />
      <div class="ck-kick"><Ico n="half-moon" />Heute Nacht</div>
      <div class="ck-night">
        <div><span class="l">Ins Bett bis</span>{p.bed != null ? <b>{minClock(p.bed)}</b> : <b class="ph" aria-label="noch keine Uhrzeit">––:––</b>}</div>
        <div class="r"><span class="l">Ziel</span><b>{hmm(p.target).replace(/:00$/, '')}<small>h</small></b></div>
      </div>
      <p class="ck-line s">{p.wake != null ? 'Für ' + hmm(p.target) + ' h Schlaf bis zu deiner üblichen Weckzeit ' + minClock(p.wake) + (p.std ? ' (Ziel: Standard, Garmin liefert noch keinen Schlafbedarf).' : '.') : 'Die Uhrzeit kommt aus deiner üblichen Weckzeit, sobald wieder Schlafdaten da sind.'}</p>
      {detail ? <div class="ck-xtra"><NightExtra p={p} /></div> : null}
    </section>
  );
}

function TomorrowCard({ ds, H, day }) {
  const o = outlook(dayVerdict(ds, H, day), H, day);
  return (
    <section class="ck-card" data-m="tomorrow" aria-label="Morgen">
      <div class="ck-kick"><Ico n="sun-light" />Morgen</div>
      <h3 class="ck-h3">{o.t}</h3>
      <p class="ck-line s">{o.s}</p>
    </section>
  );
}

// ---------- Gesundheit: kompakt die 4 wichtigsten, im Detail bis zu 8 mit Verlauf ----------
function HealthSection({ H, day, detail }) {
  const items = healthItems(H, day, detail ? 8 : 4);
  if (!items.length) return null;
  return (
    <div data-m="health">
      <SecHead title="Gesundheit" onAll={() => setTab('health')} />
      <div class={'ck-grid' + (detail ? ' det' : '')}>
        {items.map((x) => (detail ? <HealthTileBig x={x} day={day} H={H} /> : <HealthTile x={x} day={day} />))}
      </div>
    </div>
  );
}

function HealthTile({ x, day }) {
  const v = healthView(x, day);
  return (
    <button type="button" class={'ck-tile glow ' + v.grp} onClick={() => push('metric', { k: v.mk })} aria-label={v.name + ' ' + v.val + ' ' + v.unit + (v.note ? ', ' + v.note : '') + ', Details'}>
      <span class="ck-tn"><Ico n={v.icon} />{v.name}</span>
      <span class="ck-tv"><b>{v.val}{v.unit ? <small>{v.unit}</small> : null}</b>{v.note ? <em class={v.stale ? 'warn' : ''}>{v.note}</em> : null}</span>
    </button>
  );
}

// ---------- Training ----------
function TrainingSection({ d, H, day, w, detail }) {
  const f = latest(H.list, 'tsb', day);
  if (!f && !w.A.count && w.avg == null) return null;
  const pts = []; for (let i = 13; i >= 0; i--) { const r = H.map[addDays(day, -i)]; pts.push(r && r.tsb != null ? r.tsb : null); }
  return (
    <div data-m="training">
      <SecHead title="Training" onAll={() => setTab('activities')} />
      {detail ? (
        <div class="ck-stack">
          <FormCard H={H} day={day} />
          <WeekCard w={w} />
          <ZoneCard week={w.week} />
        </div>
      ) : (
        <div class="ck-grid two">
          <button type="button" class="ck-tile tall glow g-trn" onClick={() => push('metric', { k: 'tsb' })} aria-label={'Form ' + (f ? n0(f.v) + ', ' + formWord(f.v) : 'keine Daten') + ', Details'}>
            <span class="ck-tn">Form · 14 Tage</span>
            <b class="ck-mid">{f ? sgn0(f.v) : '–'}</b>
            <span class="ck-sub">{f ? formWord(f.v) : 'keine Daten'}</span>
            <FormSpark pts={pts} />
          </button>
          <button type="button" class="ck-tile tall glow g-akt" onClick={() => push('reviews')} aria-label={'Diese Woche ' + durHM(w.A.time) + ' ' + durU(w.A.time) + (w.avg ? ', Durchschnitt ' + durHM(w.avg.time) + ' ' + durU(w.avg.time) : '') + ', zu den Rückblicken'}>
            <span class="ck-tn">Diese Woche</span>
            <b class="ck-mid">{durHM(w.A.time)}<small>{durU(w.A.time)}</small></b>
            <span class="ck-sub">{w.avg ? 'von Ø ' + durHM(w.avg.time) + NB + durU(w.avg.time) : 'noch kein Schnitt'}</span>
            <span class="ck-bar" aria-hidden="true"><i style={{ width: Math.min(100, w.avg ? (w.A.time / w.avg.time) * 100 : 0) + '%' }} /></span>
            <span class="ck-sub s">{w.A.count ? km(w.A.dist) + NB + 'km · ' + hmFmt(w.A.gain) + NB + 'Hm · ' + w.A.count + '×' : 'Noch keine Einheit'}</span>
          </button>
        </div>
      )}
    </div>
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

// ---------- Letzte Aktivität: kompakt als Zeile, im Detail die volle Sportart-Karte ----------
function LastSection({ d, title, a, today, detail }) {
  const wantMap = !!(a && !a.poly && a.gid && !a.indoor && !a.trainer && !a.noGps && a.dist > 0 && dsport(a) !== 'gym');
  const [streams, setStreams] = useState(null);
  useEffect(() => { if (wantMap && Acts.ensurePoly) Acts.ensurePoly(a.id).catch(() => {}); }, [wantMap, a && a.id]);
  useEffect(() => {
    if (!detail || !a) return;
    let alive = true;
    setStreams(null);
    Acts.loadStreams(a.id).then((s) => { if (alive) setStreams(s); }).catch(() => {});
    return () => { alive = false; };
  }, [detail, a && a.id]);
  const sections = useMemo(() => (streams && streams.alt ? computeSections(streams, a.sport) : []), [streams, a && a.sport]);
  if (!a) return null;
  const S = getState();
  const pts = a.poly && !a.indoor ? decode(a.poly) : null;
  const when = a.date === today ? 'Heute' + (a.start ? ', ' + a.start.slice(11, 16) : '') : dateShort(a.date);
  if (detail) {
    return (
      <div data-m="last">
        <SecHead title={title} />
        <div class="ck-stack">
          <SportCard a={a} detail want={false} streams={streams} sections={sections} cls="ck-sc" label={a.name} onOpen={() => push('activity', { id: a.id })} />
        </div>
      </div>
    );
  }
  const [m1, m2] = listMetrics(a, S.perf[a.id], S.strength[a.id]);
  return (
    <div data-m="last">
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
    </div>
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
    const N = nutriOf(H, day);
    rows.push(<Row icon="cutlery" t="Ernährung">{N.total ? 'Energiebedarf heute ca. ' + int(N.total) + ' kcal (Grundumsatz ' + int(N.bmr.v) + ' + Aktivität ' + int(N.act) + '). ' : ''}{N.tips.length ? N.tips[0].text : 'Normale Portionen, Eiweiß zu jeder Mahlzeit, ausreichend trinken.'}</Row>);
    const w = weekStats(d.list, day);
    rows.push(<Row icon="calendar" t="Woche">{durHM(w.A.time)}{NB}{durU(w.A.time)}, {km(w.A.dist)}{NB}km, {hmFmt(w.A.gain)}{NB}Hm in {w.A.count} {w.A.count === 1 ? 'Einheit' : 'Einheiten'}.{w.avg ? ' Ø der letzten 4 Wochen: ' + durHM(w.avg.time) + NB + durU(w.avg.time) + '.' : ''}</Row>);
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
    const N = nutriOf(H, day);
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
