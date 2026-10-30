// Eröffnungsquiz: „Wie heißt diese Eröffnung?“ (4 Antworten) und „Finde den Hauptzug“.
//
// const q = createQuiz(el, { pool, onAnswer(right, question), onQuestion, onEmpty, onExit });  q.destroy()
// onQuestion() vor jeder neuen Frage; gibt sie false zurück, kommt keine Frage mehr.
// onEmpty() kommt, wenn sich aus den Daten keine Frage bauen lässt.
// pool aus logic.quizPool (Katalog = deutsche Namen, Lichess = englische Namen).

import { createBoard } from '../board.js';
import { h, clear, figurine, formatLine } from '../ui.js';
import { makeNameQuestion, makeMoveQuestion, checkMoveAnswer } from './logic.js';
import { progress, saveQuiz } from './data.js';
import { onKeys, button } from './widgets.js';

export function createQuiz(el, { pool, onAnswer, onQuestion, onEmpty, onExit }) {
  const hasCatalog = pool.some(p => p.src === 'katalog');
  const hasLichess = pool.some(p => p.src === 'lichess');
  let q = null;
  let answered = false;
  let tries = 0;
  let badData = 0;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  const boardEl = h('div');
  const statsEl = h('div.muted.small');
  const questionEl = h('div.op-quiz-q');
  const answersEl = h('div.op-quiz-answers');
  const feedbackEl = h('div.op-quiz-fb');
  const controls = h('div.row.op-controls');
  el.append(h('div.trainer.op-trainer', boardEl, h('div.side',
    h('div.card.tight.op-head', h('div.row', h('span.pill.good', 'Eröffnungsquiz'), h('span.spacer'), statsEl)),
    questionEl, answersEl, feedbackEl, controls)));

  const board = createBoard(boardEl, { movable: 'none', autoQueen: true, onMove: onUserMove });

  function renderStats() {
    const s = progress().quiz;
    const n = s.right + s.wrong;
    statsEl.textContent = n ? `${s.right}/${n} richtig (${Math.round((100 * s.right) / n)} %)` : '';
  }

  function pickSrc() {
    if (hasCatalog && hasLichess) return Math.random() < 0.6 ? 'katalog' : 'lichess';
    return hasCatalog ? 'katalog' : 'lichess';
  }

  function next() {
    if (onQuestion?.() === false) return;
    timers.forEach(clearTimeout);
    timers = [];
    answered = false;
    tries = 0;
    clear(feedbackEl);
    clear(answersEl);
    board.setShapes([]);
    const src = pickSrc();
    q = Math.random() < 0.5 ? makeNameQuestion(pool, Math.random, src) : makeMoveQuestion(pool, Math.random, src);
    q ||= makeNameQuestion(pool, Math.random) || makeMoveQuestion(pool, Math.random);
    // Fehlerhafte Zugfolgen in den Daten überspringen
    if (q) {
      try {
        board.loadLine(q.type === 'name' ? q.entry.moves : q.setup);
      } catch {
        if (++badData < 10) { next(); return; }
        q = null;
      }
    }
    if (!q) {
      clear(questionEl).append(h('div.feedback.warn', 'Für das Quiz fehlen noch (brauchbare) Daten.'));
      setControls([]);
      onEmpty?.();
      return;
    }
    renderStats();
    if (q.type === 'name') {
      board.setMovable('none');
      board.setOrientation('white');
      clear(questionEl).append(h('h3', 'Wie heißt diese Eröffnung?'), h('div.moves', formatLine(q.entry.moves)));
      q.options.forEach((name, i) => answersEl.append(
        h('button.op-quiz-opt', { onclick: () => answerName(i) }, h('span.op-key', String(i + 1)), name)));
      setControls([{ label: 'Überspringen', onClick: next }]);
    } else {
      board.setOrientation(board.turn() === 'w' ? 'white' : 'black');
      board.setMovable('turn');
      clear(questionEl).append(
        h('h3', 'Finde den Hauptzug'),
        h('div', 'Welcher Zug führt zu ', h('b', q.entry.name), '?'),
        h('div.moves.muted', q.setup.length ? formatLine(q.setup) : 'Grundstellung'));
      setControls([{ label: 'Hinweis (h)', onClick: hint }, { label: 'Überspringen', onClick: next }]);
    }
  }

  let primaryAction = null;
  function setControls(btns) {
    clear(controls);
    primaryAction = null;
    for (const b of btns) {
      controls.append(button(b));
      if (b.primary && !primaryAction) primaryAction = b.onClick;
    }
    if (onExit) controls.append(h('span.spacer'), button({ label: 'Zurück', onClick: onExit }));
  }

  function finish(right) {
    answered = true;
    saveQuiz(right);
    renderStats();
    onAnswer?.(right, q);
    const e = q.entry;
    const info = [];
    if (e.src === 'katalog' || e.eco) info.push(h('div.small.muted', `${e.eco || ''} · ${e.name}`));
    feedbackEl.append(...info);
    setControls([{ label: 'Nächste Frage ⏎', primary: true, onClick: next }]);
  }

  function answerName(i) {
    if (answered || q?.type !== 'name') return;
    const right = i === q.answer;
    [...answersEl.children].forEach((b, j) => {
      b.disabled = true;
      if (j === q.answer) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });
    clear(feedbackEl).append(h(`div.feedback.${right ? 'good' : 'bad'}`, right ? 'Richtig!' : `Leider nein. Richtig ist: ${q.entry.name}`));
    finish(right);
  }

  function onUserMove(m) {
    if (answered || q?.type !== 'move') return false;
    if (checkMoveAnswer(q, m.fen)) {
      board.flash('good');
      board.setMovable('none');
      board.setShapes([]);
      clear(feedbackEl).append(h('div.feedback.good', tries ? `Jetzt stimmt es: ${figurine(m.san)}.` : `Richtig: ${figurine(m.san)}.`));
      finish(tries === 0);
      return true;
    }
    tries++;
    board.flash('bad');
    clear(feedbackEl).append(h('div.feedback.bad', `${figurine(m.san)} ist es nicht. Der Pfeil zeigt ${figurine(q.expected)}. Zieh ihn.`));
    later(() => board.setShapes([{ orig: q.expectedUci.slice(0, 2), dest: q.expectedUci.slice(2, 4), brush: 'green' }]), 0);
    return false;
  }

  function hint() {
    if (answered || q?.type !== 'move') return;
    tries++;
    board.setShapes([{ orig: q.expectedUci.slice(0, 2), brush: 'yellow' }]);
    clear(feedbackEl).append(h('div.feedback.warn', 'Tipp: Diese Figur zieht. (Zählt als falsch.)'));
  }

  const offKeys = onKeys({
    1: () => answerName(0), 2: () => answerName(1), 3: () => answerName(2), 4: () => answerName(3),
    ' ': () => primaryAction?.(),
    Enter: () => primaryAction?.(),
    h: hint,
  }, el);

  next();

  return {
    board,   // für Tests und Fehlersuche
    destroy() {
      timers.forEach(clearTimeout);
      offKeys();
      board.destroy();
    },
  };
}
