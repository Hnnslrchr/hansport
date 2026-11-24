// Aktivitäten → Überblick: Hauptsportarten auf einen Blick (Summen mit Vergleich, Jahresverlauf,
// Bestwerte, Intensität, Rhythmus). Alles aus den eigenen Aktivitäten berechnet; fehlende Werte bleiben leer.
import { h, Fragment } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { Tile, Head, Big, NoData, Ico } from '../ui/hp.jsx';
import { DayBars, useWidth, niceMax } from '../ui/r5.jsx';
import { Seg, Chips } from '../ui/kit.jsx';
import { useData } from './common.jsx';
import { push } from '../nav.js';
import { SPORTS, sportLabel, dsport, sportIcon } from '../sports.js';
import { km, int, num, today, dayMon, dateShort, relDate, NB } from '../format.js';

const DAY = 864e5;
const P = (d) => Date.parse(d + 'T12:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const add = (d, n) => iso(P(d) + n * DAY);
const wd = (d) => (new Date(P(d)).getUTCDay() + 6) % 7; // Mo = 0
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
const DIST = new Set(['road', 'mtb', 'hike', 'splitboard']);
// Hauptgröße je Sportart: Strecke draußen oder Zeit
const metricOf = (sport) => (DIST.has(sport) ? 'dist' : 'time');
const val = (a, m) => (m === 'dist' ? (a.indoor ? 0 : a.dist || 0) : a.mov || 0);
const fmtM = (m, v) => (m === 'dist' ? km(v) : hmin(v));
const unitM = (m) => (m === 'dist' ? 'km' : 'h');
const hmin = (s) => { const t = Math.round((s || 0) / 60); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const hShort = (s) => num((s || 0) / 3600, (s || 0) < 36000 ? 1 : 0);
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

// Zeitraum bis heute und Vergleichszeitraum gleicher Länge
function periodOf(p, t) {
  if (p === 'w') { const a = add(t, -wd(t)); return { a, b: t, ca: add(a, -7), cb: add(t, -7), cmp: 'Vorwoche bis ' + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][wd(t)], name: 'diese Woche' }; }
  if (p === 'm') { const a = t.slice(0, 8) + '01'; const pm = new Date(P(a)); pm.setUTCMonth(pm.getUTCMonth() - 1); const ca = iso(pm); const cb = add(ca, Math.round((P(t) - P(a)) / DAY)); return { a, b: t, ca, cb: cb >= a ? add(a, -1) : cb, cmp: 'Vormonat bis zum ' + new Date(P(t)).getUTCDate() + '.', name: MON[+t.slice(5, 7) - 1] }; }
  if (p === 'y') { const y = +t.slice(0, 4); return { a: y + '-01-01', b: t, ca: y - 1 + '-01-01', cb: y - 1 + t.slice(4), cmp: y - 1 + ' bis ' + dayMon(t), name: String(y) }; }
  const a = add(t, -364); return { a, b: t, ca: add(a, -365), cb: add(a, -1), cmp: '12 Monate davor', name: '12 Monate' };
}
function sum(list) {
  const r = { n: 0, dist: 0, gain: 0, time: 0, days: new Set(), hr: 0, hrT: 0 };
  for (const a of list) {
    r.n++; r.dist += a.indoor ? 0 : a.dist || 0; r.gain += a.indoor ? 0 : a.gain || 0; r.time += a.mov || 0; r.days.add(a.date);
    if (a.hrAvg) { r.hr += a.hrAvg * (a.mov || 0); r.hrT += a.mov || 0; }
  }
  r.days = r.days.size; r.hrAvg = r.hrT ? r.hr / r.hrT : null;
  return r;
}

export function Dashboard() {
  const d = useData();
  const t = today();
  const all = useMemo(() => d.list.filter((a) => !a.excluded && a.date), [d]);
  // Hauptsportarten: nach Zeit der letzten 12 Monate (mindestens 5 % oder die ersten vier)
  const main = useMemo(() => {
    const from = add(t, -364), by = {};
    for (const a of all) if (a.date >= from) { const s = dsport(a); by[s] = (by[s] || 0) + (a.mov || 0); }
    const tot = Object.values(by).reduce((x, y) => x + y, 0) || 1;
    return Object.entries(by).sort((x, y) => y[1] - x[1]).filter(([s, v], i) => s !== 'other' && (i < 4 || v / tot >= 0.05)).slice(0, 5).map(([s]) => s);
  }, [all, t]);
  const [sport, setSport] = useState('all');
  const [per, setPer] = useState('y');
  const sp = sport === 'all' || main.includes(sport) ? sport : 'all';
  const L = useMemo(() => (sp === 'all' ? all : all.filter((a) => dsport(a) === sp)), [all, sp]);
  const m = sp === 'all' ? 'time' : metricOf(sp);
  const pr = periodOf(per, t);
  const cur = L.filter((a) => a.date >= pr.a && a.date <= pr.b);
  const prev = L.filter((a) => a.date >= pr.ca && a.date <= pr.cb);
  if (!all.length) return <div class="empty"><h3>Noch keine Aktivitäten</h3>Sobald Garmin abgeglichen ist, erscheint hier dein Überblick.</div>;
  return (
    <div class="dash">
      <Chips value={sp} onChange={setSport} label="Sportart" options={[['all', 'Alle'], ...main.map((s) => [s, SPORTS[s].short, null, sportIcon(s)])]} />
      <div class="pad" style="margin:2px 0 12px"><Seg value={per} onChange={setPer} label="Zeitraum" options={[['w', 'Woche'], ['m', 'Monat'], ['y', t.slice(0, 4)], ['12', '12 Mon.']]} /></div>
      <div class="bento">
        <Totals cur={cur} prev={prev} pr={pr} m={m} sp={sp} L={L} t={t} />
        <YearCurve L={L} m={m} t={t} sp={sp} />
        {sp === 'all' ? main.map((s) => <SportCard s={s} all={all} t={t} pr={pr} onPick={() => setSport(s)} />) : null}
        <Records L={L} sp={sp} t={t} />
        <Intensity list={cur} name={pr.name} />
        <Rhythm L={L} t={t} />
        {cur.length ? <Averages list={cur} sp={sp} name={pr.name} /> : null}
      </div>
    </div>
  );
}

function Totals({ cur, prev, pr, m, sp, L, t }) {
  const c = sum(cur), p = sum(prev);
  const v = m === 'dist' ? c.dist : c.time, pv = m === 'dist' ? p.dist : p.time;
  const dp = pct(v, pv);
  // letzte 12 Wochen (Hauptgröße je Woche)
  const w0 = add(t, -wd(t));
  const weeks = Array.from({ length: 12 }, (_, i) => add(w0, (i - 11) * 7));
  const items = weeks.map((w) => ({ date: w, v: L.filter((a) => a.date >= w && a.date <= add(w, 6)).reduce((s, a) => s + val(a, m), 0) }));
  const conv = m === 'dist' ? (x) => x / 1000 : (x) => x / 3600;
  return (
    <Tile cls="w2 g-akt" style="--gx:100%;--gy:0%;--gs:60% 90%">
      <Head icon={sp === 'all' ? 'activity' : sportIcon(sp)} label={(sp === 'all' ? 'Alle Sportarten' : sportLabel(sp)) + ' · ' + pr.name} />
      <div class="hp-row" style="align-items:flex-end">
        <div class="grow">{c.n ? <Big v={m === 'dist' ? km(v) : hShort(v)} u={unitM(m)} cls="xl" /> : <NoData text="noch keine Einheit" />}</div>
        {dp != null ? <div class="kc-y"><b>{dp > 0 ? '+' : dp < 0 ? '−' : '±'}{Math.abs(dp)}{NB}%</b><span>zu {pr.cmp}</span></div> : pv === 0 && c.n ? <div class="kc-y"><span>{pr.cmp}: nichts</span></div> : null}
      </div>
      <div class="stats two dash-st">
        {[
          m === 'dist' ? ['Zeit', hmin(c.time), 'h'] : null,
          m === 'dist' || sp === 'all' ? ['Höhenmeter', int(c.gain), 'Hm'] : null,
          sp === 'all' ? ['draußen', km(c.dist), 'km'] : null,
          [c.n === 1 ? 'Einheit' : 'Einheiten', c.n, ''],
          ['aktive Tage', c.days, ''],
          m === 'time' && sp !== 'all' ? ['Ø Dauer', c.n ? hmin(c.time / c.n) : '–', 'h'] : null,
        ].filter(Boolean).slice(0, 4).map(([l, v, u]) => <div class="stat"><div class="v">{v}{u ? <small>{u}</small> : null}</div><div class="l">{l}</div></div>)}
      </div>
      <div class="fill"><DayBars items={items.map((x) => ({ date: x.date, v: conv(x.v) }))} fmt={(x) => num(x, x < 10 ? 1 : 0)} unit={unitM(m)} labels="ends" ends={[dayMon(weeks[0]), 'diese Woche']} label={'Letzte 12 Wochen, ' + (m === 'dist' ? 'Kilometer' : 'Stunden') + ' je Woche'} ariaItem={(x) => 'Woche ab ' + dayMon(x.date)} /></div>
      <div class="hp-sub">{m === 'dist' ? 'Kilometer' : 'Stunden'} je Woche, die letzten 12 Wochen. Indoor zählt nicht zu Kilometern und Höhenmetern.</div>
    </Tile>
  );
}

// Kumulierter Jahresverlauf: dieses Jahr (Gruppenfarbe) gegen Vorjahr (grau)
function YearCurve({ L, m, t, sp }) {
  const ref = useRef();
  const W = useWidth(ref);
  const y = +t.slice(0, 4);
  const series = (yy, until) => {
    const by = {};
    for (const a of L) if (a.date.slice(0, 4) === String(yy) && a.date <= until) { const k = Math.floor((P(a.date) - P(yy + '-01-01')) / DAY); by[k] = (by[k] || 0) + val(a, m); }
    const n = Math.floor((P(until) - P(yy + '-01-01')) / DAY) + 1, out = []; let c = 0;
    for (let i = 0; i < n; i++) { c += by[i] || 0; out.push(c); }
    return out;
  };
  const cy = series(y, t), py = series(y - 1, (y - 1) + '-12-31');
  const conv = m === 'dist' ? (x) => x / 1000 : (x) => x / 3600;
  const nowV = cy.length ? cy[cy.length - 1] : 0, prevSame = py[Math.min(py.length - 1, cy.length - 1)] || 0, prevAll = py.length ? py[py.length - 1] : 0;
  if (!nowV && !prevAll) return null;
  const H = 150, Lp = 36, R = 8, T = 10, B = 20;
  const top = niceMax(conv(Math.max(nowV, prevAll)));
  const X = (i) => Lp + (i / 364) * (W - Lp - R), Y = (v) => T + (1 - conv(v) / top) * (H - T - B);
  const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
  const ticks = [0, top / 2, top];
  const u = unitM(m);
  return (
    <Tile cls="w2 g-akt" style="--gx:0%;--gy:100%">
      <Head icon="graph-up" label={'Jahresverlauf ' + y} />
      <div class="yc-leg"><span><i class="cy" />{y}: <b>{num(conv(nowV), m === 'dist' ? 0 : 0)}{NB}{u}</b></span><span><i class="py" />{y - 1} bis heute: {num(conv(prevSame), 0)}{NB}{u} · ganzes Jahr {num(conv(prevAll), 0)}{NB}{u}</span></div>
      <div class="ml" ref={ref} role="img" aria-label={`Kumuliert ${y}: ${num(conv(nowV), 0)} ${u}; ${y - 1} bis zum gleichen Tag ${num(conv(prevSame), 0)} ${u}`} style={{ height: H + 'px' }}>
        {W ? (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {ticks.map((v) => <Fragment><line x1={Lp} x2={W - R} y1={T + (1 - v / top) * (H - T - B)} y2={T + (1 - v / top) * (H - T - B)} class="ml-grid" /><text x={Lp - 6} y={T + (1 - v / top) * (H - T - B) + 4} text-anchor="end" class="ml-t">{num(v, 0)}</text></Fragment>)}
            {py.length ? <path d={path(py)} class="yc-py" /> : null}
            {cy.length ? <path d={path(cy)} class="yc-cy" /> : null}
            {cy.length ? <circle cx={X(cy.length - 1)} cy={Y(nowV)} r="4.5" class="ml-last" /> : null}
            {[0, 3, 6, 9].map((mo) => { const i = Math.floor((P(y + '-' + String(mo + 1).padStart(2, '0') + '-01') - P(y + '-01-01')) / DAY); return <text x={X(i)} y={H - 4} class="ml-t">{MON[mo]}</text>; })}
            <text x={W - R} y={H - 4} text-anchor="end" class="ml-t">Dez.</text>
          </svg>
        ) : null}
      </div>
      <div class="hp-sub">{prevSame ? (nowV >= prevSame ? 'Vor dem Vorjahr: +' : 'Hinter dem Vorjahr: −') + num(conv(Math.abs(nowV - prevSame)), 0) + NB + u + ' zum gleichen Tag.' : 'Im Vorjahr bis heute keine Einheiten.'}{sp === 'all' ? ' Alle Sportarten, gemessen in Stunden.' : ''}</div>
    </Tile>
  );
}

function SportCard({ s, all, t, pr, onPick }) {
  const m = metricOf(s);
  const L = all.filter((a) => dsport(a) === s);
  const c = sum(L.filter((a) => a.date >= pr.a && a.date <= pr.b));
  const w0 = add(t, -wd(t));
  const weeks = Array.from({ length: 8 }, (_, i) => add(w0, (i - 7) * 7));
  const items = weeks.map((w) => ({ date: w, v: L.filter((a) => a.date >= w && a.date <= add(w, 6)).reduce((x, a) => x + val(a, m), 0) / (m === 'dist' ? 1000 : 3600) }));
  const last = L.length ? L.reduce((x, a) => (a.date > x ? a.date : x), '') : null;
  return (
    <Tile cls="g-akt" style="--gx:100%;--gy:100%" onClick={onPick} label={sportLabel(s) + ', Überblick'}>
      <Head icon={sportIcon(s)} label={SPORTS[s].short} />
      {c.n ? <Big v={m === 'dist' ? km(c.dist) : hShort(c.time)} u={unitM(m)} cls="m" /> : <NoData text={'nichts ' + (pr.name === '12 Monate' ? 'in 12 Monaten' : pr.name === 'diese Woche' ? 'diese Woche' : 'im Zeitraum')} />}
      {c.n ? <div class="hp-sub" style="margin-top:2px">{pr.name}: {c.n} {c.n === 1 ? 'Einheit' : 'Einheiten'}{m === 'dist' ? ' · ' + hShort(c.time) + NB + 'h' : ''}</div> : null}
      <div class="fill"><DayBars items={items} fmt={(x) => num(x, x < 10 ? 1 : 0)} unit={unitM(m)} labels="ends" ends={['8 Wo.', 'jetzt']} label={SPORTS[s].short + ', letzte 8 Wochen'} ariaItem={(x) => 'Woche ab ' + dayMon(x.date)} /></div>
      <div class="hp-sub">{last ? 'zuletzt ' + relDate(last) : 'noch keine Einheit'}</div>
    </Tile>
  );
}

function Records({ L, sp, t }) {
  const y = t.slice(0, 4);
  const out = L.filter((a) => !a.indoor);
  const best = (list, f) => list.reduce((b, a) => (f(a) > (b ? f(b) : -Infinity) ? a : b), null);
  const rows = [];
  const add2 = (label, a, v) => { if (a && v) rows.push({ label, a, v }); };
  const dist = best(out, (a) => a.dist || 0);
  add2('Längste Strecke', dist, dist && km(dist.dist) + NB + 'km');
  const gain = best(out, (a) => a.gain || 0);
  add2('Meiste Höhenmeter', gain, gain && int(gain.gain) + NB + 'Hm');
  const time = best(L, (a) => a.mov || 0);
  add2('Längste Dauer', time, time && hmin(time.mov) + NB + 'h');
  if (sp === 'road' || sp === 'mtb') {
    const min = sp === 'road' ? 30000 : 15000;
    const sp1 = best(out.filter((a) => a.dist >= min && a.mov > 0), (a) => a.dist / a.mov);
    add2('Höchster Schnitt (ab ' + min / 1000 + ' km)', sp1, sp1 && num((sp1.dist / sp1.mov) * 3.6, 1) + NB + 'km/h');
  }
  const np = best(L.filter((a) => a.np || a.wAvg), (a) => a.np || a.wAvg || 0);
  if (np) add2(np.np ? 'Höchste NP' : 'Höchste Ø-Leistung', np, int(np.np || np.wAvg) + NB + 'W');
  if (!rows.length) return null;
  return (
    <Tile cls="w2 g-trn">
      <Head icon="trophy" label={'Bestwerte' + (sp === 'all' ? ' · alle Sportarten' : ' · ' + SPORTS[sp].short)} />
      <div class="rec-list">
        {rows.map((r) => (
          <button type="button" class="rec-row" onClick={() => push('activity', { id: r.a.id })} aria-label={r.label + ' ' + r.v + ', ' + r.a.name + ', ' + dateShort(r.a.date)}>
            <span class="rl">{r.label}{r.a.date.slice(0, 4) === y ? <span class="new">{y}</span> : null}</span>
            <span class="rv">{r.v}</span>
            <span class="rn">{sp === 'all' ? SPORTS[dsport(r.a)].short + ' · ' : ''}{r.a.name} · {dateShort(r.a.date)}</span>
          </button>
        ))}
      </div>
    </Tile>
  );
}

// Pulszonen im Zeitraum (Garmin-Zonen der Einheiten)
function Intensity({ list, name }) {
  const withZ = list.filter((a) => Array.isArray(a.hrz) && a.hrz.some((v) => v > 0));
  if (!withZ.length) return null;
  const z = [0, 0, 0, 0, 0];
  for (const a of withZ) a.hrz.slice(0, 5).forEach((v, i) => { z[i] += v || 0; });
  const tot = z.reduce((a, b) => a + b, 0);
  if (!tot) return null;
  const p = z.map((v) => (v / tot) * 100);
  const easy = p[0] + p[1], mid = p[2], hard = p[3] + p[4];
  return (
    <Tile cls="w2 g-herz" style="--gx:0%;--gy:0%">
      <Head icon="heart" label={'Intensität · ' + name} />
      <div class="int-b" role="img" aria-label={'Zeit in Pulszonen: ' + p.map((v, i) => 'Zone ' + (i + 1) + ' ' + Math.round(v) + ' Prozent').join(', ')}>
        {p.map((v, i) => (v > 0 ? <span style={{ width: v + '%', background: 'var(--z' + (i + 1) + ')' }} /> : null))}
      </div>
      <div class="int-ax">{p.map((v, i) => <span><b>Z{i + 1}</b> {Math.round(v)}{NB}%</span>)}</div>
      <div class="stats three int-st">
        <div class="stat"><div class="v">{Math.round(easy)}<small>%</small></div><div class="l">locker · Z1–2</div></div>
        <div class="stat"><div class="v">{Math.round(mid)}<small>%</small></div><div class="l">mittel · Z3</div></div>
        <div class="stat"><div class="v">{Math.round(hard)}<small>%</small></div><div class="l">hart · Z4–5</div></div>
      </div>
      <div class="hp-sub">{hmin(tot)}{NB}h mit Puls aus {withZ.length} von {list.length} {list.length === 1 ? 'Einheit' : 'Einheiten'}, nach deinen Garmin-Pulszonen.</div>
    </Tile>
  );
}

// Wann du trainierst: Wochentage und Tageszeit der letzten 12 Monate, dazu Regelmäßigkeit
function Rhythm({ L, t }) {
  const from = add(t, -364);
  const yr = L.filter((a) => a.date >= from);
  if (yr.length < 3) return null;
  const byWd = [0, 0, 0, 0, 0, 0, 0];
  for (const a of yr) byWd[wd(a.date)]++;
  const tod = { Morgen: 0, Mittag: 0, Nachmittag: 0, Abend: 0 };
  let nT = 0;
  for (const a of yr) { const hh = +(String(a.start || '').slice(11, 13)); if (!String(a.start || '').slice(11, 13)) continue; nT++; tod[hh < 11 ? 'Morgen' : hh < 14 ? 'Mittag' : hh < 18 ? 'Nachmittag' : 'Abend']++; }
  const topTod = Object.entries(tod).sort((a, b) => b[1] - a[1])[0];
  // aktive Wochen in Folge (bis zur aktuellen bzw. letzten Woche)
  const w0 = add(t, -wd(t));
  const active = (w) => L.some((a) => a.date >= w && a.date <= add(w, 6));
  let streak = 0, w = active(w0) ? w0 : add(w0, -7);
  while (active(w) && streak < 520) { streak++; w = add(w, -7); }
  const n12 = L.filter((a) => a.date >= add(w0, -77) && a.date <= t).length;
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const top = byWd.indexOf(Math.max(...byWd));
  return (
    <Tile cls="w2 g-akt" style="--gx:100%;--gy:100%">
      <Head icon="calendar" label="Rhythmus · 12 Monate" />
      <div class="stats three int-st">
        <div class="stat"><div class="v">{streak}</div><div class="l">aktive Wochen in Folge</div></div>
        <div class="stat"><div class="v">{num(n12 / 12, 1)}</div><div class="l">Einheiten je Woche, Ø 12 Wo.</div></div>
        <div class="stat"><div class="v">{yr.length}</div><div class="l">Einheiten in 12 Monaten</div></div>
      </div>
      <div class="fill"><DayBars items={byWd.map((v, i) => ({ date: add(w0, i), v }))} hlIndex={top} xLabels={WD} label="Einheiten je Wochentag, 12 Monate" unit="Einheiten" /></div>
      <div class="hp-sub">Am häufigsten am {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][top]}{nT && topTod[1] ? ', meist ' + { Morgen: 'morgens', Mittag: 'mittags', Nachmittag: 'nachmittags', Abend: 'abends' }[topTod[0]] + ' (' + Math.round((topTod[1] / nT) * 100) + NB + '%)' : ''}.</div>
    </Tile>
  );
}

