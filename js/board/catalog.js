// Everything the board lets you pick from: color schemes, fonts, stickers, frames, text styles.

// A scheme gives the base colors; theme.js derives the rest (lines, muted text, shadows).
// Console keeps hand-tuned values for both modes and follows the system when mode is "auto".
export const SCHEMES = {
  console: {
    name: 'Console', auto: true,
    light: { mode: 'light', shell: '#E4E2EB', panel: '#F6F5FA', ink: '#1D1A2B', bezel: '#4E4963', bezelInk: '#EDEBF4', panel2: '#ECEAF2', ink2: '#565170', line: '#CAC6D5', edge: '#B5AFC6' },
    dark: { mode: 'dark', shell: '#1B1828', panel: '#262236', ink: '#EEECF6', bezel: '#0F0D18', bezelInk: '#C9C4DC', panel2: '#2F2A42', ink2: '#ABA6C2', line: '#3D3754', edge: '#0E0C16' },
  },
  sky: { name: 'Sky', mode: 'light', shell: '#DCE8F5', panel: '#F7FBFF', ink: '#12233A', bezel: '#3E5F86', bezelInk: '#E8F1FC' },
  sakura: { name: 'Sakura', mode: 'light', shell: '#F3E1E8', panel: '#FFF7FA', ink: '#3B1F2C', bezel: '#8A4A66', bezelInk: '#FFE9F1' },
  matcha: { name: 'Matcha', mode: 'light', shell: '#DDE7D6', panel: '#F6FAF2', ink: '#1E2A1B', bezel: '#4D6744', bezelInk: '#EAF3E4' },
  paper: { name: 'Paper', mode: 'light', shell: '#EAE3D2', panel: '#FBF8F0', ink: '#2A251D', bezel: '#6B5E48', bezelInk: '#F5EFE2' },
  mono: { name: 'Mono', mode: 'light', shell: '#E6E6E6', panel: '#FFFFFF', ink: '#111111', bezel: '#2B2B2B', bezelInk: '#F2F2F2' },
  midnight: { name: 'Midnight', mode: 'dark', shell: '#0D1530', panel: '#172150', ink: '#E9EDFF', bezel: '#060A1C', bezelInk: '#B9C3EE' },
  sunset: { name: 'Sunset', mode: 'dark', shell: '#26122B', panel: '#381C3F', ink: '#FFEDE3', bezel: '#12060F', bezelInk: '#F2C9D6' },
  forest: { name: 'Forest', mode: 'dark', shell: '#0F1C17', panel: '#1A2C25', ink: '#E6F2EA', bezel: '#07100C', bezelInk: '#B9D4C4' },
  oled: { name: 'Black', mode: 'dark', shell: '#000000', panel: '#141414', ink: '#F2F2F2', bezel: '#1F1F1F', bezelInk: '#CFCFCF' },
  custom: { name: 'Custom' },
};

// Google Fonts offered in the picker. `axes` is the css2 weight spec ('' = the regular weight only).
export const FONTS = [
  { name: 'Schibsted Grotesk', cat: 'Sans', axes: 'wght@400;500;700;800' },
  { name: 'Archivo', cat: 'Sans', axes: 'wght@400;700;900' },
  { name: 'Bricolage Grotesque', cat: 'Sans', axes: 'wght@400;700;800' },
  { name: 'Space Grotesk', cat: 'Sans', axes: 'wght@400;700' },
  { name: 'Inter', cat: 'Sans', axes: 'wght@400;700' },
  { name: 'Unbounded', cat: 'Sans', axes: 'wght@400;700;900' },
  { name: 'Fraunces', cat: 'Serif', axes: 'wght@400;700;900' },
  { name: 'Playfair Display', cat: 'Serif', axes: 'wght@400;700;900' },
  { name: 'Instrument Serif', cat: 'Serif', axes: '' },
  { name: 'DM Serif Display', cat: 'Serif', axes: '' },
  { name: 'Caveat', cat: 'Handwritten', axes: 'wght@400;700' },
  { name: 'Permanent Marker', cat: 'Handwritten', axes: '' },
  { name: 'Shadows Into Light', cat: 'Handwritten', axes: '' },
  { name: 'Pixelify Sans', cat: 'Pixel', axes: 'wght@400;500;700' },
  { name: 'Silkscreen', cat: 'Pixel', axes: 'wght@400;700' },
  { name: 'Press Start 2P', cat: 'Pixel', axes: '' },
  { name: 'VT323', cat: 'Pixel', axes: '' },
  { name: 'Bebas Neue', cat: 'Display', axes: '' },
  { name: 'Anton', cat: 'Display', axes: '' },
  { name: 'Rubik Mono One', cat: 'Display', axes: '' },
  { name: 'Space Mono', cat: 'Mono', axes: 'wght@400;700' },
  { name: 'JetBrains Mono', cat: 'Mono', axes: 'wght@400;700' },
];
export const FONT_CATS = ['Sans', 'Serif', 'Handwritten', 'Pixel', 'Display', 'Mono'];

