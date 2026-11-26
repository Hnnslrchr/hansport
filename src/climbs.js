// Wiederkehrende Anstiege aus den eigenen Aufzeichnungen (ohne Strava-Segmente).
// Je Aktivität erkennt die App die Anstiege aus Höhe und Strecke und legt sie mit Start- und
// Gipfelpunkt in perf/<id>.sum.cl ab; climbIndex in analysis.js fasst gleiche Anstiege zusammen.
import { getState, patchDoc } from './store.js';
import { loadStreams } from './strava.js';
import { actSummary, SUM_V } from './actsum.js';
import { computeSections } from './sections.js';
import { dsport } from './sports.js';

const KINDS = ['road', 'mtb', 'hike', 'splitboard', 'other'];
// Nur Aufzeichnungen, in denen überhaupt ein Anstieg stecken kann
export function climbCandidates(list) {
  return list.filter((a) => !a.excluded && !a.indoor && !a.trainer && (a.gain || 0) >= 120 && (a.dist || 0) > 0 && KINDS.includes(dsport(a)));
}
export const climbScanned = (p) => !!(p && p.sum && p.sum.v === SUM_V);
export function climbProgress(list) {
  const S = getState();
  const c = climbCandidates(list);
  return { total: c.length, done: c.filter((a) => climbScanned(S.perf[a.id])).length, rest: c.filter((a) => !climbScanned(S.perf[a.id])) };
}

// Zeitreihen laden (erst aus dem Gerätespeicher, sonst von Garmin) und die Zusammenfassung ablegen.
// Läuft Aktivität für Aktivität, damit die Liste schon während des Laufs wächst.
export async function scanClimbs(rest, { onProgress, shouldStop } = {}) {
  let done = 0, failed = 0, found = 0;
  const total = rest.length;
  for (const a of rest) {
    if (shouldStop && shouldStop()) break;
    try {
      const st = await loadStreams(a.id);
      if (st) {
        const secs = st.alt ? computeSections(st, a.sport) : [];
        const sum = actSummary(a, st, { sections: secs });
        const p = getState().perf[a.id] || {};
        patchDoc('perf/' + a.id, { ...p, sum, at: p.at || Date.now() });
        if (sum && sum.cl) found += sum.cl.length;
      } else failed++;
    } catch (e) { failed++; }
    done++;
    if (onProgress) onProgress({ done, total, found, failed });
  }
  return { done, total, found, failed };
}
