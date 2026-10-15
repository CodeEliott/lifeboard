// Lifeboard: a board of widgets on a grid (the greeting, the week board, one cartridge per
// plugin) with photos, text and stickers floating on top. Plugins return data and never touch
// the DOM; widgets.js draws things, board/edit.js handles edit mode, this file ties it together.
import { PLUGINS } from './plugins/index.js';
import { SOURCES } from './sources.js';
import { DEMO } from './demo.js';
import * as Cloud from './cloud.js';
import { prefs, savePrefs, cached, setCached, clearCache } from './store.js';
import { today, fmtDay, ago } from './dates.js';
import { app, esc, openSheet, closeSheet, toast, ICONS } from './ui.js';
import { cartHTML, weekHTML, helloHTML, floatHTML, widgetHandles } from './widgets.js';
import { layoutKey, metrics, toPx, compact, rowsFor, bottom } from './board/layout.js';
import { applyTheme } from './board/theme.js';
import { ensure, urlOf } from './board/assets.js';
import { addWidget, removeWidget, resetLayout } from './board/model.js';
import { loadBoard, storeLocal, schedulePush, pull, flush, syncState } from './board/sync.js';
import { EDIT_ACTIONS, EDIT_INPUTS, EDIT_CHANGES, EDIT_SUBMITS, initEdit, editToolbar } from './board/edit.js';

const root = document.getElementById('app');
const wall = document.getElementById('wall');
const systemDark = matchMedia('(prefers-color-scheme: dark)');

const status = { loading: false, errors: {}, authReady: false, signingIn: false, at: null };
let weekOffset = 0; // 0 = the last 7 days, -1 = the 7 days before that...
const fitRows = new Map(); // `${layout}:${widgetId}` -> rows an auto-height widget needs right now

app.board = loadBoard(prefs);

// ───────────────────────── Data ─────────────────────────
// Raw row for a source: sample data in demo mode, else the last fetched row.
// undefined = not loaded yet, null = loaded and empty.
function rawFor(source) {
  if (prefs.demo) return DEMO[source]?.(today()) ?? null;
  const c = cached(source);
  return c ? c.raw : undefined;
}

// One plugin's result. A plugin that throws is shown as broken instead of blanking the board.
function resultFor(plugin, day) {
  const raw = rawFor(plugin.source);
  if (raw === undefined) return null;
  try {
    const r = plugin.shape(raw, { today: day });
    return { ...r, tiles: Array.isArray(r.tiles) ? r.tiles : [], today: Array.isArray(r.today) ? r.today : [], days: r.days && typeof r.days === 'object' ? r.days : {} };
  } catch (err) {
    console.error(`${plugin.name} plugin failed:`, err);
    return { broken: true, hint: `This plugin could not read its data (${err.message}).`, tiles: [], today: [], days: {} };
  }
}

// Plugins on the board, in reading order on this screen.
function boardPlugins() {
  const L = app.board.layouts[app.key]?.items || {};
  return Object.entries(app.board.widgets)
    .filter(([, w]) => w.type === 'plugin')
    .map(([id, w]) => ({ p: PLUGINS.find((x) => x.id === w.plugin), at: L[id] || { x: 0, y: 0 } }))
    .filter((x) => x.p)
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
    .map((x) => x.p);
}
const colorFor = (p) => app.board.theme.colors[p.id] || p.color;

const signedIn = () => !!Cloud.account;
const live = () => prefs.demo || signedIn();

let inflight = null;
async function refresh({ quiet = true } = {}) {
  if (prefs.demo || !signedIn()) return;
  if (inflight) return inflight;
  inflight = (async () => {
    status.loading = true; status.errors = {}; render();
    const sources = [...new Set(boardPlugins().map((p) => p.source))].filter((s) => SOURCES[s]);
    try {
      const c = await Cloud.client();
      await Promise.all(sources.map(async (s) => {
        try { setCached(s, await SOURCES[s].fetch(c, Cloud.account.id)); delete status.errors[s]; }
        catch (err) { status.errors[s] = err.message || 'Could not load'; }
      }));
    } catch (err) {
      for (const s of sources) status.errors[s] = err.message;
    }
    status.loading = false; status.at = Date.now();
    render();
    const failed = Object.keys(status.errors);
    if (failed.length) toast(`Could not refresh ${failed.map((s) => SOURCES[s]?.name || s).join(' and ')}. Showing saved data.`, 'bad');
    else if (!quiet) toast('Up to date.');
  })().finally(() => { inflight = null; });
  return inflight;
}

