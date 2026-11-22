// Runde 4: kompakte Skalen und Fortschritt mit Verlauf
import { h } from 'preact';

// Senkrechte Verlaufsskala: Normalbereich [lo, hi] als Verlauf, Marker beim Wert.
export function VScale({ min, max, lo, hi, value, label, fmt = (x) => x }) {
  if (min == null || max == null || max <= min) return null;
  const y = (v) => 100 - Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const out = value != null && lo != null && hi != null && (value < lo || value > hi);
  return (
    <div class="vscale" role="img" aria-label={label}>
      <div class="tr">{lo != null && hi != null ? <span class="bd" style={{ top: y(hi) + '%', bottom: 100 - y(lo) + '%' }} /> : null}</div>
      {value != null ? <span class={'mk' + (out ? ' out' : '')} style={{ top: y(value) + '%' }} /> : null}
      {hi != null ? <span class="lb" style={{ top: y(hi) + '%' }}>{fmt(hi)}</span> : null}
      {lo != null ? <span class="lb" style={{ top: y(lo) + '%' }}>{fmt(lo)}</span> : null}
    </div>
  );
}

// Fortschrittsbalken mit Verlauf
export function GBar({ value, max, left, right, label }) {
  const f = max ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div class="gbar" role="img" aria-label={label}>
      <div class="tr"><span class={'fl' + (f >= 1 ? ' done' : '')} style={{ width: Math.max(f > 0 ? 3 : 0, f * 100) + '%' }} /></div>
      {left || right ? <div class="meta"><span>{left}</span><span>{right}</span></div> : null}
    </div>
  );
}
