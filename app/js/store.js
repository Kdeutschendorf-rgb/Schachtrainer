// Fortschritt: liegt in data/progress.json (über den Server), damit Claude ihn lesen kann.
// Jedes Modul hat seinen eigenen Bereich: store.get('tactics'), store.update('tactics', d => {...}).
//
// Aufbau:
// {
//   version: 1,
//   settings: { dailyMinutes: 30 },
//   openings: {...}, tactics: {...}, vision: {...}, endgames: {...},   // gehören den Modulen
//   sessions: [{ date, startedAt, minutes, blocks: [{ type, minutes, ...summary }] }],
//   activity: { 'YYYY-MM-DD': { minutes, puzzles, openingReviews, ... } }
// }

import { todayStr, dateStr } from './srs.js';

let state = null;
let saveTimer = null;

const DEFAULTS = () => ({
  version: 1,
  settings: { dailyMinutes: 30 },
  openings: {},
  tactics: {},
  vision: {},
  endgames: {},
  sessions: [],
  activity: {},
});

export async function init() {
  if (state) return state;
  try {
    const res = await fetch('api/progress');
    const data = await res.json();
    state = { ...DEFAULTS(), ...data };
  } catch {
    state = DEFAULTS();
  }
  window.addEventListener('beforeunload', flush);
  return state;
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
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 600);
}

export function flush() {
  clearTimeout(saveTimer);
  if (!state) return;
  const body = JSON.stringify(state);
  // keepalive, damit das Speichern auch beim Schließen des Tabs noch durchgeht
  fetch('api/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
    .catch(() => {});
}
