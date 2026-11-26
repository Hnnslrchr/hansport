// Coach: Tagesbriefing, Erkenntnisse, Wochenplan, Ernährung, Chat mit Werkzeugen und Gedächtnis.
import { h, Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Ico } from '../ui/hp.jsx';
import { Sheet } from '../ui/kit.jsx';
import { RangeScale } from '../ui/viz.jsx';
import { addD, daily, dShort, dWeek, hmm, tOf, DAY } from '../viz-data.js';
import { healthDays, todayLocal, adCall } from '../health.js';
import { M, latest } from '../metrics.js';
import { num } from '../format.js';
import { push, openSheet, closeSheet } from '../nav.js';
import { getState, setDoc, toast } from '../store.js';
import { caps } from '../platform.js';
import { dsport, sportLabel } from '../sports.js';
import { useStatus, useData } from './common.jsx';
import { readiness, recommendation, insights, nutrition, contextPack } from '../coach-logic.js';
import { GROUP } from './metric.jsx';
import { ReadinessCard } from './readiness.jsx';
import { WEB } from '../env.js';

const n0 = (v) => num(v, 0), n1 = (v) => num(v, 1);
const coachDoc = (k) => (getState().meta && getState().meta['coach-' + k]) || null;
const saveCoach = (k, v) => setDoc('meta/coach-' + k, v);

async function getSample() { const cp = await caps(); return cp && cp.sample ? cp.sample : null; }

// ---------- Gedächtnis ----------
const memList = () => ((coachDoc('memory') || {}).items || []);
async function remember(kind, text, quote) {
  const items = memList().concat([{ id: Date.now().toString(36), kind, text, date: todayLocal() }]);
  saveCoach('memory', { items });
  // Spiegelung nach athletedata, solange erreichbar (App-Kopie bleibt führend)
  try {
    if (kind === 'vorliebe' || kind === 'ziel') {
      const ctx = await adCall('get_athlete_context', { include_metrics: false });
      const ver = ctx && (ctx.preferences_version || (ctx.memory && ctx.memory.preferences_version));
      if (ver) await adCall('athlete_preference_update', { expected_version: ver, old_text: '', preference: text, athlete_quote: quote || text });
    } else if (kind === 'entscheidung') {
      await adCall('coaching_note_create', { category: 'decision', content: text, evidence_type: 'athlete_report', evidence_reference: quote || text });
    }
    return true;
  } catch (e) { return false; }
}

