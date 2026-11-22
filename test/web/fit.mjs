import { Encoder, Profile } from '@garmin/fitsdk';
import { decodeFit, series, sample, summaryPolyline, laps, sets, sessionInfo, extractFit } from '../../lib/fit.js';
import { zipSync } from 'fflate';
const e = new Encoder();
const t0 = new Date('2026-11-20T09:00:00Z');
e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 0, timeCreated: t0, type: 'activity' });
const SC = 2 ** 31 / 180;
for (let i = 0; i < 3600; i++) {
  const lat = 46.5 + i * 0.00005, lon = 11.35 + Math.sin(i / 300) * 0.01;
  e.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(+t0 + i * 1000), positionLat: Math.round(lat * SC), positionLong: Math.round(lon * SC), distance: i * 7.5, enhancedAltitude: 300 + i * 0.3, heartRate: 120 + (i % 30), power: 180 + (i % 50), cadence: 85, enhancedSpeed: 7.5, temperature: 12 });
}
e.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(+t0 + 3600000), startTime: t0, totalElapsedTime: 3600, totalTimerTime: 3500, totalDistance: 27000, avgHeartRate: 135, avgPower: 205, totalAscent: 1080 });
e.onMesg(Profile.MesgNum.SET, { timestamp: new Date(+t0 + 10000), setType: 'active', repetitions: 10, weight: 60, duration: 40, category: ['benchPress'] });
e.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(+t0 + 3600000), startTime: t0, sport: 'cycling', subSport: 'road', totalElapsedTime: 3600, totalTimerTime: 3500, avgTemperature: 12, normalizedPower: 210, trainingStressScore: 75 });
const bytes = e.close();
const zip = zipSync({ '12345_ACTIVITY.fit': bytes });
const m = decodeFit(extractFit(Buffer.from(zip)));
const s = series(m);
const smp = sample(s, 1000);
console.log('n', s.n, 'keys', Object.keys(smp), 'len', smp.time.length, smp.location[5], smp.velocity_smooth[5], smp.moving.slice(0, 3));
console.log('poly', summaryPolyline(s).length, laps(m), sets(m), sessionInfo(m));
