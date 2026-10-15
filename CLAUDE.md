# Lifeboard: instructions for Claude Code

Personal dashboard that reads Eliott's other apps through plugins. Static, no build step, ES modules.
README.md has the data flow, the plugin contract and how to add an app; this file is the rules.

## Rules

- **Read-only towards other apps.** Sources only `select`. RepLog syncs "newest save wins", so a
  write from here could wipe real workouts. The only writes are the board's own, in
  `js/board/sync.js` (table `lifeboard_data`) and `js/board/assets.js` (bucket `lifeboard`).
  `npm test` fails on a database or storage write in any other file.
- **The board document is untrusted when read back** (localStorage, cloud). Any new field needs a
  rule in `sanitizeBoard()` (`js/board/model.js`) and a case in `scripts/board-test.js`. Look things
  up by stored name with `own()` / `Object.hasOwn`, never `obj[name]` (`'__proto__'` is truthy).
- **Plugins are pure.** `shape(raw, { today })` in, standard result out. No DOM, no network, no
  `Date.now()`-dependent output beyond `today` (tests pass a fixed day). All drawing is in `main.js`.
- **Raw rows are untrusted input** written by other apps: guard every field (`list()`, `obj()`), and
  every string that reaches HTML goes through `esc()` in `main.js`.
- **CSP** lives in `vercel.json`. No inline JavaScript in HTML (no `onclick=`, no `<script>` body),
  no `<style>` blocks; inline `style=""` is allowed. UI wiring is `data-action="name"` plus an entry in
  `ACTIONS` in `main.js`. A new origin (API, script, font) must be added to the CSP. `npm start`
  serves the same headers locally.
- The supabase-js version is pinned in two places that move together: `SB_SRC` + `SB_SRI` in
  `js/cloud.js` and the `script-src` path in `vercel.json` (keep it equal to RepLog's pin).
- **Adding or renaming a shipped file** means updating `SHELL` in `sw.js`; bump `CACHE`
  (`lifeboard-vN`) in every change to a shipped file. `npm test` checks SHELL against `js/`.
- Color: base colors come from the scheme (`board/theme.js` sets CSS variables on `<html>`); use
  the variables, never literal colors, so every scheme works. Plugin colors are `--c` with
  `--on-c` for text on them (computed for contrast). Never fade a plugin color with opacity.
  New UI must work in light and dark schemes and at 320px wide.
- Widget content adapts to the widget's own width with container queries (`@container`), not
  media queries, because widgets can be any size. Edit-mode drag handles carry `data-drag`.
- CSS class names are global: check a new one is not already used (`.ghost` once collided with
  the outlined `.btn.ghost` buttons).
- Icons are generated: edit `scripts/gen_icons.py`, run `npm run icons`.

## Git and deploy

- Live: https://lifeboard-rho.vercel.app. Public repo `CodeEliott/lifeboard`; every push to `main`
  deploys to production, so never push a half-finished change to `main` (branch, test, then merge).
- After a push, confirm the live site serves the new files (curl the changed file).

## Neighbours

- RepLog: `../workout-tracker` (its Supabase project hosts both v1 sources).
- Appearance Lab: `../appearance-lab`, not a git repo, deployed from its folder. Its `js/cloud.js`
  writes the `alab_data` copy this app reads; the summary format must stay in step with
  `js/plugins/appearance-lab.js` (bump `v` there on breaking changes).

## Verify

- `npm test` and `node --check` on every JS file you touched.
- Visual changes: `npm start` (or the `lifeboard` launch config), check sample data in both themes
  and at 320px, in view mode and edit mode.
