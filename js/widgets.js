// What each thing on the board looks like. Pure HTML builders: data in, markup out.
// Every string from plugins or the board document goes through esc().
import { esc, ICONS } from './ui.js';
import { fmtDay, ago, addDays, parseDay } from './dates.js';
import { family, onColor } from './board/theme.js';
import { urlOf } from './board/assets.js';
import { pixelSVG, PIXEL_STICKERS } from './board/catalog.js';

// Tiny bar chart drawn in pixels. `floor` scales from the lowest value (bodyweight), not zero.
export function spark(values, floor) {
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
  const done = items.filter((i) => i.done).length;
  return `<div class="today-list">
    <h4>Today <span>${done} of ${items.length}</span></h4>
    <ul>${items.slice(0, SHOW_ITEMS).map((i) => `<li class="${i.done ? 'done' : ''}"><span class="box" aria-hidden="true"></span><span>${esc(i.label)}</span><span class="sr">${i.done ? 'done' : 'not done'}</span></li>`).join('')}</ul>
    ${items.length > SHOW_ITEMS ? `<p class="more">${items.length - SHOW_ITEMS} more in the app</p>` : ''}
  </div>`;
}

// A plugin cartridge.
export function cartHTML({ plugin: p, res, color, live, loading, error, sourceName }) {
  let body;
  if (!live) body = '<p class="hint">Waiting for sign-in.</p>';
  else if (!res) body = `<p class="hint">${loading ? 'Loading' : 'Not loaded yet'}…</p>`;
  else body = `${res.hint ? `<p class="hint">${esc(res.hint)}</p>` : ''}
    ${res.tiles.length ? `<div class="tiles">${res.tiles.map(tileHTML).join('')}</div>` : ''}
    ${checksHTML(res.today)}`;
  const when = res?.updatedAt ? `Saved in ${sourceName} ${ago(res.updatedAt)}` : '';
  return `<article class="cart w-frame" style="--c:${color};--on-c:${onColor(color)}" aria-labelledby="cart-${esc(p.id)}">
    <div class="w-fit">
      <div class="ridges" aria-hidden="true"></div>
      <header class="label"><h3 id="cart-${esc(p.id)}">${esc(p.name)}</h3><p>${esc(p.blurb)}</p></header>
      ${error ? `<p class="hint bad">Refresh failed: ${esc(error)}</p>` : ''}
      ${body}
      <footer class="cart-foot"><span>${esc(when)}</span><a href="${esc(p.url)}" target="_blank" rel="noopener">Open ${esc(sourceName)}</a></footer>
    </div>
  </article>`;
}

// Perfect-day mark: a pixel gem, outline then fill, drawn on a 7x7 grid.
const gemRects = (rows, cls) => rows.map(([y, x0, x1]) => `<rect class="${cls}" x="${x0}" y="${y}" width="${x1 - x0 + 1}" height="1"/>`).join('');
const GEM = `<svg class="gem" viewBox="0 0 7 7" shape-rendering="crispEdges" role="img" aria-label="Perfect day">${
  gemRects([[0, 3, 3], [1, 2, 4], [2, 1, 5], [3, 0, 6], [4, 1, 5], [5, 2, 4], [6, 3, 3]], 'o')}${
  gemRects([[1, 3, 3], [2, 2, 4], [3, 1, 5], [4, 2, 4], [5, 3, 3]], 'i')}</svg>`;

// Week board: one row per plugin, one block per day, filled by that day's score.
// A rolling 7 days with today on the right, so Monday morning still shows a full week.
export function weekHTML({ day, rows, weekOffset, status }) {
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

  const body = rows.map(({ plugin: p, res, color }) => {
    const cells = days.map((d, i) => {
      const s = res?.days?.[d]?.score ?? 0;
      const q = Math.round(Math.max(0, Math.min(1, s)) * 4) / 4; // pixel steps: quarters
      const label = `${p.name}, ${fmtDay(d)}: ${res?.days?.[d]?.note || 'nothing logged'}`;
      return `<button class="cell${q ? ' on' : ''}${d === day ? ' is-today' : ''}" style="--c:${color};--s:${q};--i:${i}" data-action="day" data-day="${d}" aria-label="${esc(label)}"></button>`;
    }).join('');
    return `<span class="row-name" style="--c:${color}"><i></i><span class="full">${esc(p.name)}</span><span class="short" aria-hidden="true">${esc(p.short || p.name)}</span></span>${cells}`;
  }).join('');

  const goals = rows.map(({ plugin: p }) => `${p.goal} in ${p.name}`).join(', ');
  return `<div class="console w-frame"><div class="w-fit">
    <section class="screen" aria-labelledby="board-h">
      <div class="screen-head">
        <h2 id="board-h">${title}</h2>
        <div class="week-nav">
          <button class="icon-btn small" data-action="week" data-step="-1" aria-label="Previous 7 days">${ICONS.left}</button>
          <button class="icon-btn small" data-action="week" data-step="1" aria-label="Next 7 days" ${weekOffset >= 0 ? 'disabled' : ''}>${ICONS.right}</button>
        </div>
      </div>
      ${rows.length ? `<div class="board">
        <span></span>${head}
        ${body}
      </div>` : ''}
      <p class="legend">${goals ? `Full block: ${esc(goals)}.` : 'Add a plugin to the board to fill this in.'} ${nPerfect ? `${nPerfect} perfect day${nPerfect === 1 ? '' : 's'} with every block full.` : rows.length ? 'Fill every block in a column for a perfect day.' : ''}</p>
    </section>
    <div class="bezel-foot"><span class="led${status.lit ? ' lit' : ''}${status.blink ? ' blink' : ''}" aria-hidden="true"></span><span role="status">${esc(status.text)}</span></div>
  </div></div>`;
}

