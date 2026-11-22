// Kennzahlen: Herkunft, Einheit, Erklärung und persönlicher Normalbereich.
// Werte kommen nur aus den Connectoren; fehlt ein Wert, gibt es „keine Daten“.
import { num, int } from './format.js';
import { WEB } from './env.js';

const hm = (m) => (m == null ? '–' : Math.floor(m / 60) + ':' + String(Math.round(m % 60)).padStart(2, '0'));
const pmcSrc = (r) => (WEB || (r && r.src && r.src.pmc === 'hansport') ? 'hansport' : 'athletedata');
const band = (b) => (b && b[0] != null && b[1] != null ? [b[0] - b[1], b[0] + b[1]] : null);

export const M = {
  rec: {
    label: 'Bereitschaft', icon: 'battery-full', unit: '/100', src: (r) => (WEB || (r && r.rec == null && r.rdy != null) ? 'hansport' : 'athletedata'), get: (r) => (WEB ? r.rdy : r.rec != null ? r.rec : r.rdy), fmt: (v) => int(v), max: 100, better: 'up',
    explain: WEB ? 'Von hansport berechnet (0–100) aus fünf Faktoren, jeweils verglichen mit deiner eigenen Basis der letzten 60 Tage: HRV 25 %, Schlaf 25 % (Dauer zum Bedarf und Schlafschuld der letzten 3 Nächte), Ruhepuls 15 %, Trainingsbelastung 20 % (7 zu 28 Tagen) und Body Battery beim Aufwachen 15 %. Fehlt ein Faktor, werden die Gewichte auf die übrigen verteilt. Ist der Ruhepuls oder die Atemfrequenz deutlich erhöht, ist höchstens „locker“ möglich. Ab 75 hart, 55–74 normal, 40–54 locker, darunter Ruhe. Eine Schätzung, keine medizinische Bewertung.' : 'Wert von athletedata (0–100): vergleicht HRV und Ruhepuls der letzten Nacht mit deinem eigenen Normalbereich der letzten 60 Tage und berücksichtigt Schlaf und Schlafschuld. Er beantwortet eine Frage: wie hart du heute trainieren kannst. Er ist nicht derselbe Wert wie in der Garmin-App.',
    say: (v, r) => (v == null ? null : ({ go_hard: 'Bereit für eine harte Einheit.', steady: 'Normales Training passt.', easy: 'Heute eher locker.', rest: 'Heute eher Erholung.' }[WEB ? null : r.verdict] || { hart: 'Bereit für eine harte Einheit.', normal: 'Normales Training passt.', locker: 'Heute eher locker.', ruhe: 'Heute eher Erholung.' }[r.rdyK] || null)),
  },
  slScore: {
    label: 'Schlafscore', icon: 'half-moon', unit: '/100', src: (r) => (r.src && r.src.sleep) || 'garmin', get: (r) => r.slScore, fmt: (v) => int(v), max: 100, better: 'up',
    explain: 'Garmins Bewertung der Nacht (0–100) aus Dauer, Tiefschlaf, REM, Unruhe und Stress im Schlaf. Ab 80 gilt die Nacht bei Garmin als gut, unter 60 als schwach.',
    say: (v) => (v == null ? null : v >= 80 ? 'Gute Nacht.' : v >= 60 ? 'Ordentliche Nacht.' : 'Schwache Nacht.'),
  },
  sleep: {
    label: 'Schlafdauer', icon: 'half-moon', unit: 'h', src: (r) => (r.src && r.src.sleep) || 'garmin', get: (r) => r.slMin, fmt: hm, better: 'up', normal: (r) => (r.need ? [r.need - 30, r.need + 30] : null),
    explain: 'Gemessene Schlafzeit der Nacht vor dem Datum (das Datum ist der Aufwachtag). Der Schlafbedarf ist ' + (WEB ? 'Garmins' : 'athletedatas') + ' Schätzung aus deinen eigenen Nächten, die Schlafschuld die Summe der Fehlzeit der letzten 3 Nächte.',
    say: (v, r) => (v == null ? null : r.debt != null && r.debt > 60 ? 'Schlafschuld ' + hm(r.debt) + ' h.' : r.need ? (v >= r.need ? 'Bedarf (' + hm(r.need) + ' h) gedeckt.' : hm(r.need - v) + ' h unter deinem Bedarf.') : null),
  },
  hrv: {
    label: 'HRV', icon: 'activity', unit: 'ms', src: (r) => (r.src && r.src.hrv) || 'garmin', get: (r) => r.hrv, fmt: (v) => int(v), better: 'up', normal: (r) => band(r.base && r.base.hrv),
    explain: 'Herzfrequenzvariabilität: Schwankung der Abstände zwischen Herzschlägen, gemessen nachts von deiner Garmin-Uhr (Durchschnitt der Nacht). Höher als dein Normalbereich spricht für gute Erholung, deutlich darunter für Belastung, Stress, Alkohol oder beginnende Krankheit. Vergleichen lässt sich nur mit dir selbst.',
    say: (v, r) => { const b = band(r.base && r.base.hrv); if (v == null || !b) return null; return v < b[0] ? 'Unter deinem Normalbereich.' : v > b[1] ? 'Über deinem Normalbereich.' : 'In deinem Normalbereich.'; },
  },
  rhr: {
    label: 'Ruhepuls', icon: 'heart', unit: 'bpm', src: (r) => (r.src && r.src.rhr) || 'garmin', get: (r) => r.rhr, fmt: (v) => int(v), better: 'down', normal: (r) => band(r.base && r.base.rhr),
    explain: 'Niedrigster stabiler Puls des Tages laut Garmin. Steigt er mehrere Tage über deinen Normalbereich, deutet das auf Ermüdung, Stress oder eine Erkältung hin; sinkt er langfristig, oft auf bessere Ausdauer.',
    say: (v, r) => { const b = band(r.base && r.base.rhr); if (v == null || !b) return null; return v > b[1] ? 'Über deinem Normalbereich.' : v < b[0] ? 'Unter deinem Normalbereich.' : 'In deinem Normalbereich.'; },
  },
  resp: {
    label: 'Atemfrequenz', icon: 'droplet', unit: '/min', src: (r) => (r.src && r.src.resp) || 'garmin', get: (r) => r.resp, fmt: (v) => num(v, 1), better: null, normal: (r) => band(r.base && r.base.resp),
    explain: 'Atemzüge pro Minute im Schlaf. Ein Anstieg um mehr als 1–2 über deinen Normalbereich ist oft ein frühes Zeichen für Infekte oder hohe Belastung.',
    say: (v, r) => { const b = band(r.base && r.base.resp); if (v == null || !b) return null; return v > b[1] ? 'Erhöht gegenüber deinem Normalbereich.' : 'Im üblichen Bereich.'; },
  },
  bb: {
    label: 'Body Battery', icon: 'flash', unit: '/100', src: () => 'garmin', get: (r) => r.g && r.g.bbWake, fmt: (v) => int(v), max: 100, better: 'up',
    explain: 'Garmins Energiewert (0–100) beim Aufwachen. Schlaf und Ruhe laden ihn, Belastung und Stress verbrauchen ihn. Unter 25 beim Aufwachen heißt: kaum erholt.',
    say: (v, r) => (v == null ? null : (v >= 75 ? 'Gut geladen aufgewacht.' : v >= 50 ? 'Mittel geladen.' : v >= 25 ? 'Wenig geladen.' : 'Kaum erholt.') + (r.g && r.g.bbLast != null ? ' Zuletzt ' + r.g.bbLast + '.' : '')),
  },
  stress: {
    label: 'Stress', icon: 'brain', unit: '/100', src: () => 'garmin', get: (r) => r.g && !r.g.partial ? r.g.stress : null, fmt: (v) => int(v), max: 100, better: 'down',
    explain: 'Garmins Tagesdurchschnitt aus der Herzfrequenzvariabilität im Wachzustand (0–100). 0–25 Ruhe, 26–50 niedrig, 51–75 mittel, 76–100 hoch. Training zählt Garmin nicht mit.',
    say: (v) => (v == null ? null : v <= 25 ? 'Ruhiger Tag.' : v <= 50 ? 'Niedriger Stress.' : v <= 75 ? 'Mittlerer Stress.' : 'Hoher Stress.'),
  },
  steps: {
    label: 'Schritte', icon: 'walking', unit: '', src: (r) => (r.src && r.src.steps) || 'garmin', get: (r) => (r.g && !r.g.partial ? r.g.steps : r.steps), fmt: (v) => int(v), better: 'up',
    explain: 'Schritte des ganzen Tages laut Garmin. Das Ziel passt Garmin automatisch an deine letzten Tage an.',
    say: (v, r) => (v == null ? null : r.g && r.g.stepsGoal ? (v >= r.g.stepsGoal ? 'Tagesziel erreicht.' : 'Ziel ' + int(r.g.stepsGoal) + '.') : null),
  },
  akcal: {
    label: 'Kalorien', icon: 'fire-flame', unit: 'kcal', src: () => 'acts', get: (r) => r.akcal, fmt: (v) => int(v), better: null,
    explain: 'Summe der Kalorien deiner Aktivitäten an diesem Tag, wie sie Garmin (früher Strava) für jede Einheit angibt. Der Ruheumsatz ist nicht enthalten; ihn zeigt hansport nur, wenn Garmin einen Wert liefert. Kalorienangaben sind Schätzungen der Geräte.',
  },
  kcal: {
    label: 'Aktive Kalorien (Garmin)', icon: 'fire-flame', unit: 'kcal', src: () => 'garmin', get: (r) => (r.g && !r.g.partial ? r.g.act : null), fmt: (v) => int(v), better: null,
    explain: 'Kalorien, die du über den Grundumsatz hinaus verbrauchst – laut Garmin aus Bewegung und Training. Der Grundumsatz ist nicht enthalten, deshalb ist die Summe kleiner als dein Tagesverbrauch.',
  },
  im: {
    label: 'Intensitätsminuten', icon: 'timer', unit: 'min', src: () => 'garmin', get: (r) => (r.g && !r.g.partial ? r.g.im : null), fmt: (v) => int(v), better: 'up',
    explain: 'Garmins Intensitätsminuten: mittlere Belastung zählt einfach, hohe doppelt. Die WHO empfiehlt mindestens 150 pro Woche; Garmin setzt dein Wochenziel entsprechend.',
  },
  vo2: {
    label: 'VO2max', icon: 'graph-up', unit: 'ml/kg/min', src: () => 'garmin', get: (r) => r.vo2, fmt: (v) => int(v), better: 'up', sparse: true,
    explain: 'Maximale Sauerstoffaufnahme, von Garmin aus Rad-Einheiten mit Puls und Leistung geschätzt (kein Labormesswert). Höher heißt mehr aerobe Kapazität. Aussagekräftig ist vor allem der eigene Verlauf über Wochen.',
    say: (v, r) => (v == null ? null : r.fitAge ? 'Fitnessalter laut Garmin: ' + r.fitAge + '.' : null),
  },
  weight: {
    label: 'Gewicht', icon: 'weight', unit: 'kg', src: () => 'withings', get: (r) => r.wi && r.wi.weight, fmt: (v) => num(v, 1), better: null, sparse: true,
    explain: 'Gemessen mit deiner Withings-Waage. Tageswerte schwanken durch Wasser und Mahlzeiten um 0,5–1 kg; aussagekräftig ist der Trend über Wochen.',
  },
  fatPct: {
    label: 'Körperfett', icon: 'percentage-circle', unit: '%', src: () => 'withings', get: (r) => r.wi && r.wi.fatPct, fmt: (v) => num(v, 1), better: 'down', sparse: true,
    explain: 'Von der Withings-Waage per Bioimpedanz geschätzt. Der Absolutwert ist ungenau, Veränderungen über Wochen sind brauchbar, wenn du unter gleichen Bedingungen misst (morgens, nüchtern).',
  },
  muscle: {
    label: 'Muskelmasse', icon: 'gym', unit: 'kg', src: () => 'withings', get: (r) => r.wi && r.wi.muscle, fmt: (v) => num(v, 1), better: 'up', sparse: true,
    explain: 'Von der Withings-Waage geschätzt (Bioimpedanz). Gut für den Trend, nicht als exakter Wert.',
  },
  visceral: {
    label: 'Viszerales Fett', icon: 'stats-report', unit: 'Index', src: () => 'withings', get: (r) => r.wi && r.wi.visceral, fmt: (v) => num(v, 1), better: 'down', sparse: true,
    explain: 'Index für Fett im Bauchraum, von der Withings-Waage geschätzt. Aussagekräftig ist der Verlauf bei gleichen Messbedingungen.',
  },
  vasc: {
    label: 'Gefäßalter', icon: 'heart', unit: 'Jahre', src: () => 'withings', get: (r) => r.wi && r.wi.vasc, fmt: (v) => num(v, 1), better: 'down', sparse: true,
    explain: 'Von Withings aus der Pulswellengeschwindigkeit abgeleitet: wie elastisch deine Arterien im Vergleich zu Gleichaltrigen sind. Eine Schätzung, keine Diagnose.',
  },
  pwv: {
    label: 'Pulswellengeschw.', icon: 'activity', unit: 'm/s', src: () => 'withings', get: (r) => r.wi && r.wi.pwv, fmt: (v) => num(v, 1), better: 'down', sparse: true,
    explain: 'Wie schnell sich die Pulswelle in den Arterien ausbreitet, gemessen von der Withings-Waage. Niedriger heißt elastischere Gefäße.',
  },
  ctl: {
    label: 'Fitness', icon: 'graph-up', unit: 'CTL', src: pmcSrc, get: (r) => r.ctl, fmt: (v) => num(v, 1), better: 'up',
    explain: 'Chronische Trainingsbelastung: gewichteter Schnitt deiner Belastung der letzten 42 Tage, ' + (WEB ? 'von hansport selbst berechnet. Belastung je Einheit: Strava Relative Effort; wo er fehlt, pulsbasiert (Dauer und Durchschnittspuls zwischen Ruhe- und Maximalpuls), auf die Relative-Effort-Skala geeicht.' : 'von athletedata aus deinen Strava-Einheiten berechnet.') + ' Kein Prozentwert, nur mit dir selbst vergleichbar.',
  },
  atl: {
    label: 'Ermüdung', icon: 'fire-flame', unit: 'ATL', src: pmcSrc, get: (r) => r.atl, fmt: (v) => num(v, 1), better: null,
    explain: 'Akute Belastung (Ermüdung): gewichteter Schnitt der letzten 7 Tage. Liegt sie deutlich über der Fitness, bist du ermüdet.',
  },
  tsb: {
    label: 'Form', icon: 'compass', unit: 'TSB', src: pmcSrc, get: (r) => r.tsb, fmt: (v) => (v > 0 ? '+' : '') + num(v, 1), better: null,
    explain: 'Fitness minus Ermüdung. Positiv heißt ausgeruht, um 0 neutral, unter −10 produktiv ermüdet, unter −30 sehr hohe Belastung. Die Werte stabilisieren sich erst nach rund 42 Tagen Daten.',
  },
};

export function formWord(tsb) {
  if (tsb == null) return null;
  return tsb > 15 ? 'sehr frisch' : tsb > 5 ? 'frisch' : tsb >= -10 ? 'neutral' : tsb >= -30 ? 'produktiv ermüdet' : 'sehr hohe Belastung';
}

// letzter vorhandener Wert bis einschließlich Datum
export function latest(list, key, upto) {
  const m = M[key];
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (upto && r.date > upto) continue;
    const v = m.get(r);
    if (v != null) return { v, r, date: r.date };
  }
  return null;
}
// Reihe für die letzten n Tage bis Datum (fehlende Tage als null)
export function series(map, key, end, n) {
  const m = M[key], out = [];
  const d = new Date(end + 'T12:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d); x.setUTCDate(d.getUTCDate() - i);
    const k = x.toISOString().slice(0, 10);
    const r = map[k];
    out.push({ date: k, v: r ? m.get(r) : null, r });
  }
  return out;
}
export const hmin = hm;
