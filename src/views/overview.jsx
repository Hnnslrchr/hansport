import { h, Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useData, useStatus, ActRow, RouteShape, SyncLine, keyMetric } from './common.jsx';
import { Top, Section, Icon, Seg, Delta, Stat, Note, Mark, Progress, sportColor, Cell } from '../ui/kit.jsx';
import { StackBars, HBars } from '../ui/charts.jsx';
import { push } from '../nav.js';
import { getState, toast } from '../store.js';
import { sync, explain } from '../strava.js';
import { buildInsights, periodComparison, periodSeries, aggregate, goalProgress, recurringSegments, splitCompare, monthlyReview, isoWeek } from '../analysis.js';
import { SPORT_ORDER, sportLabel } from '../sports.js';
import { hours, km, hm, int, num, dateMid, dateShort, relDate, monthShort, monthName, pct, today, dur } from '../format.js';
import { WEB, ACT_SRC } from '../env.js';

export function doSync(full) {
  sync({ full }).catch((e) => toast(explain(e), 'error'));
}

export function Overview() {
  const d = useData();
  const st = useStatus();
  const S = getState();
  const [kind, setKind] = useState('month');
  const [selBar, setSelBar] = useState(null);
  const goals = Object.values(S.goals);
  const insights = useMemo(() => buildInsights({ acts: d.list, clusters: d.clusters, segIdx: d.segIdx, journal: d.journal, gymSessions: d.gymSessions, goals, gearNames: d.gearNames }).slice(0, 4), [d]);
  const cmp = useMemo(() => periodComparison(d.list, kind), [d, kind]);
  const series = useMemo(() => periodSeries(d.list, kind, kind === 'week' ? 12 : kind === 'month' ? 12 : kind === 'season' ? 6 : 4), [d, kind]);
  const last = d.list.find((a) => !a.excluded);
  const empty = !d.list.length;

  const sel = selBar ? series.find((x) => x.start === selBar) : null;
  const barLabel = (p) => (kind === 'week' ? 'KW' + isoWeek(p.start) : kind === 'month' ? monthShort(p.start.slice(0, 7)).split(' ')[0] : kind === 'season' ? (p.winter ? 'W ' : 'S ') + p.start.slice(2, 4) : p.start.slice(0, 4));

  return (
    <div class="view">
      <Top title="Erkenntnisse" large actions={
        <Fragment>
          <button type="button" class="iconbtn" aria-label={'Mit ' + ACT_SRC + ' abgleichen'} onClick={() => doSync(false)} disabled={st.syncing}><Icon.sync /></button>
          <button type="button" class="iconbtn" aria-label="Profil, Ziele, Ausrüstung und Einstellungen" onClick={() => push('more')}><Icon.more /></button>
        </Fragment>} />
      <div class="pad" style="margin-top:-4px;margin-bottom:10px"><SyncLine /></div>
      {st.error ? <div style="margin-bottom:10px"><Note kind="bad">{st.error.msg} {st.error.code !== 'no_mcp' ? <button type="button" class="btn ghost" onClick={() => doSync(false)}>Erneut versuchen</button> : null}</Note></div> : null}

      {empty ? <Onboarding /> : (
        <Fragment>
          {last ? <Hero a={last} /> : null}

          <Section title="Erkenntnisse" action={insights.length ? 'Wie entstehen sie?' : null} onAction={() => push('about-insights')}>
            {insights.length ? (
              <div class="insights">
                {insights.map((i) => <InsightCard i={i} />)}
              </div>
            ) : <div class="card p small muted">Noch keine belastbaren Vergleiche. Erkenntnisse erscheinen, sobald es mindestens vier vergleichbare Einheiten gibt.</div>}
          </Section>

          <Section title="Entwicklung">
            <div class="pad" style="margin-bottom:10px"><Seg value={kind} onChange={(k) => { setKind(k); setSelBar(null); }} label="Zeitraum" options={[['week', 'Woche'], ['month', 'Monat'], ['season', 'Saison'], ['year', 'Jahr']]} /></div>
            <PeriodCard cmp={cmp} />
            <div class="card p" style="margin-top:10px">
              <StackBars items={series.map((p) => ({ key: p.start, label: barLabel(p), agg: p.agg, current: p.current }))}
                value={(agg, s) => (agg.bySport[s] ? agg.bySport[s].time / 3600 : 0)} total={(agg) => agg.time / 3600}
                fmt={(v) => num(v, v < 10 ? 1 : 0) + ' h'} axisFmt={(v) => num(v, 0)}
                label={'Trainingszeit je ' + (kind === 'week' ? 'Woche' : kind === 'month' ? 'Monat' : kind === 'season' ? 'Saison' : 'Jahr') + ', gestapelt nach Sportart'}
                selected={selBar} onSelect={(it) => setSelBar(selBar === it.key ? null : it.key)} />
              {sel ? (
                <div style="margin-top:10px">
                  <div class="row"><b class="grow">{sel.label}</b><span class="small muted">{sel.agg.count} Einheiten · {hours(sel.agg.time)} · {hm(sel.agg.gain)} Hm</span></div>
                  <div class="list" style="margin:8px 0 0;box-shadow:none;border:1px solid var(--line)">
                    {sel.acts.slice(0, 5).map((a) => <ActRow a={a} />)}
                    {sel.acts.length > 5 ? <Cell onClick={() => push('activities', { range: [sel.start, sel.end], label: sel.label })} title={'Alle ' + sel.acts.length + ' Einheiten'} /> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title={'Verteilung · ' + cmp.period.label}>
            <div class="card p">
              <HBars fmt={(v) => num(v, v < 10 ? 1 : 0) + ' h'}
                rows={SPORT_ORDER.filter((s) => cmp.cur.bySport[s] || cmp.prev.bySport[s]).map((s) => ({ s, label: sportLabel(s) + ' · ' + (cmp.cur.bySport[s]?.count || 0) + '×', value: (cmp.cur.bySport[s]?.time || 0) / 3600, prev: (cmp.prev.bySport[s]?.time || 0) / 3600, color: sportColor(s), left: <Mark sport={s} sm /> }))}
                onSelect={(r) => push('activities', { sport: r.s, range: cmp.ranges.cur, label: cmp.period.label })} />
              <div class="chart-sum">Strich: gleich langer Zeitraum davor ({dateMid(cmp.ranges.prev[0])} – {dateMid(cmp.ranges.prev[1])}).</div>
            </div>
          </Section>

          <ThreeAspects d={d} />

          {goals.length ? (
            <Section title="Ziele" action="Alle" onAction={() => push('goals')}>
              <div class="list">{goals.slice(0, 3).map((g) => <GoalRow g={g} d={d} />)}</div>
            </Section>
          ) : null}

          <Section title="Monatsrückblick" action="Alle Rückblicke" onAction={() => push('reviews')}>
            <MonthTeaser d={d} />
          </Section>

          <Section title="Letzte Aktivitäten" action="Alle" onAction={() => push('activities', {}, 'activities')}>
            <div class="list">{d.list.slice(0, 6).map((a) => <ActRow a={a} />)}</div>
          </Section>
          <div class="spacer" />
        </Fragment>
      )}
    </div>
  );
}

function Onboarding() {
  const st = useStatus();
  return (
    <div class="card p stack" style="margin-top:6px">
      <div class="wordmark"><Icon.logo /><b style="font-family:var(--display);font-size:var(--fs-t2)">hansport</b></div>
      <p style="margin:0">{WEB ? 'hansport liest deine Aktivitäten und Gesundheitswerte direkt aus deinem Garmin-Konto und wertet sie für Mountainbike, Rennrad, Wandern, Gym, Snowboarden und Splitboarden aus.' : 'hansport liest deine Aktivitäten aus deinem in Claude verbundenen Strava-Konto und wertet sie für Mountainbike, Rennrad, Wandern, Gym, Snowboarden und Splitboarden aus.'}</p>
      <ul class="small muted" style="margin:0;padding-left:18px">
        <li>Beim ersten Abgleich werden alle Aktivitäten mit vereinfachten GPS-Spuren geladen. Das dauert etwa eine Minute.</li>
        <li>{WEB ? 'Deine Daten liegen privat in deinem eigenen Speicher und sind nur mit deinem Passwort erreichbar.' : 'Deine Daten bleiben privat in diesem Artifact. Nur du kannst sie lesen.'}</li>
        <li>Deine Notizen und Korrekturen bleiben bei jedem neuen Abgleich erhalten.</li>
      </ul>
      {st.localOnly ? <Note kind="warn">{WEB ? 'Keine Verbindung zum Server. Angezeigt werden die zuletzt gespeicherten Daten.' : 'Diese Ansicht hat keine Verbindung zu Claude. Öffne die App auf claude.ai, damit Strava und der Speicher verfügbar sind.'}</Note> : null}
      <button type="button" class="btn wide" disabled={st.syncing} onClick={() => doSync(true)}><Icon.sync />{st.syncing ? 'Abgleich läuft …' : 'Mit ' + ACT_SRC + ' abgleichen'}</button>
      <div class="tiny faint">{WEB ? 'Voraussetzung: dein Garmin-API-Schlüssel ist in Vercel eingetragen (Mehr → Einstellungen → Verbindungen).' : 'Claude fragt beim ersten Mal, ob diese Seite Strava lesen darf.'}</div>
    </div>
  );
}

function Hero({ a }) {
  const m = keyMetric(a);
  return (
    <button type="button" class="hero" onClick={() => push('activity', { id: a.id })} aria-label={'Letzte Aktivität: ' + a.name + ', öffnen'}>
      <div class="row">
        <Mark a={a} />
        <div class="grow">
          <div class="tiny faint" style="font-weight:700;letter-spacing:.05em;text-transform:uppercase">Zuletzt · {relDate(a.date)}</div>
          <div style="font-weight:650;font-size:var(--fs-body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{a.name}</div>
        </div>
        {a.poly && !a.indoor ? <RouteShape poly={a.poly} color={sportColor(a.sport)} /> : null}
      </div>
      <div class="stats" style="margin-top:10px">
        <Stat v={m.v.split(' ')[0]} u={m.v.split(' ').slice(1).join(' ')} l={a.sport === 'gym' ? 'Dauer' : a.sport === 'road' || a.indoor ? 'Distanz' : a.sport === 'snowboard' ? 'Bewegungszeit' : 'Aufstieg'} />
        <Stat v={dur(a.mov).replace(' h', '').replace(' min', '')} u={a.mov >= 3600 ? 'h' : 'min'} l="Bewegungszeit" />
        <Stat v={a.rpe ? a.rpe : '–'} u={a.rpe ? '/10' : ''} l={a.rpe ? 'Anstrengung' : 'Anstrengung offen'} />
      </div>
      <div class="small" style="margin-top:8px;color:var(--focus)">Karte, Höhenprofil und Vergleich öffnen ›</div>
    </button>
  );
}

export function InsightCard({ i }) {
  return (
    <button type="button" class={'insight ' + (i.good === false ? 'down' : i.good === true ? 'up' : i.dir === 'flat' ? '' : '')} onClick={() => push('insight', { id: i.id })} aria-label={i.title + '. ' + i.text + ' Details öffnen'}>
      <div class="k"><span>{i.aspect}</span>{i.good === true ? <span class="pill good">besser</span> : i.good === false ? <span class="pill warn">schwächer</span> : null}</div>
      <h3>{i.dir === 'up' ? '▲ ' : i.dir === 'down' ? '▼ ' : ''}{i.title}</h3>
      <p>{i.text}</p>
      <div class="meta">{i.compare}<br />Grundlage: {i.basis}</div>
      {i.limits && i.limits.length ? <div class="lim"><Icon.warn style="width:14px;height:14px;flex:none" /><span>{i.limits[0]}{i.limits.length > 1 ? ' (+' + (i.limits.length - 1) + ')' : ''}</span></div> : null}
    </button>
  );
}

function PeriodCard({ cmp }) {
  const rows = [
    ['Trainingszeit', cmp.cur.time, cmp.prev.time, cmp.ly.time, hours],
    ['Aktive Tage', cmp.cur.days, cmp.prev.days, cmp.ly.days, (v) => int(v)],
    ['Höhenmeter', cmp.cur.gain, cmp.prev.gain, cmp.ly.gain, (v) => hm(v)],
    ['Distanz', cmp.cur.dist, cmp.prev.dist, cmp.ly.dist, (v) => km(v) + ' km'],
  ];
  return (
    <div class="card p">
      <div class="row" style="margin-bottom:6px"><b class="grow">{cmp.period.label}</b><span class="small muted">{cmp.elapsed < cmp.total ? 'Tag ' + cmp.elapsed + ' von ' + cmp.total : 'abgeschlossen'}</span></div>
      <table class="table">
        <thead><tr><th></th><th>Jetzt</th><th>Davor</th><th>Vorjahr</th></tr></thead>
        <tbody>
          {rows.map(([l, a, b, c, f]) => (
            <tr><td>{l}</td><td><b>{f(a)}</b></td><td><div>{f(b)}</div><Delta cur={a} prev={b} neutral /></td><td><div>{f(c)}</div><Delta cur={a} prev={c} neutral /></td></tr>
          ))}
        </tbody>
      </table>
      <div class="chart-sum">Davor: gleich lang, {dateMid(cmp.ranges.prev[0])} – {dateMid(cmp.ranges.prev[1])}. Vorjahr: {dateMid(cmp.ranges.ly[0])} – {dateMid(cmp.ranges.ly[1])}. Höhenmeter und Distanz ohne Indoor-Fahrten. Mehr Umfang ist keine Aussage über Leistung.</div>
    </div>
  );
}

function ThreeAspects({ d }) {
  const now = today();
  const a28 = d.list.filter((a) => !a.excluded && a.date >= addD(now, -27));
  const p28 = d.list.filter((a) => !a.excluded && a.date >= addD(now, -55) && a.date <= addD(now, -28));
  const A = aggregate(a28), B = aggregate(p28);
  const segs = recurringSegments(d.segIdx, 4).filter((s) => s.kind === 'climb');
  let better = 0, worse = 0;
  for (const s of segs) { const c = splitCompare(s.efforts, (e) => e.mt); if (c) { if (c.diff < -5) better++; else if (c.diff > 5) worse++; } }
  return (
    <Section title="Umfang · Intensität · Leistung">
      <div class="card p">
        <div class="stats">
          <div class="stat"><div class="v">{hours(A.time).replace(' h', '')}<small>h</small></div><div class="l">Umfang, 4 Wochen</div><Delta cur={A.time} prev={B.time} neutral /></div>
          <div class="stat"><div class="v">{A.reRate ? int(A.reRate) : A.rpeAvg ? num(A.rpeAvg, 1) : '–'}<small>{A.reRate ? 'RE/h' : A.rpeAvg ? '/10' : ''}</small></div><div class="l">{A.reRate ? 'Intensität (Relative Effort pro Stunde)' : 'Anstrengung Ø'}</div>{A.reRate && B.reRate ? <Delta cur={A.reRate} prev={B.reRate} neutral /> : null}</div>
          <div class="stat"><div class="v">{segs.length ? better + '/' + segs.length : '–'}</div><div class="l">{segs.length ? 'Anstiege zuletzt schneller' : 'Anstiege: noch keine Vergleiche'}</div>{worse ? <span class="delta down">▼ {worse} langsamer</span> : null}</div>
        </div>
        <div class="chart-sum">Umfang sind Stunden, Intensität ist die Belastung pro Stunde, Leistung nur aus vergleichbaren Anstiegen (Strava-Segmente mit mindestens 4 Fahrten).</div>
        {segs.length ? <button type="button" class="btn ghost" onClick={() => push('activities', { tab: 'climbs' }, 'activities')}>Anstiege vergleichen ›</button> : null}
      </div>
    </Section>
  );
}
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

export function GoalRow({ g, d }) {
  const p = goalProgress(g, d.list, d.segIdx);
  const val = g.kind === 'segment' ? (p.value ? 'Bestzeit ' + Math.floor(p.value / 60) + ':' + String(Math.round(p.value % 60)).padStart(2, '0') : 'noch keine Zeit') : num(p.value, g.metric === 'dist' || g.metric === 'time' ? 1 : 0) + ' / ' + num(g.target, 0) + ' ' + unitOf(g);
  return (
    <Cell onClick={() => (g.kind === 'segment' ? push('segment', { id: g.segId }) : push('goals'))} title={g.title}
      sub={g.kind === 'segment' ? 'Ziel ' + Math.floor(g.targetTime / 60) + ':' + String(g.targetTime % 60).padStart(2, '0') + ' min · ' + p.n + ' Fahrten' : (p.onTrack ? 'Im Plan' : 'Hinter dem Plan (erwartet ' + num(p.expected, 1) + ')') + ' · ' + p.period.label}
      right={<span class="small">{val}</span>}>
      <div style="margin-top:6px"><Progress value={p.pct} /></div>
    </Cell>
  );
}
export const unitOf = (g) => ({ gain: 'Hm', dist: 'km', time: 'h', days: 'Tage', count: 'Einheiten' }[g.metric] || '');

function MonthTeaser({ d }) {
  const ym = today().slice(0, 7);
  const r = useMemo(() => monthlyReview(ym, { acts: d.list, segIdx: d.segIdx, journal: d.journal, edits: getState().edits }), [d]);
  return (
    <button type="button" class="hero" onClick={() => push('review', { ym })}>
      <div class="row"><b class="grow">{monthName(ym)}</b>{r.partial ? <span class="pill">Zwischenstand</span> : null}</div>
      <p class="small" style="margin:6px 0 0">{r.summary}</p>
      {r.declines.length ? <div class="lim small" style="color:var(--warn);margin-top:6px">Weniger als im Vormonat: {r.declines[0]}</div> : null}
    </button>
  );
}

// ---------- Erkenntnis im Detail ----------
export function InsightDetail({ id }) {
  const d = useData();
  const S = getState();
  const ins = buildInsights({ acts: d.list, clusters: d.clusters, segIdx: d.segIdx, journal: d.journal, gymSessions: d.gymSessions, goals: Object.values(S.goals), gearNames: d.gearNames });
  const i = ins.find((x) => x.id === id);
  if (!i) return <div class="view"><Top title="Erkenntnis" /><div class="empty"><h3>Diese Erkenntnis ist nicht mehr aktuell</h3>Die Daten haben sich seit dem Öffnen geändert.</div></div>;
  const acts = (i.refs.acts || []).map((x) => d.byId[x]).filter(Boolean);
  const prev = (i.refs.prevActs || []).map((x) => d.byId[x]).filter(Boolean);
  const seg = i.refs.segId ? d.segIdx[i.refs.segId] : null;
  const effort = (a) => seg ? seg.efforts.find((e) => e.act === a.id) : null;
  const sub = (a) => {
    const e = effort(a);
    const base = dateShort(a.date);
    if (e) return base + ' · Abschnitt ' + Math.floor(e.mt / 60) + ':' + String(e.mt % 60).padStart(2, '0') + ' min' + (e.hr ? ' · ' + e.hr + ' bpm' : '') + (d.gearNames[e.gear] ? ' · ' + d.gearNames[e.gear] : '') + ctxText(a);
    return base + ctxText(a);
  };
  return (
    <div class="view">
      <Top title="Erkenntnis" />
      <div class="pad stack" style="padding-bottom:6px">
        <div class="k tiny faint" style="font-weight:700;letter-spacing:.06em;text-transform:uppercase">{i.aspect}</div>
        <h1 style="font-family:var(--display);font-size:var(--fs-t1);line-height:1.1">{i.title}</h1>
        <p style="margin:0">{i.text}</p>
      </div>
      <div class="card p stack" style="gap:8px">
        <div><div class="small muted">Vergleichszeitraum</div><div>{i.compare.replace('Vergleich: ', '')}</div></div>
        <div><div class="small muted">Datengrundlage</div><div>{i.basis}</div></div>
      </div>
      {i.limits && i.limits.length ? (
        <Section title="Wie belastbar ist das?">
          <div class="note warn"><Icon.warn /><ul style="margin:0;padding-left:16px">{i.limits.map((l) => <li>{l}</li>)}</ul></div>
        </Section>
      ) : <Section title="Wie belastbar ist das?"><Note>Keine besonderen Einschränkungen erkannt.</Note></Section>}
      {seg ? <div class="pad" style="margin-top:10px"><button type="button" class="btn sec2 wide" onClick={() => push('segment', { id: seg.id })}>Anstieg „{seg.name.trim()}" mit allen Fahrten öffnen</button></div> : null}
      {i.refs.routeKey ? <div class="pad" style="margin-top:10px"><button type="button" class="btn sec2 wide" onClick={() => push('route', { key: i.refs.routeKey })}>Strecke mit allen Einheiten öffnen</button></div> : null}
      {acts.length ? <Section title={'Jüngere Einheiten (' + acts.length + ')'}><div class="list">{acts.slice(0, 30).map((a) => <ActRow a={a} sub={sub(a)} />)}</div></Section> : null}
      {prev.length ? <Section title={'Vergleichsbasis (' + prev.length + ')'}><div class="list">{prev.slice(0, 30).map((a) => <ActRow a={a} sub={sub(a)} />)}</div></Section> : null}
      <div class="spacer" />
    </div>
  );
}

function ctxText(a) {
  const c = a.ctx || {};
  const parts = [c.surface, c.conditions, c.snow, c.feel, c.pack ? c.pack + ' kg Rucksack' : null].filter(Boolean);
  return parts.length ? ' · ' + parts.join(', ') : a.notes ? ' · Notiz' : '';
}

export function AboutInsights() {
  return (
    <div class="view">
      <Top title="So entstehen Erkenntnisse" />
      <div class="card p stack small" style="margin-top:8px">
        <p style="margin:0"><b>Umfang</b> vergleicht Stunden, aktive Tage, Höhenmeter und Distanz mit einem gleich langen Zeitraum davor und mit demselben Zeitraum im Vorjahr. Weniger Stunden sind eine Veränderung im Umfang, keine Aussage über Form.</p>
        <p style="margin:0"><b>Leistung</b> braucht vergleichbare Einheiten: dieselben Strava-Segmente (Anstiege), dieselbe GPS-Strecke in derselben Richtung oder vergleichbare Kraftsätze. Verglichen wird der Median der jüngeren gegen die älteren Einheiten.</p>
        <p style="margin:0"><b>Intensität</b> nutzt Strava Relative Effort pro Stunde (pulsbasiert) und deine eigene Anstrengung (1–10), wo du sie einträgst.</p>
        <p style="margin:0"><b>Einschränkungen</b> werden angezeigt bei kleinen Stichproben, fehlendem Puls, anderer Ausrüstung, Varianten der Strecke, langen Pausen oder deutlich anderem Puls.</p>
        <p style="margin:0"><b>Zusammenhänge</b> aus dem Journal sind Beobachtungen. Sie zeigen immer, auf wie vielen Einträgen sie beruhen, und erscheinen erst ab vier Einträgen pro Gruppe.</p>
      </div>
    </div>
  );
}
