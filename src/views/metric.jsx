// Detailansicht je Kennzahl: passender Graph, Zeitraum, Einordnung, Erklärung.
import { h, Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { Ico, srcName } from '../ui/hp.jsx';
import { Top } from '../ui/kit.jsx';
import { TimeChart, Band, RefLine, NoDataSpan, Line, Points, MinMax, Bars, Ranges, Headline, Legend, Table, Seg2, RangeScale } from '../ui/viz.jsx';
import { PERIODS, windowOf, daily, weekly, stats, rolling, niceTicks, tOf, addD, dShort, dWeek, DAY } from '../viz-data.js';
import { healthDays, healthMeta, todayLocal } from '../health.js';
import { M } from '../metrics.js';
import { num } from '../format.js';
import { useStatus } from './common.jsx';
import { PulseDetail, SleepDetail, WeightDetail, BODY, n0, n1, sign, PER_OPTS, perName, xDomain, rangeText, avgOf } from './details.jsx';

// Kennzahl → Farbgruppe (überall gleich: Kachel, Graph, Icon)
export const GROUP = {
  rhr: 'herz', resp: 'herz', vo2: 'herz', hr: 'herz',
  steps: 'akt', im: 'akt',
  kcal: 'akt',
  sleep: 'sch', slScore: 'sch',
  hrv: 'erh', rec: 'erh', bb: 'erh', stress: 'erh', akcal: 'akt',
  weight: 'kor', fatPct: 'kor', muscle: 'kor', visceral: 'kor', vasc: 'kor', pwv: 'kor',
  ctl: null, atl: null, tsb: null,
};
export const gcls = (k) => (GROUP[k] ? 'g-' + GROUP[k] : '');

const fmtOf = (dec) => (v) => num(v, dec);
const lastRow = (H, end, f) => { for (let i = H.list.length - 1; i >= 0; i--) { const r = H.list[i]; if (r.date <= end && f(r) != null) return r; } return null; };

// ---------- Tag: Wert auf einer Skala mit persönlichem Bereich ----------
function DayView({ H, end, cfg, p, setP, opts }) {
  const days = useMemo(() => H.list.filter((r) => r.date <= end && cfg.get(r) != null).map((r) => r.date), [H, end]);
  const [day, setDay] = useState(days.length ? days[days.length - 1] : end);
  const r = H.map[day] || {};
  const v = cfg.get(r);
  const i = days.indexOf(day);
  const past = daily(H.list, cfg.get, addD(day, -89), day);
  const st = stats(past);
  const band = cfg.band ? cfg.band(r) : null;
  const lo = cfg.scale ? cfg.scale[0] : st ? Math.floor(Math.min(st.min.v, band ? band[0] : st.min.v) * 0.95) : 0;
  const hi = cfg.scale ? cfg.scale[1] : st ? Math.ceil(Math.max(st.max.v, band ? band[1] : st.max.v) * 1.05) : 100;
  const f = cfg.fmt || n0;
  return (
    <Fragment>
      <Seg2 value={p} onChange={setP} label="Zeitraum" options={opts} />
      <Headline label={cfg.title + ' · ' + dWeek(day)} value={v != null ? v : 'keine Daten'} unit={cfg.unit} fmt={f} sub={(cfg.partial && cfg.partial(r) ? 'Tag noch nicht abgeschlossen · ' : '') + (cfg.say ? cfg.say(v, r) || '' : '')} />
      <div class="t2" style="padding:14px 12px 10px">
        <div class="lbl2" style="margin:0 4px">{band ? 'Wert und Normalbereich' : 'Wert und Spanne der letzten 90 Tage'}</div>
        {v != null ? (
          <RangeScale min={lo} max={hi} lo={band ? band[0] : st ? st.min.v : null} hi={band ? band[1] : st ? st.max.v : null} unit={cfg.unit}
            ticks={[f(lo), f((lo + hi) / 2), f(hi) + (cfg.unit ? ' ' + cfg.unit : '')]} markers={[{ v }]}
            stats={band ? [{ label: 'heute', v: f(v), sym: true }, { label: 'Normal ab', v: f(band[0]) }, { label: 'bis', v: f(band[1]) }, { label: '90-T-Ø', v: st ? f(st.mean) : null }]
              : [{ label: 'Wert', v: f(v), sym: true }, { label: '90-T-min', v: st ? f(st.min.v) : null }, { label: '90-T-Ø', v: st ? f(st.mean) : null }, { label: '90-T-max', v: st ? f(st.max.v) : null }]} />
        ) : <div class="empty2">Für diesen Tag liegt kein Wert vor. Wähle einen anderen Tag.</div>}
        <div class="nav2">
          <button type="button" aria-label="Tag davor" disabled={i <= 0} onClick={() => setDay(days[i - 1])}><Ico n="nav-arrow-left" /></button>
          <span class="sub2">{dWeek(day)}</span>
          <button type="button" aria-label="Tag danach" disabled={i < 0 || i >= days.length - 1} onClick={() => setDay(days[i + 1])}><Ico n="nav-arrow-right" /></button>
        </div>
      </div>
    </Fragment>
  );
}

// ---------- Verlauf: Messpunkte + 7-Tage-Mittel + Normalbereich (HRV, Atmung) ----------
function TrendDetail({ H, end, cfg }) {
  const [p, setP] = useState('m');
  const [sel, setSel] = useState(null);
  const [cmp, setCmp] = useState(false);
  const change = (v) => { setP(v); setSel(null); };
  const all = useMemo(() => daily(H.list, cfg.get, '0000', end), [H, end]);
  if (p === 'd') return <DayView H={H} end={end} cfg={cfg} p={p} setP={change} opts={PER_OPTS()} />;
  const W = windowOf(p, end), wk = PERIODS[p].bucket === 'week', x = xDomain(p, W);
  let pts = all.filter((q) => q.date >= W.from && q.date <= W.to);
  const trend = wk ? null : rolling(all.filter((q) => q.date >= addD(W.from, -7) && q.date <= W.to), 7, 3).filter((q) => q.v == null || q.date >= W.from);
  if (wk) pts = weekly(pts);
  const prev0 = cmp ? all.filter((q) => q.date >= W.prevFrom && q.date <= W.prevTo).map((q) => ({ ...q, t: q.t + W.n * DAY })) : [];
  const prev = cmp && wk ? weekly(prev0) : prev0;
  const br = lastRow(H, end, (r) => (cfg.band ? cfg.band(r) : null));
  const band = br ? cfg.band(br) : null;
  const st = stats(pts);
  const vals = pts.map((q) => q.v).concat(band || [], prev.map((q) => q.v));
  const y = niceTicks(Math.floor(Math.min(...(vals.length ? vals : [0])) * 0.97), Math.ceil(Math.max(...(vals.length ? vals : [1])) * 1.03), 4, cfg.int);
  const first = all.length ? all[0].date : null;
  const f = cfg.fmt || n0;
  const tAt = (t) => { const q = trend && trend.find((z) => z.t === t); return q ? q.v : null; };
  const inB = band ? pts.filter((q) => q.v >= band[0] && q.v <= band[1]).length : null;
  let say = null;
  if (st) {
    say = `Im Mittel ${n1(st.mean)} ${cfg.unit}, ${wk ? 'Wochenmittel' : 'Tageswerte'} zwischen ${f(st.min.v)} und ${f(st.max.v)}.` + (band ? ` ${inB} von ${pts.length} ${wk ? 'Wochen' : 'Tagen'} im Normalbereich (${f(band[0])}–${f(band[1])}).` : '');
    if (!wk) {
      const eT = tOf(W.to), a = all.filter((q) => q.t > eT - 7 * DAY && q.t <= eT), b = all.filter((q) => q.t > eT - 14 * DAY && q.t <= eT - 7 * DAY);
      if (a.length >= 4 && b.length >= 4) { const d = avgOf(a.map((q) => q.v)) - avgOf(b.map((q) => q.v)); say += Math.abs(d) < (cfg.flat || 1) ? ' Die letzten 7 Tage etwa gleich wie die 7 davor.' : ` Die letzten 7 Tage ${d > 0 ? 'höher' : 'niedriger'} als die 7 davor (${sign(d)} ${cfg.unit}).`; }
    }
  }
  return (
    <Fragment>
      <Seg2 value={p} onChange={change} label="Zeitraum" options={PER_OPTS()} />
      <Headline label={sel ? (wk ? 'Woche ab ' + dShort(sel.date) : dWeek(sel.date)) : cfg.title + ' · Ø ' + perName[p]} value={sel ? sel.v : st ? st.mean : 'keine Daten'} unit={cfg.unit} fmt={sel && !wk ? f : n1}
        sub={sel ? (wk ? `${sel.n} Tage · ${f(sel.lo)}–${f(sel.hi)} ${cfg.unit}` : `7-Tage-Mittel ${tAt(sel.t) != null ? n1(tAt(sel.t)) : '–'}` + (band ? (sel.v > band[1] ? ' · über Normalbereich' : sel.v < band[0] ? ' · unter Normalbereich' : ' · im Normalbereich') : '')) : rangeText(W) + (band ? ` · Normalbereich ${f(band[0])}–${f(band[1])}` : '')} />
      <div class="row2" style="margin:0 2px 8px"><button type="button" class="chip2" aria-pressed={String(cmp)} onClick={() => setCmp(!cmp)}><span class="k" style="opacity:.5" />{p === 'y' ? 'Vorjahr' : 'Vorzeitraum'}</button></div>
      <div class="t2" style="padding:8px 10px 6px">
        {pts.length ? (
          <TimeChart height={210} x={x} y={y} unit={cfg.unit} label={cfg.title + '-Verlauf'} animKey={p + cmp}
            snap={pts} sel={sel} onSel={setSel} marks={(q) => [{ v: q.v, color: 'var(--c)' }]}
            layers={(s) => [
              first && first > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(first) - DAY / 2} text={'Daten ab ' + dShort(first)} /> : null,
              band ? <Band s={s} lo={band[0]} hi={band[1]} /> : null,
              st ? <RefLine s={s} v={st.mean} label={'Ø ' + n1(st.mean)} side={first && first > W.from ? 'left' : 'right'} /> : null,
              cmp ? <Line s={s} data={prev} color="var(--ink-2)" width={1.5} opacity={0.45} /> : null,
              trend ? <Line s={s} data={trend} color="var(--ink)" width={1.5} opacity={0.7} /> : <Line s={s} data={pts} color="var(--c)" width={2} />,
              <Points s={s} data={pts} color="var(--c)" />,
              st && pts.length > 2 ? <MinMax s={s} min={st.min} max={st.max} fmt={wk ? n1 : f} /> : null,
            ]} />
        ) : <div class="empty2">Keine Werte in diesem Zeitraum. Wähle einen längeren Zeitraum.</div>}
      </div>
      <Legend items={[{ kind: 'dt', color: 'var(--c)', label: wk ? 'Wochenmittel' : 'Tageswert' }].concat(trend ? [{ color: 'var(--ink)', label: '7-Tage-Mittel (geglättet)' }] : [], band ? [{ kind: 'bx', color: 'color-mix(in oklab, var(--c) 22%, transparent)', label: 'Normalbereich (Mittel ± 1 SD)' }] : [], cmp ? [{ color: 'var(--ink-2)', label: p === 'y' ? 'Vorjahr' : 'Vorzeitraum' }] : [])} />
      {say ? <p class="say2">{say}</p> : null}
      {pts.length ? <Table head={[wk ? 'Woche ab' : 'Tag', cfg.title + (cfg.unit ? ' (' + cfg.unit + ')' : '')]} rows={pts.map((q) => [wk ? dShort(q.date) : dWeek(q.date), wk ? n1(q.v) : f(q.v)])} /> : null}
    </Fragment>
  );
}

