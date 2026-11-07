// Lädt die Taktik-Daten einmal pro Seitenaufruf und hält den Index im Speicher.
import { loadData, loadPlayerData } from '../ui.js';
import * as store from '../store.js';
import { buildIndex, normalizeOwn } from './logic.js';

let cache = null;

// → {index, own: [eigene Aufgaben], focus: {lichessTheme: Gewicht}}
// Eigene Aufgaben = Fehler aus chess.com-Partien plus Fehler aus Bot-Partien (die kommen laufend dazu, darum
// werden sie bei jedem Aufruf frisch aus dem Fortschritt gelesen).
export function loadTacticsData() {
  return loadBase().then(d => ({ ...d, own: [...normalizeOwn(store.get('play').puzzles || []).reverse(), ...d.own] }));
}

function loadBase() {
  if (!cache) {
    cache = Promise.all([
      loadData('puzzles.json').then(buildIndex),
      loadPlayerData('my_puzzles.json').catch(() => []),          // darf fehlen
      loadPlayerData('analysis_summary.json').catch(() => null),  // darf fehlen
    ]).then(([index, own, summary]) => ({
      index,
      own: normalizeOwn(own),
      focus: summary?.focus?.themes && typeof summary.focus.themes === 'object' ? summary.focus.themes : {},
    }));
    cache.catch(() => { cache = null; });   // nach einem Fehler beim nächsten Mal neu versuchen
  }
  return cache;
}
