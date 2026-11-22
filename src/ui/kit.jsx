import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SPORTS, sportLabel, dsport, sportIcon, actIcon } from '../sports.js';
import { Ico, back } from './hp.jsx';
import { pop, closeSheet, setSheetCloser } from '../nav.js';
import { springTo, setValue, getValue, stop, project, rubberband, tracker, reducedMotion, haptic } from './spring.js';
import { pct } from '../format.js';

export const Icon = {
  chev: () => <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>,
  back: () => <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>,
  sync: () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5M5 3v4h4M19 21v-4h-4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>,
  dots: () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="18.5" cy="12" r="1.8" fill="currentColor" /></svg>,
  more: () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M5 20c1-3.6 3.8-5.4 7-5.4s6 1.8 7 5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>,
  close: () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>,
  search: () => <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>,
  info: () => <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10 9v5M10 6.2v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>,
  warn: () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.8L18 17H2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M10 8v4.2M10 14.6v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>,
  edit: () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" /></svg>,
  trash: () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>,
  tabOverview: () => <svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 19c3-1 4.5-6 7.5-6s3.5 3 6 3 4-6 6.5-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><path d="M3 23h20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".5" /></svg>,
  tabList: () => <svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="4" width="5" height="5" rx="1.5" fill="currentColor" /><rect x="3" y="11" width="5" height="5" rx="1.5" fill="currentColor" opacity=".7" /><rect x="3" y="18" width="5" height="5" rx="1.5" fill="currentColor" opacity=".45" /><path d="M11 6.5h12M11 13.5h12M11 20.5h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>,
  tabMap: () => <svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 6l6-2.5 8 3 6-2.5v16l-6 2.5-8-3L3 22z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="M6 17c3-1 4-6 7-6s2 5 7 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>,
  tabJournal: () => <svg viewBox="0 0 26 26" aria-hidden="true"><path d="M6 3.5h13a1.5 1.5 0 0 1 1.5 1.5v16.5a1.5 1.5 0 0 1-1.5 1.5H6z" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M6 3.5v19M10 9h7M10 13h7M10 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>,
  logo: () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 18c4-.5 5-7 9-7s3.5 4.5 6 4.5S20.5 10 22 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /><path d="M2 22c4-.4 5.5-4.5 9-4.5s4 2.4 6 2.4 3.4-2.3 5-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".5" /></svg>,
  apple: () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5c-3.2 0-5.8 2.6-5.8 5.8 0 4.3 5.8 9.2 5.8 9.2s5.8-4.9 5.8-9.2c0-3.2-2.6-5.8-5.8-5.8z" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="10" cy="8.3" r="2.1" fill="currentColor" /></svg>,
};

// Sportart als Iconoir-Icon in neutraler runder Kachel (keine eigene Farbe je Sportart)
export function Mark({ sport, sm, a }) {
  const sp = a ? dsport(a) : SPORTS[sport] ? sport : 'other';
  const label = a && a.sub ? a.sub : (SPORTS[sp] || SPORTS.other).label;
  return <span class={'mark2' + (sm ? ' sm' : '')} role="img" aria-label={label} title={label}><Ico n={a ? actIcon(a) : sportIcon(sp)} /></span>;
}

export function Delta({ cur, prev, rel, higherBetter = true, neutral = false, fmt }) {
  let r = rel;
  if (r == null) { if (!prev) return <span class="delta">{cur ? 'neu' : '±0'}</span>; r = (cur - prev) / prev; }
  if (!isFinite(r)) return <span class="delta">–</span>;
  const dir = r > 0.02 ? 'up' : r < -0.02 ? 'down' : '';
  const good = dir && (dir === 'up') === higherBetter;
  const cls = neutral ? (dir ? 'neutral-' + dir : '') : dir ? (good ? 'up' : 'down') : '';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
  return <span class={'delta ' + cls}><span aria-hidden="true">{arrow}</span>{fmt ? fmt(r) : pct(r)}</span>;
}

export function Stat({ v, u, l, est, children }) {
  return <div class="stat"><div class="v">{v}{u ? <small>{u}</small> : null}{est ? <span class="est" title="geschätzt">gesch.</span> : null}</div><div class="l">{l}</div>{children}</div>;
}

export const Est = ({ kind = 'est', text }) => <span class={'est' + (kind === 'man' ? ' man' : kind === 'ex' ? ' ex' : '')}>{text || (kind === 'man' ? 'manuell' : kind === 'ex' ? 'Beispiel' : 'geschätzt')}</span>;

export function Seg({ value, options, onChange, label }) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button type="button" aria-pressed={String(value === v)} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Chips({ value, options, onChange, label }) {
  return (
    <div class="chips" role="group" aria-label={label}>
      {options.map(([v, l, color, icon]) => (
        <button type="button" class="chip" aria-pressed={String(value === v)} onClick={() => onChange(v)}>
          {icon ? <Ico n={icon} cls="chip-ic" /> : color ? <span class="dot" style={{ background: color }} /> : null}{l}
        </button>
      ))}
    </div>
  );
}

export const sportColor = (s) => 'var(--s-' + (SPORTS[s] ? s : 'other') + ')';