// ---------- Balken ab 0 (Mengen: Summe; Werte 0–100: Durchschnitt) ----------
function BarsDetail({ H, end, cfg }) {
  const [p, setP] = useState('w');
  const [sel, setSel] = useState(null);
  const change = (v) => { setP(v); setSel(null); };
  const all = useMemo(() => daily(H.list, cfg.get, '0000', end), [H, end]);
  if (p === 'd') return <DayView H={H} end={end} cfg={{ ...cfg, scale: cfg.y100 ? [0, 100] : null }} p={p} setP={change} opts={PER_OPTS()} />;
  const W = windowOf(p, end), wk = PERIODS[p].bucket === 'week', x = xDomain(p, W);
  const sum = cfg.agg === 'sum';
  let rows = all.filter((q) => q.date >= W.from && q.date <= W.to).map((q) => ({ ...q, partial: cfg.partial ? cfg.partial(q.r) : false, goal: cfg.goal ? cfg.goal(q.r) : null }));
  if (wk) rows = weekly(rows, sum ? 'sum' : 'mean').map((b) => ({ ...b, partial: b.ps.some((q) => q.partial) }));
  const last = rows.length ? rows[rows.length - 1] : null;
  const bars = rows.map((q) => ({ t: q.t, v: q.v, hl: sel ? sel.t === q.t : q === last }));
  const full = rows.filter((q) => !q.partial);
  const st = stats(full);
  const goal = !wk && cfg.goal ? (rows.slice().reverse().find((q) => q.goal) || {}).goal || null : wk && cfg.weekGoal ? cfg.weekGoal(H, end) : null;
  const y = cfg.y100 ? { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] } : niceTicks(0, Math.max(1, ...rows.map((q) => q.v), goal || 0), 4, true);
  const first = all.length ? all[0].date : null;
  const f = cfg.fmt || n0;
  const total = full.reduce((a, q) => a + q.v, 0);
  const reached = !wk && cfg.goal ? full.filter((q) => q.goal && q.v >= q.goal).length : null;
  let say = null;
  if (st) {
    say = sum
      ? `${wk ? 'Je Woche' : 'Pro Tag'} im Mittel ${f(st.mean)}${cfg.unit ? ' ' + cfg.unit : ''}, zusammen ${f(total)}${cfg.unit ? ' ' + cfg.unit : ''} in ${full.length} ${wk ? 'vollständigen Wochen' : 'abgeschlossenen Tagen'}.`
      : `Im Mittel ${f(st.mean)}${cfg.unit ? ' ' + cfg.unit : ''}, zwischen ${f(st.min.v)} und ${f(st.max.v)}.`;
    const withGoal = full.filter((q) => q.goal).length;
    if (reached != null && withGoal) say += ` Ziel an ${reached} von ${withGoal} Tagen mit Garmin-Ziel erreicht.`;
    say += ` ${sum ? 'Bester' : 'Höchster'} ${wk ? 'Wert' : 'Tag'}: ${f(st.max.v)} (${wk ? 'Woche ab ' : ''}${dShort(st.max.date)}).`;
    if (cfg.note) say += ' ' + cfg.note(st);
  }
  return (
    <Fragment>
      <Seg2 value={p} onChange={change} label="Zeitraum" options={PER_OPTS()} />
      <Headline label={sel ? (wk ? 'Woche ab ' + dShort(sel.date) : dWeek(sel.date)) : cfg.title + ' · ' + (sum ? 'Ø ' + (wk ? 'je Woche' : 'pro Tag') : 'Ø') + ' · ' + perName[p]}
        value={sel ? sel.v : st ? st.mean : 'keine Daten'} unit={cfg.unit} fmt={f}
        sub={sel ? (sel.partial ? 'enthält den laufenden Tag – Stand letzter Abgleich' : wk ? `${sel.n} Tage${sum ? ' · Ø ' + f(sel.v / sel.n) + ' pro Tag' : ''}` : (cfg.say ? cfg.say(sel.v, sel.r) || '' : '')) : rangeText(W) + (goal ? ` · Ziel ${f(goal)}` : '')} />
      <div class="t2" style="padding:8px 10px 6px">
        {rows.length ? (
          <TimeChart height={200} x={x} y={y} unit={cfg.unit || (cfg.y100 ? '/100' : '')} label={cfg.title} animKey={p}
            snap={rows} sel={sel} onSel={setSel}
            layers={(s) => [
              first && first > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(first) - DAY / 2} text={'Daten ab ' + dShort(first)} /> : null,
              cfg.zones ? cfg.zones.map(([a, b2, lbl, o]) => <rect x={s.pad.l} y={s.sy(b2)} width={s.pw} height={s.sy(a) - s.sy(b2)} fill="var(--c)" fill-opacity={o} />) : null,
              <Bars s={s} data={bars} n={wk ? rows.length || 26 : W.n} color="var(--c)" />,
              goal ? <RefLine s={s} v={goal} label={'Ziel ' + f(goal)} kind="goal" side="right" /> : null,
              st && !cfg.zones ? <RefLine s={s} v={st.mean} label={'Ø ' + f(st.mean)} side="left" /> : null,
            ]} />
        ) : <div class="empty2">Keine Werte in diesem Zeitraum. Wähle einen längeren Zeitraum.</div>}
      </div>
      <Legend items={[{ kind: 'bx', color: 'var(--c)', label: sel ? 'Auswahl' : wk ? 'letzte Woche' : 'letzter Tag' }, { kind: 'bx', color: 'var(--neutral)', label: (wk ? (sum ? 'Summe je Woche' : 'Wochenmittel') : 'Tageswert') }].concat(goal ? [{ kind: 'ds', label: cfg.goalLabel || 'Ziel' }] : [], st && !cfg.zones ? [{ color: 'var(--ink-2)', label: 'Durchschnitt' }] : [], cfg.zones ? [{ kind: 'bx', color: 'color-mix(in oklab, var(--c) 18%, transparent)', label: 'Bereiche (heller → dunkler): ' + cfg.zones.map((z) => z[2] + ' ' + z[0] + '–' + z[1]).join(' · ') }] : [])} />
      {say ? <p class="say2">{say}{last && last.partial ? ' Der laufende Tag zählt noch nicht mit.' : ''}</p> : null}
      {rows.length ? <Table head={[wk ? 'Woche ab' : 'Tag', cfg.title].concat(cfg.goal && !wk ? ['Ziel'] : [])} rows={rows.map((q) => [wk ? dShort(q.date) : dWeek(q.date), f(q.v) + (q.partial ? ' *' : '')].concat(cfg.goal && !wk ? [q.goal ? f(q.goal) : '–'] : []))} /> : null}
    </Fragment>
  );
}

