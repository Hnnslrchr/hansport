// Coach: Tagesbereitschaft (offengelegt), Empfehlung, Erkenntnisse, Ernährung, Kontextpaket.
// Alles hier rechnet die App selbst – ohne Modellaufruf.
import { daily, addD, tOf, DAY, hmm, nightMin } from './viz-data.js';
import { M, latest } from './metrics.js';
import { num } from './format.js';
import { dsport, sportLabel } from './sports.js';
import { WEB } from './env.js';

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : null; };
const clamp = (v) => Math.max(0, Math.min(100, v));
const n0 = (v) => num(v, 0).replace('-', '−'), n1 = (v) => num(v, 1).replace('-', '−');

export const WEIGHTS = { hrv: 0.3, rhr: 0.2, sleep: 0.3, load: 0.2 };
export const LEVELS = [
  { min: 75, k: 'hart', label: 'hart möglich' },
  { min: 55, k: 'normal', label: 'normales Training' },
  { min: 40, k: 'locker', label: 'locker' },
  { min: 0, k: 'ruhe', label: 'Ruhe / aktive Erholung' },
];

// Zeile für den Tag (oder die letzte davor, höchstens 1 Tag alt)
function rowFor(H, date) {
  const r = H.map[date];
  if (r && (r.hrv != null || r.rhr != null || (r.sl && r.sl.total))) return { r, date };
  const y = H.map[addD(date, -1)];
  return y ? { r: y, date: addD(date, -1) } : null;
}

export function readiness(H, date) {
  const x = rowFor(H, date);
  if (!x) return null;
  const r = x.r, parts = [];
  const b = r.base || {};
  if (r.hrv != null && b.hrv && b.hrv[1]) { const z = (r.hrv - b.hrv[0]) / b.hrv[1]; parts.push({ k: 'hrv', label: 'HRV', val: n0(r.hrv) + ' ms', base: `Mittel ${n1(b.hrv[0])} ± ${n1(b.hrv[1])}`, formula: `60 + 20 × ${n1(z)}`, pts: clamp(60 + 20 * z), z }); }
  if (r.rhr != null && b.rhr && b.rhr[1]) { const z = (b.rhr[0] - r.rhr) / b.rhr[1]; parts.push({ k: 'rhr', label: 'Ruhepuls', val: n0(r.rhr) + ' bpm', base: `Mittel ${n1(b.rhr[0])} ± ${n1(b.rhr[1])}`, formula: `60 + 20 × ${n1(z)}`, pts: clamp(60 + 20 * z), z }); }
  const sl = r.sl || {}, tot = sl.total != null ? sl.total : r.slMin, score = sl.score != null ? sl.score : r.slScore, need = r.need;
  if (tot != null && need) { const dur = Math.min(1, tot / need) * 100; const pts = score != null ? 0.7 * dur + 0.3 * score : dur; parts.push({ k: 'sleep', label: 'Schlaf', val: hmm(tot) + ' h' + (score != null ? ' · Score ' + score : ''), base: 'Bedarf ' + hmm(need) + ' h', formula: score != null ? `0,7 × ${n0(dur)} + 0,3 × ${score}` : `${n0(dur)} (ohne Score)`, pts: clamp(pts), short: tot < need ? need - tot : 0 }); }
  if (r.tsb != null) parts.push({ k: 'load', label: 'Belastung', val: 'Form ' + (r.tsb > 0 ? '+' : '') + n1(r.tsb), base: `Fitness ${n1(r.ctl)} · Ermüdung ${n1(r.atl)}`, formula: `70 + 2 × ${n1(r.tsb)}`, pts: clamp(70 + 2 * r.tsb) });
  if (parts.length < 2) return null;
  const wsum = parts.reduce((s, p) => s + WEIGHTS[p.k], 0);
  for (const p of parts) p.w = WEIGHTS[p.k] / wsum;
  const score100 = Math.round(parts.reduce((s, p) => s + p.w * p.pts, 0));
  const level = LEVELS.find((l) => score100 >= l.min);
  const missing = Object.keys(WEIGHTS).filter((k) => !parts.some((p) => p.k === k));
  return { score: score100, level, parts, missing, date: x.date, r, athletedata: r.rec != null ? { rec: r.rec, verdict: r.verdict } : null };
}

