// Where plugin data comes from. A source fetches one raw row for the signed-in user;
// several plugins can share it (RepLog and Sleep both read the RepLog row).
// Every query here is a read. Lifeboard never writes to another app's tables:
// RepLog syncs "newest save wins", so a stray write could wipe real workouts.

// PostgREST answers these when a table does not exist yet.
const MISSING_TABLE = new Set(['PGRST205', '42P01']);

export const SOURCES = {
  replog: {
    name: 'RepLog',
    // Only the parts of RepLog's state the plugins read: no coach chat, routines or photo.
    async fetch(sb, uid) {
      const { data, error } = await sb.from('user_data').select([
        'workouts:data->workouts', 'bodyweight:data->bodyweight', 'sleep:data->sleep', 'habitLog:data->habitLog',
        'unit:data->settings->>unit', 'bwUnit:data->settings->>bwUnit', 'weekStart:data->settings->weekStart',
        'sleepGoal:data->settings->sleepGoal', 'habits:data->settings->habits', 'name:data->settings->profile->>name',
        'updated_at',
      ].join(',')).eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { unit, bwUnit, weekStart, sleepGoal, habits, name, updated_at: at, ...rest } = data;
      return { ...rest, settings: { unit, bwUnit, weekStart, sleepGoal, habits }, name, updatedAt: Date.parse(at) || null };
    },
  },
  alab: {
    name: 'Appearance Lab',
    async fetch(sb, uid) {
      const { data, error } = await sb.from('alab_data').select('summary, updated_at').eq('user_id', uid).maybeSingle();
      if (error) {
        if (MISSING_TABLE.has(error.code)) return { missingTable: true };
        throw error;
      }
      return data ? { summary: data.summary, updatedAt: Date.parse(data.updated_at) || null } : null;
    },
  },
};
