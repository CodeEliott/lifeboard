// Appearance Lab plugin. The lab keeps its data in the browser, so it uploads a copy plus a
// pre-computed summary to `alab_data` (source "alab"). The lab does its own maths; this
// plugin only reads the summary. Summary format: buildSummary() in appearance-lab/js/cloud.js.
import { addDays, weekStart, daysBetween, fmtDay, ISO_DAY } from '../dates.js';
import { list, obj, avg, round, clamp01, emptyResult } from './kit.js';

export default {
  id: 'alab',
  name: 'Appearance Lab',
  short: 'Lab',
  blurb: 'Skin routine, protocol and check-ins',
  color: '#6EA6FF',
  url: 'https://appearance-lab.vercel.app',
  source: 'alab',
  goal: 'the whole protocol done',
  shape,
};

export function shape(raw, { today }) {
  if (raw?.missingTable) return emptyResult('The cloud copy is not set up yet. Run supabase/alab-data.sql once in the SQL editor of RepLog\'s Supabase project.');
  const s = obj(raw?.summary);
  const logs = obj(s.days);
  if (!raw || !ISO_DAY.test(s.date || '')) return emptyResult('No copy yet. Open Appearance Lab while RepLog is connected in its profile, and it sends one.');

  const fresh = s.date === today;
  const days = {};
  const num = (d, k) => { const v = obj(logs[d])[k]; return v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v); };
  for (const [d, row] of Object.entries(logs)) {
    if (!ISO_DAY.test(d) || d > today) continue;
    const r = obj(row);
    days[d] = { score: clamp01(r.score), note: Number(r.total) ? `${Number(r.done) || 0} of ${Number(r.total)} protocol steps` : 'Check-in only' };
  }

  // Morning and evening often share a step ("Face wash"); name the slot when a label repeats.
  const rawItems = fresh ? list(s.today).filter((i) => i && i.label) : [];
  const repeats = (label) => rawItems.filter((i) => String(i.label) === label).length > 1;
  const SLOT = { am: 'morning', pm: 'evening' };
  const items = rawItems.map((i) => {
    const label = String(i.label);
    return { label: repeats(label) && SLOT[i.slot] ? `${label} (${SLOT[i.slot]})` : label, done: !!i.done };
  });
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const tiles = [{
    label: 'Protocol today',
    value: fresh ? `${items.filter((i) => i.done).length}/${items.length}` : '-',
    sub: fresh ? (items.length && items.every((i) => i.done) ? 'All done' : 'Tick steps in the lab') : 'Not opened today',
    spark: last14.map((d) => Math.round((days[d]?.score || 0) * 100)),
  }];

  // The lab's streak was counted on the day of the copy; it only still holds if that was today or yesterday.
  const streak = daysBetween(s.date, today) <= 1 ? Math.max(0, Number(s.streak) || 0) : 0;
  tiles.push({ label: 'Streak', value: String(streak), unit: streak === 1 ? 'day' : 'days', sub: 'Days at half the protocol or more' });

  const red = (from, n) => avg(Array.from({ length: n }, (_, i) => num(addDays(from, i), 'skinRed')).filter((v) => v !== null));
  const thisRed = red(addDays(today, -6), 7);
  if (thisRed !== null) {
    const prevRed = red(addDays(today, -13), 7);
    const diff = prevRed === null ? null : round(thisRed - prevRed, 1);
    tiles.push({
      label: 'Skin redness',
      value: String(round(thisRed, 1)),
      unit: '/5',
      sub: diff === null ? '7-day average' : diff === 0 ? 'Same as the week before' : `${diff < 0 ? 'Down' : 'Up'} ${Math.abs(diff)} on the week before`,
      spark: last14.map((d) => num(d, 'skinRed') ?? 0),
    });
  }

  const ws = weekStart(today);
  const focus = Array.from({ length: daysBetween(ws, today) + 1 }, (_, i) => num(addDays(ws, i), 'focus') ?? 0).reduce((a, b) => a + b, 0);
  if (Object.keys(logs).some((d) => num(d, 'focus') !== null)) {
    tiles.push({ label: 'Deep work this week', value: String(round(focus, 1)), unit: 'h', spark: last14.map((d) => num(d, 'focus') ?? 0) });
  }

  const running = list(s.experiments).find((x) => x && ISO_DAY.test(x.start || '') && x.start <= today && daysBetween(x.start, today) < (Number(x.days) || 0));
  if (running) tiles.push({ label: 'Experiment', value: `${daysBetween(running.start, today) + 1}/${Number(running.days)}`, sub: String(running.title || 'Running') });

  return {
    updatedAt: raw.updatedAt ?? null,
    hint: fresh ? null : `Last copy from ${fmtDay(s.date)}. Open Appearance Lab to start today.`,
    tiles,
    today: items,
    days,
  };
}
