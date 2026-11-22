// Sportarten der App und Zuordnung der Strava-Sportarten.

export const SPORT_ORDER = ['mtb', 'road', 'indoor', 'hike', 'gym', 'snowboard', 'splitboard', 'other'];

export const SPORTS = {
  mtb: { label: 'Mountainbike', short: 'MTB', code: 'MT', family: 'bike' },
  road: { label: 'Rennrad', short: 'Rennrad', code: 'RR', family: 'bike' },
  indoor: { label: 'Indoor-Rad', short: 'Indoor', code: 'IN', family: 'bike' },
  hike: { label: 'Wandern', short: 'Wandern', code: 'WA', family: 'foot' },
  gym: { label: 'Gym', short: 'Gym', code: 'GY', family: 'gym' },
  snowboard: { label: 'Snowboarden', short: 'Snowboard', code: 'SB', family: 'snow' },
  splitboard: { label: 'Splitboarden', short: 'Splitboard', code: 'SP', family: 'ski' },
  other: { label: 'Weitere', short: 'Weitere', code: '··', family: 'other' },
};

export const sportLabel = (s) => (SPORTS[s] || SPORTS.other).label;

// Anzeige-Sportart: Indoor-/Zwift-Fahrten getrennt vom Rennrad (gespeicherte Daten bleiben unverändert)
export const dsport = (a) => (a && a.indoor && (a.sport === 'road' || a.sport === 'mtb') ? 'indoor' : a ? a.sport : 'other');

// Iconoir-Icon je Sportart; Unterarten (Laufen, Ski alpin …) bekommen ihr eigenes Icon
const ICON = { road: 'bicycle', mtb: 'cycling', indoor: 'modern-tv', hike: 'trekking', gym: 'gym', snowboard: 'skateboarding', splitboard: 'snow', other: 'activity' };
const SUB_ICON = { Laufen: 'running', Traillauf: 'running', Spaziergang: 'walking', Schwimmen: 'swimming', Yoga: 'yoga', 'Ski alpin': 'snow-flake', Langlauf: 'snow', Klettern: 'stretching' };
export const sportIcon = (sport, sub) => (sub && SUB_ICON[sub]) || ICON[sport] || ICON.other;
export const actIcon = (a) => sportIcon(dsport(a), a && a.sub);

const MAP = {
  Ride: 'road', VirtualRide: 'road', GravelRide: 'road', Handcycle: 'road', Velomobile: 'road',
  MountainBikeRide: 'mtb', EMountainBikeRide: 'mtb', EBikeRide: 'road',
  Hike: 'hike',
  WeightTraining: 'gym', Workout: 'gym', Crossfit: 'gym', Elliptical: 'gym', StairStepper: 'gym', HighIntensityIntervalTraining: 'gym', Pilates: 'gym',
  Snowboard: 'snowboard', AlpineSki: 'snowboard',
  BackcountrySki: 'splitboard',
};

const SUB = {
  Walk: 'Spaziergang', Run: 'Laufen', TrailRun: 'Traillauf', Swim: 'Schwimmen', RockClimbing: 'Klettern',
  Rowing: 'Rudern', VirtualRow: 'Rudern (virtuell)', StandUpPaddling: 'Stand-up-Paddling', NordicSki: 'Langlauf',
  Yoga: 'Yoga', Elliptical: 'Crosstrainer', VirtualRide: 'Zwift / indoor', GravelRide: 'Gravel',
  EMountainBikeRide: 'E-MTB', EBikeRide: 'E-Bike', AlpineSki: 'Ski alpin', Workout: 'Workout', Crossfit: 'Crossfit',
};

