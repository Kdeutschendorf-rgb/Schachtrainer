// Stellungen zu Ende spielen: Stellungen aus deinen eigenen Partien gegen die Engine ausspielen.
// „Verwerten“: gewonnene Stellung nicht mehr hergeben. „Retten“: schlechte Stellung nicht aufgeben.
//
// createPlayout(el, { pos: {id, fen, kind: 'win'|'save', date}, elo, onEnd({ok}) }) → destroy()

import { h, clear, formatLine } from '../ui.js';
import { createBoard } from '../board.js';
import { Chess } from '../../vendor/chess.js';
import { analyse, bestMove, winPct } from '../engine.js';
import { MIN_BOT_ELO } from './logic.js';

const RULES = {
  win: { moves: 15, title: 'Verwerten', goal: 'Du stehst auf Gewinn. Setz matt oder halte die Stellung 15 Züge lang klar gewonnen.', pass: w => w >= 75 },
  save: { moves: 20, title: 'Retten', goal: 'Du stehst schlecht. Gib nicht auf: Halte 20 Züge durch und mach es dem Gegner schwer.', pass: w => w >= 20 },
};

export function createPlayout(el, { pos, elo, onEnd }) {
  const rule = RULES[pos.kind];
  const start = new Chess(pos.fen);
  // Bei „Retten“ ist die Engine zuerst am Zug: Die Stellung steht direkt nach deinem Fehler
  const side = pos.kind === 'save' ? (start.turn() === 'w' ? 'b' : 'w') : start.turn();
  const botElo = Math.max(MIN_BOT_ELO, elo);
  const boardEl = h('div');
  const statusEl = h('div.pl-status');
  const movesEl = h('div.moves.pl-moves');
  const controls = h('div.row');
  const reportEl = h('div');
  el.append(h('div.trainer.pl-game', boardEl, h('div.side',
    h('div.card.tight', h('strong', rule.title), h('div.small', rule.goal), h('div.small.muted', `Aus deiner Partie vom ${String(pos.date || '').split('-').reverse().join('.')} · Gegner ${botElo}`)),
    statusEl, movesEl, controls, reportEl)));
  const board = createBoard(boardEl, { fen: pos.fen, orientation: side === 'w' ? 'white' : 'black', movable: 'none', autoQueen: true });
  const startPly = (Number(pos.fen.split(' ')[5]) - 1) * 2 + (start.turn() === 'b' ? 1 : 0);
  const sans = [];
  let own = 0, over = false, gen = 0, gone = false;

  const render = () => { movesEl.textContent = sans.length ? formatLine(sans, startPly) : ''; };

  function myTurn() {
    statusEl.textContent = `Dein Zug (${own + 1}/${rule.moves})`;
    board.setMovable(side === 'w' ? 'white' : 'black');
  }

  board.setOnMove(m => {
    board.setMovable('none');
    sans.push(m.san);
    own++;
    render();
    if (board.chess.isGameOver() || own >= rule.moves) setTimeout(finish, 0);
    else botTurn();
    return true;
  });

  async function botTurn() {
    const my = ++gen;
    statusEl.textContent = 'Gegner zieht …';
    let uci = null;
    try { uci = await bestMove(board.fen(), { elo: botElo, movetime: 400 }); } catch { /* unten */ }
    if (my !== gen || gone || over) return;
    const m = uci && board.move(uci);
    if (!m) return finish();
    sans.push(m.san);
    render();
    if (board.chess.isGameOver()) return finish();
    myTurn();
  }

  async function finish() {
    if (over) return;
    over = true;
    gen++;
    board.setMovable('none');
    statusEl.textContent = 'Stellung wird bewertet …';
    const g = board.chess;
    let ok, text;
    if (g.isCheckmate()) {
      ok = g.turn() !== side;
      text = ok ? 'Matt gesetzt!' : 'Du wurdest mattgesetzt.';
    } else if (g.isGameOver()) {
      ok = pos.kind === 'save';
      text = ok ? 'Remis gerettet!' : 'Remis: Der Gewinn ist weg.';
    } else {
      let w = 50;
      try { const r = await analyse(board.fen(), { movetime: 700 }); w = winPct(r.lines[0].score, side); } catch { /* neutral */ }
      if (gone) return;
      ok = rule.pass(w);
      text = `Nach ${own} Zügen: ${Math.round(w)} % Gewinnchance.`;
    }
    if (gone) return;
    board.flash(ok ? 'good' : 'bad');
    statusEl.textContent = ok ? 'Geschafft!' : 'Nicht geschafft.';
    clear(reportEl).append(h(`div.feedback.${ok ? 'good' : 'bad'}`, text));
    onEnd?.({ ok, controls });
  }

  render();
  if (start.turn() === side) myTurn(); else botTurn();
  return () => { gone = true; gen++; board.destroy(); };
}
