// Startanimation „Blende öffnet sich“ (Runde 6). Nur beim Kaltstart, läuft parallel zum Laden.
// 0–550 ms Striche drehen sich aus −100° / 0,3 in ihre Lage (kritisch gedämpfte Feder), ab 450 ms öffnet sich
// „Heute“ als Kreis aus der Mitte, ab 550 ms wächst die Kachel auf 1,8× und blendet aus. Dauert das Laden länger,
// leuchten die Striche nacheinander auf. Tippen überspringt. „Bewegung reduzieren“: 0,4 s Überblenden.
import { appIconInner } from './hansport-logo.js';
import { setValue, springTo, stop, reducedMotion } from './spring.js';

const KEY = 'hs.seen';
const WARM = 10 * 60000;
const readSeen = () => { try { return +localStorage.getItem(KEY) || 0; } catch (e) { return 0; } };
const writeSeen = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* privat */ } };

// Zuletzt sichtbar: beim Verlassen und minütlich, solange die App offen ist
function trackSeen() {
  writeSeen();
  const f = () => writeSeen();
  document.addEventListener('visibilitychange', f);
  addEventListener('pagehide', f);
  setInterval(() => { if (document.visibilityState === 'visible') writeSeen(); }, 60000);
}

function iconSvg() {
  const marks = (c, sw) => [0, 72, 144, 216, 288].map((r) => `<g class="mk"><path d="M22 15L43 19" transform="rotate(${r} 32 32)" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/></g>`).join('');
  return `<svg viewBox="0 0 64 64" width="96" height="96" aria-hidden="true">${appIconInner({ px: 96, uid: 'hsi', marks })}</svg>`;
}

export function startIntro(ready) {
  const warm = Date.now() - readSeen() < WARM;
  trackSeen();
  if (warm) return;
  const html = document.documentElement;
  const shell = document.querySelector('.shell');
  const rm = reducedMotion();
  const root = document.createElement('div');
  root.className = 'intro' + (rm ? ' rm' : '');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="intro-fly">${iconSvg()}</div>`;
  document.body.appendChild(root);
  html.classList.add('intro-on');
  const fly = root.querySelector('.intro-fly');
  const mks = [...root.querySelectorAll('.mk')];
  const anims = [];
  const timers = [];
  let done = false, revealing = false, isReady = false, landed = false;

  const finish = () => {
    if (done) return;
    done = true;
    stop(root, 'p');
    timers.forEach(clearTimeout);
    anims.forEach((a) => { try { a.cancel(); } catch (e) { /* schon fertig */ } });
    if (shell) shell.style.clipPath = '';
    html.classList.remove('intro-on');
    root.remove();
  };
  const skip = () => {
    if (done) return;
    if (shell) shell.style.clipPath = '';
    html.classList.remove('intro-on');
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
    a.onfinish = finish;
  };
  root.addEventListener('pointerdown', skip);

  if (rm) {
    // Bewegung reduziert: Icon steht, nach dem Laden 0,4 s ausblenden
    const out = () => { if (done || revealing) return; revealing = true; const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease', fill: 'forwards' }); anims.push(a); a.onfinish = finish; };
    timers.push(setTimeout(() => { landed = true; if (isReady) out(); else root.classList.add('wait'); }, 250));
    Promise.resolve(ready).finally(() => { isReady = true; root.classList.remove('wait'); if (landed) out(); });
    return;
  }

  const t0 = performance.now();
  if (shell) shell.style.clipPath = 'circle(0px at 50% 50%)';
  const apply = (p) => {
    const k = Math.max(0, Math.min(1.02, p / 100));
    const tf = `rotate(${(-100 * (1 - k)).toFixed(2)}deg) scale(${(0.3 + 0.7 * k).toFixed(4)})`;
    const op = (0.2 + 0.8 * Math.min(1, k)).toFixed(3);
    for (const m of mks) { m.style.transform = tf; m.style.opacity = op; }
  };
  setValue(root, 'p', 0, apply);
  requestAnimationFrame(() => springTo(root, 'p', 100, { response: 0.35, apply, eps: 0.2 }));

  const reveal = () => {
    if (done || revealing) return;
    revealing = true;
    root.classList.remove('wait');
    if (shell) {
      const a = shell.animate([{ clipPath: 'circle(0px at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }], { duration: 550, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
      anims.push(a);
    }
    timers.push(setTimeout(() => {
      if (done) return;
      html.classList.add('intro-open');
      const a = fly.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 450, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      anims.push(a);
    }, 100));
    timers.push(setTimeout(() => { html.classList.remove('intro-open'); finish(); }, 560));
  };
  timers.push(setTimeout(() => { if (isReady) reveal(); }, 450));
  timers.push(setTimeout(() => { landed = true; if (!revealing && !done) root.classList.add('wait'); }, 550));
  Promise.resolve(ready).finally(() => {
    isReady = true;
    if (performance.now() - t0 >= 450) reveal();
  });
  // Sicherheitsnetz: nie länger als 15 s abdecken
  timers.push(setTimeout(skip, 15000));
}
