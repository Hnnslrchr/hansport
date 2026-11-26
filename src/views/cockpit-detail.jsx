// Detailansicht des Cockpits (Runde 8): dieselben Abschnitte wie kompakt, nur tiefer.
// Wird erst beim Umschalten gezeichnet; alle Werte kommen aus denselben Rechnungen wie die Kompaktansicht.
import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { Ico } from '../ui/hp.jsx';
import { DayBars, DevBar, MeasureLine } from '../ui/r5.jsx';
import { push } from '../nav.js';
import { M, latest, series } from '../metrics.js';
import { addDays } from '../analysis.js';
import { loadRatio } from '../coach-logic.js';
import { hmm } from '../viz-data.js';
import { km, hm as hmFmt, int, num, NB } from '../format.js';
import { n0, n1, sgn0, durHM, durU, minClock, mean, trendOf, healthView } from './ck-data.js';

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

// ---------- 3. Gesundheit: größere Kachel mit 7-Tage-Verlauf ----------
export function HealthTileBig({ x, day, H }) {
  const v = healthView(x, day);
  const t = useMemo(() => trendOf(H, x.date, x.k), [H, x.date, x.k]);
  let d28 = t.avg != null && x.v != null ? x.v - t.avg : null;
  const eps = x.k === 'weight' || x.k === 'resp' ? 0.05 : x.k === 'sleep' ? 1 : 0.5;
  const flat = d28 != null && Math.abs(d28) < eps;
  const better = M[x.k].better;
  const good = d28 == null || !better ? null : better === 'up' ? d28 > 0 : d28 < 0;
  if (flat) d28 = 0;
  const fmtD = x.k === 'sleep' ? (q) => hmm(Math.abs(q)) : x.k === 'weight' || x.k === 'resp' ? (q) => num(Math.abs(q), 1) : (q) => num(Math.abs(q), 0);
  return (
    <button type="button" class={'ck-tile big glow ' + v.grp} onClick={() => push('metric', { k: v.mk })}
      aria-label={v.name + ' ' + v.val + ' ' + v.unit + (v.note ? ', ' + v.note : '') + (d28 != null ? ', ' + (d28 > 0 ? 'über' : 'unter') + ' dem Schnitt der letzten 28 Tage' : '') + ', Details'}>
      <span class="ck-tn"><Ico n={v.icon} />{v.name}</span>
      <span class="ck-tv"><b>{v.val}{v.unit ? <small>{v.unit}</small> : null}</b>{v.note ? <em class={v.stale ? 'warn' : ''}>{v.note}</em> : null}</span>
      <MiniTrend pts={t.pts} band={t.band} k={x.k} />
      <span class="ck-sub">{d28 == null ? '7 Tage' : flat ? 'wie Ø 28 Tage' : (d28 > 0 ? '+' : '−') + fmtD(d28) + (v.unit ? NB + v.unit : '') + ' zu Ø 28 Tage'}{good != null && !flat ? <i class={good ? 'up' : 'dn'} aria-hidden="true" /> : null}</span>
    </button>
  );
}

// 7-Tage-Verlauf: Normalbereich als Band, Linie, letzter Wert als Punkt
function MiniTrend({ pts, band, k }) {
  const vals = pts.map((p) => p.v).filter((v) => v != null);
  if (!vals.length) return <span class="ck-mini empty" />;
  let lo = Math.min(...vals, band ? band[0] : Infinity), hi = Math.max(...vals, band ? band[1] : -Infinity);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
  const W = 100, Hh = 36;
  const X = (i) => 3 + (i / (pts.length - 1)) * (W - 6), Y = (v) => 4 + (1 - (v - lo) / (hi - lo)) * (Hh - 8);
  let dd = '', lastI = -2;
  pts.forEach((p, i) => { if (p.v == null) { lastI = -2; return; } dd += (lastI === i - 1 ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p.v).toFixed(1); lastI = i; });
  const li = pts.map((p, i) => (p.v != null ? i : -1)).filter((i) => i >= 0).pop();
  return (
    <svg class={'ck-mini ' + k} viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" aria-hidden="true">
      {band ? <rect x="0" y={Y(band[1])} width={W} height={Math.max(1.5, Y(band[0]) - Y(band[1]))} class="b" /> : null}
      <path d={dd} class="l" />
      <line x1={X(li)} x2={X(li)} y1={Y(pts[li].v)} y2={Y(pts[li].v)} class="p" />
    </svg>
  );
}

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
  return (
    <button type="button" class="ck-card wide glow g-trn" onClick={() => push('metric', { k: 'tsb' })} aria-label={'Form ' + sgn0(r.tsb) + ', Fitness ' + n1(r.ctl) + ', Ermüdung ' + n1(r.atl) + ', Verlauf 14 Tage, Details'}>
      <span class="ck-tn">Form · 14 Tage</span>
      <span class="ck-row3">
        <span><b>{sgn0(r.tsb)}</b><em>Form</em></span>
        <span><b>{n0(r.ctl)}</b><em>Fitness</em></span>
        <span><b>{n0(r.atl)}</b><em>Ermüdung</em></span>
      </span>
      <TriLine pts={pts} />
      <span class="ck-lg" aria-hidden="true"><i class="ctl" />Fitness<i class="atl" />Ermüdung<i class="tsb" />Form</span>
    </button>
  );
}