const REC = {
  ruhe: { title: 'Ruhetag', detail: 'Höchstens 30–45 min sehr locker (Zone 1), sonst Pause.' },
  locker: { title: 'Locker 45–75 min, Zone 2', detail: 'Ruhig rollen, keine Intervalle, Puls unter der Zone-2-Obergrenze.' },
  normal: { title: 'Normales Training, 60–120 min', detail: 'Ausdauer in Zone 2, kurze Tempoabschnitte sind möglich.' },
  hart: { title: 'Gut erholt: hart oder lang', detail: 'Intervalle oder eine lange Ausfahrt passen heute.' },
};

export function recommendation(R, H, date, plan) {
  if (!R) return null;
  let lk = R.level.k;
  const notes = [];
  if (R.r.tsb != null && R.r.tsb < -20 && (lk === 'hart' || lk === 'normal')) { lk = 'locker'; notes.push('Form unter −20: trotz guter Einzelwerte lieber locker.'); }
  // Gründe: die Teile mit der größten Abweichung von 60 Punkten (Richtung passend zur Empfehlung)
  const dir = R.score >= 55 ? -1 : 1;
  const reasons = [...R.parts].sort((a, b) => dir * (a.pts - b.pts)).slice(0, 3).map((p) => {
    if (p.k === 'sleep') return p.short ? `Schlaf ${p.val.split(' ·')[0]}, ${hmm(p.short)} h unter deinem Bedarf` : `Schlaf ${p.val.split(' ·')[0]}, Bedarf gedeckt`;
    if (p.k === 'hrv') return `HRV ${p.val} – ${p.z < -1.2 ? 'deutlich unter' : p.z < -0.3 ? 'unter' : p.z > 1.2 ? 'deutlich über' : p.z > 0.3 ? 'über' : 'nahe'} deinem Mittel`;
    if (p.k === 'rhr') return `Ruhepuls ${p.val} – ${p.z < -1.2 ? 'deutlich höher' : p.z < -0.3 ? 'höher' : p.z > 0.3 ? 'niedriger' : 'nahe'} als üblich`;
    return `${p.val} (${p.base})`;
  });
  const today = plan && plan.days ? plan.days.find((d) => d.date === date) : null;
  let planNote = null;
  if (today) {
    const hardPlan = ['intervalle', 'lang'].includes(today.art);
    planNote = hardPlan && (lk === 'locker' || lk === 'ruhe') ? `Geplant war „${today.titel}“ – heute lieber verschieben.` : `Geplant: „${today.titel}“ – passt zur Bereitschaft.`;
  }
  return { ...REC[lk], k: lk, reasons, notes, planNote };
}

