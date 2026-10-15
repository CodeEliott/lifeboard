// Plugin and project checks. Run with `npm test`.
// Plugins are pure (raw row in, result out), so they are tested here without a browser.
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGINS } from '../js/plugins/index.js';
import { SOURCES } from '../js/sources.js';
import { DEMO } from '../js/demo.js';
import { addDays, parseDay } from '../js/dates.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failed = 0; let passed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; return; }
  failed++; console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TODAY = '2026-10-14'; // a Wednesday
const at = (day, h = 18) => { const d = parseDay(day); d.setHours(h); return d.getTime(); };
const byId = Object.fromEntries(PLUGINS.map((p) => [p.id, p]));
const tile = (res, label) => res.tiles.find((t) => t.label === label);

// Every result must have the shape the board draws.
function validResult(name, r) {
  check(`${name}: tiles is an array`, Array.isArray(r.tiles));
  check(`${name}: today is an array`, Array.isArray(r.today));
  check(`${name}: days is an object`, r.days && typeof r.days === 'object');
  for (const t of r.tiles || []) {
    check(`${name}: tile has label and string value`, typeof t.label === 'string' && typeof t.value === 'string', JSON.stringify(t));
    if (t.spark) check(`${name}: spark is numbers`, t.spark.every((v) => Number.isFinite(v)), t.label);
  }
  for (const i of r.today || []) check(`${name}: today item`, typeof i.label === 'string' && typeof i.done === 'boolean', JSON.stringify(i));
  for (const [d, v] of Object.entries(r.days || {})) {
    check(`${name}: day key is a date`, ISO.test(d), d);
    check(`${name}: score in 0..1`, v.score >= 0 && v.score <= 1, `${d} ${v.score}`);
    check(`${name}: no future day`, d <= TODAY, d);
  }
}