// ---------- Body Battery: Tagesspanne niedrig–hoch, Aufwachwert als Punkt ----------
function BBDetail({ H, end }) {
  const [p, setP] = useState('w');
  const [sel, setSel] = useState(null);
  const cfg = { title: 'Body Battery', unit: '/100', get: (r) => (r.g ? r.g.bbWake : null), say: (v, r) => M.bb.say(v, r) };
  const change = (v) => { setP(v); setSel(null); };
  const all = useMemo(() => daily(H.list, (r) => (r.g && (r.g.bbWake != null || r.g.bbHi != null) ? r.g.bbWake : null), '0000', end).map((q) => ({ ...q, lo: q.r.g.bbLo, hi: q.r.g.bbHi, ch: q.r.g.bbCh, dr: q.r.g.bbDr, partial: q.r.g.partial })), [H, end]);
  if (p === 'd') return <DayView H={H} end={end} cfg={{ ...cfg, scale: [0, 100] }} p={p} setP={change} opts={PER_OPTS(['h', 'y'])} />;
  const W = windowOf(p, end), x = xDomain(p, W);
  const rows = all.filter((q) => q.date >= W.from && q.date <= W.to);
  const st = stats(rows);
  const first = all.length ? all[0].date : null;
  return (
    <Fragment>
      <Seg2 value={p} onChange={change} label="Zeitraum" options={PER_OPTS(['h', 'y'])} />
      <Headline label={sel ? dWeek(sel.date) : 'Body Battery beim Aufwachen · Ø ' + perName[p]} value={sel ? sel.v : st ? st.mean : 'keine Daten'} unit="/100" fmt={n0}
        sub={sel ? `Tag: ${sel.lo != null ? sel.lo : '–'}–${sel.hi != null ? sel.hi : '–'} · +${sel.ch != null ? sel.ch : '–'} geladen · −${sel.dr != null ? sel.dr : '–'} verbraucht${sel.partial ? ' · Tag läuft noch' : ''}` : rangeText(W) + ' · Punkt = beim Aufwachen, Balken = Tagesspanne'} />
      <div class="t2" style="padding:8px 10px 6px">
        {rows.length ? (
          <TimeChart height={200} x={x} y={{ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }} unit="/100" label="Body Battery je Tag" animKey={p}
            snap={rows} sel={sel} onSel={setSel} marks={(q) => [{ v: q.v, color: 'var(--c)' }]}
            layers={(s) => [
              first && first > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(first) - DAY / 2} text={'Daten ab ' + dShort(first)} /> : null,
              <Ranges s={s} data={rows.filter((q) => q.hi != null && q.lo != null)} n={W.n} />,
              <Points s={s} data={rows} color="var(--c)" />,
            ]} />
        ) : <div class="empty2">Keine Werte in diesem Zeitraum. Wähle einen längeren Zeitraum.</div>}
      </div>
      <Legend items={[{ kind: 'dt', color: 'var(--c)', label: 'beim Aufwachen' }, { kind: 'bx', color: 'var(--neutral)', label: 'Tagesspanne (niedrig–hoch)' }]} />
      {st ? <p class="say2">Beim Aufwachen im Mittel {n0(st.mean)}, zwischen {st.min.v} ({dShort(st.min.date)}) und {st.max.v} ({dShort(st.max.date)}). {st.mean < 50 ? 'Du startest im Schnitt nur halb geladen in den Tag – Schlaf und ruhige Abende laden am meisten.' : 'Du startest meist gut geladen in den Tag.'}</p> : null}
      {rows.length ? <Table head={['Tag', 'Aufwachen', 'niedrig', 'hoch', '+', '−']} rows={rows.map((q) => [dWeek(q.date), q.v != null ? q.v : '–', q.lo != null ? q.lo : '–', q.hi != null ? q.hi : '–', q.ch != null ? q.ch : '–', q.dr != null ? q.dr : '–'])} /> : null}
    </Fragment>
  );
}

