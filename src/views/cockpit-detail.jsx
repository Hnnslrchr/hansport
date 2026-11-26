// Detailansicht des Cockpits (Runde 8): dieselben Abschnitte wie kompakt, nur tiefer.
// Wird erst beim Umschalten gezeichnet; alle Werte kommen aus denselben Rechnungen wie die Kompaktansicht.
import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { Ico } from '../ui/hp.jsx';
import { DevBar } from '../ui/r5.jsx';
import { StageBars, BandLine, RangeBars, ShareBars, GoalCols, PmcChart, WeightChart, Bullet } from '../ui/ck-charts.jsx';
import { push } from '../nav.js';
import { M, latest, series } from '../metrics.js';
import { addDays } from '../analysis.js';
import { loadRatio } from '../coach-logic.js';
import { hmm } from '../viz-data.js';
import { km, hm as hmFmt, int, num, dayMon, NB } from '../format.js';
import { n0, n1, sgn0, durHM, durU, minClock, mean, trendOf, healthView, nightsOf, bbRange, stressShare, colsOf, avgOf, weightInfo } from './ck-data.js';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const FCOL = { hrv: 'var(--c-erh)', sleep: 'var(--c-sch)', rhr: 'var(--c-herz)', load: 'var(--c-akt)', bb: 'var(--c2-erh)' };
const FORDER = ['hrv', 'sleep', 'rhr', 'load', 'bb'];

// ---------- 1. Hauptkarte Morgen: Faktoren der Tagesform ----------
export function FactorBars({ R }) {
  const parts = FORDER.map((k) => R.parts.find((p) => p.k === k)).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div class="ck-fx">
      <div class="ck-fh"><span>Faktoren · Punkte</span><span class="dir"><span>← belastet</span><span>erholt →</span></span></div>
      {parts.map((p) => (
        <div class="ck-f">
          <div class="r1"><span class="sw" style={{ background: FCOL[p.k] }} /><b>{p.label}</b><span class="w">{n0(p.w * 100)}{NB}%</span><span class="pts">{n0(p.pts)}</span></div>
          <div class="r2"><span class="v">{p.val} · {p.base}</span><DevBar dev={p.dev} color={FCOL[p.k]} label={p.label + ': ' + n0(p.pts) + ' Punkte, ' + (p.dev < -0.05 ? 'belastet' : p.dev > 0.05 ? 'erholt' : 'wie üblich')} /></div>
        </div>
      ))}
      {R.missing.length ? <p class="ck-line s">Fehlt: {R.missing.join(', ')}. Die Gewichte sind auf die übrigen Faktoren verteilt.</p> : null}
    </div>
  );
}

// Ein Satz zur Ernährung des Tages
export function nutriLine(N, evening) {
  if (evening) {
    const after = N.tips.find((t) => t.when === 'danach');
    return after ? after.text : 'Kohlenhydrate und Eiweiß zum Abendessen, ausreichend trinken.';
  }
  if (N.total) return 'Energiebedarf heute ca. ' + int(N.total) + ' kcal' + (N.partial ? ' (bisher)' : '') + ': Grundumsatz ' + int(N.bmr.v) + ' plus Aktivität ' + int(N.act) + '.';
  const t = N.tips.find((x) => x.when === 'vorher');
  return t ? t.text : 'Für den Energiebedarf fehlen Grundumsatz und Aktivität von Garmin.';
}

// ---------- 2. Hauptkarte Abend: Belastung gegen den Schnitt der letzten 4 Wochen ----------
export function LoadCompare({ ds, H, day }) {
  const lr = loadRatio(H, day);
  if (!lr || lr.chronic == null) return null;
  const L = ds.load || 0, c = lr.chronic;
  const top = Math.max(L, c) * 1.1 || 1;
  const pct = (v) => Math.max(1.5, (v / top) * 100);
  const diff = c > 0 ? Math.round(((L - c) / c) * 100) : null;
  const ratio = c > 0 ? L / c : null;
  return (
    <div class="ck-cmp" role="img" aria-label={'Belastung heute ' + n0(L) + ', Durchschnitt der letzten 4 Wochen ' + n0(c) + ' pro Tag'}>
      <div class="row"><span class="l">Heute</span><span class="bar"><i style={{ width: pct(L) + '%' }} /></span><b>{n0(L)}</b></div>
      <div class="row ctx"><span class="l">Ø 4 Wochen</span><span class="bar"><i style={{ width: pct(c) + '%' }} /></span><b>{n0(c)}</b></div>
      {diff != null ? <p class="ck-line s">{L === 0 ? 'Ohne Training heute.' : ratio >= 2 ? num(ratio, 1) + '-mal so viel wie an einem üblichen Tag.' : diff > 5 ? diff + ' % über deinem Tagesschnitt.' : diff < -5 ? Math.abs(diff) + ' % unter deinem Tagesschnitt.' : 'Etwa so viel wie an einem üblichen Tag.'}</p> : null}
    </div>
  );
}

