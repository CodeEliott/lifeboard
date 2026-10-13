// Sign-in to RepLog's Supabase project. Both v1 sources (RepLog's row and Appearance Lab's
// copy) live there, so one Google sign-in unlocks every plugin.
const SUPABASE_URL = 'https://cokgmxsotavbstymslvc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0G26WK2ys5Awz9h2AZRZKw_cSIWaFpt'; // public by design; Row Level Security protects rows

// supabase-js is loaded on demand, never as a blocking <script>, so a slow CDN cannot hold
// the board hostage. Same pinned build and integrity hash as RepLog; the CSP allows this path.
const SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js';
const SB_SRI = 'sha384-iLddHTLokph6Omwoyid4XKxHaWa6w41BnoEj0q5oOrzmYPpHIKt1wyjReA7s//pP';

let sb = null;
let loading = null;
export let account = null; // { id, email }

function loadLib() {
  if (window.supabase) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const tag = Object.assign(document.createElement('script'), { src: SB_SRC, integrity: SB_SRI, crossOrigin: 'anonymous', async: true });
    const timer = setTimeout(() => { loading = null; reject(new Error('The sign-in library timed out. Check your connection.')); }, 15000);
    tag.onload = () => { clearTimeout(timer); resolve(); };
    tag.onerror = () => { clearTimeout(timer); loading = null; reject(new Error('Could not load the sign-in library. Check your connection.')); };
    document.head.appendChild(tag);
  });
  return loading;
}

export async function client() {
  if (sb) return sb;
  await loadLib();
  sb ||= window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return sb;
}

// Only load the library at boot when there is a session to restore or a sign-in to finish.
export const hasStoredSession = () => Object.keys(localStorage).some((k) => /^sb-.+-auth-token/.test(k));

const toAccount = (user) => (user ? { id: user.id, email: user.email } : null);

export async function initAuth(onChange) {
  const c = await client();
  c.auth.onAuthStateChange((event, session) => {
    const was = !!account;
    account = toAccount(session?.user);
    // Deferred: calling Supabase from inside this callback can deadlock its auth lock.
    if (event === 'SIGNED_IN' && !was) setTimeout(() => onChange('signed-in'), 0);
    if (event === 'SIGNED_OUT') setTimeout(() => onChange('signed-out'), 0);
  });
  const { data } = await c.auth.getSession();
  account = toAccount(data.session?.user);
}

export async function signInGoogle() {
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}

// scope 'local': the default 'global' would also sign RepLog out on every device.
export async function signOut() {
  try { if (sb) await sb.auth.signOut({ scope: 'local' }); } catch { /* offline */ }
  for (const k of Object.keys(localStorage)) if (/^sb-.+-auth-token/.test(k)) localStorage.removeItem(k);
  account = null;
}
