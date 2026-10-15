// The board document: which widgets sit on the grid, what floats on top, the look, and the
// files it uses. Stored in localStorage and synced to `lifeboard_data` (sync.js).
// Everything read back goes through sanitizeBoard(), because it comes from storage or the cloud
// and some values (font names, colors) end up inside CSS.
//
// board = {
//   v, updatedAt, known: [pluginId],
//   widgets: { id: { type: 'hello'|'week'|'plugin', plugin? } },
//   floats:  { id: { type: 'photo'|'text'|'sticker', rot, layer: 'front'|'back', ...fields } },
//   layouts: { wide|narrow: { items: { widgetId: { x, y, w, h, auto } }, floats: { floatId: { x, y, w } } } },
//            (a float's y is null until it is placed on that screen: it then waits below the widgets)
//   theme:   { scheme, mode, custom: { shell, panel, ink }, fonts: { heading, body, numbers }, colors: { pluginId: hex } },
//   wallpaper: { kind: 'none'|'pattern'|'photo', pattern, asset, dim },
//   assets:  { id: { kind: 'image'|'font', ext, mime, w?, h?, name?, up } },  up = in cloud Storage
// }
import { PLUGINS } from '../plugins/index.js';
import { GRIDS, firstFit, clampItem } from './layout.js';
import { SCHEMES, FRAMES, TEXT_STYLES, PATTERNS, EMOJI, PIXEL_STICKERS } from './catalog.js';

export const KEYS = ['wide', 'narrow'];
export const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9-]{3,40}$/;
const FAMILY = /^[A-Za-z0-9 ]{1,40}$/;
const EXTS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

export const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).toLowerCase().slice(0, 18);
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
// Lookups by a stored name must only hit real entries: plain `obj[name]` also finds
// '__proto__' or 'constructor' on every object.
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);

// Font keys: 'g:Family Name' (Google Fonts) or 'u:assetId' (an uploaded file).
export function fontKeyOk(key, assets = {}) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('g:')) return FAMILY.test(key.slice(2));
  if (key.startsWith('u:')) return own(assets, key.slice(2)) && assets[key.slice(2)].kind === 'font';
  return false;
}

export const DEFAULT_FONTS = { heading: 'g:Schibsted Grotesk', body: 'g:Schibsted Grotesk', numbers: 'g:Pixelify Sans' };

// Starting sizes. `auto` widgets grow or shrink to fit their content until you resize them.
const START = {
  wide: { hello: { x: 0, y: 0, w: 5, h: 10 }, week: { x: 5, y: 0, w: 7, h: 18 }, plugin: { w: 4, h: 28 } },
  narrow: { hello: { x: 0, y: 0, w: 4, h: 12 }, week: { x: 0, y: 12, w: 4, h: 22 }, plugin: { w: 4, h: 28 } },
};

export function defaultBoard({ off = [], order = PLUGINS.map((p) => p.id), mode = 'auto' } = {}) {
  const ids = [...new Set([...order, ...PLUGINS.map((p) => p.id)])].filter((id) => PLUGINS.some((p) => p.id === id));
  const on = ids.filter((id) => !off.includes(id));
  const widgets = { hello: { type: 'hello' }, week: { type: 'week' } };
  for (const id of on) widgets[`p-${id}`] = { type: 'plugin', plugin: id };
  const layouts = {};
  for (const key of KEYS) {
    const s = START[key];
    const items = { hello: { ...s.hello, auto: true }, week: { ...s.week, auto: true } };
    on.forEach((id, i) => {
      const cols = GRIDS[key].cols;
      const perRow = Math.max(1, Math.floor(cols / s.plugin.w));
      items[`p-${id}`] = { x: (i % perRow) * s.plugin.w, y: 40 + Math.floor(i / perRow) * s.plugin.h + i, w: s.plugin.w, h: s.plugin.h, auto: true };
    });
    layouts[key] = { items, floats: {} };
  }
  return {
    v: 1, updatedAt: 0, known: PLUGINS.map((p) => p.id), widgets, floats: {}, layouts, assets: {},
    theme: { scheme: 'console', mode: oneOf(mode, ['auto', 'light', 'dark'], 'auto'), custom: { shell: '#E4E2EB', panel: '#F6F5FA', ink: '#1D1A2B' }, fonts: { ...DEFAULT_FONTS }, colors: {} },
    wallpaper: { kind: 'none', pattern: 'dots', asset: null, dim: 0.35 },
  };
}

