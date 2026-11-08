// Daten laden (Repertoire, Katalog, Lichess-Namen) und Fortschritt im Bereich `openings` speichern.
// Fehlende oder kaputte Dateien sind kein Fehler: Es gibt dann null und einen Hinweis in der UI.

import { fetchJson } from '../ui.js';
import * as store from '../store.js';
import { todayStr } from '../srs.js';
import { buildModel, buildNameIndex, ensureProgress, applyResults, quizPool } from './logic.js';

export const FILES = {
  white: 'repertoire_white.json',
  black: 'repertoire_black.json',
  catalog: 'openings_catalog.json',
  lichess: 'lichess_openings.json',
};

// Erfolgreiche Ladevorgänge cachen, Fehlschläge nicht (die Datei kann später noch entstehen).
const cache = new Map();
const problems = new Map();   // Dateiname → 'fehlt' | 'fehlerhaft'

function tryLoad(name) {
  if (cache.has(name)) return cache.get(name);
  // Das Promise wird nie abgelehnt: Ergebnis ist die Datei oder null.
  const p = fetchJson(`data/${name}`, { cache: 'no-cache' }).then(
    data => { problems.delete(name); return data; },
    err => {
      cache.delete(name);
      problems.set(name, /: 404$/.test(err.message) ? 'fehlt' : 'fehlerhaft');
      return null;
    });
  cache.set(name, p);
  return p;
}

export function fileProblem(name) {
  return problems.get(name) || null;
}

let model = null;
let modelDepth = null;
export const DEFAULT_DEPTH = 8;   // Lerntiefe in Zügen; auf deinem Niveau weicht der Gegner fast immer früher ab

// Lerntiefe in Zügen (0 = ganze Linie)
export function learnDepth() {
  const d = progress().settings.depth;
  return d === 0 || d > 0 ? d : DEFAULT_DEPTH;
}

// Repertoire-Modell. Wird gecacht, sobald beide Dateien da sind (und neu gebaut, wenn sich die Lerntiefe ändert).
export async function loadModel() {
  const depth = learnDepth();
  if (model && !model.missing.length && modelDepth === depth) return model;
  const [w, b] = await Promise.all([tryLoad(FILES.white), tryLoad(FILES.black)]);
  modelDepth = depth;
  model = buildModel([
    { name: FILES.white, side: 'w', json: w },
    { name: FILES.black, side: 'b', json: b },
  ], { maxPlies: depth * 2 });
  model.problems = [FILES.white, FILES.black].filter(f => problems.has(f)).map(f => ({ file: f, kind: problems.get(f) }));
  if (model.errors.length) console.warn('Repertoire-Fehler:', model.errors);
  if (model.conflicts.length) console.warn('Repertoire-Widersprüche:', model.conflicts);
  return model;
}

export async function loadCatalog() {
  const data = await tryLoad(FILES.catalog);
  return Array.isArray(data) ? data : null;
}

export async function loadLichess() {
  const data = await tryLoad(FILES.lichess);
  return Array.isArray(data) ? data : null;
}

let nameIndex = null;
export async function loadNameIndex() {
  if (nameIndex) return nameIndex;
  const list = await loadLichess();
  if (!list) return null;
  return (nameIndex = buildNameIndex(list));
}

// Quiz-Pool aus Katalog (deutsche Namen) und Lichess-Liste (Breite). null, wenn beides fehlt.
export async function loadQuizPool() {
  const [cat, li] = await Promise.all([loadCatalog(), loadLichess()]);
  const pool = quizPool(cat, li);
  return pool.length >= 4 ? pool : null;
}

// ---------- Fortschritt ----------

export function progress() {
  return ensureProgress(store.get('openings'));
}

// Ergebnisse einer Linie speichern und die Tageszähler erhöhen.
export function saveLineResults(results, { learnLineId } = {}) {
  let r;
  store.update('openings', d => { r = applyResults(ensureProgress(d), results, { learnLineId }); });
  const counts = { openingReviews: r.total, openingCorrect: r.correct };
  if (r.newCards) counts.openingNew = r.newCards;
  if (learnLineId) counts.openingLines = 1;
  store.logActivity(counts);
  return r;
}

// Weichen-Training: wann eine Stellung zuletzt geübt wurde (auch wenn sie nicht fällig war)
export function markPracticed(key) {
  store.update('openings', d => { (d.practiced ||= {})[key] = todayStr(); });
}

export function setStage(lineId, stage) {
  store.update('openings', d => { (d.stages ||= {})[lineId] = stage; });
}

export function saveQuiz(right) {
  store.update('openings', d => {
    ensureProgress(d);
    if (right) d.quiz.right++; else d.quiz.wrong++;
  });
  store.logActivity(right ? { openingQuiz: 1, openingQuizRight: 1 } : { openingQuiz: 1 });
}

export function setSetting(key, value) {
  store.update('openings', d => { ensureProgress(d).settings[key] = value; });
}
