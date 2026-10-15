// Edit mode. Widgets snap to the grid (drag to move, corner to resize, everything else makes room);
// photos, text and stickers float freely (move, resize, rotate). Plus the Add, Look, font,
// wallpaper and per-item menus, and Undo. On touch screens only the grip handle drags, so the
// page still scrolls; with a mouse the whole item drags.
import { app, esc, openSheet, closeSheet, toast, ICONS, sheetEl } from '../ui.js';
import { PLUGINS, UPCOMING } from '../plugins/index.js';
import { compact, toPx, snap, snapSize, clampItem } from './layout.js';
import { addWidget, removeWidget, addFloat, removeFloat, usedAssets, sanitizeBoard, resetLook, HEX } from './model.js';
import { SCHEMES, FONTS, FONT_CATS, FONT_ROLES, EMOJI, PIXEL_STICKERS, pixelSVG, FRAMES, TEXT_STYLES, PATTERNS } from './catalog.js';
import { palette, contrast, family, loadGoogleFont, loadFontPreviews } from './theme.js';
import { addImage, addFont, forget } from './assets.js';

const FAMILY = /^[A-Za-z0-9 ]{1,40}$/;
const SWATCHES = ['#FFC83D', '#A99BFF', '#6EA6FF', '#FF8FB1', '#7EE0A8', '#FF9F5A', '#5EE0E6', '#C6F36B', '#FF6B6B', '#F4F1E8'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pluginColor = (p) => app.board.theme.colors[p.id] || p.color;

// ── Undo ──
const history = [];
let sessionSaved = false; // one undo step per open menu, not one per keystroke
function pushHistory(json = JSON.stringify(app.board)) {
  history.push(json);
  if (history.length > 40) history.shift();
  const b = document.querySelector('[data-action="undo"]');
  if (b) b.disabled = false;
}
function beginChange() { if (!sessionSaved) { sessionSaved = true; pushHistory(); } }
function endSession() { sessionSaved = false; }
function undo() {
  const s = history.pop();
  if (!s) return;
  app.board = sanitizeBoard(JSON.parse(s));
  app.applyLook(); app.commit(); closeSheet(); app.render();
}

// A change made from a menu: save, redraw the board, keep the menu open.
function changed() { app.commit(); app.render(); }

// ── Entering and leaving ──
function enter() { app.editing = true; app.selected = null; history.length = 0; closeSheet(); app.render(); }
async function done() {
  closeSheet();
  app.editing = false; app.selected = null;
  // Files no longer used by anything are deleted here, not on delete, so Undo can bring them back.
  const used = usedAssets(app.board);
  let dropped = false;
  for (const [id, a] of Object.entries(app.board.assets)) {
    if (used.has(id)) continue;
    delete app.board.assets[id]; forget(id, a); dropped = true;
  }
  if (dropped) app.commit();
  history.length = 0;
  app.render();
}

export function editToolbar() {
  return `<div class="edit-bar" role="toolbar" aria-label="Edit board">
    <button data-action="add-menu">${ICONS.plus}<span>Add</span></button>
    <button data-action="look">${ICONS.look}<span>Look</span></button>
    <button data-action="wallpaper">${ICONS.image}<span>Wallpaper</span></button>
    <button data-action="undo"${history.length ? '' : ' disabled'}>${ICONS.undo}<span>Undo</span></button>
    <button class="done" data-action="edit-done">${ICONS.check}<span>Done</span></button>
  </div>`;
}

// Where a new float lands: centred, a little below the top of what is on screen.
// Each new one lands a little lower and to the side of the last, so they never stack exactly.
let cascade = 0;
function visibleSpot(w) {
  const area = document.getElementById('board-area');
  const top = area ? area.getBoundingClientRect().top : 0;
  const step = cascade++ % 5;
  const y = Math.max(0, (innerHeight * 0.18 - top) / app.m.unitY) + step * (90 / app.m.unitY);
  const x = (app.m.cols - w) / 2 + (step % 2 ? 1 : -1) * step * app.m.cols * 0.06;
  return { x: clamp(x, 0, Math.max(0, app.m.cols - w)), y, w };
}
function select(id) { app.selected = id; }
const tilt = () => Math.round((Math.random() - 0.5) * 8);

// ── Dragging ──
let drag = null;
let suppressClick = false;

function onPointerDown(e) {
  if (!app.editing || e.button > 0) return;
  const el = e.target.closest('#board-area .widget, #board-area .float');
  if (!el) return;
  const handle = e.target.closest('[data-drag]');
  if (!handle && e.target.closest('button, a, input, textarea, select, label')) return;
  const mode = handle?.dataset.drag || (e.pointerType === 'mouse' ? 'move' : null);
  if (!mode) return;
  e.preventDefault();
  const isFloat = el.classList.contains('float');
  const id = isFloat ? el.dataset.fid : el.dataset.wid;
  drag = { el, id, isFloat, mode, x0: e.clientX, y0: e.clientY, moved: false, before: JSON.stringify(app.board), pointerId: e.pointerId };
  if (isFloat && app.selected !== id && mode === 'move') { app.selected = id; el.classList.add('sel'); }
  if (isFloat) {
    const pos = app.board.layouts[app.key].floats[id];
    drag.p0 = { x: el.offsetLeft / app.m.unitX, y: el.offsetTop / app.m.unitY, w: pos.w }; // drawn spot, also for floats still waiting in the pile
    drag.size0 = app.board.floats[id].size;
    const r = el.getBoundingClientRect();
    drag.cx = r.left + r.width / 2; drag.cy = r.top + r.height / 2;
  } else {
    drag.item = app.layoutItems().find((it) => it.id === id);
    drag.px0 = toPx(drag.item, app.m);
    drag.cand = drag.item;
  }
  try { el.setPointerCapture(e.pointerId); } catch { /* element gone */ }
  app.dragging = true;
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.x0; const dy = e.clientY - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (!drag.moved) { drag.moved = true; drag.el.classList.add('dragging'); }
  const m = app.m;
  if (drag.isFloat) {
    const p = app.board.layouts[app.key].floats[drag.id];
    const f = app.board.floats[drag.id];
    if (drag.mode === 'move') {
      p.x = drag.p0.x + dx / m.unitX; p.y = Math.max(-1, drag.p0.y + dy / m.unitY);
      drag.el.style.left = `${p.x * m.unitX}px`; drag.el.style.top = `${p.y * m.unitY}px`;
    } else if (drag.mode === 'resize') {
      p.w = clamp(drag.p0.w + dx / m.unitX, 0.4, m.cols * 1.5);
      drag.el.style.width = `${p.w * m.unitX}px`;
      if (f.type === 'text') { f.size = clamp(Math.round(drag.size0 * (p.w / drag.p0.w)), 10, 160); drag.el.style.fontSize = `${f.size * (m.key === 'narrow' ? 0.8 : 1)}px`; }
      const emoji = drag.el.querySelector('.emoji');
      if (emoji) emoji.style.fontSize = `${p.w * m.unitX * 0.82}px`;
    } else {
      let a = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI + 90;
      if (a > 180) a -= 360;
      a = clamp(a, -45, 45);
      f.rot = Math.abs(a) < 3 ? 0 : Math.round(a);
      drag.el.style.setProperty('--rot', `${f.rot}deg`);
    }
    return;
  }
  let cand;
  if (drag.mode === 'move') {
    drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
    const s = snap(drag.px0.left + dx, drag.px0.top + dy, m);
    cand = clampItem({ ...drag.item, x: s.x, y: s.y }, m.cols);
  } else {
    const w = Math.max(m.colW, drag.px0.width + dx); const h = Math.max(m.rowH * 2, drag.px0.height + dy);
    drag.el.style.width = `${w}px`; drag.el.style.height = `${h}px`;
    const s = snapSize(w, h, m);
    cand = clampItem({ ...drag.item, w: Math.min(s.w, m.cols - drag.item.x), h: s.h, auto: false }, m.cols);
  }
  if (cand.x === drag.cand.x && cand.y === drag.cand.y && cand.w === drag.cand.w && cand.h === drag.cand.h) return;
  drag.cand = cand;
  drag.placed = compact(app.layoutItems().map((it) => (it.id === cand.id ? cand : it)), m.cols, cand.id);
  app.applyPositions(drag.placed, cand.id);
  ghost(toPx(drag.placed.find((it) => it.id === cand.id), m));
}

function ghost(px) {
  const area = document.getElementById('board-area');
  let g = area.querySelector('.drop-ghost');
  if (!g) { g = Object.assign(document.createElement('div'), { className: 'drop-ghost' }); area.prepend(g); }
  Object.assign(g.style, { left: `${px.left}px`, top: `${px.top}px`, width: `${px.width}px`, height: `${px.height}px` });
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag; drag = null; app.dragging = false;
  if (!d.moved) return; // a plain click: the click handler opens the item's menu
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  if (e.type === 'pointercancel') { app.board = sanitizeBoard(JSON.parse(d.before)); app.render(); return; }
  pushHistory(d.before);
  if (!d.isFloat && d.placed) {
    const L = app.board.layouts[app.key].items;
    for (const it of d.placed) L[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h, auto: it.id === d.id && d.mode === 'resize' ? false : L[it.id].auto };
  }
  app.commit(); app.render();
}

// Arrow keys on a grip move the item; with Shift they resize it.
function onKeyDown(e) {
  if (!app.editing) return;
  const grip = e.target.closest?.('.h-grip');
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  const floatEl = e.target.closest?.('#board-area .float');
  if (!grip && floatEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); floatEl.click(); return; }
  if (!grip || !dir) return;
  e.preventDefault();
  const el = grip.closest('.widget, .float');
  pushHistory();
  if (el.classList.contains('float')) {
    const id = el.dataset.fid;
    const p = app.board.layouts[app.key].floats[id];
    if (p.y === null) Object.assign(p, { x: el.offsetLeft / app.m.unitX, y: el.offsetTop / app.m.unitY });
    if (e.shiftKey) p.w = clamp(p.w + (dir[0] - dir[1]) * 0.25, 0.4, app.m.cols * 1.5);
    else { p.x += dir[0] * 0.25; p.y = Math.max(-1, p.y + dir[1] * 0.5); }
    app.commit(); app.render();
    document.querySelector(`[data-fid="${id}"] .h-grip`)?.focus();
    return;
  }
  const id = el.dataset.wid;
  const placed = app.layoutItems();
  const it = placed.find((x) => x.id === id);
  const cand = clampItem(e.shiftKey ? { ...it, w: it.w + dir[0], h: it.h + dir[1], auto: false } : { ...it, x: it.x + dir[0], y: it.y + dir[1] }, app.m.cols);
  const out = compact(placed.map((x) => (x.id === id ? cand : x)), app.m.cols, id);
  const L = app.board.layouts[app.key].items;
  for (const x of out) L[x.id] = { x: x.x, y: x.y, w: x.w, h: x.h, auto: x.id === id ? cand.auto : L[x.id].auto };
  app.commit(); app.render();
  document.querySelector(`[data-wid="${id}"] .h-grip`)?.focus();
}