// ---------- Trainingsbelastung: Fitness/Ermüdung und Form mit Zonen ----------
// Form-Zonen nach der verbreiteten Konvention (z. B. intervals.icu)
const FORM_Z = [[25, 60, 'Übergang'], [5, 25, 'frisch'], [-10, 5, 'neutral'], [-30, -10, 'optimales Training'], [-60, -30, 'hohes Risiko']];
function PMCDetail({ H, end }) {
  const [p, setP] = useState('m');
  const [sel, setSel] = useState(null);
  const [sel2, setSel2] = useState(null);
  const meta = healthMeta();
  const change = (v) => { setP(v); setSel(null); setSel2(null); };
  const all = useMemo(() => daily(H.list, (r) => r.ctl, '0000', end).map((q) => ({ ...q, ctl: q.r.ctl, atl: q.r.atl, tsb: q.r.tsb })), [H, end]);
  const W = windowOf(p === 'd' ? 'w' : p, end), x = xDomain(p === 'd' ? 'w' : p, W);
  const rows = all.filter((q) => q.date >= W.from && q.date <= W.to);
  const lastR = all.length ? all[all.length - 1] : null;
  const yv = rows.flatMap((q) => [q.ctl, q.atl]);
  const y1 = niceTicks(0, Math.max(10, ...yv), 4, true);
  const tv = rows.map((q) => q.tsb);
  const y2 = niceTicks(Math.min(-15, ...tv), Math.max(15, ...tv), 4, true);
  const zone = (v) => (FORM_Z.find(([a, b]) => v >= a && v < b) || [0, 0, '–'])[2];
  const pmc = meta.pmc;
  const first = all.length ? all[0].date : null;
  const dSel = sel || sel2;
  return (
    <Fragment>
      <Seg2 value={p === 'd' ? 'w' : p} onChange={change} label="Zeitraum" options={PER_OPTS(['d'])} />
      <Headline label={dSel ? dWeek(dSel.date) : 'Form heute'} value={dSel ? dSel.tsb : lastR ? lastR.tsb : 'keine Daten'} unit="" fmt={(v) => (v > 0 ? '+' : '') + n1(v)}
        sub={dSel ? `Fitness ${n1(dSel.ctl)} · Ermüdung ${n1(dSel.atl)} · ${zone(dSel.tsb)}` : lastR ? `Fitness ${n1(lastR.ctl)} · Ermüdung ${n1(lastR.atl)} · Zone: ${zone(lastR.tsb)}` : ''} />
      <div class="t2" style="padding:8px 10px 6px">
        {rows.length ? (
          <TimeChart height={180} x={x} y={y1} unit="Last" label="Fitness und Ermüdung" animKey={p + 'a'}
            snap={rows} sel={sel} onSel={(q) => { setSel(q); setSel2(null); }} marks={(q) => [{ v: q.ctl, color: 'var(--ink)' }, { v: q.atl, color: 'var(--ink-2)' }]}
            layers={(s) => [
              first && first > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(first) - DAY / 2} text={'Daten ab ' + dShort(first)} /> : null,
              <Line s={s} data={rows.map((q) => ({ t: q.t, v: q.atl }))} color="var(--ink-2)" width={1.5} dash="4 3" />,
              <Line s={s} data={rows.map((q) => ({ t: q.t, v: q.ctl }))} color="var(--ink)" width={2.2} />,
            ]} />
        ) : <div class="empty2">Keine Belastungsdaten in diesem Zeitraum. Wähle einen längeren Zeitraum.</div>}
      </div>
      <Legend items={[{ color: 'var(--ink)', label: 'Fitness (CTL, 42 Tage)' }, { kind: 'ds', label: 'Ermüdung (ATL, 7 Tage)' }]} />
      <div style="height:14px" />
      <div class="lbl2" style="margin:0 2px 6px">Form = Fitness − Ermüdung</div>
      <div class="t2" style="padding:8px 10px 6px">
        {rows.length ? (
          <TimeChart height={170} x={x} y={y2} unit="Form" label="Form mit Zonen" animKey={p + 'b'} yFmt={(v) => (v > 0 ? '+' : '') + v}
            snap={rows} sel={sel2} onSel={(q) => { setSel2(q); setSel(null); }} marks={(q) => [{ v: q.tsb, color: 'var(--ink)' }]}
            layers={(s) => [
              FORM_Z.map(([a, b, l], i) => { const top = s.sy(Math.min(b, y2.max)), bot = s.sy(Math.max(a, y2.min)); return bot - top > 1 ? <g><rect x={s.pad.l} y={top} width={s.pw} height={bot - top} fill="var(--ink)" fill-opacity={[0.03, 0.07, 0, 0.07, 0.13][i]} />{bot - top > 13 ? <text class="rl" x={s.pad.l + 4} y={top + 11}>{l}</text> : null}</g> : null; }),
              <RefLine s={s} v={0} />,
              <Line s={s} data={rows.map((q) => ({ t: q.t, v: q.tsb }))} color="var(--ink)" width={2} />,
              <Points s={s} data={rows.slice(-1).map((q) => ({ t: q.t, v: q.tsb }))} color="var(--ink)" />,
            ]} />
        ) : null}
      </div>
      <p class="say2">
        {lastR ? <Fragment>Fitness {n1(lastR.ctl)}, Ermüdung {n1(lastR.atl)}, Form {lastR.tsb > 0 ? '+' : ''}{n1(lastR.tsb)} – Zone „{zone(lastR.tsb)}“. </Fragment> : null}
        {pmc && pmc.conf === 'low' ? `${pmc.src === 'hansport' ? 'hansport' : 'athletedata'} stuft die Werte als wenig gesichert ein (Belastungsdaten erst seit ${dShort(pmc.since)}). ` : ''}
        Die Zonen folgen der verbreiteten Konvention (u. a. intervals.icu) und sind Richtwerte.
      </p>
      {rows.length ? <Table head={['Tag', 'Fitness', 'Ermüdung', 'Form', 'Last']} rows={rows.map((q) => [dWeek(q.date), n1(q.ctl), n1(q.atl), n1(q.tsb), q.r.load != null ? n0(q.r.load) : '–'])} /> : null}
    </Fragment>
  );
}

