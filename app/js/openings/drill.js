// Stellungstraining: einzelne Stellungen aus dem Repertoire in gemischter Reihenfolge.
// Der Gegner macht seinen Zug, du antwortest. Danach zeigt eine Tabelle, was du auf die anderen
// Gegnerzüge an derselben Stelle spielst („spielt er X, spielst du Y“). So lernst du die Weichen,
// nicht die Reihenfolge einer Linie.
//
// const d = createDrill(el, { model, items, title, onFinish(stats), actions(stats) });  d.destroy()
// items aus logic.drillQueue; stats = { total, correct, misses: [{item, played}] }

import { createBoard } from '../board.js';
import { h, clear, figurine } from '../ui.js';
import { gradeFor, branchTable, treeNode } from './logic.js';
import { saveLineResults, markPracticed } from './data.js';
import { onKeys, moveLabel, sideName, orientationOf, button } from './widgets.js';

const OPP_DELAY = 450;

// Halbzugindex aus einer FEN (für Zugnummern wie „3…“)
function plyOf(fen) {
  const f = fen.split(' ');
  return (Number(f[5] || 1) - 1) * 2 + (f[1] === 'b' ? 1 : 0);
}

export function createDrill(el, { model, items, title = 'Stellungstraining', onFinish, actions }) {
  const boardEl = h('div');
  const progressEl = h('span.pill');
  const contextEl = h('div.small.muted');
  const statusEl = h('div.op-status');
  const coachEl = h('div.op-coach');
  const controls = h('div.row.op-controls');
  el.append(h('div.trainer.op-trainer', boardEl, h('div.side',
    h('div.card.tight.op-head', h('div.row', h('span.pill.good', title), progressEl), contextEl),
    statusEl, coachEl, controls)));

  const board = createBoard(boardEl, { movable: 'none', autoQueen: true });
  const stats = { total: 0, correct: 0, misses: [] };
  let idx = -1;
  let cur = null;           // {item, wrong, hinted, t0, hintLevel}
  let timer = null;
  let primary = null;
  let finished = false;

  const setCoach = (...nodes) => clear(coachEl).append(...nodes.flat().filter(Boolean));
  function setControls(btns) {
    clear(controls);
    primary = btns.find(b => b.primary)?.onClick || null;
    for (const b of btns) controls.append(button(b));
  }
  function setStatus(text, kind = '') {
    statusEl.className = 'op-status' + (kind ? ' ' + kind : '');
    statusEl.textContent = text;
  }

  function next() {
    clearTimeout(timer);
    idx++;
    if (idx >= items.length) { finish(); return; }
    const item = items[idx];
    cur = null;
    progressEl.textContent = `${idx + 1}/${items.length}`;
    const chapter = model.chapterById.get(item.chapterId);
    contextEl.textContent = `${chapter?.title || ''} · du spielst ${sideName(item.side)}`;
    board.setOrientation(orientationOf(item.side));
    board.setShapes([]);
    board.setMovable('none');
    setCoach();
    setControls([]);
    if (item.parent) {
      board.setPosition(item.parent.fen);
      setStatus('Gegner zieht …');
      timer = setTimeout(() => {
        board.move(item.parent.san);
        ask(item);
      }, OPP_DELAY);
    } else {
      board.setPosition(item.fen);
      ask(item);
    }
  }

  function ask(item) {
    cur = { item, wrong: false, hinted: false, t0: Date.now(), hintLevel: 0 };
    setStatus(item.parent
      ? `${sideName(item.side === 'w' ? 'b' : 'w')} spielt ${moveLabel(plyOf(item.parent.fen), item.parent.san)}. Deine Antwort?`
      : 'Dein erster Zug?');
    board.setMovable(orientationOf(item.side));
    board.setOnMove(onUserMove);
    setControls([{ label: 'Hinweis (h)', onClick: hint }]);
  }

  function onUserMove(m) {
    if (!cur) return false;
    const it = cur.item;
    if (m.san === it.san) {
      const grade = cur.wrong ? 0 : gradeFor({ hinted: cur.hinted, ms: Date.now() - cur.t0 });
      saveLineResults([{ key: it.key, grade }]);
      markPracticed(it.key);
      stats.total++;
      if (grade > 0) stats.correct++;
      board.setShapes([]);
      board.setMovable('none');
      if (!cur.wrong) board.flash('good');
      setStatus(cur.wrong ? 'Jetzt sitzt er. Die Stellung kommt bald wieder.' : grade >= 2 ? 'Richtig!' : 'Richtig (mit Hilfe).', cur.wrong ? 'warn' : 'good');
      explain(it);
      cur = null;
      setControls([{ label: idx + 1 < items.length ? 'Weiter ⏎' : 'Fertig ⏎', primary: true, onClick: next }]);
      return true;
    }
    if (!cur.wrong) stats.misses.push({ item: it, played: m.san });
    cur.wrong = true;
    board.flash('bad');
    setStatus(`${figurine(m.san)} ist nicht dein Zug. Zieh ${figurine(it.san)} (Pfeil).`, 'bad');
    explain(it, m.san);
    setTimeout(() => board.setShapes([{ orig: it.from, dest: it.to, brush: 'green' }]), 0);
    return false;
  }

  // Erklärung des Zugs und die Weichentabelle der Stellung davor
  function explain(it, wrongSan) {
    const note = treeNode(model, it.side, it.fen)?.moves.find(x => x.san === it.san)?.notes?.[0];
    const parts = [];
    if (note) parts.push(h('div.op-note.own' + (/Falle/i.test(note) ? '.trap' : ''),
      h('div.op-note-head', h('b', moveLabel(plyOf(it.fen), it.san))), h('div', note)));
    if (it.parent) {
      const rows = branchTable(model, it.side, it.parent.fen);
      if (rows.length > 1) {
        const ply = plyOf(it.parent.fen);
        const opp = sideName(it.side === 'w' ? 'b' : 'w');
        parts.push(h('div.op-note.plan.op-branch',
          h('div.op-note-head', h('b', 'Die Weiche: '), `Was ${opp} hier spielen kann`),
          h('table.op-branch-table', rows.map(r => h('tr' + (r.opp === it.parent.san ? '.cur' : ''),
            h('td', `${opp} ${moveLabel(ply, r.opp)}`),
            h('td', '→'),
            h('td', r.answer ? h('b', moveLabel(ply + 1, r.answer)) : h('span.muted', 'Linie endet')))))));
      }
    }
    if (wrongSan) parts.unshift(h('div.feedback.bad', `Du hast ${figurine(wrongSan)} gespielt.`));
    setCoach(parts);
  }

  function hint() {
    if (!cur) return;
    cur.hinted = true;
    cur.hintLevel++;
    const it = cur.item;
    board.setShapes(cur.hintLevel === 1 ? [{ orig: it.from, brush: 'yellow' }] : [{ orig: it.from, dest: it.to, brush: 'yellow' }]);
    setCoach(h('div.feedback.warn', cur.hintLevel === 1 ? 'Diese Figur zieht. Nochmal Hinweis für den Pfeil.' : 'Der Pfeil zeigt den Zug.'));
  }

  function finish() {
    if (finished) return;
    finished = true;
    board.setMovable('none');
    setStatus(stats.total ? `${stats.correct} von ${stats.total} Stellungen auf Anhieb richtig.` : 'Keine Stellungen.', stats.misses.length ? 'warn' : 'good');
    setCoach(stats.misses.length
      ? h('div.op-mistakes', h('b', 'Hier hakte es:'), h('ul', stats.misses.map(x => h('li',
        `Nach ${moveLabel(plyOf(x.item.parent?.fen || x.item.fen), x.item.parent?.san || '')} spielst du ${figurine(x.item.san)} (du: ${figurine(x.played)})`))))
      : null);
    setControls(actions ? actions(stats) : []);
    onFinish?.(stats);
  }

  const offKeys = onKeys({ h: hint, Enter: () => primary?.() }, el);
  next();

  return {
    board,
    stats,
    destroy() { clearTimeout(timer); offKeys(); board.destroy(); },
  };
}
