// hansport Logo – Blende + Oxanium. Framework-neutral: liefert SVG-Strings.
// hansportSvg({ variant, size, color, title, animated })
//   variant: "lockup" (Standard) | "mark" | "wordmark" | "icon" (App-Icon „Silber“)
//   size:    Höhe in px
//   color:   Farbe von Zeichen und Schrift, Standard "currentColor" (folgt der Textfarbe)
//   animated: Striche zeichnen sich nacheinander ein (Ladebildschirm); respektiert „Bewegung reduzieren“

const LINES = ["rotate(0 32 32)", "rotate(72 32 32)", "rotate(144 32 32)", "rotate(216 32 32)", "rotate(288 32 32)"];
const WORD = "M77.8 0.0V-740.0H174.8V-522.2H361.4Q514.5 -522.2 514.5 -368.6V0.0H417.5V-378.6Q417.5 -437.5 358.6 -437.5H174.8V0.0ZM802.0 0.0Q647.8 0.0 647.8 -153.2Q647.8 -306.5 802.0 -306.5H971.5V-378.6Q971.5 -437.5 912.6 -437.5H699.3V-488.0L745.2 -522.2H915.4Q1068.5 -522.2 1068.5 -368.6V0.0ZM744.8 -143.7Q744.8 -84.8 803.7 -84.8H971.5V-229.8H803.7Q744.8 -229.8 744.8 -170.9ZM1229.8 0.0V-522.2H1513.4Q1666.5 -522.2 1666.5 -368.6V0.0H1569.5V-378.6Q1569.5 -437.5 1510.6 -437.5H1326.8V0.0ZM1807.9 -34.2V-84.8H2039.0Q2098.1 -84.8 2098.1 -145.2Q2098.1 -206.6 2050.4 -214.8L1934.6 -234.1Q1807.9 -255.5 1807.9 -373.9Q1807.9 -522.2 1962.1 -522.2H2124.9L2170.8 -488.0V-437.5H1963.6Q1904.0 -437.5 1904.0 -377.0Q1904.0 -320.5 1954.5 -312.2L2070.2 -292.9Q2194.8 -272.5 2194.8 -148.9Q2194.8 0.0 2040.0 0.0H1853.8ZM2339.8 200.0V-522.2H2623.4Q2776.5 -522.2 2776.5 -368.6V-153.7Q2776.5 0.0 2623.4 0.0H2436.8V200.0ZM2436.8 -84.8H2620.6Q2679.5 -84.8 2679.5 -143.7V-378.6Q2679.5 -437.5 2620.6 -437.5H2436.8ZM2925.8 -153.7V-368.6Q2925.8 -522.2 3079.4 -522.2H3219.4Q3372.5 -522.2 3372.5 -368.6V-153.7Q3372.5 0.0 3219.4 0.0H3079.4Q2925.8 0.0 2925.8 -153.7ZM3022.8 -143.7Q3022.8 -84.8 3081.7 -84.8H3216.6Q3275.5 -84.8 3275.5 -143.7V-378.6Q3275.5 -437.5 3216.6 -437.5H3081.7Q3022.8 -437.5 3022.8 -378.6ZM3525.8 0.0V-460.0Q3561.5 -522.2 3659.4 -522.2H3761.7L3807.6 -488.0V-437.5H3677.9Q3638.9 -437.5 3622.8 -417.3V0.0ZM3917.8 -153.7V-690.0H4014.8V-522.2H4199.6V-437.5H4014.8V-143.7Q4014.8 -84.8 4073.7 -84.8H4209.6V-34.2L4163.7 0.0H4071.4Q3917.8 0.0 3917.8 -153.7Z";
const WORD_TF = "translate(78.896 60.0) scale(0.081081)";
const MARK_TF = "scale(1.52284) translate(-12.6 -12.3)";
const MARK_SW = 5.561;
const LOCK_VB = "-6 -6 432.21 88.22";
const WORD_VB = "79.20 -6 347.01 88.22";
// App-Icon „Silber“ (Runde 6, Variante D): dunkle Kachel mit diagonalem Verlauf, feine helle Innenkante, Zeichen im Silberverlauf
export const iconCut = (px) => (px <= 20 ? [1, 9] : px <= 40 ? [0.94, 8] : px <= 56 ? [0.88, 7.5] : [0.78, 7]);
let iconN = 0;
// tile: "round" (Ecken 14,2), "square" (randlos, z. B. apple-touch-icon); edge: Innenkante 1 px; inner: Zeichen zusätzlich verkleinern (maskable)
// marks(color, strokeWidth) liefert die Striche; ab 21 px bekommen sie den Silberverlauf über eine Maske (ein Verlauf über das ganze Zeichen)
export function appIconInner({ px = 64, tile = "round", edge = true, inner = 1, uid, marks } = {}) {
  const id = uid || "hsi" + (++iconN);
  const [sc, sw] = iconCut(px);
  const k = (64 / px).toFixed(4);
  const tf = `translate(32 32) scale(${(sc * inner).toFixed(4)}) translate(-32 -32)`;
  const small = px <= 20;
  const defs = `<defs><linearGradient id="${id}t" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3C3C42"/><stop offset="1" stop-color="#0B0B0D"/></linearGradient>` +
    (small ? "" : `<linearGradient id="${id}s" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#8E8E96"/></linearGradient>` +
      `<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><g transform="${tf}">${marks("#FFFFFF", sw)}</g></mask>`) + `</defs>`;
  const bg = `<rect width="64" height="64"${tile === "round" ? ' rx="14.2"' : ""} fill="url(#${id}t)"/>`;
  const e = edge ? `<rect x="${(k / 2).toFixed(4)}" y="${(k / 2).toFixed(4)}" width="${(64 - k).toFixed(4)}" height="${(64 - k).toFixed(4)}" rx="${(14.2 - k / 2).toFixed(4)}" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="${k}"/>` : "";
  const mk = small ? `<g transform="${tf}">${marks("#E5E5EA", sw)}</g>` : `<rect width="64" height="64" fill="url(#${id}s)" mask="url(#${id}m)"/>`;
  return defs + bg + e + mk;
}