// ---------- 2b. Heute Nacht: Schlafschuld und Zubettgehzeiten der letzten 7 Tage ----------
export function NightExtra({ p }) {
  const dots = p.bedDots.filter((x) => x.v != null);
  return (
    <Fragment>
      {p.debt ? (
        <div class="ck-kv"><span>Schlafschuld</span><b>{p.debt.v > 0 ? hmm(p.debt.v) + NB + 'h' : '0'}</b><em>{p.debt.n === 3 ? 'letzte 3 Nächte' : p.debt.n + ' Nächte'}{p.debt.own ? ', aus Bedarf und Dauer' : ', laut Garmin'}</em></div>
      ) : null}
      {dots.length >= 2 ? <BedDots items={p.bedDots} target={p.bed} /> : <p class="ck-line s">Für die Zubettgehzeiten der letzten Tage fehlen Schlafdaten.</p>}
    </Fragment>
  );
}

function BedDots({ items, target }) {
  const vs = items.map((x) => (x.v == null ? null : x.v >= 720 ? x.v - 1440 : x.v)); // nach Mitternacht: negativ weiterzählen
  const ok = vs.filter((v) => v != null);
  const lo = Math.min(...ok, target != null ? (target >= 720 ? target - 1440 : target) : Infinity) - 20;
  const hi = Math.max(...ok, target != null ? (target >= 720 ? target - 1440 : target) : -Infinity) + 20;
  const Y = (v) => 6 + (1 - (v - lo) / (hi - lo || 1)) * 36;
  const X = (i) => 4 + (i / 6) * 92;
  const t = target != null ? (target >= 720 ? target - 1440 : target) : null;
  return (
    <div class="ck-dots">
      <svg viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label={'Zubettgehzeiten der letzten 7 Tage: ' + items.map((x) => WD[(new Date(x.date + 'T12:00:00').getDay() + 6) % 7] + ' ' + (x.v == null ? 'keine Daten' : minClock(x.v))).join(', ')}>
        {t != null ? <line x1="0" x2="100" y1={Y(t)} y2={Y(t)} class="z" /> : null}
        {vs.map((v, i) => (v == null ? null : <line x1={X(i)} x2={X(i)} y1={Y(v)} y2={Y(v)} class={'d' + (i === 6 ? ' on' : '')} />))}
      </svg>
      <div class="ax" aria-hidden="true">{items.map((x, i) => <span class={i === 6 ? 'on' : ''}>{WD[(new Date(x.date + 'T12:00:00').getDay() + 6) % 7]}</span>)}</div>
      <p class="ck-line s">{'Zuletzt ' + (vs[6] != null ? 'um ' + minClock(items[6].v) : 'keine Daten') + (ok.length >= 3 ? ', im Schnitt ' + minClock(mean(ok) < 0 ? mean(ok) + 1440 : mean(ok)) : '') + (t != null ? ' · Linie: Zielzeit' : '') + '.'}</p>
    </div>
  );
}

