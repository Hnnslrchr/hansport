// Detailgraphen: Puls, Schlaf, Körper (Gewicht & Co.) – Bausteine für die Detailansichten.
import { h, Fragment } from 'preact';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { Ico } from '../ui/hp.jsx';
import { TimeChart, Band, RefLine, NoDataSpan, Line, Area, Points, MinMax, Bars, Stack, Ranges, Headline, Legend, Table, Seg2, RangeScale, Hypnogram, STAGES, clockOfMinute } from '../ui/viz.jsx';
import { PERIODS, windowOf, timeTicks, daily, weekly, stats, rolling, niceTicks, hmm, nightMin, tOf, addD, dShort, dWeek, dYear, DAY } from '../viz-data.js';
import { getState, setDoc } from '../store.js';
import { num } from '../format.js';
import { WEB } from '../env.js';

export const n0 = (v) => num(v, 0);
export const n1 = (v) => num(v, 1);
export const sign = (d, f = n1) => (d > 0 ? '+' : d < 0 ? '−' : '±') + f(Math.abs(d));
export const PER_OPTS = (dis = []) => Object.entries(PERIODS).map(([k, p]) => [k, p.short === 'T' ? 'T' : p.short, dis.includes(k)]);
export const perName = { d: 'Tag', w: 'Woche', m: '30 Tage', h: '6 Monate', y: 'Jahr' };

// x-Domäne je Zeitraum; Wochenbündel bei 6 Monaten / Jahr
export function xDomain(p, W) {
  if (PERIODS[p].bucket === 'week') {
    const f = new Date(tOf(W.from)); const wd = (f.getUTCDay() + 6) % 7;
    return { min: tOf(W.from) - wd * DAY, max: tOf(W.to) + DAY, ticks: timeTicks(p, W.from, W.to) };
  }
  return { min: tOf(W.from) - DAY / 2, max: tOf(W.to) + DAY / 2, ticks: timeTicks(p, W.from, W.to) };
}
export const rangeText = (W) => (W.from.slice(0, 4) !== W.to.slice(0, 4) ? dYear(W.from) + ' – ' + dYear(W.to) : dShort(W.from) + ' – ' + dShort(W.to));

