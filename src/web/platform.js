// Web-Version der Plattform-Fähigkeiten: eigener Speicher, Coach über die Claude-API, Medien im privaten Speicher.
export { kvGet, kvSet, kvDel, lsGet, lsSet, isTransient } from '../platform.js';
import { webDb } from './db.js';
import { sample } from './sample.js';
import { assets } from './assets.js';

const noMcp = { web: true, async callTool() { const e = new Error('In der Web-Version nicht verfügbar'); e.code = 'no_mcp'; throw e; } };
let capsP = null;
export function caps() {
  return (capsP ||= Promise.resolve({ db: webDb, mcp: noMcp, user: null, assets, downloads: null, sample, web: true }));
}
