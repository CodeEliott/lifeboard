# Lifeboard: instructions for Claude Code

Personal dashboard that reads Eliott's other apps through plugins. Static, no build step, ES modules.
README.md has the data flow, the plugin contract and how to add an app; this file is the rules.

## Rules

- **Read-only.** Lifeboard never writes to another app's data. Sources only `select`. RepLog syncs
  "newest save wins", so a write from here could wipe real workouts. `npm test` enforces it.
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
- Color: the console stays neutral grey; color only comes from plugins (`--c`). Text on a plugin
  color is always `var(--on-fill)`. Never fade a plugin color with opacity. New UI must work in light
  and dark (CSS variables only) and at 320px wide.
- Icons are generated: edit `scripts/gen_icons.py`, run `npm run icons`.

## Neighbours

- RepLog: `../workout-tracker` (its Supabase project hosts both v1 sources).
- Appearance Lab: `../appearance-lab`, not a git repo, deployed from its folder. Its `js/cloud.js`
  writes the `alab_data` copy this app reads; the summary format must stay in step with
  `js/plugins/appearance-lab.js` (bump `v` there on breaking changes).

## Verify

- `npm test` and `node --check` on every JS file you touched.
- Visual changes: `npm start` (or the `lifeboard` launch config), check sample data in both themes
  and at 320px.
