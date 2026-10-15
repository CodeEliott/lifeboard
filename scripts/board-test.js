// Board engine checks: grid packing, the board document cleaner, and color readability.
// Run with `npm test` (after the plugin tests).
import { GRIDS, compact, collides, firstFit, clampItem, rowsFor, metrics, toPx } from '../js/board/layout.js';
import { defaultBoard, sanitizeBoard, addFloat, removeFloat, addWidget, removeWidget, usedAssets, resetLayout, KEYS } from '../js/board/model.js';
import { SCHEMES } from '../js/board/catalog.js';
import { palette, contrast, onColor } from '../js/board/theme.js';
import { PLUGINS } from '../js/plugins/index.js';

let failed = 0; let passed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; return; }
  failed++; console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
}
const noOverlap = (items) => items.every((a) => items.every((b) => !collides(a, b)));

// ── Layout ──
{
  const items = [
    { id: 'a', x: 0, y: 5, w: 6, h: 4 },
    { id: 'b', x: 0, y: 0, w: 12, h: 3 },
    { id: 'c', x: 3, y: 20, w: 6, h: 2 },
  ];
  const out = compact(items, 12);
  check('compact: no overlaps', noOverlap(out));
  check('compact: items rise (gravity)', out.find((i) => i.id === 'a').y === 3 && out.find((i) => i.id === 'c').y === 7, JSON.stringify(out));
  check('compact: keeps caller order', out.map((i) => i.id).join() === 'a,b,c');

  // Dragging b down onto a: a makes room, b stays where it was dropped.
  const dragged = compact([{ id: 'a', x: 0, y: 0, w: 6, h: 4 }, { id: 'b', x: 0, y: 2, w: 6, h: 3 }], 12, 'b');
  check('compact: the dragged item keeps its spot', dragged.find((i) => i.id === 'b').y === 2);
  check('compact: others are pushed below it', dragged.find((i) => i.id === 'a').y === 5 && noOverlap(dragged), JSON.stringify(dragged));

  const clamped = clampItem({ id: 'x', x: 11, y: -3, w: 20, h: 0 }, 12);
  check('clampItem keeps items inside the grid', clamped.x === 0 && clamped.w === 12 && clamped.y === 0 && clamped.h === 2, JSON.stringify(clamped));

  const spot = firstFit([{ id: 'a', x: 0, y: 0, w: 8, h: 4 }], 12, 4, 3);
  check('firstFit uses the free space beside', spot.x === 8 && spot.y === 0, JSON.stringify(spot));
  check('firstFit goes below when nothing fits', firstFit([{ id: 'a', x: 0, y: 0, w: 12, h: 4 }], 12, 4, 3).y === 4);

  const m = metrics(1000, 'wide');
  const px = toPx({ x: 1, y: 1, w: 2, h: 3 }, m);
  check('toPx: width spans columns minus one gap', Math.abs(px.width - (2 * m.colW + m.gap)) <= 1, JSON.stringify(px));
  check('rowsFor fits content', rowsFor(px.height, m) === 3);
}

// ── Default board ──
{
  const b = defaultBoard();
  for (const key of KEYS) {
    const items = Object.entries(b.layouts[key].items).map(([id, it]) => ({ id, ...it }));
    check(`default ${key}: every widget placed`, Object.keys(b.widgets).every((id) => b.layouts[key].items[id]));
    check(`default ${key}: inside the grid`, items.every((it) => it.x + it.w <= GRIDS[key].cols));
    check(`default ${key}: no overlaps after packing`, noOverlap(compact(items, GRIDS[key].cols)));
  }
  const off = defaultBoard({ off: ['sleep'], order: ['alab', 'replog', 'sleep'] });
  check('default: switched-off plugins stay off', !off.widgets['p-sleep'] && off.widgets['p-alab']);
  check('default: v1 order is kept', off.layouts.narrow.items['p-alab'].y < off.layouts.narrow.items['p-replog'].y);
}

