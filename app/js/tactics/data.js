// Lädt die Taktik-Daten einmal pro Seitenaufruf und hält den Index im Speicher.
import { loadData, loadPlayerData } from '../ui.js';
import * as store from '../store.js';
import { buildIndex, normalizeOwn } from './logic.js';
import { trainingFocus } from './focus.js';

let cache = null;

// → {index, own: [eigene Aufgaben], focus: {lichessTheme: Gewicht}}
// Eigene Aufgaben = Fehler aus chess.com-Partien plus Fehler aus Bot-Partien; der Schwerpunkt mischt neue Partien
// als Ergänzung dazu (focus.js). Beides kommt laufend dazu, darum bei jedem Aufruf frisch aus dem Fortschritt.
export function loadTacticsData() {
  return loadBase().then(d => {
    const play = store.get('play');
    return {
      index: d.index,
      own: [...normalizeOwn(play.puzzles || []).reverse(), ...d.own],
      focus: trainingFocus(d.summary, play.games).themes,
    };
  });
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
      summary,
    }));
    cache.catch(() => { cache = null; });   // nach einem Fehler beim nächsten Mal neu versuchen
  }
  return cache;
}