// ---------- VO2max: Verlauf über Monate ----------
function VO2Detail({ H, end }) {
  const [p, setP] = useState('h');
  const [sel, setSel] = useState(null);
  const all = useMemo(() => daily(H.list, (r) => r.vo2, '0000', end), [H, end]);
  const W = windowOf(p, end), x = { ...xDomain(p, W), min: tOf(W.from) - DAY / 2, max: tOf(W.to) + DAY / 2 };
  const pts = all.filter((q) => q.date >= W.from && q.date <= W.to);
  const st = stats(pts);
  const fr = lastRow(H, end, (r) => r.fitAge);
  const y = pts.length ? niceTicks(Math.min(...pts.map((q) => q.v)) - 3, Math.max(...pts.map((q) => q.v)) + 3, 4, true) : null;
  const first = all.length ? all[0].date : null;
  return (
    <Fragment>
      <Seg2 value={p} onChange={(v) => { setP(v); setSel(null); }} label="Zeitraum" options={PER_OPTS(['d', 'w'])} />
      <Headline label={sel ? dWeek(sel.date) : 'VO2max Rad · zuletzt'} value={sel ? sel.v : st ? st.last.v : 'keine Daten'} unit="ml/kg/min" fmt={n0}
        sub={sel ? 'Garmin-Schätzung' : (st ? 'am ' + dShort(st.last.date) : '') + (fr ? ' · Fitnessalter ' + fr.fitAge + ' (Garmin)' : '')} />
      <div class="t2" style="padding:8px 10px 6px">
        {pts.length ? (
          <TimeChart height={190} x={x} y={y} unit="ml/kg/min" label="VO2max-Verlauf" animKey={p} snap={pts} sel={sel} onSel={setSel} marks={(q) => [{ v: q.v, color: 'var(--c)' }]}
            layers={(s) => [
              first && first > W.from ? <NoDataSpan s={s} t0={x.min} t1={tOf(first) - DAY / 2} text={'Daten ab ' + dShort(first)} /> : null,
              <Line s={s} data={pts} color="var(--c)" width={2} />,
              <Points s={s} data={pts} color="var(--c)" />,
            ]} />
        ) : <div class="empty2">Keine VO2max-Werte in diesem Zeitraum. Wähle einen längeren Zeitraum.</div>}
      </div>
      {st ? (
        <div class="t2" style="margin-top:12px;padding:14px 12px 10px">
          <div class="lbl2" style="margin:0 4px">Einordnung auf der Skala 30–70</div>
          <RangeScale min={30} max={70} lo={30} hi={st.last.v} ticks={['30', '40', '50', '60', '70 ml/kg/min']} markers={[{ v: st.last.v }]} />
        </div>
      ) : null}
      <p class="say2">{st ? `${st.n} Garmin-Schätzungen im Zeitraum, ${st.min.v === st.max.v ? 'durchgehend ' + st.max.v : 'zwischen ' + st.min.v + ' und ' + st.max.v}. ` : ''}Die Fitnesskategorie nach Alter und Geschlecht berechnet Garmin in Connect; über athletedata kommt nur der Wert und dein Fitnessalter.</p>
      {pts.length ? <Table head={['Tag', 'VO2max']} rows={pts.map((q) => [dWeek(q.date), q.v])} /> : null}
    </Fragment>
  );
}

