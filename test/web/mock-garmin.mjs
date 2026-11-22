// Nachbildung der Garmin Personal API für lokale Tests (Antwortformen laut OpenAPI-Typen).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { Encoder, Profile } from '@garmin/fitsdk';
import { zipSync } from 'fflate';

const PORT = +process.argv[2] || 8790;
const FX = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url)));
const TYPE = { Ride: 'road_biking', VirtualRide: 'virtual_ride', MountainBikeRide: 'mountain_biking', GravelRide: 'gravel_cycling', Hike: 'hiking', Walk: 'walking', WeightTraining: 'strength_training', Workout: 'strength_training', Snowboard: 'resort_snowboarding', BackcountrySki: 'backcountry_snowboarding', Run: 'running', EBikeRide: 'e_bike_fitness' };
const acts = FX.activities.map((a, i) => ({
  activityId: 9000000000 + i, activityName: a.name, startTimeLocal: a.start_local.replace('T', ' '),
  activityType: { typeId: 1, typeKey: TYPE[a.sport_type] || 'other', parentTypeId: 17 },
  distance: a.summary.distance, duration: a.summary.elapsed_time, movingDuration: a.summary.moving_time, elapsedDuration: a.summary.elapsed_time,
  elevationGain: a.summary.elevation_gain, averageSpeed: a.summary.avg_speed, maxSpeed: a.summary.max_speed, calories: a.summary.total_calories,
  averageHR: 130 + (i % 20), maxHR: 170, activityTrainingLoad: a.summary.relative_effort != null ? a.summary.relative_effort * 1.4 : null,
  aerobicTrainingEffect: 2.8, hasPolyline: a.sport_type !== 'VirtualRide' && a.sport_type !== 'WeightTraining', hrTimeInZone_1: 600, hrTimeInZone_2: 1200, hrTimeInZone_3: 300, hrTimeInZone_4: 60, hrTimeInZone_5: 0,
}));
// zwei neue Aktivitäten, die es in Strava nicht gibt
acts.push({ activityId: 9100000001, activityName: 'Rennrad Kalterer See', startTimeLocal: '2026-11-19 10:05:00', activityType: { typeKey: 'road_biking' }, distance: 27000, duration: 3600, movingDuration: 3500, elapsedDuration: 3600, elevationGain: 1080, averageSpeed: 7.5, maxSpeed: 14, calories: 900, averageHR: 141, maxHR: 176, avgPower: 205, normPower: 214, activityTrainingLoad: 120, aerobicTrainingEffect: 3.4, hasPolyline: true, hrTimeInZone_1: 300, hrTimeInZone_2: 1800, hrTimeInZone_3: 1200, hrTimeInZone_4: 300, hrTimeInZone_5: 0 });
acts.push({ activityId: 9100000002, activityName: 'Krafttraining', startTimeLocal: '2026-11-21 18:30:00', activityType: { typeKey: 'strength_training' }, distance: 0, duration: 2700, movingDuration: 2700, elapsedDuration: 2700, elevationGain: 0, averageSpeed: 0, maxSpeed: 0, calories: 300, averageHR: 110, maxHR: 150, activityTrainingLoad: 35, hasPolyline: false });

function fitFor(id) {
  const e = new Encoder();
  const t0 = new Date('2026-11-19T09:05:00Z');
  e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: t0, type: 'activity' });
  const SC = 2 ** 31 / 180;
  if (id !== 9100000002) {
    for (let i = 0; i < 3600; i += 2) {
      const lat = 46.40 + i * 0.000012, lon = 11.25 + Math.sin(i / 400) * 0.008;
      e.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(+t0 + i * 1000), positionLat: Math.round(lat * SC), positionLong: Math.round(lon * SC), distance: i * 7.5, enhancedAltitude: 250 + i * 0.3, heartRate: 125 + (i % 40), power: 180 + (i % 60), cadence: 86, enhancedSpeed: i > 1800 && i < 1900 ? 0 : 7.5, temperature: 11 });
    }
    e.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(+t0 + 1800000), startTime: t0, totalElapsedTime: 1800, totalTimerTime: 1750, totalDistance: 13500, avgHeartRate: 138, avgPower: 200, totalAscent: 540 });
    e.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(+t0 + 3600000), startTime: new Date(+t0 + 1800000), totalElapsedTime: 1800, totalTimerTime: 1750, totalDistance: 13500, avgHeartRate: 144, avgPower: 210, totalAscent: 540 });
  } else {
    for (let k = 0; k < 6; k++) e.onMesg(Profile.MesgNum.SET, { timestamp: new Date(+t0 + k * 120000), setType: 'active', repetitions: 8 + k, weight: 40 + 5 * k, duration: 45, category: [k < 3 ? 'benchPress' : 'squat'] });
  }
  e.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(+t0 + 3600000), startTime: t0, sport: id === 9100000002 ? 'training' : 'cycling', totalElapsedTime: 3600, totalTimerTime: 3500 });
  return zipSync({ [id + '_ACTIVITY.fit']: e.close() });
}

