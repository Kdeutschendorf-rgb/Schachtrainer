// Repertoire-Explorer: den Baum am Brett durchklicken. Zu jeder Stellung „Mein Zug hier“ plus Notiz,
// bekannte Gegnerzüge, Linien durch die Stellung. Weicht man ab, zeigt die Engine die beste Antwort.
//
// const x = createExplorer(el, { model, side, moves, chapterId, onLearn(line), onPractice(line), onSpar(line|null, moves, side), onSide(side) });

import { createBoard } from '../board.js';
import { h, clear, figurine, formatLine } from '../ui.js';
import * as engine from '../engine.js';
import { treeNode, fenKey, lineStatus, openingNameFor } from './logic.js';
import { progress, loadNameIndex } from './data.js';
import { onKeys, moveList, moveLabel, sideName, orientationOf, button, priorityBadge, put } from './widgets.js';

function userScore(score, side) {
  if (side === 'w') return score;
  return score.mate != null ? { mate: -score.mate } : { cp: -score.cp };
}

// Gemeinsamer Anfang aller Linien eines Kapitels (Startpunkt beim Kapitelwechsel)
function commonPrefix(lines) {
  if (!lines.length) return [];
  const out = [];
  for (let i = 0; ; i++) {
    const san = lines[0].moves[i];
    if (san == null || lines.some(l => l.moves[i] !== san)) return out;
    out.push(san);
  }
}