// Zuordnung aus Strava-Daten. bikeFrame: 'Mtb' | 'Road' aus der Ausrüstung (falls bekannt).
export function mapSport(type, { trainer = false, bikeFrame = null } = {}) {
  let sport = MAP[type] || 'other';
  let derived = null;
  if (type === 'Ride' && bikeFrame === 'Mtb') { sport = 'mtb'; derived = 'Aus der Ausrüstung abgeleitet (MTB-Rahmen)'; }
  const indoor = type === 'VirtualRide' || type === 'VirtualRow' || (trainer && (sport === 'road' || sport === 'mtb'));
  const ebike = type === 'EMountainBikeRide' || type === 'EBikeRide';
  return { sport, sub: SUB[type] || null, indoor, ebike, derived };
}

export const isGpsSport = (s) => s !== 'gym';

// Felder für Bedingungen/Kontext je Sportart
export const CONTEXT_FIELDS = {
  mtb: [
    { k: 'surface', label: 'Untergrund', opts: ['trocken', 'feucht', 'nass/schlammig', 'Laub', 'Schnee/Eis', 'gemischt'] },
    { k: 'conditions', label: 'Bedingungen', opts: ['ideal', 'heiß', 'kalt', 'windig', 'Regen'] },
    { k: 'feel', label: 'Fahrgefühl', opts: ['flowig', 'solide', 'zäh', 'müde Beine', 'unsicher'] },
  ],
  road: [
    { k: 'conditions', label: 'Bedingungen', opts: ['ideal', 'heiß', 'kalt', 'windig', 'Regen'] },
    { k: 'feel', label: 'Gefühl', opts: ['stark', 'solide', 'zäh', 'müde Beine'] },
  ],
  hike: [
    { k: 'pack', label: 'Rucksackgewicht', unit: 'kg', num: true },
    { k: 'surface', label: 'Untergrund', opts: ['Forstweg', 'Wanderweg', 'Steig/felsig', 'Schnee', 'gemischt'] },
    { k: 'conditions', label: 'Bedingungen', opts: ['ideal', 'heiß', 'kalt', 'windig', 'Regen/Nebel'] },
  ],
  snowboard: [
    { k: 'snow', label: 'Schnee', opts: ['Pulver', 'griffig', 'hart/eisig', 'sulzig', 'Kunstschnee'] },
    { k: 'conditions', label: 'Wetter', opts: ['sonnig', 'bewölkt', 'Schneefall', 'windig', 'flaches Licht'] },
  ],
  splitboard: [
    { k: 'snow', label: 'Schnee', opts: ['Pulver', 'Firn', 'Bruchharsch', 'hart', 'nass', 'Wind gepresst'] },
    { k: 'conditions', label: 'Wetter', opts: ['sonnig', 'bewölkt', 'Schneefall', 'windig', 'Nebel'] },
    { k: 'equipment', label: 'Ausrüstung', text: true },
    { k: 'feel', label: 'Tourengefühl', opts: ['top', 'gut', 'zäh', 'grenzwertig'] },
  ],
  gym: [],
  other: [],
};

// Abschnittstypen
export const SECTION_TYPES = {
  climb: { label: 'Anstieg', short: '↗' },
  descent: { label: 'Abfahrt', short: '↘' },
  flat: { label: 'Verbindung', short: '→' },
  pause: { label: 'Pause', short: '⏸' },
  lift: { label: 'Lift', short: '⇡' },
  run: { label: 'Abfahrt', short: '↘' },
  ascent: { label: 'Aufstieg', short: '↗' },
  transition: { label: 'Übergang', short: '⇄' },
  walkup: { label: 'Aufstieg zu Fuß', short: '↗' },
};

export const SECTION_CHOICES = {
  mtb: ['climb', 'descent', 'flat', 'pause'],
  road: ['climb', 'descent', 'flat', 'pause'],
  hike: ['climb', 'descent', 'flat', 'pause'],
  other: ['climb', 'descent', 'flat', 'pause'],
  snowboard: ['run', 'lift', 'walkup', 'pause'],
  splitboard: ['ascent', 'transition', 'descent', 'pause'],
};
