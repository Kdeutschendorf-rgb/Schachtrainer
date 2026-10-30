// Fortschritt: liegt zuerst lokal im Browser (funktioniert offline) und wird mit Supabase abgeglichen,
// sobald Netz da ist. So ist der Stand auf Mac, iPad und Handy derselbe.
// Jedes Modul hat seinen eigenen Bereich: store.get('tactics'), store.update('tactics', d => {...}).
//
// Aufbau:
// {
//   version: 1,
//   settings: { dailyMinutes: 30, chesscomName },
//   openings: {...}, tactics: {...}, vision: {...}, endgames: {...},   // gehören den Modulen
//   sessions: [{ date, startedAt, minutes, blocks: [{ type, minutes, ...summary }] }],
//   activity: { 'YYYY-MM-DD': { minutes, puzzles, openingReviews, ... } },
//   _updatedAt: ms seit 1970 (letzte Änderung, entscheidet beim Abgleich)
// }

import { todayStr, dateStr } from './srs.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let state = null;
let saveTimer = null;
let pushTimer = null;
let dirty = false;            // lokale Änderungen, die noch nicht in Supabase sind
let user = null;              // eingeloggter Supabase-Nutzer oder null (Gast)
const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULTS = () => ({
  version: 1,
  settings: { dailyMinutes: 30 },
  openings: {},
  tactics: {},
  vision: {},
  endgames: {},
  sessions: [],
  activity: {},
  _updatedAt: 0,
});

const localKey = () => `schachtrainer:progress:${user ? user.id : 'gast'}`;

function readLocal() {
  try { return JSON.parse(localStorage.getItem(localKey()) || 'null'); } catch { return null; }
}

function writeLocal() {
  try { localStorage.setItem(localKey(), JSON.stringify(state)); } catch { /* Speicher voll oder gesperrt */ }
}

async function readRemote() {
  if (!client || !user || !navigator.onLine) return null;
  const { data, error } = await client.from('progress').select('data').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data?.data || null;
}

// ---------- Anmeldung ----------

// Gibt zurück, ob jemand angemeldet ist oder bewusst als Gast trainiert. Sonst zeigt main.js die Anmeldung.
export async function session() {
  if (client) {
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
  }
  return { user, guest: !user && localStorage.getItem('schachtrainer:gast') === '1' };
}

export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  user = data.user;
}

export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Konto angelegt, aber noch nicht bestätigt. Bitte melde dich an.');
  user = data.user;
}

export function useGuest() {
  try { localStorage.setItem('schachtrainer:gast', '1'); } catch { /* egal */ }
}

export async function signOut() {
  await pushNow();
  try { localStorage.removeItem('schachtrainer:gast'); } catch { /* egal */ }
  await client?.auth.signOut();
  location.reload();
}

export const currentUser = () => user;
export const isOnline = () => navigator.onLine;
export const hasPending = () => dirty;

// ---------- Laden und Abgleich ----------

export async function init() {
  if (state) return state;
  const local = readLocal();
  let remote = null;
  try { remote = await readRemote(); } catch (e) { console.warn('Abgleich fehlgeschlagen', e); }
  const pick = !remote ? local : !local ? remote : ((remote._updatedAt || 0) >= (local._updatedAt || 0) ? remote : local);
  state = { ...DEFAULTS(), ...(pick || {}) };
  dirty = !!local && pick === local && (!remote || (local._updatedAt || 0) > (remote._updatedAt || 0));
  writeLocal();
  if (dirty) schedulePush();
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', () => dirty && pushNow());
  document.addEventListener('visibilitychange', onVisible);
  return state;
}

// Kommt die App zurück in den Vordergrund und ein anderes Gerät war inzwischen aktiv: neu laden.
async function onVisible() {
  if (document.visibilityState === 'hidden') { flush(); return; }
  if (dirty) { pushNow(); return; }
  try {
    const remote = await readRemote();
    if (remote && (remote._updatedAt || 0) > (state._updatedAt || 0) && !document.querySelector('.today-running')) location.reload();
  } catch { /* offline */ }
}

export function get(key) {
  if (!state) throw new Error('store.init() fehlt');
  if (state[key] == null) state[key] = {};
  return state[key];
}

export function all() {
  return state;
}

// fn bekommt den Bereich und darf ihn direkt ändern oder einen neuen zurückgeben.
export function update(key, fn) {
  const cur = get(key);
  const next = fn(cur);
  if (next !== undefined) state[key] = next;
  scheduleSave();
  return state[key];
}

// Tageszähler, z. B. logActivity({ puzzles: 1, puzzlesSolved: 1 }) oder { minutes: 0.5 }.
export function logActivity(counts, day = todayStr()) {
  const a = (state.activity[day] ||= {});
  for (const [k, v] of Object.entries(counts)) a[k] = (a[k] || 0) + v;
  scheduleSave();
}

export function addSession(session) {
  state.sessions.push(session);
  scheduleSave();
}

// Tage in Folge mit Training (heute zählt mit, wenn schon trainiert).
export function streak() {
  let n = 0;
  const d = new Date();
  if (!state.activity[todayStr()]) d.setDate(d.getDate() - 1);
  for (;;) {
    const key = dateStr(d);
    if (!state.activity[key]) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function scheduleSave() {
  state._updatedAt = Date.now();
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { writeLocal(); schedulePush(); }, 400);
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 2500);
}

async function pushNow() {
  clearTimeout(pushTimer);
  if (!client || !user || !navigator.onLine || !dirty) return;
  const stamp = state._updatedAt;
  const { error } = await client.from('progress').upsert({ user_id: user.id, data: state, updated_at: new Date(stamp).toISOString() });
  if (error) { console.warn('Speichern in Supabase fehlgeschlagen', error); return; }
  if (state._updatedAt === stamp) dirty = false;
}

// Sofort sichern (beim Verlassen der Seite und vor dem Abmelden).
export function flush() {
  clearTimeout(saveTimer);
  if (!state) return;
  writeLocal();
  pushNow();
}
