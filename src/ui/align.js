// Kacheln nebeneinander gleich ausrichten: In jeder Reihe eines Kachelrasters bekommen die Kopfzeilen
// dieselbe Höhe (wenn eine Beschriftung umbricht), damit Werte, Graphen und Fußzeilen auf einer Linie liegen.
let raf = 0;
const GRIDS = '.bento, .hp2 .h-grid';
const HEAD = ':scope > .hp-head, :scope > .t2-h';

function alignAll() {
  raf = 0;
  for (const grid of document.querySelectorAll(GRIDS)) {
    const tiles = [...grid.children].filter((el) => !el.classList.contains('w2') && el.offsetParent !== null);
    const heads = [];
    for (const t of tiles) {
      const h = t.querySelector(HEAD);
      if (!h) continue;
      h.style.minHeight = '';
      heads.push([t, h]);
    }
    const rows = new Map();
    for (const [t, h] of heads) {
      const k = Math.round(t.offsetTop);
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(h);
    }
    for (const hs of rows.values()) {
      if (hs.length < 2) continue;
      const hts = hs.map((h) => h.getBoundingClientRect().height);
      const m = Math.max(...hts);
      hs.forEach((h, i) => { if (hts[i] < m - 0.5) h.style.minHeight = m + 'px'; });
    }
  }
}

export function startAlign() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(alignAll); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  addEventListener('resize', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  schedule();
}