// ---------- Erkenntnisse ----------
const band = (b) => (b && b[1] ? [b[0] - b[1], b[0] + b[1]] : null);
export function insights(H, date, goalWeight) {
  const out = [];
  const L = (k) => latest(H.list, k, date);
  const row = H.map[date] || (L('rhr') || {}).r || {};
  if (row.tsb != null && row.tsb < -20) out.push({ sev: 3, k: 'tsb', title: 'Stark ermüdet', text: `Form ${n1(row.tsb)}: deutlich mehr Ermüdung als Fitness. Ein bis zwei lockere Tage helfen.` });
  const c7 = H.map[addD(date, -7)];
  if (row.ctl != null && c7 && c7.ctl != null && row.ctl - c7.ctl > 8) out.push({ sev: 2, k: 'ctl', title: 'Belastung steigt schnell', text: `Fitness +${n1(row.ctl - c7.ctl)} in 7 Tagen – mehr als 8 pro Woche erhöht das Risiko von Überlastung.` });
  // Schlafschuld 7 Nächte
  let debt = 0, nN = 0;
  for (let i = 0; i < 7; i++) { const r = H.map[addD(date, -i)]; if (r && r.sl && r.sl.total && r.need) { debt += Math.max(0, r.need - r.sl.total); nN++; } }
  if (nN >= 4 && debt > 180) out.push({ sev: 2, k: 'sleep', title: 'Schlafdefizit', text: `${hmm(debt)} h unter deinem Bedarf in den letzten ${nN} Nächten.` });
  const starts = daily(H.list, (r) => (r.sl && r.sl.start ? nightMin(r.sl.start) : null), addD(date, -13), date).map((q) => q.v);
  if (starts.length >= 7 && sd(starts) > 60) out.push({ sev: 1, k: 'sleep', title: 'Unregelmäßige Einschlafzeit', text: `Deine Einschlafzeit schwankt um ± ${hmm(sd(starts))} h (14 Nächte). Ein fester Rhythmus hilft der Erholung.` });
  // Ruhepuls über Bereich an aufeinanderfolgenden Tagen
  let up = 0; for (let i = 0; i < 5; i++) { const r = H.map[addD(date, -i)]; const bb = r && band(r.base && r.base.rhr); if (r && r.rhr != null && bb && r.rhr > bb[1]) up++; else break; }
  if (up >= 2) out.push({ sev: 3, k: 'rhr', title: `Ruhepuls ${up} Tage erhöht`, text: 'Über deinem Normalbereich – kann auf Ermüdung, Stress oder einen beginnenden Infekt hindeuten. Bleibt er erhöht oder fühlst du dich krank, ärztlich abklären lassen.' });
  let dn = 0; for (let i = 0; i < 6; i++) { const r = H.map[addD(date, -i)]; const bb = r && band(r.base && r.base.hrv); if (r && r.hrv != null && bb && r.hrv < bb[0]) dn++; else break; }
  if (dn >= 3) out.push({ sev: 3, k: 'hrv', title: `HRV ${dn} Tage niedrig`, text: 'Unter deinem Normalbereich – Zeichen für unvollständige Erholung.' });
  // 3-Wochen-Trend Ruhepuls
  const a = daily(H.list, (r) => r.rhr, addD(date, -6), date).map((q) => q.v), b0 = daily(H.list, (r) => r.rhr, addD(date, -27), addD(date, -21)).map((q) => q.v);
  if (a.length >= 4 && b0.length >= 4) { const d = mean(a) - mean(b0); if (d <= -2) out.push({ sev: 0, k: 'rhr', title: 'Ruhepuls sinkt', text: `Letzte Woche Ø ${n1(mean(a))} bpm, vor drei Wochen ${n1(mean(b0))} – ein gutes Zeichen für die Ausdauer.` }); if (d >= 3) out.push({ sev: 2, k: 'rhr', title: 'Ruhepuls steigt', text: `Letzte Woche Ø ${n1(mean(a))} bpm, vor drei Wochen ${n1(mean(b0))}.` }); }
  const w = L('weight');
  if (w) {
    const age = Math.round((tOf(date) - tOf(w.date)) / DAY);
    if (age > 21) out.push({ sev: 1, k: 'weight', title: 'Gewicht veraltet', text: `Letzte Wiegung vor ${age} Tagen (${n1(w.v)} kg). Für Ernährung und Trend regelmäßig wiegen.` });
    else if (goalWeight) out.push({ sev: 0, k: 'weight', title: 'Gewicht zum Ziel', text: `${n1(w.v)} kg, Ziel ${n1(goalWeight)} kg (${w.v > goalWeight ? 'noch ' + n1(w.v - goalWeight) + ' kg' : 'erreicht'}).` });
  }
  return out.sort((x, y) => y.sev - x.sev);
}

