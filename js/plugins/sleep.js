// Sleep plugin: Apple Health nights that RepLog imports through its iOS Shortcut.
// Same source row as the RepLog plugin; it only looks at the sleep part.
import { addDays, daysBetween, fmtDay, ISO_DAY } from '../dates.js';
import { list, obj, avg, round, fmtDur, emptyResult } from './kit.js';

export default {
  id: 'sleep',
  name: 'Sleep',
  short: 'Sleep',
  blurb: 'Apple Health nights, through RepLog',
  color: '#A99BFF',
  url: 'https://workout-tracker-pi-sand.vercel.app',
  source: 'replog',
  goal: 'your sleep goal met',
  shape,
};

// Clock time of a bedtime as minutes after noon, so 23:30 and 00:30 average to midnight.
function bedMinutes(start) {
  const n = Number(start);
  const d = new Date(Number.isFinite(n) && n > 0 ? n : Date.parse(start));
  if (Number.isNaN(d.getTime())) return null;
  return (d.getHours() * 60 + d.getMinutes() + 12 * 60) % (24 * 60);
}
function fmtClock(afterNoon) {
  const m = Math.round(afterNoon + 12 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function shape(raw, { today }) {
  if (!raw) return emptyResult('No RepLog data in this account yet.');
  const goalH = Math.min(12, Math.max(4, Number(obj(raw.settings).sleepGoal) || 8));
  const goalMin = goalH * 60;

  // One night per morning; RepLog's own rule: time asleep, else time in bed.
  const byDate = new Map();
  for (const n of list(raw.sleep)) {
    if (!n || !ISO_DAY.test(n.date) || n.date > today) continue;
    const min = Number(n.asleep) > 0 ? Number(n.asleep) : Number(n.inBed) || 0;
    if (min > 0) byDate.set(n.date, { date: n.date, min, bed: bedMinutes(n.start) });
  }
  if (!byDate.size) return emptyResult('No nights yet. Connect Apple Health in RepLog (Sleep card) to send them.', raw.updatedAt);

  const latest = [...byDate.keys()].sort().pop();
  const lastNight = byDate.get(today);
  const week = Array.from({ length: 7 }, (_, i) => byDate.get(addDays(today, -i))).filter(Boolean);
  const fortnight = Array.from({ length: 14 }, (_, i) => byDate.get(addDays(today, i - 13)));

  const tiles = [];
  if (lastNight) {
    const gap = Math.round(lastNight.min - goalMin);
    tiles.push({
      label: 'Last night',
      value: fmtDur(lastNight.min),
      sub: gap >= 0 ? `Goal of ${goalH} h met` : `${fmtDur(-gap)} under your ${goalH} h goal`,
      spark: fortnight.map((n) => (n ? round(n.min / 60, 1) : 0)),
    });
  } else {
    tiles.push({
      label: 'Last night',
      value: '-',
      sub: 'Not synced yet',
      spark: fortnight.map((n) => (n ? round(n.min / 60, 1) : 0)),
    });
  }
  if (week.length) {
    tiles.push({
      label: '7-night average',
      value: fmtDur(avg(week.map((n) => n.min))),
      sub: `${week.length} of 7 nights synced`,
    });
  }
  const beds = week.map((n) => n.bed).filter((b) => b !== null);
  if (beds.length >= 2) {
    const mean = avg(beds);
    const spread = Math.round(avg(beds.map((b) => Math.abs(b - mean))));
    tiles.push({ label: 'Usual bedtime', value: fmtClock(mean), sub: spread <= 20 ? 'Steady this week' : `Varies by about ${spread} min` });
  }

  const days = {};
  for (const n of byDate.values()) days[n.date] = { score: round(Math.min(1, n.min / goalMin), 2), note: `${fmtDur(n.min)} asleep` };

  const stale = daysBetween(latest, today) >= 2;
  return {
    updatedAt: raw.updatedAt ?? null,
    hint: stale ? `Last night synced: ${fmtDay(latest)}. Run the RepLog Sleep shortcut on your iPhone to catch up.` : null,
    tiles,
    today: [{ label: `Slept ${goalH} h`, done: !!lastNight && lastNight.min >= goalMin }],
    days,
  };
}
