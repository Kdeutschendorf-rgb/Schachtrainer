// Aufgaben-Spieler: Brett + Seitenleiste. Wird von der Taktik-Ansicht und vom Tagesplan-Block benutzt.
//
// const t = createTrainer(el, {
//   title,                  // Modusname in der Kopfzeile
//   header,                 // optionales Element über allem (Countdown, Zähler)
//   next(),                 // → nächste Aufgabe (mit Flags rated/repeat/countThemes) oder null
//   onEmpty(),              // es gibt keine Aufgabe mehr
//   onResult(puzzle, res),  // res = {ok, sec, delta, rating}; genau einmal pro Aufgabe
//   beforeNext(),           // false → nicht weiter (z. B. Zeit um)
//   nextLabel(),            // Beschriftung des Weiter-Knopfs
//   rush: false,            // schnelle Folge, kein zweiter Versuch, keine Auswertung
//   autoNext: 0,            // ms bis zur nächsten Aufgabe nach richtiger Lösung (0 = Leertaste)
//   logMinutes: false,      // Übungszeit in store.activity zählen (nicht im Tagesplan)
// });
// t.next()  t.halt()  t.refresh()  t.phase()  t.destroy()

import { createBoard } from '../board.js';
import { h, clear, figurine, feedback } from '../ui.js';
import * as store from '../store.js';
import * as engine from '../engine.js';
import { PuzzleRun, recordAttempt, isProvisional, plyOfFen, sanOf, ensureArea } from './logic.js';
import { themeLabel, themeTip, mistakeTag, CLS_DE, TC_DE, germanDate, openingLabel, speedLabel } from './labels.js';

const COLOR_DE = { w: 'Weiß', b: 'Schwarz' };
const cgColor = c => (c === 'w' ? 'white' : 'black');