// In edit mode, tapping an item opens its menu.
function onClick(e) {
  if (!app.editing || suppressClick) return;
  if (e.target.closest('[data-action], [data-drag], a, input, label, textarea')) return;
  const f = e.target.closest('#board-area .float');
  if (f) {
    if (app.selected === f.dataset.fid) openFloatMenu(f.dataset.fid);
    else { select(f.dataset.fid); app.render(); document.querySelector(`[data-fid="${f.dataset.fid}"]`)?.focus(); }
    return;
  }
  if (app.selected) { select(null); app.render(); }
  const w = e.target.closest('#board-area .widget');
  if (w) openWidgetMenu(w.dataset.wid);
}

export function initEdit() {
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onClick);
}

// ── Menus ──
// Re-open the current menu after a button changed something, keeping focus on that button.
let current = null;
function show(fn, ...args) {
  current = { fn, args };
  fn(...args);
}
function reshow(focusSel) {
  if (!current) return;
  const scroll = sheetEl().querySelector('.sheet')?.scrollTop || 0;
  current.fn(...current.args, true);
  const sheet = sheetEl().querySelector('.sheet');
  if (sheet) sheet.scrollTop = scroll;
  if (focusSel) sheetEl().querySelector(focusSel)?.focus();
}
const seg = (items, action, value, extra = '') => `<div class="seg" role="group">${items.map(([v, l]) => `<button data-action="${action}" data-v="${v}"${extra} aria-pressed="${v === value}">${esc(l)}</button>`).join('')}</div>`;

