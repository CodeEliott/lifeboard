# Lifeboard

One board for Eliott's life apps, arranged like a mood board. Each app plugs in as a **plugin**
(drawn as a cartridge): it reads that app's data and hands the board a standard result. The week
board shows the last 7 days as pixel blocks (one row per plugin, a perfect day when every block in a
column is full), and each cartridge shows its numbers and today's checklist.

Everything is movable: widgets snap to a grid, and photos, text and stickers float freely on top.
The look (color scheme, fonts, uploaded fonts, wallpaper, plugin colors) is yours to change.

v1 plugins: **RepLog** (workouts, bodyweight, habits), **Sleep** (Apple Health nights through RepLog)
and **Appearance Lab** (protocol, check-ins, experiments).

Zero-build static app: ES modules, no dependencies, one CSS file.

**Live:** https://lifeboard-rho.vercel.app (every push to `main` deploys to production).

## Run

```bash
npm start        # http://localhost:4192, with the production headers (CSP) from vercel.json
npm test         # plugin tests + project rules, then board engine tests (layout, sanitizer, contrast)
npm run icons    # regenerate icons/ from scripts/gen_icons.py
```

"Try it with sample data" on the sign-in screen fills the board from `js/demo.js`, no account needed.

## How data flows

```
RepLog (Supabase user_data) ──┐                         ┌─ plugins/replog.js ─┐
                              ├─ sources.js (reads) ────┤                     ├─ main.js draws the board
Appearance Lab (alab_data) ───┘                         ├─ plugins/sleep.js ──┤
                                                        └─ plugins/appearance-lab.js
```

- **Sources** (`js/sources.js`) fetch one raw row per app for the signed-in user. Several plugins can
  share a source (RepLog and Sleep both read the RepLog row, fetched once).
- **Plugins** (`js/plugins/*.js`) are pure: `shape(raw, { today })` returns the result below. They
  never touch the DOM or the network, so they are tested in Node.
- **Read-only towards other apps, always.** Nothing in Lifeboard writes to another app's tables.
  RepLog syncs "newest save wins", so a stray write could wipe real workouts. The only writes are
  the board's own (next section), and `npm test` fails on a database or storage write anywhere else.

## The board

```
board document (js/board/model.js) ── localStorage `lifeboard.board` ── lifeboard_data (Supabase, own row)
  widgets: hello, week, one per plugin   files: IndexedDB `lifeboard-files` ── `lifeboard` bucket (private)
  floats: photos, text, stickers
  layouts: wide (12 cols) / narrow (4 cols), each its own arrangement
  theme, wallpaper, assets
```

- **Grid widgets** (`board/layout.js`): `{ x, y, w, h }` in grid units, packed with gravity so nothing
  overlaps; the dragged widget keeps its spot and the others make room. `auto` widgets are measured
  after each render and take exactly the rows their content needs, until you resize them.
- **Floats** sit on top (or behind, per item) at fractional grid units, so they follow the grid when
  the window resizes. Something added on the Mac waits below the widgets on the phone (`y: null`)
  until you place it there, and the other way round.
- **Edit mode** (`board/edit.js`): drag, resize, rotate, a menu per item, Add / Look / Wallpaper,
  Undo (one step per drag or per open menu). On touch screens only the grip handle drags, so the
  page still scrolls. Tap a float to select it; tap it again for its menu.
- **Look** (`board/theme.js`, `board/catalog.js`): a scheme gives base colors and the rest is derived,
  with muted text pushed to 4.5:1. Fonts are Google Fonts by name (`g:Name`) or uploaded files
  (`u:fileId`, loaded with the FontFace API). Photos are shrunk to 1600 px before saving.
- **Sync** (`board/sync.js`, `board/assets.js`): newest save wins between devices. Files upload
  first, then the board row. Files nothing uses any more are deleted when you leave edit mode.
- **Everything read back goes through `sanitizeBoard()`**: font names, colors and ids end up in CSS
  and HTML, so they are checked against strict patterns, and name lookups use `Object.hasOwn`.
- The last rows are cached in `localStorage` (`lifeboard.cache`), so the board draws instantly and
  offline. Preferences (order, on/off, theme, sample mode) live in `lifeboard.v1`.

Both v1 sources live in RepLog's Supabase project, so one Google sign-in covers every plugin.

## Plugin contract

```js
export default {
  id: 'replog',            // unique
  name: 'RepLog',          // cartridge title
  short: 'RepLog',         // board row label on phones
  blurb: 'Workouts and bodyweight',
  color: '#FFC83D',        // bright fill; text on it is always --on-fill (dark ink)
  url: 'https://…',        // "Open …" link
  source: 'replog',        // key in SOURCES
  goal: 'a workout',       // what a full block means, for the board legend
  shape,                   // (raw, { today }) => result
};

// result
{
  updatedAt: 1760000000000 | null,      // when the source app last saved
  empty?: true, hint?: 'text',          // nothing to show yet, and what to do about it
  tiles: [{ label, value: '3', unit?: 'kg', sub?: 'text', spark?: [numbers], sparkFloor?: true }],
  today: [{ label, done: true }],       // read-only checklist for today
  days: { 'YYYY-MM-DD': { score: 0..1, note?: 'text' } },  // fills the week board
}
```

`raw` comes from another app, so plugins treat every field as possibly missing or the wrong type
(`list()`, `obj()` in `plugins/kit.js`). `shape(null)` must return an empty result with a hint.
A plugin that throws is shown as broken; the rest of the board still draws.

## Add an app

1. Make its data readable: a table the signed-in user can `select` (Row Level Security on).
   If it lives in another Supabase project, Lifeboard needs a second client and sign-in in `cloud.js`.
2. Add a source in `js/sources.js` (a read) and sample rows in `js/demo.js`.
3. Add `js/plugins/<app>.js` and register it in `js/plugins/index.js` (remove it from `UPCOMING`).
4. Add the file to `SHELL` in `sw.js`, bump `CACHE`, and add any new origin to the CSP in `vercel.json`.
5. Extend `scripts/plugin-test.js` and run `npm test`.

Existing users get new plugins appended to their board, switched on.

## Setup (once)

1. **Tables:** run `supabase/alab-data.sql` (Appearance Lab's copy) and `supabase/lifeboard-data.sql`
   (the board and its private file bucket) in the SQL editor of RepLog's Supabase project
   (`cokgmxsotavbstymslvc`). Until then the board still works, saved in the browser only.
2. **Sign-in redirect:** in that project, Authentication → URL Configuration → Redirect URLs, add
   `https://lifeboard-rho.vercel.app/**` (and `http://localhost:4192/**` for local testing). Without
   it, Google sends you back to RepLog's site instead of Lifeboard.
3. Deploys: Vercel project `lifeboard` (team high-byte-s-projects) is connected to this GitHub repo,
   static, no build. `.vercelignore` keeps scripts, SQL and docs off the site.
