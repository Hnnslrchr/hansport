// Federn nach dem Apple-Modell (Dämpfung + Response statt fester Dauer).
// Jede Bewegung startet beim aktuellen Wert und übernimmt die aktuelle Geschwindigkeit –
// eine neue Zielvorgabe mitten in der Bewegung lenkt sie um, ohne Sprung.
const state = new WeakMap(); // el -> Map(key -> {x, v, to, raf, opts})
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

function slot(el, key) {
  let m = state.get(el);
  if (!m) { m = new Map(); state.set(el, m); }
  let s = m.get(key);
  if (!s) { s = { x: 0, v: 0, raf: 0 }; m.set(key, s); }
  return s;
}
export function getValue(el, key) { return slot(el, key).x; }
export function getVelocity(el, key) { return slot(el, key).v; }
// Wert direkt setzen (z. B. während der Finger zieht); stoppt eine laufende Feder
export function setValue(el, key, x, apply) {
  const s = slot(el, key);
  if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  s.x = x; s.v = 0;
  if (apply) apply(x);
}
export function stop(el, key) { const s = slot(el, key); if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; } }

// response in s, damping 1 = kritisch gedämpft (kein Überschwingen), < 1 = leichtes Nachfedern
export function springTo(el, key, to, { response = 0.35, damping = 1, velocity, apply, onDone, eps = 0.4 } = {}) {
  const s = slot(el, key);
  if (velocity != null) s.v = velocity;
  s.to = to;
  if (reducedMotion()) {
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0; s.x = to; s.v = 0; apply && apply(to); onDone && onDone();
    return;
  }
  const k = (2 * Math.PI / response) ** 2, c = 2 * damping * Math.sqrt(k);
  let last = performance.now();
  const step = (now) => {
    let dt = Math.min(0.064, (now - last) / 1000); last = now;
    // halbimplizites Euler-Verfahren in kleinen Schritten (stabil bei 60 und 120 Hz)
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      const a = -k * (s.x - s.to) - c * s.v;
      s.v += a * h; s.x += s.v * h; dt -= h;
    }
    if (Math.abs(s.x - s.to) < eps && Math.abs(s.v) < eps * 10) {
      s.x = s.to; s.v = 0; s.raf = 0; apply && apply(s.x); onDone && onDone();
      return;
    }
    apply && apply(s.x);
    s.raf = requestAnimationFrame(step);
  };
  if (s.raf) cancelAnimationFrame(s.raf);
  s.raf = requestAnimationFrame(step);
}

// Schwung in eine Ruheposition projizieren (wie das Ausrollen beim Scrollen)
export const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
// Gummiband am Rand: je weiter darüber hinaus, desto weniger folgt das Element
export const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

// Geschwindigkeit (px/s) aus den letzten Zeigerpositionen
export function tracker() {
  const h = [];
  return {
    add(y) { const t = performance.now(); h.push([t, y]); while (h.length > 6 || (h.length > 2 && t - h[0][0] > 100)) h.shift(); },
    // Finger zuletzt still gehalten: keine Restgeschwindigkeit
    v() { if (h.length < 2) return 0; const a = h[0], b = h[h.length - 1]; if (performance.now() - b[0] > 70) return 0; return ((b[1] - a[1]) / Math.max(1, b[0] - a[0])) * 1000; },
  };
}

// Haptik: Android über die Vibration API; iOS-Safari kennt sie nicht. Ab iOS 18 löst das
// Umschalten eines System-Schalters (<input type=checkbox switch>) eine leichte Rückmeldung aus –
// nur innerhalb einer Nutzergeste und nicht überall garantiert. Ohne Wirkung bleibt es unsichtbar.
let hapticEl = null;
export function haptic() {
  try {
    if (navigator.vibrate) { navigator.vibrate(8); return; }
    if (!hapticEl) {
      const l = document.createElement('label');
      l.setAttribute('aria-hidden', 'true');
      l.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px;overflow:hidden';
      const i = document.createElement('input');
      i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
      l.appendChild(i); document.body.appendChild(l); hapticEl = l;
    }
    hapticEl.click();
  } catch (e) { /* ohne Haptik weiter */ }
}
