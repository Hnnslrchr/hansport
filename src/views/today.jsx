// „Heute“: seit Runde 7 das Cockpit (src/views/cockpit.jsx). refreshAll bleibt hier, Gesundheit importiert es.
import { h } from 'preact';
import * as Acts from '../strava.js';
import { syncHealth, explainHealth } from '../health.js';
import { toast } from '../store.js';
import { Cockpit } from './cockpit.jsx';

export async function refreshAll() {
  const r = await Promise.allSettled([Acts.sync({}), syncHealth()]);
  if (r[0].status === 'rejected') toast(Acts.explain(r[0].reason), 'error');
  if (r[1].status === 'rejected') toast(explainHealth(r[1].reason), 'error');
}

export function Today() {
  return <Cockpit />;
}