// The board itself: take a newer copy from the account, fetch any files it needs.
let lastPull = 0;
async function syncBoard() {
  lastPull = Date.now();
  const remote = await pull(app.board, () => app.board);
  if (remote && !app.editing) { app.board = remote; applyLook(); render(); }
  if (await ensure(app.board)) render();
}

// ───────────────────────── Layout ─────────────────────────
function boardWidth() {
  const cs = getComputedStyle(root);
  return root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}

// Grid items for this screen, auto-height widgets at their measured height, packed.
function layoutItems() {
  const L = app.board.layouts[app.key].items;
  const items = Object.entries(L).filter(([id]) => app.board.widgets[id])
    .map(([id, it]) => ({ id, ...it, h: it.auto ? (fitRows.get(`${app.key}:${id}`) ?? it.h) : it.h }));
  return compact(items, app.m.cols);
}

function applyPositions(placed, skipId) {
  for (const it of placed) {
    if (it.id === skipId) continue;
    const el = root.querySelector(`.widget[data-wid="${it.id}"]`);
    if (!el) continue;
    const px = toPx(it, app.m);
    Object.assign(el.style, { left: `${px.left}px`, top: `${px.top}px`, width: `${px.width}px`, height: `${px.height}px` });
  }
  sizeArea(placed);
}

function sizeArea(placed = layoutItems()) {
  const area = document.getElementById('board-area');
  if (!area) return;
  let h = bottom(placed) * app.m.unitY;
  for (const f of area.querySelectorAll('.float')) h = Math.max(h, f.offsetTop + f.offsetHeight + 16);
  area.style.height = `${Math.ceil(h + (app.editing ? 260 : 0))}px`;
}

// Auto-height widgets: measure what they hold and give them exactly enough rows.
function fitAuto() {
  let moved = false;
  for (const el of root.querySelectorAll('.widget[data-auto]')) {
    const frame = el.querySelector('.w-frame'); const fit = el.querySelector('.w-fit');
    if (!frame || !fit) continue;
    const cs = getComputedStyle(frame);
    const px = fit.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const rows = rowsFor(px, app.m);
    const k = `${app.key}:${el.dataset.wid}`;
    if (fitRows.get(k) !== rows) { fitRows.set(k, rows); moved = true; }
  }
  if (moved) applyPositions(layoutItems());
}

app.layoutItems = layoutItems;
app.applyPositions = applyPositions;

// ───────────────────────── Render ─────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 18) return 'Afternoon';
  if (h >= 18 && h < 23) return 'Evening';
  return 'Up late';
}

function statusLine() {
  if (prefs.demo) return { lit: true, text: 'Sample data. Sign in to see yours.' };
  if (!signedIn()) return { lit: false, text: status.authReady || !Cloud.hasStoredSession() ? 'Not signed in' : 'Checking sign-in…' };
  if (status.loading) return { lit: true, text: 'Syncing…', blink: true };
  if (Object.keys(status.errors).length) return { lit: false, text: 'Offline. Showing saved data.' };
  return { lit: true, text: status.at ? `Synced ${ago(status.at)}` : 'Signed in' };
}