// The three places a font is used across the board.
export const FONT_ROLES = [
  { id: 'heading', label: 'Headings', sample: 'Afternoon, Eliott' },
  { id: 'body', label: 'Text', sample: 'Workouts this week' },
  { id: 'numbers', label: 'Numbers', sample: '7h21  71.8 kg' },
];

export const EMOJI = ['💪', '🔥', '⭐', '🏆', '👑', '💎', '🚀', '✨', '🎯', '📈', '💯', '🫡', '😎', '🧠', '📚', '🎧',
  '🎮', '🎾', '⚽', '🏋️', '🧘', '💤', '🌙', '☀️', '💧', '🥩', '🥦', '🍳', '🍌', '🧴', '⏰', '🌊', '🌴', '🗻', '🌸', '🍀', '❤️', '🖤'];

// Pixel stickers: O outline, R red, Y yellow, B blue, W white.
const PX = { O: '#1D1A2B', R: '#FF5263', Y: '#FFC83D', B: '#6EA6FF', W: '#FFFFFF' };
export const PIXEL_STICKERS = {
  heart: ['.OO.OO.', 'ORROWRO', 'ORRRRRO', '.ORRRO.', '..ORO..', '...O...'],
  star: ['....O....', '...OYO...', '...OYO...', 'OOOOYOOOO', 'OYYYYYYYO', '.OYYYYYO.', '..OYYYO..', '.OYYOYYO.', '.OO...OO.'],
  crown: ['O...O...O', 'OO.OYO.OO', 'OYOYYYOYO', 'OYYYRYYYO', 'OYYYYYYYO', 'OOOOOOOOO'],
  gem: ['...O...', '..OBO..', '.OBWBO.', 'OBBBBBO', '.OBBBO.', '..OBO..', '...O...'],
  flame: ['...O...', '..ORO..', '.ORRO..', '.ORRRO.', 'ORRYRRO', 'ORYYYRO', 'ORYYYRO', '.ORYRO.', '..OOO..'],
};
export function pixelSVG(rows) {
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (!PX[ch]) { x++; continue; }
      const start = x;
      while (x < row.length && row[x] === ch) x++;
      rects.push(`<rect x="${start}" y="${y}" width="${x - start}" height="1" fill="${PX[ch]}"/>`);
    }
  });
  const w = Math.max(...rows.map((r) => r.length));
  return `<svg viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
}

export const FRAMES = [
  { id: 'none', label: 'None' }, { id: 'rounded', label: 'Rounded' }, { id: 'polaroid', label: 'Polaroid' },
  { id: 'tape', label: 'Tape' }, { id: 'sticker', label: 'Sticker' }, { id: 'circle', label: 'Circle' },
];
export const TEXT_STYLES = [
  { id: 'plain', label: 'Plain' }, { id: 'note', label: 'Sticky note' }, { id: 'label', label: 'Label' },
  { id: 'card', label: 'Card' }, { id: 'tape', label: 'Taped' },
];
export const PATTERNS = [
  { id: 'dots', label: 'Dots' }, { id: 'grid', label: 'Grid' }, { id: 'checks', label: 'Checks' }, { id: 'lines', label: 'Lines' },
];