// ---------- Ernährung ----------
export function nutrition(H, date, plan, goalWeight) {
  const bmrR = latest(H.list, 'weight', date) && (() => { for (let i = H.list.length - 1; i >= 0; i--) { const r = H.list[i]; if (r.date <= date && r.wi && r.wi.bmr) return { v: r.wi.bmr, src: 'Withings', date: r.date }; } return null; })();
  const r = H.map[date] || {};
  const bmr = bmrR || (r.bmr ? { v: r.bmr, src: 'Garmin', date } : null);
  const act = r.g && r.g.act != null ? r.g.act : r.act != null ? r.act : null;
  const partial = !!(r.g && r.g.partial);
  const w = latest(H.list, 'weight', date);
  const kg = w ? w.v : null;
  const today = plan && plan.days ? plan.days.find((d) => d.date === date) : null;
  const next = plan && plan.days ? plan.days.find((d) => d.date >= date && d.art !== 'ruhe') : null;
  const sess = today && today.art !== 'ruhe' ? today : next;
  const tips = [];
  if (sess) {
    const min = sess.dauer_min || 0;
    tips.push({ when: 'vorher', text: min >= 90 ? `2–3 h vor „${sess.titel}“ kohlenhydratreich essen${kg ? ` (Richtwert 1–2 g/kg ≈ ${n0(kg)}–${n0(2 * kg)} g)` : ''}.` : 'Eine normale Mahlzeit 2–3 h vorher reicht.' });
    tips.push({ when: 'während', text: min > 180 ? '60–90 g Kohlenhydrate pro Stunde, 0,5–0,75 l trinken, bei Hitze mit Salz – ab der ersten Stunde.' : min > 90 ? '60–90 g Kohlenhydrate pro Stunde ab ca. 60 min, 0,5–0,75 l pro Stunde.' : min > 60 ? 'Wasser reicht meist; bei hoher Intensität 30–60 g Kohlenhydrate pro Stunde.' : 'Wasser reicht.' });
    tips.push({ when: 'danach', text: min >= 90 ? `Innerhalb von 1–2 h Kohlenhydrate${kg ? ` (≈ ${n0(kg)}–${n0(1.2 * kg)} g)` : ''} plus 20–30 g Eiweiß.` : 'Normale Mahlzeit mit 20–30 g Eiweiß.' });
  }
  let trend = null;
  const ws = daily(H.list, (x) => (x.wi ? x.wi.weight : null), addD(date, -42), date);
  if (ws.length >= 3) trend = { d: ws[ws.length - 1].v - ws[0].v, from: ws[0].date, to: ws[ws.length - 1].date };
  return { bmr, act, partial, total: bmr && act != null ? bmr.v + act : null, kg, wDate: w && w.date, sess, tips, trend, goal: goalWeight || null };
}