// ---------- 3. Gesundheit: je Kennzahl eine Karte mit der passenden Darstellung ----------
// Kopf: Name und Einordnung. Darunter der Wert und die Veränderung zum Schnitt der letzten
// 28 Tage – so steht die Entwicklung neben der Zahl. Dann das Diagramm, dann die beiden Mittel.
export function HealthRow({ x, day, H }) {
  // Beim Schlaf ist die Dauer die Kernzahl; der Score steht als Einordnung daneben
  if (x.k === 'slScore' && x.r && (x.r.slMin != null || (x.r.sl && x.r.sl.total != null))) {
    const tot = x.r.sl && x.r.sl.total != null ? x.r.sl.total : x.r.slMin;
    x = { ...x, k: 'sleep', v: tot, score: x.v };
  }
  const v = healthView(x, day);
  if (x.score != null) v.note = 'Score ' + x.score + ' · ' + (x.score >= 90 ? 'sehr gut' : x.score >= 80 ? 'gut' : x.score >= 60 ? 'solide' : 'schwach');
  if (v.stale) v.note = healthView(x, day).note;
  const k = x.k;
  const t = useMemo(() => trendOf(H, x.date, k === 'sleep' ? 'sleep' : k), [H, x.date, k]);
  const avg7 = t.vals.length ? mean(t.vals) : null;
  const d28 = t.avg != null && x.v != null ? x.v - t.avg : null;
  const eps = k === 'weight' || k === 'resp' ? 0.05 : k === 'sleep' ? 2 : 0.5;
  const flat = d28 != null && Math.abs(d28) < eps;
  const better = M[k] && M[k].better;
  const up = d28 != null && d28 > 0;
  const good = d28 == null || flat || !better ? null : better === 'up' ? up : !up;
  const f = (q) => (q == null ? '–' : k === 'sleep' ? hmm(q) : M[k].fmt(q));
  const fd = (q) => (k === 'sleep' ? hmm(Math.abs(q)) : k === 'weight' || k === 'resp' ? num(Math.abs(q), 1) : num(Math.abs(q), 0));
  const chart = useMemo(() => bodyChart(k, H, x, day, v), [k, H, x.date, day]);
  return (
    <button type="button" class={'ck-hrow glow ' + v.grp} onClick={() => push('metric', { k: v.mk })}
      aria-label={v.name + ' ' + v.val + ' ' + v.unit + (v.note ? ', ' + v.note : '') + (d28 != null && !flat ? ', ' + fd(d28) + (up ? ' über' : ' unter') + ' dem Schnitt der letzten 28 Tage' : '') + ', Details'}>
      <span class="ck-hh"><Ico n={v.icon} />{v.name}{v.note ? <span class={'st' + (v.stale ? ' warn' : '')}>{v.note}</span> : null}</span>
      <span class="ck-hv">
        <b>{v.val}{v.unit ? <small>{v.unit}</small> : null}</b>
        {d28 == null ? null : <span class="d">{flat ? 'wie Ø 28 Tage' : <Fragment><i class={up ? 'up' : 'dn'} />{fd(d28)}{v.unit ? NB + v.unit : ''} zu Ø 28 Tage</Fragment>}</span>}
      </span>
      {chart}
      <span class="ck-hf">{avg7 != null ? <span>Ø 7 Tage {f(avg7)}{v.unit ? NB + v.unit : ''}</span> : null}{t.avg != null ? <span>Ø 28 Tage {f(t.avg)}{v.unit ? NB + v.unit : ''}</span> : null}</span>
    </button>
  );
}

// Diagrammform je Kennzahl
function bodyChart(k, H, x, day, v) {
  const end = x.date;
  if (k === 'slScore' || k === 'sleep') {
    const nights = nightsOf(H, end, 7);
    const need = (x.r && x.r.need) || null;
    return <StageBars nights={nights} need={need} label={'Schlafphasen der letzten 7 Nächte, zuletzt ' + hmm(nights[nights.length - 1].total || 0) + ' Stunden'} />;
  }
  if (k === 'bb') return <RangeBars items={bbRange(H, end, 7)} label="Body Battery der letzten 7 Tage, je Tag von Tief bis Hoch mit dem Wert beim Aufwachen" />;
  if (k === 'stress') {
    const items = stressShare(H, end, 7);
    if (items.some((i) => i.parts)) return <ShareBars items={items} label="Anteil der Stressstufen je Tag der letzten 7 Tage" />;
  }
  if (k === 'steps' || k === 'akcal' || k === 'stress') {
    const items = colsOf(H, end, k, 7);
    const goal = k === 'steps' ? (x.r && x.r.g && x.r.g.stepsGoal) || null : null;
    return <GoalCols items={items} goal={goal} avg={goal ? null : avgOf(H, end, k, 28)} fmt={(q) => M[k].fmt(q)} label={M[k].label + ' der letzten 7 Tage'} />;
  }
  const n = k === 'vo2' ? 28 : 14;
  return <BandLine pts={colsOf(H, end, k, n)} band={t0Band(H, end, k)} fmt={(q) => M[k].fmt(q)} unit={v.unit} label={M[k].label + ' der letzten ' + n + ' Tage' + (t0Band(H, end, k) ? ' mit deinem Normalbereich' : '')} />;
}
const t0Band = (H, end, k) => { const l = latest(H.list, k, end); return l && M[k].normal ? M[k].normal(l.r) : null; };