function openAdd(again) {
  const types = new Set(Object.values(app.board.widgets).map((w) => (w.type === 'plugin' ? `p:${w.plugin}` : w.type)));
  const missing = [
    ...(types.has('hello') ? [] : [{ id: 'hello', name: 'Greeting', blurb: 'Hello, the date and today\'s tally', color: '' }]),
    ...(types.has('week') ? [] : [{ id: 'week', name: 'Week board', blurb: 'The last 7 days in blocks', color: '' }]),
    ...PLUGINS.filter((p) => !types.has(`p:${p.id}`)).map((p) => ({ id: `p-${p.id}`, name: p.name, blurb: p.blurb, color: pluginColor(p) })),
  ];
  openSheet(`<h2 id="sheet-title">Add to the board</h2>
    <div class="add-grid">
      <label class="add-tile">${ICONS.image}<b>Photo</b><small>From your phone or Mac</small><input type="file" accept="image/*" data-change="add-photo" hidden></label>
      <button class="add-tile" data-action="add-text"><span class="aa" aria-hidden="true">Aa</span><b>Text</b><small>Notes, goals, quotes</small></button>
    </div>
    <h3>Stickers</h3>
    <div class="sticker-grid">
      ${Object.keys(PIXEL_STICKERS).map((k) => `<button data-action="add-sticker" data-pixel="${k}" aria-label="Pixel ${k}">${pixelSVG(PIXEL_STICKERS[k])}</button>`).join('')}
      ${EMOJI.map((em, i) => `<button data-action="add-sticker" data-emoji="${i}" aria-label="Sticker ${em}">${em}</button>`).join('')}
    </div>
    ${missing.length ? `<h3>Widgets</h3><ul class="plug-list">${missing.map((w) => `<li${w.color ? ` style="--c:${w.color}"` : ''}>
      <span class="chip${w.color ? '' : ' plain'}" aria-hidden="true"></span>
      <span class="plug-text"><b>${esc(w.name)}</b><small>${esc(w.blurb)}</small></span>
      <button class="btn ghost small" data-action="add-widget" data-id="${w.id}">Add</button></li>`).join('')}</ul>` : ''}
    <h3>Coming later</h3>
    <ul class="plug-list upcoming">${UPCOMING.map((u) => `<li><span class="chip" aria-hidden="true"></span><span class="plug-text"><b>${esc(u.name)}</b><small>${esc(u.blurb)}</small></span><span class="soon">Not built yet</span></li>`).join('')}</ul>`, { onClose: endSession, keepFocus: again });
}

