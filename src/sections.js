// Gliederung einer Aufzeichnung in Abschnitte (Anstieg, Abfahrt, Verbindung, Pause,
// Lift, Aufstieg, Übergang) aus den Strava-Zeitreihen.

function smooth(a, k = 1) {
  const n = a.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { if (a[j] != null) { s += a[j]; c++; } }
    out[i] = c ? s / c : a[i];
  }
  return out;
}

function pivots(alt, T) {
  const n = alt.length;
  const piv = [0];
  let dir = 0, lo = 0, hi = 0, ext = 0;
  for (let i = 1; i < n; i++) {
    const a = alt[i];
    if (dir === 0) {
      if (a > alt[hi]) hi = i;
      if (a < alt[lo]) lo = i;
      if (alt[hi] - alt[lo] >= T) {
        if (lo < hi) { if (lo > 0) piv.push(lo); dir = 1; ext = hi; }
        else { if (hi > 0) piv.push(hi); dir = -1; ext = lo; }
      }
    } else if (dir === 1) {
      if (a >= alt[ext]) ext = i;
      else if (alt[ext] - a >= T) { piv.push(ext); dir = -1; ext = i; }
    } else {
      if (a <= alt[ext]) ext = i;
      else if (a - alt[ext] >= T) { piv.push(ext); dir = 1; ext = i; }
    }
  }
  if (dir !== 0 && ext !== piv[piv.length - 1] && ext < n - 1) piv.push(ext);
  if (piv[piv.length - 1] !== n - 1) piv.push(n - 1);
  return piv;
}

// Pausen zwischen zwei Messpunkten: lange Zeit, kaum Strecke
export function pauseIntervals(s) {
  const out = new Set();
  const { t, d } = s;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    const dd = d ? d[i] - d[i - 1] : 0;
    if (dt > 90 && dd / dt < 0.35) out.add(i);
    else if (s.mov && s.mov[i] === false && dt > 30) out.add(i);
  }
  return out;
}

export function metrics(s, i0, i1, pauses) {
  const alt = s.alts || s.alt;
  let gain = 0, loss = 0, mov = 0, hrS = 0, hrT = 0, wS = 0, wT = 0, cadS = 0, cadT = 0;
  for (let i = i0 + 1; i <= i1; i++) {
    const dt = s.t[i] - s.t[i - 1];
    if (alt) { const da = alt[i] - alt[i - 1]; if (da > 0) gain += da; else loss -= da; }
    const isP = pauses && pauses.has(i);
    if (!isP) {
      mov += dt;
      if (s.hr && s.hr[i] != null) { hrS += s.hr[i] * dt; hrT += dt; }
      if (s.w && s.w[i] != null) { wS += s.w[i] * dt; wT += dt; }
      if (s.cad && s.cad[i] != null && s.cad[i] > 0) { cadS += s.cad[i] * dt; cadT += dt; }
    }
  }
  const dist = s.d ? s.d[i1] - s.d[i0] : 0;
  const net = alt ? alt[i1] - alt[i0] : 0;
  const elapsed = s.t[i1] - s.t[i0];
  return {
    i0, i1, dist, gain, loss, net, mov, elapsed,
    grade: dist > 0 ? net / dist : 0,
    vam: mov > 0 ? (gain / mov) * 3600 : 0,
    vdesc: mov > 0 ? (loss / mov) * 3600 : 0,
    speed: mov > 0 ? dist / mov : 0,
    hr: hrT ? hrS / hrT : null,
    watts: wT ? wS / wT : null,
    cad: cadT ? cadS / cadT : null,
    altStart: alt ? alt[i0] : null, altEnd: alt ? alt[i1] : null,
  };
}

const THRESH = { snowboard: 30, splitboard: 30, hike: 18, mtb: 22, road: 25, other: 20 };

