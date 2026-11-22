// Formatierung auf Deutsch.

const cache = {};
const nf = (min, max) => {
  const k = min + '-' + max;
  return cache[k] || (cache[k] = new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max }));
};

export const num = (v, d = 0) => (v == null || isNaN(v) ? '–' : nf(d, d).format(v));
export const int = (v) => num(Math.round(v || 0), 0);
export const km = (m) => (m == null ? '–' : m >= 100000 ? num(m / 1000, 0) : num(m / 1000, 1));
export const hm = (m) => (m == null ? '–' : int(m));

export function dur(s) {
  if (s == null || isNaN(s)) return '–';
  s = Math.round(s);
  if (s < 60) return s + ' s';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h === 0) return m + ' min';
  return h + ':' + String(m).padStart(2, '0') + ' h';
}

export function clock(s) {
  if (s == null || isNaN(s)) return '–';
  s = Math.round(Math.abs(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  return m + ':' + String(sec).padStart(2, '0');
}

export function hours(s) {
  return num((s || 0) / 3600, (s || 0) / 3600 < 10 ? 1 : 0) + ' h';
}

export function signedDur(s) {
  if (s == null || isNaN(s)) return '–';
  const a = Math.abs(Math.round(s));
  const sign = s < 0 ? '−' : '+';
  if (a < 60) return sign + a + ' s';
  return sign + clock(a) + ' min';
}

export function pct(v, d = 0) {
  if (v == null || !isFinite(v)) return '–';
  const s = v > 0 ? '+' : v < 0 ? '−' : '±';
  return s + num(Math.abs(v * 100), d) + ' %';
}

export const speedKmh = (ms) => (ms ? num(ms * 3.6, 1) : '–');

export function pace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '–';
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return m + ':' + String(s).padStart(2, '0');
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
const MONL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const parseDate = (d) => { const [y, m, dd] = d.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd); };
export const isoDate = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
export const today = () => isoDate(new Date());

export function dateShort(d) {
  const dt = parseDate(d);
  return WD[dt.getDay()] + '., ' + dt.getDate() + '. ' + MON[dt.getMonth()];
}
export function dateMid(d) {
  const dt = parseDate(d);
  return dt.getDate() + '. ' + MON[dt.getMonth()] + ' ' + dt.getFullYear();
}
export function dateLong(d) {
  const dt = parseDate(d);
  return WD[dt.getDay()] + '., ' + dt.getDate() + '. ' + MONL[dt.getMonth()] + ' ' + dt.getFullYear();
}
export const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return MONL[m - 1] + ' ' + y; };
export const monthShort = (ym) => { const [y, m] = ym.split('-').map(Number); return MON[m - 1] + ' ' + String(y).slice(2); };
export const monthOnly = (m) => MON[m];
export const timeOf = (iso) => (iso && iso.length > 15 ? iso.slice(11, 16) : '');

export function relDate(d) {
  const t = parseDate(today());
  const dt = parseDate(d);
  const diff = Math.round((t - dt) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff < 7 && diff > 1) return 'vor ' + diff + ' Tagen';
  return dateShort(d);
}

export function ago(ts) {
  if (!ts) return 'noch nie';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return 'vor ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'vor ' + Math.round(s / 3600) + ' h';
  const d = new Date(ts);
  return dateMid(isoDate(d)) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export const plural = (n, one, many) => int(n) + ' ' + (n === 1 ? one : many);

// Satzende nach einem Datum ohne doppelten Punkt („21. Nov.“ statt „21. Nov..“)
export const endDot = (t) => (String(t).endsWith('.') ? t : t + '.');

// Runde 5: schmaler Abstand zwischen Zahl und Einheit, Datum ohne Klammern
export const NB = ' ';
export const withUnit = (v, u) => (u ? v + NB + u : String(v));
export function dayMon(d) { const dt = parseDate(d); return dt.getDate() + '. ' + MON[dt.getMonth()]; }
// „heute“, „gestern“ oder „letzte Messung 17. Sept.“
export function lastMeas(d, ref) {
  const diff = Math.round((parseDate(ref || today()) - parseDate(d)) / 86400000);
  return diff <= 0 ? 'heute' : diff === 1 ? 'gestern' : 'letzte Messung ' + dayMon(d);
}
