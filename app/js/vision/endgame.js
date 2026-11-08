// Endspiele: reine Logik ohne DOM (Ziel erreicht? Note? Reihenfolge?), getestet in vision/logic.test.mjs.
// game ist ein chess.js-Objekt, score die Engine-Bewertung (Sicht Weiß) der Stellung nach dem Zug.
import { Chess } from '../../vendor/chess.js';

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

// ---------- Andere Startstellungen (Lektionsschritt „allein“) ----------

const expandRank = r => r.replace(/\d/g, d => '.'.repeat(+d));
const packRank = r => r.replace(/\.+/g, m => String(m.length));

// FEN an der senkrechten Mittelachse spiegeln (a↔h). Nur für Stellungen ohne Rochaderechte.
export function mirrorFen(fen) {
  const f = fen.split(' ');
  f[0] = f[0].split('/').map(r => packRank([...expandRank(r)].reverse().join(''))).join('/');
  return f.join(' ');
}

// Farben tauschen: Stellung auf den Kopf, Weiß ↔ Schwarz, Seite am Zug wechselt
export function swapColorsFen(fen) {
  const f = fen.split(' ');
  f[0] = f[0].split('/').reverse().map(r => [...r].map(c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')).join('/');
  f[1] = f[1] === 'w' ? 'b' : 'w';
  return f.join(' ');
}

// Zufällige Startstellung für die Grundmatts: Figuren frei verteilt, gültig und nicht sofort entschieden
const RANDOM_MATES = { 'kqk-mate': ['Q'], 'krk-mate': ['R'], 'two-rooks-mate': ['R', 'R'], 'two-bishops-mate': ['B', 'B'] };

function randomMateFen(pieces, rnd) {
  for (let tries = 0; tries < 300; tries++) {
    const board = Array(64).fill(null);
    const free = () => { let i; do { i = Math.floor(rnd() * 64); } while (board[i]); return i; };
    board[free()] = 'K';
    const k = free();
    board[k] = 'k';
    const placed = pieces.map(p => { const i = free(); board[i] = p; return i; });
    // Zwei Läufer brauchen verschiedene Feldfarben
    const color = i => ((i >> 3) + (i & 7)) % 2;
    if (pieces[0] === 'B' && color(placed[0]) === color(placed[1])) continue;
    // Der König soll nicht schon am Rand stehen, sonst ist die Aufgabe zu kurz
    const kf = k & 7, kr = k >> 3;
    if (kf < 2 || kf > 5 || kr < 2 || kr > 5) continue;
    const rows = [];
    for (let r = 0; r < 8; r++) rows.push(packRank(board.slice(r * 8, r * 8 + 8).map(x => x || '.').join('')));
    const fen = `${rows.join('/')} w - - 0 1`;
    try {
      const c = new Chess(fen);
      if (c.isGameOver() || c.inCheck()) continue;
      // Schwarz darf in der Ausgangslage nicht im Schach stehen (sonst wäre Weiß am Zug ungültig)
      const flipped = new Chess(fen.replace(' w ', ' b '));
      if (flipped.inCheck() || flipped.isGameOver()) continue;
      return fen;
    } catch { /* ungültig, neu würfeln */ }
  }
  return null;
}

// → Kopie der Lernstellung mit anderer Startstellung (gleiche Aufgabe, keine Hinweise mit festen Feldern)
export function variantOf(pos, rnd = Math.random) {
  const random = RANDOM_MATES[pos.id] && randomMateFen(RANDOM_MATES[pos.id], rnd);
  if (random) return { ...pos, fen: random, side: 'w', variant: true };
  let fen = pos.fen;
  let side = pos.side;
  const mirror = rnd() < 0.5;
  const swap = rnd() < 0.5;
  if (!mirror && !swap) return { ...pos, fen: mirrorFen(fen), variant: true };
  if (mirror) fen = mirrorFen(fen);
  if (swap) { fen = swapColorsFen(fen); side = side === 'w' ? 'b' : 'w'; }
  return { ...pos, fen, side, variant: true };
}