function TriLine({ pts }) {
  const all = [];
  for (const p of pts) for (const k of ['ctl', 'atl', 'tsb']) if (p[k] != null) all.push(p[k]);
  if (all.length < 4) return <span class="ck-tri empty" />;
  const lo = Math.min(0, ...all) - 2, hi = Math.max(0, ...all) + 2;
  const W = 100, Hh = 96;
  const X = (i) => 1 + (i / (pts.length - 1)) * (W - 2), Y = (v) => 4 + (1 - (v - lo) / (hi - lo)) * (Hh - 8);
  const path = (k) => { let dd = '', prev = -2; pts.forEach((p, i) => { if (p[k] == null) { prev = -2; return; } dd += (prev === i - 1 ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[k]).toFixed(1); prev = i; }); return dd; };
  return (
    <svg class="ck-tri" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" role="img" aria-label={'Verlauf der letzten 14 Tage von Fitness, Ermüdung und Form'}>
      <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} class="z" />
      <path d={path('ctl')} class="ctl" /><path d={path('atl')} class="atl" /><path d={path('tsb')} class="tsb" />
    </svg>
  );
}

export function WeekCard({ w }) {
  const avgDay = w.avg ? w.avg.time / 7 / 60 : null;
  return (
    <button type="button" class="ck-card wide glow g-akt" onClick={() => push('reviews')} aria-label={'Diese Woche ' + durHM(w.A.time) + ' ' + durU(w.A.time) + ', zu den Rückblicken'}>
      <span class="ck-tn">Diese Woche · Mo–So</span>
      <span class="ck-row3 one"><span><b>{durHM(w.A.time)}<small>{durU(w.A.time)}</small></b><em>{w.avg ? 'von Ø ' + durHM(w.avg.time) + NB + durU(w.avg.time) : 'noch kein Schnitt'}</em></span></span>
      <div class="ck-days7">
        <DayBars items={w.days} avg={avgDay && avgDay > 0 ? avgDay : null} avgLabel={avgDay ? 'Ø Tag ' + hmm(avgDay) : null} fmt={(v) => hmm(v)} topFmt={(v) => hmm(v)} unit="h" label="Trainingszeit je Tag dieser Woche" />
      </div>
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
      <p class="ck-line s">{N.kg ? 'Gewicht ' + n1(N.kg) + ' kg' : 'Kein Gewicht'}{N.trend ? (Math.abs(N.trend.d) < 0.05 ? ', 6 Wochen unverändert' : ', 6 Wochen ' + (N.trend.d > 0 ? '+' : '−') + n1(Math.abs(N.trend.d)) + ' kg') : ''}{N.goal ? ', Ziel ' + n1(N.goal) + ' kg' : ''}. Richtwerte aus der Sporternährung – Schätzungen, keine Diätberatung.</p>
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

// Körper: Gewicht und Körperfett mit 30-Tage-Verlauf
export function BodyCard({ H, day }) {
  const w = latest(H.list, 'weight', day);
  const f = latest(H.list, 'fatPct', day);
  const pts = series(H.map, 'weight', day, 31).map((p) => ({ date: p.date, v: p.v }));
  const have = pts.filter((p) => p.v != null);
  if (!w || (new Date(day) - new Date(w.date)) / 864e5 > 60) return null;
  const d30 = have.length >= 2 ? have[have.length - 1].v - have[0].v : null;
  const fs = f ? series(H.map, 'fatPct', day, 31).map((p) => p.v).filter((v) => v != null) : [];
  const fd = fs.length >= 2 ? fs[fs.length - 1] - fs[0] : null;
  return (
    <Fragment>
      <div class="ck-sec"><h2>Körper</h2></div>
      <section class="ck-card glow g-kor" aria-label="Körper">
        <span class="ck-row3">
          <span><b>{n1(w.v)}<small>kg</small></b><em>{d30 != null ? (d30 > 0 ? '+' : '−') + n1(Math.abs(d30)) + ' kg in 30 Tagen' : 'Gewicht'}</em></span>
          {f ? <span><b>{n1(f.v)}<small>%</small></b><em>{fd != null ? 'Körperfett ' + (fd > 0 ? '+' : '−') + n1(Math.abs(fd)) : 'Körperfett'}</em></span> : null}
        </span>
        {have.length >= 2 ? <MeasureLine pts={pts} step={1} from={addDays(day, -30)} to={day} trend label={'Gewicht der letzten 30 Tage, zuletzt ' + n1(w.v) + ' kg'} height={112} /> : <p class="ck-line s">Für einen Verlauf fehlen Messungen der letzten 30 Tage.</p>}
        <p class="ck-line s">Gemessen mit der Withings-Waage, zuletzt {new Date(w.date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }).replace(/\.$/, '')}. Tageswerte schwanken, aussagekräftig ist der Trend.</p>
      </section>
    </Fragment>
  );
}