export function createExplorer(el, { model, side = 'w', moves = [], chapterId, onLearn, onPractice, onSpar, onSide }) {
  let path = moves.slice();
  let cursor = path.length;
  let alive = true;
  let token = 0;
  let nameIndex = null;

  if (chapterId && !moves.length) {
    const ch = model.chapterById.get(chapterId);
    if (ch) { side = ch.side; path = commonPrefix(ch.lines); cursor = path.length; }
  }

  const boardEl = h('div');
  const headEl = h('div.card.tight.op-head');
  const nameEl = h('div.op-opname.muted.small');
  const infoEl = h('div.op-explore-info');
  const movesBox = h('div.op-movesbox');
  const linesEl = h('div.op-explore-lines');
  const nav = h('div.row.op-controls',
    button({ label: '⏮', title: 'Grundstellung', onClick: () => goto(0) }),
    button({ label: '←', title: 'Zug zurück (←)', onClick: () => goto(cursor - 1) }),
    button({ label: '→', title: 'Zug vor (→)', onClick: () => goto(cursor + 1) }),
    button({ label: 'Brett drehen', onClick: () => board.flip() }));
  el.append(h('div.trainer.op-trainer', boardEl, h('div.side', headEl, nameEl, nav, movesBox, infoEl, linesEl)));

  const board = createBoard(boardEl, { orientation: orientationOf(side), movable: 'turn', autoQueen: false, onMove: onUserMove });

  loadNameIndex().then(idx => { if (alive && idx) { nameIndex = idx; renderName(); } });

  function renderHead() {
    const chapters = model.chapters.filter(c => c.side === side);
    const sel = h('select', {
      onchange: () => {
        const ch = model.chapterById.get(sel.value);
        if (ch) { path = commonPrefix(ch.lines); goto(path.length); }
      },
    }, h('option', { value: '' }, 'Kapitel wählen …'), chapters.map(c => h('option', { value: c.id }, `${c.group} · ${c.title}`)));
    clear(headEl).append(
      h('div.row',
        h('span.pill.good', 'Explorer'),
        ['w', 'b'].map(s => h('button.op-seg' + (s === side ? '.active' : ''), { onclick: () => switchSide(s) }, `Repertoire ${sideName(s)}`))),
      h('div.row', sel));
  }

  function switchSide(s) {
    if (s === side) return;
    side = s;
    path = [];
    board.setOrientation(orientationOf(side));
    onSide?.(side);
    renderHead();
    goto(0);
  }

  function fensAlongPath() {
    return board.history().map(m => m.after);
  }

  function renderName() {
    if (!nameIndex) return;
    const fens = fensAlongPath();
    const hit = openingNameFor(nameIndex, fens);
    nameEl.textContent = hit ? `${hit.eco} · ${hit.name}` : '';
  }

  function goto(n) {
    n = Math.max(0, Math.min(path.length, n));
    cursor = n;
    board.loadLine(path.slice(0, n));
    render();
  }

  function onUserMove(m) {
    if (path[cursor] !== m.san) path = path.slice(0, cursor).concat(m.san);
    cursor++;
    render();
    return true;
  }

  function playMove(san) {
    const m = board.move(san);
    if (m) onUserMove(m);
  }

  function render() {
    token++;
    renderMoves();
    renderName();
    const fen = board.fen();
    const node = treeNode(model, side, fen);
    const myTurn = board.turn() === side;
    const items = [];
    const shapes = [];
    clear(linesEl);

    if (node) {
      const own = node.moves.filter(m => m.own);
      const opp = node.moves.filter(m => !m.own);
      if (myTurn && own.length) {
        items.push(h('div.op-section-title', 'Mein Zug hier'));
        for (const m of own) {
          shapes.push({ orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: 'green' });
          items.push(h('div.op-note.own',
            h('div.op-note-head', h('button.op-movebtn', { onclick: () => playMove(m.san) }, moveLabel(cursor, m.san))),
            m.notes.map(n => h('div', n))));
        }
        if (own.length > 1) items.push(h('div.feedback.warn.small', 'Achtung: Hier stehen mehrere eigene Züge im Repertoire (Widerspruch zwischen Linien).'));
      } else if (!myTurn && opp.length) {
        items.push(h('div.op-section-title', 'Gegnerzüge im Repertoire'));
        for (const m of opp) {
          shapes.push({ orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: 'blue' });
          items.push(h('div.op-note' + (m.notes.some(n => /Falle/i.test(n)) ? '.trap' : ''),
            h('div.op-note-head', h('button.op-movebtn', { onclick: () => playMove(m.san) }, moveLabel(cursor, m.san)),
              h('span.muted.small', ` ${m.lineIds.length} Linie${m.lineIds.length === 1 ? '' : 'n'}`)),
            m.notes.map(n => h('div.small', n))));
        }
        items.push(h('div.muted.small', 'Spiel einen anderen Zug am Brett, um zu sehen, was die Engine empfiehlt.'));
      } else {
        // Ende einer oder mehrerer Linien
        const ending = model.lines.filter(l => l.side === side && fenKey(l.plies[l.plies.length - 1].fenAfter) === node.key);
        items.push(h('div.feedback.good', 'Ende der Repertoire-Linie.'));
        for (const l of ending) if (l.plan) items.push(h('div.op-note.plan', h('div.op-note-head', h('b', l.name)), h('div', l.plan)));
        if (onSpar) items.push(button({ label: 'Ab hier sparren', primary: true, onClick: () => onSpar(ending[0] || null, path.slice(0, cursor), side) }));
      }
    } else {
      items.push(h('div.feedback.warn', 'Nicht im Repertoire.'));
      // Wo ist der Pfad abgewichen?
      const hist = board.history();
      const tmp = path.slice(0, cursor);
      let dev = -1;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (treeNode(model, side, hist[i].before)) { dev = i; break; }
      }
      if (dev >= 0) {
        const devNode = treeNode(model, side, hist[dev].before);
        const devOwn = hist[dev].color === side;
        const rep = devNode.moves.filter(m => m.own === devOwn).map(m => figurine(m.san));
        if (rep.length) {
          items.push(h('div.small', devOwn
            ? `Mit ${moveLabel(dev, tmp[dev])} hast du dein Repertoire verlassen. Dort steht ${rep.join(' / ')}.`
            : `${moveLabel(dev, tmp[dev])} kommt in deinem Repertoire nicht vor (dort: ${rep.join(', ')}).`));
          items.push(button({ label: 'Zurück zum Repertoire', onClick: () => goto(dev) }));
        }
      }
      const ev = h('div.op-engine', h('div.muted.small', 'Engine rechnet (Tiefe 18) …'));
      items.push(ev);
      runEngine(fen, ev);
    }
    board.setShapes(shapes);
    clear(infoEl).append(...items);

    // Linien durch diese Stellung
    if (node) {
      const through = model.lines.filter(l => l.side === side &&
        (l.plies.some(p => fenKey(p.fenBefore) === node.key) || fenKey(l.plies[l.plies.length - 1].fenAfter) === node.key));
      if (through.length) {
        const prog = progress();
        linesEl.append(h('div.op-section-title', `Linien durch diese Stellung (${through.length})`));
        for (const l of through.slice(0, 12)) {
          const st = lineStatus(l, prog);
          const ch = model.chapterById.get(l.chapterId);
          linesEl.append(h('div.op-linerow',
            h('div.op-linerow-main', h('div', l.name), h('div.muted.small', ch?.title || '')),
            priorityBadge(ch?.priority),
            st.learned ? h('span.pill.good', st.due ? `${st.due} fällig` : 'gelernt') : h('span.pill', 'neu'),
            st.learned
              ? (onPractice ? button({ label: 'Üben', onClick: () => onPractice(l) }) : null)
              : (onLearn ? button({ label: 'Lernen', onClick: () => onLearn(l) }) : null)));
        }
        if (through.length > 12) linesEl.append(h('div.muted.small', `… und ${through.length - 12} weitere`));
      }
    }
  }

  async function runEngine(fen, box) {
    const my = token;
    try {
      const res = await engine.analyse(fen, { depth: 18 });
      if (!alive || my !== token) return;
      const line = res.lines[0];
      if (!line) { clear(box).append(h('div.muted.small', 'Keine Züge mehr (Partie vorbei).')); return; }
      const ply = board.history().length;
      const best = line.san?.[0];
      const mine = board.turn() === side;
      put(box,
        h('div', h('b', mine ? 'Beste Antwort für dich: ' : 'Bester Zug für den Gegner: '), best ? moveLabel(ply, best) : '–',
          h('span.muted', `  (${engine.formatScore(userScore(line.score, side))} aus deiner Sicht)`)),
        line.san?.length ? h('div.small.muted', formatLine(line.san.slice(0, 8), ply)) : null,
        best ? button({ label: `${figurine(best)} ausführen`, onClick: () => playMove(best) }) : null);
      if (line.pv?.[0]) board.setShapes([{ orig: line.pv[0].slice(0, 2), dest: line.pv[0].slice(2, 4), brush: mine ? 'green' : 'blue' }]);
    } catch (err) {
      if (alive && my === token) clear(box).append(h('div.feedback.bad.small', 'Engine nicht erreichbar: ' + err.message));
    }
  }

  function renderMoves() {
    clear(movesBox).append(moveList(path, { cur: cursor - 1, onClick: i => goto(i + 1), faded: cursor }));
  }

  const offKeys = onKeys({
    ArrowLeft: () => goto(cursor - 1),
    ArrowRight: () => goto(cursor + 1),
    Home: () => goto(0),
  });

  renderHead();
  goto(cursor);

  return {
    board,   // für Tests und Fehlersuche
    destroy() {
      alive = false;
      token++;
      offKeys();
      board.destroy();
    },
    setSide: switchSide,
  };
}
