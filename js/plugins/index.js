// The plugin registry. A plugin is one file exporting:
//   { id, name, blurb, color, url, source, goal, shape(raw, { today }) }
// `source` names the fetcher in sources.js; `shape` turns that raw row into the one
// format the board draws (see README.md, "Plugin contract"). Add a plugin = add it here.
import replog from './replog.js';
import sleep from './sleep.js';
import alab from './appearance-lab.js';

export const PLUGINS = [replog, sleep, alab];

// Apps that could plug in next. Shown as empty slots in the plugins sheet.
export const UPCOMING = [
  { name: 'Summer Tracker', blurb: 'Journal, mood and habits from the voice bot' },
  { name: 'Eliott Budget', blurb: 'Spending against the monthly forecast' },
  { name: 'Padelog', blurb: 'Matches, wins and energy' },
];