// ── Sanitizer: board data comes back from storage and the cloud ──
{
  const good = defaultBoard();
  good.assets = { 'img-0001': { kind: 'image', ext: 'jpg', w: 800, h: 600, up: true }, 'font-001': { kind: 'font', ext: 'woff2', name: 'My Font' } };
  addFloat(good, { type: 'photo', asset: 'img-0001', frame: 'tape' }, 'wide', { x: 1, y: 2, w: 3 });
  const tid = addFloat(good, { type: 'text', text: 'Hi', font: 'u:font-001', size: 40, color: '#FF0000', style: 'note' }, 'wide', { x: 2, y: 2, w: 2 });
  addFloat(good, { type: 'sticker', pixel: 'heart' }, 'narrow', { x: 1, y: 1, w: 1 });
  good.theme.fonts.heading = 'g:Fraunces';
  good.theme.colors.replog = '#123456';
  good.wallpaper = { kind: 'photo', asset: 'img-0001', dim: 0.5 };
  const back = sanitizeBoard(JSON.parse(JSON.stringify(good)));
  const t = back.floats[tid];
  check('sanitize keeps a valid board', Object.keys(back.floats).length === 3 && t.font === 'u:font-001' && t.color === '#FF0000' && t.style === 'note' && t.size === 40
    && Object.values(back.floats).some((f) => f.frame === 'tape') && Object.values(back.floats).some((f) => f.pixel === 'heart'), JSON.stringify(back.floats));
  check('sanitize is stable (cleaning twice changes nothing)', JSON.stringify(sanitizeBoard(JSON.parse(JSON.stringify(back)))) === JSON.stringify(back));
  check('sanitize keeps fonts, colors, wallpaper', back.theme.fonts.heading === 'g:Fraunces' && back.theme.colors.replog === '#123456' && back.wallpaper.kind === 'photo');
  check('sanitize keeps the uploaded flag', back.assets['img-0001'].up === true && back.assets['font-001'].up === false);
  check('every float has a spot in every layout', KEYS.every((k) => Object.keys(back.floats).every((id) => back.layouts[k].floats[id])));

  const evil = JSON.parse(JSON.stringify(good));
  evil.theme.fonts.body = "g:Arial'; background:url(x)";
  evil.theme.colors.replog = 'red; display:none';
  evil.theme.colors.ghost = '#FFFFFF';
  evil.theme.custom.ink = 'expression(alert(1))';
  evil.floats[tid].color = 'url(javascript:alert(1))';
  evil.floats[tid].font = 'g:Bad<Font>';
  evil.floats.zzz = { type: 'script', src: 'x' };
  evil.floats['ok-photo'] = { type: 'photo', asset: 'missing-file' };
  evil.floats['emo-01'] = { type: 'sticker', emoji: '<img onerror=x>' };
  evil.widgets.zzz = { type: 'iframe' };
  evil.widgets['p-none'] = { type: 'plugin', plugin: 'not-a-plugin' };
  evil.assets['bad-ext'] = { kind: 'image', ext: 'svg' };
  evil.assets['font-as-img'] = { kind: 'image', ext: 'woff2' };
  evil.theme.scheme = '__proto__';
  evil.floats['proto-st'] = { type: 'sticker', pixel: 'constructor' };
  evil.assets['proto-as'] = { kind: 'image', ext: 'constructor' };
  evil.wallpaper = { kind: 'video', asset: 'img-0001' };
  const clean = sanitizeBoard(evil);
  check('sanitize: bad font names fall back', clean.theme.fonts.body === 'g:Schibsted Grotesk' && clean.floats[tid].font === '');
  check('sanitize: bad colors are dropped', !clean.theme.colors.replog && !clean.theme.colors.ghost && clean.theme.custom.ink === '#1D1A2B' && clean.floats[tid].color === 'ink');
  check('sanitize: unknown floats and widgets are dropped', !clean.floats.zzz && !clean.floats['ok-photo'] && !clean.floats['emo-01'] && !clean.widgets.zzz && !clean.widgets['p-none']);
  check('sanitize: only known file types', !clean.assets['bad-ext'] && !clean.assets['font-as-img'] && !clean.assets['proto-as']);
  check('sanitize: built-in object names are not stickers', !clean.floats['proto-st']);
  check('sanitize: unknown scheme and wallpaper fall back', clean.theme.scheme === 'console' && clean.wallpaper.kind === 'none');
  check('sanitize: garbage in, default board out', Object.keys(sanitizeBoard('nope').widgets).length === Object.keys(defaultBoard().widgets).length);
  check('sanitize: numbers are clamped', sanitizeBoard({ ...good, floats: { [tid]: { ...good.floats[tid], size: 9999, rot: 720 } } }).floats[tid]?.size === 160);

  // A text float with a deleted font keeps working on the default font.
  const noFont = JSON.parse(JSON.stringify(good));
  delete noFont.assets['font-001'];
  check('sanitize: a missing uploaded font falls back', sanitizeBoard(noFont).floats[tid].font === '');
}

