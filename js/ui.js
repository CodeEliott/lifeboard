// Shared UI pieces: escaping, bottom sheets, toasts, icons, and the app context.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The running app, shared between main.js and edit.js. main.js fills in the functions.
export const app = {
  board: null,     // the board document (board/model.js)
  editing: false,  // edit mode: things can be moved, resized and styled
  key: 'wide',     // which layout is on screen: 'wide' (Mac) or 'narrow' (phone)
  m: null,         // grid metrics for the current width (board/layout.js)
  render: () => {},
  commit: () => {}, // save the board after a change (local + cloud)
};

const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toast-root');
let lastFocus = null;
let onClose = null;

export function openSheet(html, opts = {}) {
  if (!sheetRoot.innerHTML) lastFocus = document.activeElement;
  onClose = opts.onClose || null;
  sheetRoot.innerHTML = `<div class="scrim" data-action="close-sheet"></div>
    <div class="sheet${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button class="icon-btn sheet-close" data-action="close-sheet" aria-label="Close">${ICONS.close}</button>
      ${html}
    </div>`;
  document.body.classList.add('sheet-open');
  if (!opts.keepFocus) sheetRoot.querySelector('.sheet-close').focus();
}
export function closeSheet() {
  if (!sheetRoot.innerHTML) return;
  sheetRoot.innerHTML = '';
  document.body.classList.remove('sheet-open');
  const fn = onClose; onClose = null;
  fn?.();
  lastFocus?.focus?.();
}
export const sheetOpen = () => !!sheetRoot.innerHTML;
export const sheetEl = () => sheetRoot;

export function toast(msg, tone = '') {
  const t = Object.assign(document.createElement('div'), { className: `toast ${tone}`, textContent: msg });
  toastRoot.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3300);
}

const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" aria-hidden="true"${extra}><path d="${d}"/></svg>`;
export const ICONS = {
  left: svg('M10 3 5 8l5 5'),
  right: svg('m6 3 5 5-5 5'),
  up: svg('m3 10 5-5 5 5'),
  down: svg('m3 6 5 5 5-5'),
  sync: svg('M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3'),
  menu: svg('M2.5 3.5h11M2.5 8h11M2.5 12.5h11'),
  close: svg('m4 4 8 8M12 4l-8 8'),
  edit: svg('M10.5 2.5l3 3-8 8h-3v-3zM9 4l3 3'),
  plus: svg('M8 2.5v11M2.5 8h11'),
  undo: svg('M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8h-2'),
  look: svg('M8 2a6 6 0 1 0 0 12c1 0 1.5-.7 1.2-1.6-.4-1 .3-1.9 1.3-1.9H12a2 2 0 0 0 2-2A6 6 0 0 0 8 2zM5 7.5h.01M8 5h.01M11 7.5h.01'),
  image: svg('M2.5 3.5h11v9h-11zM2.5 10.5l3.5-3 3 2.5 2-1.5 2.5 2M10.5 6h.01'),
  grip: svg('M6 3.5h.01M10 3.5h.01M6 8h.01M10 8h.01M6 12.5h.01M10 12.5h.01', ' class="dots"'),
  more: svg('M3.5 8h.01M8 8h.01M12.5 8h.01', ' class="dots"'),
  check: svg('m3 8.5 3 3 7-7'),
};
