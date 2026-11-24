// EKG der Withings-Waage (Body Scan): letztes Ergebnis, Puls, Intervalle, 14-Tage-Verlauf, Kurve auf Abruf.
import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { Ico } from '../ui/hp.jsx';
import { addD, tOf, DAY } from '../viz-data.js';
import { ecgSignal } from '../health.js';
import { lastMeas, dayMon, NB } from '../format.js';

export const AFIB = {
  0: { k: 'ok', t: 'Keine Anzeichen von Vorhofflimmern', s: 'unauffällig', ic: 'check' },
  1: { k: 'af', t: 'Anzeichen von Vorhofflimmern', s: 'Vorhofflimmern', ic: 'warning-triangle' },
  2: { k: 'inc', t: 'Nicht eindeutig', s: 'nicht eindeutig', ic: 'info-circle' },
};
const IV = [['qrs', 'QRS'], ['pr', 'PR'], ['qt', 'QT'], ['qtc', 'QTc']];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');

export function ecgDays(H) {
  return H.list.filter((r) => r.wi && r.wi.ecg && (r.wi.ecg.afib != null || r.wi.ecg.hr != null || IV.some(([k]) => r.wi.ecg[k] != null)));
}

export function EcgTile({ H, today, meta, hideEmpty }) {
  const recs = ecgDays(H);
  if (!recs.length) {
    if (hideEmpty || !meta || !meta.ecg) return null;
    return (
      <div class="t2 htile glow g-herz w2 ecg" style="--gx:100%;--gy:100%;--gs:55% 120%">
        <div class="t2-h"><Ico n="activity" /><span class="lb">EKG</span></div>
        <div class="hv"><span class="mid2 hp-none">keine Daten</span></div>
        <p class="sub2" style="margin-top:6px">Withings hat bisher keine EKG-Aufnahmen übermittelt. Möglich ist, dass die Schnittstelle EKG-Daten für dein Konto nicht freigibt oder Withings neu verbunden werden muss.</p>
      </div>
    );
  }
  const last = recs[recs.length - 1], e = last.wi.ecg;
  const A = AFIB[e.afib];
  const byDay = Object.fromEntries(recs.map((r) => [r.date, r.wi.ecg]));
  const cells = [];
  for (let j = 13; j >= 0; j--) { const d = addD(today, -j); cells.push({ d, e: byDay[d] }); }
  const from30 = addD(today, -29);
  const r30 = recs.filter((r) => r.date >= from30);
  const cnt = { ok: 0, inc: 0, af: 0 };
  for (const r of r30) { const a = AFIB[r.wi.ecg.afib]; if (a) cnt[a.k]++; }
  const hrs = r30.map((r) => r.wi.ecg.hr).filter((v) => v != null);
  const hrAvg = hrs.length >= 3 ? Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length) : null;
  const ivs = IV.filter(([k]) => e[k] != null);
  const anyIv = recs.some((r) => IV.some(([k]) => r.wi.ecg[k] != null));
  const age = Math.round((tOf(today) - tOf(last.date)) / DAY);
  const flag = A && A.k !== 'ok' && age <= 7;
  const cellTxt = (c) => WD[new Date(c.d + 'T12:00:00').getDay()] + ' ' + dayMon(c.d) + ': ' + (c.e ? (AFIB[c.e.afib] ? AFIB[c.e.afib].s : 'ohne Ergebnis') : 'keine Messung');
  return (
    <div class={'t2 htile glow g-herz w2 ecg' + (flag ? ' gl-hi' : '')} style="--gx:100%;--gy:100%;--gs:55% 120%">
      <div class="t2-h"><Ico n="activity" /><span class="lb">EKG</span>{A ? <span class={'pos' + (A.k !== 'ok' ? ' bad' : '')}>{A.s}</span> : null}</div>
      <div class={'ecg-res ' + (A ? A.k : '')}>{A ? <Ico n={A.ic} /> : null}<span>{A ? A.t : 'Ohne Ergebnis'}</span></div>
      <div class="hv"><span class="mid2">{e.hr != null ? e.hr : '–'}<small>bpm</small></span><span class="trd">Puls bei der Messung{hrAvg != null ? ' · Ø 30 Tage ' + hrAvg : ''}</span></div>
      {ivs.length ? (
        <div class="ecg-iv">{ivs.map(([k, l]) => <span><small>{l}</small><b>{e[k]}<small>{NB}ms</small></b></span>)}</div>
      ) : null}
      <div class="ecg-days" role="img" aria-label={'EKG der letzten 14 Tage: ' + cells.map(cellTxt).join(', ')}>
        {cells.map((c, i) => { const a = c.e && AFIB[c.e.afib]; return (
          <span class={'ecg-c ' + (a ? a.k : c.e ? 'nr' : 'none')} title={cellTxt(c)}>{a && a.k === 'af' ? '!' : a && a.k === 'inc' ? '?' : ''}</span>
        ); })}
      </div>
      <div class="ecg-ax"><span>{dayMon(cells[0].d)}</span><span>heute</span></div>
      <div class="ecg-leg">
        <span><i class="ecg-c ok" />{cnt.ok} unauffällig</span>
        {cnt.inc ? <span><i class="ecg-c inc">?</i>{cnt.inc} nicht eindeutig</span> : null}
        {cnt.af ? <span><i class="ecg-c af">!</i>{cnt.af} Vorhofflimmern</span> : null}
        <span class="muted">{r30.length} Messungen in 30 Tagen</span>
      </div>
      {flag ? (
        <p class="ecg-note"><Ico n="info-circle" />{A.k === 'af'
          ? 'Withings hat bei dieser Messung Anzeichen von Vorhofflimmern erkannt. hansport stellt keine Diagnose. Bitte lass das ärztlich abklären, besonders bei Beschwerden wie Herzrasen, Schwindel oder Atemnot.'
          : 'Das Ergebnis war nicht eindeutig. Wiederhole die Messung in Ruhe und mit festem Stand. Wenn das öfter vorkommt, lass es ärztlich abklären.'}</p>
      ) : null}
      {e.sid ? <EcgCurve sid={e.sid} /> : null}
      <div class="sub2">{lastMeas(last.date)}{e.t ? ' · ' + hhmm(e.t) : ''}{e.n > 1 ? ' · ' + e.n + ' Messungen an dem Tag' : ''} · Ergebnis laut Withings, keine Diagnose{!anyIv ? ' · Intervalle (QRS, PR, QT): keine Daten' : ''}</div>
    </div>
  );
}

