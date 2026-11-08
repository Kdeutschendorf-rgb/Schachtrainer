// Engine-Teil vom Spielen: Zug des Bots und Analyse der fertigen Partie (Stockfish im Browser).

import { Chess } from '../../vendor/chess.js';
import { analyse, bestMove } from '../engine.js';
import { MIN_BOT_ELO, winPct, classify, moveAccuracy, phaseOf, motifs } from './logic.js';

// Zug des Bots als UCI (Stockfish mit begrenzter Spielstärke)
export function botMove(fen, elo) {
  return bestMove(fen, { elo: Math.max(MIN_BOT_ELO, elo), movetime: 500 });
}

// Partie analysieren: jede Stellung einmal bewerten, dann die eigenen Züge einstufen.
// → {accuracy, counts: {blunder, mistake, inaccuracy}, moves: [{ply, san, cls, loss, best, bestSan, fen}], puzzles}
export async function analyseGame({ sans, color, id, date }, { onProgress, alive = () => true, movetime = 300 } = {}) {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans) { chess.move(san); fens.push(chess.fen()); }
  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    if (!alive()) return null;
    const c = new Chess(fens[i]);
    if (c.isCheckmate()) evals.push({ score: { mate: c.turn() === 'w' ? -1 : 1 }, pv: [] });  // Seite am Zug ist matt
    else if (c.isGameOver()) evals.push({ score: { cp: 0 }, pv: [] });
    else {
      const r = await analyse(fens[i], { movetime });
      const l = r.lines[0];
      evals.push({ score: l?.score || { cp: 0 }, pv: l?.pv || [], san: l?.san || [] });
    }
    onProgress?.((i + 1) / fens.length);
  }
  const moves = [];
  const puzzles = [];
  const counts = { blunder: 0, mistake: 0, inaccuracy: 0 };
  let accSum = 0, accN = 0;
  for (let i = 0; i < sans.length; i++) {
    const mover = fens[i].split(' ')[1];
    if (mover !== color) continue;
    const before = winPct(evals[i].score, color);
    const after = winPct(evals[i + 1].score, color);
    // Spielt man den besten Zug, gibt es keinen Verlust (schützt vor Rechenrauschen)
    const bestUci = evals[i].pv[0];
    const playedUci = (() => { const c = new Chess(fens[i]); const m = c.move(sans[i]); return m.from + m.to + (m.promotion || ''); })();
    const loss = playedUci === bestUci ? 0 : Math.max(0, before - after);
    const cls = classify(loss);
    // Fehlerart wie in der chess.com-Analyse
    const tags = cls ? motifs(Chess, fens[i + 1], evals[i + 1].pv, color) : [];
    if (cls) {
      const mateFor = sc => sc.mate != null && (color === 'w' ? sc.mate > 0 : sc.mate < 0);
      const mateAgainst = sc => sc.mate != null && (color === 'w' ? sc.mate < 0 : sc.mate > 0);
      if (mateFor(evals[i].score) && !mateFor(evals[i + 1].score)) tags.push('matt_verpasst');
      if (mateAgainst(evals[i + 1].score)) tags.push('matt_zugelassen');
      if (i > 0 && before - winPct(evals[i - 1].score, color) >= 20) tags.push('chance_verpasst');
    }
    accSum += moveAccuracy(loss);
    accN++;
    if (cls) counts[cls]++;
    moves.push({ ply: i, san: sans[i], cls, tags, loss: Math.round(loss), best: bestUci, bestSan: evals[i].san?.[0] || null, fen: fens[i], phase: phaseOf(fens[i], i) });
    // Fehler und Patzer werden zu eigenen Aufgaben (Format wie my_puzzles.json)
    if ((cls === 'blunder' || cls === 'mistake') && evals[i].pv.length) {
      puzzles.push({
        id: `bot${id}_${i}`, fen: fens[i], moves: evals[i].pv.slice(0, 3), played: sans[i], cls,
        phase: phaseOf(fens[i], i), tags, tc: 'bot', date, winBest: Math.round(before * 10) / 10, winSecond: Math.round(after * 10) / 10,
      });
    }
  }
  // Fehler der Partie (für Schwerpunkt und Wochenbericht)
  const errors = moves.filter(m => m.cls === 'blunder' || m.cls === 'mistake').map(m => ({ cls: m.cls, tags: m.tags, phase: m.phase }));
  return { accuracy: accN ? Math.round(accSum / accN * 10) / 10 : null, counts, moves, puzzles, errors };
}
