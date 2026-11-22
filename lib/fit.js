// Originaldatei einer Garmin-Aktivität (ZIP mit FIT) laden und in kompakte Zeitreihen übersetzen.
// Schlüssel wie bei den bisherigen Strava-Zeitreihen, damit die App sie unverändert auswerten kann.
import { unzipSync } from 'fflate';
import { Decoder, Stream, Profile } from '@garmin/fitsdk';
import { AppError } from './http.js';
import { garminFetch } from './garmin.js';

const SEMI = 180 / 2 ** 31;

export async function loadFitBytes(id) {
  if (!/^\d{1,15}$/.test(String(id))) throw new AppError('bad_id', 'Ungültige Aktivitäts-ID', 400);
  const buf = await garminFetch('/download-service/files/activity/' + id, {}, { raw: true });
  if (!buf || !buf.length) throw new AppError('no_file', 'Garmin liefert für diese Aktivität keine Datei.', 404);
  return extractFit(buf);
}

export function extractFit(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x50 && u8[1] === 0x4b) {
    const files = unzipSync(u8);
    const names = Object.keys(files);
    const n = names.find((x) => /\.fit$/i.test(x)) || names[0];
    if (!n) throw new AppError('no_fit', 'Das Archiv enthält keine FIT-Datei.', 422);
    if (!/\.fit$/i.test(n)) throw new AppError('not_fit', 'Originaldatei ist keine FIT-Datei (' + n.split('.').pop() + ').', 422);
    return files[n];
  }
  return u8;
}

export function decodeFit(u8) {
  const stream = Stream.fromByteArray(u8);
  const dec = new Decoder(stream);
  if (!dec.isFIT()) throw new AppError('not_fit', 'Keine gültige FIT-Datei.', 422);
  const { messages, errors } = dec.read({
    applyScaleAndOffset: true, expandSubFields: true, expandComponents: true, convertTypesToStrings: true,
    convertDateTimesToDates: true, includeUnknownData: false, mergeHeartRates: true,
  });
  if (!messages || (!messages.recordMesgs && !messages.sessionMesgs && !messages.setMesgs)) throw new AppError('fit_empty', 'FIT-Datei ohne Daten' + (errors && errors.length ? ': ' + String(errors[0].message || errors[0]).slice(0, 120) : ''), 422);
  return messages;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// Rohe Reihen in voller Auflösung
export function series(m) {
  const rec = (m.recordMesgs || []).filter((r) => r.timestamp);
  if (!rec.length) return null;
  const t0 = +rec[0].timestamp;
  const out = { time: [], distance: [], altitude: [], location: [], heart_rate: [], watts: [], cadence: [], speed: [], temp: [] };
  let hasLL = false, hasHr = false, hasW = false, hasCad = false, hasAlt = false, hasD = false, hasV = false, hasT = false;
  for (const r of rec) {
    out.time.push(Math.round((+r.timestamp - t0) / 1000));
    const d = num(r.distance); out.distance.push(d); if (d != null) hasD = true;
    const a = num(r.enhancedAltitude) ?? num(r.altitude); out.altitude.push(a); if (a != null) hasAlt = true;
    const la = num(r.positionLat), lo = num(r.positionLong);
    if (la != null && lo != null && !(la === 0 && lo === 0)) { out.location.push([la * SEMI, lo * SEMI]); hasLL = true; } else out.location.push(null);
    const hr = num(r.heartRate); out.heart_rate.push(hr); if (hr != null) hasHr = true;
    const w = num(r.power); out.watts.push(w); if (w != null) hasW = true;
    const c = num(r.cadence); out.cadence.push(c); if (c != null) hasCad = true;
    const v = num(r.enhancedSpeed) ?? num(r.speed); out.speed.push(v); if (v != null) hasV = true;
    const tp = num(r.temperature); out.temp.push(tp); if (tp != null) hasT = true;
  }
  // Lücken in der Position mit dem letzten bekannten Punkt füllen (Tunnel, Pausen), Anfang mit dem ersten
  if (hasLL) {
    let last = out.location.find(Boolean);
    for (let i = 0; i < out.location.length; i++) { if (out.location[i]) last = out.location[i]; else out.location[i] = last; }
  }
  // Distanz ohne Lücken (vorwärts füllen)
  if (hasD) { let last = 0; for (let i = 0; i < out.distance.length; i++) { if (out.distance[i] == null) out.distance[i] = last; else last = out.distance[i]; } }
  // geglättete Geschwindigkeit (5 Punkte) und Bewegung
  const vs = new Array(rec.length).fill(null);
  if (hasV) for (let i = 0; i < rec.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(rec.length - 1, i + 2); j++) if (out.speed[j] != null) { s += out.speed[j]; n++; } vs[i] = n ? s / n : null; }
  const moving = rec.map((r, i) => {
    if (i > 0 && out.time[i] - out.time[i - 1] > 30 && hasD && out.distance[i] - out.distance[i - 1] < 15) return false; // Timer-Pause
    if (vs[i] != null) return vs[i] > 0.35;
    return (out.watts[i] || 0) > 0 || (out.cadence[i] || 0) > 0;
  });
  return {
    n: rec.length,
    time: out.time, distance: hasD ? out.distance : null, altitude: hasAlt ? out.altitude : null, location: hasLL ? out.location : null,
    heart_rate: hasHr ? out.heart_rate : null, watts: hasW ? out.watts : null, cadence: hasCad ? out.cadence : null,
    velocity_smooth: hasV ? vs : null, moving, temp: hasT ? out.temp : null,
  };
}