export function createTrainer(el, opts = {}) {
  const rush = !!opts.rush;
  const DELAY_FIRST = rush ? 250 : 550;   // Gegnerzug zu Beginn
  const DELAY_REPLY = rush ? 200 : 380;   // Gegnerantwort

  // --- Aufbau ---
  const boardEl = h('div.tk-board');
  const ratingPill = h('span.pill.tk-rating');
  const turnEl = h('div.tk-turn');
  const contextEl = h('div.tk-context.small');
  const feedbackEl = h('div.tk-feedback');
  const hintBtn = h('button', { title: 'Zeigt die Figur, dann den Zug. Die Aufgabe zählt dann als nicht gelöst.', onclick: () => hint() }, 'Hinweis (h)');
  const solveBtn = h('button', { onclick: () => showSolution() }, 'Lösung zeigen');
  const controls = h('div.row.tk-controls', hintBtn, solveBtn);
  const taskCard = h('div.card.tk-task', turnEl, contextEl, feedbackEl, rush ? null : controls);

  const resultLine = h('div.tk-result-line');
  const metaEl = h('div.tk-meta');
  const movesEl = h('div.moves.tk-moves');
  const navPrev = h('button.tk-nav', { title: 'Zurück (←)', onclick: () => step(-1) }, '←');
  const navNext = h('button.tk-nav', { title: 'Vor (→)', onclick: () => step(1) }, '→');
  const analysisEl = h('div.tk-analysis.small');
  const analyseBtn = h('button', { onclick: () => analyse() }, 'Analysieren');
  const lichessLink = h('a.btn', { target: '_blank', rel: 'noopener' }, 'Auf Lichess ansehen');
  const nextBtn = h('button.primary.tk-next', { onclick: () => next() }, 'Weiter');
  const resultCard = h('div.card.tk-result', { hidden: true },
    resultLine, metaEl,
    h('div.tk-replay', h('div.row', navPrev, navNext, h('span.small.muted', 'Lösung nachspielen')), movesEl),
    analysisEl,
    h('div.row', analyseBtn, lichessLink, h('span.spacer'), h('span.small.muted.tk-key', 'Leertaste'), nextBtn));

  const side = h('div.side.tk-side',
    opts.header || null,
    h('div.card.tight.tk-head', h('div.row', h('strong', opts.title || 'Taktik'), h('span.spacer'), ratingPill)),
    taskCard, resultCard);
  const root = h('div.trainer.tk-trainer' + (rush ? '.tk-rush' : ''), boardEl, side);
  el.append(root);
  // Knöpfe nach dem Klick entfokussieren, damit die Leertaste nicht den zuletzt geklickten Knopf auslöst
  side.addEventListener('click', e => e.target.closest('button')?.blur());

  const board = createBoard(boardEl, { movable: 'none', onMove: m => onMove(m) });

  // --- Zustand ---
  let phase = 'idle';        // idle | intro | solving | busy | finished | halted
  let puzzle = null, run = null;
  let token = 0;             // pro Aufgabe; veraltete Rückrufe ignorieren
  let timers = [];
  let graded = false, failed = false, hintLevel = 0, hintPly = -1, t0 = 0, lastRes = null;
  let sol = null, replayIdx = null;
  let destroyed = false;

  const later = (ms, fn) => {
    const my = token;
    timers.push(setTimeout(() => { if (my === token && phase !== 'halted') fn(); }, ms));
  };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function setFeedback(text, kind = 'info') {
    clear(feedbackEl);
    if (text) feedbackEl.append(feedback(text, kind));
  }

  function renderRating() {
    const a = ensureArea(store.get('tactics'));
    ratingPill.textContent = `Wertung ${Math.round(a.rating)}${isProvisional(a) ? '?' : ''}`;
    ratingPill.title = isProvisional(a) ? 'Noch vorläufig: Nach ein paar Aufgaben wird sie genauer.' : `± ${Math.round(a.rd)}`;
  }

  function renderContext() {
    clear(contextEl);
    if (puzzle.source === 'own') {
      const played = figurine(puzzle.played || '?');
      const cls = CLS_DE[puzzle.cls] ? ` – ${CLS_DE[puzzle.cls]}` : '';
      const tc = TC_DE[puzzle.tc] ? ` (${TC_DE[puzzle.tc]})` : '';
      contextEl.append(h('div.tk-own',
        `Aus deiner Partie vom ${germanDate(puzzle.date)}${tc}: Du hast hier `, h('strong', played), ` gespielt${cls}. Finde den besseren Zug.`));
    } else if (puzzle.repeat) {
      contextEl.append(h('span.muted', 'Wiederholung: Diese Aufgabe hast du schon einmal nicht gelöst.'));
    } else if (opts.showTheme && opts.showTheme(puzzle)) {
      contextEl.append(h('span.muted', `Thema: ${opts.showTheme(puzzle)}`));
    }
  }

  // --- Ablauf einer Aufgabe ---
  function load(p) {
    token++;
    clearTimers();
    puzzle = p;
    run = new PuzzleRun(p);
    graded = false; failed = false; hintLevel = 0; hintPly = -1; lastRes = null; sol = null; replayIdx = null;
    resultCard.hidden = true;
    taskCard.hidden = false;
    clear(analysisEl);
    board.setMovable('none');
    board.setPosition(p.fen, { orientation: cgColor(run.userColor) });
    board.setShapes([]);
    turnEl.className = 'tk-turn ' + run.userColor;
    turnEl.textContent = `Du spielst ${COLOR_DE[run.userColor]}`;
    renderContext();
    renderRating();
    setControls(false);
    if (run.waitingForOpponent) {
      phase = 'intro';
      setFeedback('Der Gegner zieht …', 'info');
      later(DELAY_FIRST, () => {
        board.move(run.playOpening());
        startSolving();
      });
    } else {
      startSolving();
    }
  }

  function startSolving() {
    phase = 'solving';
    t0 = performance.now();
    board.setMovable(cgColor(run.userColor));
    setControls(true);
    setFeedback(puzzle.source === 'own' ? '' : 'Finde den besten Zug.', 'info');
  }

  function setControls(on) {
    hintBtn.disabled = !on;
    solveBtn.disabled = !on;
  }

  function onMove(m) {
    if (phase === 'finished') { leaveReplay(); return true; }   // nach der Aufgabe frei weiterziehen
    if (phase !== 'solving') return false;
    const res = run.play(m.uci);
    if (res.result === 'invalid') return false;
    if (res.result === 'correct' || res.result === 'mate') {
      board.flash('good');
      board.setShapes([]);
      if (res.done) return void finish();
      phase = 'busy';
      board.setMovable('none');
      setFeedback(failed ? 'Richtig. Weiter geht’s.' : 'Richtig! Und weiter …', 'good');
      later(DELAY_REPLY, () => {
        board.move(res.reply);
        phase = 'solving';
        board.setMovable(cgColor(run.userColor));
      });
      return;
    }
    // falsch – bei eigenen Aufgaben ab dem 2. Zug kann ein anderer Zug gleich gut sein: Engine fragen
    if (puzzle.source === 'own' && run.userStep > 0) {
      phase = 'busy';
      board.setMovable('none');
      setControls(false);
      setFeedback('Ich prüfe deinen Zug …', 'info');
      const my = token;
      engineAccepts(run.fen(), m.uci, run.userColor).then(okAlt => {
        if (my !== token || phase !== 'busy') return;
        if (okAlt) {
          run.acceptAlternative(m.uci);
          board.flash('good');
          finish();
        } else wrong(res.expected);
      });
      return;
    }
    wrong(res.expected);
  }

  function wrong(expected) {
    markFailed();
    board.flash('bad');
    phase = 'busy';
    board.setMovable('none');
    setControls(false);
    if (rush) {
      setFeedback('Falsch.', 'bad');
      later(350, () => {
        board.undo();
        board.setShapes([{ orig: expected.slice(0, 2), dest: expected.slice(2, 4), brush: 'green' }]);
        later(900, () => finish());
      });
      return;
    }
    setFeedback('Das war nicht der Zug. Versuch es noch einmal oder lass dir die Lösung zeigen.', 'bad');
    later(550, () => {
      board.undo();
      phase = 'solving';
      board.setMovable(cgColor(run.userColor));
      setControls(true);
    });
  }

  async function engineAccepts(fen, uci, color) {
    try {
      const r = await engine.analyse(fen, { depth: 14, multipv: 3 });
      const best = r.lines[0], mine = r.lines.find(l => l.pv[0] === uci);
      if (!best || !mine) return false;
      return engine.winPct(best.score, color) - engine.winPct(mine.score, color) <= 5;
    } catch {
      return false;
    }
  }

  function markFailed() {
    failed = true;
    if (!graded) grade(false);
  }

  // Wertung genau einmal pro Aufgabe
  function grade(ok) {
    graded = true;
    const sec = (performance.now() - t0) / 1000;
    let res;
    store.update('tactics', d => {
      res = recordAttempt(ensureArea(d), {
        puzzle, ok, sec, rated: !!puzzle.rated, countThemes: !!puzzle.countThemes, repeat: !!puzzle.repeat,
      });
    });
    const counts = { puzzles: 1, puzzlesSolved: ok ? 1 : 0 };
    if (opts.logMinutes) counts.minutes = Math.round((Math.min(sec, 180) / 60) * 100) / 100;
    store.logActivity(counts);
    lastRes = { ok, sec, delta: res.delta, rating: res.rating };
    renderRating();
    opts.onResult?.(puzzle, lastRes);
  }

  function hint() {
    if (phase !== 'solving') return;
    const exp = run.expected;
    if (!exp) return;
    // Hinweisstufe gilt pro Zug: beim nächsten eigenen Zug wieder mit der Figur beginnen
    if (hintPly !== run.ply) { hintPly = run.ply; hintLevel = 0; }
    hintLevel++;
    markFailed();
    if (hintLevel === 1) {
      board.setShapes([{ orig: exp.slice(0, 2), brush: 'yellow' }]);
      setFeedback('Hinweis: Diese Figur zieht. (Zählt als nicht gelöst.)', 'warn');
    } else {
      board.setShapes([{ orig: exp.slice(0, 2), dest: exp.slice(2, 4), brush: 'yellow' }]);
      setFeedback('Das ist der Zug. Spiel ihn auf dem Brett.', 'warn');
    }
  }

  function showSolution() {
    if (phase !== 'solving') return;
    markFailed();
    phase = 'busy';
    board.setMovable('none');
    setControls(false);
    setFeedback('So geht’s:', 'warn');
    const stepSol = () => {
      const [mine, reply] = run.reveal();
      if (!mine) return finish();
      board.move(mine);
      board.setShapes([{ orig: mine.slice(0, 2), dest: mine.slice(2, 4), brush: 'green' }]);
      if (reply) later(650, () => { board.move(reply); board.setShapes([]); later(650, stepSol); });
      else later(500, () => finish());
    };
    stepSol();
  }

  function finish() {
    if (phase === 'finished' || phase === 'halted') return;
    phase = 'finished';
    if (!graded) grade(true);
    setControls(false);
    const ok = lastRes.ok;
    if (rush) {
      setFeedback(ok ? 'Richtig!' : 'Nicht gelöst.', ok ? 'good' : 'bad');
      later(ok ? 350 : 150, () => next());
      return;
    }
    taskCard.hidden = true;
    renderResult();
    board.setMovable('turn');
    if (ok && opts.autoNext) later(opts.autoNext, () => next());
  }

  // --- Auswertung ---
  function renderResult() {
    const { ok, sec, delta } = lastRes;
    clear(resultLine);
    const speed = ok ? speedLabel(sec) : '';
    resultLine.append(
      h('div.tk-verdict.' + (ok ? 'good' : 'bad'), ok ? '✓ Gelöst' : '✗ Nicht gelöst'),
      h('div.row.small',
        h('span.muted', `${Math.round(sec)} s`),
        speed ? h('span.pill.good', speed) : null,
        puzzle.rated ? h('span.pill' + (delta >= 0 ? '.good' : '.bad'), `Wertung ${Math.round(lastRes.rating)} (${delta >= 0 ? '+' : ''}${delta})`) : h('span.pill', 'ungewertet')));
    if (run.altMove) {
      const san = sanOf(sol0Fen(), run.altMove);
      resultLine.append(h('div.small.muted', `Dein Zug ${figurine(san)} ist auch gut${puzzle.source === 'own' ? ' (laut Engine gleichwertig)' : ' – er setzt ebenfalls matt'}.`));
    }

    clear(metaEl);
    if (puzzle.source === 'own') {
      metaEl.append(h('div.small', `In der Partie: ${figurine(puzzle.played || '?')}. Fehlertyp: `,
        (puzzle.tags || []).map(mistakeTag).join(', ') || '–'));
    } else {
      metaEl.append(h('div.small.muted', `Aufgabe ${puzzle.id} · Schwierigkeit ${puzzle.rating}`,
        puzzle.opening ? ` · ${openingLabel(puzzle.opening)}` : ''));
    }
    const pills = (puzzle.themes || []).filter(t => !['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM'].includes(t));
    if (pills.length) metaEl.append(h('div.row.tk-themes', pills.map(t => h('span.pill', { title: themeTip(t) }, themeLabel(t)))));
    const tip = pills.map(themeTip).find(Boolean);
    if (tip && !ok) metaEl.append(h('div.small.muted', `${themeLabel(pills.find(t => themeTip(t)))}: ${tip}`));

    // Lösung nachspielen
    sol = run.solution();
    clear(movesEl);
    sol.sans.forEach((san, i) => {
      const ply = sol.startPly + i;
      if (ply % 2 === 0) movesEl.append(`${ply / 2 + 1}. `);
      else if (i === 0) movesEl.append(`${Math.floor(ply / 2) + 1}… `);
      movesEl.append(h('span.mv', { 'data-i': i + 1, onclick: () => goto(i + 1) }, figurine(san)), ' ');
    });
    replayIdx = run.altMove ? null : run.ply;
    markCur();

    lichessLink.hidden = puzzle.source !== 'lichess';
    if (puzzle.source === 'lichess') lichessLink.href = `https://lichess.org/training/${puzzle.id}`;
    analyseBtn.disabled = false;
    nextBtn.textContent = opts.nextLabel?.() || 'Weiter';
    resultCard.hidden = false;
  }

  const sol0Fen = () => {
    // Stellung vor dem alternativen Zug: Lösung bis vor den aktuellen Halbzug
    const s = sol || run.solution();
    return s.fens[Math.max(0, run.ply - 1)];
  };

  function markCur() {
    for (const s of movesEl.querySelectorAll('.mv')) s.classList.toggle('cur', Number(s.dataset.i) === replayIdx);
  }

  function goto(i) {
    if (phase !== 'finished' || !sol) return;
    i = Math.max(0, Math.min(sol.fens.length - 1, i));
    replayIdx = i;
    board.setPosition(sol.fens[i], { lastMove: i > 0 ? sol.ucis[i - 1] : undefined });
    const nxt = sol.ucis[i];
    board.setShapes(nxt ? [{ orig: nxt.slice(0, 2), dest: nxt.slice(2, 4), brush: 'blue' }] : []);
    board.setMovable('turn');
    clear(analysisEl);
    markCur();
  }

  function step(d) {
    if (phase !== 'finished' || !sol) return;
    goto((replayIdx ?? sol.fens.length - 1) + d);
  }

  function leaveReplay() {
    replayIdx = null;
    board.setShapes([]);
    clear(analysisEl);
    markCur();
  }

  async function analyse() {
    if (phase !== 'finished' || analyseBtn.disabled) return;
    const fen = board.fen();
    clear(analysisEl);
    if (board.chess.isGameOver()) {
      analysisEl.append(board.chess.isCheckmate() ? 'Die Stellung ist matt.' : 'Die Partie ist zu Ende.');
      return;
    }
    analyseBtn.disabled = true;
    analysisEl.append(h('span.muted', 'Engine rechnet …'));
    const my = token;
    try {
      const r = await engine.analyse(fen, { depth: 16 });
      if (my !== token || board.fen() !== fen) return;
      const line = r.lines[0];
      clear(analysisEl);
      if (!line) { analysisEl.append('Keine Engine-Zeile.'); return; }
      analysisEl.append(
        h('div', h('strong', engine.formatScore(line.score)), h('span.muted', ' (Sicht Weiß) · Tiefe ' + line.depth)),
        h('div.moves', formatSans(line.san.slice(0, 10), plyOfFen(fen))));
      const b = line.pv[0];
      if (b) board.setShapes([{ orig: b.slice(0, 2), dest: b.slice(2, 4), brush: 'green' }]);
    } catch (e) {
      if (my === token) { clear(analysisEl); analysisEl.append(h('span.muted', 'Engine nicht erreichbar.')); }
    } finally {
      if (my === token) analyseBtn.disabled = false;
    }
  }

  function formatSans(sans, startPly) {
    let out = '';
    sans.forEach((san, i) => {
      const ply = startPly + i;
      if (ply % 2 === 0) out += `${ply / 2 + 1}. `;
      else if (i === 0) out += `${Math.floor(ply / 2) + 1}… `;
      out += figurine(san) + ' ';
    });
    return out.trim();
  }

  // --- Weiter ---
  function next() {
    // nur zwischen zwei Aufgaben; schützt vor Doppelklick und Leertaste-Wiederholung
    if (phase !== 'idle' && phase !== 'finished') return;
    if (opts.beforeNext && opts.beforeNext() === false) return;
    phase = 'idle';
    token++;
    clearTimers();
    const p = opts.next?.();
    if (!p) {
      board.setMovable('none');
      opts.onEmpty?.();
      return;
    }
    load(p);
  }

  // --- Tastatur ---
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, select, textarea')) return;
    if (!root.isConnected) return;
    if (e.key === 'Enter' && e.target.closest?.('a, button')) return;   // fokussierter Link/Knopf hat Vorrang
    if (e.key === ' ' || e.key === 'Enter') {
      if (phase === 'finished' && !rush) { e.preventDefault(); next(); }
      else if (e.key === ' ') e.preventDefault();   // Seite nicht scrollen
    } else if (e.key === 'h' || e.key === 'H') {
      if (!rush) hint();
    } else if (e.key === 'ArrowLeft') {
      if (phase === 'finished') { e.preventDefault(); step(-1); }
    } else if (e.key === 'ArrowRight') {
      if (phase === 'finished') { e.preventDefault(); step(1); }
    }
  }
  document.addEventListener('keydown', onKey);

  return {
    next,
    phase: () => phase,
    puzzle: () => puzzle,
    // Beschriftung des Weiter-Knopfs neu setzen (z. B. „Block abschließen“)
    refresh() {
      nextBtn.textContent = opts.nextLabel?.() || 'Weiter';
      renderRating();
    },
    // alles anhalten (Rush-Ende): Brett sperren, keine Rückrufe mehr
    halt() {
      phase = 'halted';
      token++;
      clearTimers();
      board.setMovable('none');
      setControls(false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      phase = 'halted';
      token++;
      clearTimers();
      document.removeEventListener('keydown', onKey);
      board.destroy();
      root.remove();
    },
  };
}
