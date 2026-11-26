// Aktivitäten je Sportart (Runde 6): Listenzeilen, Karte „Letzte Aktivität“ und Kopf der Detailansicht.
// Aufbau der Karte: Kopf → Hauptgrafik → 6 Kennzahlen (3×2) → Besonderheit. Nur echte Daten; was fehlt,
// wird durch die nächste passende Kennzahl ersetzt. Aus Zeitreihen abgeleitete Werte tragen „≈“.
import { h, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getState, patchDoc } from '../store.js';
import { loadStreams, ensureFullSummary } from '../strava.js';
import { dsport, sportLabel, actIcon } from '../sports.js';
import { Ico } from '../ui/hp.jsx';
import { MapView } from '../ui/map.jsx';
import { ATTRIBUTION, peaksNear } from '../ui/basemap.js';
import { GRADE_CLASSES, GRADE_COLORS, gradeClass, toGrid, gradeModel } from '../grade.js';
import { actSummary, SUM_V, W_BINS } from '../actsum.js';
import { computeSections } from '../sections.js';
import { decode } from '../geo.js';
import { km, hm, int, num, speedKmh, pace, dateShort, timeOf, NB } from '../format.js';

// ---------- Art der Aktivität ----------
export function sportKind(a) {
  const sp = dsport(a);
  if (sp === 'road' || sp === 'mtb' || sp === 'indoor' || sp === 'hike') return sp;
  if (sp === 'splitboard') return 'ski';
  if (sp === 'snowboard') return 'snow';
  if (sp === 'gym') return a.type === 'WeightTraining' || a.gtype === 'strength_training' ? 'gym' : 'fit';
  if (a.sub && /Lauf/.test(a.sub)) return 'run';
  if (a.sub === 'Spaziergang') return 'hike';
  return 'fit';
}
const ENV = { road: 'out', mtb: 'out', hike: 'out', ski: 'snow', snow: 'snow', run: 'out', indoor: 'in', gym: 'in', fit: 'in' };