function openWidgetMenu(id, again) {
  const w = app.board.widgets[id];
  if (!w) return;
  current = { fn: openWidgetMenu, args: [id] };
  const it = app.board.layouts[app.key].items[id];
  const p = w.type === 'plugin' ? PLUGINS.find((x) => x.id === w.plugin) : null;
  const name = p ? p.name : w.type === 'hello' ? 'Greeting' : 'Week board';
  const color = p ? pluginColor(p) : '';
  openSheet(`<h2 id="sheet-title">${esc(name)}</h2>
    ${p ? `<h3>Color</h3>
      <div class="swatches">${SWATCHES.map((c) => `<button class="swatch" style="--c:${c}" data-action="plugin-color" data-id="${p.id}" data-c="${c}" aria-label="Color ${c}" aria-pressed="${c.toLowerCase() === color.toLowerCase()}"></button>`).join('')}
        <label class="swatch picker" aria-label="Any color"><input type="color" value="${color}" data-input="plugin-color" data-id="${p.id}"></label></div>
      ${app.board.theme.colors[p.id] ? `<div class="btn-row"><button class="btn ghost small" data-action="plugin-color-reset" data-id="${p.id}">Back to the ${esc(p.name)} color</button></div>` : ''}` : ''}
    <h3>Size</h3>
    <p class="muted">${it?.auto ? 'Grows and shrinks to fit what is inside. Drag its corner to fix a size.' : 'Fixed size: what does not fit scrolls inside it.'}</p>
    <div class="btn-row">
      ${it?.auto ? '' : `<button class="btn ghost" data-action="widget-fit" data-id="${id}">Fit to content</button>`}
      <button class="btn ghost danger" data-action="widget-remove" data-id="${id}">Remove from board</button>
    </div>`, { onClose: endSession, keepFocus: again });
}