// ============================== Puls ==============================
export function PulseDetail({ H, end }) {
  const [p, setP] = useState('m');
  const [day, setDay] = useState(end);
  const [selA, setSelA] = useState(null);
  const [selB, setSelB] = useState(null);
  const [cmp, setCmp] = useState(false);
  const W = windowOf(p, end);
  const wk = PERIODS[p].bucket === 'week';
  const x = xDomain(p, W);
  const change = (v) => { setP(v); setSelA(null); setSelB(null); };

  const rhrAll = useMemo(() => daily(H.list, (r) => r.rhr, '0000', end), [H, end]);
  const spanAll = useMemo(() => daily(H.list, (r) => (r.g && r.g.hrMax != null ? r.g.hrMax : null), '0000', end).map((q) => ({ ...q, lo: q.r.g.hrMin, hi: q.r.g.hrMax, avg: q.r.g.hrAvg, rhr: q.r.rhr, partial: q.r.g.partial })), [H, end]);
  const baseRow = [...H.list].reverse().find((r) => r.date <= end && r.base && r.base.rhr);
  const band = baseRow ? [baseRow.base.rhr[0] - baseRow.base.rhr[1], baseRow.base.rhr[0] + baseRow.base.rhr[1]] : null;
  const firstData = rhrAll.length ? rhrAll[0].date : null;

  if (p === 'd') {
    const r = H.map[day] || {};
    const g = r.g || {};
    const days = rhrAll.map((q) => q.date);
    const i = days.indexOf(day);
    return (
      <div class="g-herz">
        <Seg2 value={p} onChange={change} label="Zeitraum" options={PER_OPTS()} />
        <Headline label={'Ruhepuls · ' + dWeek(day)} value={r.rhr} unit="bpm" fmt={n0} sub={g.partial ? 'Tag noch nicht abgeschlossen – Werte bis zum letzten Abgleich.' : 'Quelle: Garmin'} />
        <div class="t2" style="padding:14px 12px 10px">
          <div class="lbl2" style="margin:0 4px">Tagesspanne Herzfrequenz</div>
          {g.hrMax != null ? (
            <RangeScale min={30} max={200} lo={g.hrMin} hi={g.hrMax} unit="bpm" ticks={['30', '65', '100', '135', '170', '200 bpm']}
              markers={[{ v: r.rhr }, { v: g.hrAvg, hollow: true }].filter((m) => m.v != null)}
              stats={[{ label: 'min', v: g.hrMin }, { label: 'Ruhe', v: r.rhr, sym: true }, { label: 'Ø', v: g.hrAvg, sym: true, hollow: true }, { label: 'max', v: g.hrMax }]} />
          ) : <div class="empty2">Für diesen Tag liegen keine Garmin-Tageswerte vor. Wähle einen anderen Tag oder gleiche auf „Heute“ ab.</div>}
          <div class="nav2">
            <button type="button" aria-label="Tag davor" disabled={i <= 0} onClick={() => setDay(days[i - 1])}><Ico n="nav-arrow-left" /></button>
            <span class="sub2">{dWeek(day)}</span>
            <button type="button" aria-label="Tag danach" disabled={i < 0 || i >= days.length - 1} onClick={() => setDay(days[i + 1])}><Ico n="nav-arrow-right" /></button>
          </div>
        </div>
        <p class="say2">
          {g.hrMax != null ? <Fragment>Puls zwischen <b>{g.hrMin}</b> und <b>{g.hrMax} bpm</b>, im Mittel {g.hrAvg} bpm. Ruhepuls {r.rhr} bpm{band ? (r.rhr > band[1] ? ', über deinem Normalbereich.' : r.rhr < band[0] ? ', unter deinem Normalbereich.' : ', im Normalbereich.') : '.'} </Fragment> : null}
          {WEB ? 'Einen Verlauf über den ganzen Tag lädt hansport nicht, nur diese Tageswerte. Den Pulsverlauf einer Aktivität zeigt deren Detailseite.' : 'Einen Verlauf über den ganzen Tag liefert athletedata nicht, nur diese Tageswerte. Den Pulsverlauf einer Aktivität zeigt deren Detailseite (Strava).'}
        </p>
      </div>
    );
  }

  // --- Graph A: Tagesspanne min–max mit Ruhepuls ---
  let spans = spanAll.filter((q) => q.date >= W.from && q.date <= W.to);
  if (wk) spans = weekly(spans.map((q) => ({ ...q, v: q.hi }))).map((b) => ({ t: b.t, date: b.date, to: b.to, lo: Math.min(...b.ps.map((q) => q.lo)), hi: Math.max(...b.ps.map((q) => q.hi)), rhr: avgOf(b.ps.map((q) => q.rhr)), avg: avgOf(b.ps.map((q) => q.avg)), n: b.n }));
  const yA = niceTicks(30, Math.max(120, ...spans.map((q) => q.hi)), 4, true);
  // fehlende Tiefstwerte nicht mitrechnen (sonst „NaN“); ohne Werte „keine Daten“
  const los = spans.map((q) => q.lo).filter((v) => v != null && isFinite(v)), his = spans.map((q) => q.hi).filter((v) => v != null && isFinite(v));
  const lo = los.length ? Math.min(...los) : null, hi = his.length ? Math.max(...his) : null;
  const firstSpan = spanAll.length ? spanAll[0].date : null;

  // --- Graph B: Ruhepuls eng skaliert ---
  let pts = rhrAll.filter((q) => q.date >= W.from && q.date <= W.to);
  const trend = wk ? null : rolling(rhrAll.filter((q) => q.date >= addD(W.from, -7) && q.date <= W.to), 7, 3).filter((q) => q.v == null || q.date >= W.from);
  if (wk) pts = weekly(pts).map((b) => ({ ...b, v: Math.round(b.v * 10) / 10 }));
  const prev = cmp ? rhrAll.filter((q) => q.date >= W.prevFrom && q.date <= W.prevTo).map((q) => ({ ...q, t: q.t + W.n * DAY })) : [];
  const prevPts = cmp && wk ? weekly(prev) : prev;
  const st = stats(pts);
  const vals = pts.map((q) => q.v).concat(band || [], prevPts.map((q) => q.v));
  const yB = niceTicks(Math.floor(Math.min(...(vals.length ? vals : [40])) - 1), Math.ceil(Math.max(...(vals.length ? vals : [50])) + 1), 4, true);
  const trendAt = (t) => { const q = trend && trend.find((z) => z.t === t); return q ? q.v : null; };

  const say = sayRhr(pts, band, wk, W, rhrAll);
  return (
    <div class="g-herz">
      <Seg2 value={p} onChange={change} label="Zeitraum" options={PER_OPTS()} />
      {/* A */}
      <Headline label={selA ? (wk ? 'Woche ab ' + dShort(selA.date) : dWeek(selA.date)) : 'Herzfrequenz · ' + perName[p]} value={selA ? (selA.lo != null ? selA.lo : '–') + '–' + (selA.hi != null ? selA.hi : '–') : lo != null && hi != null ? lo + '–' + hi : hi != null ? 'bis ' + hi : 'keine Daten'} unit="bpm"
        sub={selA ? `Ruhepuls ${selA.rhr != null ? n0(selA.rhr) : '–'} · Ø ${selA.avg != null ? n0(selA.avg) : '–'} bpm${selA.partial ? ' · Tag läuft noch' : ''}` : rangeText(W) + ' · niedrigster bis höchster Puls je ' + (wk ? 'Woche' : 'Tag')} />
      <div class="t2" style="padding:8px 10px 6px">
        <TimeChart height={190} x={x} y={yA} unit="bpm" label="Herzfrequenz-Spanne je Tag" animKey={p + 'a'}
          snap={spans} sel={selA} onSel={setSelA} marks={(q) => [{ v: q.rhr, color: 'var(--c)' }]}
          layers={(s) => [
            firstSpan && firstSpan > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(firstSpan) - DAY / 2} text={'Daten ab ' + dShort(firstSpan)} /> : null,
            <Ranges s={s} data={spans} n={wk ? spans.length || 26 : W.n} />,
            <Points s={s} data={spans.map((q) => ({ t: q.t, v: q.rhr }))} color="var(--c)" r={wk ? 3 : 3.5} />,
          ]} />
      </div>
      <Legend items={[{ kind: 'bx', color: 'var(--neutral)', label: 'Spanne min–max' }, { kind: 'dt', color: 'var(--c)', label: 'Ruhepuls' }]} />

      {/* B */}
      <div style="height:18px" />
      <Headline label={selB ? (wk ? 'Woche ab ' + dShort(selB.date) : dWeek(selB.date)) : 'Ruhepuls · Ø ' + perName[p]} value={selB ? selB.v : st ? st.mean : 'keine Daten'} unit="bpm" fmt={wk || !selB ? n1 : n0}
        sub={selB ? (wk ? `${selB.n} Tage · ${n0(selB.lo)}–${n0(selB.hi)} bpm` : `7-Tage-Mittel ${trendAt(selB.t) != null ? n1(trendAt(selB.t)) : '–'} bpm` + (band ? (selB.v > band[1] ? ' · über Normalbereich' : selB.v < band[0] ? ' · unter Normalbereich' : ' · im Normalbereich') : '')) : rangeText(W) + (band ? ` · Normalbereich ${n0(band[0])}–${n0(band[1])}` : '')} />
      <div class="row2" style="margin:0 2px 8px">
        <button type="button" class="chip2" aria-pressed={String(cmp)} onClick={() => setCmp(!cmp)}><span class="k" style="opacity:.5" />{p === 'y' ? 'Vorjahr' : 'Vorzeitraum'}</button>
      </div>
      <div class="t2" style="padding:8px 10px 6px">
        {pts.length ? (
          <TimeChart height={200} x={x} y={yB} unit="bpm" label="Ruhepuls-Verlauf" animKey={p + 'b' + cmp}
            snap={pts} sel={selB} onSel={setSelB} marks={(q) => [{ v: q.v, color: 'var(--c)' }]}
            layers={(s) => [
              firstData && firstData > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(firstData) - DAY / 2} text={'Daten ab ' + dShort(firstData)} /> : null,
              band ? <Band s={s} lo={band[0]} hi={band[1]} /> : null,
              st ? <RefLine s={s} v={st.mean} label={'Ø ' + n1(st.mean)} side={firstData && firstData > W.from ? 'left' : 'right'} /> : null,
              cmp ? <Line s={s} data={prevPts} color="var(--ink-2)" width={1.5} opacity={0.45} /> : null,
              trend ? <Line s={s} data={trend} color="var(--ink)" width={1.5} opacity={0.7} /> : <Line s={s} data={pts} color="var(--c)" width={2} />,
              <Points s={s} data={pts} color="var(--c)" r={wk ? 3.5 : 3.5} />,
              st && pts.length > 2 ? <MinMax s={s} min={st.min} max={st.max} fmt={wk ? n1 : n0} /> : null,
            ]} />
        ) : <div class="empty2">Keine Ruhepuls-Werte in diesem Zeitraum. Wähle einen längeren Zeitraum.</div>}
      </div>
      <Legend items={[{ kind: 'dt', color: 'var(--c)', label: wk ? 'Wochenmittel' : 'Tageswert' }].concat(trend ? [{ color: 'var(--ink)', label: '7-Tage-Mittel (geglättet)' }] : [], band ? [{ kind: 'bx', color: 'color-mix(in oklab, var(--c) 22%, transparent)', label: 'Normalbereich (Mittel ± 1 SD)' }] : [], cmp ? [{ color: 'var(--ink-2)', label: p === 'y' ? 'Vorjahr' : 'Vorzeitraum' }] : [])} />
      {say ? <p class="say2">{say}</p> : null}
      <Table head={[wk ? 'Woche ab' : 'Tag', 'Ruhepuls', 'min', 'max', 'Ø']} rows={(wk ? spans : spans).map((q) => [wk ? dShort(q.date) : dWeek(q.date), q.rhr != null ? (wk ? n1(q.rhr) : q.rhr) : '–', q.lo, q.hi, q.avg != null ? n0(q.avg) : '–'])} />
    </div>
  );
}
export const avgOf = (vs) => { const a = vs.filter((v) => v != null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };

function sayRhr(pts, band, wk, W, all) {
  if (!pts.length) return null;
  const st = stats(pts);
  const parts = [];
  parts.push(`Im Mittel ${n1(st.mean)} bpm, ${wk ? 'Wochenmittel' : 'Tageswerte'} zwischen ${wk ? n1(st.min.v) : st.min.v} und ${wk ? n1(st.max.v) : st.max.v} bpm.`);
  if (band) {
    const inB = pts.filter((q) => q.v >= band[0] && q.v <= band[1]).length;
    parts.push(`${inB} von ${pts.length} ${wk ? 'Wochen' : 'Tagen'} im Normalbereich.`);
  }
  if (!wk) {
    const endT = tOf(W.to);
    const a = all.filter((q) => q.t > endT - 7 * DAY && q.t <= endT), b = all.filter((q) => q.t > endT - 14 * DAY && q.t <= endT - 7 * DAY);
    if (a.length >= 4 && b.length >= 4) {
      const d = avgOf(a.map((q) => q.v)) - avgOf(b.map((q) => q.v));
      parts.push(Math.abs(d) < 1 ? 'Die letzten 7 Tage praktisch gleich wie die 7 davor.' : `Die letzten 7 Tage ${d > 0 ? 'höher' : 'niedriger'} als die 7 davor (${sign(d)} bpm).` + (d >= 3 ? ' Bleibt er erhöht, kann das auf Ermüdung oder einen Infekt hindeuten.' : ''));
    }
  }
  return parts.join(' ');
}

// ============================== Schlaf ==============================
// Ohne zeitlichen Verlauf (Garmin Personal API liefert nur Summen je Phase): Anteile der Nacht als ein Balken
function PhaseBar({ sl }) {
  const parts = [['d', sl.deep], ['l', sl.light], ['r', sl.rem], ['a', sl.awake]].filter((p) => p[1] > 0);
  const tot = parts.reduce((t, p) => t + p[1], 0);
  if (!tot) return null;
  const name = (k) => (STAGES.find((s) => s.k === k) || {}).name || k;
  return (
    <div class="phbar">
      <div class="phbar-b" role="img" aria-label={'Anteile der Nacht: ' + parts.map((p) => name(p[0]) + ' ' + hmm(p[1]) + ' Stunden').join(', ')}>
        {parts.map((p) => <span style={{ width: (p[1] / tot) * 100 + '%', background: SL[p[0]] }} />)}
      </div>
      <div class="phbar-ax"><span>{sl.start || ''}</span><span>{sl.end || ''}</span></div>
      <p class="phbar-n">Garmin gibt über die Personal API für diese Nacht nur die Dauer je Phase heraus, nicht ihren zeitlichen Verlauf. Der Balken zeigt deshalb die Anteile, nicht die Reihenfolge.</p>
    </div>
  );
}

const SL = { d: 'var(--sl-d)', l: 'var(--sl-l)', r: 'var(--sl-r)', a: 'var(--sl-a)' };
export function SleepDetail({ H, end }) {
  const [p, setP] = useState('d');
  const nights = useMemo(() => H.list.filter((r) => r.sl && r.sl.total && r.date <= end), [H, end]);
  const [night, setNight] = useState(nights.length ? nights[nights.length - 1].date : null);
  const [sel, setSel] = useState(null);
  const [selT, setSelT] = useState(null);
  const change = (v) => { setP(v); setSel(null); setSelT(null); };
  const W = windowOf(p, end);
  const wk = PERIODS[p].bucket === 'week';
  const x = xDomain(p, W);
  const need = (nights.length && nights[nights.length - 1].need) || null;

  if (p === 'd') {
    const r = H.map[night] || {};
    const sl = r.sl || {};
    const i = nights.findIndex((q) => q.date === night);
    const tl = sl.tl;
    const inBed = (sl.total || 0) + (sl.awake || 0);
    const parts = [['d', sl.deep], ['l', sl.light], ['r', sl.rem], ['a', sl.awake]];
    const last30 = nights.filter((q) => q.date < night && q.date >= addD(night, -30) && q.sl.start);
    const avgStart = last30.length ? avgOf(last30.map((q) => nightMin(q.sl.start))) : null;
    const dStart = sl.start && avgStart != null ? nightMin(sl.start) - avgStart : null;
    const selStage = sel && sel.sg ? STAGES.find((s) => s.k === sel.sg[0]) : null;
    return (
      <div class="g-sch">
        <Seg2 value={p} onChange={change} label="Zeitraum" options={PER_OPTS()} />
        <Headline label={selStage ? selStage.name + ' · ' + clockOfMinute(tl.s0 + sel.sg[1]) + '–' + clockOfMinute(tl.s0 + sel.sg[2]) : 'Schlaf · Nacht auf ' + dWeek(night)}
          value={selStage ? hmm(sel.sg[2] - sel.sg[1]) : sl.total != null ? hmm(sl.total) : 'keine Daten'} unit="h"
          sub={selStage ? 'Uhrzeit ' + clockOfMinute(tl.s0 + sel.m) : `${sl.start || '–'}–${sl.end || '–'} · Score ${sl.score != null ? sl.score : '–'}${need ? ' · Bedarf ' + hmm(need) + ' h' : ''}`} />
        <div class="t2" style="padding:10px 10px 6px">
          {tl ? <Hypnogram tl={tl} sel={sel} onSel={setSel} label={'Schlafphasen der Nacht auf ' + dWeek(night)} />
            : WEB && sl.total ? <PhaseBar sl={sl} />
            : <div class="empty2">Den Phasenverlauf dieser Nacht holt der nächste Abgleich (Ziehen zum Aktualisieren).</div>}
          <div class="nav2">
            <button type="button" aria-label="Nacht davor" disabled={i <= 0} onClick={() => { setNight(nights[i - 1].date); setSel(null); }}><Ico n="nav-arrow-left" /></button>
            <span class="sub2">{r.night ? nightOfDe(r.night) : dWeek(night)}</span>
            <button type="button" aria-label="Nacht danach" disabled={i < 0 || i >= nights.length - 1} onClick={() => { setNight(nights[i + 1].date); setSel(null); }}><Ico n="nav-arrow-right" /></button>
          </div>
        </div>
        <div class="stg2">
          {parts.map(([k, v]) => (
            <Fragment>
              <i style={`background:${SL[k]}`} /><span>{STAGES.find((s) => s.k === k).name}</span><span class="v">{v != null ? hmm(v) + ' h' : '–'}</span><span class="p">{v != null && inBed ? Math.round((v / inBed) * 100) + ' %' : ''}</span>
            </Fragment>
          ))}
        </div>
        <p class="say2">{saySleepNight(sl, need, dStart, avgStart, last30.length)}</p>
      </div>
    );
  }

  // Woche/Monat: je Nacht; 6 Monate/Jahr: Wochenmittel
  let rows = nights.filter((q) => q.date >= W.from && q.date <= W.to).map((q) => ({ t: tOf(q.date), date: q.date, v: q.sl.total, d: q.sl.deep || 0, l: q.sl.light || 0, r: q.sl.rem || 0, a: q.sl.awake || 0, start: nightMin(q.sl.start), end: nightMin(q.sl.end), score: q.sl.score }));
  if (wk) rows = weekly(rows).map((b) => ({ t: b.t, date: b.date, to: b.to, n: b.n, v: b.v, d: avgOf(b.ps.map((q) => q.d)), l: avgOf(b.ps.map((q) => q.l)), r: avgOf(b.ps.map((q) => q.r)), a: avgOf(b.ps.map((q) => q.a)) }));
  const stacks = rows.map((q) => ({ t: q.t, parts: [{ v: q.d / 60, c: SL.d }, { v: q.l / 60, c: SL.l }, { v: q.r / 60, c: SL.r }] }));
  const maxH = Math.max(8, ...rows.map((q) => (q.d + q.l + q.r) / 60), need ? need / 60 : 0);
  const yS = niceTicks(0, maxH, 5, true);
  const st = stats(rows);
  const firstNight = nights.length ? nights[0].date : null;
  const below = need ? rows.filter((q) => q.v < need).length : null;

  // Schlafenszeiten (nur Woche/Monat)
  const times = wk ? [] : rows.filter((q) => q.start != null && q.end != null);
  const tS = avgOf(times.map((q) => q.start)), tE = avgOf(times.map((q) => q.end));
  const sd = times.length > 2 ? Math.sqrt(avgOf(times.map((q) => (q.start - tS) ** 2))) : null;
  const yT = times.length ? (() => { const a = Math.floor((Math.min(...times.map((q) => q.start)) - 30) / 120) * 120, b = Math.ceil((Math.max(...times.map((q) => q.end)) + 30) / 120) * 120; const tk = []; for (let v = a; v <= b; v += 120) tk.push(v); return { min: a, max: b, ticks: tk, reverse: true }; })() : null;

  return (
    <div class="g-sch">
      <Seg2 value={p} onChange={change} label="Zeitraum" options={PER_OPTS()} />
      <Headline label={sel ? (wk ? 'Woche ab ' + dShort(sel.date) + ' · Ø je Nacht' : 'Nacht auf ' + dWeek(sel.date)) : 'Schlaf · Ø je Nacht · ' + perName[p]}
        value={sel ? hmm(sel.v) : st ? hmm(st.mean) : 'keine Daten'} unit="h"
        sub={sel ? `Tief ${hmm(sel.d)} · Leicht ${hmm(sel.l)} · REM ${hmm(sel.r)} · Wach ${hmm(sel.a)}` : rangeText(W) + (st ? ` · ${st.n} ${st.n === 1 ? 'Nacht' : wk ? 'Wochen' : 'Nächte'} mit Daten` : '')} />
      <div class="t2" style="padding:8px 10px 6px">
        <TimeChart height={200} x={x} y={yS} unit="h" label="Schlafdauer nach Phasen" animKey={p + 's'}
          snap={rows} sel={sel} onSel={setSel}
          layers={(s) => [
            firstNight && firstNight > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(firstNight) - DAY / 2} text={'Daten ab ' + dShort(firstNight)} /> : null,
            <Stack s={s} data={stacks} n={wk ? 26 : W.n} />,
            need ? <RefLine s={s} v={need / 60} label={'Bedarf ' + hmm(need)} kind="goal" side="right" /> : null,
          ]} />
      </div>
      <Legend items={[{ kind: 'bx', color: SL.d, label: 'Tief' }, { kind: 'bx', color: SL.l, label: 'Leicht' }, { kind: 'bx', color: SL.r, label: 'REM' }].concat(need ? [{ kind: 'ds', label: 'Schlafbedarf (athletedata)' }] : [])} />
      <p class="say2">
        {st ? <Fragment>Im Mittel <b>{hmm(st.mean)} h</b> Schlaf {wk ? 'pro Nacht (Wochenmittel)' : 'pro Nacht'}{need && !wk ? <Fragment>; in <b>{below} von {rows.length}</b> Nächten unter deinem Bedarf von {hmm(need)} h</Fragment> : null}. Kürzeste {wk ? 'Woche' : 'Nacht'} {hmm(st.min.v)} h ({dShort(st.min.date)}), längste {hmm(st.max.v)} h ({dShort(st.max.date)}).</Fragment> : 'Keine Schlafdaten in diesem Zeitraum.'}
      </p>

      {yT ? (
        <Fragment>
          <div style="height:18px" />
          <Headline label={selT ? 'Nacht auf ' + dWeek(selT.date) : 'Schlafenszeiten · Ø ' + perName[p]} value={selT ? clockOfMinute(selT.start) + '–' + clockOfMinute(selT.end) : clockOfMinute(tS) + '–' + clockOfMinute(tE)}
            sub={selT ? 'Eingeschlafen bis aufgewacht · ' + hmm(selT.end - selT.start) + ' h' : 'Ø eingeschlafen bis Ø aufgewacht' + (sd != null ? ` · Einschlafzeit ± ${hmm(sd)} h` : '')} />
          <div class="t2" style="padding:8px 10px 6px">
            <TimeChart height={190} x={x} y={yT} unit="Uhr" label="Einschlaf- und Aufwachzeiten" yFmt={(v) => clockOfMinute(v).slice(0, 2)} animKey={p + 't'}
              snap={times} sel={selT} onSel={setSelT}
              layers={(s) => [
                <RefLine s={s} v={tS} />,
                <RefLine s={s} v={tE} />,
                <Ranges s={s} data={times.map((q) => ({ t: q.t, lo: q.end, hi: q.start }))} n={W.n} color="var(--c)" />,
              ]} />
          </div>
          <Legend items={[{ kind: 'bx', color: 'var(--c)', label: 'Einschlafen bis Aufwachen' }, { color: 'var(--ink-2)', label: 'Ø Einschlaf- und Aufwachzeit' }]} />
          <p class="say2">{sd != null ? <Fragment>Im Schnitt eingeschlafen um <b>{clockOfMinute(tS)}</b>, aufgewacht um <b>{clockOfMinute(tE)}</b>. Die Einschlafzeit schwankt um ± {hmm(sd)} h (Standardabweichung){sd > 60 ? ' – ein regelmäßigerer Rhythmus hilft meist der Erholung.' : '.'}</Fragment> : 'Zu wenige Nächte für eine Aussage zur Regelmäßigkeit.'}</p>
        </Fragment>
      ) : null}
      <Table head={[wk ? 'Woche ab' : 'Nacht auf', 'Schlaf', 'Tief', 'Leicht', 'REM', 'Wach']} rows={rows.map((q) => [wk ? dShort(q.date) : dWeek(q.date), hmm(q.v), hmm(q.d), hmm(q.l), hmm(q.r), hmm(q.a)])} />
    </div>
  );
}
const WDDE = { Monday: 'Mo', Tuesday: 'Di', Wednesday: 'Mi', Thursday: 'Do', Friday: 'Fr', Saturday: 'Sa', Sunday: 'So' };
const nightOfDe = (s) => { const m = /^(\w+) (\d{4}-\d{2}-\d{2})/.exec(s || ''); return m ? 'Nacht vom ' + (WDDE[m[1]] || '') + ', ' + dShort(m[2]) : s; };
function saySleepNight(sl, need, dStart, avgStart, n) {
  if (sl.total == null) return 'Für diese Nacht liegen keine Schlafdaten vor. Gleiche Garmin ab oder wähle eine andere Nacht.';
  const out = [];
  if (need) out.push(sl.total >= need ? `${hmm(sl.total)} h Schlaf – dein Bedarf von ${hmm(need)} h ist gedeckt.` : `${hmm(sl.total)} h Schlaf, ${hmm(need - sl.total)} h unter deinem Bedarf von ${hmm(need)} h.`);
  if (sl.rem === 0) out.push('Garmin hat in dieser Nacht keinen REM-Schlaf erkannt.');
  if (dStart != null && Math.abs(dStart) >= 45) out.push(`Eingeschlafen ${hmm(Math.abs(dStart))} h ${dStart > 0 ? 'später' : 'früher'} als im Schnitt der ${n} Nächte davor (${clockOfMinute(avgStart)}).`);
  return out.join(' ');
}