// ---------- Konfiguration je Kennzahl ----------
const band = (b) => (b && b[0] != null ? [b[0] - b[1], b[0] + b[1]] : null);
const STRESS_Z = [[0, 25, 'Ruhe', 0.03], [25, 50, 'niedrig', 0.07], [50, 75, 'mittel', 0.12], [75, 100, 'hoch', 0.18]];
const CFG = {
  hrv: { kind: 'trend', title: 'HRV', unit: 'ms', get: (r) => r.hrv, band: (r) => band(r.base && r.base.hrv), int: true, flat: 3, say: (v, r) => M.hrv.say && M.hrv.say(v, r) },
  resp: { kind: 'trend', title: 'Atemfrequenz', unit: '/min', get: (r) => r.resp, band: (r) => band(r.base && r.base.resp), fmt: fmtOf(1), flat: 0.3, say: (v, r) => M.resp.say(v, r) },
  steps: { kind: 'bars', title: 'Schritte', unit: '', agg: 'sum', get: (r) => (r.g && r.g.steps != null ? r.g.steps : r.steps), goal: (r) => (r.g ? r.g.stepsGoal : null), partial: (r) => !!(r.g && r.g.partial), say: (v, r) => M.steps.say(v, r) },
  kcal: { kind: 'bars', title: 'Aktive Kalorien', unit: 'kcal', agg: 'sum', get: (r) => (r.g && r.g.act != null ? r.g.act : r.act), partial: (r) => !!(r.g && r.g.partial) },
  im: { kind: 'bars', title: 'Intensitätsminuten', unit: 'min', agg: 'sum', get: (r) => (r.g ? r.g.im : null), partial: (r) => !!(r.g && r.g.partial), weekGoal: (H, end) => { const r = lastRow(H, end, (x) => (x.g ? x.g.imGoal : null)); return r ? r.g.imGoal : null; }, goalLabel: 'Wochenziel (Garmin)', note: () => 'Garmin zählt mittlere Minuten einfach und hohe doppelt.' },
  stress: { kind: 'bars', title: 'Stress', unit: '', agg: 'mean', y100: true, zones: STRESS_Z, get: (r) => (r.g ? r.g.stress : null), partial: (r) => !!(r.g && r.g.partial), say: (v) => M.stress.say(v) },
  rec: { kind: 'bars', title: 'Bereitschaft', unit: '', agg: 'mean', y100: true, get: (r) => M.rec.get(r), say: (v, r) => M.rec.say && M.rec.say(v, r) },
  akcal: { kind: 'bars', title: 'Kalorien aus Aktivitäten', unit: 'kcal', agg: 'sum', get: (r) => r.akcal },
  slScore: { kind: 'bars', title: 'Schlafscore', unit: '', agg: 'mean', y100: true, get: (r) => (r.sl && r.sl.score != null ? r.sl.score : r.slScore), say: (v, r) => M.slScore.say && M.slScore.say(v, r) },
};