export function helloHTML({ greeting, name, day, items, live, demo, signingIn }) {
  return `<div class="hello w-frame"><div class="w-fit">
    <h1>${esc(greeting)}${name ? `, ${esc(name)}` : ''}</h1>
    <p class="date">${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    ${live && items.length ? `<p class="tally"><b>${items.filter((i) => i.done).length}</b> of <b>${items.length}</b> things done today across your apps.</p>` : ''}
    ${!live ? `<div class="connect">
      <p>Sign in with the Google account you use in RepLog. Lifeboard reads RepLog, its sleep nights and Appearance Lab's copy, and never changes them.</p>
      <div class="btn-row">
        <button class="btn" data-action="sign-in"${signingIn ? ' disabled' : ''}>Sign in with Google</button>
        <button class="btn ghost" data-action="demo">Try it with sample data</button>
      </div>
    </div>` : ''}
    ${demo ? '<div class="btn-row"><button class="btn ghost small" data-action="demo-off">Leave sample data</button></div>' : ''}
  </div></div>`;
}

// ── Floats: photos, text, stickers ──
const COLORS = { ink: 'var(--ink)', ink2: 'var(--ink-2)' };

// `editing`: false, or { selected } while edit mode is on (only the selected float shows handles).
export function floatHTML(id, f, pos, m, board, editing) {
  const left = Math.round(pos.x * m.unitX);
  const top = Math.round(pos.y * m.unitY);
  const width = Math.max(24, Math.round(pos.w * m.unitX));
  const style = `left:${left}px;top:${top}px;width:${width}px;--rot:${f.rot}deg`;
  const sel = editing && editing.selected === id;
  const handles = sel ? floatHandles(id, f) : '';
  const what = { photo: 'Photo', text: 'Text', sticker: 'Sticker' }[f.type];
  const focus = editing ? ` tabindex="0" role="button" aria-label="${what}${sel ? ', selected' : ''}. Enter to ${sel ? 'edit' : 'select'}"` : '';
  if (f.type === 'photo') {
    const a = board.assets[f.asset];
    const ratio = f.frame === 'circle' ? '1 / 1' : `${a.w} / ${a.h}`;
    const src = urlOf(f.asset);
    return `<figure class="float f-photo frame-${f.frame}${sel ? ' sel' : ''}" data-fid="${id}" style="${style}"${focus}>
      <div class="ph" style="aspect-ratio:${ratio}">${src ? `<img src="${src}" alt="${esc(f.caption || 'Photo')}" draggable="false">` : '<span class="ph-wait">Loading photo…</span>'}</div>
      ${f.frame === 'polaroid' ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}${handles}</figure>`;
  }
  if (f.type === 'text') {
    const size = Math.round(f.size * (m.key === 'narrow' ? 0.8 : 1));
    const color = COLORS[f.color] || f.color;
    return `<div class="float f-text ts-${f.style}${f.color === 'ink' ? ' c-ink' : ''}${sel ? ' sel' : ''}" data-fid="${id}"${focus} style="${style};font-family:${family(f.font || board.theme.fonts.body)};font-size:${size}px;color:${color};text-align:${f.align}">
      <div class="t-body">${esc(f.text || ' ')}</div>${handles}</div>`;
  }
  const inner = f.emoji ? `<span class="emoji" style="font-size:${Math.round(width * 0.82)}px">${f.emoji}</span>` : pixelSVG(PIXEL_STICKERS[f.pixel]);
  return `<div class="float f-sticker${sel ? ' sel' : ''}" data-fid="${id}" style="${style}"${focus || ' role="img" aria-label="Sticker"'}>${inner}${handles}</div>`;
}

function floatHandles(id, f) {
  const what = f.type === 'photo' ? 'photo' : f.type === 'text' ? 'text' : 'sticker';
  return `<button class="h-grip" data-drag="move" aria-label="Move ${what} (arrow keys)">${ICONS.grip}</button>
    <button class="h-more" data-action="float-menu" data-id="${id}" aria-label="Edit ${what}">${ICONS.more}</button>
    <span class="h-rotate" data-drag="rotate" aria-hidden="true"></span>
    <span class="h-resize" data-drag="resize" aria-hidden="true"></span>`;
}

export function widgetHandles(id, label) {
  return `<button class="h-grip" data-drag="move" aria-label="Move ${esc(label)} (arrow keys, Shift to resize)">${ICONS.grip}</button>
    <button class="h-more" data-action="widget-menu" data-id="${id}" aria-label="Options for ${esc(label)}">${ICONS.more}</button>
    <span class="h-resize" data-drag="resize" aria-hidden="true"></span>`;
}