// ============================== Gewicht ==============================
export const BODY = [['weight', 'Gewicht', 'kg'], ['fatPct', 'Körperfett', '%'], ['muscle', 'Muskelmasse', 'kg'], ['visceral', 'Viszeralfett', 'Index'], ['vasc', 'Gefäßalter', 'Jahre'], ['pwv', 'Pulswelle', 'm/s']];
export function WeightDetail({ H, end, k0 = 'weight' }) {
  const [k, setK] = useState(k0);
  const [p, setP] = useState('y');
  const [sel, setSel] = useState(null);
  const [cmp, setCmp] = useState(false);
  const S = getState();
  const goal = k === 'weight' ? (S.settings.main && S.settings.main.healthGoals && S.settings.main.healthGoals.weight) || null : null;
  const [editGoal, setEditGoal] = useState(false);
  const unit = BODY.find((b) => b[0] === k)[2];
  const W = windowOf(p, end);
  const x = { min: tOf(W.from) - DAY / 2, max: tOf(W.to) + DAY / 2, ticks: timeTicks(p, W.from, W.to) };
  const all = useMemo(() => daily(H.list, (r) => (r.wi ? r.wi[k] : null), '0000', end), [H, end, k]);
  const pts = all.filter((q) => q.date >= W.from && q.date <= W.to);
  const trend = rolling(all.filter((q) => q.date >= addD(W.from, -7) && q.date <= W.to), 7, 10).filter((q) => q.v == null ? true : q.date >= W.from);
  const prev = cmp ? all.filter((q) => q.date >= W.prevFrom && q.date <= W.prevTo).map((q) => ({ ...q, t: q.t + W.n * DAY })) : [];
  const st = stats(pts);
  const lastAll = all.length ? all[all.length - 1] : null;
  const vals = pts.map((q) => q.v).concat(prev.map((q) => q.v), goal ? [goal] : []);
  const yy = vals.length ? niceTicks(Math.floor(Math.min(...vals) - 0.5), Math.ceil(Math.max(...vals) + 0.5), 5, true) : null;
  const tAt = (t) => { const q = trend.find((z) => z.t === t && z.v != null); return q ? q.v : null; };
  const tv = trend.filter((q) => q.v != null);
  const say = st ? sayWeight(k, unit, st, tv, goal, W) : null;
  return (
    <div class="g-kor">
      <div class="row2 chips-x" style="margin-bottom:10px">
        {BODY.map(([v, l]) => <button type="button" class="chip2" aria-pressed={String(k === v)} onClick={() => { setK(v); setSel(null); }}>{l}</button>)}
      </div>
      <Seg2 value={p} onChange={(v) => { setP(v); setSel(null); }} label="Zeitraum" options={PER_OPTS(['d'])} />
      <Headline label={sel ? dWeek(sel.date) + ' · Messung' : st ? 'Letzte Messung · ' + dYear(st.last.date) : 'Letzte Messung'}
        value={sel ? sel.v : st ? st.last.v : lastAll ? lastAll.v : 'keine Daten'} unit={unit} fmt={n1}
        sub={sel ? `7-Tage-Mittel ${tAt(sel.t) != null ? n1(tAt(sel.t)) + ' ' + unit : '–'} · Withings` : st ? `${rangeText(W)} · ${st.n} Messungen · Withings` : lastAll ? 'am ' + dYear(lastAll.date) + ' · außerhalb des Zeitraums' : ''} />
      <div class="row2" style="margin:0 2px 8px">
        <button type="button" class="chip2" aria-pressed={String(cmp)} onClick={() => setCmp(!cmp)}><span class="k" style="opacity:.5" />{p === 'y' ? 'Vorjahr' : 'Vorzeitraum'}</button>
        {k === 'weight' ? <button type="button" class="chip2" onClick={() => setEditGoal(!editGoal)}>{goal ? 'Ziel ' + n1(goal) + ' kg' : 'Zielgewicht festlegen'}</button> : null}
      </div>
      {editGoal ? <GoalEdit goal={goal} last={lastAll && lastAll.v} onDone={() => setEditGoal(false)} /> : null}
      <div class="t2" style="padding:8px 10px 6px">
        {pts.length ? (
          <TimeChart height={210} x={x} y={yy} unit={unit} label={BODY.find((b) => b[0] === k)[1] + '-Verlauf'} yFmt={(v) => num(v, yy.step < 1 ? 1 : 0)} animKey={k + p + cmp + goal}
            snap={pts} sel={sel} onSel={setSel} marks={(q) => [{ v: q.v, color: 'var(--c)' }]}
            layers={(s) => [
              goal ? <RefLine s={s} v={goal} label={'Ziel ' + n1(goal)} kind="goal" side="right" /> : null,
              cmp ? <Line s={s} data={rolling(prev, 7, 10)} color="var(--ink-2)" width={1.5} opacity={0.45} /> : null,
              cmp ? <Points s={s} data={prev} color="var(--neutral)" r={2.5} ring={false} /> : null,
              <Line s={s} data={trend} color="var(--ink)" width={1.5} opacity={0.75} />,
              <Points s={s} data={pts} color="var(--c)" r={3.5} />,
              pts.length > 2 ? <MinMax s={s} min={st.min} max={st.max} fmt={n1} /> : null,
            ]} />
        ) : (
          <div class="empty2">Keine Messung im Zeitraum {rangeText(W)}{lastAll ? <Fragment><br />Letzte Messung: <b>{n1(lastAll.v)} {unit}</b> am {dYear(lastAll.date)}.</Fragment> : null}<br /><button type="button" class="btn2 q" onClick={() => setP('y')}>Jahr anzeigen</button></div>
        )}
      </div>
      <Legend items={[{ kind: 'dt', color: 'var(--c)', label: 'Messung' }, { color: 'var(--ink)', label: '7-Tage-Mittel (geglättet)' }].concat(goal ? [{ kind: 'ds', label: 'Ziel' }] : [], cmp ? [{ color: 'var(--ink-2)', label: p === 'y' ? 'Vorjahr' : 'Vorzeitraum' }] : [])} />
      {say ? <p class="say2">{say}</p> : null}
      {pts.length ? <Table head={['Datum', BODY.find((b) => b[0] === k)[1], '7-Tage-Mittel']} rows={pts.map((q) => [dYear(q.date), n1(q.v) + ' ' + unit, tAt(q.t) != null ? n1(tAt(q.t)) : '–'])} /> : null}
    </div>
  );
}
function sayWeight(k, unit, st, tv, goal, W) {
  const name = BODY.find((b) => b[0] === k)[1];
  const multi = st.first.date.slice(0, 4) !== st.last.date.slice(0, 4);
  const dS = multi ? dYear : dShort;
  const out = [];
  out.push(`${st.n} Messungen zwischen ${dS(st.first.date)} und ${dS(st.last.date)}; ${name} von ${n1(st.min.v)} ${unit} (${dS(st.min.date)}) bis ${n1(st.max.v)} ${unit} (${dS(st.max.date)}).`);
  if (tv.length >= 2) {
    const r1 = (v) => Math.round(v * 10) / 10;
    const d = r1(tv[tv.length - 1].v) - r1(tv[0].v);
    out.push(`Das 7-Tage-Mittel ${Math.abs(d) < 0.3 ? 'blieb fast gleich' : d < 0 ? 'sank' : 'stieg'} von ${n1(tv[0].v)} auf ${n1(tv[tv.length - 1].v)} ${unit} (${sign(d)} ${unit}).`);
  }
  if (goal && k === 'weight') { const r = st.last.v - goal; out.push(r > 0 ? `Bis zum Ziel von ${n1(goal)} kg fehlen ${n1(r)} kg (letzte Messung).` : `Ziel von ${n1(goal)} kg erreicht.`); }
  if (tOf(W.to) - tOf(st.last.date) > 21 * DAY) out.push(`Die letzte Messung ist ${Math.round((tOf(W.to) - tOf(st.last.date)) / DAY)} Tage alt.`);
  return out.join(' ');
}
function GoalEdit({ goal, last, onDone }) {
  const [v, setV] = useState(goal || (last ? Math.round(last) : 85));
  const save = (val) => {
    const cur = getState().settings.main || {};
    setDoc('settings/main', { ...cur, healthGoals: { ...(cur.healthGoals || {}), weight: val } });
    onDone();
  };
  return (
    <div class="t2" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 12px">
      <span class="sub2" style="flex:1">Zielgewicht</span>
      <button type="button" class="btn2 q" aria-label="0,5 kg weniger" onClick={() => setV(Math.round((v - 0.5) * 10) / 10)}>−</button>
      <span class="mid2" style="min-width:86px;text-align:center">{n1(v)}<small>kg</small></span>
      <button type="button" class="btn2 q" aria-label="0,5 kg mehr" onClick={() => setV(Math.round((v + 0.5) * 10) / 10)}>+</button>
      <button type="button" class="btn2" onClick={() => save(v)}>Sichern</button>
      {goal ? <button type="button" class="btn2 q" onClick={() => save(null)}>Entfernen</button> : null}
    </div>
  );
}