// ---------- 4. Training: Form, Woche, Intensität ----------
export function FormCard({ H, day }) {
  const pts = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) { const dd = addDays(day, -i); const r = H.map[dd] || {}; out.push({ date: dd, ctl: r.ctl != null ? r.ctl : null, atl: r.atl != null ? r.atl : null, tsb: r.tsb != null ? r.tsb : null }); }
    return out;
  }, [H, day]);
  const f = latest(H.list, 'tsb', day);
  if (!f) return null;
  const r = f.r;
  const was = H.map[addDays(day, -7)] || {};
  const dC = was.ctl != null && r.ctl != null ? r.ctl - was.ctl : null;
  const dF = was.tsb != null && r.tsb != null ? r.tsb - was.tsb : null;
  return (
    <button type="button" class="ck-card wide glow g-trn" onClick={() => push('metric', { k: 'tsb' })} aria-label={'Form ' + sgn0(r.tsb) + ', Fitness ' + n1(r.ctl) + ', Ermüdung ' + n1(r.atl) + ', Verlauf 14 Tage, Details'}>
      <span class="ck-tn">Belastung · 14 Tage</span>
      <span class="ck-row3">
        <span><b>{sgn0(r.tsb)}</b><em>Form{dF != null ? ' · ' + sgn0(dF) + ' zur Vorwoche' : ''}</em></span>
        <span><b>{n0(r.ctl)}</b><em>Fitness{dC != null ? ' · ' + sgn0(dC) : ''}</em></span>
        <span><b>{n0(r.atl)}</b><em>Ermüdung</em></span>
      </span>
      <PmcChart pts={pts} label={'Fitness, Ermüdung und Form der letzten 14 Tage; heute Form ' + sgn0(r.tsb)} />
      <span class="ck-sub">{formSay(r.tsb, dF)}</span>
    </button>
  );
}
function formSay(tsb, dF) {
  const w = tsb > 15 ? 'sehr frisch' : tsb > 5 ? 'frisch' : tsb >= -10 ? 'neutral' : tsb >= -30 ? 'produktiv ermüdet' : 'sehr hohe Belastung';
  if (dF == null) return 'Form ' + w + '.';
  return 'Form ' + w + ', ' + (dF > 2 ? 'erholter als vor einer Woche' : dF < -2 ? 'belasteter als vor einer Woche' : 'wie vor einer Woche') + '.';
}

export function WeekCard({ w }) {
  const avgDay = w.avg ? w.avg.time / 7 / 60 : null;
  const items = w.days.map((d) => ({ date: d.date, v: d.v }));
  const prev = w.prevDays || null;
  const dT = w.avg ? w.A.time - w.avg.time : null;
  return (
    <button type="button" class="ck-card wide glow g-akt" onClick={() => push('reviews')} aria-label={'Diese Woche ' + durHM(w.A.time) + ' ' + durU(w.A.time) + ', zu den Rückblicken'}>
      <span class="ck-tn">Diese Woche · Mo–So</span>
      <span class="ck-row3 one"><span><b>{durHM(w.A.time)}<small>{durU(w.A.time)}</small></b><em>{w.avg ? 'Ø der 4 Wochen davor ' + durHM(w.avg.time) + NB + durU(w.avg.time) + (dT != null ? ' · ' + (dT >= 0 ? '+' : '−') + durHM(Math.abs(dT)) + NB + durU(Math.abs(dT)) : '') : 'noch kein Schnitt'}</em></span></span>
      <GoalCols items={items} prev={prev} avg={avgDay && avgDay > 0 ? avgDay : null} fmt={(v) => hmm(v)} label="Trainingszeit je Tag dieser Woche im Vergleich zur Vorwoche" />
      <span class="ck-row3 sm">
        <span><b>{km(w.A.dist)}<small>km</small></b><em>{w.avg ? 'Ø ' + km(w.avg.dist) + NB + 'km' : '–'}</em></span>
        <span><b>{hmFmt(w.A.gain)}<small>Hm</small></b><em>{w.avg ? 'Ø ' + hmFmt(w.avg.gain) + NB + 'Hm' : '–'}</em></span>
        <span><b>{w.A.count}<small>×</small></b><em>{w.avg ? 'Ø ' + num(w.avg.count, 1) + '×' : '–'}</em></span>
      </span>
    </button>
  );
}