const durVU = (s) => (s == null ? null : s >= 3600 ? [Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0'), 'h'] : [String(Math.max(1, Math.round(s / 60))), 'min']);
const durTxt = (s) => { const x = durVU(s); return x ? x[0] + NB + x[1] : '–'; };
const ax = (v, ap) => (ap ? '≈' + NB + v : v);
const round10 = (v) => Math.round(v / 10) * 10;

export const hrOf = (a, perf) => (perf && perf.avgHr != null ? perf.avgHr : a.hrAvg != null ? a.hrAvg : null);
// Leistung nur echt: Powermeter/Zwift (Strava: device_watts; Garmin schätzt nicht)
export const wattOf = (a, perf) => (perf && perf.hasW && perf.avgW != null ? perf.avgW : a.gid && a.wAvg != null ? a.wAvg : null);
const MUSCLE = { Biceps: 'Bizeps', Triceps: 'Trizeps', Chest: 'Brust', Shoulders: 'Schultern', Back: 'Rücken', 'Upper Back': 'oberer Rücken', 'Lower Back': 'unterer Rücken', Lats: 'Latissimus', Quadriceps: 'Oberschenkel', Hamstrings: 'Beinbeuger', Glutes: 'Gesäß', Calves: 'Waden', Abs: 'Bauch', Core: 'Rumpf', Obliques: 'seitl. Bauch', Forearms: 'Unterarme', Traps: 'Nacken', Legs: 'Beine' };
const CAT_MUSCLE = { Curl: 'Bizeps', 'Bench Press': 'Brust', Squat: 'Beine', Deadlift: 'Rücken, Beine', Row: 'Rücken', 'Shoulder Press': 'Schultern', Lunge: 'Beine', Plank: 'Rumpf', Crunch: 'Bauch', 'Pull Up': 'Rücken', 'Push Up': 'Brust', 'Triceps Extension': 'Trizeps', 'Lateral Raise': 'Schultern', 'Calf Raise': 'Waden', 'Hip Raise': 'Gesäß', 'Leg Curl': 'Beinbeuger', Fly: 'Brust', 'Shrug': 'Nacken' };
const unknownEx = (n) => !n || /^(unknown|unbekannt)$/i.test(n);
export const muscleOf = (s) => (s.muscles && s.muscles.length ? s.muscles.map((m) => MUSCLE[m] || m).join(', ') : CAT_MUSCLE[s.name] || null);

// ---------- Kennzahlen ----------
function stats(a, perf, sum, str) {
  const k = sportKind(a);
  const hr = hrOf(a, perf), w = wattOf(a, perf);
  const sets = str && str.sets ? str.sets : null;
  const runs = sum && sum.runs ? sum.runs : null;
  const runHm = runs ? runs.reduce((x, r) => x + r[0], 0) : null;
  const S = {
    dist: () => (a.dist > 0 ? { v: km(a.dist), u: 'km', l: a.indoor ? 'virtuelle km' : 'Distanz' } : null),
    mov: () => { const d = durVU(a.mov); return d ? { v: d[0], u: d[1], l: k === 'hike' ? 'Gehzeit' : k === 'indoor' || k === 'gym' || k === 'fit' ? 'Dauer' : 'Bewegungszeit' } : null; },
    spd: () => (a.dist > 0 && a.mov ? { v: speedKmh(a.dist / a.mov), u: 'km/h', l: 'Ø Tempo' } : null),
    gain: () => (a.gain > 0 ? { v: hm(a.gain), u: 'Hm', l: a.indoor ? 'virtuelle Hm' : 'Aufstieg' } : null),
    hr: () => (hr != null ? { v: int(hr), u: 'bpm', l: 'Ø Puls' } : null),
    pr: () => (a.pr > 0 ? { v: String(a.pr), u: '', l: 'Bestzeiten' } : null),
    maxG: () => (sum && sum.maxG != null && sum.maxG > 0 ? { v: ax(num(sum.maxG, 0), true), u: '%', l: 'max. Steigung' } : null),
    hmkm: () => (a.gain > 0 && a.dist > 500 ? { v: int(a.gain / (a.dist / 1000)), u: 'Hm/km', l: 'Steilheit' } : null),
    vmax: () => (a.maxSpd > 0 ? { v: num(a.maxSpd * 3.6, a.maxSpd * 3.6 >= 100 ? 0 : 1), u: 'km/h', l: 'Höchsttempo' } : null),
    watt: () => (w != null ? { v: int(w), u: 'W', l: 'Ø Leistung' } : null),
    kj: () => (w != null && a.mov ? { v: int(sum && sum.kj != null && sum.full ? sum.kj : (w * a.mov) / 1000), u: 'kJ', l: 'Arbeit' } : null),
    cad: () => (a.cad > 0 && (k === 'indoor' || k === 'road' || k === 'mtb') ? { v: int(a.cad), u: 'U/min', l: 'Ø Trittfrequenz' } : null),
    pause: () => (a.ela - a.mov > 60 ? { ...(([v, u]) => ({ v, u }))(durVU(a.ela - a.mov)), l: 'Pausen' } : null),
    uprate: () => (sum && sum.up && sum.up.rate ? { v: ax(int(sum.up.rate), true), u: 'Hm/h', l: 'Ø bergauf' } : null),
    uptime: () => (sum && sum.up && sum.up.t ? { ...(([v, u]) => ({ v: ax(v, true), u }))(durVU(sum.up.t)), l: 'Aufstiegszeit' } : null),
    top: () => (sum && sum.top && sum.top.alt != null ? { v: ax(int(sum.top.alt), true), u: 'm', l: 'höchster Punkt' } : null),
    runs: () => (runs ? { v: String(runs.length), u: '', l: 'Abfahrten' } : null),
    runhm: () => (runs && runs.length ? { v: ax(int(round10(runHm)), true), u: 'Hm', l: 'Abfahrts-Hm' } : null),
    lifts: () => (sum && sum.lifts ? { v: String(sum.lifts), u: '', l: 'Liftfahrten' } : null),
    sets: () => (sets && sets.length ? { v: String(sets.length), u: '', l: 'Sätze' } : null),
    exer: () => (sets && sets.length ? { v: String(new Set(sets.filter((s) => !unknownEx(s.name)).map((s) => s.name)).size), u: '', l: 'erkannte Übungen' } : null),
    cal: () => (a.cal > 0 ? { v: int(a.cal), u: 'kcal', l: 'Energie' } : null),
    pace: () => (a.dist > 0 && a.mov ? { v: pace(a.mov / (a.dist / 1000)), u: '/km', l: 'Ø Pace' } : null),
    ela: () => { const d = durVU(a.ela); return d && a.ela > a.mov + 60 ? { v: d[0], u: d[1], l: 'Gesamtzeit' } : null; },
    np: () => (w != null && a.np ? { v: int(a.np), u: 'W', l: 'NP' } : null),
    re: () => (a.re != null ? { v: int(a.re), u: '', l: 'Relative Effort' } : null),
    rpe: () => (a.rpe ? { v: String(a.rpe), u: '/10', l: 'Anstrengung' } : null),
  };
  const ORDER = {
    road: ['dist', 'mov', 'spd', 'gain', 'hr', 'pr', 'watt', 'vmax', 'cal', 'cad', 're', 'rpe'],
    mtb: ['dist', 'gain', 'mov', 'maxG', 'hmkm', 'vmax', 'hr', 'spd', 'cal', 'pr', 're', 'rpe'],
    indoor: ['mov', 'watt', 'hr', 'kj', 'cad', 'dist', 'np', 'gain', 'cal', 're', 'rpe'],
    hike: ['dist', 'gain', 'mov', 'pause', 'uprate', 'top', 'hr', 'cal', 'ela', 're', 'rpe'],
    ski: ['gain', 'uprate', 'uptime', 'dist', 'mov', 'top', 'hr', 'cal', 'ela', 're', 'rpe'],
    snow: ['runs', 'runhm', 'vmax', 'lifts', 'mov', 'top', 'dist', 'cal', 'hr', 're', 'rpe'],
    gym: ['mov', 'sets', 'exer', 'hr', 'cal', 're', 'rpe'],
    run: ['dist', 'pace', 'gain', 'hr', 'mov', 'cal', 're', 'rpe'],
    fit: ['mov', 'hr', 'cal', 're', 'rpe', 'dist'],
  };
  return (ORDER[k] || ORDER.fit).map((key) => { const x = S[key](); return x ? { k: key, ...x } : null; }).filter(Boolean);
}

// Zwei Kennzahlen für die Listenzeile (oben/unten); fehlt eine, kommt die nächste passende
export function listMetrics(a, perf, str) {
  const k = sportKind(a), sum = perf && perf.sum;
  const all = stats(a, perf, sum, str);
  const by = Object.fromEntries(all.map((x) => [x.k, x]));
  const PICK = {
    road: [['dist'], ['spd', 'mov']], mtb: [['dist'], ['gain', 'mov']], indoor: [['watt', 'dist'], ['mov']], hike: [['gain', 'dist'], ['mov']],
    ski: [['gain'], ['uprate', 'mov']], snow: [['runs', 'mov'], ['runhm', 'dist', 'mov']], run: [['dist'], ['pace', 'mov']],
    gym: [['sets', 'mov'], ['mov', 'cal']], fit: [['mov'], ['cal', 'hr']],
  }[k] || [['mov'], ['dist']];
  const used = new Set();
  const take = (keys) => { for (const key of keys) if (by[key] && !used.has(key)) { used.add(key); return by[key]; } return null; };
  const top = take(PICK[0]), bot = take(PICK[1]);
  const f = (x) => (x ? (x.v + (x.u ? NB + x.u : '') + (x.k === 'runs' ? ' Abfahrten' : x.k === 'sets' ? ' Sätze' : '')).replace(NB + '/', '/') : null);
  return [f(top), f(bot)];
}

// ---------- Zeitreihen + Zusammenfassung ----------
export function useActData(a, { want = true, streams: given, sections: givenSecs } = {}) {
  const S = getState();
  const perf = S.perf[a.id];
  const [st, setSt] = useState(given || null);
  const [busy, setBusy] = useState(false);
  const needs = want && !given && a.src === 'strava' && sportKind(a) !== 'gym';
  useEffect(() => { if (given) setSt(given); }, [given]);
  useEffect(() => {
    if (!needs) return;
    let alive = true;
    setBusy(true);
    loadStreams(a.id).then((s) => { if (alive) { setSt(s); setBusy(false); } }).catch(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [a.id, needs]);
  const secs = useMemo(() => givenSecs || (st && st.alt ? computeSections(st, a.sport) : []), [st, givenSecs, a.sport]);
  const sum = useMemo(() => {
    const old = perf && perf.sum;
    if (old && old.v === SUM_V && (old.full || !st || old.n >= st.t.length)) return old;
    if (!st) return old || null;
    return actSummary(a, st, { sections: secs });
  }, [st, secs, perf && perf.sum]);
  // speichern, damit Listenzeilen die Werte ohne Zeitreihen haben
  useEffect(() => {
    if (!sum || !st) return;
    const old = perf && perf.sum;
    if (old && old.v === SUM_V && (old.full || old.n >= sum.n)) return;
    patchDoc('perf/' + a.id, { ...(perf || {}), sum });
  }, [sum]);
  return { st, secs, sum, busy, perf };
}

// ---------- Hauptgrafiken ----------
const W = 360;
function Axis({ lo, hi, legend }) {
  return <div class="sc-axis"><span>{lo}</span>{legend}<span>{hi}</span></div>;
}

function profilePts(st, n = 180) {
  if (!st || !st.d || !st.alt) return null;
  const P = [];
  for (let i = 0; i < st.d.length; i++) if (st.d[i] != null && st.alt[i] != null) P.push([st.d[i], st.alt[i], i]);
  if (P.length < 5) return null;
  const step = Math.max(1, Math.floor(P.length / n));
  const out = P.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== P[P.length - 1]) out.push(P[P.length - 1]);
  return out;
}

// Höhenprofil nach Steigungsklassen (Rad)
function GradeStrip({ st, label }) {
  const gm = useMemo(() => { try { return st && st.d && st.alt ? gradeModel(toGrid({ d: st.d, alt: st.alt, t: st.t }, 20)) : null; } catch (e) { return null; } }, [st]);
  if (!gm) return null;
  const H = 70, n = gm.n, d0 = gm.d0, D = (n - 1) * gm.step || 1;
  let lo = Infinity, hi = -Infinity; for (const v of gm.as) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = Math.max(10, (hi - lo) * 0.12);
  const X = (d) => ((d - d0) / D) * W, Y = (v) => 4 + (1 - (v - lo) / (hi - lo + pad)) * (H - 8);
  const area = 'M0,' + H + gm.as.map((v, k) => 'L' + X(gm.dist(k)).toFixed(1) + ',' + Y(v).toFixed(1)).join('') + 'L' + W + ',' + H + 'Z';
  return (
    <figure class="sc-prof">
      <div class="sc-cap"><span>{int(hi)}{NB}m</span><span>Steigung</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label + ': ' + int(lo) + ' bis ' + int(hi) + ' m'}>
        <path d={area} class="sc-area" />
        {gm.segs.map((s) => <line x1={X(s.d0)} x2={X(s.d1)} y1={Y(gm.as[s.k0])} y2={Y(gm.as[s.k1])} stroke={s.g < 0 ? 'color-mix(in oklab, var(--neutral) 55%, var(--tile))' : GRADE_COLORS[gradeClass(s.g)]} stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />)}
      </svg>
      <Axis lo={int(lo) + NB + 'm'} hi="" legend={<span class="sc-leg">{GRADE_CLASSES.map((c, i) => <span><i style={{ background: GRADE_COLORS[i] }} />{c.label.replace(' %', '')}</span>)}<span>%</span></span>} />
    </figure>
  );
}

// Höhenprofil mit höchstem Punkt (Wandern) bzw. Aufstieg/Abfahrt (Skitour)
function TopProfile({ st, sum, ski, label, peak }) {
  const P = useMemo(() => profilePts(st), [st]);
  if (!P) return null;
  const H = 84;
  let lo = Infinity, hi = -Infinity; for (const p of P) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  const d0 = P[0][0], D = P[P.length - 1][0] - d0 || 1, rng = hi - lo || 1;
  const X = (d) => ((d - d0) / D) * W, Y = (v) => 18 + (1 - (v - lo) / rng) * (H - 22);
  let ti = 0; for (let i = 1; i < P.length; i++) if (P[i][1] > P[ti][1]) ti = i;
  const line = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('');
  const up = P.slice(0, ti + 1), dn = P.slice(ti);
  const tx = X(P[ti][0]), ty = Y(P[ti][1]);
  const tag = (peak ? peak.name + ' · ' : '') + int(sum && sum.top ? sum.top.alt : P[ti][1]) + NB + 'm';
  return (
    <figure class="sc-prof">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label + ': höchster Punkt ' + tag}>
        {ski ? (
          <Fragment>
            <path d={line(up) + `L${tx},${H}L${X(up[0][0])},${H}Z`} class="sc-area up" />
            <path d={line(up)} class="sc-line" />
            <path d={line(dn)} class="sc-line dn" />
          </Fragment>
        ) : (
          <Fragment>
            <path d={line(P) + `L${W},${H}L0,${H}Z`} class="sc-area up" />
            <path d={line(P)} class="sc-line" />
          </Fragment>
        )}
      </svg>
      <div class="sc-peak" style={{ left: (tx / W) * 100 + '%', top: (ty / H) * 100 + '%' }}><i /><span class={tx / W > 0.7 ? 'l' : tx / W < 0.3 ? 'r' : ''}>{tag}</span></div>
      <Axis lo={int(lo) + NB + 'm'} hi={km(P[P.length - 1][0]) + NB + 'km'} legend={ski ? <span class="sc-leg"><span><i class="up" />Aufstieg</span><span><i class="dn" />Abfahrt</span></span> : null} />
    </figure>
  );
}

// Abfahrten als Balkenfolge (Ski alpin/Snowboard), die längste hervorgehoben
function RunBars({ runs, full }) {
  if (!runs || !runs.length) return null;
  const mx = Math.max(...runs.map((r) => r[0]));
  const best = runs.findIndex((r) => r[0] === mx);
  const top = Math.ceil(mx / 100) * 100;
  return (
    <figure class="sc-runs">
      <div class="sc-cap"><span>{int(top)}{NB}Hm</span><span>Höhenmeter je Abfahrt</span></div>
      <div class="sc-rb" role="img" aria-label={runs.length + ' Abfahrten, längste ' + int(mx) + ' Hm (Nr. ' + (best + 1) + ')'}>
        {runs.map((r, i) => <i class={i === best ? 'hi' : ''} style={{ height: Math.max(3, (r[0] / top) * 100) + '%' }} title={'Abfahrt ' + (i + 1) + ': ' + int(r[0]) + ' Hm'} />)}
      </div>
      <Axis lo="1" hi={String(runs.length)} legend={<span class="sc-leg">{full ? 'volle Auflösung' : 'aus der Aufzeichnung, ≈'}</span>} />
    </figure>
  );
}

// Leistungsverlauf 0–400 W mit Ø-Linie und Verteilung (Indoor)
function PowerGraph({ st, avg, sum }) {
  if (!st || !st.w || !st.t) return null;
  const H = 96, T = st.t[st.t.length - 1] - st.t[0] || 1, M = 400;
  const X = (t) => ((t - st.t[0]) / T) * W, Y = (w) => H - (Math.min(M, Math.max(0, w || 0)) / M) * H;
  const step = Math.max(1, Math.floor(st.t.length / 240));
  const pts = []; for (let i = 0; i < st.t.length; i += step) pts.push([X(st.t[i]), Y(st.w[i])]);
  const area = 'M0,' + H + pts.map(([x, y]) => 'L' + x.toFixed(1) + ',' + y.toFixed(1)).join('') + 'L' + W + ',' + H + 'Z';
  const mins = Math.round(T / 60), tick = mins > 90 ? 30 : mins > 40 ? 15 : 10;
  const ticks = []; for (let m = tick; m < mins; m += tick) ticks.push(m);
  const wd = sum && sum.wd;
  const labs = ['< 150', '150–200', '200–250', '250–300', '> 300'];
  return (
    <Fragment>
      <figure class="sc-pow">
        <div class="sc-cap"><span>400{NB}W</span><span>Leistung</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={'Leistungsverlauf, Ø ' + int(avg) + ' W'}>
          {[100, 200, 300].map((w) => <line x1="0" x2={W} y1={Y(w)} y2={Y(w)} class="sc-grid" />)}
          <path d={area} class="sc-parea" />
          {avg != null ? <line x1="0" x2={W} y1={Y(avg)} y2={Y(avg)} class="sc-avg" /> : null}
        </svg>
        <div class="sc-axis t">{['0', ...ticks.map(String)].map((m, i) => <span style={{ left: ((i ? +m * 60 : 0) / T) * 100 + '%' }}>{m}{i ? '' : NB + 'min'}</span>)}</div>
        {avg != null ? <div class="sc-avgtag" style={{ top: (Y(avg) / H) * 100 + '%' }}>Ø {int(avg)}{NB}W</div> : null}
      </figure>
      {wd ? (
        <div class="sc-wd" role="img" aria-label={'Leistungsverteilung: ' + labs.map((l, i) => l + ' W ' + wd[i] + ' %').join(', ')}>
          {wd.map((p, i) => <div><b>{p}{NB}%</b><i style={{ height: Math.max(2, p) * 0.6 + 'px' }} /><span>{labs[i]}</span></div>)}
        </div>
      ) : null}
    </Fragment>
  );
}

function PaceBars({ kms }) {
  if (!kms || !kms.length) return null;
  const fast = Math.min(...kms), slow = Math.max(...kms);
  return (
    <figure class="sc-runs">
      <div class="sc-cap"><span>Pace je km</span><span>schnellster {pace(fast)}{NB}/km</span></div>
      <div class="sc-rb" role="img" aria-label={'Pace je Kilometer, schnellster ' + pace(fast)}>
        {kms.map((s) => <i class={s === fast ? 'hi' : ''} style={{ height: 30 + ((slow - s) / Math.max(1, slow - fast)) * 70 + '%' }} title={pace(s) + ' /km'} />)}
      </div>
      <Axis lo="km 1" hi={'km ' + kms.length} />
    </figure>
  );
}

function HrGraph({ st }) {
  if (!st || !st.hr || !st.t) return null;
  const H = 80, T = st.t[st.t.length - 1] - st.t[0] || 1;
  const v = st.hr.filter((x) => x); if (v.length < 5) return null;
  const lo = Math.min(...v) - 5, hi = Math.max(...v) + 5;
  const X = (t) => ((t - st.t[0]) / T) * W, Y = (h0) => H - ((h0 - lo) / (hi - lo)) * H;
  const d = st.t.map((t, i) => (st.hr[i] ? (i ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(st.hr[i]).toFixed(1) : '')).join('').replace(/^L/, 'M');
  return (
    <figure class="sc-pow">
      <div class="sc-cap"><span>{int(hi)}{NB}bpm</span><span>Puls</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Pulsverlauf"><path d={d} class="sc-line hr" /></svg>
      <Axis lo={int(lo) + NB + 'bpm'} hi={Math.round(T / 60) + NB + 'min'} />
    </figure>
  );
}

function GymList({ sets }) {
  if (!sets || !sets.length) return <div class="sc-empty">Keine Sätze von der Uhr erfasst.</div>;
  const g = [];
  for (const s of sets) {
    const last = g[g.length - 1];
    if (last && last.name === s.name) last.sets.push(s); else g.push({ name: s.name, sets: [s] });
  }
  return (
    <ul class="sc-gym">
      {g.map((e) => (
        <li>
          <div><b>{unknownEx(e.name) ? 'Nicht erkannt' : e.name}</b><span>{muscleOf(e.sets[0]) || (unknownEx(e.name) ? 'von der Uhr nicht zugeordnet' : '')}</span></div>
          <div class="r">{e.sets.map((s) => (s.kg != null ? (s.reps != null ? s.reps + '×' : '') + num(s.kg, s.kg % 1 ? 1 : 0) + NB + (s.unit || 'kg') : (s.reps != null ? s.reps + NB + 'Wdh.' : '') + (s.sec && s.reps == null ? int(s.sec) + NB + 's' : ''))).join(' · ')}</div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Besonderheit ----------
const placeOf = (a) => (a.place ? a.place.split(/\s+-\s+|,/)[0].trim() : '');
const routeOf = (a) => { const m = /🗺️\s*(.+?)(?:\s+in\s+([\w ]+))?\s*$/u.exec(a.desc || ''); return m ? { name: m[1], world: m[2] || null } : null; };
function bestPow(perf, sum, sec) {
  const pc = perf && perf.pc && perf.pc.res ? perf.pc.res.find((x) => x.d === sec) : null;
  if (pc) return { w: pc.w };
  const nm = sec === 1200 ? 'GreatestPower20min' : 'GreatestPower1hr';
  const b = perf && perf.best ? perf.best.find((x) => x.t === nm) : null;
  if (b) return { w: b.v };
  const v = sum && (sec === 1200 ? sum.b20 : sum.b60);
  return v ? { w: v, ap: !sum.full } : null;
}
function prevSet(a, name) {
  const S = getState();
  const acts = [];
  for (const ch of Object.values(S.acts)) for (const x of ch.items || []) if (x.id !== a.id && x.date <= a.date && S.strength[x.id]) acts.push(x);
  acts.sort((x, y) => (y.start || y.date).localeCompare(x.start || x.date));
  for (const x of acts) { const s = (S.strength[x.id].sets || []).filter((q) => q.name === name); if (s.length) return { a: x, s }; }
  return null;
}

function Highlight({ a, perf, sum, str, peak }) {
  const k = sportKind(a);
  let cap = null, txt = null;
  if (k === 'road') {
    const seg = perf && perf.seg ? perf.seg.filter((x) => x.g >= 30 && x.d > 300).sort((x, y) => y.g - x.g)[0] : null;
    cap = 'Größter Anstieg';
    if (seg) txt = <Fragment><b>{seg.n}</b><span>{km(seg.d)}{NB}km · Ø {num((seg.g / seg.d) * 100, 1)}{NB}% · {seg.mt ? int((seg.g / seg.mt) * 3600) + NB + 'Hm/h VAM' : ''}</span></Fragment>;
    else if (sum && sum.climb) txt = <Fragment><b>km {km(sum.climb.d0)}–{km(sum.climb.d1)}</b><span>{km(sum.climb.len)}{NB}km · {int(sum.climb.gain)}{NB}Hm · Ø {num(sum.climb.avg, 1)}{NB}%{sum.climb.vam ? ' · ' + int(sum.climb.vam) + NB + 'Hm/h VAM' : ''}</span></Fragment>;
  } else if (k === 'mtb') {
    cap = sum && sum.loop != null ? (sum.loop ? 'Rundtour' : 'Strecke') : 'Höchster Punkt';
    const parts = [];
    if (sum && sum.top) parts.push('höchster Punkt ' + ax(int(sum.top.alt), true) + NB + 'm');
    if (placeOf(a)) parts.push((sum && sum.loop ? 'ab ' : 'Start ') + placeOf(a));
    if (parts.length) txt = <Fragment><b>{parts[0]}</b>{parts[1] ? <span>{parts[1]}</span> : null}</Fragment>;
  } else if (k === 'indoor') {
    const r = routeOf(a), b20 = bestPow(perf, sum, 1200), b60 = bestPow(perf, sum, 3600);
    cap = r ? 'Strecke · beste Leistung' : 'Beste Leistung';
    if (b20 || r) txt = <Fragment><b>{r ? r.name + (r.world ? ' · ' + r.world : '') : ''}</b><span>{b20 ? '20 min ' + ax(int(b20.w), b20.ap) + NB + 'W' : ''}{b60 ? ' · 1 h ' + ax(int(b60.w), b60.ap) + NB + 'W' : ''}</span></Fragment>;
  } else if (k === 'hike' || k === 'ski') {
    cap = k === 'ski' ? 'Ziel' : 'Gipfel aus den Kartendaten';
    if (peak) txt = <Fragment><b>{peak.name}{peak.ele ? ' · ' + int(peak.ele) + NB + 'm' : ''}</b><span>höchster Punkt {ax(int(sum.top.alt), true)}{NB}m{peak.dist > 20 ? ' · ' + peak.dist + NB + 'm daneben' : ''}</span></Fragment>;
    else if (sum && sum.top) txt = <Fragment><b>höchster Punkt {ax(int(sum.top.alt), true)}{NB}m</b></Fragment>;
  } else if (k === 'snow') {
    cap = 'Längste Abfahrt';
    const r = sum && sum.runs && sum.runs.length ? sum.runs.slice().sort((x, y) => y[0] - x[0])[0] : null;
    if (r) txt = <Fragment><b>{ax(int(r[0]), !sum.full)}{NB}Hm</b><span>{r[1] ? km(r[1]) + NB + 'km · ' : ''}{durTxt(r[2])}</span></Fragment>;
  } else if (k === 'gym') {
    cap = 'Fortschritt';
    const sets = str && str.sets ? str.sets.filter((s) => !unknownEx(s.name)) : [];
    const ex = sets[0];
    const prev = ex ? prevSet(a, ex.name) : null;
    if (ex && prev) {
      const best = (arr) => arr.reduce((m, s) => ((s.kg || 0) * (s.reps || 1) > (m.kg || 0) * (m.reps || 1) ? s : m), arr[0]);
      const n = best(sets.filter((s) => s.name === ex.name)), o = best(prev.s);
      const dk = (n.kg || 0) - (o.kg || 0);
      txt = <Fragment><b>{ex.name}: {n.reps != null ? n.reps + '×' : ''}{n.kg != null ? num(n.kg, 1) + NB + 'kg' : ''}</b><span>letztes Mal {dateShort(prev.a.date)}: {o.reps != null ? o.reps + '×' : ''}{o.kg != null ? num(o.kg, 1) + NB + 'kg' : ''}{dk ? ' · ' + (dk > 0 ? '+' : '−') + num(Math.abs(dk), 1) + NB + 'kg' : ''}</span></Fragment>;
    } else if (ex) txt = <Fragment><b>{ex.name}</b><span>Vergleich ab der nächsten Einheit</span></Fragment>;
  } else if (k === 'run') {
    cap = 'Schnellster km';
    if (sum && sum.km) { const f = Math.min(...sum.km); txt = <Fragment><b>{pace(f)}{NB}/km</b><span>km {sum.km.indexOf(f) + 1}</span></Fragment>; }
  } else if (k === 'fit') {
    cap = 'Zeit in der Zielzone';
    if (a.hrz && a.hrz.some((v) => v)) txt = <Fragment><b>{durTxt(a.hrz[1])}</b><span>Zone 2 (Grundlage) · {int((a.hrz[1] / Math.max(1, a.hrz.reduce((x, y) => x + y, 0))) * 100)}{NB}% der Zeit</span></Fragment>;
  }
  if (!txt) return null;
  return <div class="sc-hl"><span class="cap">{cap}</span><div>{txt}</div></div>;
}

// ---------- Karte ----------
export function SportCard({ a, detail = false, streams, sections, want = true, mapSlot, onOpen, label, cls = '' }) {
  const k = sportKind(a);
  const D = useActData(a, { want, streams, sections });
  const { st, sum, busy, perf } = D;
  const S = getState();
  const str = S.strength[a.id] || null;
  const pts = useMemo(() => (st && st.ll && st.ll.length ? st.ll : a.poly ? decode(a.poly) : null), [st, a.poly]);
  const [peak, setPeak] = useState(null);
  useEffect(() => {
    setPeak(null);
    if ((k !== 'hike' && k !== 'ski') || !sum || !sum.top || !sum.top.ll) return;
    let alive = true;
    peaksNear(sum.top.ll[0], sum.top.ll[1], 150).then((p) => { if (alive) setPeak(p[0] || null); });
    return () => { alive = false; };
  }, [a.id, sum && sum.top && sum.top.ll && sum.top.ll.join(',')]);
  // Snowboard/Ski alpin: Abfahrten in der Detailansicht aus voller Auflösung nachrechnen
  useEffect(() => { if (detail && k === 'snow' && a.gid && !(sum && sum.full)) ensureFullSummary(a.id).catch(() => {}); }, [a.id, detail]);
  const all = stats(a, perf, sum, str);
  const six = all.slice(0, 6);
  const more = detail ? all.slice(6) : [];
  const env = ENV[k] || 'out';
  const hasMap = pts && pts.length > 1 && !a.indoor && (k === 'road' || k === 'mtb' || k === 'hike' || k === 'run');
  const w = wattOf(a, perf);
  let main = null;
  if (k === 'road' || k === 'mtb') main = <Fragment>{hasMap ? (mapSlot || <MiniMap a={a} pts={pts} />) : null}{st ? <GradeStrip st={st} label={'Höhenprofil ' + a.name} /> : busy ? <div class="sc-skel" /> : null}</Fragment>;
  else if (k === 'hike' || k === 'run') main = <Fragment>{hasMap ? (mapSlot || <MiniMap a={a} pts={pts} />) : null}{k === 'run' ? <PaceBars kms={sum && sum.km} /> : st ? <TopProfile st={st} sum={sum} label={'Höhenprofil ' + a.name} peak={peak} /> : busy ? <div class="sc-skel" /> : null}</Fragment>;
  else if (k === 'ski') main = st ? <TopProfile st={st} sum={sum} ski label={'Profil ' + a.name} peak={peak} /> : busy ? <div class="sc-skel" /> : null;
  else if (k === 'snow') main = sum && sum.runs ? <RunBars runs={sum.runs} full={sum.full} /> : busy ? <div class="sc-skel" /> : null;
  else if (k === 'indoor') main = st && st.w && w != null ? <PowerGraph st={st} avg={w} sum={sum} /> : busy ? <div class="sc-skel" /> : null;
  else if (k === 'gym') main = <GymList sets={str && str.sets} />;
  else if (k === 'fit') main = st && st.hr ? <HrGraph st={st} /> : null;
  const Tag = onOpen ? 'button' : 'div';
  return (
    <section class={'sc env-' + env + (detail ? ' detail' : '') + (cls ? ' ' + cls : '')} aria-label={label || a.name} onClick={onOpen ? (e) => { if (!e.target.closest('button,a')) onOpen(); } : undefined}>
      <Tag type={onOpen ? 'button' : undefined} class="sc-head" onClick={onOpen}>
        <span class="mark2 sc-ic"><Ico n={actIcon(a)} /></span>
        <span class="sc-t">
          {label && !detail ? <span class="sc-k">{label}</span> : null}
          <b>{a.name}</b>
          <span class="sc-m">{dateShort(a.date)}{timeOf(a.start) ? ' · ' + timeOf(a.start) : ''} · {a.sub && !/indoor/i.test(a.sub) ? a.sub : sportLabel(dsport(a))}</span>
        </span>
        {onOpen ? <Ico n="nav-arrow-right" /> : null}
      </Tag>
      {main ? <div class="sc-main">{main}</div> : null}
      {hasMap && !mapSlot ? <div class="sc-attr">{ATTRIBUTION}</div> : null}
      <div class="sc-stats">{six.map((x) => <div><b>{x.v}{x.u ? <small>{x.u}</small> : null}</b><span>{x.l}</span></div>)}</div>
      <Highlight a={a} perf={perf} sum={sum} str={str} peak={peak} />
      {more.length ? <div class="sc-more">{more.map((x) => <span>{x.l} <b>{x.v}{x.u ? NB + x.u : ''}</b></span>)}</div> : null}
    </section>
  );
}

function MiniMap({ a, pts }) {
  return (
    <div class="sc-map">
      <MapView still pad={16} maxFit={15} height="168px" fit={[pts]} fitKey={a.id}
        lines={[{ pts, color: 'var(--c-akt)', width: 3.2 }]}
        markers={[{ pt: pts[pts.length - 1], color: 'var(--ink)', ring: true, r: 4.5 }, { pt: pts[0], color: 'var(--ink)', r: 4.5 }]}
        label={'Karte der Strecke ' + a.name} attr={false} />
    </div>
  );
}
