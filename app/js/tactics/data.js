// Lädt die Taktik-Daten einmal pro Seitenaufruf und hält den Index im Speicher.
import { loadData } from '../ui.js';
import { buildIndex, normalizeOwn } from './logic.js';

let cache = null;

// → {index, own: [eigene Aufgaben], focus: {lichessTheme: Gewicht}}
export function loadTacticsData() {
  if (!cache) {
    cache = Promise.all([
      loadData('puzzles.json').then(buildIndex),
      loadData('my_puzzles.json').catch(() => []),          // darf fehlen
      loadData('analysis_summary.json').catch(() => null),  // darf fehlen
    ]).then(([index, own, summary]) => ({
      index,
      own: normalizeOwn(own),
      focus: summary?.focus?.themes && typeof summary.focus.themes === 'object' ? summary.focus.themes : {},
    }));
    cache.catch(() => { cache = null; });   // nach einem Fehler beim nächsten Mal neu versuchen
  }
  return cache;
}
