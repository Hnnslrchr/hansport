// Nur in der Web-Version: Verbindungen (Garmin, Withings, Coach), Import aus der Claude-Version, Abmelden.
import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Section } from '../ui/kit.jsx';
import { toast, COLLS } from '../store.js';
import { api } from './api.js';
import { bulkWrite } from './db.js';

const dt = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function Row({ name, state, ok, children }) {
  return (
    <div class="stack" style="gap:6px;padding:10px 0;border-bottom:0.5px solid var(--line)">
      <div class="row" style="justify-content:space-between;gap:8px"><b>{name}</b><span class="small" style={{ color: ok ? 'var(--good, inherit)' : 'var(--ink-2)' }}>{state}</span></div>
      {children}
    </div>
  );
}

export function WebConnections() {
  const [s, setS] = useState(null);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/api/status').then(setS).catch((e) => setS({ error: e.message }));
  useEffect(() => { load(); }, []);
  const check = async () => { setBusy(true); try { const r = await api('/api/status?test=garmin'); setTest(r.garmin); } catch (e) { setTest({ ok: false, error: e.message }); } setBusy(false); };
  const unlink = async () => { try { await api('/api/withings?a=disconnect', { method: 'POST' }); toast('Withings getrennt'); load(); } catch (e) { toast(e.message, 'error'); } };
  const g = s && s.garmin, w = s && s.withings, c = s && s.coach;
  return (
    <Section title="Verbindungen">
      <div class="card p" style="padding-top:2px;padding-bottom:6px">
        {!s ? <div class="small muted" style="padding:10px 0">Lädt …</div> : s.error ? <div class="small" style="padding:10px 0">{s.error}</div> : (
          <Fragment>
            <Row name="Garmin" ok={g.configured && (!test || test.ok)} state={!g.configured ? 'nicht eingerichtet' : test ? (test.ok ? 'verbunden' : 'Fehler') : 'eingerichtet'}>
              {!g.configured ? <div class="tiny faint">Trag deinen Garmin-API-Schlüssel in Vercel als GARMIN_API_KEY ein (Projekt → Settings → Environment Variables) und stelle neu bereit.</div> : null}
              {test && !test.ok ? <div class="tiny" style="color:var(--bad)">{test.error}</div> : null}
              {g.configured ? <button type="button" class="btn sec2" disabled={busy} onClick={check}>{busy ? 'Prüfe …' : 'Verbindung prüfen'}</button> : null}
            </Row>
            <Row name="Withings" ok={w.connected} state={!w.configured ? 'nicht eingerichtet' : w.connected ? 'verbunden' : 'nicht verbunden'}>
              {!w.configured ? <div class="tiny faint">Für die Waage brauchst du eine eigene Withings-Entwickler-App. Client-ID und Secret kommen als WITHINGS_CLIENT_ID und WITHINGS_CLIENT_SECRET in Vercel.</div> : null}
              {w.configured && !w.connected ? <a class="btn" href="/api/withings?a=start">Mit Withings verbinden</a> : null}
              {w.connected ? <Fragment><div class="tiny faint">Verbunden seit {dt(w.since)}. Gelesen werden nur Messwerte (Gewicht, Körperzusammensetzung, Blutdruck).</div><button type="button" class="btn sec2" onClick={unlink}>Withings trennen</button></Fragment> : null}
            </Row>
            <Row name="Coach (Claude-API)" ok={c.configured} state={c.configured ? 'eingerichtet' : 'nicht eingerichtet'}>
              <div class="tiny faint">{c.configured ? 'Modell ' + c.model + '. Fragen an den Coach senden die nötigen Werte an die Claude-API (Anthropic); Anthropic nutzt API-Daten nicht zum Training.' : 'Trag deinen Claude-API-Schlüssel in Vercel als ANTHROPIC_API_KEY ein.'}</div>
            </Row>
            <div style="padding:10px 0 4px"><a class="btn sec2 wide" href="/api/logout">Abmelden</a></div>
          </Fragment>
        )}
      </div>
    </Section>
  );
}

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
    <Section title="Import">
      <div class="card p stack" style="gap:8px">
        <div class="small">Übernimmt einen JSON-Export aus der Claude-Version (Mehr → Daten → Export). Gleiche Einträge werden ersetzt, alles andere bleibt. Die Datei wird nur an deinen eigenen Server geschickt.</div>
        <label class="btn" aria-disabled={state && state.busy ? 'true' : undefined}>Export-Datei wählen<input type="file" accept="application/json,.json" class="sr" disabled={state && state.busy} onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} /></label>
        {state ? <div class="small muted" role="status">{state.text}</div> : null}
      </div>
    </Section>
  );
}

// Rückmeldung nach der Withings-Freigabe
export function webBoot() {
  try {
    const q = new URLSearchParams(location.search);
    const w = q.get('withings');
    if (w) {
      setTimeout(() => toast(w === 'ok' ? 'Withings verbunden. Der nächste Abgleich holt die Messwerte.' : 'Withings-Verbindung fehlgeschlagen (' + w + ')', w === 'ok' ? 'info' : 'error'), 1200);
      history.replaceState(null, '', location.pathname + location.hash);
    }
  } catch (e) { /* egal */ }
}