function widgetHTML(it, ctx) {
  const w = app.board.widgets[it.id];
  const px = toPx(it, app.m);
  let inner; let label;
  if (w.type === 'hello') {
    label = 'Greeting';
    inner = helloHTML({ greeting: greeting(), name: rawFor('replog')?.name, day: ctx.day, items: ctx.rows.flatMap((r) => r.res?.today || []), live: live(), demo: prefs.demo, signingIn: status.signingIn });
  } else if (w.type === 'week') {
    label = 'Week board';
    inner = weekHTML({ day: ctx.day, rows: ctx.rows, weekOffset, status: statusLine() });
  } else {
    const r = ctx.rows.find((x) => x.plugin.id === w.plugin);
    if (!r) return '';
    label = r.plugin.name;
    inner = cartHTML({ plugin: r.plugin, res: r.res, color: r.color, live: live(), loading: status.loading, error: status.errors[r.plugin.source], sourceName: SOURCES[r.plugin.source]?.name || r.plugin.name });
  }
  return `<section class="widget w-${w.type}" data-wid="${it.id}" style="left:${px.left}px;top:${px.top}px;width:${px.width}px;height:${px.height}px"${it.auto ? ' data-auto' : ''}>
    ${inner}${app.editing ? widgetHandles(it.id, label) : ''}</section>`;
}

// Floats not placed on this screen yet (y: null) wait in a loose pile under the widgets.
function floatSpots(placed) {
  const L = app.board.layouts[app.key].floats;
  const top = bottom(placed) + 2;
  let x = 0.2; let row = 0;
  const spots = {};
  for (const id of Object.keys(app.board.floats)) {
    const p = L[id];
    if (!p) continue;
    if (p.y !== null) { spots[id] = p; continue; }
    if (x + p.w > app.m.cols) { x = 0.2; row++; }
    spots[id] = { ...p, x, y: top + row * Math.round(220 / app.m.unitY) };
    x += p.w + 0.3;
  }
  return spots;
}

function floatsHTML(layer, spots) {
  return Object.entries(app.board.floats)
    .filter(([id, f]) => f.layer === layer && spots[id])
    .map(([id, f]) => floatHTML(id, f, spots[id], app.m, app.board, app.editing && { selected: app.selected })).join('');
}

function renderWall() {
  const wp = app.board.wallpaper;
  const src = wp.kind === 'photo' ? urlOf(wp.asset) : '';
  wall.className = wp.kind === 'pattern' ? `pat-${wp.pattern}` : src ? 'photo' : '';
  wall.style.backgroundImage = src ? `url("${src}")` : '';
  wall.style.setProperty('--dim', wp.dim);
  document.body.classList.toggle('has-wall', wp.kind !== 'none');
}

function topBar() {
  return `<header class="top">
    <a class="logo" href="./" data-action="logo"><img src="icons/icon.svg" alt="" width="28" height="28"><span>Lifeboard</span></a>
    <div class="top-actions">
      ${app.editing ? '<span class="editing-note">Editing</span>' : `<button class="btn ghost small edit-btn" data-action="edit">${ICONS.edit}<span>Edit<span class="wide-only"> board</span></span></button>`}
      ${signedIn() && !app.editing ? `<button class="icon-btn" data-action="refresh" aria-label="Refresh"${status.loading ? ' disabled' : ''}>${ICONS.sync}</button>` : ''}
      <button class="icon-btn" data-action="settings" aria-label="Settings">${ICONS.menu}</button>
    </div>
  </header>`;
}

function render() {
  if (app.dragging) return;
  const width = boardWidth();
  app.key = layoutKey(width);
  app.m = metrics(width, app.key);
  const day = today();
  const rows = boardPlugins().map((p) => ({ plugin: p, res: resultFor(p, day), color: colorFor(p) }));
  const placed = layoutItems();
  const spots = floatSpots(placed);
  root.innerHTML = `${topBar()}
    <div class="board-area${app.editing ? ' editing' : ''}" id="board-area">
      ${floatsHTML('back', spots)}
      ${placed.map((it) => widgetHTML(it, { day, rows })).join('')}
      ${floatsHTML('front', spots)}
    </div>
    <footer class="foot"><p>Lifeboard only reads your apps. To change anything, open the app itself.</p></footer>
    ${app.editing ? editToolbar() : ''}`;
  renderWall();
  fitAuto();
  sizeArea();
}
app.render = render;

function applyLook() { applyTheme(app.board, systemDark.matches); renderWall(); }
app.applyLook = applyLook;

app.commit = () => {
  app.board.updatedAt = Date.now();
  storeLocal(app.board);
  schedulePush(() => app.board);
};
app.refresh = refresh;