export function ZoneCard({ week }) {
  const withZ = week.filter((a) => Array.isArray(a.hrz) && a.hrz.some((v) => v > 0));
  if (!withZ.length) return null;
  const z = [0, 0, 0, 0, 0];
  for (const a of withZ) a.hrz.slice(0, 5).forEach((v, i) => { z[i] += v || 0; });
  const tot = z.reduce((a, b) => a + b, 0);
  if (!tot) return null;
  const p = z.map((v) => (v / tot) * 100);
  const easy = p[0] + p[1], mid = p[2], hard = p[3] + p[4];
  return (
    <section class="ck-card wide glow g-herz" aria-label="Intensität der Woche nach Pulszonen">
      <span class="ck-tn"><Ico n="heart" />Intensität der Woche</span>
      <div class="int-b" role="img" aria-label={'Zeit in Pulszonen: ' + p.map((v, i) => 'Zone ' + (i + 1) + ' ' + Math.round(v) + ' Prozent').join(', ')}>
        {p.map((v, i) => (v > 0 ? <span style={{ width: v + '%', background: 'var(--z' + (i + 1) + ')' }} /> : null))}
      </div>
      <div class="int-ax">{p.map((v, i) => <span><b>Z{i + 1}</b> {Math.round(v)}{NB}%</span>)}</div>
      <span class="ck-row3 sm">
        <span><b>{Math.round(easy)}<small>%</small></b><em>locker · Z1–2</em></span>
        <span><b>{Math.round(mid)}<small>%</small></b><em>mittel · Z3</em></span>
        <span><b>{Math.round(hard)}<small>%</small></b><em>intensiv · Z4–5</em></span>
      </span>
      <p class="ck-line s">{hmm(tot)}{NB}h mit Puls aus {withZ.length} von {week.length} {week.length === 1 ? 'Einheit' : 'Einheiten'}, nach deinen Garmin-Pulszonen.</p>
    </section>
  );
}

// zweiter Satz, wenn die drei Zahlen schon über der Karte stehen
function nutriSecond(N) {
  const t = N.tips.find((x) => x.when === 'vorher');
  if (t) return t.text;
  return 'Verteile die Menge auf die Mahlzeiten, Eiweiß zu jeder, und trink genug.' + (N.partial ? ' Der Aktivanteil wächst noch über den Tag.' : '');
}

// ---------- 6. Nur im Detail: Ernährung, Dein Tag, Körper ----------
export function NutriCard({ N, evening, today }) {
  const has = N.bmr || N.act != null;
  return (
    <section class="ck-card glow g-akt" aria-label={evening ? 'Ernährung heute Abend' : 'Ernährung heute'}>
      <span class="ck-tn"><Ico n="cutlery" />{evening ? 'Ernährung heute Abend' : 'Ernährung heute'}</span>
      {has ? (
        <span class="ck-row3 sm">
          <span><b>{N.bmr ? int(N.bmr.v) : '–'}</b><em>Grundumsatz{N.bmr ? ' · ' + N.bmr.src : ''}</em></span>
          <span><b>{N.act != null ? int(N.act) : '–'}</b><em>Aktiv {N.partial ? 'bisher' : 'heute'}</em></span>
          <span><b>{N.total ? int(N.total) : '–'}</b><em>Bedarf · geschätzt</em></span>
        </span>
      ) : null}
      <p class="ck-line s">{has && !evening ? nutriSecond(N) : nutriLine(N, evening)}</p>
      {N.tips.length && N.sess ? (
        <ul class="ck-tips">{N.tips.map((t) => <li><b>{t.when}:</b> {t.text}</li>)}</ul>
      ) : null}
      <p class="ck-line s">Richtwerte aus der Sporternährung – Schätzungen, keine Diätberatung.</p>
    </section>
  );
}