// ── Contract ──
check('plugin ids are unique', new Set(PLUGINS.map((p) => p.id)).size === PLUGINS.length);
for (const p of PLUGINS) {
  for (const k of ['id', 'name', 'short', 'blurb', 'goal', 'url', 'source']) check(`${p.id}: has ${k}`, typeof p[k] === 'string' && p[k].length > 0);
  check(`${p.id}: color is #rrggbb`, /^#[0-9a-f]{6}$/i.test(p.color));
  check(`${p.id}: url is https`, p.url.startsWith('https://'));
  check(`${p.id}: shape is a function`, typeof p.shape === 'function');
  check(`${p.id}: source exists`, !!SOURCES[p.source] && typeof SOURCES[p.source].fetch === 'function');
  check(`${p.id}: source has demo data`, typeof DEMO[p.source] === 'function');
}

// ── Every plugin survives demo, empty and junk input ──
for (const p of PLUGINS) {
  const demo = p.shape(DEMO[p.source](TODAY), { today: TODAY });
  validResult(`${p.id} demo`, demo);
  check(`${p.id} demo: has tiles`, demo.tiles.length > 0);
  const empty = p.shape(null, { today: TODAY });
  validResult(`${p.id} null`, empty);
  check(`${p.id} null: says why it is empty`, empty.empty === true && typeof empty.hint === 'string');
  for (const junk of [{}, { workouts: 'x', sleep: [null, 3, 'a'], settings: 5, habitLog: [], summary: 'x' }, { summary: { date: TODAY, days: { bad: 1, [TODAY]: null }, today: [null, { label: 'x' }] } }]) {
    try { validResult(`${p.id} junk`, p.shape(junk, { today: TODAY })); }
    catch (err) { check(`${p.id} junk does not throw`, false, err.message); }
  }
}

// ── RepLog ──
{
  const raw = {
    settings: { unit: 'kg', weekStart: 1, habits: [{ id: 'h1', name: 'Creatine' }] },
    habitLog: { [TODAY]: ['h1'] },
    workouts: [
      { name: 'Push', startedAt: at('2026-10-12'), exercises: [{ sets: [{ pr: ['e1rm'] }, {}, {}] }] }, // Monday
      { name: 'Pull', startedAt: at(TODAY), exercises: [{ sets: [{}, {}] }] },
      { name: 'Legs', startedAt: at('2026-10-11'), exercises: [{ sets: [{}] }] }, // last Sunday: previous week
    ],
    bodyweight: [{ date: '2026-09-01', kg: 70 }, { date: '2026-10-13', kg: 71.5 }],
  };
  const r = byId.replog.shape(raw, { today: TODAY });
  check('replog: workouts this week', tile(r, 'Workouts this week')?.value === '2', tile(r, 'Workouts this week')?.value);
  check('replog: sets this week', tile(r, 'Sets this week')?.value === '5');
  check('replog: counts PRs', /1 PR/.test(tile(r, 'Sets this week')?.sub));
  check('replog: bodyweight', tile(r, 'Bodyweight')?.value === '71.5' && tile(r, 'Bodyweight')?.unit === 'kg');
  check('replog: weight change over 30 days', tile(r, 'Bodyweight')?.sub === '+1.5 kg in 30 days', tile(r, 'Bodyweight')?.sub);
  check('replog: trained today is full', r.days[TODAY]?.score === 1);
  check('replog: today list has workout + habit', r.today.length === 2 && r.today.every((i) => i.done));
  const sunday = byId.replog.shape({ ...raw, settings: { ...raw.settings, weekStart: 0 } }, { today: TODAY });
  check('replog: Sunday weeks include Sunday', tile(sunday, 'Workouts this week')?.value === '3');
  const lb = byId.replog.shape({ ...raw, settings: { unit: 'lb' } }, { today: TODAY });
  check('replog: pounds', tile(lb, 'Bodyweight')?.value === '157.6' && tile(lb, 'Bodyweight')?.unit === 'lb', tile(lb, 'Bodyweight')?.value);
  const future = byId.replog.shape({ workouts: [{ name: 'X', startedAt: at(addDays(TODAY, 2)), exercises: [] }] }, { today: TODAY });
  check('replog: ignores future workouts', future.empty === true);
}

// ── Sleep ──
{
  const night = (date, asleep) => ({ date, asleep, inBed: asleep + 20, start: at(addDays(date, -1), 23) });
  const r = byId.sleep.shape({ settings: { sleepGoal: 8 }, sleep: [night(TODAY, 490), night(addDays(TODAY, -1), 400)] }, { today: TODAY });
  check('sleep: last night', tile(r, 'Last night')?.value === '8h10');
  check('sleep: goal met', r.today[0]?.done === true && tile(r, 'Last night').sub === 'Goal of 8 h met');
  check('sleep: score capped at 1', r.days[TODAY].score === 1);
  check('sleep: short night scores below 1', r.days[addDays(TODAY, -1)].score < 1);
  check('sleep: usual bedtime', tile(r, 'Usual bedtime')?.value === '23:00', tile(r, 'Usual bedtime')?.value);
  check('sleep: no stale hint when fresh', !r.hint);
  const stale = byId.sleep.shape({ sleep: [night(addDays(TODAY, -3), 420)] }, { today: TODAY });
  check('sleep: stale hint names the shortcut', /shortcut/i.test(stale.hint || ''));
  check('sleep: last night unknown', tile(stale, 'Last night')?.value === '-');
  const inBedOnly = byId.sleep.shape({ sleep: [{ date: TODAY, asleep: 0, inBed: 450 }] }, { today: TODAY });
  check('sleep: falls back to time in bed', tile(inBedOnly, 'Last night')?.value === '7h30');
}

// ── Appearance Lab ──
{
  const summary = (date, extra = {}) => ({ summary: { v: 1, date, streak: 4, days: { [date]: { score: 0.5, done: 2, total: 4, skinRed: 2 } }, today: [{ label: 'Wash', done: true }, { label: 'SPF', done: false }], ...extra } });
  const fresh = byId.alab.shape(summary(TODAY), { today: TODAY });
  check('alab: protocol today', tile(fresh, 'Protocol today')?.value === '1/2');
  check('alab: today items when fresh', fresh.today.length === 2);
  check('alab: streak', tile(fresh, 'Streak')?.value === '4');
  const yday = byId.alab.shape(summary(addDays(TODAY, -1)), { today: TODAY });
  check('alab: yesterday copy has no today items', yday.today.length === 0 && /Open Appearance Lab/.test(yday.hint));
  check('alab: yesterday copy keeps the streak', tile(yday, 'Streak')?.value === '4');
  const old = byId.alab.shape(summary(addDays(TODAY, -3)), { today: TODAY });
  check('alab: old copy resets the streak', tile(old, 'Streak')?.value === '0');
  const missing = byId.alab.shape({ missingTable: true }, { today: TODAY });
  check('alab: missing table explains the fix', /alab-data\.sql/.test(missing.hint || ''));
  const exp = byId.alab.shape(summary(TODAY, { experiments: [{ title: 'Niacinamide', start: addDays(TODAY, -2), days: 14 }] }), { today: TODAY });
  check('alab: running experiment', tile(exp, 'Experiment')?.value === '3/14');
}

// ── Project rules ──
{
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  check('index.html: no inline script bodies', !/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html));
  check('index.html: no inline event handlers', !/\son[a-z]+\s*=/i.test(html));
  check('index.html: no <style> blocks', !/<style[\s>]/i.test(html));

  const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const shell = [...sw.matchAll(/'([^']+\.(?:js|css|html|svg|png|webmanifest))'/g)].map((m) => m[1]);
  for (const f of shell) {
    try { await access(join(ROOT, f)); } catch { check(`sw.js SHELL file exists: ${f}`, false); }
  }
  const walk = async (dir) => (await Promise.all((await readdir(join(ROOT, dir), { withFileTypes: true }))
    .map((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])))).flat();
  for (const f of await walk('js')) check(`sw.js SHELL lists ${f}`, shell.includes(f));

  const csp = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8')).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  const cloud = await readFile(join(ROOT, 'js/cloud.js'), 'utf8');
  const sbUrl = cloud.match(/SUPABASE_URL = '([^']+)'/)[1];
  const sbSrc = cloud.match(/SB_SRC = '([^']+)'/)[1];
  check('CSP connect-src allows the Supabase project', csp.includes(sbUrl));
  check('CSP script-src allows the pinned supabase-js path', csp.includes(sbSrc.slice(0, sbSrc.indexOf('/dist/') + 1)));

  // Read-only towards other apps: only the board's own sync code writes, and only to its own
  // table (lifeboard_data) and bucket (lifeboard).
  const WRITERS = ['js/board/sync.js', 'js/board/assets.js'];
  for (const f of await walk('js')) {
    const src = await readFile(join(ROOT, f), 'utf8');
    // Database and storage writes only (not Map.delete or classList.remove).
    const writes = /\.(insert|upsert|update|upload)\(/.test(src) || /\.storage\b/.test(src) || /\.from\([^)]*\)[\s\S]{0,80}?\.(delete|remove)\(/.test(src);
    if (!WRITERS.includes(f)) check(`${f} never writes`, !writes);
  }
  const sync = await readFile(join(ROOT, 'js/board/sync.js'), 'utf8');
  const assets = await readFile(join(ROOT, 'js/board/assets.js'), 'utf8');
  check('sync.js only writes lifeboard_data', [...sync.matchAll(/\.from\('([^']+)'\)/g)].every((m) => m[1] === 'lifeboard_data'));
  check('assets.js only uses the lifeboard bucket', /const BUCKET = 'lifeboard';/.test(assets) && !/\.from\('(?!lifeboard)/.test(assets.replace(/storage\.from\(BUCKET\)/g, '')));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