// ---------- Kontextpaket für den Coach-Chat ----------
export function contextPack({ H, acts, date, R, rec, ins, plan, memory, goals, actx, goalWeight }) {
  const L = [];
  const m3 = (k, d0, d1) => { const v = daily(H.list, M[k].get, addD(date, -d0), addD(date, -d1)).map((q) => q.v); return v.length ? n1(mean(v)) + ` (n=${v.length})` : 'keine Daten'; };
  L.push(`Heute: ${date}. Datenquellen: ${WEB ? 'Garmin direkt (Aktivitäten, Schlaf, HRV, Puls, Body Battery), Withings (Waage), frühere Aktivitäten aus Strava; Basiswerte, Belastung und Erholung seit dem Wechsel von hansport berechnet (davor athletedata)' : 'Garmin (seit Okt. 2026), Withings (Waage), Strava (Aktivitäten), athletedata (Basiswerte, Belastung)'}.`);
  if (R) L.push(`Tagesbereitschaft (eigene Berechnung): ${R.score}/100 = ${R.level.label}. Teile: ` + R.parts.map((p) => `${p.label} ${p.val} → ${n0(p.pts)} Pkt × ${n0(p.w * 100)} %`).join('; ') + (R.athletedata ? `. athletedata-Erholung: ${R.athletedata.rec}.` : '.'));
  if (rec) L.push(`Empfehlung der App heute: ${rec.title}. Gründe: ${rec.reasons.join('; ')}.`);
  const row = H.map[date] || {};
  const b = (latest(H.list, 'rhr', date) || {}).r || {};
  if (b.base) L.push(`Normalbereiche (${WEB ? '60 Tage' : 'athletedata'}, Mittel±SD): Ruhepuls ${b.base.rhr ? n1(b.base.rhr[0]) + '±' + n1(b.base.rhr[1]) : '–'} bpm, HRV ${b.base.hrv ? n1(b.base.hrv[0]) + '±' + n1(b.base.hrv[1]) : '–'} ms, Atmung ${b.base.resp ? n1(b.base.resp[0]) + '±' + n1(b.base.resp[1]) : '–'}/min.`);
  L.push('Mittelwerte 7 / 28 / 90 Tage:');
  for (const k of ['rhr', 'hrv', 'sleep', 'slScore', 'rec', 'bb', 'stress', 'steps']) if (M[k]) L.push(`- ${M[k].label} (${M[k].unit}): ${m3(k, 6, 0)} / ${m3(k, 27, 0)} / ${m3(k, 89, 0)}`);
  const p = (d) => H.map[addD(date, -d)] || {};
  L.push(`Belastung (${WEB ? 'hansport, aus Garmin-Trainingslast' : 'athletedata'}): heute Fitness ${n1(row.ctl ?? p(1).ctl)}, Ermüdung ${n1(row.atl ?? p(1).atl)}, Form ${n1(row.tsb ?? p(1).tsb)}; vor 7 Tagen Fitness ${n1(p(7).ctl)}, vor 28 Tagen ${n1(p(28).ctl)}.`);
  const nights = H.list.filter((r) => r.date <= date && r.sl && r.sl.total).slice(-7);
  L.push('Letzte Nächte (Datum = Aufwachtag): ' + nights.map((r) => `${r.date} ${hmm(r.sl.total)} h (Tief ${hmm(r.sl.deep || 0)}, REM ${hmm(r.sl.rem || 0)}, Score ${r.sl.score ?? '–'}, ${r.sl.start}–${r.sl.end})`).join('; '));
  const w = latest(H.list, 'weight', date);
  if (w) L.push(`Körper (Withings): ${n1(w.v)} kg am ${w.date}` + (w.r.wi.fatPct ? `, Fett ${n1(w.r.wi.fatPct)} %` : '') + (w.r.wi.muscle ? `, Muskel ${n1(w.r.wi.muscle)} kg` : '') + (goalWeight ? `. Zielgewicht ${n1(goalWeight)} kg.` : '. Kein Zielgewicht gesetzt.'));
  const vo2 = latest(H.list, 'vo2', date);
  if (vo2) L.push(`VO2max Rad (Garmin, geschätzt): ${vo2.v} am ${vo2.date}` + (vo2.r.fitAge ? `, Fitnessalter ${vo2.r.fitAge}` : ''));
  const recent = acts.filter((a) => a.date <= date && !a.excluded).slice(0, 12);
  L.push('Letzte Aktivitäten: ' + recent.map((a) => `[${a.id}] ${a.date} ${sportLabel(dsport(a))} „${a.name}“ ${a.dist ? n1(a.dist / 1000) + ' km' : ''} ${a.gain ? n0(a.gain) + ' Hm' : ''} ${a.mov ? hmm(a.mov / 60) + ' h' : ''}${a.hr || a.avgHr ? ' Ø ' + n0(a.hr || a.avgHr) + ' bpm' : ''}`).join('; '));
  const y0 = date.slice(0, 4);
  const yr = acts.filter((a) => a.date.startsWith(y0) && !a.indoor && !a.excluded);
  if (yr.length) L.push(`Jahr ${y0} draußen: ${yr.length} Einheiten, ${n0(yr.reduce((s, a) => s + (a.dist || 0), 0) / 1000)} km, ${n0(yr.reduce((s, a) => s + (a.gain || 0), 0))} Hm. Längste: ${n1(Math.max(...yr.map((a) => a.dist || 0)) / 1000)} km.`);
  if (ins && ins.length) L.push('Erkenntnisse der App: ' + ins.map((i) => i.title + ' – ' + i.text).join(' | '));
  if (plan && plan.days) L.push('Aktueller Wochenplan: ' + plan.days.map((d) => `${d.date} ${d.titel} (${d.dauer_min || 0} min${d.zone ? ', ' + d.zone : ''})`).join('; '));
  if (goals && goals.length) L.push('Ziele in der App: ' + goals.join('; '));
  if (memory && memory.length) L.push('Gedächtnis (vom Athleten bestätigt): ' + memory.map((m) => `[${m.kind}] ${m.text} (${m.date})`).join('; '));
  if (actx) L.push('athletedata-Athletenkontext (Auszug): ' + actx);
  return L.join('\n');
}
