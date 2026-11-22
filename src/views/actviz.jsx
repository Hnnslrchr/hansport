// Aktivität: Splits als Balken und Leistungskurve dieser Fahrt (aus den Strava-Zeitreihen).
import { h, Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { TimeChart, Bars, RefLine, Line, Points, Headline, Legend, Table, useWidth } from '../ui/viz.jsx';
import { GRADE_CLASSES, GRADE_COLORS, gradeClass } from '../grade.js';
import { niceTicks } from '../viz-data.js';
import { num } from '../format.js';

const mmss = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

export function splitsOf(st) {
  const { d, t } = st;
  if (!d || !t || d.length < 3) return null;
  const tot = d[d.length - 1];
  if (!tot || tot < 1500) return null;
  const L = tot <= 15000 ? 1000 : tot <= 60000 ? 5000 : 10000;
  const out = [];
  let i0 = 0;
  for (let k = 1; i0 < d.length - 1; k++) {
    let i1 = i0;
    while (i1 < d.length - 1 && d[i1] < k * L) i1++;
    const len = d[i1] - d[i0];
    if (len < L * 0.3 && out.length) break;
    let mov = 0, gain = 0, hs = 0, hn = 0, ws = 0, wn = 0;
    for (let i = i0 + 1; i <= i1; i++) {
      const dt = t[i] - t[i - 1], dd = d[i] - d[i - 1];
      if (dt > 0 && dd / dt > 0.5) mov += dt;
      if (st.alt && st.alt[i] != null && st.alt[i - 1] != null && st.alt[i] > st.alt[i - 1]) gain += st.alt[i] - st.alt[i - 1];
      if (st.hr && st.hr[i]) { hs += st.hr[i]; hn++; }
      if (st.w && st.w[i] != null) { ws += st.w[i]; wn++; }
    }
    out.push({ t: k, k, from: d[i0], to: d[i1], len, mov, v: mov ? (len / mov) * 3.6 : null, gain, hr: hn ? hs / hn : null, w: wn ? ws / wn : null, i0, i1 });
    i0 = i1;
    if (d[i1] >= tot) break;
  }
  return { L, rows: out };
}

export function SplitsBlock({ streams, onCursor }) {
  const sp = useMemo(() => splitsOf(streams), [streams]);
  const [sel, setSel] = useState(null);
  if (!sp || sp.rows.length < 2) return null;
  const rows = sp.rows.filter((r) => r.v != null);
  const km = sp.L / 1000;
  const y = niceTicks(0, Math.max(...rows.map((r) => r.v)), 4, true);
  const avg = rows.reduce((a, r) => a + r.len, 0) / rows.reduce((a, r) => a + r.mov, 0) * 3.6;
  const fast = rows.reduce((a, r) => (r.v > a.v ? r : a), rows[0]);
  const x = { min: 0.5, max: rows.length + 0.5, ticks: rows.map((r) => ({ t: r.k, label: String(Math.round(r.to / 1000)) })) };
  const pick = (r) => { setSel(r); if (r && onCursor) onCursor(r.i1); };
  return (
    <div class="g-akt">
      <Headline label={sel ? `Split ${sel.k} · km ${num(sel.from / 1000, 0)}–${num(sel.to / 1000, 1)}` : `Splits je ${km} km · Ø Tempo in Bewegung`} value={sel ? sel.v : avg} unit="km/h" fmt={(v) => num(v, 1)}
        sub={sel ? `Zeit in Bewegung ${mmss(sel.mov)} · +${num(sel.gain, 0)} Hm${sel.hr ? ' · Ø ' + num(sel.hr, 0) + ' bpm' : ''}${sel.w ? ' · Ø ' + num(sel.w, 0) + ' W' : ''}` : `Schnellster Split: ${fast.k} (${num(fast.v, 1)} km/h)`} />
      <div class="t2" style="padding:8px 10px 6px">
        <TimeChart height={170} x={x} y={y} unit="km/h" label={'Splits je ' + km + ' km'} snap={rows} sel={sel} onSel={pick}
          layers={(s) => [<Bars s={s} data={rows.map((r) => ({ t: r.t, v: r.v, hl: sel ? sel.k === r.k : r === fast }))} n={rows.length} color="var(--c)" />, <RefLine s={s} v={avg} label={'Ø ' + num(avg, 1)} side="right" />]} />
      </div>
      <Legend items={[{ kind: 'bx', color: 'var(--c)', label: sel ? 'Auswahl' : 'schnellster Split' }, { kind: 'bx', color: 'var(--neutral)', label: 'Split (Ende bei km)' }, { color: 'var(--ink-2)', label: 'Ø gesamt' }]} />
      <Table head={['Split', 'km', 'Zeit', 'km/h', 'Hm', 'bpm']} rows={rows.map((r) => [r.k, num(r.to / 1000, 1), mmss(r.mov), num(r.v, 1), '+' + num(r.gain, 0), r.hr ? num(r.hr, 0) : '–'])} />
    </div>
  );
}

// Leistungskurve aus den Bestwerten voller Auflösung (res: [{d: Sekunden, w: Watt}])
const durLab = (d) => (d < 60 ? d + ' s' : d < 3600 ? d / 60 + ' min' : d / 3600 + ' h');
export function PowerCurveBlock({ res, ftp }) {
  const [sel, setSel] = useState(null);
  if (!res || res.length < 2) return null;
  const rows = res.slice().sort((a, b) => a.d - b.d).map((r, i) => ({ D: r.d, lab: durLab(r.d), v: r.w, t: i + 1 }));
  const y = niceTicks(0, Math.max(...rows.map((r) => r.v), ftp || 0), 4, true);
  const x = { min: 0.6, max: rows.length + 0.4, ticks: rows.map((r) => ({ t: r.t, label: r.lab.replace(' ', '') })) };
  const r20 = rows.find((r) => r.D === 1200);
  return (
    <div class="g-trn">
      <Headline label={sel ? 'Beste ' + sel.lab : r20 ? 'Beste 20 min' : 'Beste ' + rows[rows.length - 1].lab} value={sel ? sel.v : (r20 || rows[rows.length - 1]).v} unit="W" fmt={(v) => num(v, 0)}
        sub={(sel && ftp ? Math.round((sel.v / ftp) * 100) + ' % der FTP · ' : '') + 'beste Ø-Leistung dieser Fahrt, volle Auflösung'} />
      <div class="t2" style="padding:8px 10px 6px">
        <TimeChart height={170} x={x} y={y} unit="W" label="Leistungskurve dieser Fahrt" snap={rows} sel={sel} onSel={setSel} marks={(q) => [{ v: q.v, color: 'var(--c)' }]}
          layers={(s) => [ftp ? <RefLine s={s} v={ftp} label={'FTP ' + ftp} kind="goal" side="right" /> : null, <Line s={s} data={rows} color="var(--c)" width={2} />, <Points s={s} data={rows} color="var(--c)" />]} />
      </div>
      <Legend items={[{ color: 'var(--c)', label: 'beste Ø-Leistung je Dauer' }].concat(ftp ? [{ kind: 'ds', label: 'FTP (Strava-Zonen)' }] : [])} />
      <p class="say2">Je länger die Dauer, desto niedriger die haltbare Leistung. {r20 ? `Deine besten 20 Minuten dieser Fahrt: ${r20.v} W${ftp ? ` (${Math.round((r20.v / ftp) * 100)} % der FTP)` : ''}.` : ''}</p>
      <Table head={['Dauer', 'Watt']} rows={rows.map((r) => [r.lab, r.v])} />
    </div>
  );
}

// ---------- Höhenprofil nach Steigungsklassen, mit Anstiegen ----------

const nearestIdx = (arr, x) => { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] == null || arr[m] < x) lo = m; else hi = m; } return Math.abs((arr[hi] || 0) - x) < Math.abs((arr[lo] || 0) - x) ? hi : lo; };
const kmf = (m) => num(m / 1000, m < 10000 ? 1 : 1);

