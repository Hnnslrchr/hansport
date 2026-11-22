// Geometrie-Helfer: Polylines, Distanzen, Projektion, Resampling.

export function decode(str, precision = 5) {
  if (!str) return [];
  const f = Math.pow(10, precision);
  let i = 0, lat = 0, lng = 0;
  const out = [];
  while (i < str.length) {
    let shift = 0, r = 0, b;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1);
    shift = 0; r = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
    lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push([lat / f, lng / f]);
  }
  return out;
}

export function encode(pts, precision = 5) {
  const f = Math.pow(10, precision);
  let out = '', plat = 0, plng = 0;
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : (v << 1);
    let s = '';
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [la, ln] of pts) {
    const a = Math.round(la * f), b = Math.round(ln * f);
    out += enc(a - plat) + enc(b - plng);
    plat = a; plng = b;
  }
  return out;
}

const R = 6371000;
const rad = (d) => d * Math.PI / 180;

export function hav(a, b) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function cumDist(pts) {
  const d = new Array(pts.length);
  d[0] = 0;
  for (let i = 1; i < pts.length; i++) d[i] = d[i - 1] + hav(pts[i - 1], pts[i]);
  return d;
}

export function pathLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += hav(pts[i - 1], pts[i]);
  return s;
}

// Gleichmäßig nach Distanz neu abtasten (n Punkte)
export function resample(pts, n) {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]);
  const d = cumDist(pts);
  const total = d[d.length - 1] || 1;
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < d.length - 1 && d[j] < target) j++;
    const d0 = d[j - 1], d1 = d[j];
    const t = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const a = pts[j - 1], b = pts[j];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

export function meanDist(A, B) {
  let s = 0;
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) s += hav(A[i], B[i]);
  return s / n;
}

export function bbox(pts) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, ln] of pts) {
    if (la < s) s = la; if (la > n) n = la;
    if (ln < w) w = ln; if (ln > e) e = ln;
  }
  return { s, w, n, e };
}

// Web-Mercator in Weltkoordinaten 0..1
export function merc(lat, lng) {
  const x = (lng + 180) / 360;
  const sin = Math.sin(rad(Math.max(-85, Math.min(85, lat))));
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return [x, y];
}

export function unmerc(x, y) {
  const lng = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lat, lng];
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

// Index des nächstgelegenen Punkts
export function nearestIndex(pts, p, from = 0, to = pts.length) {
  let best = -1, bd = Infinity;
  for (let i = from; i < to; i++) {
    const d = hav(pts[i], p);
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: bd };
}

// Kurze Liste von Orientierungspunkten (ungefähre Koordinaten) für die Karte
export const PLACES = [
  ['Bozen', 46.4983, 11.3548, 1], ['Meran', 46.6713, 11.1525, 1], ['Trient', 46.0679, 11.1211, 1],
  ['Brixen', 46.715, 11.656, 1], ['Kaltern', 46.4146, 11.2443, 2], ['Tramin', 46.3426, 11.2425, 2],
  ['Kurtatsch', 46.3135, 11.2255, 2], ['Neumarkt', 46.3196, 11.2732, 2], ['Salurn', 46.2433, 11.1934, 2],
  ['Völs am Schlern', 46.5156, 11.5034, 2], ['Kastelruth', 46.5675, 11.56, 2], ['Seiser Alm', 46.5402, 11.618, 2],
  ['Sarnthein', 46.6431, 11.354, 2], ['Wolkenstein', 46.556, 11.7577, 2], ['Riva del Garda', 45.8858, 10.8417, 2],
  ['Arco', 45.9177, 10.8866, 2], ['Mendelpass', 46.4278, 11.1958, 3], ['Gampenpass', 46.5205, 11.1076, 3],
  ['Jaufenpass', 46.8389, 11.3218, 3], ['Penser Joch', 46.8203, 11.443, 3], ['Stilfser Joch', 46.5287, 10.4529, 3],
  ['Schlern', 46.5047, 11.5839, 3], ['Fennberg', 46.284, 11.177, 3], ['Obereggen', 46.381, 11.528, 3],
  ['Sellajoch', 46.508, 11.766, 3], ['Lana', 46.611, 11.159, 2], ['Eppan', 46.474, 11.254, 2],
];