function openFloatMenu(id, again) {
  const f = app.board.floats[id];
  if (!f) return;
  current = { fn: openFloatMenu, args: [id] };
  const what = { photo: 'Photo', text: 'Text', sticker: 'Sticker' }[f.type];
  let body = '';
  if (f.type === 'photo') {
    body = `<h3>Frame</h3>${seg(FRAMES.map((x) => [x.id, x.label]), 'float-frame', f.frame, ` data-id="${id}"`)}
      ${f.frame === 'polaroid' ? `<label class="field"><span>Caption</span><input value="${esc(f.caption)}" maxlength="80" data-input="float-caption" data-id="${id}" placeholder="Summer '26"></label>` : ''}`;
  } else if (f.type === 'text') {
    const colors = [['ink', 'var(--ink)', 'Text'], ['ink2', 'var(--ink-2)', 'Muted'], ...SWATCHES.slice(0, 7).map((c) => [c, c, c])];
    body = `<label class="field"><span>Text</span><textarea rows="3" maxlength="600" data-input="float-text" data-id="${id}">${esc(f.text)}</textarea></label>
      <h3>Font</h3>
      <button class="font-row" data-action="font-pick" data-target="float:${id}"><span>Font</span><b style="font-family:${family(f.font || app.board.theme.fonts.body)}">${esc(fontName(f.font || app.board.theme.fonts.body))}</b></button>
      <label class="field"><span>Size <output>${f.size}px</output></span><input type="range" min="10" max="160" value="${f.size}" data-input="float-size" data-id="${id}"></label>
      <h3>Color</h3>
      <div class="swatches">${colors.map(([v, css, label]) => `<button class="swatch" style="--c:${css}" data-action="float-color" data-id="${id}" data-c="${v}" aria-label="${esc(label)}" aria-pressed="${v === f.color}"></button>`).join('')}
        <label class="swatch picker" aria-label="Any color"><input type="color" value="${HEX.test(f.color) ? f.color : '#1D1A2B'}" data-input="float-color" data-id="${id}"></label></div>
      <h3>Style</h3>${seg(TEXT_STYLES.map((x) => [x.id, x.label]), 'float-style', f.style, ` data-id="${id}"`)}
      <h3>Align</h3>${seg([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], 'float-align', f.align, ` data-id="${id}"`)}`;
  }
  openSheet(`<h2 id="sheet-title">${what}</h2>
    ${body}
    <label class="field"><span>Tilt <output>${f.rot}°</output></span><input type="range" min="-45" max="45" value="${f.rot}" data-input="float-rot" data-id="${id}"></label>
    <h3>Layer</h3>${seg([['front', 'In front of widgets'], ['back', 'Behind widgets']], 'float-layer', f.layer, ` data-id="${id}"`)}
    <div class="btn-row">
      <button class="btn ghost" data-action="float-top" data-id="${id}">Bring to top</button>
      <button class="btn ghost" data-action="float-copy" data-id="${id}">Duplicate</button>
      <button class="btn ghost danger" data-action="float-delete" data-id="${id}">Delete</button>
    </div>`, { onClose: endSession, keepFocus: again });
}

function fontName(key) {
  if (key?.startsWith('u:')) return app.board.assets[key.slice(2)]?.name || 'Your font';
  return key?.slice(2) || 'Default';
}

function openLook(again) {
  const t = app.board.theme;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const p = palette(t, dark);
  const plugins = Object.values(app.board.widgets).filter((w) => w.type === 'plugin').map((w) => PLUGINS.find((x) => x.id === w.plugin)).filter(Boolean);
  const low = t.scheme === 'custom' && contrast(t.custom.ink, t.custom.panel) < 4.5;
  openSheet(`<h2 id="sheet-title">Look</h2>
    <h3>Colors</h3>
    <div class="schemes">${Object.entries(SCHEMES).map(([k, s]) => {
      const sp = palette({ ...t, scheme: k, mode: k === 'console' ? t.mode : 'auto' }, dark);
      return `<button class="scheme" data-action="scheme" data-v="${k}" aria-pressed="${k === t.scheme}" style="--s1:${sp.shell};--s2:${sp.panel};--s3:${sp.ink}">
        <span class="scheme-art" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(s.name)}</span></button>`;
    }).join('')}</div>
    ${t.scheme === 'console' ? `<h3>Light or dark</h3>${seg([['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']], 'mode', t.mode)}` : ''}
    ${t.scheme === 'custom' ? `<div class="custom-colors">
      ${[['shell', 'Background'], ['panel', 'Cards'], ['ink', 'Text']].map(([k, l]) => `<label class="color-field"><input type="color" value="${t.custom[k]}" data-input="custom-color" data-k="${k}"><span>${l}</span></label>`).join('')}
    </div>${low ? '<p class="hint bad">Text and cards are too close in color to read easily. Pick a darker or lighter text color.</p>' : ''}` : ''}
    <h3>Fonts</h3>
    ${FONT_ROLES.map((r) => `<button class="font-row" data-action="font-pick" data-target="role:${r.id}"><span>${r.label}</span><b style="font-family:${family(t.fonts[r.id], r.id)}">${esc(fontName(t.fonts[r.id]))}</b></button>`).join('')}
    ${plugins.length ? `<h3>Plugin colors</h3><ul class="plug-list">${plugins.map((pl) => `<li style="--c:${pluginColor(pl)}">
      <span class="chip" aria-hidden="true"></span><span class="plug-text"><b>${esc(pl.name)}</b></span>
      <label class="swatch picker small" aria-label="${esc(pl.name)} color"><input type="color" value="${pluginColor(pl)}" data-input="plugin-color" data-id="${pl.id}"></label></li>`).join('')}</ul>` : ''}
    <div class="btn-row"><button class="btn ghost" data-action="look-reset">Reset colors and fonts</button></div>
    <p class="muted small">Current: ${esc(SCHEMES[t.scheme].name)}, ${p.mode}.</p>`, { onClose: endSession, keepFocus: again });
}