function Averages({ list, sp, name }) {
  const c = sum(list);
  const out = list.filter((a) => !a.indoor && a.dist > 0);
  const bike = sp === 'road' || sp === 'mtb';
  const spd = bike && out.length ? out.reduce((s, a) => s + a.dist, 0) / out.reduce((s, a) => s + (a.mov || 0), 0) : null;
  return (
    <Tile cls="w2 g-akt">
      <Head icon="stats-report" label={'Ø je Einheit · ' + name} />
      {(() => {
        const st = [
          ['Dauer', hmin(c.time / c.n), 'h'],
          out.length ? ['Strecke', km(out.reduce((x, a) => x + a.dist, 0) / out.length), 'km'] : null,
          out.length ? ['Höhenmeter', int(out.reduce((x, a) => x + (a.gain || 0), 0) / out.length), 'Hm'] : null,
          c.hrAvg ? ['Puls', int(c.hrAvg), 'bpm'] : null,
          spd ? ['Tempo', num(spd * 3.6, 1), 'km/h'] : null,
        ].filter(Boolean);
        return <div class={'stats int-st ' + (st.length === 4 || st.length === 2 ? 'two' : 'three')}>{st.map(([l, v, u]) => <div class="stat"><div class="v">{v}<small>{u}</small></div><div class="l">{l}</div></div>)}</div>;
      })()}
    </Tile>
  );
}
