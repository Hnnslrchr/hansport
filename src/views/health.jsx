import { h, Fragment } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { useStatus } from './common.jsx';
import { Ico, Head, Big, NoData, LineChart, ScaleG, usePullToRefresh, PtrIndicator, srcName } from '../ui/hp.jsx';
import { Top, Seg, Sheet } from '../ui/kit.jsx';
import { openSheet, push } from '../nav.js';
import { healthDays, healthMeta, todayLocal } from '../health.js';
import { M, latest, series, formWord } from '../metrics.js';
import { refreshAll } from './today.jsx';
import { dateShort, num, int, relDate , endDot } from '../format.js';
import { WEB } from '../env.js';

const GROUPS = [
  ['Erholung und Schlaf', ['rec', 'sleep', 'slScore', 'bb', 'stress']],
  ['Herz und Atmung', ['hrv', 'rhr', 'resp', 'vo2']],
  ['Aktivität und Training', ['steps', 'im', 'kcal', 'ctl', 'atl', 'tsb']],
  ['Körper', ['weight', 'fatPct', 'muscle', 'visceral', 'vasc', 'pwv']],
];

export function Health() {
  useStatus();
  const H = healthDays();
  const meta = healthMeta();
  const today = todayLocal();
  const scroller = useRef();
  usePullToRefresh(scroller, refreshAll);
  return (
    <div class="view root" ref={scroller}>
      <PtrIndicator />
      <div class="hp-hero" style="padding-top:18px"><div style="flex:1"><div class="hp-lbl">{WEB ? 'Garmin · Withings' : 'Garmin · Withings · athletedata'}</div><h1>Gesundheit</h1></div></div>
      {!H.list.length ? <div class="hp-banner"><Ico n="info-circle" /><div>Noch keine Gesundheitsdaten abgeglichen. Ziehe nach unten zum Abgleichen.</div></div> : null}
      {GROUPS.map(([title, keys]) => (
        <Fragment>
          <div class="sec"><h2>{title}</h2></div>
          <div class="list">
            {keys.map((k) => {
              const m = M[k], l = latest(H.list, k);
              const age = l ? Math.round((new Date(today + 'T12:00:00') - new Date(l.date + 'T12:00:00')) / 864e5) : null;
              const say = l && m.say ? m.say(l.v, l.r) : null;
              return (
                <button type="button" class="mrow" onClick={() => push('metric', { k })}>
                  <span class="ic"><Ico n={m.icon} /></span>
                  <span><div class="t1">{m.label}</div><div class="t2">{l ? (age > 1 ? relDate(l.date) + ' · ' : '') + (say || srcName(m.src(l.r))) : 'keine Daten'}</div></span>
                  <span class="v">{l ? <Fragment><b>{m.fmt(l.v)}</b><small>{m.unit}</small></Fragment> : <span class="hp-none">–</span>}</span>
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}
      <div class="sec"><h2>Nicht verfügbar</h2></div>
      <div class="list">
        <div class="mrow"><span class="ic"><Ico n="heart" /></span><span><div class="t1">Blutdruck</div><div class="t2">Kein Messgerät verbunden (z. B. Withings BPM).</div></span><span class="v hp-none">–</span></div>
        <div class="mrow"><span class="ic"><Ico n="droplet" /></span><span><div class="t1">SpO2</div><div class="t2">Garmin liefert derzeit keine Werte.</div></span><span class="v hp-none">–</span></div>
        <div class="mrow"><span class="ic"><Ico n="cutlery" /></span><span><div class="t1">Ernährung</div><div class="t2">Keine Quelle verbunden.</div></span><span class="v hp-none">–</span></div>
      </div>
      <div class="hp-sub" style="padding:12px 16px 0">{meta.lastSync ? 'Zuletzt abgeglichen ' + new Date(meta.lastSync).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '. ' : ''}Garmin-Werte liegen ab 11. Oktober 2026 vor; dein Garmin-Archiv ergänzt ältere Zeiten, sobald es bei athletedata hochgeladen ist.</div>
    </div>
  );
}

const RANGES = [['w', 'Woche', 7], ['m', 'Monat', 30], ['q', '3 Mon.', 91], ['y', 'Jahr', 365]];
export function MetricSheet({ k, end }) {
  const m = M[k];
  const H = healthDays();
  const [rg, setRg] = useState(m.sparse ? 'y' : 'm');
  const n = RANGES.find((r) => r[0] === rg)[2];
  const s = useMemo(() => series(H.map, k, end, n), [H, k, end, n]);
  const l = latest(H.list, k, end);
  const vals = s.map((x) => x.v).filter((v) => v != null);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const nb = l && m.normal ? m.normal(l.r) : null;
  const pts = s.map((x) => ({ date: x.date, v: x.v, label: dateShort(x.date), tick: dateShort(x.date) }));
  return (
    <Sheet title={m.label}>
      <div class="hp-row" style="align-items:flex-end">
        <div class="grow">{l ? <Big v={m.fmt(l.v)} u={m.unit} cls="xl" /> : <NoData />}</div>
        {l ? <span class="hp-src">{srcName(m.src(l.r))}</span> : null}
      </div>
      <div class="hp-sub" style="margin-top:4px">{l ? (l.date === end ? (k === 'sleep' || k === 'slScore' || k === 'hrv' ? 'Letzte Nacht' : 'Heute') : 'Stand ' + dateShort(l.date)) + (m.say && m.say(l.v, l.r) ? ' · ' + m.say(l.v, l.r) : '') : 'Keine Messung bis ' + endDot(dateShort(end))}{k === 'tsb' && l ? ' · ' + formWord(l.v) : ''}</div>
      <Seg value={rg} onChange={setRg} label="Zeitraum" options={RANGES.map((r) => [r[0], r[1]])} />
      <LineChart points={pts} fmt={(v) => m.fmt(v) + ' ' + m.unit} band={nb} bars={k === 'steps' || k === 'stress'} label={m.label + ' Verlauf'} />
      <div class="stats" style="margin:6px 0 4px">
        <div class="stat"><div class="v">{avg != null ? m.fmt(avg) : '–'}</div><div class="l">Ø Zeitraum</div></div>
        <div class="stat"><div class="v">{vals.length ? m.fmt(Math.min(...vals)) : '–'}</div><div class="l">Tiefster</div></div>
        <div class="stat"><div class="v">{vals.length ? m.fmt(Math.max(...vals)) : '–'}</div><div class="l">Höchster</div></div>
      </div>
      {nb ? <div class="small"><b>Dein Normalbereich:</b> {m.fmt(nb[0])}–{m.fmt(nb[1])} {m.unit}{m.normal && (k === 'hrv' || k === 'rhr' || k === 'resp') ? ' (Mittelwert ± Streuung deiner letzten 60 Tage, berechnet von athletedata)' : k === 'sleep' ? ' (dein Schlafbedarf ± 30 min)' : ''}.</div> : null}
      <div class="small" style="color:var(--ink-2)">{m.explain}</div>
      <div class="tiny faint">{vals.length} von {n} Tagen mit Wert. Fehlende Tage bleiben leer, es wird nichts geschätzt.</div>
    </Sheet>
  );
}

export function Coach() {
  return (
    <div class="view root">
      <div class="hp-hero" style="padding-top:18px"><div style="flex:1"><div class="hp-lbl">Analyse und Chat</div><h1>Coach</h1></div></div>
      <div class="bento">
        <div class="tile contrast w2">
          <Head icon="sparks" label="Etappe 4" />
          <div style="font-size:var(--fs-t3);font-weight:600;letter-spacing:-.03em;line-height:1.25">Hier entsteht dein Coach.</div>
          <div class="hp-sub">Auswertungen, die Training, Erholung und Schlaf verbinden, plus ein Chat, der Claude nutzt und deine Fragen auf Basis deiner Daten und Ziele beantwortet. Gebaut wird er in Etappe 4.</div>
        </div>
      </div>
    </div>
  );
}
