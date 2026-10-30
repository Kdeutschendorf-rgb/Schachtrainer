// Endspiele: reine Logik ohne DOM (Ziel erreicht? Note? Reihenfolge?), getestet in vision/logic.test.mjs.
// game ist ein chess.js-Objekt, score die Engine-Bewertung (Sicht Weiß) der Stellung nach dem Zug.

export const WIN_CP = 500;         // „klar gewonnen“ ab +5 aus Nutzersicht
export const LOST_WIN_CP = 80;     // darunter ist der Gewinn verspielt
export const LOST_CP = -400;       // Remis-Aufgabe: darunter ist die Stellung verloren
export const DRAW_MARGIN = 150;    // Remis gehalten, wenn die Bewertung am Ende nicht schlechter ist
// Pro Stellung überschreibbar: drawMargin und lostCp (z. B. verschiedenfarbige Läufer, wo die Engine
// trotz Remis einen Mehrbauern mit +1 bis +2 bewertet).

// Bis wann gespielt wird: 'mate' (Matt), 'promote' (Umwandlung mit klarer Bewertung),
// 'material' (Gegner hat nur noch den König, klare Bewertung). Ohne Angabe: eigene Bauern → Umwandlung, sonst Matt.
export function untilOf(pos) {
  if (pos.until) return pos.until;
  if (pos.goal !== 'win') return null;
  const board = pos.fen.split(' ')[0];
  const side = pos.side || pos.fen.split(' ')[1];
  return board.includes(side === 'w' ? 'P' : 'p') ? 'promote' : 'mate';
}

// Bewertung in Centipawns aus Sicht von side (Matt = ±100000)
export function userCp(score, side) {
  if (!score) return null;
  let cp = score.mate != null ? (score.mate > 0 ? 100000 : score.mate < 0 ? -100000 : 0) : score.cp;
  return side === 'w' ? cp : -cp;
}

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Materialvorsprung von side in Bauerneinheiten (z. B. +5 = ein Turm mehr)
export function materialEdge(game, side) {
  let sum = 0;
  for (const p of game.board().flat()) if (p) sum += (p.color === side ? 1 : -1) * VAL[p.type];
  return sum;
}

function onlyKing(game, color) {
  return game.board().flat().filter(p => p && p.color === color).length === 1;
}

function drawReason(game) {
  if (game.isStalemate()) return 'Patt';
  if (game.isInsufficientMaterial()) return 'zu wenig Material zum Mattsetzen';
  if (game.isThreefoldRepetition()) return 'dreifache Stellungswiederholung';
  if (game.isDraw()) return '50-Züge-Regel';
  return null;
}

// Nach dem Zug des Nutzers (Gegner ist am Zug). info = {score, userMoves, lastMove}
// → {status: 'continue'|'won'|'failed', reason}
export function judgeAfterUser(pos, game, { score, userMoves, lastMove } = {}) {
  const side = pos.side;
  const opp = side === 'w' ? 'b' : 'w';
  if (game.isCheckmate()) return { status: 'won', reason: 'Matt!' };
  const dr = drawReason(game);
  if (dr) {
    return pos.goal === 'draw'
      ? { status: 'won', reason: `Remis (${dr}). Ziel erreicht.` }
      : { status: 'failed', reason: `Remis (${dr}). Der Gewinn ist weg.` };
  }
  const cp = userCp(score, side);
  if (pos.goal === 'win') {
    const until = untilOf(pos);
    if (cp != null && cp >= WIN_CP) {
      if (until === 'promote' && lastMove?.promotion) return { status: 'won', reason: 'Umgewandelt, und die Stellung ist klar gewonnen.' };
      // Der Gegner hat eine Figur für den Bauern gegeben: Das zählt wie die Umwandlung.
      if (until === 'promote' && materialEdge(game, side) >= 5) return { status: 'won', reason: 'Der Gegner musste eine Figur für deinen Bauern geben. Klar gewonnen.' };
      if (until === 'material' && onlyKing(game, opp)) return { status: 'won', reason: 'Der Gegner hat nur noch den König. Der Rest ist Technik.' };
    }
    if (cp != null && cp < LOST_WIN_CP) return { status: 'failed', reason: 'Nach diesem Zug ist der Gewinn weg.' };
    if (userMoves >= pos.maxMoves) return { status: 'failed', reason: `Zuglimit erreicht (${pos.maxMoves} Züge).` };
    return { status: 'continue' };
  }
  // goal 'draw'
  if (cp != null && cp <= (pos.lostCp ?? LOST_CP)) return { status: 'failed', reason: 'Nach diesem Zug ist die Stellung verloren.' };
  if (userMoves >= pos.maxMoves) {
    const margin = pos.drawMargin ?? DRAW_MARGIN;
    if (cp == null || cp >= -margin) return { status: 'won', reason: `${pos.maxMoves} Züge gehalten. Remis!` };
    return { status: 'failed', reason: 'Zuglimit erreicht, aber die Stellung ist schlechter geworden.' };
  }
  return { status: 'continue' };
}

// Nach dem Zug des Gegners (Nutzer ist am Zug): nur Regeln prüfen.
export function judgeAfterOpponent(pos, game) {
  if (game.isCheckmate()) return { status: 'failed', reason: 'Du bist mattgesetzt worden.' };
  const dr = drawReason(game);
  if (dr) {
    return pos.goal === 'draw'
      ? { status: 'won', reason: `Remis (${dr}). Ziel erreicht.` }
      : { status: 'failed', reason: `Remis (${dr}). Der Gewinn ist weg.` };
  }
  return { status: 'continue' };
}

// SRS-Note: falsch 0, mit Hinweis 1, ohne Hinweis 2, ohne Hinweis und zügig (≤ par Züge) 3
export function gradeFor({ ok, hints, userMoves, par }) {
  if (!ok) return 0;
  if (hints > 0) return 1;
  return par && userMoves <= par ? 3 : 2;
}

// Reihenfolge fürs Üben: fällige Karten (älteste zuerst), dann neue nach Stufe, dann der Rest nach Fälligkeit.
export function queue(list, cards, today) {
  const due = [], fresh = [], rest = [];
  for (const p of list) {
    const c = cards?.[p.id];
    if (!c) fresh.push(p);
    else if (c.due <= today) due.push(p);
    else rest.push(p);
  }
  due.sort((a, b) => cards[a.id].due.localeCompare(cards[b.id].due));
  fresh.sort((a, b) => a.level - b.level);
  rest.sort((a, b) => cards[a.id].due.localeCompare(cards[b.id].due));
  return [...due, ...fresh, ...rest];
}