// ───────────────────────── Sheets ─────────────────────────
function openDay(d) {
  const rows = boardPlugins().map((p) => ({ plugin: p, res: resultFor(p, today()), color: colorFor(p) }));
  openSheet(`<h2 id="sheet-title">${fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <ul class="day-list">${rows.map(({ plugin: p, res, color }) => {
      const info = res?.days?.[d];
      return `<li style="--c:${color}"><span class="cell static${info?.score ? ' on' : ''}" style="--s:${Math.round((info?.score || 0) * 4) / 4}"></span>
        <span><b>${esc(p.name)}</b><small>${esc(info?.note || 'Nothing logged')}</small></span></li>`;
    }).join('')}</ul>`);
}

function syncText() {
  if (!signedIn()) return 'Your board is saved in this browser. Sign in to keep it in sync between your phone and your Mac.';
  if (syncState.status === 'missing') return 'Board sync is off: its table is not set up yet. Run supabase/lifeboard-data.sql in RepLog\'s Supabase project.';
  if (syncState.status === 'error') return `Board sync failed: ${syncState.error}. Your changes are safe in this browser.`;
  if (syncState.status === 'saving') return 'Saving your board…';
  return syncState.at ? `Board synced ${ago(syncState.at)}.` : 'Board saved.';
}

function openSettings() {
  const onBoard = new Set(Object.values(app.board.widgets).filter((w) => w.type === 'plugin').map((w) => w.plugin));
  openSheet(`<h2 id="sheet-title">Settings</h2>
    <h3>Plugins</h3>
    <p class="muted">Each plugin reads one app. Switch one off to take it off the board.</p>
    <ul class="plug-list">${PLUGINS.map((p) => `<li style="--c:${colorFor(p)}">
      <span class="chip" aria-hidden="true"></span>
      <span class="plug-text"><b>${esc(p.name)}</b><small>${esc(p.blurb)}</small></span>
      <button class="switch" role="switch" aria-checked="${onBoard.has(p.id)}" data-action="toggle" data-id="${esc(p.id)}" aria-label="Show ${esc(p.name)}"><i></i></button>
    </li>`).join('')}</ul>
    <h3>Board</h3>
    <p class="muted">${esc(syncText())}</p>
    <div class="btn-row">
      <button class="btn ghost" data-action="edit">Edit board</button>
      <button class="btn ghost" data-action="reset-layout">Reset this layout</button>
    </div>
    <h3>Account</h3>
    ${signedIn()
      ? `<p class="muted">Signed in as <b>${esc(Cloud.account.email)}</b>.</p><div class="btn-row"><button class="btn ghost" data-action="sign-out">Sign out</button></div>`
      : prefs.demo
        ? '<p class="muted">Showing sample data.</p><div class="btn-row"><button class="btn" data-action="sign-in">Sign in with Google</button><button class="btn ghost" data-action="demo-off">Leave sample data</button></div>'
        : '<p class="muted">Not signed in.</p><div class="btn-row"><button class="btn" data-action="sign-in">Sign in with Google</button></div>'}`);
}

