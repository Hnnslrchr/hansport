import { SplitsBlock, PowerCurveBlock, GradeProfile, GradeSection } from './actviz.jsx';
import { toGrid, gradeModel } from '../grade.js';
import { h, Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useData, gearName, zoneHist, link3d } from './common.jsx';
import { Top, Section, Icon, Seg, Mark, Cell, Sheet, Stepper, Scale, Note, Stat, Est, sportColor, Chips } from '../ui/kit.jsx';
import { Profile, Series, secColor } from '../ui/charts.jsx';
import { MapView, appleMapsUrl } from '../ui/map.jsx';
import { push, openSheet, closeSheet, pop } from '../nav.js';
import { getState, editAct, patchDoc, setDoc, delDoc, newId, toast } from '../store.js';
import { loadStreams, ensurePerf, ensurePowerCurve, ensureStrength, explain , ensureFullGrade } from '../strava.js';
import { caps } from '../platform.js';
import { computeSections, applyOverrides, snowSummary, gradeBins } from '../sections.js';
import { zonesAt, timeInZones, median, CURVE_DURS } from '../analysis.js';
import { routeMetric } from '../analysis.js';
import { routeFlags, effortOnMark, similarActs } from '../routes.js';
import { SPORT_ORDER, SPORTS, sportLabel, dsport, CONTEXT_FIELDS, SECTION_TYPES, SECTION_CHOICES } from '../sports.js';
import { decode, encode } from '../geo.js';
import { km, hm, dur, int, num, dateLong, dateMid, timeOf, speedKmh, clock, pace, hours } from '../format.js';
import { RPE_LABELS, startGym } from './activities.jsx';
import { heatItems } from './mapview.jsx';
import { WEB, ACT_SRC } from '../env.js';