export function computeSections(s, sport) {
  if (!s || !s.t || s.t.length < 5) return [];
  const n = s.t.length;
  const hasAlt = s.alt && s.alt.some((v) => v != null);
  const pauses = pauseIntervals(s);
  if (!hasAlt) {
    return [{ type: 'flat', ...metrics(s, 0, n - 1, pauses) }].concat(pauseSections(s, pauses));
  }
  const alts = smooth(s.alt, n > 400 ? 2 : 1);
  const S = { ...s, alts };
  const T = THRESH[sport] || 20;
  const piv = pivots(alts, T);
  const legs = [];
  for (let k = 1; k < piv.length; k++) {
    const i0 = piv[k - 1], i1 = piv[k];
    if (i1 <= i0) continue;
    legs.push(metrics(S, i0, i1, pauses));
  }
  let secs = [];
  if (sport === 'snowboard' || sport === 'splitboard') {
    secs = snowLegs(S, legs, sport, pauses);
  } else {
    for (const L of legs) secs.push(...splitLeg(S, L, pauses));
  }
  secs = mergeAdjacent(S, secs, pauses);
  if (sport === 'splitboard') secs = addTransitions(S, secs, pauses);
  const ps = pauseSections(S, pauses, sport === 'splitboard' ? secs : null);
  return secs.concat(ps).sort((a, b) => a.i0 - b.i0 || (a.type === 'pause' ? 1 : -1));
}

function classifyBike(L) {
  if (L.net >= 15 && L.grade >= 0.02) return 'climb';
  if (L.net <= -15 && L.grade <= -0.02) return 'descent';
  return 'flat';
}

// Flache Stücke am Anfang/Ende eines Anstiegs oder einer Abfahrt abtrennen
function splitLeg(S, L, pauses) {
  const type = classifyBike(L);
  if (type === 'flat') return [{ type, ...L }];
  const alt = S.alts;
  const tol = 8;
  let a = L.i0;
  while (a < L.i1 - 1 && Math.abs(alt[a + 1] - alt[L.i0]) < tol) a++;
  let b = L.i1;
  while (b > a + 1 && Math.abs(alt[b - 1] - alt[L.i1]) < tol) b--;
  const out = [];
  const minFlat = 600;
  if (a > L.i0 && S.d[a] - S.d[L.i0] >= minFlat) out.push({ type: 'flat', ...metrics(S, L.i0, a, pauses) });
  else a = L.i0;
  const tailFlat = b < L.i1 && S.d[L.i1] - S.d[b] >= minFlat;
  const core = metrics(S, a, tailFlat ? b : L.i1, pauses);
  out.push({ type: classifyBike(core) === 'flat' ? 'flat' : type, ...core });
  if (tailFlat) out.push({ type: 'flat', ...metrics(S, b, L.i1, pauses) });
  return out;
}

function snowLegs(S, legs, sport, pauses) {
  const out = [];
  for (const L of legs) {
    const up = L.net > 0;
    const rate = L.elapsed > 0 ? (L.net / L.elapsed) * 3600 : 0; // Hm/h inkl. Wartezeit
    let type;
    if (Math.abs(L.net) < 15) type = sport === 'snowboard' ? (L.speed > 2.5 ? 'run' : 'pause') : 'flat';
    else if (up) type = rate >= 900 ? 'lift' : (sport === 'snowboard' ? 'walkup' : 'ascent');
    else type = sport === 'snowboard' ? 'run' : 'descent';
    if (type === 'flat') type = L.speed > 2.5 ? 'descent' : 'ascent';
    out.push({ type, ...L, rate });
  }
  return out;
}

function mergeAdjacent(S, secs, pauses) {
  const out = [];
  for (const s of secs) {
    const last = out[out.length - 1];
    if (last && last.type === s.type && last.i1 === s.i0) {
      out[out.length - 1] = { type: s.type, ...metrics(S, last.i0, s.i1, pauses), rate: s.rate };
    } else out.push(s);
  }
  return out;
}

// Splitboard: Übergang zwischen Aufstieg und Abfahrt (Umbau, Felle ab)
function addTransitions(S, secs, pauses) {
  const out = [];
  for (let k = 0; k < secs.length; k++) {
    const s = secs[k];
    out.push(s);
    const nx = secs[k + 1];
    if (s.type === 'ascent' && nx && nx.type === 'descent') {
      // langsame Intervalle rund um den Gipfelpunkt einsammeln
      const p = s.i1;
      let a = p, b = p;
      const slow = (i) => { const dt = S.t[i] - S.t[i - 1]; const dd = S.d[i] - S.d[i - 1]; return dt > 20 && dd / dt < 0.4; };
      while (a > s.i0 + 1 && slow(a)) a--;
      while (b < nx.i1 - 1 && slow(b + 1)) b++;
      const tt = S.t[b] - S.t[a];
      if (tt >= 120 && b > a) {
        out.push({ type: 'transition', ...metrics(S, a, b, null), pauseLike: true, i0: a, i1: b });
        for (let i = a + 1; i <= b; i++) pauses.delete(i);
      }
    }
  }
  return out;
}

