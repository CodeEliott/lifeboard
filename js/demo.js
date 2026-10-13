// Sample rows in the same shape the sources return, for "Try it with sample data"
// and for the plugin tests. Seeded, so the same day always gives the same board.
import { addDays, parseDay } from './dates.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const at = (day, h, m = 0) => { const d = parseDay(day); d.setHours(h, m, 0, 0); return d.getTime(); };
const SPLIT = ['Push day', 'Pull day', 'Leg day'];

export function demoReplog(today) {
  const r = rng(Number(today.replaceAll('-', '')));
  const workouts = []; const bodyweight = []; const sleep = []; const habitLog = {};
  let split = 0;
  for (let i = 45; i >= 0; i--) {
    const day = addDays(today, -i);
    const dow = parseDay(day).getDay();
    if ([1, 3, 5, 6].includes(dow) && i !== 0 && r() > 0.15) {
      const sets = (n) => Array.from({ length: n }, () => ({ weight: '60', reps: '8', completed: true, pr: r() > 0.96 ? ['e1rm'] : [] }));
      workouts.push({ id: `w${i}`, name: SPLIT[split++ % 3], startedAt: at(day, 18, 10), endedAt: at(day, 19, 20), exercises: [{ exerciseId: 'a', sets: sets(4) }, { exerciseId: 'b', sets: sets(3) }, { exerciseId: 'c', sets: sets(3 + Math.floor(r() * 3)) }] });
    }
    if (i % 3 === 0) bodyweight.push({ id: `b${i}`, date: day, kg: Math.round((71.6 - i * 0.025 + (r() - 0.5) * 0.4) * 10) / 10 });
    if (i <= 28 && !(i === 9 || i === 10)) {
      const asleep = Math.round(390 + r() * 120);
      sleep.push({ date: day, asleep, inBed: asleep + 25, start: at(addDays(day, -1), 23, Math.floor(r() * 50)), source: 'health' });
    }
    habitLog[day] = ['h-creatine', ...(r() > 0.4 ? ['h-food'] : []), ...(r() > 0.5 ? ['h-sleep'] : [])];
  }
  habitLog[today] = ['h-creatine'];
  return {
    workouts, bodyweight, sleep, habitLog, name: 'Eliott', updatedAt: Date.now() - 40 * 60000,
    settings: { unit: 'kg', bwUnit: 'same', weekStart: 1, sleepGoal: 8, habits: [{ id: 'h-sleep', name: 'Slept 8h' }, { id: 'h-creatine', name: 'Creatine' }, { id: 'h-food', name: 'Ate enough' }] },
  };
}

const PROTOCOL = [
  ['am', 'Face wash, Sébium gel'], ['am', 'Sunscreen SPF 50'], ['day', 'Creatine 5 g'], ['day', '10 min of morning light'],
  ['day', 'Protein at every meal'], ['pm', 'Face wash, Sébium gel'], ['pm', 'Moisturiser'], ['pm', 'Phone out of the bedroom'],
];

export function demoAlab(today) {
  const r = rng(Number(today.replaceAll('-', '')) + 7);
  const days = {};
  for (let i = 40; i >= 0; i--) {
    const day = addDays(today, -i);
    if (r() < 0.1 && i > 0) continue;
    const total = PROTOCOL.length;
    const done = i === 0 ? 3 : Math.min(total, Math.round(total * (0.45 + r() * 0.6)));
    days[day] = { score: Math.round((done / total) * 100) / 100, done, total, energy: 2 + Math.floor(r() * 4), skinRed: Math.max(1, Math.round((3.4 - (40 - i) * 0.035 + (r() - 0.5)) * 10) / 10), focus: Math.round(r() * 8) / 2 };
  }
  return {
    updatedAt: Date.now() - 2 * 3600000,
    summary: {
      v: 1, date: today, savedAt: new Date().toISOString(), days, streak: 6,
      today: PROTOCOL.map(([slot, label], i) => ({ slot, label, done: i < 3 })),
      week: [{ label: 'Train legs once', done: true }],
      experiments: [{ title: 'Niacinamide vs shine', start: addDays(today, -8), days: 28, metric: 'skinOil' }],
    },
  };
}

export const DEMO = { replog: demoReplog, alab: demoAlab };
