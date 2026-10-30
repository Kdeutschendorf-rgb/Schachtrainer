// Sparring: Ab dem Ende einer Repertoire-Linie gegen die Engine (wählbare Elo) weiterspielen
// und danach kurz bewerten lassen.
//
// const s = createSparring(el, { moves: [SAN], side: 'w'|'b', title, plan, onExit });  s.destroy()

import { createBoard } from '../board.js';
import { h, clear, formatLine } from '../ui.js';
import * as engine from '../engine.js';
import { progress, setSetting } from './data.js';
import { onKeys, moveList, sideName, orientationOf, button } from './widgets.js';

const ELOS = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1800, 2000, 2200];

function userScore(score, side) {
  if (side === 'w') return score;
  return score.mate != null ? { mate: -score.mate } : { cp: -score.cp };
}

export function createSparring(el, { moves, side, title, plan, onExit }) {
  const orient = orientationOf(side);
  let elo = progress().settings.sparringElo || 1300;
  let alive = true;
  let token = 0;           // verwirft veraltete Engine-Antworten
  let startEval = null;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  const boardEl = h('div');
  const statusEl = h('div.op-status');
  const evalEl = h('div.op-eval');
  const movesBox = h('div.op-movesbox');
  const eloSel = h('select', { onchange: () => { elo = +eloSel.value; setSetting('sparringElo', elo); } },
    ELOS.map(e => h('option', { value: e, selected: e === elo }, `Engine ${e}`)));
  const controls = h('div.row.op-controls',
    eloSel,
    button({ label: 'Zug zurück', onClick: takeBack }),
    button({ label: 'Bewerten', primary: true, onClick: () => evaluate() }),
    button({ label: 'Neu ab Linienende', onClick: restart }),
    onExit ? button({ label: 'Zurück', onClick: onExit }) : null);

  el.append(h('div.trainer.op-trainer', boardEl, h('div.side',
    h('div.card.tight.op-head',
      h('div.row', h('span.pill.good', 'Sparring'), h('span.pill', `Du: ${sideName(side)}`)),
      h('h3.op-title', title || 'Sparring'),
      h('div.muted.small', `Ab ${formatLine(moves)} weiterspielen. Übe die typischen Pläne.`)),
    plan ? h('div.op-note.plan', h('div.op-note-head', h('b', 'Plan')), h('div', plan)) : null,
    statusEl, controls, evalEl, movesBox)));

  const board = createBoard(boardEl, { orientation: orient, movable: orient, autoQueen: false, onMove: onUserMove });

  function setStatus(text, kind = '') {
    statusEl.className = 'op-status' + (kind ? ' ' + kind : '');
    statusEl.textContent = text;
  }

  function extraMoves() {
    return board.history().slice(moves.length).map(m => m.san);
  }

  function renderMoves() {
    const extra = extraMoves();
    clear(movesBox).append(
      h('div.muted.small', 'Linie:'), moveList(moves, { cur: -1 }),
      h('div.muted.small', 'Sparring:'), extra.length ? moveList(extra, { startPly: moves.length }) : h('div.muted.small', '–'));
  }

  function gameOverText() {
    const c = board.chess;
    if (c.isCheckmate()) return c.turn() === side ? 'Du bist mattgesetzt.' : 'Matt! Du hast gewonnen.';
    if (c.isStalemate()) return 'Patt, Remis.';
    if (c.isDraw()) return 'Remis.';
    return null;
  }

  function onUserMove() {
    renderMoves();
    const over = gameOverText();
    if (over) { setStatus(over, 'good'); evaluate(); return true; }
    engineMove();
    return true;
  }

  async function engineMove() {
    const my = ++token;
    setStatus('Engine denkt …');
    board.setMovable('none');
    try {
      const uci = await engine.bestMove(board.fen(), { elo });
      if (!alive || my !== token) return;
      later(() => {
        if (!alive || my !== token) return;
        if (uci) board.move(uci);
        board.setMovable(orient);
        renderMoves();
        const over = gameOverText();
        setStatus(over || 'Du bist am Zug.', over ? 'bad' : '');
        if (over) evaluate();
      }, 250);
    } catch (err) {
      if (!alive) return;
      board.setMovable(orient);
      setStatus('Engine nicht erreichbar: ' + err.message, 'bad');
    }
  }

  function takeBack() {
    token++;
    // mindestens einen Zug zurück, dann bis der Nutzer am Zug ist (nie in die Linie hinein)
    if (board.history().length > moves.length) board.undo();
    while (board.turn() !== side && board.history().length > moves.length) board.undo();
    board.setMovable(orient);
    renderMoves();
    setStatus(board.turn() === side ? 'Du bist am Zug.' : 'Engine ist am Zug.');
    if (board.turn() !== side) engineMove();
  }

  function restart() {
    token++;
    board.loadLine(moves);
    board.setShapes([]);
    board.setMovable(orient);
    clear(evalEl);
    renderMoves();
    if (board.turn() !== side) engineMove(); else setStatus('Du bist am Zug. Spiel nach dem Plan weiter.');
  }

  async function evaluate() {
    const fen = board.fen();
    const ply = board.history().length;
    clear(evalEl).append(h('div.muted', 'Engine bewertet …'));
    try {
      const [res, start] = await Promise.all([
        engine.analyse(fen, { depth: 16 }),
        startEval || (startEval = engine.analyse(startFen, { depth: 14 }).catch(e => { startEval = null; throw e; })),
      ]);
      if (!alive || board.fen() !== fen) return;
      const line = res.lines[0];
      const s0 = start.lines[0];
      clear(evalEl);
      if (!line) { evalEl.append(h('div.muted', 'Keine Bewertung (Partie vorbei).')); return; }
      const now = userScore(line.score, side);
      const pct = engine.winPct(line.score, side);
      const items = [h('div.row',
        h('span.stat', engine.formatScore(now)),
        h('span.muted', `aus deiner Sicht · Gewinnchance ${Math.round(pct)} %`))];
      if (s0) {
        const pct0 = engine.winPct(s0.score, side);
        const d = pct - pct0;
        const txt = d >= 10 ? `Stark: Seit dem Linienende (${engine.formatScore(userScore(s0.score, side))}) hast du deine Stellung klar verbessert.`
          : d <= -15 ? `Seit dem Linienende (${engine.formatScore(userScore(s0.score, side))}) ist deine Stellung deutlich schlechter geworden. Geh die Züge zurück und such die Stelle.`
            : d <= -6 ? `Etwas schlechter als am Linienende (${engine.formatScore(userScore(s0.score, side))}). Prüf, ob deine Figuren aktiv stehen.`
              : `Etwa gleich wie am Linienende (${engine.formatScore(userScore(s0.score, side))}). Solide gespielt.`;
        items.push(h(`div.feedback.${d <= -15 ? 'bad' : d <= -6 ? 'warn' : 'good'}`, txt));
      }
      if (line.san?.length) items.push(h('div.small', h('span.muted', 'Beste Fortsetzung: '), formatLine(line.san.slice(0, 6), ply)));
      if (line.pv?.[0]) board.setShapes([{ orig: line.pv[0].slice(0, 2), dest: line.pv[0].slice(2, 4), brush: 'blue' }]);
      evalEl.append(...items);
    } catch (err) {
      if (alive) clear(evalEl).append(h('div.feedback.bad', 'Engine nicht erreichbar: ' + err.message));
    }
  }

  // Startstellung = Ende der Linie
  board.loadLine(moves);
  const startFen = board.fen();
  restart();

  const offKeys = onKeys({ ArrowLeft: takeBack });

  return {
    board,   // für Tests und Fehlersuche
    destroy() {
      alive = false;
      token++;
      timers.forEach(clearTimeout);
      offKeys();
      board.destroy();
    },
  };
}