export function ActivityDetail({ id }) {
  const d = useData();
  const a = d.byId[id];
  const S = getState();
  const e = S.edits[id] || {};
  const [streams, setStreams] = useState(null);
  const [gr, setGr] = useState(null);
  const [climb, setClimb] = useState(null);
  const [grBusy, setGrBusy] = useState(false);
  const [sErr, setSErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(null);
  const perf = S.perf[id];
  const wantStreams = !!(a && a.src === 'strava' && a.sport !== 'gym');

  useEffect(() => {
    if (!wantStreams) return;
    let alive = true;
    setLoading(true);
    loadStreams(id).then((s) => { if (alive) { setStreams(s); setLoading(false); } }).catch((err) => { if (alive) { setSErr(err); setLoading(false); } });
    if (!perf && a.src === 'strava') ensurePerf(id).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  const sections = useMemo(() => {
    if (!streams || !a) return [];
    return applyOverrides(streams, a.sport, e.sections) || computeSections(streams, a.sport);
  }, [streams, a && a.sport, e.sections]);
  const gradeM = useMemo(() => { const g = gr || (perf && perf.gr) || (streams && streams.alt && streams.d ? toGrid({ d: streams.d, alt: streams.alt, t: streams.t }, 20) : null); try { return gradeModel(g); } catch (e) { return null; } }, [gr, perf && perf.gr, streams]);
  const pts = useMemo(() => (streams && streams.ll && streams.ll.length ? streams.ll : a && a.poly ? decode(a.poly) : null), [streams, a && a.poly]);
  const heat = useMemo(() => (!a || a.indoor ? [] : heatItems(d)), [d.v, a && a.indoor]);
  const mapCore = useRef();
  const segsOnMap0 = useMemo(() => {
    if (!streams || !streams.ll || !sections.length) return null;
    const rank = (t) => (t === 'climb' || t === 'ascent' || t === 'walkup' ? 2 : t === 'flat' ? 0 : 1);
    // ganze Strecke in Aktivitätsfarbe, Anstiege dunkel hervorgehoben
    const climbs = sections.filter((s) => !s.point && rank(s.type) === 2).map((s) => ({ pts: streams.ll.slice(s.i0, s.i1 + 1), color: 'var(--ink)' }));
    return climbs.length ? climbs : null;
  }, [streams, sections]);
  const segsOnMap = segsOnMap0;
  if (!a) return <div class="view"><Top title="Aktivität" /><div class="empty"><h3>Nicht gefunden</h3>Diese Aktivität gibt es nicht mehr. Geh zurück zur Liste.</div></div>;
  const cluster = d.clusters.find((c) => c.key === d.byAct[id]);
  const dup = d.dups[id] ? d.byId[d.dups[id]] : null;
  const zones = zonesAt(zoneHist(), a.date);

  return (
    <div class="view has-sky g-akt">
      <div class="md-sky" aria-hidden="true" />
      <Top title={sportLabel(dsport(a))} actions={<button type="button" class="iconbtn" aria-label="Name und Sportart bearbeiten" onClick={() => openSheet(() => <EditSheet a={a} />)}>✎</button>} />
      <div class="pad stack" style="gap:6px;margin-bottom:10px">
        <div class="row"><Mark a={a} /><div class="grow"><h1 style="font-family:var(--display);font-size:var(--fs-t2);line-height:1.1">{a.name}</h1><div class="small muted">{dateLong(a.date)}{timeOf(a.start) ? ', ' + timeOf(a.start) : ''}{a.place && !a.indoor ? ' · ' + a.place.split(' - ')[0] : ''}</div></div></div>
        <div class="row wrap" style="gap:6px">
          {a.src === 'manual' ? <Est kind="man" /> : null}
          {a.indoor ? <span class="pill">Indoor{a.sub && !/indoor/i.test(a.sub) ? ' · ' + a.sub : a.sub ? ' · ' + a.sub.replace(/\s*\/?\s*indoor/i, '') : ''}</span> : a.sub ? <span class="pill">{a.sub}</span> : null}
          {a.ebike ? <span class="pill">E-MTB</span> : null}
          {a.derived ? <span class="pill warn" title={a.derived}>Sportart aus Ausrüstung</span> : null}
          {a.edited && a.src === 'strava' ? <span class="pill">ergänzt</span> : null}
          {a.excluded ? <span class="pill warn">aus Auswertungen ausgeblendet</span> : null}
          {a.gone ? <span class="pill warn">in Strava nicht mehr gefunden</span> : null}
          {a.gear ? <span class="pill">{gearName(d, a.gear)}</span> : null}
        </div>
      </div>
      {dup ? <div style="margin-bottom:10px"><Note kind="warn">Mögliche Doppelaufzeichnung mit „{dup.name}" (gleiche Zeit, zwei Geräte). <button type="button" class="btn ghost" onClick={() => editAct(dup.id, { excluded: true })}>Die andere ausblenden</button></Note></div> : null}

      <KeyStats a={a} perf={perf} sections={sections} />

      {pts && !a.indoor ? (
        <div style="margin:12px 16px 0;border-radius:14px;overflow:hidden;box-shadow:var(--shadow)">
          <MapView height="260px" heat={heat} heatMono heatAlpha={0.5} fit={[pts]} fitKey={id} coreRef={mapCore}
            lines={[{ pts: streams && streams.ll ? streams.ll : pts, color: 'var(--c-akt)', width: 3.8 }, ...(segsOnMap ? [{ segments: segsOnMap, width: 3.8, halo: false }] : [])]}
            markers={[{ pt: pts[pts.length - 1], color: 'var(--ink)', ring: true, r: 5.5 }, { pt: pts[0], color: 'var(--ink)', r: 5.5 }]}
            cursor={cursor != null && streams && streams.ll ? streams.ll[cursor] : null}
            label={'Karte der Aktivität ' + a.name} />
        </div>
      ) : null}
      {pts && !a.indoor ? (
        <div class="pad" style="margin-top:8px">
          <div class="row" style="gap:8px">
            {link3d([{ pts, title: a.name, date: a.date, sport: a.sport, dist: a.dist }])
              ? <a class="btn grow" href={link3d([{ pts, title: a.name, date: a.date, sport: a.sport, dist: a.dist }])} target="_blank" rel="noopener">In 3D ansehen</a>
              : <button type="button" class="btn sec2 grow" onClick={() => push('settings')}>3D-Karte einrichten</button>}
            <a class="btn sec2" href={appleMapsUrl(mapCore.current, pts)} target="_blank" rel="noopener">Apple Karten</a>
          </div>
          <div class="tiny faint" style="margin-top:6px">Gefüllter Punkt Start, Ring Ziel{segsOnMap ? ', Anstiege hervorgehoben' : ''}. Im Hintergrund grau deine übrigen Spuren.</div>
        </div>
      ) : null}

      {wantStreams ? (
        <Section title="Verlauf">
          <div class="card p">
            {loading ? <div aria-busy="true" aria-label="Zeitreihen werden geladen"><div class="skel skel-chart" /><div class="skel skel-line" style="width:60%" /></div> : null}
            {sErr ? <Note kind="warn">Zeitreihen nicht verfügbar. {explain(sErr)}</Note> : null}
            {streams ? (
              <Fragment>
                {streams.alt ? (gradeM ? <GradeProfile model={gradeM} streams={streams} sections={sections} secColor={secColor} cursor={cursor} onCursor={setCursor} climb={climb} label={'Höhenprofil ' + a.name + ' nach Steigung'} /> : <Profile d={streams.d} alt={streams.alt} sections={sections} cursor={cursor} onCursor={setCursor} label={'Höhenprofil ' + a.name} />) : <div class="small muted">Keine Höhendaten.</div>}
                {streams.hr && streams.hr.some((v) => v) ? <Series d={streams.d} y={streams.hr} cursor={cursor} label="Puls" unit="bpm" color="var(--c-herz)" /> : null}
                {streams.w && streams.w.some((v) => v) && (perf?.hasW || a.indoor) ? <Series d={streams.d} y={streams.w} cursor={cursor} label="Leistung" unit="W" color="var(--ink)" /> : null}
                {streams.v && !a.indoor && a.sport !== 'gym' ? <Series d={streams.d} y={streams.v.map((v) => (v == null ? null : v * 3.6))} cursor={cursor} label="Tempo" unit="km/h" color="var(--c-akt)" fmt={(v) => num(v, 0)} /> : null}
                <div class="chart-sum">{streams.alt ? 'Im Höhenprofil tippen oder ziehen, um die Position auf Karte und Kurven zu sehen. ' : ''}Auflösung: {streams.t.length} Messpunkte.</div>
              </Fragment>
            ) : null}
          </div>
        </Section>
      ) : null}

      {gradeM && gradeM.up.h >= 20 && a.sport !== 'gym' ? <Section title="Anstiege und Steigung"><div style="padding:0 16px"><GradeSection a={a} model={gradeM} full={!!(gr || (perf && perf.gr))} busy={grBusy} climb={climb} setClimb={setClimb}
        onJump={(d) => { if (streams && streams.d) { let bi = 0; for (let i = 0; i < streams.d.length; i++) if (streams.d[i] != null && Math.abs(streams.d[i] - d) < Math.abs((streams.d[bi] || 0) - d)) bi = i; setCursor(bi); } }}
        onFull={() => { setGrBusy(true); ensureFullGrade(a.id).then((g) => { setGr(g); setClimb(null); setGrBusy(false); }).catch((e) => { setGrBusy(false); toast(explain(e), 'error'); }); }} /></div></Section> : null}
      {streams && ['road', 'mtb', 'hike'].includes(a.sport) && !a.indoor ? <Section title="Splits"><div style="padding:0 16px"><SplitsBlock streams={streams} onCursor={setCursor} /></div></Section> : null}
      {streams && streams.alt && sections.length ? <SectionsBlock a={a} streams={streams} sections={sections} cursor={cursor} setCursor={setCursor} edited={!!(e.sections && e.sections.length)} /> : null}
      {(a.sport === 'snowboard' || a.sport === 'splitboard') && sections.length ? <SnowBlock a={a} sections={sections} /> : null}
      {a.sport === 'hike' && streams ? <HikeBlock streams={streams} a={a} /> : null}
      {(a.sport === 'road' || a.sport === 'mtb') && streams ? <ZonesBlock a={a} streams={streams} zones={zones} perf={perf} /> : null}
      {a.sport === 'gym' ? <GymBlock a={a} /> : null}
      {perf && perf.seg && perf.seg.length ? <SegmentsBlock a={a} perf={perf} d={d} /> : null}
      {cluster && cluster.members.length >= 2 ? <RouteBlock a={a} c={cluster} /> : a.poly && !a.indoor ? <SimilarBlock a={a} d={d} cluster={cluster} /> : null}
      <ContextBlock a={a} e={e} d={d} />
      <MediaBlock a={a} e={e} />
      <QualityBlock a={a} perf={perf} streams={streams} />
      {a.src === 'strava' ? <div class="pad" style="margin-top:14px">{a.gid ? <a class="small" href={'https://connect.garmin.com/modern/activity/' + a.gid} target="_blank" rel="noopener">In Garmin Connect öffnen</a> : <a class="small" href={'https://www.strava.com/activities/' + a.id} target="_blank" rel="noopener">In Strava öffnen</a>}</div> : null}
      {a.src === 'manual' ? <div class="pad" style="margin-top:14px"><button type="button" class="btn danger" onClick={() => { delDoc('manual/' + a.id); pop(); toast('Gelöscht'); }}>Manuelle Aktivität löschen</button></div> : null}
      <div class="spacer" />
    </div>
  );
}

function KeyStats({ a, perf, sections }) {
  const s = [];
  const ascSecs = sections.filter((x) => x.type === 'climb' || x.type === 'ascent');
  if (a.sport === 'road' || a.sport === 'mtb') {
    s.push([km(a.dist), 'km', a.indoor ? 'Distanz (virtuell)' : 'Distanz']);
    s.push([dur(a.mov).split(' ')[0], a.mov >= 3600 ? 'h' : 'min', 'Bewegungszeit']);
    s.push([hm(a.gain), 'Hm', a.indoor ? 'Aufstieg (virtuell)' : 'Aufstieg']);
    s.push([speedKmh(a.mov ? a.dist / a.mov : 0), 'km/h', 'Ø Tempo']);
    if (perf && perf.avgHr) s.push([int(perf.avgHr), 'bpm', 'Ø Puls']);
    if (perf && perf.avgW) s.push([int(perf.avgW), 'W', perf.hasW ? 'Ø Leistung' : 'Ø Leistung', !perf.hasW]);
    if (a.cad) s.push([int(a.cad), 'U/min', 'Ø Trittfrequenz']);
  } else if (a.sport === 'hike') {
    s.push([hm(a.gain), 'Hm', 'Aufstieg']);
    s.push([km(a.dist), 'km', 'Distanz']);
    s.push([dur(a.mov).split(' ')[0], a.mov >= 3600 ? 'h' : 'min', 'Bewegungszeit']);
    s.push([dur(Math.max(0, a.ela - a.mov)).split(' ')[0], a.ela - a.mov >= 3600 ? 'h' : 'min', 'Pausen']);
    const asc = ascSecs.reduce((x, y) => x + y.gain, 0), at = ascSecs.reduce((x, y) => x + y.mov, 0);
    if (at) s.push([int((asc / at) * 3600), 'Hm/h', 'Im Aufstieg']);
    else if (a.mov) s.push([int((a.gain / a.mov) * 3600), 'Hm/h', 'Hm pro Stunde']);
    if (a.dist && a.mov) s.push([pace(a.mov / (a.dist / 1000)), '/km', 'Ø Tempo']);
  } else if (a.sport === 'splitboard' || a.sport === 'snowboard') {
    const sm = snowSummary(sections);
    if (a.sport === 'splitboard') {
      s.push([hm(sm.ascentGain || a.gain), 'Hm', 'Aufstieg']);
      s.push([dur(sm.ascentTime).split(' ')[0], sm.ascentTime >= 3600 ? 'h' : 'min', 'Aufstiegszeit']);
      s.push([sm.ascentRate ? int(sm.ascentRate) : '–', 'Hm/h', 'Hm pro Stunde']);
      s.push([sm.descents || '–', '', 'Abfahrten']);
      s.push([dur(a.ela).split(' ')[0], a.ela >= 3600 ? 'h' : 'min', 'Gesamtzeit']);
      if (perf && perf.avgHr) s.push([int(perf.avgHr), 'bpm', 'Ø Puls']);
    } else {
      s.push([sm.runs || '–', '', 'Abfahrten']);
      s.push([hm(sm.runLoss), 'Hm', 'bergab']);
      s.push([sm.lifts || '–', '', 'Liftfahrten']);
      s.push([dur(sm.runTime).split(' ')[0], sm.runTime >= 3600 ? 'h' : 'min', 'in Abfahrten']);
      s.push([dur(sm.liftTime).split(' ')[0], sm.liftTime >= 3600 ? 'h' : 'min', 'im Lift']);
      s.push([dur(sm.pauseTime).split(' ')[0], sm.pauseTime >= 3600 ? 'h' : 'min', 'Pausen']);
    }
  } else {
    s.push([dur(a.mov).split(' ')[0], a.mov >= 3600 ? 'h' : 'min', 'Dauer']);
    if (a.dist) s.push([km(a.dist), 'km', 'Distanz']);
    if (a.cal) s.push([int(a.cal), 'kcal', 'Energie']);
    if (perf && perf.avgHr) s.push([int(perf.avgHr), 'bpm', 'Ø Puls']);
  }
  if (a.re != null) s.push([int(a.re), '', 'Relative Effort']);
  if (a.rpe) s.push([a.rpe, '/10', 'Anstrengung (deine)']);
  return (
    <div class="card p">
      <div class="stats">{s.map(([v, u, l, est]) => <Stat v={v} u={u} l={l} est={est} />)}</div>
      {a.sport === 'snowboard' ? <div class="chart-sum">Spitzengeschwindigkeit und Ranglisten stehen bewusst nicht im Vordergrund.</div> : null}
    </div>
  );
}

function SectionsBlock({ a, streams, sections, cursor, setCursor, edited }) {
  const total = streams.t[streams.t.length - 1] - streams.t[0] || 1;
  const order = sections.map((s, k) => ({ s, k })).sort((x, y) => x.s.i0 - y.s.i0 || (x.s.point ? 1 : -1));
  const types = [...new Set(sections.map((s) => s.type))];
  const tempo = (s) => (s.type === 'climb' || s.type === 'ascent' || s.type === 'walkup' ? int(s.vam) + ' Hm/h' : s.type === 'pause' || s.type === 'transition' || s.type === 'lift' ? '' : a.sport === 'hike' ? pace(s.mov / (s.dist / 1000)) + ' /km' : speedKmh(s.speed) + ' km/h');
  return (
    <Section title="Abschnitte" action={edited ? 'Automatisch neu gliedern' : null} onAction={() => { editAct(a.id, { sections: undefined }); toast('Abschnitte zurückgesetzt'); }}>
      <div class="card p">
        <div class="secbar" aria-hidden="true">{order.filter(({ s }) => !s.point).map(({ s }) => <span class={'st-' + s.type} style={{ flex: Math.max(0.5, (streams.t[s.i1] - streams.t[s.i0]) / total), background: secColor(s.type) }} />)}</div>
        <div class="legend-row" style="margin-top:6px">{types.map((t) => <span><i style={{ background: secColor(t) }} />{SECTION_TYPES[t]?.label}</span>)}</div>
        <table class="table sect" style="margin-top:8px">
          <thead><tr><th>Abschnitt</th><th>km</th><th>Höhe m</th><th>Zeit</th><th>Tempo</th></tr></thead>
          <tbody>
            {order.map(({ s, k }) => (
              <tr class="click" onClick={() => { setCursor(s.i0); openSheet(() => <SectionSheet a={a} streams={streams} sections={sections} idx={k} />); }}>
                <td><i class="sw" style={{ background: secColor(s.type) }} />{SECTION_TYPES[s.type]?.label}{s.manual ? ' ✎' : ''}</td>
                <td>{s.point ? '–' : km(s.dist)}</td>
                <td>{s.type === 'pause' || s.type === 'transition' ? int(s.altStart) : (s.net >= 0 ? '+' : '−') + int(Math.abs(s.net))}</td>
                <td>{s.type === 'pause' || s.type === 'transition' || s.type === 'lift' ? clock(s.elapsed) : clock(s.mov)}</td>
                <td class="muted">{tempo(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="chart-sum">Zeit als Std.:Min.:Sek. bzw. Min.:Sek. Höhe: Differenz im Abschnitt, bei Pausen die Höhe des Halts. Automatisch aus Höhe, Tempo und Stillstand erkannt. Abschnitt antippen, um ihn zu korrigieren, zu teilen oder als wiederkehrende Teilstrecke zu markieren.</div>
      </div>
    </Section>
  );
}

function SectionSheet({ a, streams, sections, idx }) {
  const s = sections[idx];
  const choices = SECTION_CHOICES[a.sport] || SECTION_CHOICES.other;
  const [name, setName] = useState('');
  const base = () => sections.filter((x) => !x.point || x.type === 'pause').map((x) => ({ i0: x.i0, i1: x.i1, type: x.type }));
  const save = (list) => { editAct(a.id, { sections: list }); closeSheet(); toast('Abschnitte gespeichert'); };
  const setType = (t) => { const l = base(); const k = l.findIndex((x) => x.i0 === s.i0 && x.i1 === s.i1); if (k >= 0) l[k].type = t; save(l); };
  const mergeNext = () => {
    const l = base().filter((x) => !(x.type === 'pause' && x.i1 - x.i0 <= 1));
    const k = l.findIndex((x) => x.i0 === s.i0);
    if (k < 0 || k + 1 >= l.length) return;
    l.splice(k, 2, { i0: l[k].i0, i1: l[k + 1].i1, type: l[k].type });
    save(l);
  };
  const split = () => {
    const mid = Math.round((s.i0 + s.i1) / 2);
    const l = base();
    const k = l.findIndex((x) => x.i0 === s.i0 && x.i1 === s.i1);
    l.splice(k, 1, { i0: s.i0, i1: mid, type: s.type }, { i0: mid, i1: s.i1, type: s.type });
    save(l);
  };
  const mark = (kind) => {
    if (!streams.ll) return;
    const S = getState();
    const r = S.routes.main || {};
    const m = { id: newId('t'), name: name || (kind === 'trail' ? 'Trail' : 'Anstieg') + ' ab ' + int(s.altStart) + ' m', kind, sport: a.sport, a: streams.ll[s.i0], b: streams.ll[s.i1], path: encode(streams.ll.slice(s.i0, s.i1 + 1)), len: Math.round(s.dist), gain: Math.round(s.gain), created: Date.now(), from: a.id, results: {} };
    const eff = effortOnMark(streams, m.a, m.b);
    if (eff) m.results[a.id] = { time: eff.time, dist: Math.round(eff.dist), gain: Math.round(eff.gain), hr: eff.hr ? Math.round(eff.hr) : null, date: a.date };
    setDoc('routes/main', { ...r, marks: [...(r.marks || []), m] });
    closeSheet();
    push('mark', { id: m.id });
  };
  return (
    <Sheet title={SECTION_TYPES[s.type]?.label + ' · ' + (s.point ? dur(s.elapsed) : km(s.dist) + ' km')}>
      <dl class="kv">
        <dt>Höhe</dt><dd>{int(s.altStart)} → {int(s.altEnd)} m</dd>
        {!s.point ? <Fragment><dt>Aufstieg / Abstieg</dt><dd>+{int(s.gain)} / −{int(s.loss)} m</dd><dt>Steigung Ø</dt><dd>{num(s.grade * 100, 1)} %</dd></Fragment> : null}
        <dt>Zeit</dt><dd>{dur(s.mov || s.elapsed)}{s.elapsed > s.mov + 30 && !s.point ? ' (gesamt ' + dur(s.elapsed) + ')' : ''}</dd>
        {s.hr ? <Fragment><dt>Puls Ø</dt><dd>{int(s.hr)} bpm</dd></Fragment> : null}
        {s.watts ? <Fragment><dt>Leistung Ø</dt><dd>{int(s.watts)} W</dd></Fragment> : null}
      </dl>
      <div class="field"><label>Art des Abschnitts</label><div class="scale">{choices.map((c) => <button type="button" aria-pressed={String(c === s.type)} onClick={() => setType(c)} style="font-size:var(--fs-foot)">{SECTION_TYPES[c].label}</button>)}</div></div>
      <div class="row"><button type="button" class="btn sec2 grow" onClick={split} disabled={s.point || s.i1 - s.i0 < 4}>In zwei teilen</button><button type="button" class="btn sec2 grow" onClick={mergeNext}>Mit nächstem zusammenlegen</button></div>
      {!s.point && streams.ll ? (
        <Fragment>
          <div class="field"><label for="mk-name">Als wiederkehrende Teilstrecke markieren</label><input id="mk-name" class="input" placeholder="z. B. Penon-Trail" value={name} onInput={(e) => setName(e.target.value)} /></div>
          <div class="row"><button type="button" class="btn grow" onClick={() => mark(s.net >= 0 ? 'climb' : 'trail')}>{s.net >= 0 ? 'Als Anstieg markieren' : 'Als Trail markieren'}</button></div>
          <div class="tiny faint">hansport findet dieselbe Teilstrecke in anderen Aktivitäten, in derselben Richtung, und vergleicht die Zeiten.</div>
        </Fragment>
      ) : null}
    </Sheet>
  );
}

function SnowBlock({ a, sections }) {
  const sm = snowSummary(sections);
  const mismatch = (a.sport === 'splitboard' && sm.kind === 'piste') || (a.sport === 'snowboard' && sm.kind === 'tour');
  const label = sm.kind === 'piste' ? 'Pistentag mit Lift' : sm.kind === 'tour' ? 'Tour mit eigenem Aufstieg' : 'nicht eindeutig';
  return (
    <Section title="Erkennung">
      <div class="card p stack" style="gap:8px">
        <div class="row"><b class="grow">{label}</b><span class={'pill' + (mismatch ? ' warn' : ' good')}>{mismatch ? 'passt nicht zur Sportart' : 'passt'}</span></div>
        <div class="small">
          {sm.lifts ? sm.lifts + (sm.lifts === 1 ? ' Liftfahrt' : ' Liftfahrten') + ' mit ' + hm(sm.liftGain) + ' Hm (über 900 Hm pro Stunde inkl. Warten). ' : ''}
          {sm.ascentGain ? 'Aufstieg aus eigener Kraft: ' + hm(sm.ascentGain) + ' Hm mit ' + int(sm.ascentRate) + ' Hm/h. ' : ''}
          {sm.transitions ? sm.transitions + (sm.transitions === 1 ? ' Übergang' : ' Übergänge') + ' (' + dur(sm.transitionTime) + '). ' : ''}
          {sm.runs ? sm.runs + (sm.runs === 1 ? ' Abfahrt' : ' Abfahrten') + ' mit ' + hm(sm.runLoss) + ' Hm.' : ''}
        </div>
        {mismatch ? <button type="button" class="btn" onClick={() => editAct(a.id, { sport: sm.kind === 'piste' ? 'snowboard' : 'splitboard' })}>Als {sm.kind === 'piste' ? 'Snowboarden (Piste)' : 'Splitboard-Tour'} einordnen</button> : null}
        <div class="tiny faint">Unterscheidung über die Steiggeschwindigkeit: Lifte steigen schneller als 900 Hm pro Stunde, Aufstiege mit Fellen meist zwischen 300 und 700.</div>
      </div>
    </Section>
  );
}

function HikeBlock({ streams, a }) {
  const bins = gradeBins(streams);
  return (
    <Section title="Tempo nach Steigung">
      <div class="card p">
        <table class="table">
          <thead><tr><th>Steigung</th><th>Strecke</th><th>Zeit</th><th>Tempo</th><th>Hm/h</th></tr></thead>
          <tbody>{bins.map((b) => <tr><td>{b.label}</td><td>{km(b.dist)} km</td><td>{dur(b.time)}</td><td>{pace(b.time / (b.dist / 1000))}</td><td>{b.up > b.down ? int(b.vam) + ' ↑' : int(b.vdesc) + ' ↓'}</td></tr>)}</tbody>
        </table>
        <div class="chart-sum">Tempo in min/km, ohne Pausen. Vergleichbar wird es zwischen Abschnitten mit ähnlicher Steigung. {a.ctx && a.ctx.pack ? 'Rucksack: ' + a.ctx.pack + ' kg.' : 'Rucksackgewicht unten ergänzen, damit langsamere Aufstiege richtig eingeordnet werden.'}</div>
      </div>
    </Section>
  );
}

function ZonesBlock({ a, streams, zones, perf }) {
  const [pc, setPc] = useState(perf && perf.pc ? perf.pc : null);
  const [busy, setBusy] = useState(false);
  const hasW = streams.w && streams.w.some((v) => v) && (a.indoor || (perf && perf.hasW));
  const hrZ = zones && streams.hr ? timeInZones(streams.hr, streams.t, zones.hr) : null;
  const pwZ = zones && zones.power && hasW ? timeInZones(streams.w, streams.t, zones.power) : null;
  const ZoneRows = ({ z, maxes, unit, colors }) => {
    const tot = z.reduce((x, y) => x + y, 0) || 1;
    return z.map((v, i) => (
      <div class="zone-row"><span class="num">Z{i + 1}</span><div class="track"><div class="fill" style={{ width: (v / tot) * 100 + '%', background: colors[i] }} /></div><span class="right num small">{dur(v)}</span></div>
    ));
  };
  // Zonen als Stufen einer Farbe: je höher die Zone, desto kräftiger (passt sich hell/dunkel an)
  const ramp = (c, n) => Array.from({ length: n }, (_, i) => `color-mix(in oklab, var(${c}) ${Math.round(30 + (70 * i) / (n - 1))}%, var(--tile))`);
  const hrC = ['var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)'];
  const pwC = ramp('--ink', 7);
  return (
    <Fragment>
      {hrZ || pwZ ? (
        <Section title="Zeit in Zonen" action="Zonen einstellen" onAction={() => push('settings')}>
          <div class="card p stack" style="gap:6px">
            {hrZ ? <Fragment><div class="small"><b>Puls</b> <span class="muted">Grenzen {zones.hr.join(' · ')} bpm</span></div><ZoneRows z={hrZ} colors={hrC} /></Fragment> : null}
            {pwZ ? <Fragment><div class="small" style="margin-top:6px"><b>Leistung</b> <span class="muted">FTP {zones.ftp} W{zones.ftpEst ? ' (von Strava geschätzt)' : ''}</span></div><ZoneRows z={pwZ} colors={pwC} /></Fragment> : null}
            <div class="chart-sum">Zonen gültig ab {zones.from === '2000-01-01' ? 'Beginn deiner Aufzeichnungen' : dateMid(zones.from)}{zones.src === 'user' ? ', von dir eingestellt' : ', Quelle Strava'}. Rückblicke nutzen die Zonen, die zum Datum der Fahrt galten. Auflösung der Zeitreihe: {streams.t.length} Punkte.</div>
          </div>
        </Section>
      ) : null}
      {hasW ? (
        <Section title="Leistungskurve">
          <div class="card p">
            {pc && pc.res && pc.res.length ? (
              pc.res.length >= 2 ? <PowerCurveBlock res={pc.res} ftp={zones && zones.ftp ? zones.ftp : null} /> : <table class="table"><thead><tr><th>Dauer</th><th>Leistung</th></tr></thead><tbody>{pc.res.map((r) => <tr><td>{r.d < 60 ? r.d + ' s' : r.d / 60 + ' min'}</td><td><b>{r.w} W</b></td></tr>)}</tbody></table>
            ) : (
              <button type="button" class="btn sec2 wide" disabled={busy} onClick={() => { setBusy(true); ensurePowerCurve(a.id).then((x) => { setPc(x); setBusy(false); }).catch((e) => { setBusy(false); toast(explain(e), 'error'); }); }}>{busy ? 'Berechne …' : 'Bestwerte aus voller Auflösung berechnen'}</button>
            )}
            <div class="chart-sum">Gemessene Leistung ({a.indoor ? 'Rollentrainer' : 'Leistungsmesser'}). Kürzere Spannen erscheinen nur, wenn die Messpunkte dicht genug liegen.</div>
          </div>
        </Section>
      ) : perf && perf.avgW && !perf.hasW ? <div style="margin-top:10px"><Note>Die Leistung dieser Fahrt ist von Strava geschätzt (kein Leistungsmesser). Für Zonen und Bestwerte wird sie nicht verwendet.</Note></div> : null}
    </Fragment>
  );
}

function GymBlock({ a }) {
  const S = getState();
  const [str, setStr] = useState(S.strength[a.id] || null);
  useEffect(() => { if (a.src === 'strava' && !str) ensureStrength(a.id).then(setStr).catch(() => {}); }, [a.id]);
  const session = a.gymId ? S.gym[a.gymId] : null;
  const unlinked = Object.values(S.gym).filter((g) => !g.linked && g.date === a.date);
  return (
    <Section title="Krafttraining">
      <div class="card p stack" style="gap:10px">
        {session ? (
          <Fragment>
            <div class="row"><b class="grow">Trainingslog: {session.title}</b><span class="pill">{(session.exercises || []).reduce((x, e) => x + (e.sets || []).length, 0)} Sätze</span></div>
            {(session.exercises || []).map((e) => <div class="small"><b>{e.name}</b> <span class="muted">{(e.sets || []).map((s) => (s.reps || '') + (s.kg != null ? '×' + num(s.kg, s.kg % 1 ? 1 : 0) + ' kg' : '') + (s.sec ? s.sec + ' s' : '')).join(' · ')}</span></div>)}
            <button type="button" class="btn sec2" onClick={() => push('gym', { id: session.id })}>Log öffnen</button>
          </Fragment>
        ) : (
          <Fragment>
            {str && str.sets && str.sets.length ? (
              <Fragment>
                <div class="small"><b>Von der Uhr erkannt</b> <span class="pill warn">automatisch</span></div>
                {str.sets.map((s) => <div class="small">{s.name}: {s.reps != null ? s.reps + ' Wdh.' : ''}{s.kg != null ? ' · ' + s.kg + ' ' + s.unit : ''}{s.sec ? ' · ' + dur(s.sec) : ''}</div>)}
              </Fragment>
            ) : <div class="small muted">{'Keine Sätze in ' + (a.origin === 'garmin' || a.gid ? 'Garmin' : 'Strava') + ' erfasst.'}</div>}
            {unlinked.length ? unlinked.map((g) => <button type="button" class="btn" onClick={() => { patchDoc('gym/' + g.id, { linked: a.id }); toast('Verknüpft: zählt jetzt einmal'); }}>Log „{g.title}" vom selben Tag verknüpfen</button>) : null}
            {a.src === 'strava' ? <button type="button" class="btn sec2" onClick={() => { startGymLinked(a); }}>Sätze für diese Einheit erfassen</button> : null}
          </Fragment>
        )}
      </div>
    </Section>
  );
}

function startGymLinked(a) {
  const id = newId('s');
  setDoc('gym/' + id, { id, date: a.date, start: a.start, title: a.name, exercises: [], linked: a.id, createdAt: Date.now() });
  push('gym', { id });
}

function SegmentsBlock({ a, perf, d }) {
  const rows = perf.seg.map((e) => ({ e, s: d.segIdx[e.id] })).filter((x) => x.s && x.s.efforts.length >= 2).sort((x, y) => y.s.gain - x.s.gain).slice(0, 8);
  if (!rows.length) return null;
  return (
    <Section title="Wiederkehrende Abschnitte">
      <div class="list">
        {rows.map(({ e, s }) => {
          const sorted = s.efforts.slice().sort((x, y) => x.mt - y.mt);
          const rank = sorted.findIndex((x) => x.act === a.id) + 1;
          const diff = e.mt - s.median;
          return <Cell onClick={() => push('segment', { id: s.id })} title={s.name} sub={km(s.dist) + ' km · ' + hm(s.gain) + ' Hm · Platz ' + rank + ' von ' + s.efforts.length}
            right={<Fragment><b>{clock(e.mt)}</b><div class={'tiny ' + (diff < 0 ? '' : 'faint')} style={diff < 0 ? 'color:var(--good)' : ''}>{diff < 0 ? '▲ ' : '▼ '}{clock(Math.abs(diff))} zum Median</div></Fragment>} />;
        })}
      </div>
    </Section>
  );
}

function RouteBlock({ a, c }) {
  const M = routeMetric(c);
  const vals = c.members.filter((m) => !m.excluded).map((m) => ({ m, v: M.get(m) })).filter((x) => x.v != null);
  vals.sort((x, y) => (M.higherBetter ? y.v - x.v : x.v - y.v));
  const rank = vals.findIndex((x) => x.m.id === a.id) + 1;
  const flags = routeFlags(a, c);
  return (
    <Section title="Gleiche Strecke">
      <div class="card p stack" style="gap:8px">
        <div class="row"><b class="grow">{c.name}</b><span class="pill">{c.members.length}×</span></div>
        <div class="small">{M.label}: <b>{M.fmt(M.get(a))}</b> · Platz {rank} von {vals.length} · Median {M.fmt(median(vals.map((x) => x.v)))}</div>
        {flags.filter((f) => !f.soft).length ? <div class="small" style="color:var(--warn)">{flags.filter((f) => !f.soft).map((f) => f.text).join(' · ')}</div> : null}
        <div class="row"><button type="button" class="btn sec2 grow" onClick={() => push('route', { key: c.key })}>Strecke öffnen</button><button type="button" class="btn grow" onClick={() => openSheet(() => <PickCompare a={a} c={c} />)}>Vergleichen</button></div>
      </div>
    </Section>
  );
}

function SimilarBlock({ a, d, cluster }) {
  const sim = useMemo(() => similarActs(a, d.list, 8), [a.id, d.v]);
  if (!sim.length) return null;
  const S = getState();
  const r = S.routes.main || {};
  return (
    <Section title="Ähnliche Fahrten">
      <div class="card p stack" style="gap:8px">
        <div class="small muted">Keine wiederkehrende Strecke erkannt. Diese Aktivitäten starten in der Nähe und verlaufen ähnlich. Unterschiede zeigt der Vergleich.</div>
        <div class="list" style="margin:0;box-shadow:none">
          {sim.slice(0, 5).map(({ a: b, m, lr }) => <Cell onClick={() => push('compare', { a: a.id, b: b.id })} left={<Mark a={b} sm />} title={b.name} sub={b.date + ' · ' + km(b.dist) + ' km · Ø Abweichung ' + int(m) + ' m'} right={<span class="small" style="color:var(--focus)">Vergleichen</span>} />)}
        </div>
        {cluster ? <button type="button" class="btn ghost" onClick={() => openSheet(() => <AssignSheet a={a} sim={sim} cluster={cluster} />)}>Als gleiche Strecke zusammenfassen …</button> : null}
      </div>
    </Section>
  );
}

function AssignSheet({ a, sim, cluster }) {
  const [sel, setSel] = useState({});
  return (
    <Sheet title="Gleiche Strecke">
      <div class="small muted">Ausgewählte Aktivitäten zählen ab jetzt zur Strecke von „{a.name}". Rückgängig über die Strecke.</div>
      {sim.map(({ a: b, m }) => <label class="row small"><input type="checkbox" checked={!!sel[b.id]} onChange={(e) => setSel({ ...sel, [b.id]: e.target.checked })} /><span class="grow">{b.name} · {b.date} · {km(b.dist)} km</span></label>)}
      <button type="button" class="btn wide" onClick={() => {
        const r = getState().routes.main || {};
        const ov = { ...(r.overrides || {}) };
        for (const [id, on] of Object.entries(sel)) if (on) ov[id] = cluster.key;
        if (ov[a.id] === 'none') delete ov[a.id];
        setDoc('routes/main', { ...r, overrides: ov });
        closeSheet(); toast('Strecke zusammengefasst');
      }}>Zusammenfassen</button>
    </Sheet>
  );
}

function PickCompare({ a, c }) {
  return (
    <Sheet title="Vergleichen mit">
      <div class="list" style="margin:0">
        {c.members.filter((m) => m.id !== a.id).slice(0, 40).map((m) => <Cell onClick={() => { closeSheet(); push('compare', { a: a.id, b: m.id }); }} left={<Mark sport={m.sport} sm />} title={m.name} sub={m.date + ' · ' + dur(m.mov) + ' · ' + km(m.dist) + ' km'} />)}
      </div>
    </Sheet>
  );
}

function ContextBlock({ a, e, d }) {
  const S = getState();
  const fields = CONTEXT_FIELDS[a.sport] || [];
  const ctx = a.ctx || {};
  const [notes, setNotes] = useState(a.notes || '');
  useEffect(() => setNotes(a.notes || ''), [a.id]);
  const setCtx = (k, v) => editAct(a.id, { ctx: { ...ctx, [k]: v } });
  const bikes = ((S.meta.gear || {}).bikes || []);
  const own = Object.values(S.gear);
  return (
    <Section title="Anstrengung, Notizen und Kontext">
      <div class="card p stack">
        <Scale label="Wie anstrengend war es? (1–10)" value={a.rpe} onChange={(v) => editAct(a.id, { rpe: v })} labels={RPE_LABELS} />
        {fields.map((f) => f.num ? (
          <Stepper id={'ctx-' + f.k} label={f.label} unit={f.unit} value={ctx[f.k] ?? null} step={1} onChange={(v) => setCtx(f.k, v)} />
        ) : f.text ? (
          <div class="field"><label for={'ctx-' + f.k}>{f.label}</label><input id={'ctx-' + f.k} class="input" value={ctx[f.k] || ''} onBlur={(ev) => setCtx(f.k, ev.target.value || undefined)} /></div>
        ) : (
          <div class="field"><label>{f.label}</label><div class="chips" style="padding:0">{f.opts.map((o) => <button type="button" class="chip" aria-pressed={String(ctx[f.k] === o)} onClick={() => setCtx(f.k, ctx[f.k] === o ? undefined : o)}>{o}</button>)}</div></div>
        ))}
        <div class="field"><label for="act-notes">Notiz</label><textarea id="act-notes" class="input" value={notes} onInput={(ev) => setNotes(ev.target.value)} onBlur={() => notes !== (a.notes || '') && editAct(a.id, { notes })} placeholder="Untergrund, Bedingungen, Gefühl …" /></div>
        {a.sport !== 'gym' ? (
          <div class="field"><label for="act-gear">Ausrüstung</label>
            <select id="act-gear" class="input" value={((S.edits[a.id] || {}).gearId === 'none') ? 'none' : a.gearAuto ? '' : a.gear || ''} onChange={(ev) => editAct(a.id, { gearId: ev.target.value || undefined })}>
              <option value="">{a.gearAuto ? 'automatisch: ' + (d.gearNames[a.gear] || a.gear) : 'automatisch'}</option>
              <option value="none">keine</option>
              {bikes.map((b) => <option value={b.id}>{b.name}{b.retired ? ' (ausgemustert)' : ''}</option>)}
              {own.map((g) => <option value={g.id}>{g.name}</option>)}
            </select>
          </div>
        ) : null}
        {a.sport === 'mtb' ? <label class="row small"><input type="checkbox" checked={!!a.ebike} onChange={(ev) => editAct(a.id, { ebike: ev.target.checked })} /> E-MTB (mit Motorunterstützung)</label> : null}
        {a.sport === 'road' || a.sport === 'mtb' ? <label class="row small"><input type="checkbox" checked={!!a.indoor} onChange={(ev) => editAct(a.id, { indoor: ev.target.checked })} /> Indoor (Rolle / Zwift)</label> : null}
        <label class="row small"><input type="checkbox" checked={!!a.excluded} onChange={(ev) => editAct(a.id, { excluded: ev.target.checked })} /> Aus Auswertungen ausblenden (z. B. Doppelaufzeichnung)</label>
        <div class="tiny faint">{'Alles hier bleibt bei jedem ' + ACT_SRC + '-Abgleich erhalten.'}</div>
      </div>
    </Section>
  );
}

export function EditSheet({ a }) {
  const [name, setName] = useState(a.name);
  const [sport, setSport] = useState(a.sport);
  const save = () => {
    const p = {};
    if (name !== a.name) p.name = name;
    if (sport !== a.sport) p.sport = sport === a.autoSport ? undefined : sport;
    if (a.src === 'manual') { patchDoc('manual/' + a.id, { name, sport }); }
    else if (Object.keys(p).length) editAct(a.id, p);
    closeSheet();
  };
  return (
    <Sheet title="Aktivität bearbeiten">
      <div class="field"><label for="ed-name">Name</label><input id="ed-name" class="input" value={name} onInput={(e) => setName(e.target.value)} /></div>
      <div class="field"><label for="ed-sport">Sportart</label><select id="ed-sport" class="input" value={sport} onChange={(e) => setSport(e.target.value)}>{SPORT_ORDER.map((s) => <option value={s}>{sportLabel(s)}{a.autoSport === s ? ' (laut Strava)' : ''}</option>)}</select></div>
      {a.src === 'strava' ? <div class="tiny faint">Typ laut {a.origin === 'garmin' ? 'Garmin' : 'Strava'}: {a.gtype || a.type}. Deine Änderung gilt nur in hansport und bleibt bei späteren Abgleichen erhalten.</div> : null}
      <button type="button" class="btn wide" onClick={save}>Speichern</button>
    </Sheet>
  );
}

export function MediaBlock({ a, e, target }) {
  const [assets, setAssets] = useState(undefined);
  const [busy, setBusy] = useState([]);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { caps().then((c) => setAssets(c.assets || null)); }, []);
  const media = (target ? target.media : a.media) || [];
  const write = (list) => (target ? target.save(list) : editAct(a.id, { media: list }));
  const upload = async (files) => {
    if (!assets) return;
    const items = [...files];
    setBusy(items.map((f) => ({ name: f.name, state: 'lädt' })));
    let list = media.slice();
    const failed = [];
    for (const f of items) {
      try {
        if (f.size > 20 * 1024 * 1024) throw new Error('Datei größer als 20 MB');
        const r = await assets.upload(f);
        list = [...list, { id: r.id, url: r.url, type: (r.contentType || f.type || '').startsWith('video') ? 'video' : 'image', name: f.name, at: Date.now() }];
        write(list);
      } catch (err) {
        failed.push({ name: f.name, msg: err && err.message ? err.message : 'Hochladen fehlgeschlagen' });
      }
    }
    setBusy(failed.map((f) => ({ ...f, state: 'Fehler' })));
    if (!failed.length) toast(items.length === 1 ? 'Foto gespeichert' : items.length + ' Medien gespeichert');
  };
  const remove = async (m) => {
    setConfirm(null);
    try { if (assets) await assets.delete(m.id); } catch (err) { /* bereits weg */ }
    write(media.filter((x) => x.id !== m.id));
  };
  return (
    <Section title="Fotos und Videos">
      <div class="card p">
        {assets === null ? <div class="small muted">Medien sind in dieser Ansicht nicht verfügbar. Öffne hansport auf claude.ai als Eigentümer.</div> : null}
        <div class="media">
          {media.map((m) => (
            <div class="m">
              {WEB && !String(m.url || '').startsWith('/api/media') ? <div class="err">{(m.name || 'Medium') + ' – in der Claude-Version gespeichert'}</div> : m.type === 'video' ? <video src={m.url || '/_blob/' + m.id} controls playsInline preload="metadata" /> : <img src={m.url || '/_blob/' + m.id} alt={m.name || 'Foto'} loading="lazy" />}
              <button type="button" aria-label="Entfernen" onClick={() => setConfirm(m)}><Icon.trash style="width:16px;height:16px" /></button>
            </div>
          ))}
          {busy.map((b) => <div class="m"><div class="err">{b.state === 'lädt' ? 'Lädt hoch …' : b.name + ': ' + b.msg + '. Bitte erneut versuchen.'}</div></div>)}
          {assets ? (
            <label class="add">
              <span>+ Foto oder Video</span>
              <input type="file" accept="image/*,video/*" multiple class="sr" onChange={(ev) => { upload(ev.target.files); ev.target.value = ''; }} />
            </label>
          ) : null}
        </div>
        {confirm ? <div class="note bad" style="margin:10px 0 0"><Icon.warn /><div class="grow">„{confirm.name || 'Medium'}" endgültig entfernen?<div class="row" style="margin-top:8px"><button type="button" class="btn danger" onClick={() => remove(confirm)}>Entfernen</button><button type="button" class="btn sec2" onClick={() => setConfirm(null)}>Abbrechen</button></div></div></div> : null}
        <div class="chart-sum">Privat gespeichert. Auf dem iPhone öffnet sich die Fotoauswahl des Systems.</div>
      </div>
    </Section>
  );
}

function QualityBlock({ a, perf, streams }) {
  const q = [];
  if (a.src === 'manual') q.push('Manuell erfasste Werte, keine Aufzeichnung.');
  if (a.src === 'strava' && !a.hasGps && a.sport !== 'gym' && !a.indoor) q.push('Keine GPS-Spur vorhanden.');
  if (perf && !perf.hasHr && a.sport !== 'gym') q.push('Keine Pulsdaten.');
  if (perf && perf.avgW && !perf.hasW && !a.indoor) q.push('Leistung von Strava geschätzt, nicht gemessen.');
  if (a.ela && a.mov && a.ela - a.mov > 1800) q.push('Gesamtzeit ' + dur(a.ela) + ', davon ' + dur(a.ela - a.mov) + ' ohne Bewegung (Pausen oder Aufzeichnung lief weiter).');
  if (a.indoor) q.push('Indoor: Distanz und Höhenmeter sind virtuell und zählen nicht zu den Höhenmetern draußen.');
  if (streams && streams.t.length < 300) q.push('Grobe Zeitreihe (' + streams.t.length + ' Punkte). Kurze Abschnitte können ungenau sein.');
  if (a.derived) q.push(a.derived + '.');
  if (!q.length) return null;
  return <Section title="Datenlage"><div class="note"><Icon.info /><ul style="margin:0;padding-left:16px">{q.map((x) => <li>{x}</li>)}</ul></div></Section>;
}