export function GradeProfile({ model, streams, sections, secColor, cursor, onCursor, climb, height = 176, label }) {
  const [ref, W] = useWidth();
  const [own, setOwn] = useState(null);
  if (!model) return null;
  const L = 40, B = 26, T = 18, R = 4;
  const D0 = model.d0, D1 = model.dist(model.n - 1);
  let a0 = Math.min(...model.as), a1 = Math.max(...model.as);
  const yt = niceTicks(a0 - (a1 - a0) * 0.06, a1 + (a1 - a0) * 0.12, 3, true);
  const X = (d) => L + ((d - D0) / (D1 - D0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - yt.min) / (yt.max - yt.min)) * (height - T - B);
  const base = height - B;
  const cl = climb != null ? model.climbs[climb] : null;
  // Position: aus der gemeinsamen Cursor-Position (Index der Zeitreihe) oder eigener Auswahl
  const curD = cursor != null && streams && streams.d && streams.d[cursor] != null ? streams.d[cursor] : own;
  const kAt = (d) => Math.max(0, Math.min(model.n - 1, Math.round((d - D0) / model.step)));
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = D0 + (((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * (D1 - D0);
    const dd = Math.max(D0, Math.min(D1, d));
    if (streams && streams.d && onCursor) onCursor(nearestIdx(streams.d, dd)); else setOwn(dd);
  };
  const line = model.as.map((v, k) => (k ? 'L' : 'M') + X(model.dist(k)).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
  const dkm = (D1 - D0) / 1000, step = dkm > 60 ? 20 : dkm > 25 ? 10 : dkm > 10 ? 5 : dkm > 4 ? 2 : 1;
  const xt = []; for (let k = Math.ceil(D0 / 1000 / step) * step; k <= D1 / 1000; k += step) xt.push(k);
  const st = model.steep;
  let read = null;
  if (curD != null) { const k = kAt(curD); read = { x: X(model.dist(k)), y: Y(model.as[k]), txt: `km ${kmf(model.dist(k))} · ${num(model.as[k], 0)} m · ${num(model.gradeAt(k), 1)} %` }; }
  return (
    <div ref={ref}>
      <svg class="chart viz" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label || 'Höhenprofil nach Steigung'} style="touch-action: pan-y"
        onPointerDown={move} onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && move(e)}>
        <text class="un" x="0" y="10">Höhe · m</text>
        {yt.ticks.map((v) => <g><line class="gl" x1={L} x2={W} y1={Math.round(Y(v)) + 0.5} y2={Math.round(Y(v)) + 0.5} /><text class="tk" x={L - 5} y={Y(v) + 3.5} text-anchor="end">{num(v, 0)}</text></g>)}
        {xt.map((k) => <text class="tk" x={X(k * 1000)} y={height - 3} text-anchor="middle">{k}</text>)}
        <text class="un" x={W - 2} y={height - 3} text-anchor="end">km</text>
        {model.segs.map((s) => {
          const inCl = !cl || (s.d0 >= cl.d0 - 1 && s.d1 <= cl.d1 + 1);
          return <path d={`M${X(s.d0)},${base}L${X(s.d0)},${Y(model.as[s.k0])}L${X(s.d1)},${Y(model.as[s.k1])}L${X(s.d1)},${base}Z`} fill={GRADE_COLORS[gradeClass(s.g)]} opacity={inCl ? 1 : 0.28} />;
        })}
        <path d={line} fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" />
        {cl ? <rect x={X(cl.d0)} y={T - 4} width={Math.max(2, X(cl.d1) - X(cl.d0))} height={base - T + 4} fill="none" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 3" rx="3" /> : null}
        {st && st.g >= 3 ? (
          <g>
            <path d={`M${X((st.d0 + st.d1) / 2) - 5},${Y(Math.max(model.as[st.k0], model.as[st.k1])) - 12}h10l-5,7z`} fill="var(--ink)" />
            <text class="mm" x={Math.min(W - 30, Math.max(L + 30, X((st.d0 + st.d1) / 2)))} y={Y(Math.max(model.as[st.k0], model.as[st.k1])) - 15} text-anchor="middle">max {num(st.g, 1)} %</text>
          </g>
        ) : null}
        {(sections || []).filter((s) => !s.point && streams && streams.d).map((s) => <rect x={X(streams.d[s.i0])} y={base + 3} width={Math.max(1, X(streams.d[s.i1]) - X(streams.d[s.i0]))} height="5" fill={secColor(s.type)} />)}
        {read ? (
          <g>
            <line x1={read.x} x2={read.x} y1={T} y2={base} stroke="var(--ink)" stroke-width="1" opacity=".6" />
            <circle cx={read.x} cy={read.y} r="4" fill="var(--ink)" stroke="var(--tile)" stroke-width="2" />
            <text x={Math.min(W - 95, Math.max(L + 95, read.x))} y={T - 6} text-anchor="middle" style="fill:var(--ink);font-weight:600;font-size:var(--fs-cap2)">{read.txt}</text>
          </g>
        ) : null}
      </svg>
      <div class="lg2" style="margin-top:4px">{GRADE_CLASSES.map((c, i) => <span><i class="bx" style={`background:${GRADE_COLORS[i]}`} />{c.label}</span>)}</div>
    </div>
  );
}

const hmin = (s) => { if (s == null) return '–'; const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ' h' : m + ' min'; };
export function GradeSection({ a, model, full, onFull, busy, climb, setClimb, onJump }) {
  if (!model) return null;
  const up = model.up, dn = model.down, st = model.steep;
  return (
    <div class="g-akt">
      {a.indoor ? <div class="sub2" style="margin:0 2px 8px">Virtuelles Profil (Zwift): Steigungen der Spielstrecke, nicht im Gelände gemessen.</div> : null}
      <div class="st2" style="grid-template-columns:repeat(3,1fr);margin-top:0">
        <div><span class="lbl2">Ø bergauf</span><b>{up.avg != null ? num(up.avg, 1) + ' %' : '–'}</b><span class="sub2">{num(up.d / 1000, 1)} km · +{num(up.h, 0)} Hm</span></div>
        <div><span class="lbl2">Ø bergab</span><b>{dn.avg != null ? '−' + num(Math.abs(dn.avg), 1) + ' %' : '–'}</b><span class="sub2">{num(dn.d / 1000, 1)} km · −{num(dn.h, 0)} Hm</span></div>
        <div><span class="lbl2">Steilste Stelle</span><b>{st ? num(st.g, 1) + ' %' : '–'}</b><span class="sub2">{st ? 'bei km ' + num(st.d0 / 1000, 1) : ''}</span></div>
      </div>
      <div class="lbl2" style="margin:16px 2px 6px">Anstiege ({model.climbs.length}) · ab 30 Hm und Ø 3 %</div>
      {model.climbs.length ? (
        <div class="t2" style="padding:4px 6px;overflow-x:auto">
          <div class="tbl2 climbs"><table>
            <thead><tr><th>km</th><th>Länge</th><th>Hm</th><th>Ø</th><th>max</th><th>Zeit</th><th>VAM</th></tr></thead>
            <tbody>{model.climbs.map((c, i) => (
              <tr class="click" style={climb === i ? 'background:var(--tile-2)' : ''} onClick={() => { setClimb(climb === i ? null : i); if (onJump) onJump(c.d0); }}>
                <td>{num(c.d0 / 1000, 1)}</td><td>{num(c.len / 1000, 1)} km</td><td>+{num(c.gain, 0)}</td><td>{num(c.avg, 1)} %</td><td>{num(c.max, 1)} %</td><td>{hmin(c.time)}</td><td>{c.vam ? num(c.vam, 0) : '–'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ) : <div class="empty2">Keine Anstiege ab 30 Hm und 3 % auf dieser Strecke.</div>}
      <p class="say2" style="font-size:var(--fs-cap);color:var(--ink-2)">
        Steigung über 100 m gemittelt, Höhe geglättet; Werte aus dem Profil, daher leicht anders als die Strava-Höhenmeter. VAM = Höhenmeter pro Stunde. Datengrundlage: {full ? 'volle Auflösung' : `Zeitreihe mit ${num(model.spacing, 0)} m Punktabstand`}.
        {!full && model.spacing > 30 ? <Fragment> <button type="button" class="btn2 q" style="margin-top:8px" disabled={busy} onClick={onFull}>{busy ? 'Lade …' : 'Volle Auflösung laden'}</button></Fragment> : null}
      </p>
    </div>
  );
}