export function Top({ title, back: showBack = true, actions, large, sub, onBack }) {
  const ref = useRef();
  // Glas erst, wenn Inhalt darunter scrollt (wie iOS); oben bleibt die Kopfzeile durchsichtig
  useEffect(() => {
    const el = ref.current, v = el && el.closest('.view');
    if (!v) return;
    let on = null;
    const f = () => { const x = v.scrollTop > 4; if (x !== on) { on = x; el.classList.toggle('scrolled', x); } };
    f(); v.addEventListener('scroll', f, { passive: true });
    return () => v.removeEventListener('scroll', f);
  }, []);
  return (
    <Fragment>
      <div class="top" ref={ref}>
        <div class="topbar">
          {showBack ? <button type="button" class="back" onClick={onBack || back}><Icon.back />Zurück</button> : <span style={{ width: 8 }} />}
          <div class="title">{large ? '' : title}</div>
          {actions || <span style={{ width: showBack ? 72 : 8 }} />}
        </div>
      </div>
      {large ? <div class="large"><h1>{title}</h1></div> : null}
      {sub ? <div class="subhead">{sub}</div> : null}
    </Fragment>
  );
}

export function Section({ title, action, onAction, children }) {
  return (
    <Fragment>
      <div class="sec"><h2>{title}</h2>{action ? <button type="button" class="link" onClick={onAction}>{action}</button> : null}</div>
      {children}
    </Fragment>
  );
}

export function Cell({ onClick, left, title, sub, right, chev = true, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} class="cell" onClick={onClick}>
      {left}
      <div class="main"><div class="t1">{title}</div>{sub ? <div class="t2">{sub}</div> : null}{children}</div>
      {right != null ? <div class="val">{right}</div> : null}
      {onClick && chev ? <Icon.chev /> : null}
    </Tag>
  );
}

export function Note({ kind, children }) {
  return <div class={'note' + (kind ? ' ' + kind : '')} role={kind === 'bad' ? 'alert' : undefined}>{kind ? <Icon.warn /> : <Icon.info />}<div>{children}</div></div>;
}

export function Sheet({ title, children, onClose = closeSheet }) {
  const ref = useRef(), scrim = useRef(), body = useRef();
  const H = () => (ref.current ? ref.current.offsetHeight || 600 : 600);
  const apply = (y) => {
    const el = ref.current; if (!el) return;
    el.style.transform = `translate3d(0,${y}px,0)`;
    if (scrim.current) scrim.current.style.opacity = String(Math.max(0, Math.min(1, 1 - y / H())));
  };
  const closing = useRef(false);
  const finish = () => { setSheetCloser(null); onClose(); };
  // Schließen immer auf demselben Weg nach unten, dann aus dem Zustand entfernen
  const dismiss = (velocity = 0) => {
    if (closing.current) return; closing.current = true;
    const el = ref.current; if (!el) { finish(); return; }
    if (reducedMotion()) { el.style.transition = 'opacity 160ms ease'; el.style.opacity = '0'; if (scrim.current) { scrim.current.style.transition = 'opacity 160ms ease'; scrim.current.style.opacity = '0'; } setTimeout(finish, 170); return; }
    springTo(el, 'y', H() + 24, { response: 0.32, damping: 1, velocity, apply, onDone: finish, eps: 2 });
  };
  useEffect(() => {
    const el = ref.current;
    setSheetCloser(() => dismiss());
    // Öffnen: von unten, kritisch gedämpft; jederzeit greifbar
    if (reducedMotion()) { el.style.transform = 'none'; el.style.opacity = '0'; requestAnimationFrame(() => { el.style.transition = 'opacity 180ms ease'; el.style.opacity = '1'; if (scrim.current) { scrim.current.style.transition = 'opacity 180ms ease'; scrim.current.style.opacity = '1'; } }); }
    else { setValue(el, 'y', H(), apply); springTo(el, 'y', 0, { response: 0.36, damping: 1, apply }); }
    const prev = document.activeElement;
    const f = el && el.querySelector('input,button,select,textarea');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 80);
    const key = (e) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', key);
    return () => { setSheetCloser(null); window.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus({ preventScroll: true }); };
  }, []);

  // Ziehen: folgt dem Finger 1:1 ab der Greifstelle, nach oben Gummiband, beim Loslassen
  // Schwung übernehmen und auf das projizierte Ziel federn (schließen oder zurück).
  const drag = useRef(null);
  const begin = (clientY) => {
    const el = ref.current; stop(el, 'y');
    drag.current = { y0: clientY, base: getValue(el, 'y'), tr: tracker(), armed: false };
    drag.current.tr.add(drag.current.base);
  };
  const move = (clientY) => {
    const d = drag.current; if (!d) return;
    const raw = d.base + (clientY - d.y0);
    const y = raw >= 0 ? raw : rubberband(raw, H());
    d.tr.add(y);
    setValue(ref.current, 'y', y, apply);
    const willClose = y > H() * 0.35;
    if (willClose !== d.armed) { d.armed = willClose; if (willClose) haptic(); }
  };
  const end = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    const el = ref.current, y = getValue(el, 'y'), v = d.tr.v();
    if (y + project(v) > H() * 0.45 || v > 1100) dismiss(v);
    else springTo(el, 'y', 0, { response: 0.32, damping: Math.abs(v) > 300 ? 0.8 : 1, velocity: v, apply });
  };
  const pDown = (e) => { if (e.button > 0) return; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); begin(e.clientY); };
  const pMove = (e) => { if (drag.current) move(e.clientY); };
  // Inhalt: ganz oben nach unten ziehen bewegt das Blatt statt zu scrollen
  const tStart = (e) => { const b = body.current; if (!b || b.scrollTop > 0) return; body.t0 = e.touches[0].clientY; body.dragging = false; };
  const tMove = (e) => {
    const b = body.current; if (body.t0 == null) return;
    const dy = e.touches[0].clientY - body.t0;
    if (!body.dragging) { if (dy > 6 && b.scrollTop <= 0) { body.dragging = true; begin(e.touches[0].clientY); } else if (dy < -2) { body.t0 = null; return; } }
    if (body.dragging) { e.preventDefault(); move(e.touches[0].clientY); }
  };
  const tEnd = () => { if (body.dragging) end(); body.t0 = null; body.dragging = false; };
  useEffect(() => {
    const b = body.current; if (!b) return;
    b.addEventListener('touchstart', tStart, { passive: true });
    b.addEventListener('touchmove', tMove, { passive: false });
    b.addEventListener('touchend', tEnd); b.addEventListener('touchcancel', tEnd);
    return () => { b.removeEventListener('touchstart', tStart); b.removeEventListener('touchmove', tMove); b.removeEventListener('touchend', tEnd); b.removeEventListener('touchcancel', tEnd); };
  }, []);
  const handle = { onPointerDown: pDown, onPointerMove: pMove, onPointerUp: end, onPointerCancel: end };
  return (
    <div class="scrim-wrap">
      <div class="scrim" ref={scrim} style="opacity:0" onClick={() => dismiss()} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} style="transform:translate3d(0,100%,0)">
        <div class="grab-area" {...handle}><div class="grab" aria-hidden="true" /></div>
        <div class="sh-head" {...handle}><h2>{title}</h2><button type="button" class="iconbtn" aria-label="Schließen" onPointerDown={(e) => e.stopPropagation()} onClick={() => dismiss()}><Icon.close /></button></div>
        <div class="sh-body" ref={body}>{children}</div>
      </div>
    </div>
  );
}