// Kurve: wird bei Bedarf von Withings geladen, nur angezeigt und nicht gespeichert
function EcgCurve({ sid }) {
  const [st, setSt] = useState(null);
  const load = async () => { setSt({ busy: true }); setSt(await ecgSignal(sid)); };
  if (!st) return <button type="button" class="btn sec2 ecg-btn" onClick={load}><Ico n="activity" />EKG-Kurve anzeigen</button>;
  if (st.busy) return <div class="ecg-curve sk" aria-busy="true" aria-label="EKG-Kurve wird geladen" />;
  if (!st.ok || !st.pts || st.pts.length < 50) return <p class="sub2 ecg-err">Die Kurve konnte nicht geladen werden{st.err ? ' (' + st.err + ')' : ''}. Withings gibt sie über die Schnittstelle möglicherweise nicht für jedes Konto frei.</p>;
  const fs = st.fs, secs = Math.min(6, st.pts.length / fs), n = Math.round(secs * fs);
  // Grundlinie ausgleichen: gleitender Mittelwert über 1 s abziehen
  const raw = st.pts.slice(0, n), w = Math.max(1, Math.round(fs / 2)), y = [];
  let sum = 0; const pre = [0]; for (const v of st.pts) pre.push((sum += v));
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - w), b = Math.min(st.pts.length, i + w + 1); y.push((raw[i] - (pre[b] - pre[a]) / (b - a)) / 1000); }
  const srt = y.slice().sort((p, q) => p - q), lo = Math.min(-0.5, srt[Math.floor(n * 0.005)]), hi = Math.max(1, srt[Math.ceil(n * 0.995) - 1]);
  const W = 600, Hh = 150, X = (i) => (i / fs / secs) * W, Y = (v) => 6 + (1 - (v - lo) / (hi - lo)) * (Hh - 12);
  const d = y.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(Math.max(lo, Math.min(hi, v))).toFixed(1)).join('');
  const vg = []; for (let t = 0.2; t < secs; t += 0.2) vg.push(t);
  const hg = []; for (let v = Math.ceil(lo * 2) / 2; v <= hi; v += 0.5) hg.push(v);
  return (
    <figure class="ecg-curve">
      <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" role="img" aria-label={'EKG-Kurve, erste ' + Math.round(secs) + ' Sekunden der Aufnahme'}>
        {vg.map((t) => <line x1={X(t * fs)} x2={X(t * fs)} y1="0" y2={Hh} class={Math.abs(t - Math.round(t)) < 1e-6 ? 'g1' : 'g0'} />)}
        {hg.map((v) => <line x1="0" x2={W} y1={Y(v)} y2={Y(v)} class="g0" />)}
        <path d={d} fill="none" stroke="var(--c)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <figcaption class="sub2">Erste {Math.round(secs)} s von {Math.round(st.dur || secs)} s · Raster 0,2 s und 0,5 mV · Grundlinie zur Anzeige ausgeglichen · wird nicht gespeichert</figcaption>
    </figure>
  );
}
