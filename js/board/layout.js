// Grid maths for the board. Pure functions, tested in scripts/board-test.js.
// Grid items: { id, x, y, w, h } in grid units (x and w in columns, y and h in rows).
// Floats (photos, text, stickers) use the same units but fractional, and never take part in packing.

// Each screen size keeps its own arrangement: 12 columns on a Mac, 4 on a phone.
export const GRIDS = {
  wide: { cols: 12, rowH: 6, gap: 14 },
  narrow: { cols: 4, rowH: 6, gap: 10 },
};
export const layoutKey = (width) => (width < 700 ? 'narrow' : 'wide');

export function metrics(width, key) {
  const g = GRIDS[key];
  const colW = Math.max(10, (width - (g.cols - 1) * g.gap) / g.cols);
  return { ...g, key, width, colW, unitX: colW + g.gap, unitY: g.rowH + g.gap };
}

export function toPx(item, m) {
  return {
    left: Math.round(item.x * m.unitX),
    top: Math.round(item.y * m.unitY),
    width: Math.round(item.w * m.unitX - m.gap),
    height: Math.round(item.h * m.unitY - m.gap),
  };
}

// Rows needed to show `px` of content.
export const rowsFor = (px, m) => Math.max(2, Math.ceil((px + m.gap) / m.unitY));

export function clampItem(it, cols) {
  const w = Math.max(1, Math.min(cols, Math.round(Number(it.w) || 1)));
  return {
    ...it,
    w,
    h: Math.max(2, Math.min(200, Math.round(Number(it.h) || 2))),
    x: Math.max(0, Math.min(cols - w, Math.round(Number(it.x) || 0))),
    y: Math.max(0, Math.min(1000, Math.round(Number(it.y) || 0))),
  };
}

export const collides = (a, b) => a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Gravity packing: every item rises as high as it can, and is pushed below anything it would
// overlap. `fixedId` (the item being dragged) keeps its spot and the others make room for it.
export function compact(items, cols, fixedId = null) {
  const all = items.map((it) => clampItem(it, cols));
  const fixed = all.find((it) => it.id === fixedId);
  const placed = fixed ? [fixed] : [];
  const rest = all.filter((it) => it !== fixed).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of rest) {
    const at = { ...it };
    while (at.y > 0 && !placed.some((p) => collides({ ...at, y: at.y - 1 }, p))) at.y--;
    while (placed.some((p) => collides(at, p))) at.y++;
    placed.push(at);
  }
  // Keep the caller's order so ids map back predictably.
  return all.map((it) => placed.find((p) => p.id === it.id));
}

export const bottom = (items) => items.reduce((n, it) => Math.max(n, it.y + it.h), 0);

// Top-most, then left-most spot where a w x h item fits.
export function firstFit(items, cols, w, h) {
  const width = Math.min(w, cols);
  for (let y = 0; y < 2000; y++) {
    for (let x = 0; x <= cols - width; x++) {
      const probe = { id: '\u0000', x, y, w: width, h };
      if (!items.some((it) => collides(probe, it))) return { x, y, w: width, h };
    }
  }
  return { x: 0, y: bottom(items), w: width, h };
}

// Grid position nearest to a pixel offset.
export function snap(left, top, m) {
  return { x: Math.round(left / m.unitX), y: Math.round(top / m.unitY) };
}
export function snapSize(width, height, m) {
  return { w: Math.round((width + m.gap) / m.unitX), h: Math.round((height + m.gap) / m.unitY) };
}