function pauseSections(S, pauses, secs) {
  const out = [];
  const sorted = [...pauses].sort((a, b) => a - b);
  let start = null, prev = null;
  const flush = () => {
    if (start == null) return;
    let dur = 0;
    for (let i = start; i <= prev; i++) dur += S.t[i] - S.t[i - 1];
    if (dur >= 120) {
      out.push({ type: 'pause', i0: start - 1, i1: prev, dist: 0, gain: 0, loss: 0, net: 0, mov: 0, elapsed: dur, grade: 0, vam: 0, speed: 0, hr: null, watts: null, altStart: S.alts ? S.alts[start - 1] : null, altEnd: S.alts ? S.alts[prev] : null, point: true });
    }
    start = null;
  };
  for (const i of sorted) {
    if (start != null && i === prev + 1) { prev = i; continue; }
    flush(); start = i; prev = i;
  }
  flush();
  return out;
}

// Manuelle Korrekturen anwenden: Liste [{i0,i1,type}]
export function applyOverrides(s, sport, overrides) {
  if (!overrides || !overrides.length) return null;
  const pauses = pauseIntervals(s);
  const alts = smooth(s.alt || [], (s.t || []).length > 400 ? 2 : 1);
  const S = { ...s, alts };
  return overrides.map((o) => ({ type: o.type, ...metrics(S, o.i0, o.i1, o.type === 'pause' ? null : pauses), manual: true }));
}

// Zusammenfassung für Snowboard/Splitboard: Pistentag oder Tour?
export function snowSummary(secs) {
  const r = { lifts: 0, liftGain: 0, liftTime: 0, runs: 0, runLoss: 0, runTime: 0, pauseTime: 0, ascents: 0, ascentGain: 0, ascentTime: 0, transitions: 0, transitionTime: 0, descents: 0, descentLoss: 0, descentTime: 0 };
  for (const s of secs) {
    if (s.type === 'lift') { r.lifts++; r.liftGain += s.net; r.liftTime += s.elapsed; }
    else if (s.type === 'run' || s.type === 'descent') { r.runs++; r.runLoss += s.loss; r.runTime += s.mov; if (s.type === 'descent') { r.descents++; r.descentLoss += s.loss; r.descentTime += s.mov; } }
    else if (s.type === 'ascent' || s.type === 'walkup') { r.ascents++; r.ascentGain += s.gain; r.ascentTime += s.mov; }
    else if (s.type === 'transition') { r.transitions++; r.transitionTime += s.elapsed; }
    else if (s.type === 'pause') r.pauseTime += s.elapsed;
  }
  r.ascentRate = r.ascentTime ? (r.ascentGain / r.ascentTime) * 3600 : 0;
  r.kind = r.liftGain > Math.max(200, r.ascentGain * 1.5) ? 'piste' : r.ascentGain >= 200 ? 'tour' : 'unklar';
  return r;
}

// Tempo nach Steigungsklassen (Wandern)
export const GRADE_BINS = [
  { k: 'steilab', label: 'steil bergab', min: -1, max: -0.15 },
  { k: 'ab', label: 'bergab', min: -0.15, max: -0.04 },
  { k: 'flach', label: 'flach', min: -0.04, max: 0.04 },
  { k: 'auf', label: 'bergauf', min: 0.04, max: 0.15 },
  { k: 'steilauf', label: 'steil bergauf', min: 0.15, max: 1 },
];

export function gradeBins(s) {
  const pauses = pauseIntervals(s);
  const alts = smooth(s.alt || [], 1);
  const res = GRADE_BINS.map((b) => ({ ...b, dist: 0, time: 0, up: 0, down: 0 }));
  for (let i = 1; i < s.t.length; i++) {
    if (pauses.has(i)) continue;
    const dd = s.d[i] - s.d[i - 1], dt = s.t[i] - s.t[i - 1], da = alts[i] - alts[i - 1];
    if (dd <= 0 || dt <= 0) continue;
    const g = da / dd;
    const b = res.find((x) => g >= x.min && g < x.max);
    if (!b) continue;
    b.dist += dd; b.time += dt; if (da > 0) b.up += da; else b.down -= da;
  }
  for (const b of res) {
    b.speed = b.time ? b.dist / b.time : 0;
    b.vam = b.time ? (b.up / b.time) * 3600 : 0;
    b.vdesc = b.time ? (b.down / b.time) * 3600 : 0;
  }
  return res.filter((b) => b.time > 0);
}
