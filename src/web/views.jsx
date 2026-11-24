// Nur in der Web-Version: Verbindungen (Garmin, Withings, Coach), Import aus der Claude-Version, Abmelden.
import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Section, Top } from '../ui/kit.jsx';
import { toast, COLLS, getState, setDoc, derived, subscribe } from '../store.js';
import { useData } from '../views/common.jsx';
import { api } from './api.js';
import { bulkWrite } from './db.js';
import { athletedataOn, athletedataWanted, setAthletedataUse, recomputeHealth, healthDays, healthMeta } from './health.js';
import { fitPaused } from './acts.js';
import { seedGear, gearSeed } from '../gear.js';

const dt = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

const when = (ms) => (ms ? new Date(ms).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'noch nie');
const dMid = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function Row({ name, state, ok, children }) {
  return (
    <div class="src-row">
      <div class="src-h"><b>{name}</b><span class={'src-st' + (ok ? ' ok' : '')}>{ok ? <span class="dot" aria-hidden="true" /> : null}{state}</span></div>
      {children}
    </div>
  );
}

function Toggle({ id, label, checked, disabled, onChange, hint }) {
  return (
    <label class="toggle" for={id}>
      <span class="grow"><span class="t1">{label}</span>{hint ? <span class="tiny faint" style="display:block">{hint}</span> : null}</span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

// Mehr → Datenquellen: woher welche Daten kommen, Status und letzter Abgleich
export function Sources() {
  const d = useData();
  const S = getState();
  const [s, setS] = useState(null);
  const [test, setTest] = useState(null);
  const [adTest, setAdTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/api/status').then(setS).catch((e) => setS({ error: e.message }));
  useEffect(() => { load(); }, []);
  const check = async () => { setBusy(true); try { const r = await api('/api/status?test=garmin'); setTest(r.garmin); } catch (e) { setTest({ ok: false, error: e.message }); } setBusy(false); };
  const checkAd = async () => { setBusy(true); try { const r = await api('/api/status?test=athletedata'); setAdTest(r.athletedata); } catch (e) { setAdTest({ ok: false, error: e.message }); } setBusy(false); };
  const unlink = async () => { try { await api('/api/withings?a=disconnect', { method: 'POST' }); toast('Withings getrennt'); load(); } catch (e) { toast(e.message, 'error'); } };
  const g = (s && s.garmin) || {}, w = (s && s.withings) || {}, c = (s && s.coach) || {}, ad = (s && s.athletedata) || {};
  const sync = S.meta.sync || {}, hm = S.meta.health || {};
  const H = healthDays();
  const lastW = H.list.slice().reverse().find((r) => r.wi && r.wi.weight != null);
  const nEcg = H.list.filter((r) => r.wi && r.wi.ecg).length;
  const nStrava = d.list.filter((a) => a.src === 'strava' && a.origin === 'strava').length;
  const nGarmin = d.list.filter((a) => a.origin === 'garmin').length;
  const set = S.settings.main || {};
  const hide = set.hideEmpty !== false;
  const seed = gearSeed();
  const pmc = hm.pmc || {};
  return (
    <div class="view">
      <Top title="Datenquellen" />
      <Section title="Verbunden">
        <div class="card p src-card">
          {!s ? <div class="small muted" style="padding:10px 0">Lädt …</div> : s.error ? <div class="small" style="padding:10px 0">{s.error}</div> : (
            <Fragment>
              <Row name="Garmin" ok={g.configured && (!test || test.ok)} state={!g.configured ? 'nicht eingerichtet' : test ? (test.ok ? 'verbunden' : 'Fehler') : 'eingerichtet'}>
                <div class="small muted">Aktivitäten, Schlaf, HRV, Ruhepuls, Body Battery, Stress, Schritte, VO2max.</div>
                <div class="small">Aktivitäten: {when(sync.lastSync)} · Gesundheit: {when(hm.lastSync)}{hm.lastDay ? ', Werte bis ' + dMid(hm.lastDay) : ''}</div>
                {fitPaused() ? <div class="small muted">Garmin drosselt gerade; Strecken werden in ein paar Minuten weiter geladen.</div> : null}
                {!g.configured ? <div class="tiny faint">Trag deinen Garmin-API-Schlüssel in Vercel als GARMIN_API_KEY ein und stelle neu bereit.</div> : null}
                {test && !test.ok ? <div class="tiny" style="color:var(--bad)">{test.error}</div> : null}
                {g.configured ? <button type="button" class="btn sec2" disabled={busy} onClick={check}>{busy ? 'Prüfe …' : 'Verbindung prüfen'}</button> : null}
              </Row>
              <Row name="Withings" ok={w.connected} state={!w.configured ? 'nicht eingerichtet' : w.connected ? 'verbunden' : 'nicht verbunden'}>
                <div class="small muted">Gewicht, Körperzusammensetzung und EKG der Waage.</div>
                <div class="small">{lastW ? 'Letzte Messung ' + dMid(lastW.date) : 'Noch keine Messung'}{w.connected && w.since ? ' · verbunden seit ' + dt(w.since) : ''}</div>
                {w.connected && (nEcg || healthMeta().ecg) ? <div class="small">{nEcg ? 'EKG an ' + nEcg + ' Tagen übernommen' : 'EKG: Withings hat bisher keine Aufnahmen übermittelt'}</div> : null}
                {!w.configured ? <div class="tiny faint">Braucht eine eigene Withings-Entwickler-App (WITHINGS_CLIENT_ID und WITHINGS_CLIENT_SECRET in Vercel).</div> : null}
                {w.configured && !w.connected ? <a class="btn" href="/api/withings?a=start">Mit Withings verbinden</a> : null}
                {w.connected ? <button type="button" class="btn sec2" onClick={unlink}>Withings trennen</button> : null}
              </Row>
              <Row name="Strava" ok={false} state="nicht verbunden">
                <div class="small muted">Strava erlaubt keine Weitergabe seiner Daten an KI-Dienste wie den Coach. Darum kommen neue Aktivitäten hier von Garmin.</div>
                <div class="small">{nStrava} frühere Aktivitäten aus Strava übernommen, {nGarmin} von Garmin.{seed ? ' Ausrüstung: Startwerte Stand ' + dMid(seed.asOf) + '.' : ''}</div>
              </Row>
              <Row name="athletedata" ok={athletedataWanted() && ad.configured} state={athletedataWanted() ? (ad.configured ? 'an' : 'an, aber nicht eingerichtet') : 'aus'}>
                <div class="small muted">Normalbereiche, Fitness, Ermüdung, Form und Bereitschaft rechnet hansport selbst aus deinen Daten. athletedata ist nicht nötig.</div>
                <Toggle id="src-ad" label="athletedata verwenden" checked={athletedataWanted()} disabled={!ad.configured && !athletedataWanted()} hint={ad.configured ? 'Gesundheitswerte kämen dann über athletedata statt direkt von Garmin.' : 'Zum Einschalten ATHLETEDATA_API_KEY in Vercel eintragen.'} onChange={(on) => { setAthletedataUse(on); toast(on ? 'athletedata an' : 'athletedata aus'); }} />
                {ad.configured ? <button type="button" class="btn sec2" disabled={busy} onClick={checkAd}>{busy ? 'Prüfe …' : 'athletedata prüfen'}</button> : null}
                {adTest ? <div class="tiny" style={adTest.ok ? '' : 'color:var(--bad)'}>{adTest.ok ? 'Abo ' + (adTest.plan === 'ACTIVE' ? 'aktiv' : adTest.plan || '?') + (adTest.until ? ' bis ' + adTest.until.split('-').reverse().join('.') : '') + (adTest.apps && adTest.apps.length ? ' · verbunden: ' + adTest.apps.join(', ') : '') : adTest.error}</div> : null}
              </Row>
              <Row name="Coach (Claude-API)" ok={c.configured} state={c.configured ? 'eingerichtet' : 'nicht eingerichtet'}>
                <div class="small muted">{c.configured ? 'Modell ' + c.model + '. Fragen an den Coach senden die nötigen Werte an die Claude-API (Anthropic).' : 'Trag deinen Claude-API-Schlüssel in Vercel als ANTHROPIC_API_KEY ein.'}</div>
              </Row>
            </Fragment>
          )}
        </div>
      </Section>
      <Section title="Selbst berechnet">
        <div class="card p stack" style="gap:6px">
          <div class="small">Normalbereiche: Mittel ± 1 Standardabweichung deiner eigenen letzten 90 Tage.</div>
          <div class="small">Belastung: Strava Relative Effort, sonst pulsbasiert{pmc.n ? ' (' + [pmc.n.re ? pmc.n.re + ' mit Relative Effort' : null, pmc.n.hr ? pmc.n.hr + ' pulsbasiert' : null, pmc.n.garmin ? pmc.n.garmin + ' aus Garmin-Last' : null].filter(Boolean).join(', ') + ')' : ''}.</div>
          <div class="small">Bereitschaft: HRV, Schlaf, Ruhepuls, Belastung und Body Battery gegen deine Basis der letzten 60 Tage.</div>
          <button type="button" class="btn sec2" onClick={() => { recomputeHealth(); toast('Neu berechnet'); }}>Jetzt neu berechnen</button>
        </div>
      </Section>
      <Section title="Anzeige">
        <div class="card p">
          <Toggle id="src-hide" label="Kacheln ohne Daten ausblenden" checked={hide} onChange={(on) => setDoc('settings/main', { ...(getState().settings.main || {}), hideEmpty: on })} hint="Kacheln mit älteren Werten bleiben und zeigen die letzte Messung." />
        </div>
      </Section>
      <WebImport />
      <div class="pad" style="margin-top:12px"><a class="btn sec2 wide" href="/api/logout">Abmelden</a></div>
      <div class="spacer" />
    </div>
  );
}

// Kompakt für die Einstellungen
export function WebConnections() { return null; }

export function WebImport() {
  const [state, setState] = useState(null);
  const pick = async (file) => {
    if (!file) return;
    setState({ busy: true, text: 'Datei wird gelesen …' });
    try {
      const j = JSON.parse(await file.text());
      if (!j || typeof j !== 'object' || !['Spur', 'hansport'].includes(j.app)) throw new Error('Das ist kein Export aus hansport.');
      const ops = [];
      for (const c of [...COLLS, 'streams']) {
        const m = j[c];
        if (!m || typeof m !== 'object') continue;
        for (const [id, data] of Object.entries(m)) if (data && typeof data === 'object') ops.push({ path: c + '/' + id, op: 'set', data });
      }
      if (!ops.length) throw new Error('Die Datei enthält keine Daten.');
      setState({ busy: true, text: ops.length + ' Dokumente werden übernommen …' });
      await bulkWrite(ops, (n, t) => setState({ busy: true, text: n + ' von ' + t + ' übernommen …' }));
      setState({ busy: false, text: ops.length + ' Dokumente aus dem Export vom ' + (j.exportedAt ? dt(Date.parse(j.exportedAt)) : '?') + ' übernommen.' });
      toast('Import abgeschlossen');
    } catch (e) { setState({ busy: false, text: 'Import fehlgeschlagen: ' + (e.message || e) }); }
  };
  return (
    <Section title="Datei-Import">
      <div class="card p stack" style="gap:8px">
        <div class="small">Übernimmt einen JSON-Export aus der Claude-Version von hansport (Mehr → Daten → Export). Gleiche Einträge werden ersetzt, alles andere bleibt. Die Datei geht nur an deinen eigenen Server.</div>
        <label class="btn" aria-disabled={state && state.busy ? 'true' : undefined}>Export-Datei wählen<input type="file" accept="application/json,.json" class="sr" disabled={state && state.busy} onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} /></label>
        {state ? <div class="small muted" role="status">{state.text}</div> : null}
        <div class="tiny faint">Exportdateien von Garmin oder Withings selbst werden noch nicht eingelesen.</div>
      </div>
    </Section>
  );
}

// Rückmeldung nach der Withings-Freigabe
export function webBoot() {
  athletedataOn().catch(() => {});
  // sobald die Daten geladen sind: Startwerte der Räder anlegen, eigene Berechnungen einmal nachziehen
  const off = subscribe(() => {
    const S = getState();
    if (S.status.db !== 'ok') return;
    off();
    setTimeout(() => {
      try { seedGear(); } catch (e) { console.warn(e); }
      try { if ((S.meta.health || {}).v !== 7 && Object.keys(S.health || {}).length) recomputeHealth(); } catch (e) { console.warn(e); }
    }, 300);
  });
  try {
    const q = new URLSearchParams(location.search);
    const w = q.get('withings');
    if (w) {
      setTimeout(() => toast(w === 'ok' ? 'Withings verbunden. Der nächste Abgleich holt die Messwerte.' : 'Withings-Verbindung fehlgeschlagen (' + w + ')', w === 'ok' ? 'info' : 'error'), 1200);
      history.replaceState(null, '', location.pathname + location.hash);
    }
  } catch (e) { /* egal */ }
}
