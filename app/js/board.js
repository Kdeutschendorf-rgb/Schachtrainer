// Schachbrett: chessground (Darstellung, Drag & Drop) + chess.js (Regeln).
//
// const board = createBoard(el, {
//   fen, orientation: 'white'|'black',
//   movable: 'turn' | 'white' | 'black' | 'none',   // wer ziehen darf ('turn' = Seite am Zug)
//   onMove(move) { ... },  // move = {from, to, promotion, san, uci, fen, color}
//                          // return false → Zug wird zurückgenommen
// });
// board.move('e2e4' | 'Nf3')  board.undo()  board.setPosition(fen)  board.setShapes([...])
// board.flash('good'|'bad')   board.fen()   board.turn()   board.chess   board.destroy()

import { Chessground } from '../vendor/chessground.min.js';
import { Chess } from '../vendor/chess.js';
import { h } from './ui.js';

const PROMO_SYMBOLS = { w: { q: '♕', r: '♖', b: '♗', n: '♘' }, b: { q: '♛', r: '♜', b: '♝', n: '♞' } };

export function parseUci(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}

export function moveToUci(m) {
  return m.from + m.to + (m.promotion || '');
}

export function createBoard(el, opts = {}) {
  el.classList.add('board-wrap');
  const host = h('div');
  el.append(host);
  const chess = new Chess(opts.fen || undefined);
  let movable = opts.movable || 'turn';
  let onMove = opts.onMove || null;
  let lastMove;

  const colorName = c => (c === 'w' ? 'white' : 'black');

  function dests() {
    const map = new Map();
    for (const m of chess.moves({ verbose: true })) {
      if (!map.has(m.from)) map.set(m.from, []);
      map.get(m.from).push(m.to);
    }
    return map;
  }

  function movableColor() {
    if (movable === 'none' || chess.isGameOver()) return undefined;
    const turn = colorName(chess.turn());
    if (movable === 'turn' || movable === 'both') return turn;
    return movable === turn ? turn : undefined;
  }

  function sync(extra = {}) {
    cg.set({
      fen: chess.fen(),
      turnColor: colorName(chess.turn()),
      check: chess.inCheck(),
      lastMove,
      movable: { color: movableColor(), dests: dests() },
      ...extra,
    });
  }

  function askPromotion(color) {
    return new Promise(resolve => {
      const overlay = h('div.promo', ['q', 'r', 'b', 'n'].map(p =>
        h('button', { title: p, onclick: () => { overlay.remove(); resolve(p); } }, PROMO_SYMBOLS[color][p])));
      el.append(overlay);
    });
  }

  async function userMove(from, to) {
    const piece = chess.get(from);
    let promotion;
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) {
      promotion = opts.autoQueen ? 'q' : await askPromotion(piece.color);
    }
    let m;
    try {
      m = chess.move({ from, to, promotion });
    } catch {
      sync();
      return;
    }
    lastMove = [m.from, m.to];
    sync();
    const result = onMove?.(toMoveObj(m));
    if (result === false) api.undo();
  }

  function toMoveObj(m) {
    return { from: m.from, to: m.to, promotion: m.promotion, san: m.san, uci: moveToUci(m), fen: chess.fen(), color: m.color };
  }

  const cg = Chessground(host, {
    fen: chess.fen(),
    orientation: opts.orientation || 'white',
    coordinates: opts.coordinates !== false,
    turnColor: colorName(chess.turn()),
    animation: { enabled: true, duration: 180 },
    highlight: { lastMove: true, check: true },
    premovable: { enabled: false },
    draggable: { showGhost: true },
    drawable: { enabled: true, visible: true },
    movable: { free: false, color: movableColor(), dests: dests(), showDests: true, events: { after: userMove } },
  });

  const api = {
    chess,
    cg,
    fen: () => chess.fen(),
    turn: () => chess.turn(),
    history: () => chess.history({ verbose: true }),
    // Zug per Code ausführen (uci 'e2e4'/'e7e8q' oder SAN 'Nf3'). Gibt Zugobjekt oder null zurück.
    move(mv) {
      let m;
      try {
        m = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mv) ? chess.move(parseUci(mv)) : chess.move(mv);
      } catch {
        return null;
      }
      lastMove = [m.from, m.to];
      sync();
      return toMoveObj(m);
    },
    undo() {
      const m = chess.undo();
      const hist = chess.history({ verbose: true });
      const prev = hist[hist.length - 1];
      lastMove = prev ? [prev.from, prev.to] : undefined;
      sync();
      return m;
    },
    setPosition(fen, { lastMove: lm, orientation } = {}) {
      chess.load(fen);
      lastMove = lm ? [lm.slice(0, 2), lm.slice(2, 4)] : undefined;
      sync(orientation ? { orientation } : {});
      cg.setAutoShapes([]);
    },
    // Partie ab Startstellung/FEN mit Zügen laden (SAN oder UCI), Historie bleibt erhalten.
    loadLine(moves, fen) {
      if (fen) chess.load(fen); else chess.reset();
      for (const mv of moves) {
        const m = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mv) ? chess.move(parseUci(mv)) : chess.move(mv);
        lastMove = [m.from, m.to];
      }
      if (!moves.length) lastMove = undefined;
      sync();
    },
    setOrientation(color) { cg.set({ orientation: color }); },
    flip() { cg.toggleOrientation(); },
    orientation: () => cg.state.orientation,
    setMovable(mode) { movable = mode; sync(); },
    // Freies Ziehen ohne Regelprüfung (für Blind-Rechnen: Zug in der *vorgestellten* Stellung).
    // cb({from, to}) wird nach jedem Ziehen aufgerufen, danach springt das Brett zurück.
    // pickSquares(null) beendet den Modus.
    pickSquares(cb) {
      if (!cb) {
        cg.set({ movable: { free: false, events: { after: userMove } } });
        sync();
        return;
      }
      cg.set({
        movable: {
          free: true, color: 'both', dests: undefined, showDests: false,
          events: { after: (from, to) => { cg.set({ fen: chess.fen(), lastMove }); cb({ from, to }); } },
        },
      });
    },
    setOnMove(fn) { onMove = fn; },
    // shapes: [{orig:'e2', dest:'e4', brush:'green'|'red'|'blue'|'yellow'}] oder Feld-Markierung ohne dest
    setShapes(shapes) { cg.setAutoShapes(shapes || []); },
    flash(kind) {
      el.classList.remove('flash-good', 'flash-bad');
      void el.offsetWidth;
      el.classList.add('flash-' + kind);
      setTimeout(() => el.classList.remove('flash-' + kind), 450);
    },
    redraw() { cg.redrawAll(); },
    destroy() { cg.destroy(); el.innerHTML = ''; },
  };
  return api;
}
