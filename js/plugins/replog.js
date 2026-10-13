// RepLog plugin: training and bodyweight, read from RepLog's cloud row (source "replog").
import { addDays, weekStart, dayOf, relDay, ISO_DAY } from '../dates.js';
import { list, obj, round, emptyResult } from './kit.js';

const LB = 2.20462;

export default {
  id: 'replog',
  name: 'RepLog',
  short: 'RepLog',
  blurb: 'Workouts and bodyweight',
  color: '#FFC83D',
  url: 'https://workout-tracker-pi-sand.vercel.app',
  source: 'replog',
  goal: 'a workout',
  shape,
};

export function shape(raw, { today }) {
  if (!raw) return emptyResult('No RepLog data in this account yet. Log a workout in RepLog first.');
  const settings = obj(raw.settings);
  const startDow = Number(settings.weekStart) === 0 ? 0 : 1;
  const workouts = list(raw.workouts)
    .map((w) => {
      const exs = list(w?.exercises);
      return {
        date: dayOf(w?.startedAt),
        name: String(w?.name || 'Workout'),
        sets: exs.reduce((n, x) => n + list(x?.sets).length, 0),
        prs: exs.reduce((n, x) => n + list(x?.sets).filter((s) => list(s?.pr).length).length, 0),
      };
    })
    .filter((w) => w.date && w.date <= today);
  const bw = list(raw.bodyweight)
    .map((b) => ({ date: String(b?.date || ''), kg: Number(b?.kg) }))
    .filter((b) => ISO_DAY.test(b.date) && b.kg > 0 && b.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!workouts.length && !bw.length) return emptyResult('Nothing logged in RepLog yet.', raw.updatedAt);

  // Weeks, oldest first, so sparklines read left to right.
  const thisWeek = weekStart(today, startDow);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, -7 * (7 - i)));
  const inWeek = (w, ws) => w.date >= ws && w.date < addDays(ws, 7);
  const perWeek = weeks.map((ws) => workouts.filter((w) => inWeek(w, ws)));
  const now = perWeek[perWeek.length - 1];

  const last = workouts.reduce((a, w) => (!a || w.date > a.date ? w : a), null);
  const prs30 = workouts.filter((w) => w.date > addDays(today, -30)).reduce((n, w) => n + w.prs, 0);

  const tiles = [
    {
      label: 'Workouts this week',
      value: String(now.length),
      sub: last ? `Last: ${last.name}, ${relDay(last.date, today)}` : 'No workout yet',
      spark: perWeek.map((ws) => ws.length),
    },
    {
      label: 'Sets this week',
      value: String(now.reduce((n, w) => n + w.sets, 0)),
      sub: prs30 ? `${prs30} PR${prs30 === 1 ? '' : 's'} in the last 30 days` : 'No PR in the last 30 days',
      spark: perWeek.map((ws) => ws.reduce((n, w) => n + w.sets, 0)),
    },
  ];

  if (bw.length) {
    const unit = settings.bwUnit === 'kg' || settings.bwUnit === 'lb' ? settings.bwUnit : settings.unit === 'lb' ? 'lb' : 'kg';
    const show = (kg) => (unit === 'lb' ? kg * LB : kg);
    const latest = bw[bw.length - 1];
    // Change over 30 days, or since the first weigh-in when the log is younger than that.
    const monthAgo = [...bw].reverse().find((b) => b.date <= addDays(today, -30));
    const before = monthAgo || bw[0];
    const diff = round(show(latest.kg) - show(before.kg), 1);
    const change = `${diff > 0 ? '+' : ''}${diff} ${unit} ${monthAgo ? 'in 30 days' : 'since your first weigh-in'}`;
    tiles.push({
      label: 'Bodyweight',
      value: String(round(show(latest.kg), 1)),
      unit,
      sub: before === latest ? `Weighed ${relDay(latest.date, today)}` : change,
      spark: bw.slice(-12).map((b) => show(b.kg)),
      sparkFloor: true,
    });
  }

  const days = {};
  for (const w of workouts) {
    const d = days[w.date] || (days[w.date] = { score: 1, names: [], sets: 0 });
    d.names.push(w.name); d.sets += w.sets;
  }
  for (const d of Object.values(days)) { d.note = `${d.names.join(' + ')}, ${d.sets} sets`; delete d.names; delete d.sets; }

  const habitsDone = new Set(list(obj(raw.habitLog)[today]));
  const todayItems = [
    { label: 'Workout logged', done: !!days[today] },
    ...list(settings.habits).filter((h) => h && h.id && h.name).map((h) => ({ label: String(h.name), done: habitsDone.has(h.id) })),
  ];

  return { updatedAt: raw.updatedAt ?? null, tiles, today: todayItems, days };
}
