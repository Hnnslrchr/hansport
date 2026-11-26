// Bereitschaft (Variante B „Spektrum“) – ein Wert für die ganze App: Heute, Gesundheit und Coach.
// Ohne Gesundheitswerte erscheint stattdessen die Belastungsbilanz (nur aus dem Training).
import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Head, Big, Ico } from '../ui/hp.jsx';
import { Spectrum, DevBar, MeasureLine } from '../ui/r5.jsx';
import { readiness, recommendation, balance, recFor, WEIGHTS, FACTOR_LABEL } from '../coach-logic.js';
import { addD } from '../viz-data.js';
import { num, dayMon, NB } from '../format.js';
import { push } from '../nav.js';
import { reducedMotion } from '../ui/spring.js';

const n0 = (v) => num(v, 0);
const FCOL = { hrv: 'var(--c-erh)', sleep: 'var(--c-sch)', rhr: 'var(--c-herz)', load: 'var(--c-akt)', bb: 'var(--c2-erh)' };
const ORDER = ['hrv', 'sleep', 'rhr', 'load', 'bb'];

// Wert gleitet beim Erscheinen dezent an seine Stelle (bei reduzierter Bewegung sofort)
function useSettle(v) {
  const [x, setX] = useState(reducedMotion() ? v : v == null ? null : Math.max(0, v - 18));
  useEffect(() => { const t = setTimeout(() => setX(v), 30); return () => clearTimeout(t); }, [v]);
  return x;
}

export function ReadinessCard({ H, date, plan, full = false, today }) {
  const R = readiness(H, date);
  const [open, setOpen] = useState(false);
  const mk = useSettle(R ? R.score : null);
  if (!R) return <BalanceCard H={H} date={date} />;
  const rec = recommendation(R, H, date, plan);
  const parts = ORDER.map((k) => R.parts.find((p) => p.k === k)).filter(Boolean);
  const old = R.date !== date;
  return (
    <div class={'tile w2 g-erh glow rdy' + (R.score >= 75 || R.score < 40 ? ' gl-hi' : '')} style={'--gx:' + R.score + '%;--gy:0%;--gs:70% 60%'}>
      <Head icon="battery-full" label="Bereitschaft" src="hansport" />
      <div class="rdy-top">
        <Big v={R.score} u="/100" cls="xl" />
        <div class="rdy-lvl"><b>{R.level.name}</b><span>{old ? 'Werte von ' + (R.date === addD(date, -1) ? 'gestern' : dayMon(R.date)) : 'aus ' + parts.length + ' Faktoren'}</span></div>
      </div>
      <Spectrum value={mk} label={'Bereitschaft ' + R.score + ' von 100, ' + R.level.name} />
      <p class="rdy-rec"><b>{rec.title}.</b> {rec.detail}</p>
      {rec.notes.length ? <ul class="rdy-notes">{rec.notes.map((x) => <li>{x}</li>)}</ul> : null}
      {full && rec.reasons.length ? <ul class="rdy-notes muted">{rec.reasons.map((x) => <li>{x}</li>)}</ul> : null}
      {full && rec.planNote ? <div class="hp-sub">{rec.planNote}</div> : null}
      <div class="rdy-fx">
        <div class="rdy-fh"><span>Faktoren · Punkte</span><span class="rdy-dir"><span>← belastet</span><span>erholt →</span></span></div>
        {parts.map((p) => (
          <div class="rdy-f">
            <div class="rdy-f1"><span class="sw" style={{ background: FCOL[p.k] }} /><b>{p.label}</b><span class="w">{n0(p.w * 100)}{NB}%</span><span class="pts">{n0(p.pts)}</span></div>
            <div class="rdy-f2"><span class="v">{p.val} · {p.base}</span><DevBar dev={p.dev} color={FCOL[p.k]} label={p.label + ': ' + n0(p.pts) + ' Punkte, ' + (p.dev < -0.05 ? 'belastet' : p.dev > 0.05 ? 'erholt' : 'wie üblich')} /></div>
          </div>
        ))}
        {R.missing.length ? <div class="hp-sub">Fehlt: {R.missing.join(', ')}. Die Gewichte sind auf die übrigen Faktoren verteilt.</div> : null}
      </div>
      <button type="button" class="rdy-more" aria-expanded={String(open)} onClick={() => setOpen(!open)}>So wird gerechnet<Ico n={open ? 'nav-arrow-up' : 'nav-arrow-down'} cls="s" /></button>
      {open ? (
        <div class="rdy-calc">
          <p>Jeder Faktor wird mit deiner eigenen Basis der letzten 60 Tage verglichen: 60 Punkte heißt wie üblich, jede Standardabweichung zählt ±20. Schlaf: 0,7 × Dauer zum Bedarf + 0,3 × (100 − Schlafschuld der letzten 3 Nächte ÷ 3). Belastung: Schnitt der letzten 7 Tage zu dem der letzten 28 Tage. Gewichte: {ORDER.map((k) => FACTOR_LABEL[k] + ' ' + n0(WEIGHTS[k] * 100) + NB + '%').join(', ')}.</p>
          {full ? <table><tbody>{parts.map((p) => <tr><td>{p.label}</td><td>{p.formula} = <b>{n0(p.pts)}</b></td><td>× {n0(p.w * 100)}{NB}%</td></tr>)}</tbody></table> : null}
          <p>Summe {R.raw}{R.capped.length ? ', wegen Warnsignal auf höchstens 45 gedeckelt' : ''}. Stufen: ab 75 intensiv, 55–74 normal, 40–54 locker, darunter Ruhe. Eine Schätzung, keine medizinische Bewertung.</p>
        </div>
      ) : null}
      {!full ? <button type="button" class="rdy-link" onClick={() => push('metric', { k: 'rec' })}>Verlauf ansehen<Ico n="nav-arrow-right" cls="s" /></button> : null}
    </div>
  );
}

export function BalanceCard({ H, date }) {
  const B = balance(H, date);
  if (!B) return (
    <div class="tile w2 g-trn"><Head icon="battery-full" label="Bereitschaft" /><div class="hp-none">Noch keine Werte. Gleiche Garmin ab, dann rechnet hansport die Bereitschaft.</div></div>
  );
  const rec = recFor(B.k);
  const pts = []; for (let i = 27; i >= 0; i--) { const r = H.map[addD(B.date, -i)]; pts.push({ date: addD(B.date, -i), v: r && r.tsb != null ? r.tsb : null }); }
  return (
    <div class="tile w2 g-trn glow bal" style="--gx:85%;--gy:0%">
      <Head icon="graph-up" label="Belastungsbilanz" src="nur aus Training" />
      <div class="rdy-top">
        <Big v={(B.tsb > 0 ? '+' : B.tsb < 0 ? '−' : '') + n0(Math.abs(B.tsb))} u="Form" cls="xl" />
        <div class="rdy-lvl"><b>{B.word}</b><span>Fitness {n0(B.ctl)} · Ermüdung {n0(B.atl)}</span></div>
      </div>
      <MeasureLine pts={pts} step={10} trend={false} gapDays={99} label={'Form der letzten 28 Tage, heute ' + n0(B.tsb)} fmt={n0} height={112} />
      <p class="rdy-rec"><b>{rec.title}.</b> {rec.detail}</p>
      <div class="hp-sub">Für die Bereitschaft fehlen HRV, Ruhepuls und Schlaf. Sie kommt zurück, sobald Garmin wieder Gesundheitswerte liefert.</div>
    </div>
  );
}