export function Stepper({ id, value, onChange, step = 1, min = 0, max = 9999, unit, label, decimals = 0 }) {
  const fmt = (v) => (v == null || v === '' ? '' : String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace('.', ','));
  const [txt, setTxt] = useState(fmt(value));
  const typing = useRef(false);
  useEffect(() => { if (typing.current) { typing.current = false; return; } setTxt(fmt(value)); }, [value]);
  const set = (v) => { const x = Math.max(min, Math.min(max, Math.round(v * 1000) / 1000)); onChange(x); };
  const typed = (t) => {
    setTxt(t);
    const v = parseFloat(String(t).replace(',', '.'));
    if (!isNaN(v)) { const x = Math.max(min, Math.min(max, v)); if (x !== value) { typing.current = true; onChange(x); } }
    else if (t === '' && value != null) { typing.current = true; onChange(null); }
  };
  return (
    <div class="field">
      {label ? <label for={id}>{label}</label> : null}
      <div class="stepper">
        <button type="button" aria-label={(label || '') + ' verringern'} onClick={() => set((value || 0) - step)}>−</button>
        <input id={id} inputMode={decimals ? 'decimal' : 'numeric'} value={txt} aria-label={label}
          onInput={(e) => typed(e.target.value)}
          onBlur={() => setTxt(fmt(value))} />
        {unit ? <span class="u">{unit}</span> : null}
        <button type="button" aria-label={(label || '') + ' erhöhen'} onClick={() => set((value || 0) + step)}>+</button>
      </div>
    </div>
  );
}

export function Scale({ value, onChange, from = 1, to = 10, label, labels }) {
  const vals = [];
  for (let i = from; i <= to; i++) vals.push(i);
  return (
    <div class="field">
      {label ? <label>{label}</label> : null}
      <div class="scale" role="group" aria-label={label}>
        {vals.map((v) => <button type="button" aria-pressed={String(value === v)} aria-label={labels ? labels[v - from] : String(v)} onClick={() => onChange(value === v ? null : v)}>{v}</button>)}
      </div>
      {labels && value != null ? <div class="tiny muted">{labels[value - from]}</div> : null}
    </div>
  );
}

export function Progress({ value, expected }) {
  return <div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((value || 0) * 100)}><i style={{ width: Math.min(100, Math.round((value || 0) * 100)) + '%' }} /></div>;
}

export function useAsync(fn, deps) {
  const [st, setSt] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let alive = true;
    setSt((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve().then(fn).then((data) => alive && setSt({ loading: false, data, error: null })).catch((error) => alive && setSt({ loading: false, data: null, error }));
    return () => { alive = false; };
  }, deps);
  return st;
}

export const sportName = sportLabel;