// ---------- Werkzeuge für den Chat (laufen in der App) ----------
function makeTools({ H, acts, cards }) {
  const KEYS = Object.keys(M).join(', ');
  return [
    { name: 'zeitreihe', description: `Tageswerte einer Kennzahl aus dem App-Speicher. kennzahl: eine von ${KEYS}. von/bis: YYYY-MM-DD (max. 120 Tage).`,
      inputSchema: { type: 'object', properties: { kennzahl: { type: 'string' }, von: { type: 'string' }, bis: { type: 'string' } }, required: ['kennzahl', 'von', 'bis'] },
      execute: ({ kennzahl, von, bis }) => { const m = M[kennzahl]; if (!m) throw new Error('Unbekannte Kennzahl'); return daily(H.list, m.get, von, bis).slice(-120).map((q) => [q.date, q.v]); } },
    { name: 'vergleiche', description: 'Mittelwert einer Kennzahl in zwei Zeiträumen vergleichen.',
      inputSchema: { type: 'object', properties: { kennzahl: { type: 'string' }, a_von: { type: 'string' }, a_bis: { type: 'string' }, b_von: { type: 'string' }, b_bis: { type: 'string' } }, required: ['kennzahl', 'a_von', 'a_bis', 'b_von', 'b_bis'] },
      execute: (x) => { const m = M[x.kennzahl]; if (!m) throw new Error('Unbekannte Kennzahl'); const f = (a, b) => { const v = daily(H.list, m.get, a, b).map((q) => q.v); return { mittel: v.length ? Math.round((v.reduce((s, y) => s + y, 0) / v.length) * 10) / 10 : null, n: v.length }; }; return { a: f(x.a_von, x.a_bis), b: f(x.b_von, x.b_bis), einheit: m.unit }; } },
    { name: 'aktivitaeten', description: 'Aktivitäten im Zeitraum (im App-Speicher). sportart optional: road, mtb, indoor, hike, gym, snowboard, splitboard.',
      inputSchema: { type: 'object', properties: { von: { type: 'string' }, bis: { type: 'string' }, sportart: { type: 'string' } }, required: ['von', 'bis'] },
      execute: ({ von, bis, sportart }) => acts.filter((a) => a.date >= von && a.date <= bis && !a.excluded && (!sportart || dsport(a) === sportart)).slice(0, 40).map((a) => ({ id: a.id, datum: a.date, sport: sportLabel(dsport(a)), name: a.name, km: a.dist ? Math.round(a.dist / 100) / 10 : null, hm: a.gain ? Math.round(a.gain) : null, min: a.mov ? Math.round(a.mov / 60) : null, puls: a.avgHr || null, indoor: !!a.indoor })) },
    { name: 'aktivitaet', description: 'Details einer Aktivität aus dem App-Speicher: Leistung, Puls, Segmente. id aus aktivitaeten.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: async ({ id }) => { const a = acts.find((x) => String(x.id) === String(id)); const p = getState().perf[id]; return { aktivitaet: a ? { datum: a.date, name: a.name, km: a.dist && Math.round(a.dist / 100) / 10, hm: a.gain, min: a.mov && Math.round(a.mov / 60) } : null, leistung: p ? { avgHr: p.avgHr, maxHr: p.maxHr, watt: p.avgW || p.w || null, kj: p.kj || null, bestwerte: p.pc && p.pc.res ? p.pc.res.slice(0, 8) : null, anstieg: p.gr ? 'Höhenprofil volle Auflösung vorhanden' : null } : 'Keine gespeicherten Leistungsdaten – in der Aktivität öffnen lädt sie.' }; } },
    { name: 'athletenkontext', description: 'Athleten-Kontext aus athletedata (Ziele, Vorlieben, Entscheidungen; live).',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => { const r = await adCall('get_athlete_context', { include_metrics: false }); return JSON.stringify(r).slice(0, 4000); } },
    { name: 'zeige_kennzahl', description: 'Hängt an die Antwort eine Kennzahl-Karte mit Mini-Graph und Absprung in die Detailansicht. kennzahl wie bei zeitreihe; tage: 7–365.',
      inputSchema: { type: 'object', properties: { kennzahl: { type: 'string' }, tage: { type: 'number' } }, required: ['kennzahl'] },
      execute: ({ kennzahl, tage }) => { if (!M[kennzahl]) throw new Error('Unbekannte Kennzahl'); cards.push({ k: kennzahl, days: Math.max(7, Math.min(365, tage || 28)) }); return 'Karte angehängt'; } },
    { name: 'merken', description: 'Speichert etwas im Coach-Gedächtnis. NUR aufrufen, wenn der Athlet es ausdrücklich festlegt oder bestätigt. art: ziel | vorliebe | entscheidung. zitat: seine eigenen Worte.',
      inputSchema: { type: 'object', properties: { art: { type: 'string', enum: ['ziel', 'vorliebe', 'entscheidung'] }, text: { type: 'string' }, zitat: { type: 'string' } }, required: ['art', 'text'] },
      execute: async ({ art, text, zitat }) => { const ok = await remember(art, text, zitat); cards.push({ memo: art + ': ' + text }); return ok ? 'Gespeichert (App und athletedata)' : 'In der App gespeichert'; } },
  ].filter((t) => !WEB || t.name !== 'athletenkontext' || (globalThis.__hsFlags && globalThis.__hsFlags.athletedata));
}

const SYSTEM = `Du bist der persönliche Coach in der App „hansport“: Trainer, Gesundheits- und Ernährungsberater in einem.
Regeln:
- Antworte auf Deutsch, kurz und konkret (meist 3–8 Sätze), mit Zahlen aus den Daten und einer klaren Empfehlung.
- Nutze das Kontextpaket. Für Details rufe Werkzeuge auf (zeitreihe, vergleiche, aktivitaeten, aktivitaet, athletenkontext). Erfinde keine Werte; fehlen Daten, sag das.
- Trenne gemessene Werte (Garmin, Withings, Strava) von geschätzten (VO2max, Kalorien, Bereitschaft, Ernährungsrichtwerte) und benenne Schätzungen.
- Die Stufen der Tagesform heißen Ruhe, Locker, Normal und Intensiv. Schreib „intensiv“, nie „hart“.
- Keine Diagnosen. Bei auffälligen Gesundheitswerten oder Beschwerden empfiehlst du eine ärztliche Abklärung.
- Wo ein Verlauf die Antwort stützt, hänge mit zeige_kennzahl höchstens zwei Karten an.
- merken nur aufrufen, wenn der Athlet etwas ausdrücklich festlegt oder bestätigt.
- Ende jeder Antwort mit einer eigenen Zeile: „Grundlage: …“ (Zeitraum, Kennzahlen, Quelle).`;

// ---------- Antwort-Darstellung ----------
function Rich({ text }) {
  const lines = (text || '').split('\n');
  const out = [];
  let list = null;
  const inl = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p) => (p.startsWith('**') && p.endsWith('**') ? <b>{p.slice(2, -2)}</b> : p));
  for (const ln of lines) {
    if (/^\s*[-•]\s+/.test(ln)) { (list = list || []).push(<li>{inl(ln.replace(/^\s*[-•]\s+/, ''))}</li>); continue; }
    if (list) { out.push(<ul>{list}</ul>); list = null; }
    if (/^Grundlage:/i.test(ln.trim())) out.push(<div class="ch-basis">{inl(ln.trim())}</div>);
    else if (ln.trim()) out.push(<p>{inl(ln.replace(/^#+\s*/, ''))}</p>);
  }
  if (list) out.push(<ul>{list}</ul>);
  return <Fragment>{out}</Fragment>;
}
function KpiCard({ c, H, end }) {
  if (c.memo) return <div class="ch-memo"><Ico n="check" />Gemerkt – {c.memo}</div>;
  const m = M[c.k]; if (!m) return null;
  const pts = daily(H.list, m.get, addD(end, -(c.days - 1)), end);
  const l = latest(H.list, c.k, end);
  const vs = pts.map((q) => q.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const t0 = pts.length ? pts[0].t : 0, t1 = pts.length ? pts[pts.length - 1].t : 1;
  const d = pts.map((q, i) => (i ? 'L' : 'M') + (4 + ((q.t - t0) / (t1 - t0 || 1)) * 152).toFixed(1) + ',' + (4 + (1 - (q.v - lo) / sp) * 32).toFixed(1)).join('');
  return (
    <button type="button" class={'ch-card g-' + (GROUP[c.k] || 'trn')} onClick={() => push('metric', { k: c.k })}>
      <span class="ch-ic"><Ico n={m.icon} /></span>
      <span class="ch-tx"><span class="lbl2">{m.label} · {c.days} Tage</span><b>{l ? m.fmt(l.v) : '–'}<small> {m.unit}</small></b></span>
      {pts.length > 1 ? <svg viewBox="0 0 160 40" class="ch-sp" aria-hidden="true"><path d={d} fill="none" stroke="var(--c)" stroke-width="2" vector-effect="non-scaling-stroke" /></svg> : null}
      <Ico n="nav-arrow-right" />
    </button>
  );
}

function suggestions(R, ins, plan, today) {
  const s = [];
  const long = plan && plan.days && plan.days.find((d) => d.date >= today && d.art === 'lang');
  if (long) s.push(`Bin ich fit für „${long.titel}“ am ${dWeek(long.date)}?`, 'Was esse ich vor und während der langen Tour?');
  else s.push('Bin ich fit für eine lange Tour am Wochenende?');
  if (ins.some((i) => i.k === 'hrv')) s.push('Warum ist meine HRV gesunken?');
  if (ins.some((i) => i.k === 'sleep')) s.push('Wie baue ich mein Schlafdefizit ab?');
  if (ins.some((i) => i.k === 'rhr')) s.push('Was bedeutet mein erhöhter Ruhepuls?');
  if (R && R.level.k === 'ruhe') s.push('Was mache ich heute statt Training?');
  s.push('Wie hat sich meine Fitness in den letzten 4 Wochen entwickelt?');
  return [...new Set(s)].slice(0, 4);
}

// ---------- Wochenplan ----------
const ART = { ruhe: 'Ruhetag', locker: 'Locker', ausdauer: 'Ausdauer', intervalle: 'Intervalle', lang: 'Lange Ausfahrt', kraft: 'Kraft' };
function actualFor(acts, date) { const a = acts.filter((x) => x.date === date && !x.excluded); return { n: a.length, min: Math.round(a.reduce((s, x) => s + (x.mov || 0), 0) / 60), names: a.map((x) => x.name) }; }
function planStatus(d, act, today) {
  if (d.date > today) return null;
  if (d.art === 'ruhe') return act.n ? { t: 'zusätzlich trainiert', k: 'x' } : { t: 'Ruhe eingehalten', k: 'ok' };
  if (!act.n) return d.date === today ? { t: 'offen', k: 'open' } : { t: 'ausgelassen', k: 'miss' };
  if (d.dauer_min && act.min < 0.7 * d.dauer_min) return { t: `kürzer (${act.min} min)`, k: 'part' };
  return { t: `erledigt (${act.min} min)`, k: 'ok' };
}

async function makePlan({ ctx, today, memory }) {
  const sample = await getSample();
  if (!sample) throw new Error('Claude-Aufrufe sind in dieser Ansicht nicht verfügbar.');
  const days = []; for (let i = 0; i < 7; i++) days.push(addD(today, i));
  const prompt = `${SYSTEM}\n\nKontextpaket:\n${ctx}\n\nAufgabe: Erstelle einen Trainingsplan für die 7 Tage ${days[0]} bis ${days[6]}. Richte dich nach Bereitschaft, Form, Belastung, Zielen und Vorlieben aus dem Gedächtnis.${memory.some((m) => m.kind === 'vorliebe') ? '' : ' Es sind keine verfügbaren Tage bekannt: nimm 4–5 Trainingstage an, eine lange Ausfahrt am Wochenende, und sag das in der Begründung.'}
Antworte NUR mit JSON: {"begruendung": "2–3 Sätze", "tage": [{"datum": "YYYY-MM-DD", "art": "ruhe|locker|ausdauer|intervalle|lang|kraft", "titel": "kurz", "dauer_min": Zahl, "zone": "z. B. Zone 2", "hinweis": "1 Satz"}]} mit genau 7 Tagen.`;
  const v = await sample.json(prompt, { modelTier: 'default', cache: false });
  if (!v || !Array.isArray(v.tage)) throw new Error('Unerwartete Antwort');
  const plan = { created: Date.now(), from: days[0], why: v.begruendung || '', days: v.tage.slice(0, 7).map((d, i) => ({ date: d.datum || days[i], art: ART[d.art] ? d.art : 'ausdauer', titel: d.titel || ART[d.art] || 'Training', dauer_min: +d.dauer_min || 0, zone: d.zone || '', hinweis: d.hinweis || '' })) };
  saveCoach('plan', plan);
  return plan;
}

// ---------- Seite ----------
export function Coach() {
  useStatus();
  const H = healthDays();
  const d = useData();
  const today = todayLocal();
  const S = getState();
  const goalWeight = S.settings.main && S.settings.main.healthGoals && S.settings.main.healthGoals.weight;
  const plan = coachDoc('plan');
  const memory = memList();
  const R = useMemo(() => readiness(H, today), [H, today]);
  const rec = useMemo(() => recommendation(R, H, today, plan), [R, plan]);
  const ins = useMemo(() => insights(H, today, goalWeight), [H, today, goalWeight]);
  const nut = useMemo(() => nutrition(H, today, plan, goalWeight), [H, today, plan, goalWeight]);
  const [allIns, setAllIns] = useState(false);
  const [busy, setBusy] = useState(false);
  const goals = Object.values(S.goals || {}).map((g) => g.name || g.kind).filter(Boolean);
  const ctx = () => contextPack({ H, acts: d.list, date: today, R, rec, ins, plan, memory, goals, goalWeight, actx: (coachDoc('actx') || {}).text || null });

  // athletedata-Kontext einmal am Tag holen (für Gedächtnis und Ziele)
  useEffect(() => {
    const c = coachDoc('actx');
    if (c && c.date === today) return;
    adCall('get_athlete_context', { include_metrics: false }).then((r) => { const t = JSON.stringify(r && (r.memory || r)).slice(0, 1500); saveCoach('actx', { date: today, text: t }); }).catch(() => {});
  }, [today]);

  const planNow = async () => {
    setBusy(true);
    try { await makePlan({ ctx: ctx(), today, memory }); toast('Wochenplan erstellt'); } catch (e) { toast(e && e.code === 'not_granted' ? 'Claude-Aufrufe wurden nicht erlaubt.' : 'Plan konnte nicht erstellt werden: ' + (e && e.message ? e.message : e), 'error'); }
    setBusy(false);
  };

  return (
    <div class="view root">
      <div class="hp-hero" style="padding-top:18px"><div style="flex:1"><div class="hp-lbl">Training · Gesundheit · Ernährung</div><h1>Coach</h1></div>
        <button type="button" class="chip2" onClick={() => openSheet(() => <MemorySheet />)} aria-label="Gedächtnis und Ziele"><Ico n="brain" />Gedächtnis</button></div>
      <div class="md-body coach">
        {/* 1. Tagesbriefing: dieselbe Bereitschaft wie auf „Heute“ */}
        <div class="coach-rdy"><ReadinessCard H={H} date={today} plan={plan} full /></div>

        {/* 2. Erkenntnisse */}
        {ins.length ? (
          <Fragment>
            <div class="hsec"><Ico n="sparks" />Erkenntnisse</div>
            <div class="ins-list">
              {(allIns ? ins : ins.slice(0, 3)).map((i) => (
                <button type="button" class={'t2 ins g-' + (GROUP[i.k] || 'trn') + (i.sev >= 3 ? ' hi' : '')} onClick={() => push('metric', { k: i.k })}>
                  <span class="ins-ic"><Ico n={(M[i.k] || {}).icon || 'info-circle'} /></span>
                  <span><b>{i.title}</b><span class="sub2">{i.text}</span></span>
                  <Ico n="nav-arrow-right" />
                </button>
              ))}
            </div>
            {ins.length > 3 ? <button type="button" class="linkbtn" onClick={() => setAllIns(!allIns)}>{allIns ? 'Weniger' : `Alle ${ins.length} anzeigen`}</button> : null}
          </Fragment>
        ) : null}

        {/* 3. Trainingsausblick */}
        <div class="hsec"><Ico n="calendar" />Nächste 7 Tage</div>
        {plan && plan.days ? (
          <div class="t2 plan">
            {plan.days.map((p) => { const act = actualFor(d.list, p.date); const st = planStatus(p, act, today); return (
              <div class={'pl-row' + (p.date === today ? ' now' : '')}>
                <span class="pl-d">{dWeek(p.date).split(',')[0]}<small>{new Date(tOf(p.date)).getUTCDate()}.</small></span>
                <span class="pl-t"><b>{p.titel}</b><span class="sub2">{p.art === 'ruhe' ? 'Ruhe' : (p.dauer_min ? p.dauer_min + ' min' : '') + (p.zone ? ' · ' + p.zone : '')}{p.hinweis ? ' · ' + p.hinweis : ''}</span></span>
                {st ? <span class={'pl-s ' + st.k}>{st.t}</span> : null}
              </div>
            ); })}
            {plan.why ? <div class="sub2" style="margin-top:8px">{plan.why}</div> : null}
            <button type="button" class="btn2 q" style="margin-top:10px" disabled={busy} onClick={planNow}>{busy ? 'Plane …' : 'Neu planen'}</button>
          </div>
        ) : (
          <div class="t2"><div class="sub2">Noch kein Plan. Der Coach plant die nächsten 7 Tage aus Bereitschaft, Form, Belastung und deinen Zielen.</div><button type="button" class="btn2" style="margin-top:10px" disabled={busy} onClick={planNow}>{busy ? 'Plane …' : 'Woche planen'}</button></div>
        )}

        {/* 4. Ernährung */}
        <div class="hsec"><Ico n="cutlery" />Ernährung</div>
        <div class="t2 g-akt nut">
          <div class="st2" style="grid-template-columns:repeat(3,1fr);margin-top:0">
            <div><span class="lbl2">Grundumsatz</span><b>{nut.bmr ? n0(nut.bmr.v) : '–'}</b><span class="sub2">{nut.bmr ? 'kcal · ' + nut.bmr.src : 'keine Daten'}</span></div>
            <div><span class="lbl2">Aktiv {nut.partial ? 'bisher' : 'heute'}</span><b>{nut.act != null ? n0(nut.act) : '–'}</b><span class="sub2">kcal · Garmin</span></div>
            <div><span class="lbl2">Bedarf {nut.partial ? 'bisher' : ''}</span><b>{nut.total ? n0(nut.total) : '–'}</b><span class="sub2">kcal · geschätzt</span></div>
          </div>
          {nut.tips.length ? (
            <Fragment>
              <div class="lbl2" style="margin:14px 0 6px">Für „{nut.sess.titel}“{nut.sess.date !== today ? ' am ' + dWeek(nut.sess.date) : ' heute'}</div>
              <ul class="why">{nut.tips.map((t) => <li><b>{t.when}:</b> {t.text}</li>)}</ul>
            </Fragment>
          ) : <div class="sub2" style="margin-top:10px">Mit einem Wochenplan gibt es hier Hinweise vor, während und nach den Einheiten.</div>}
          <div class="sub2" style="margin-top:10px">{nut.kg ? `Gewicht ${n1(nut.kg)} kg (${dShort(nut.wDate)})` : 'Kein Gewicht'}{nut.trend ? `, 6 Wochen ${nut.trend.d > 0 ? '+' : '−'}${n1(Math.abs(nut.trend.d))} kg` : ''}{nut.goal ? `, Ziel ${n1(nut.goal)} kg` : ', kein Zielgewicht gesetzt'}. Richtwerte aus der Sporternährung – Schätzungen, keine Diät- oder Medizinberatung.</div>
        </div>

        {/* 5. Chat */}
        <div class="hsec"><Ico n="chat-lines" />Frag den Coach</div>
        <Chat H={H} acts={d.list} today={today} ctx={ctx} sugg={suggestions(R, ins, plan, today)} />
      </div>
    </div>
  );
}

function Chat({ H, acts, today, ctx, sugg }) {
  const saved = coachDoc('chat');
  const [msgs, setMsgs] = useState((saved && saved.msgs) || []);
  const [text, setText] = useState('');
  const [live, setLive] = useState(null);
  const [err, setErr] = useState(null);
  const ac = useRef(null);
  const send = async (q) => {
    q = (q || text).trim();
    if (!q || live) return;
    setText(''); setErr(null);
    const hist = msgs.concat([{ role: 'user', text: q, at: Date.now() }]);
    setMsgs(hist);
    const sample = await getSample();
    if (!sample) { setErr('Claude-Aufrufe sind in dieser Ansicht nicht verfügbar.'); return; }
    const cards = [];
    const tools = makeTools({ H, acts, cards });
    const h2 = hist.slice(-12);
    while (h2.length && h2[0].role !== 'user') h2.shift();
    const input = h2.map((m, i) => ({ role: m.role, content: i === 0 ? `${SYSTEM}\n\nKontextpaket (Stand ${today}):\n${ctx()}\n\n---\n${m.text}` : m.text }));
    setLive({ text: '' });
    ac.current = new AbortController();
    try {
      const r = await sample(input, { tools, cache: false, modelTier: 'default', signal: ac.current.signal, onText: ({ text: t }) => setLive({ text: t }) });
      const next = hist.concat([{ role: 'assistant', text: r.text, cards, at: Date.now() }]).slice(-30);
      setMsgs(next); saveCoach('chat', { msgs: next });
    } catch (e) {
      setErr(e && e.code === 'not_granted' ? 'Claude-Aufrufe wurden nicht erlaubt.' : e && e.code === 'rate_limited' ? 'Gerade zu viele Anfragen – bitte kurz warten.' : e && e.name === 'AbortError' ? null : 'Antwort fehlgeschlagen: ' + (e && e.message ? e.message : e));
      saveCoach('chat', { msgs: hist.slice(-30) });
    }
    setLive(null);
  };
  return (
    <div class="chat">
      {msgs.length ? msgs.map((m) => (
        <div class={'ch-m ' + m.role}>
          {m.role === 'assistant' ? <Rich text={m.text} /> : <p>{m.text}</p>}
          {(m.cards || []).map((c) => <KpiCard c={c} H={H} end={today} />)}
        </div>
      )) : <div class="sub2" style="margin:0 2px 10px">Der Coach kennt deine Werte, Trends, Aktivitäten und Ziele. Antworten zeigen, worauf sie beruhen.</div>}
      {live ? <div class="ch-m assistant">{live.text ? <Rich text={live.text} /> : <p class="sub2">Denkt nach …</p>}</div> : null}
      {err ? <div class="empty2">{err}</div> : null}
      <div class="chips-x row2" style="margin:8px 0">{sugg.map((s) => <button type="button" class="chip2" disabled={!!live} onClick={() => send(s)}>{s}</button>)}</div>
      <form class="ch-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input class="input" value={text} onInput={(e) => setText(e.target.value)} placeholder="Frage an den Coach …" aria-label="Frage an den Coach" />
        {live ? <button type="button" class="btn2 q" onClick={() => ac.current && ac.current.abort()}>Stopp</button> : <button type="submit" class="btn2" disabled={!text.trim()} aria-label="Senden"><Ico n="send" /></button>}
      </form>
      {msgs.length ? <button type="button" class="linkbtn" onClick={() => { setMsgs([]); saveCoach('chat', { msgs: [] }); }}>Unterhaltung löschen</button> : null}
    </div>
  );
}

function MemorySheet() {
  const [items, setItems] = useState(memList());
  const [kind, setKind] = useState('ziel');
  const [t, setT] = useState('');
  const del = (id) => { const n = items.filter((x) => x.id !== id); setItems(n); saveCoach('memory', { items: n }); };
  const add = async () => { if (!t.trim()) return; await remember(kind, t.trim(), t.trim()); setItems(memList()); setT(''); toast('Gemerkt'); };
  return (
    <Sheet title="Gedächtnis des Coachs">
      <div class="small muted">Ziele, Vorlieben und Entscheidungen, die du festlegst. Der Coach nutzt sie in jeder Antwort. {WEB ? 'In der App gespeichert.' : 'In der App gespeichert und, wenn erreichbar, nach athletedata gespiegelt.'}</div>
      {items.length ? <div class="list">{items.map((m) => <div class="mrow"><span><div class="t1">{m.text}</div><div class="t2">{m.kind} · {dShort(m.date)}</div></span><button type="button" class="btn ghost" aria-label="Löschen" onClick={() => del(m.id)}><Ico n="trash" /></button></div>)}</div> : <div class="small muted">Noch nichts gespeichert. Beispiele: „Ziel: Quattro Pass (229 km) im Juli“, „Lange Ausfahrten nur samstags“, „4 Trainingstage pro Woche“.</div>}
      <div class="field"><label for="mm-k">Art</label><select id="mm-k" class="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="ziel">Ziel</option><option value="vorliebe">Vorliebe / Verfügbarkeit</option><option value="entscheidung">Entscheidung</option></select></div>
      <div class="field"><label for="mm-t">Text</label><input id="mm-t" class="input" value={t} onInput={(e) => setT(e.target.value)} placeholder="z. B. 4 Trainingstage, lang am Samstag" /></div>
      <button type="button" class="btn" disabled={!t.trim()} onClick={add}>Merken</button>
    </Sheet>
  );
}