export function sanitizeBoard(raw) {
  const r = obj(raw);
  const b = defaultBoard();
  b.updatedAt = num(r.updatedAt, 0, 8.64e15, 0);
  if (Array.isArray(r.known)) b.known = r.known.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 50);

  // Files first: fonts and photos are checked against them.
  b.assets = {};
  for (const [id, a0] of Object.entries(obj(r.assets))) {
    const a = obj(a0);
    if (!ID.test(id) || !own(EXTS, a.ext) || !['image', 'font'].includes(a.kind)) continue;
    if ((a.kind === 'font') !== /^(woff2?|ttf|otf)$/.test(a.ext)) continue;
    b.assets[id] = { kind: a.kind, ext: a.ext, mime: EXTS[a.ext], w: num(a.w, 1, 20000, 1), h: num(a.h, 1, 20000, 1), name: str(a.name, 60), up: a.up === true };
  }

  if (r.widgets) {
    b.widgets = {};
    for (const [id, w0] of Object.entries(obj(r.widgets))) {
      const w = obj(w0);
      if (!ID.test(id)) continue;
      if (w.type === 'hello' || w.type === 'week') b.widgets[id] = { type: w.type };
      else if (w.type === 'plugin' && PLUGINS.some((p) => p.id === w.plugin)) b.widgets[id] = { type: 'plugin', plugin: w.plugin };
    }
  }

  b.floats = {};
  for (const [id, f0] of Object.entries(obj(r.floats))) {
    const f = obj(f0);
    if (!ID.test(id)) continue;
    const base = { type: f.type, rot: num(f.rot, -45, 45, 0), layer: oneOf(f.layer, ['front', 'back'], 'front') };
    if (f.type === 'photo' && own(b.assets, f.asset) && b.assets[f.asset].kind === 'image') {
      b.floats[id] = { ...base, asset: f.asset, frame: oneOf(f.frame, FRAMES.map((x) => x.id), 'polaroid'), caption: str(f.caption, 80) };
    } else if (f.type === 'text') {
      b.floats[id] = {
        ...base, text: str(f.text, 600), font: fontKeyOk(f.font, b.assets) ? f.font : '',
        size: num(f.size, 10, 160, 28), color: HEX.test(f.color) || ['ink', 'ink2'].includes(f.color) ? f.color : 'ink',
        style: oneOf(f.style, TEXT_STYLES.map((x) => x.id), 'plain'), align: oneOf(f.align, ['left', 'center', 'right'], 'left'),
      };
    } else if (f.type === 'sticker' && (EMOJI.includes(f.emoji) || own(PIXEL_STICKERS, f.pixel))) {
      b.floats[id] = { ...base, ...(EMOJI.includes(f.emoji) ? { emoji: f.emoji } : { pixel: f.pixel }) };
    }
  }

  const layouts = obj(r.layouts);
  for (const key of KEYS) {
    const L = obj(layouts[key]);
    const cols = GRIDS[key].cols;
    if (L.items) {
      const items = {};
      for (const [id, it] of Object.entries(obj(L.items))) if (b.widgets[id]) items[id] = { ...clampItem(obj(it), cols), auto: obj(it).auto !== false };
      b.layouts[key].items = items;
    }
    for (const id of Object.keys(b.layouts[key].items)) if (!b.widgets[id]) delete b.layouts[key].items[id];
    const floats = {};
    for (const [id, p0] of Object.entries(obj(L.floats))) {
      const p = obj(p0);
      if (b.floats[id]) floats[id] = { x: num(p.x, -2, cols + 2, 0), y: p.y === null ? null : num(p.y, -2, 4000, 0), w: num(p.w, 0.3, cols * 1.5, 3) };
    }
    b.layouts[key].floats = floats;
    // Every widget and float has a spot in every layout.
    for (const id of Object.keys(b.widgets)) if (!b.layouts[key].items[id]) placeWidget(b, key, id);
    for (const id of Object.keys(b.floats)) if (!b.layouts[key].floats[id]) b.layouts[key].floats[id] = { x: 0, y: null, w: Math.min(3, cols - 1) };
  }

  const t = obj(r.theme);
  const custom = obj(t.custom);
  b.theme = {
    scheme: own(SCHEMES, t.scheme) ? t.scheme : 'console',
    mode: oneOf(t.mode, ['auto', 'light', 'dark'], 'auto'),
    custom: { shell: HEX.test(custom.shell) ? custom.shell : b.theme.custom.shell, panel: HEX.test(custom.panel) ? custom.panel : b.theme.custom.panel, ink: HEX.test(custom.ink) ? custom.ink : b.theme.custom.ink },
    fonts: Object.fromEntries(Object.keys(DEFAULT_FONTS).map((role) => [role, fontKeyOk(obj(t.fonts)[role], b.assets) ? t.fonts[role] : DEFAULT_FONTS[role]])),
    colors: Object.fromEntries(Object.entries(obj(t.colors)).filter(([id, c]) => PLUGINS.some((p) => p.id === id) && HEX.test(c))),
  };

  const wp = obj(r.wallpaper);
  b.wallpaper = {
    kind: oneOf(wp.kind, ['none', 'pattern', 'photo'], 'none'),
    pattern: oneOf(wp.pattern, PATTERNS.map((p) => p.id), 'dots'),
    asset: own(b.assets, wp.asset) && b.assets[wp.asset].kind === 'image' ? wp.asset : null,
    dim: num(wp.dim, 0, 0.85, 0.35),
  };
  if (b.wallpaper.kind === 'photo' && !b.wallpaper.asset) b.wallpaper.kind = 'none';
  return b;
}