// ── Editing helpers ──
{
  const b = defaultBoard();
  removeWidget(b, 'p-sleep');
  check('removeWidget clears every layout', !b.widgets['p-sleep'] && KEYS.every((k) => !b.layouts[k].items['p-sleep']));
  addWidget(b, 'p-sleep', { type: 'plugin', plugin: 'sleep' });
  check('addWidget places it in every layout', KEYS.every((k) => b.layouts[k].items['p-sleep']));
  const id = addFloat(b, { type: 'sticker', emoji: '🔥' }, 'wide', { x: 6, y: 3, w: 1 });
  check('addFloat: exact spot on this screen', b.layouts.wide.floats[id].x === 6 && b.layouts.wide.floats[id].y === 3);
  check('addFloat: waits below the widgets on the other screen', b.layouts.narrow.floats[id].y === null);
  check('sanitize keeps a waiting float waiting', sanitizeBoard(JSON.parse(JSON.stringify(b))).layouts.narrow.floats[id].y === null);
  removeFloat(b, id);
  check('removeFloat clears every layout', !b.floats[id] && KEYS.every((k) => !b.layouts[k].floats[id]));
  b.assets = { 'img-a01': { kind: 'image', ext: 'png' }, 'img-b02': { kind: 'image', ext: 'png' }, 'fnt-c03': { kind: 'font', ext: 'ttf' } };
  addFloat(b, { type: 'photo', asset: 'img-a01' }, 'wide', { x: 0, y: 0, w: 2 });
  const used = usedAssets(b);
  check('usedAssets: photos and fonts are kept, orphans are not', used.has('img-a01') && used.has('fnt-c03') && !used.has('img-b02'));
  b.layouts.wide.items.hello = { x: 9, y: 40, w: 2, h: 3, auto: false };
  resetLayout(b, 'wide');
  check('resetLayout puts widgets back', b.layouts.wide.items.hello.x === 0 && b.layouts.wide.items.hello.y === 0);
}

// ── Readable colors in every scheme ──
for (const [key, s] of Object.entries(SCHEMES)) {
  if (key === 'custom') continue;
  for (const dark of [false, true]) {
    const p = palette({ scheme: key, mode: 'auto', custom: {} }, dark);
    check(`${s.name} ${p.mode}: text on cards`, contrast(p.ink, p.panel) >= 7, contrast(p.ink, p.panel).toFixed(2));
    check(`${s.name} ${p.mode}: muted text on cards`, contrast(p.ink2, p.panel) >= 4.5, contrast(p.ink2, p.panel).toFixed(2));
    check(`${s.name} ${p.mode}: text on the page`, contrast(p.ink, p.shell) >= 4.5, contrast(p.ink, p.shell).toFixed(2));
    check(`${s.name} ${p.mode}: bezel text`, contrast(p.bezelInk, p.bezel) >= 4.5, contrast(p.bezelInk, p.bezel).toFixed(2));
  }
}
{
  const p = palette({ scheme: 'custom', mode: 'auto', custom: { shell: '#202020', panel: '#2A2A2A', ink: '#909090' } }, false);
  check('custom: muted text is pushed to readable', contrast(p.ink2, p.panel) >= 4.5 || contrast(p.ink, p.panel) < 4.5);
  check('custom: dark cards make a dark theme', p.mode === 'dark');
}
for (const p of PLUGINS) check(`${p.name}: label text readable on its color`, contrast(onColor(p.color), p.color) >= 4.5);
for (const c of ['#FFC83D', '#6EA6FF', '#101010', '#FF5263', '#2B68D6']) check(`onColor picks readable text on ${c}`, contrast(onColor(c), c) >= 4.5);

console.log(`board: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
