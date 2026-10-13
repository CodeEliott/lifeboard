// Lifeboard: renders the week board and one cartridge per plugin from the plugins' results.
// Plugins never touch the DOM; they return data, and everything visible is drawn here.
import { UPCOMING } from './plugins/index.js';
import { SOURCES } from './sources.js';
import { DEMO } from './demo.js';
import * as Cloud from './cloud.js';
import { prefs, savePrefs, orderedPlugins, isOn, cached, setCached, clearCache } from './store.js';
import { today, addDays, fmtDay, ago, parseDay } from './dates.js';

const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toast-root');

const status = { loading: false, errors: {}, authReady: false, signingIn: false };
let weekOffset = 0; // 0 = the last 7 days, -1 = the 7 days before that...

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const COLOR = /^#[0-9a-f]{6}$/i;
const colorOf = (p) => (COLOR.test(p.color) ? p.color : '#9A94AE');

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

function boardData() {
  const day = today();
  const plugins = orderedPlugins().filter(isOn);
  return { day, rows: plugins.map((p) => ({ plugin: p, res: resultFor(p, day) })) };
}

const signedIn = () => !!Cloud.account;
const live = () => prefs.demo || signedIn();

let inflight = null;
async function refresh({ quiet = true } = {}) {
  if (prefs.demo || !signedIn()) return;
  if (inflight) return inflight;
  inflight = (async () => {
    status.loading = true; status.errors = {}; render();
    const sources = [...new Set(orderedPlugins().filter(isOn).map((p) => p.source))].filter((s) => SOURCES[s]);
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

// ───────────────────────── Pieces ─────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 18) return 'Afternoon';
  if (h >= 18 && h < 23) return 'Evening';
  return 'Up late';
}

// Tiny bar chart drawn in pixels. `floor` scales from the lowest value (bodyweight), not zero.
function spark(values, floor) {
  const v = values.map((x) => Number(x) || 0);
  if (v.length < 2 || v.every((x) => x === 0)) return '';
  const lo = floor ? Math.min(...v.filter((x) => x > 0)) * 0.995 : 0;
  const hi = Math.max(...v);
  const H = 24; const W = 5; const G = 2;
  const bars = v.map((x, i) => {
    const h = x <= 0 ? 1 : Math.max(2, Math.round(((x - lo) / (hi - lo || 1)) * (H - 2)) + 2);
    return `<rect x="${i * (W + G)}" y="${H - h}" width="${W}" height="${h}" class="${x <= 0 ? 'zero' : ''}"/>`;
  }).join('');
  return `<svg class="spark" viewBox="0 0 ${v.length * (W + G) - G} ${H}" width="${v.length * (W + G) - G}" height="${H}" aria-hidden="true" shape-rendering="crispEdges">${bars}</svg>`;
}

function tileHTML(t) {
  return `<div class="tile">
    <span class="t-label">${esc(t.label)}</span>
    <span class="t-value">${esc(t.value)}${t.unit ? `<small>${esc(t.unit)}</small>` : ''}</span>
    ${t.sub ? `<span class="t-sub">${esc(t.sub)}</span>` : ''}
    ${Array.isArray(t.spark) ? spark(t.spark, t.sparkFloor) : ''}
  </div>`;
}

const SHOW_ITEMS = 6;
function checksHTML(items) {
  if (!items.length) return '';
  const shown = items.slice(0, SHOW_ITEMS);
  const done = items.filter((i) => i.done).length;
  return `<div class="today-list">
    <h4>Today <span>${done} of ${items.length}</span></h4>
    <ul>${shown.map((i) => `<li class="${i.done ? 'done' : ''}"><span class="box" aria-hidden="true"></span><span>${esc(i.label)}</span><span class="sr">${i.done ? 'done' : 'not done'}</span></li>`).join('')}</ul>
    ${items.length > SHOW_ITEMS ? `<p class="more">${items.length - SHOW_ITEMS} more in the app</p>` : ''}
  </div>`;
}

function cartHTML({ plugin: p, res }) {
  const err = status.errors[p.source];
  let body;
  if (!live()) body = '<p class="hint">Waiting for sign-in.</p>';
  else if (!res) body = `<p class="hint">${status.loading ? 'Loading' : 'Not loaded yet'}…</p>`;
  else body = `${res.hint ? `<p class="hint">${esc(res.hint)}</p>` : ''}
    ${res.tiles.length ? `<div class="tiles">${res.tiles.map(tileHTML).join('')}</div>` : ''}
    ${checksHTML(res.today)}`;
  const when = res?.updatedAt ? `Saved in ${SOURCES[p.source]?.name || p.name} ${ago(res.updatedAt)}` : '';
  return `<div class="cart-wrap${live() ? '' : ' unplugged'}">
    <article class="cart" style="--c:${colorOf(p)}" aria-labelledby="cart-${esc(p.id)}">
      <div class="ridges" aria-hidden="true"></div>
      <header class="label"><h3 id="cart-${esc(p.id)}">${esc(p.name)}</h3><p>${esc(p.blurb)}</p></header>
      ${err ? `<p class="hint bad">Refresh failed: ${esc(err)}</p>` : ''}
      ${body}
      <footer class="cart-foot"><span>${esc(when)}</span><a href="${esc(p.url)}" target="_blank" rel="noopener">Open ${esc(SOURCES[p.source]?.name || p.name)}</a></footer>
    </article>
  </div>`;
}

// Week board: one row per plugin, one block per day, filled by that day's score.
// A rolling 7 days with today on the right, so Monday morning still shows a full week.
function boardHTML({ day, rows }) {
  const end = addDays(day, 7 * weekOffset);
  const start = addDays(end, -6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const withData = rows.filter((r) => r.res && !r.res.empty && !r.res.broken);
  const perfect = (d) => withData.length > 0 && d <= day && withData.every((r) => (r.res.days[d]?.score ?? 0) >= 0.999);
  const nPerfect = days.filter(perfect).length;
  const short = { day: 'numeric', month: 'short' };
  const title = weekOffset === 0 ? 'Last 7 days' : `${fmtDay(start, short)} to ${fmtDay(end, short)}`;

  const head = days.map((d) => {
    const label = parseDay(d).toLocaleDateString('en-GB', { weekday: 'narrow' });
    return `<span class="col-head${d === day ? ' is-today' : ''}">${perfect(d) ? GEM : ''}<b>${label}</b><small>${parseDay(d).getDate()}</small></span>`;
  }).join('');

  const body = rows.map(({ plugin: p, res }) => {
    const cells = days.map((d, i) => {
      if (d > day) return '<span class="cell future" aria-hidden="true"></span>';
      const s = res?.days?.[d]?.score ?? 0;
      const q = Math.round(Math.max(0, Math.min(1, s)) * 4) / 4; // pixel steps: quarters
      const label = `${p.name}, ${fmtDay(d)}: ${res?.days?.[d]?.note || 'nothing logged'}`;
      return `<button class="cell${q ? ' on' : ''}${q === 1 ? ' full' : ''}${d === day ? ' is-today' : ''}" style="--c:${colorOf(p)};--s:${q};--i:${i}" data-action="day" data-day="${d}" aria-label="${esc(label)}"></button>`;
    }).join('');
    return `<span class="row-name" style="--c:${colorOf(p)}"><i></i><span class="full">${esc(p.name)}</span><span class="short" aria-hidden="true">${esc(p.short || p.name)}</span></span>${cells}`;
  }).join('');

  const goals = rows.map(({ plugin: p }) => `${p.goal} in ${p.name}`).join(', ');
  return `<section class="screen" aria-labelledby="board-h">
    <div class="screen-head">
      <h2 id="board-h">${title}</h2>
      <div class="week-nav">
        <button class="icon-btn small" data-action="week" data-step="-1" aria-label="Previous 7 days">${ICONS.left}</button>
        <button class="icon-btn small" data-action="week" data-step="1" aria-label="Next 7 days" ${weekOffset >= 0 ? 'disabled' : ''}>${ICONS.right}</button>
      </div>
    </div>
    <div class="board" style="--rows:${rows.length}">
      <span></span>${head}
      ${body}
    </div>
    <p class="legend">${goals ? `Full block: ${esc(goals)}.` : 'Switch on a plugin to fill the board.'} ${nPerfect ? `${nPerfect} perfect day${nPerfect === 1 ? '' : 's'} with every block full.` : 'Fill every block in a column for a perfect day.'}</p>
  </section>`;
}

// Perfect-day mark: a pixel gem, outline then fill, drawn on a 7x7 grid.
const gemRects = (rows, cls) => rows.map(([y, x0, x1]) => `<rect class="${cls}" x="${x0}" y="${y}" width="${x1 - x0 + 1}" height="1"/>`).join('');
const GEM = `<svg class="gem" viewBox="0 0 7 7" shape-rendering="crispEdges" role="img" aria-label="Perfect day">${
  gemRects([[0, 3, 3], [1, 2, 4], [2, 1, 5], [3, 0, 6], [4, 1, 5], [5, 2, 4], [6, 3, 3]], 'o')}${
  gemRects([[1, 3, 3], [2, 2, 4], [3, 1, 5], [4, 2, 4], [5, 3, 3]], 'i')}</svg>`;

function statusLine() {
  if (prefs.demo) return { lit: true, text: 'Sample data. Sign in to see yours.' };
  if (!signedIn()) return { lit: false, text: status.authReady || !Cloud.hasStoredSession() ? 'Not signed in' : 'Checking sign-in…' };
  if (status.loading) return { lit: true, text: 'Syncing…', blink: true };
  if (Object.keys(status.errors).length) return { lit: false, text: 'Offline. Showing saved data.' };
  return { lit: true, text: status.at ? `Synced ${ago(status.at)}` : 'Signed in' };
}

const ICONS = {
  left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
  right: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>',
  sync: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3"/></svg>',
  slots: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h11"/></svg>',
};

// ───────────────────────── Render ─────────────────────────
function render() {
  const data = boardData();
  const { day, rows } = data;
  const name = rawFor('replog')?.name;
  const items = rows.flatMap((r) => r.res?.today || []);
  const st = statusLine();

  app.innerHTML = `
  <header class="top">
    <a class="logo" href="./" data-action="logo"><img src="icons/icon.svg" alt="" width="28" height="28"><span>Lifeboard</span></a>
    <div class="top-actions">
      ${signedIn() ? `<button class="icon-btn" data-action="refresh" aria-label="Refresh"${status.loading ? ' disabled' : ''}>${ICONS.sync}</button>` : ''}
      <button class="icon-btn" data-action="plugins" aria-label="Plugins and settings">${ICONS.slots}</button>
    </div>
  </header>

  <div class="hero">
    <div class="hello">
      <h1>${greeting()}${name ? `, ${esc(name)}` : ''}</h1>
      <p class="date">${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      ${live() && items.length ? `<p class="tally"><b>${items.filter((i) => i.done).length}</b> of <b>${items.length}</b> things done today across your apps.</p>` : ''}
      ${!live() ? `<div class="connect">
        <p>Sign in with the Google account you use in RepLog. Lifeboard reads RepLog, its sleep nights and Appearance Lab's copy, and never changes them.</p>
        <div class="btn-row">
          <button class="btn" data-action="sign-in"${status.signingIn ? ' disabled' : ''}>Sign in with Google</button>
          <button class="btn ghost" data-action="demo">Try it with sample data</button>
        </div>
      </div>` : ''}
      ${prefs.demo ? '<div class="btn-row"><button class="btn ghost small" data-action="demo-off">Leave sample data</button></div>' : ''}
    </div>
    <div class="console">
      ${boardHTML(data)}
      <div class="bezel-foot"><span class="led${st.lit ? ' lit' : ''}${st.blink ? ' blink' : ''}" aria-hidden="true"></span><span role="status">${esc(st.text)}</span></div>
    </div>
  </div>

  <section class="carts" aria-label="Plugins">
    ${rows.map(cartHTML).join('')}
    <div class="slot"><button data-action="plugins"><span class="plus" aria-hidden="true"></span><span><b>Plug in another app</b><small>${UPCOMING.length} more apps could get a plugin</small></span></button></div>
  </section>

  <footer class="foot"><p>Lifeboard only reads your apps. To change anything, open the app itself.</p></footer>`;
}

// ───────────────────────── Sheets and toasts ─────────────────────────
let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  sheetRoot.innerHTML = `<div class="scrim" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button class="icon-btn sheet-close" data-action="close-sheet" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>
      ${html}
    </div>`;
  document.body.classList.add('sheet-open');
  sheetRoot.querySelector('.sheet-close').focus();
}
function closeSheet() {
  if (!sheetRoot.innerHTML) return;
  sheetRoot.innerHTML = '';
  document.body.classList.remove('sheet-open');
  lastFocus?.focus?.();
}

function toast(msg, tone = '') {
  const t = Object.assign(document.createElement('div'), { className: `toast ${tone}`, textContent: msg });
  toastRoot.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3300);
}

function openDay(d) {
  const { rows } = boardData();
  openSheet(`<h2 id="sheet-title">${fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <ul class="day-list">${rows.map(({ plugin: p, res }) => {
      const info = res?.days?.[d];
      return `<li style="--c:${colorOf(p)}"><span class="cell static${info?.score ? ' on' : ''}${info?.score >= 0.999 ? ' full' : ''}" style="--s:${Math.round((info?.score || 0) * 4) / 4}"></span>
        <span><b>${esc(p.name)}</b><small>${esc(info?.note || 'Nothing logged')}</small></span></li>`;
    }).join('')}</ul>`);
}

function openPlugins() {
  const list = orderedPlugins();
  openSheet(`<h2 id="sheet-title">Plugins</h2>
    <p class="muted">Each plugin reads one app. Switch them on or off and set their order on the board.</p>
    <ul class="plug-list">${list.map((p, i) => `<li style="--c:${colorOf(p)}">
      <span class="chip" aria-hidden="true"></span>
      <span class="plug-text"><b>${esc(p.name)}</b><small>${esc(p.blurb)}</small></span>
      <span class="plug-move">
        <button class="icon-btn small" data-action="move" data-id="${esc(p.id)}" data-step="-1" aria-label="Move ${esc(p.name)} up" ${i === 0 ? 'disabled' : ''}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 10 5-5 5 5"/></svg></button>
        <button class="icon-btn small" data-action="move" data-id="${esc(p.id)}" data-step="1" aria-label="Move ${esc(p.name)} down" ${i === list.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg></button>
      </span>
      <button class="switch" role="switch" aria-checked="${isOn(p)}" data-action="toggle" data-id="${esc(p.id)}" aria-label="Show ${esc(p.name)}"><i></i></button>
    </li>`).join('')}</ul>
    <h3>Empty slots</h3>
    <ul class="plug-list upcoming">${UPCOMING.map((u) => `<li><span class="chip" aria-hidden="true"></span><span class="plug-text"><b>${esc(u.name)}</b><small>${esc(u.blurb)}</small></span><span class="soon">Not built yet</span></li>`).join('')}</ul>
    <h3>Look</h3>
    <div class="seg" role="group" aria-label="Theme">${[['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button data-action="theme" data-v="${v}" aria-pressed="${prefs.theme === v}">${l}</button>`).join('')}</div>
    <h3>Account</h3>
    ${signedIn()
      ? `<p class="muted">Signed in as <b>${esc(Cloud.account.email)}</b>.</p><div class="btn-row"><button class="btn ghost" data-action="sign-out">Sign out</button></div>`
      : prefs.demo
        ? '<p class="muted">Showing sample data.</p><div class="btn-row"><button class="btn" data-action="sign-in">Sign in with Google</button><button class="btn ghost" data-action="demo-off">Leave sample data</button></div>'
        : '<p class="muted">Not signed in.</p><div class="btn-row"><button class="btn" data-action="sign-in">Sign in with Google</button></div>'}`);
}

// ───────────────────────── Actions ─────────────────────────
function applyTheme() {
  if (prefs.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', prefs.theme);
}

const ACTIONS = {
  'close-sheet': closeSheet,
  plugins: openPlugins,
  day: (b) => openDay(b.dataset.day),
  week(b) { weekOffset = Math.min(0, weekOffset + Number(b.dataset.step)); render(); },
  refresh: () => refresh({ quiet: false }),
  async 'sign-in'() {
    status.signingIn = true; render();
    try { await Cloud.signInGoogle(); } catch (err) { status.signingIn = false; render(); toast(`Sign-in failed: ${err.message}`, 'bad'); }
  },
  async 'sign-out'() {
    await Cloud.signOut(); clearCache(); status.errors = {}; status.at = null;
    closeSheet(); render(); toast('Signed out. Saved data cleared from this browser.');
  },
  demo() { prefs.demo = true; savePrefs(); render(); },
  'demo-off'() { prefs.demo = false; savePrefs(); closeSheet(); render(); },
  toggle(b) {
    const id = b.dataset.id;
    prefs.off = prefs.off.includes(id) ? prefs.off.filter((x) => x !== id) : [...prefs.off, id];
    savePrefs(); render(); openPlugins();
    sheetRoot.querySelector(`[data-action="toggle"][data-id="${id}"]`)?.focus();
    refresh();
  },
  move(b) {
    const ids = orderedPlugins().map((p) => p.id);
    const i = ids.indexOf(b.dataset.id); const j = i + Number(b.dataset.step);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    prefs.order = ids; savePrefs(); render(); openPlugins();
    sheetRoot.querySelector(`[data-action="move"][data-id="${b.dataset.id}"][data-step="${b.dataset.step}"]:not([disabled])`)?.focus();
  },
  theme(b) {
    prefs.theme = b.dataset.v; savePrefs(); applyTheme(); openPlugins();
    sheetRoot.querySelector(`[data-action="theme"][data-v="${b.dataset.v}"]`)?.focus();
  },
  logo(b, e) { e.preventDefault(); weekOffset = 0; render(); window.scrollTo(0, 0); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || !ACTIONS[el.dataset.action]) return;
  ACTIONS[el.dataset.action](el, e);
});

// Konami code: every block lights up for a moment. The real ones still need real reps.
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konami = 0;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  konami = e.key === KONAMI[konami] ? konami + 1 : e.key === KONAMI[0] ? 1 : 0;
  if (konami === KONAMI.length) {
    konami = 0;
    document.body.classList.add('cheat');
    toast('Cheat code accepted. The real blocks still need real reps.', 'gold');
    setTimeout(() => document.body.classList.remove('cheat'), 2600);
  }
});

// ───────────────────────── Boot ─────────────────────────
applyTheme();
app.classList.add('boot');
render();
setTimeout(() => app.classList.remove('boot'), 1400);

// A Google sign-in comes back with tokens (or an error) in the URL. Supabase reads them while
// initialising, so only tidy the URL after initAuth has run.
const oauthReturn = /access_token|error_description/.test(location.hash) || /[?&]code=/.test(location.search);
const oauthError = new URLSearchParams(location.hash.slice(1)).get('error_description');
if (Cloud.hasStoredSession() || oauthReturn) {
  Cloud.initAuth((ev) => {
    if (ev === 'signed-in') { prefs.demo = false; savePrefs(); refresh(); }
    if (ev === 'signed-out') render();
  }).then(() => {
    status.authReady = true;
    if (oauthReturn) history.replaceState(null, '', location.pathname);
    if (oauthError) toast(`Sign-in failed: ${oauthError}`, 'bad');
    if (Cloud.account) { prefs.demo = false; savePrefs(); refresh(); } else render();
  }).catch((err) => { status.authReady = true; render(); toast(err.message, 'bad'); });
} else {
  status.authReady = true;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (signedIn() && Date.now() - (status.at || 0) > 5 * 60000) refresh();
  else render(); // the date or "x min ago" may have moved on
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