// ───────────────────────── Actions ─────────────────────────
const ACTIONS = {
  'close-sheet': closeSheet,
  settings: openSettings,
  day: (b) => openDay(b.dataset.day),
  week(b) { weekOffset = Math.min(0, weekOffset + Number(b.dataset.step)); render(); },
  refresh: () => refresh({ quiet: false }),
  async 'sign-in'() {
    status.signingIn = true; render();
    try { await Cloud.signInGoogle(); } catch (err) { status.signingIn = false; render(); toast(`Sign-in failed: ${err.message}`, 'bad'); }
  },
  async 'sign-out'() {
    flush();
    await Cloud.signOut(); clearCache(); status.errors = {}; status.at = null;
    closeSheet(); render(); toast('Signed out. App data cleared from this browser; your board stays here.');
  },
  demo() { prefs.demo = true; savePrefs(); render(); },
  'demo-off'() { prefs.demo = false; savePrefs(); closeSheet(); render(); },
  toggle(b) {
    const id = b.dataset.id;
    const wid = Object.keys(app.board.widgets).find((k) => app.board.widgets[k].type === 'plugin' && app.board.widgets[k].plugin === id);
    if (wid) removeWidget(app.board, wid); else addWidget(app.board, `p-${id}`, { type: 'plugin', plugin: id });
    app.commit(); render(); openSettings();
    document.querySelector(`[data-action="toggle"][data-id="${id}"]`)?.focus();
    refresh();
  },
  'reset-layout'() {
    if (!confirm('Put the widgets on this screen back where they started? Photos, text and stickers stay.')) return;
    resetLayout(app.board, app.key);
    for (const k of [...fitRows.keys()]) if (k.startsWith(`${app.key}:`)) fitRows.delete(k);
    app.commit(); closeSheet(); render();
  },
  logo(b, e) { e.preventDefault(); weekOffset = 0; render(); window.scrollTo(0, 0); },
  ...EDIT_ACTIONS,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || !ACTIONS[el.dataset.action]) return;
  if (app.editing && el.closest('#board-area') && !el.closest('.h-more')) return; // widgets are frozen while editing
  ACTIONS[el.dataset.action](el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && EDIT_INPUTS[el.dataset.input]) EDIT_INPUTS[el.dataset.input](el);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && EDIT_CHANGES[el.dataset.change]) EDIT_CHANGES[el.dataset.change](el);
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-submit]');
  if (!form || !EDIT_SUBMITS[form.dataset.submit]) return;
  e.preventDefault();
  EDIT_SUBMITS[form.dataset.submit](form);
});
initEdit();

// Konami code: every block lights up for a moment. The real ones still need real reps.
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konami = 0;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if (app.editing) return;
  konami = e.key === KONAMI[konami] ? konami + 1 : e.key === KONAMI[0] ? 1 : 0;
  if (konami === KONAMI.length) {
    konami = 0;
    document.body.classList.add('cheat');
    toast('Cheat code accepted. The real blocks still need real reps.', 'gold');
    setTimeout(() => document.body.classList.remove('cheat'), 2600);
  }
});

// ───────────────────────── Boot ─────────────────────────
applyLook();
root.classList.add('boot');
render();
setTimeout(() => root.classList.remove('boot'), 1400);
ensure(app.board).then((fresh) => { if (fresh) render(); });
systemDark.addEventListener?.('change', () => { applyLook(); render(); });

let lastWidth = boardWidth();
let resizeQueued = false;
addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    const w = boardWidth();
    if (w !== lastWidth) { lastWidth = w; render(); }
  });
});
// Web fonts change text height; re-measure auto-height widgets once they arrive.
document.fonts?.ready.then(() => { if (!app.dragging) fitAuto(); });
document.fonts?.addEventListener?.('loadingdone', () => { if (!app.dragging) { fitAuto(); sizeArea(); } });

// A Google sign-in comes back with tokens (or an error) in the URL. Supabase reads them while
// initialising, so only tidy the URL after initAuth has run.
const oauthReturn = /access_token|error_description/.test(location.hash) || /[?&]code=/.test(location.search);
const oauthError = new URLSearchParams(location.hash.slice(1)).get('error_description');
if (Cloud.hasStoredSession() || oauthReturn) {
  Cloud.initAuth((ev) => {
    if (ev === 'signed-in') { prefs.demo = false; savePrefs(); refresh(); syncBoard(); }
    if (ev === 'signed-out') render();
  }).then(() => {
    status.authReady = true;
    if (oauthReturn) history.replaceState(null, '', location.pathname);
    if (oauthError) toast(`Sign-in failed: ${oauthError}`, 'bad');
    if (Cloud.account) { prefs.demo = false; savePrefs(); refresh(); syncBoard(); } else render();
  }).catch((err) => { status.authReady = true; render(); toast(err.message, 'bad'); });
} else {
  status.authReady = true;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flush(); return; }
  if (signedIn() && Date.now() - (status.at || 0) > 5 * 60000) refresh();
  else if (!app.editing) render(); // the date or "x min ago" may have moved on
  if (signedIn() && !app.editing && Date.now() - lastPull > 60000) syncBoard();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