let fontTarget = null; // 'role:heading' or 'float:<id>'
let fontBack = null;   // the menu to return to after picking
function openFontPicker(target, again) {
  fontTarget = target;
  loadFontPreviews();
  const cur = target.startsWith('role:') ? app.board.theme.fonts[target.slice(5)] : app.board.floats[target.slice(6)]?.font || '';
  const label = target.startsWith('role:') ? FONT_ROLES.find((r) => `role:${r.id}` === target)?.label : 'this text';
  const btn = (key, name) => `<button class="font-btn" data-action="font-set" data-key="${esc(key)}" aria-pressed="${key === cur}" style="font-family:${family(key)}">${esc(name)}</button>`;
  const mine = Object.entries(app.board.assets).filter(([, a]) => a.kind === 'font');
  openSheet(`<h2 id="sheet-title">Font for ${esc(label)}</h2>
    <div class="btn-row"><label class="btn ghost">Upload a font file<input type="file" accept=".woff2,.woff,.ttf,.otf" data-change="font-upload" hidden></label>
      ${target.startsWith('float:') ? '<button class="btn ghost" data-action="font-set" data-key="">Same as the board</button>' : ''}</div>
    ${mine.length ? `<h3>Your fonts</h3><div class="font-list">${mine.map(([id, a]) => btn(`u:${id}`, a.name)).join('')}</div>` : ''}
    ${FONT_CATS.map((c) => `<h3>${c}</h3><div class="font-list">${FONTS.filter((f) => f.cat === c).map((f) => btn(`g:${f.name}`, f.name)).join('')}</div>`).join('')}
    <h3>Any Google font</h3>
    <form class="font-any" data-submit="font-any"><input name="family" maxlength="40" placeholder="Lobster" aria-label="Google font name" autocomplete="off"><button class="btn ghost small">Use it</button></form>
    <p class="muted small">Type the exact name from fonts.google.com.</p>`, { wide: true, onClose: endSession, keepFocus: again });
}

function setFont(key) {
  beginChange();
  if (fontTarget.startsWith('role:')) app.board.theme.fonts[fontTarget.slice(5)] = key || app.board.theme.fonts[fontTarget.slice(5)];
  else { const f = app.board.floats[fontTarget.slice(6)]; if (f) f.font = key; }
  loadGoogleFont(key);
  app.applyLook(); changed();
  const back = fontBack; fontBack = null;
  if (back) show(...back); else closeSheet();
}

function openWallpaper(again) {
  const wp = app.board.wallpaper;
  openSheet(`<h2 id="sheet-title">Wallpaper</h2>
    <div class="walls">
      <button class="wall-opt" data-action="wall" data-kind="none" aria-pressed="${wp.kind === 'none'}"><span class="wall-art plain"></span>None</button>
      ${PATTERNS.map((p) => `<button class="wall-opt" data-action="wall" data-kind="pattern" data-v="${p.id}" aria-pressed="${wp.kind === 'pattern' && wp.pattern === p.id}"><span class="wall-art pat-${p.id}"></span>${p.label}</button>`).join('')}
      <label class="wall-opt" aria-pressed="${wp.kind === 'photo'}"><span class="wall-art photo">${ICONS.image}</span>${wp.kind === 'photo' ? 'New photo' : 'Photo'}<input type="file" accept="image/*" data-change="wall-photo" hidden></label>
    </div>
    ${wp.kind !== 'none' ? `<label class="field"><span>Fade <output>${Math.round(wp.dim * 100)}%</output></span><input type="range" min="0" max="85" value="${Math.round(wp.dim * 100)}" data-input="wall-dim"></label>` : ''}`, { onClose: endSession, keepFocus: again });
}

