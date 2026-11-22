// Wiederkehrende Strecken erkennen, Teilstrecken finden, zwei Aktivitäten ausrichten.
import { decode, resample, meanDist, hav, nearestIndex, cumDist } from './geo.js';

const N = 48;

export function familyOf(a) {
  if (a.indoor) return a.sport === 'road' || a.sport === 'mtb' ? 'virtual' : null;
  if (a.sport === 'road' || a.sport === 'mtb') return 'bike';
  if (a.sport === 'hike') return 'foot';
  if (a.sport === 'splitboard') return 'ski';
  if (a.sport === 'other' && /Lauf|Trail|Spazier/.test(a.sub || '')) return 'foot';
  return null;
}

export function baseName(name) {
  return (name || '')
    .replace(/\(\s*[IVXLCDM]+\s*\)/gi, '')
    .replace(/#\s*\d+\s*/g, '')
    .replace(/\b(19|20)\d\d\b/g, '')
    .replace(/\s+\d+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const GENERIC = /^(Morgen|Mittag|Nachmittag|Abend|Nacht)|am (Morgen|Mittag|Nachmittag|Abend)|^(Fahrt|Lauf|Wanderung|Radfahrt|Spaziergang|Traillauf|Abendlauf|Abendradfahrt|Mittagsradfahrt|Mittagswanderung|Abendwanderung)/i;

export function signature(a) {
  const pts = decode(a.poly);
  if (pts.length < 4) return null;
  const r = resample(pts, N);
  return { r, start: pts[0], end: pts[pts.length - 1], len: a.dist || 0 };
}

export function compareSig(A, B) {
  if (!A || !B) return null;
  const lr = A.len && B.len ? B.len / A.len : 1;
  if (lr < 0.8 || lr > 1.25) return null;
  if (hav(A.start, B.start) > 1200 && hav(A.start, B.end) > 1200) return null;
  const thr = Math.min(450, Math.max(180, 0.012 * (A.len || 10000)));
  const m = meanDist(A.r, B.r);
  const rev = B.r.slice().reverse();
  const mr = meanDist(A.r, rev);
  if (m <= thr && m <= mr) return { dir: 'same', m };
  if (mr <= thr) return { dir: 'reverse', m: mr };
  return null;
}

// Liefert Cluster mit stabilem Schlüssel (älteste Aktivität) und Namen
export function clusterRoutes(acts, overrides = {}, names = {}) {
  const items = acts
    .filter((a) => a.poly && !a.excluded && a.dist > 800 && familyOf(a))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const sigs = new Map();
  for (const a of items) sigs.set(a.id, signature(a));
  const clusters = [];
  const byAct = {};
  for (const a of items) {
    const sg = sigs.get(a.id);
    if (!sg) continue;
    const fam = familyOf(a);
    const ov = overrides[a.id];
    if (ov === 'none') continue;
    let target = null;
    if (ov) target = clusters.find((c) => c.key === ov) || null;
    if (!target) {
      let best = null;
      for (const c of clusters) {
        if (c.family !== fam) continue;
        const r = compareSig(c.sig, sg);
        if (r && r.dir === 'same' && (!best || r.m < best.m)) best = { c, m: r.m };
      }
      if (best) target = best.c;
    }
    if (!target) {
      target = { key: ov && !clusters.find((c) => c.key === ov) ? ov : a.id, family: fam, sig: sg, members: [], indoor: !!a.indoor };
      clusters.push(target);
    }
    target.members.push(a);
    byAct[a.id] = target.key;
  }
  // Gegenrichtungen verknüpfen
  for (const c of clusters) {
    for (const d of clusters) {
      if (c === d || c.family !== d.family || c.reverseKey) continue;
      const r = compareSig(c.sig, d.sig);
      if (r && r.dir === 'reverse' && hav(c.sig.start, d.sig.start) < 600) { c.reverseKey = d.key; }
    }
  }
  for (const c of clusters) {
    c.members.sort((a, b) => (a.start < b.start ? 1 : -1));
    c.name = names[c.key] || autoName(c);
    c.custom = !!names[c.key];
    const lens = c.members.map((m) => m.dist).sort((a, b) => a - b);
    c.medLen = lens[Math.floor(lens.length / 2)] || 0;
    c.loop = hav(c.sig.start, c.sig.end) < 500;
    c.sport = mode(c.members.map((m) => m.sport));
  }
  return { clusters: clusters.sort((a, b) => b.members.length - a.members.length || (a.members[0].start < b.members[0].start ? 1 : -1)), byAct };
}

function mode(arr) {
  const m = {};
  let best = null;
  for (const x of arr) { m[x] = (m[x] || 0) + 1; if (!best || m[x] > m[best]) best = x; }
  return best;
}

function autoName(c) {
  const counts = {};
  for (const a of c.members) {
    const b = baseName(a.name);
    if (!b || GENERIC.test(b)) continue;
    counts[b] = (counts[b] || 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const a = c.members[0];
  const place = (a.place || '').split(/ - | an der | am /)[0].trim();
  const km = Math.round((c.medLen || a.dist) / 1000);
  return (c.loop ? 'Runde' : 'Strecke') + ' ' + km + ' km' + (place ? ' ab ' + place : '');
}

// Abweichungen einer Fahrt gegenüber der typischen Strecke
export function routeFlags(a, cluster) {
  const flags = [];
  if (cluster && cluster.medLen && Math.abs(a.dist - cluster.medLen) / cluster.medLen > 0.06) flags.push({ k: 'variant', text: 'Variante: ' + Math.round(((a.dist - cluster.medLen) / cluster.medLen) * 100) + ' % Länge' });
  if (a.ela && a.mov && (a.ela - a.mov) / a.ela > 0.25) flags.push({ k: 'pause', text: 'Lange Pausen (' + Math.round(((a.ela - a.mov) / a.ela) * 100) + ' % der Zeit)' });
  if (cluster) {
    const s = decode(a.poly)[0];
    if (s && hav(s, cluster.sig.start) > 400) flags.push({ k: 'start', text: 'Anderer Startpunkt' });
  }
  if (!a.hasHr) flags.push({ k: 'hr', text: 'Kein Puls', soft: true });
  return flags;
}

// Liegt eine Teilstrecke (a→b in dieser Reihenfolge) auf der Polyline?
// nächster Durchgang nahe P ab Index from (lokales Minimum unter tol)
function nextPass(pts, P, from, tol) {
  for (let i = from; i < pts.length; i++) {
    if (hav(pts[i], P) <= tol) {
      let j = i, d = hav(pts[i], P);
      while (j + 1 < pts.length && hav(pts[j + 1], P) < d) { j++; d = hav(pts[j], P); }
      return { i: j, d };
    }
  }
  return { i: -1, d: Infinity };
}

export function passesThrough(pts, A, B, tol = 150) {
  for (let from = 0; from < pts.length;) {
    const ia = nextPass(pts, A, from, tol);
    if (ia.i < 0) return false;
    const ib = nextPass(pts, B, ia.i + 1, tol);
    if (ib.i >= 0) return true;
    from = ia.i + 1;
  }
  return false;
}

// Zeit für eine Teilstrecke aus Streams berechnen
export function effortOnMark(stream, A, B, tol = 90) {
  const pts = stream.ll;
  if (!pts || pts.length < 3) return null;
  let best = null;
  for (let start = 0; start < pts.length - 2;) {
    const ia = nextPass(pts, A, start, tol);
    if (ia.i < 0) break;
    const ib = nextPass(pts, B, ia.i + 1, tol);
    if (ib.i < 0) break;
    const t = stream.t[ib.i] - stream.t[ia.i];
    const d = stream.d ? stream.d[ib.i] - stream.d[ia.i] : 0;
    let gain = 0, hrS = 0, hrT = 0;
    for (let i = ia.i + 1; i <= ib.i; i++) {
      if (stream.alt) { const da = stream.alt[i] - stream.alt[i - 1]; if (da > 0) gain += da; }
      if (stream.hr && stream.hr[i] != null) { const dt = stream.t[i] - stream.t[i - 1]; hrS += stream.hr[i] * dt; hrT += dt; }
    }
    const e = { i0: ia.i, i1: ib.i, time: t, dist: d, gain, hr: hrT ? hrS / hrT : null, offA: ia.d, offB: ib.d };
    if (!best || e.time < best.time) best = e;
    start = ib.i + 1;
  }
  return best;
}

// Aktivität B auf die Strecke von A projizieren (Distanzachse von A)
export function alignStreams(A, B) {
  const pa = A.ll, pb = B.ll;
  if (!pa || !pb || pa.length < 3 || pb.length < 3) return null;
  const da = A.d || cumDist(pa);
  const out = [];
  let j = 0;
  const win = Math.max(25, Math.round(pa.length / 12));
  for (let i = 0; i < pb.length; i++) {
    const r = nearestIndex(pa, pb[i], Math.max(0, j - 3), Math.min(pa.length, j + win));
    if (r.i < 0) continue;
    if (r.i >= j) j = r.i;
    out.push({ bi: i, ai: r.i, off: r.d, dA: da[r.i] });
  }
  // Zeitdifferenz entlang der Distanz von A
  const rows = [];
  let lastAi = -1;
  for (const o of out) {
    if (o.ai <= lastAi) continue;
    lastAi = o.ai;
    rows.push({
      d: o.dA,
      tA: A.t[o.ai] - A.t[0],
      tB: B.t[o.bi] - B.t[0],
      off: o.off,
      hrA: A.hr ? A.hr[o.ai] : null,
      hrB: B.hr ? B.hr[o.bi] : null,
      vA: A.v ? A.v[o.ai] : null,
      vB: B.v ? B.v[o.bi] : null,
      altA: A.alt ? A.alt[o.ai] : null,
    });
  }
  const matched = rows.filter((r) => r.off < 80).length / Math.max(1, rows.length);
  return { rows, matched, coverage: rows.length ? rows[rows.length - 1].d / (da[da.length - 1] || 1) : 0 };
}

// Ähnliche Fahrten (gleiche Richtung) für Vergleich und manuelle Zuordnung
export function similarActs(a, list, max = 8) {
  const sa = a.poly ? signature(a) : null;
  if (!sa) return [];
  const fam = familyOf(a);
  const out = [];
  for (const b of list) {
    if (b.id === a.id || !b.poly || b.excluded || familyOf(b) !== fam || !!b.indoor !== !!a.indoor) continue;
    const lr = a.dist && b.dist ? b.dist / a.dist : 1;
    if (lr < 0.6 || lr > 1.6) continue;
    const sb = signature(b);
    if (!sb || hav(sa.start, sb.start) > 2500) continue;
    const m = meanDist(sa.r, sb.r);
    if (m > 2500) continue;
    out.push({ a: b, m, lr });
  }
  return out.sort((x, y) => x.m - y.m).slice(0, max);
}