export function MetricDetail({ H, end, k }) {
  if (k === 'rhr' || k === 'hr') return <PulseDetail H={H} end={end} />;
  if (k === 'sleep') return <SleepDetail H={H} end={end} />;
  if (BODY.some((b) => b[0] === k)) return <WeightDetail H={H} end={end} k0={k} />;
  if (k === 'bb') return <BBDetail H={H} end={end} />;
  if (k === 'vo2') return <VO2Detail H={H} end={end} />;
  if (k === 'ctl' || k === 'atl' || k === 'tsb') return <PMCDetail H={H} end={end} />;
  const c = CFG[k];
  if (!c) return <div class="empty2">Für diese Kennzahl gibt es noch keine Detailansicht.</div>;
  return c.kind === 'trend' ? <TrendDetail H={H} end={end} cfg={c} /> : <BarsDetail H={H} end={end} cfg={c} />;
}

export function MetricView({ k }) {
  useStatus();
  const H = healthDays();
  const end = todayLocal();
  const m = M[k] || { label: k };
  const r = lastRow(H, end, (x) => (m.get ? m.get(x) : null)) || H.map[end] || {};
  const src = m.src ? srcName(m.src(r)) : '';
  return (
    <div class={'view md has-sky ' + gcls(k)}>
      <div class="md-sky" aria-hidden="true" />
      <Top title={k === 'ctl' || k === 'atl' || k === 'tsb' ? 'Trainingsbelastung' : m.label} />
      <div class={'md-body ' + gcls(k)}>
        <div class="md-head"><span class="md-ic"><Ico n={m.icon || 'activity'} /></span><span class="lbl2">{k === 'ctl' || k === 'atl' || k === 'tsb' ? 'Fitness · Ermüdung · Form' : m.label}</span>{src ? <span class="md-src">{src}</span> : null}</div>
        {H.list.length ? <MetricDetail H={H} end={end} k={k} /> : <div class="empty2">Noch keine Gesundheitsdaten abgeglichen. Ziehe auf „Heute“ nach unten zum Abgleichen.</div>}
        {m.explain ? (
          <section class="md-info">
            <div class="lbl2">Was bedeutet das?</div>
            <p>{m.explain}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