// ── Actions (clicks), inputs (live sliders and fields), changes (file pickers), submits ──
const floatOf = (el) => app.board.floats[el.dataset.id];

export const EDIT_ACTIONS = {
  edit: enter,
  'edit-done': done,
  undo,
  'add-menu': () => show(openAdd),
  look: () => show(openLook),
  wallpaper: () => show(openWallpaper),
  'widget-menu': (b) => openWidgetMenu(b.dataset.id),
  'float-menu': (b) => openFloatMenu(b.dataset.id),
  'add-widget'(b) {
    pushHistory();
    const id = b.dataset.id;
    const spec = id === 'hello' || id === 'week' ? { type: id } : { type: 'plugin', plugin: id.slice(2) };
    addWidget(app.board, id, spec);
    app.commit(); closeSheet(); app.render(); app.refresh?.();
  },
  'add-text'() {
    pushHistory();
    const w = app.key === 'wide' ? 3 : 2.6;
    const id = addFloat(app.board, { type: 'text', text: 'Write something', font: 'g:Caveat', size: 34, color: 'ink', style: 'note', align: 'left', rot: tilt() }, app.key, visibleSpot(w));
    select(id);
    loadGoogleFont('g:Caveat');
    app.commit(); app.render();
    openFloatMenu(id);
    const ta = sheetEl().querySelector('textarea');
    ta?.focus(); ta?.select();
  },
  'add-sticker'(b) {
    pushHistory();
    const spec = b.dataset.pixel ? { pixel: b.dataset.pixel } : { emoji: EMOJI[Number(b.dataset.emoji)] };
    select(addFloat(app.board, { type: 'sticker', ...spec, rot: tilt() * 2 }, app.key, visibleSpot(app.key === 'wide' ? 1.1 : 0.9)));
    app.commit(); closeSheet(); app.render();
  },
  'widget-fit'(b) { beginChange(); app.board.layouts[app.key].items[b.dataset.id].auto = true; changed(); reshow(); },
  'widget-remove'(b) {
    pushHistory();
    removeWidget(app.board, b.dataset.id);
    app.commit(); closeSheet(); app.render();
    toast('Removed. Add it back from Add.');
  },
  'plugin-color'(b) { beginChange(); app.board.theme.colors[b.dataset.id] = b.dataset.c; changed(); reshow(`[data-action="plugin-color"][data-c="${b.dataset.c}"]`); },
  'plugin-color-reset'(b) { beginChange(); delete app.board.theme.colors[b.dataset.id]; changed(); reshow(); },
  'float-frame'(b) { beginChange(); floatOf(b).frame = b.dataset.v; changed(); reshow(`[data-action="float-frame"][data-v="${b.dataset.v}"]`); },
  'float-color'(b) { beginChange(); floatOf(b).color = b.dataset.c; changed(); reshow(`[data-action="float-color"][data-c="${b.dataset.c}"]`); },
  'float-style'(b) { beginChange(); floatOf(b).style = b.dataset.v; changed(); reshow(`[data-action="float-style"][data-v="${b.dataset.v}"]`); },
  'float-align'(b) { beginChange(); floatOf(b).align = b.dataset.v; changed(); reshow(`[data-action="float-align"][data-v="${b.dataset.v}"]`); },
  'float-layer'(b) { beginChange(); floatOf(b).layer = b.dataset.v; changed(); reshow(`[data-action="float-layer"][data-v="${b.dataset.v}"]`); },
  'float-top'(b) {
    beginChange();
    const id = b.dataset.id; const f = app.board.floats[id];
    delete app.board.floats[id]; app.board.floats[id] = f; // later in the list = drawn on top
    changed();
  },
  'float-copy'(b) {
    pushHistory();
    const f = app.board.floats[b.dataset.id]; const pos = app.board.layouts[app.key].floats[b.dataset.id];
    const el = document.querySelector(`[data-fid="${b.dataset.id}"]`);
    const y = pos.y ?? (el ? el.offsetTop / app.m.unitY : 0);
    const id = addFloat(app.board, structuredClone(f), app.key, { ...pos, x: pos.x + 0.5, y: y + 2 });
    select(id); app.commit(); app.render(); openFloatMenu(id);
  },
  'float-delete'(b) { pushHistory(); removeFloat(app.board, b.dataset.id); app.commit(); closeSheet(); app.render(); },
  'font-pick'(b) {
    fontBack = current ? [current.fn, ...current.args] : null;
    show(openFontPicker, b.dataset.target);
  },
  'font-set'(b) { setFont(b.dataset.key); },
  scheme(b) { beginChange(); app.board.theme.scheme = b.dataset.v; app.applyLook(); changed(); reshow(`[data-action="scheme"][data-v="${b.dataset.v}"]`); },
  mode(b) { beginChange(); app.board.theme.mode = b.dataset.v; app.applyLook(); changed(); reshow(`[data-action="mode"][data-v="${b.dataset.v}"]`); },
  'look-reset'() { pushHistory(); resetLook(app.board); app.applyLook(); changed(); reshow(); },
  wall(b) {
    beginChange();
    app.board.wallpaper.kind = b.dataset.kind;
    if (b.dataset.v) app.board.wallpaper.pattern = b.dataset.v;
    changed(); reshow(`[data-action="wall"][data-kind="${b.dataset.kind}"]${b.dataset.v ? `[data-v="${b.dataset.v}"]` : ''}`);
  },
};