const ANIM = `<style>
@keyframes hs-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
.hs-a { stroke-dasharray: 1; stroke-dashoffset: 1; animation: hs-draw .5s cubic-bezier(.65,0,.35,1) forwards }
@media (prefers-reduced-motion: reduce) { .hs-a { animation: none; stroke-dashoffset: 0 } }
</style>`;

export function blende(color, sw, animated) {
  return LINES.map((t, i) =>
    `<path d="M22 15L43 19" transform="${t}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"` +
    (animated ? ` pathLength="1" class="hs-a" style="animation-delay:${(i * 0.09).toFixed(2)}s"` : "") + `/>`
  ).join("");
}

export function hansportSvg({ variant = "lockup", size = 28, color = "currentColor", title = "hansport", animated = false } = {}) {
  const a11y = `role="img" aria-label="${title}"`;
  const anim = animated ? ANIM : "";
  if (variant === "icon") {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" ${a11y}>${anim}${appIconInner({ px: size, marks: (c, sw) => blende(c, sw, animated) })}</svg>`;
  }
  if (variant === "mark") {
    return `<svg viewBox="8 8 48 48" width="${size}" height="${size}" ${a11y}>${anim}${blende(color, 6, animated)}</svg>`;
  }
  const vb = variant === "wordmark" ? WORD_VB : LOCK_VB;
  const [, , vw, vh] = vb.split(" ").map(Number);
  const width = (size * vw / vh).toFixed(1);
  const mark = variant === "wordmark" ? "" : `<g transform="${MARK_TF}">${blende(color, MARK_SW, animated)}</g>`;
  return `<svg viewBox="${vb}" width="${width}" height="${size}" ${a11y}>${anim}${mark}` +
    `<path transform="${WORD_TF}" d="${WORD}" fill="${color}"/></svg>`;
}
