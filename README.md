# Lifeboard

One board for Eliott's life apps. Each app plugs in as a **plugin** (drawn as a cartridge): it reads
that app's data and hands the board a standard result. The board shows the last 7 days as pixel
blocks (one row per plugin, a perfect day when every block in a column is full) and one cartridge per
plugin with its numbers and today's checklist.

v1 plugins: **RepLog** (workouts, bodyweight, habits), **Sleep** (Apple Health nights through RepLog)
and **Appearance Lab** (protocol, check-ins, experiments).

Zero-build static app: ES modules, no dependencies, one CSS file.

## Run

```bash
npm start        # http://localhost:4192, with the production headers (CSP) from vercel.json
npm test         # plugin contract + plugin logic + project rules
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
- **Read-only, always.** Nothing in Lifeboard writes to another app's tables. RepLog syncs
  "newest save wins", so a stray write could wipe real workouts. `npm test` fails on any
  `insert/upsert/update/delete` call under `js/`.
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

1. **Appearance Lab table:** run `supabase/alab-data.sql` in the SQL editor of RepLog's Supabase
   project (`cokgmxsotavbstymslvc`). Until then the Appearance Lab cartridge says so.
2. **Sign-in redirect:** in that project, Authentication → URL Configuration → Redirect URLs, add
   the Lifeboard URL with `/**` (and `http://localhost:4192/**` for local testing). Without it,
   Google sends you back to RepLog's site instead of Lifeboard.
3. Deploy the folder to Vercel (static, no build). `.vercelignore` keeps scripts, SQL and docs off the site.