// A plugin added in a later version shows up on existing boards, once.
export function addNewPlugins(b) {
  let changed = false;
  for (const p of PLUGINS) {
    if (b.known.includes(p.id)) continue;
    b.known.push(p.id);
    addWidget(b, `p-${p.id}`, { type: 'plugin', plugin: p.id });
    changed = true;
  }
  return changed;
}

function placeWidget(b, key, id) {
  const cols = GRIDS[key].cols;
  const w = b.widgets[id];
  const s = START[key][w.type === 'plugin' ? 'plugin' : w.type];
  const items = Object.entries(b.layouts[key].items).map(([iid, it]) => ({ id: iid, ...it }));
  b.layouts[key].items[id] = { ...firstFit(items, cols, s.w, s.h), auto: true };
}

export function addWidget(b, id, spec) {
  b.widgets[id] = spec;
  for (const key of KEYS) placeWidget(b, key, id);
}
export function removeWidget(b, id) {
  delete b.widgets[id];
  for (const key of KEYS) delete b.layouts[key].items[id];
}

// New floats land where you are looking on this screen. On the other screen they wait below the
// widgets (y: null) until you place them there, so they never cover data you did not arrange.
export function addFloat(b, spec, key, pos) {
  const id = newId();
  b.floats[id] = { rot: 0, layer: 'front', ...spec };
  for (const k of KEYS) {
    const scale = GRIDS[k].cols / GRIDS[key].cols;
    b.layouts[k].floats[id] = k === key ? { ...pos } : { x: 0, y: null, w: Math.min(GRIDS[k].cols - 0.5, Math.max(1, pos.w * scale * (k === 'narrow' ? 1.6 : 0.7))) };
  }
  return id;
}
export function removeFloat(b, id) {
  delete b.floats[id];
  for (const key of KEYS) delete b.layouts[key].floats[id];
}

// Files still used by something on the board (the rest can be deleted).
export function usedAssets(b) {
  const used = new Set();
  for (const f of Object.values(b.floats)) if (f.asset) used.add(f.asset);
  if (b.wallpaper.asset) used.add(b.wallpaper.asset);
  for (const k of Object.values(b.theme.fonts)) if (k.startsWith('u:')) used.add(k.slice(2));
  for (const f of Object.values(b.floats)) if (f.font?.startsWith('u:')) used.add(f.font.slice(2));
  // Uploaded fonts stay in your font list even when nothing uses them right now.
  for (const [id, a] of Object.entries(b.assets)) if (a.kind === 'font') used.add(id);
  return used;
}

export { EXTS };

export function resetLook(b) {
  b.theme = { ...defaultBoard().theme, mode: b.theme.mode };
}

// Put this screen's widgets back in the starting arrangement (floats stay where they are).
export function resetLayout(b, key) {
  const d = defaultBoard({ order: Object.values(b.widgets).filter((w) => w.type === 'plugin').map((w) => w.plugin) });
  b.layouts[key].items = {};
  for (const id of Object.keys(b.widgets)) {
    if (d.layouts[key].items[id]) b.layouts[key].items[id] = { ...d.layouts[key].items[id] };
  }
  for (const id of Object.keys(b.widgets)) if (!b.layouts[key].items[id]) placeWidget(b, key, id);
}