const KEYS = ['time', 'distance', 'altitude', 'location', 'heart_rate', 'watts', 'cadence', 'velocity_smooth', 'moving', 'temp'];

// Auf höchstens res Punkte ausdünnen (gleichmäßig über die Punkte, Ende immer enthalten)
export function sample(s, res, keys = KEYS) {
  const n = s.n;
  const idx = [];
  if (!res || res >= n) for (let i = 0; i < n; i++) idx.push(i);
  else { for (let k = 0; k < res; k++) idx.push(Math.round((k * (n - 1)) / (res - 1))); }
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const r6 = (p) => (p ? [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6] : null);
  const out = {};
  for (const k of keys) {
    const a = s[k];
    if (!a) continue;
    out[k] = idx.map((i) => (k === 'location' ? r6(a[i]) : k === 'velocity_smooth' ? r2(a[i]) : k === 'distance' || k === 'altitude' ? r1(a[i]) : k === 'moving' ? !!a[i] : a[i]));
  }
  return out;
}

// ---------- Polyline ----------
function dp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const lat0 = (pts[0][0] * Math.PI) / 180;
  const X = (p) => p[1] * 111320 * Math.cos(lat0), Y = (p) => p[0] * 110540;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const ax = X(pts[a]), ay = Y(pts[a]), bx = X(pts[b]), by = Y(pts[b]);
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = X(pts[i]), py = Y(pts[i]);
      let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol * tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export function encodePolyline(pts) {
  let out = '', pl = 0, pg = 0;
  const enc = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [la, lo] of pts) { const a = Math.round(la * 1e5), b = Math.round(lo * 1e5); out += enc(a - pl) + enc(b - pg); pl = a; pg = b; }
  return out;
}
export function summaryPolyline(s, maxPts = 700) {
  if (!s || !s.location) return null;
  const pts = s.location.filter(Boolean);
  if (pts.length < 2) return null;
  let tol = 6, r = dp(pts, tol);
  while (r.length > maxPts && tol < 200) { tol *= 1.5; r = dp(pts, tol); }
  return encodePolyline(r);
}

// ---------- Runden und Krafttraining ----------
export function laps(m) {
  return (m.lapMesgs || []).map((l) => ({
    el: num(l.totalElapsedTime), mov: num(l.totalTimerTime), d: num(l.totalDistance), gain: num(l.totalAscent),
    hr: num(l.avgHeartRate), hrMax: num(l.maxHeartRate), w: num(l.avgPower), np: num(l.normalizedPower), cad: num(l.avgCadence), v: num(l.enhancedAvgSpeed) ?? num(l.avgSpeed),
  }));
}

const CAT = (Profile.types && Profile.types.exerciseCategory) || {};
const nice = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export function sets(m) {
  const out = [];
  for (const s of m.setMesgs || []) {
    if (s.setType && String(s.setType).toLowerCase() !== 'active') continue;
    let cat = Array.isArray(s.category) ? s.category[0] : s.category;
    if (typeof cat === 'number') cat = CAT[cat] || 'Unbekannt';
    out.push({ name: cat ? nice(cat) : 'Unbekannt', muscles: [], kg: num(s.weight), unit: 'kg', reps: num(s.repetitions), sec: num(s.duration) != null ? Math.round(s.duration) : null });
  }
  return out;
}

export function sessionInfo(m) {
  const s = (m.sessionMesgs || [])[0] || {};
  return { sport: s.sport || null, subSport: s.subSport || null, tempAvg: num(s.avgTemperature), tempMin: num(s.minTemperature), tempMax: num(s.maxTemperature), np: num(s.normalizedPower), tss: num(s.trainingStressScore) };
}