export const EDIT_INPUTS = {
  'float-text'(el) { beginChange(); floatOf(el).text = el.value.slice(0, 600); changed(); },
  'float-caption'(el) { beginChange(); floatOf(el).caption = el.value.slice(0, 80); changed(); },
  'float-size'(el) { beginChange(); floatOf(el).size = clamp(Number(el.value), 10, 160); el.previousElementSibling.querySelector('output').textContent = `${el.value}px`; changed(); },
  'float-rot'(el) { beginChange(); floatOf(el).rot = clamp(Number(el.value), -45, 45); el.previousElementSibling.querySelector('output').textContent = `${el.value}°`; changed(); },
  'float-color'(el) { if (!HEX.test(el.value)) return; beginChange(); floatOf(el).color = el.value; changed(); },
  'plugin-color'(el) { if (!HEX.test(el.value)) return; beginChange(); app.board.theme.colors[el.dataset.id] = el.value; changed(); },
  'custom-color'(el) {
    if (!HEX.test(el.value)) return;
    beginChange(); app.board.theme.custom[el.dataset.k] = el.value; app.applyLook(); changed();
  },
  'wall-dim'(el) { beginChange(); app.board.wallpaper.dim = clamp(Number(el.value) / 100, 0, 0.85); el.previousElementSibling.querySelector('output').textContent = `${el.value}%`; changed(); },
};

export const EDIT_CHANGES = {
  async 'add-photo'(input) {
    const file = input.files?.[0];
    if (!file) return;
    closeSheet();
    try {
      const { id, asset } = await addImage(file);
      pushHistory();
      app.board.assets[id] = asset;
      select(addFloat(app.board, { type: 'photo', asset: id, frame: 'polaroid', caption: '', rot: tilt() }, app.key, visibleSpot(app.key === 'wide' ? 3.2 : 2.4)));
      app.commit(); app.render();
    } catch (err) { toast(err.message || 'Could not add that photo.', 'bad'); }
  },
  async 'wall-photo'(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { id, asset } = await addImage(file, 2400);
      beginChange();
      app.board.assets[id] = asset;
      Object.assign(app.board.wallpaper, { kind: 'photo', asset: id });
      changed(); reshow();
    } catch (err) { toast(err.message || 'Could not use that photo.', 'bad'); }
  },
  async 'font-upload'(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { id, asset } = await addFont(file);
      beginChange();
      app.board.assets[id] = asset;
      toast(`${asset.name} added.`, 'ok');
      setFont(`u:${id}`);
    } catch (err) { toast(err.message, 'bad'); }
  },
};

export const EDIT_SUBMITS = {
  'font-any'(form) {
    const name = form.elements.family.value.trim().replace(/\s+/g, ' ');
    if (!FAMILY.test(name)) { toast('Use letters, numbers and spaces only.', 'bad'); return; }
    setFont(`g:${name}`);
  },
};
