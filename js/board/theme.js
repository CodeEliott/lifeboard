// Look of the board: turns a scheme into CSS variables on <html>, and loads fonts
// (Google Fonts by name, uploaded files through the FontFace API).
import { SCHEMES, FONTS } from './catalog.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
// t = share of b in the result.
export const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
function lum(hex) {
  const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const isDark = (hex) => lum(hex) < 0.2;
const INK = '#1D1A2B';
// Text on a plugin color: dark ink or white, whichever reads better.
export const onColor = (hex) => (contrast(hex, INK) >= contrast(hex, '#FFFFFF') ? INK : '#FFFFFF');

// Move `fg` towards `toward` until it reaches `target` contrast on `bg`.
function readable(fg, bg, toward, target = 4.5) {
  let c = fg;
  for (let t = 0.1; contrast(c, bg) < target && t <= 1; t += 0.1) c = mix(fg, toward, t);
  return c;
}

export function palette(theme, systemDark) {
  const s = SCHEMES[theme.scheme] || SCHEMES.console;
  let base;
  if (theme.scheme === 'console') base = theme.mode === 'dark' || (theme.mode === 'auto' && systemDark) ? s.dark : s.light;
  else if (theme.scheme === 'custom') {
    const { shell, panel, ink } = theme.custom;
    const dark = isDark(panel);
    base = { mode: dark ? 'dark' : 'light', shell, panel, ink, bezel: dark ? mix(shell, '#000000', 0.55) : mix(ink, shell, 0.3) };
    base.bezelInk = readable(dark ? mix(ink, shell, 0.2) : mix(shell, '#FFFFFF', 0.7), base.bezel, dark ? '#FFFFFF' : '#FFFFFF');
  } else base = s;
  const dark = base.mode === 'dark';
  return {
    mode: base.mode,
    shell: base.shell, panel: base.panel, ink: base.ink, bezel: base.bezel, bezelInk: base.bezelInk,
    panel2: base.panel2 || mix(base.panel, base.ink, dark ? 0.07 : 0.05),
    ink2: base.ink2 || readable(mix(base.ink, base.panel, 0.32), base.panel, base.ink),
    line: base.line || mix(base.panel, base.ink, dark ? 0.17 : 0.2),
    edge: base.edge || (dark ? mix(base.shell, '#000000', 0.55) : mix(base.shell, base.ink, 0.22)),
    outline: dark ? mix(base.shell, '#000000', 0.55) : base.ink,
    bad: dark ? '#FF9A90' : '#B3261E',
    ledOff: dark ? '#4A4560' : '#8A85A0',
  };
}

const VARS = { shell: '--shell', panel: '--panel', panel2: '--panel-2', ink: '--ink', ink2: '--ink-2', line: '--line', edge: '--edge', outline: '--outline', bezel: '--bezel', bezelInk: '--bezel-ink', bad: '--bad', ledOff: '--led-off' };
const FALLBACK = { heading: 'ui-sans-serif, system-ui, sans-serif', body: 'ui-sans-serif, system-ui, -apple-system, sans-serif', numbers: 'ui-monospace, monospace' };

// CSS font-family value for a font key. Keys are validated by sanitizeBoard, so they are safe in CSS.
export function family(key, role = 'body') {
  if (key?.startsWith('g:')) return `'${key.slice(2)}', ${FALLBACK[role]}`;
  if (key?.startsWith('u:')) return `'lb-${key.slice(2)}', ${FALLBACK[role]}`;
  return FALLBACK[role];
}

export function applyTheme(board, systemDark) {
  const p = palette(board.theme, systemDark);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(VARS)) root.style.setProperty(v, p[k]);
  root.style.setProperty('--font-head', family(board.theme.fonts.heading, 'heading'));
  root.style.setProperty('--font', family(board.theme.fonts.body, 'body'));
  root.style.setProperty('--pixel', family(board.theme.fonts.numbers, 'numbers'));
  root.style.colorScheme = p.mode;
  root.dataset.mode = p.mode;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = p.shell;
  for (const key of [...Object.values(board.theme.fonts), ...Object.values(board.floats).map((f) => f.font)]) loadGoogleFont(key);
  return p;
}

// ── Fonts ──
const linked = new Set(['Schibsted Grotesk', 'Pixelify Sans']); // already in index.html
export function loadGoogleFont(key) {
  if (!key?.startsWith('g:')) return;
  const name = key.slice(2);
  if (linked.has(name)) return;
  linked.add(name);
  const axes = FONTS.find((f) => f.name === name)?.axes || '';
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}${axes ? `:${axes}` : ''}&display=swap` });
  document.head.appendChild(link);
}

// One small request that draws every picker entry in its own font (only the letters of its name).
let previewsLoaded = false;
export function loadFontPreviews() {
  if (previewsLoaded) return;
  previewsLoaded = true;
  const text = [...new Set(FONTS.map((f) => f.name).join('').concat('Aa0123456789'))].join('');
  const families = FONTS.map((f) => `family=${f.name.replace(/ /g, '+')}`).join('&');
  document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${families}&text=${encodeURIComponent(text)}&display=swap` }));
}

const faces = new Set();
export async function loadUploadedFont(id, blob) {
  if (faces.has(id)) return;
  const face = new FontFace(`lb-${id}`, await blob.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  faces.add(id);
}