// „Dein Tag“: Schlaf und Einheiten auf einer Leiste von 0 bis 24 Uhr
export function DayTimeline({ ds, H, day, now }) {
  const r = H.map[day] || {};
  const blocks = [];
  const end = r.sl && r.sl.end ? toM(r.sl.end) : null;
  if (end != null) blocks.push({ k: 'sleep', from: 0, to: end, t: 'Schlaf bis ' + r.sl.end });
  for (const a of ds.acts) {
    const s = String(a.start || '').slice(11, 16);
    const m = toM(s);
    if (m == null) continue;
    blocks.push({ k: 'act', from: m, to: Math.min(1440, m + Math.round((a.mov || 0) / 60)), t: a.name + ' ' + s });
  }
  const p = sleepBed(H, day);
  if (p != null && p > 720) blocks.push({ k: 'bed', from: p, to: 1440, t: 'Zubettgehen ' + minClock(p) });
  if (!blocks.length) return null;
  const nowM = now ? now.getHours() * 60 + now.getMinutes() : null;
  return (
    <section class="ck-card" aria-label="Dein Tag">
      <span class="ck-tn"><Ico n="clock" />Dein Tag</span>
      <div class="ck-tl" role="img" aria-label={'Tagesleiste: ' + blocks.map((b) => b.t).join(', ')}>
        {blocks.map((b) => <span class={'b ' + b.k} style={{ left: (b.from / 1440) * 100 + '%', width: Math.max(1, ((b.to - b.from) / 1440) * 100) + '%' }} />)}
        {nowM != null ? <span class="now" style={{ left: (nowM / 1440) * 100 + '%' }} /> : null}
      </div>
      <div class="ck-tlax" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      <ul class="ck-tll">{blocks.map((b) => <li><i class={b.k} />{b.t}</li>)}</ul>
    </section>
  );
}
const toM = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const sleepBed = (H, day) => { const r = H.map[day] || {}; return r.sl && r.sl.start ? toM(r.sl.start) : null; };

// Körper: aktuelles Gewicht, Trend, Fortschritt zum Ziel und Prognose
export function BodyCard({ H, day }) {
  const w = useMemo(() => weightInfo(H, day, 90), [H, day]);
  if (!w || !w.last || (new Date(day) - new Date(w.last.date)) / 864e5 > 60) return null;
  const since = w.prev ? w.last.v - w.prev.v : null;
  const age = Math.round((new Date(day + 'T12:00:00') - new Date(w.last.date + 'T12:00:00')) / 864e5);
  const when = age === 0 ? 'heute' : age === 1 ? 'gestern' : 'vor ' + age + ' Tagen';
  const eta = w.eta ? w.eta.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : null;
  return (
    <Fragment>
      <div class="ck-sec"><h2>Körper</h2></div>
      <section class="ck-card glow g-kor" aria-label="Gewicht und Körperfett">
        <span class="ck-tn"><Ico n="weight" />Gewicht</span>
        <div class="ck-wv">
          <b>{n1(w.last.v)}<small>kg</small></b>
          <div class="s">
            <span>{when}{since != null ? (since > 0 ? ' · +' : ' · −') + n1(Math.abs(since)) + ' kg zur Messung davor' : ''}</span>
            {w.tNow != null ? <span>Trend {n1(w.tNow)} kg{w.rate ? ' · ' + (w.rate > 0 ? '+' : '−') + n1(Math.abs(w.rate)) + ' kg/Woche' : ''}</span> : null}
          </div>
        </div>
        {w.goal != null ? <Bullet start={w.start.v} value={w.tNow != null ? w.tNow : w.last.v} goal={w.goal} startLabel={dayMon(w.start.date)} /> : null}
        <WeightChart pts={w.pts} trend={w.trend} goal={w.goal} from={dayMon(w.from.date)} label={'Gewicht seit ' + dayMon(w.from.date) + ' mit Trendlinie' + (w.goal != null ? ' und Ziellinie' : '')} />
        <p class="ck-line s">
          {w.d30 != null ? (Math.abs(w.d30) < 0.05 ? 'In 30 Tagen unverändert. ' : (w.d30 > 0 ? '+' : '−') + n1(Math.abs(w.d30)) + ' kg in 30 Tagen. ') : ''}
          {w.goal == null ? 'Ohne Zielgewicht zeigt die Karte nur den Trend; du kannst es in der Kennzahl Gewicht setzen.' : eta ? 'Bei diesem Tempo wäre das Ziel etwa im ' + eta + ' erreicht – eine Hochrechnung, kein Versprechen.' : w.rate && Math.abs(w.rate) >= 0.05 ? 'Der Trend zeigt gerade nicht zum Ziel.' : 'Das Gewicht steht gerade still.'}
        </p>
        {w.fat ? <div class="ck-wfat"><span>Körperfett</span><b>{n1(w.fat.v)}<small>%</small></b><em>{w.fatD != null && Math.abs(w.fatD) >= 0.05 ? (w.fatD > 0 ? '+' : '−') + n1(Math.abs(w.fatD)) + ' seit ' + dayMon(w.fatFrom.date) : 'seit ' + dayMon(w.fatFrom.date) + ' unverändert'}</em></div> : null}
        <p class="ck-line s">Gemessen mit der Withings-Waage. Tageswerte schwanken um 0,5–1 kg; der Trend ist der 7-Tage-Schnitt.</p>
      </section>
    </Fragment>
  );
}