const day = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const range = (a, b) => { const out = []; for (let d = a; d <= b; d = day(d, 1)) out.push(d); return out; };
const h = (d) => [...d].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 9973, 7);
const TOKEN = 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url') + '.sig';
let calls = {};

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  const p = u.pathname;
  calls[p.replace(/\d{4}-\d\d-\d\d/g, 'D').replace(/\d{6,}/g, 'N')] = (calls[p.replace(/\d{4}-\d\d-\d\d/g, 'D').replace(/\d{6,}/g, 'N')] || 0) + 1;
  const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (p === '/__calls') return json(calls);
  if (p === '/measure') {
    let body = ''; for await (const c of req) body += c;
    if (req.headers.authorization !== 'Bearer wtok') return json({ status: 401 });
    const t = Math.floor(Date.parse('2026-11-21T06:30:00Z') / 1000);
    return json({ status: 0, body: { timezone: 'Europe/Rome', more: 0, offset: 0, measuregrps: [{ grpid: 1, date: t, category: 1, measures: [{ value: 78123, type: 1, unit: -3 }, { value: 171, type: 6, unit: -1 }, { value: 13360, type: 8, unit: -3 }, { value: 6122, type: 76, unit: -3 }, { value: 7, type: 170, unit: 0 }] }] } });
  }
  if (p === '/v1/messages') {
    let body = ''; for await (const c of req) body += c;
    const b = JSON.parse(body);
    const last = b.messages[b.messages.length - 1];
    const sse = (evs) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); for (const e of evs) res.write('event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n'); res.end(); };
    if (req.headers['x-api-key'] !== 'sk-test') return json({ error: { message: 'invalid x-api-key' } }, 401);
    if (Array.isArray(last.content) && last.content[0].type === 'tool_result') {
      const txt = 'Deine HRV liegt im Normalbereich. ' + 'Werkzeug sagte: ' + String(last.content[0].content).slice(0, 40) + '\nGrundlage: Test';
      return sse([{ type: 'message_start', message: { id: 'm2' } }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: txt.slice(0, 20) } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: txt.slice(20) } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }]);
    }
    const toolsOk = (b.tools || []).some((t) => t.name === 'zeitreihe') && !(b.tools || []).some((t) => t.name === 'athletenkontext');
    return sse([{ type: 'message_start', message: { id: 'm1' } }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Ich schaue nach. ' } }, { type: 'content_block_stop', index: 0 }, { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu1', name: toolsOk ? 'zeitreihe' : 'fehlt', input: {} } }, { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"kennzahl":"hrv",' } }, { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"von":"2026-11-15","bis":"2026-11-22"}' } }, { type: 'content_block_stop', index: 1 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' } }, { type: 'message_stop' }]);
  }
  if (p === '/personalapitoken-service/personal-api/personal-api-key/token') {
    if (req.headers.authorization !== 'ApiKey test-key') return json({ error: 'bad key' }, 401);
    res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(TOKEN);
  }
  if (req.headers.authorization !== 'Bearer ' + TOKEN) return json({ error: 'unauthorized' }, 401);
  let m;
  if (p === '/activitylist-service/activities/search/activities') {
    let l = acts.slice().sort((a, b) => (a.startTimeLocal < b.startTimeLocal ? -1 : 1));
    if (q.startDate) l = l.filter((a) => a.startTimeLocal.slice(0, 10) >= q.startDate);
    if (q.endDate) l = l.filter((a) => a.startTimeLocal.slice(0, 10) <= q.endDate);
    if (q.sortOrder !== 'asc') l.reverse();
    return json(l.slice(+q.start || 0, (+q.start || 0) + (+q.limit || 99)));
  }
  if ((m = /^\/download-service\/files\/activity\/(\d+)$/.exec(p))) { res.writeHead(200, { 'content-type': 'application/zip' }); return res.end(Buffer.from(fitFor(+m[1]))); }
  if (p === '/usersummary-service/v2/dailysummaries') return json({ data: range(q.startDate, q.endDate).map((d) => ({ calendarDate: d, movement: { steps: { value: 8000 + h(d) % 4000, goal: 10000 }, floorsAscended: { value: 9 } }, heartRate: { restingValue: 48 + h(d) % 5, maxValue: 160, minValue: 44 }, intensityMinutes: { goal: 150, moderate: 20, vigorous: 10 }, stress: { avgLevel: 25 + h(d) % 10, maxLevel: 90, restDurationInMillis: 30000000, lowStressDurationInMillis: 12000000, mediumStressDurationInMillis: 5000000, highStressDurationInMillis: 1000000 }, bodyBattery: { minValue: 15, maxValue: 85, chargedValue: 60, drainedValue: 65, latestValue: 40 }, calories: { burnedResting: 1800, burnedActive: 600, burnedTotal: 2400 }, respiration: { avgValue: 14.2 } })) });
  if (p === '/sleep-service/sleep/dailySleepSummariesByDate') return json(range(q.startDate, q.endDate).map((d) => ({ calendarDate: d, sleepTimeSeconds: 25200 + (h(d) % 3600), deepSleepSeconds: 5400, lightSleepSeconds: 14400, remSleepSeconds: 5400, awakeSleepSeconds: 1200, sleepStartTimestampLocal: Date.parse(day(d, -1) + 'T22:40:00Z'), sleepEndTimestampLocal: Date.parse(d + 'T06:35:00Z'), sleepScores: { overall: { value: 70 + h(d) % 20 } }, averageRespirationValue: 13.8, averageSpO2Value: 95, lowestSpO2Value: 89, sleepNeed: { actual: 480, baseline: 470 }, avgHeartRate: 50 })));
  if ((m = /^\/hrv-service\/hrv\/daily\/(\S+)\/(\S+)$/.exec(p))) return json({ hrvSummaries: range(m[1], m[2]).map((d) => ({ calendarDate: d, lastNightAvg: 55 + h(d) % 12, weeklyAvg: 60, status: 'BALANCED', baseline: { balancedLow: 52, balancedUpper: 70, lowUpper: 48 } })) });
  if ((m = /^\/metrics-service\/metrics\/maxmet\/daily\/(\S+)\/(\S+)$/.exec(p))) return json(range(m[1], m[2]).filter((d, i) => i % 7 === 0).map((d) => ({ generic: { calendarDate: d, vo2MaxPreciseValue: 51.2 }, cycling: { calendarDate: d, vo2MaxPreciseValue: 53.4 } })));
  if (/^\/fitnessage-service\/fitnessage\/v2\//.test(p)) return json({ chronologicalAge: 31, fitnessAge: 24.5 });
  if (p === '/usersummary-service/usersummary/daily') return json({ calendarDate: q.calendarDate, bodyBatteryAtWakeTime: 70 + h(q.calendarDate) % 20, bodyBatteryHighestValue: 90, bodyBatteryLowestValue: 20 });
  if (/^\/weight-service\/weight\/range\//.test(p)) return json({ dailyWeightSummaries: [{ summaryDate: '2026-11-20', latestWeight: { weight: 78400, bodyFat: 17.1, muscleMass: 36000, sourceType: 'MANUAL' } }] });
  if (p === '/biometric-service/heartRateZones/v2') return json([{ sport: 'DEFAULT', zone1Floor: 95, zone2Floor: 120, zone3Floor: 140, zone4Floor: 158, zone5Floor: 172, maxHeartRateUsed: 188, restingHeartRateUsed: 48 }]);
  json({ message: 'not found' }, 404);
}).listen(PORT, () => console.log('mock garmin on', PORT));
