// Linientrainer: Lernen (Vorführung → sofort nachspielen) und Wiederholen (linienweise, SRS).
//
// const t = createLineTrainer(el, { model, line, mode: 'learn'|'review', onFinish, actions, onExit });
// onFinish(result) kommt einmal nach dem gewerteten Durchgang:
//   result = { line, mode, total, correct, results: [{key, grade, san}], mistakes: [...], saved }
// actions(result) → [{label, onClick, primary}] erscheinen nach dem Durchgang (Enter = erster primärer Knopf).
// t.destroy() räumt auf.
//
// Mit `stage` läuft die Linie als Lernstufe (siehe STAGES in logic.js):
//   1 selber finden, danach aus dem Kopf · 2 zusätzlich „Was greift der Gegner an?“ · 3 aus dem Kopf, ohne Hilfe
//   4 mit Zeitdruck · 5 danach gegen die Engine weiterspielen. result.stageAfter ist die neue Stufe.
// practice: true → nichts speichern (Fallen-Modus).

import { createBoard } from '../board.js';
import { h, clear, figurine, formatLine } from '../ui.js';
import { Chess } from '../../vendor/chess.js';
import { ownMovesAt, gradeFor, firstNewPly, STAGES, nextStage, attackedBy, lineBranches } from './logic.js';
import { progress, saveLineResults, setStage } from './data.js';
import * as store from '../store.js';
import { analyse, bestMove, winPct } from '../engine.js';
import { onKeys, moveLabel, moveList, sideName, orientationOf, priorityBadge, button } from './widgets.js';

const OPP_DELAY = 400;
const TEMPO_MS = 6000;      // Stufe 4: Zeit pro Zug
const SPAR_MOVES = 8;       // Stufe 5: so viele eigene Züge nach dem Ende der Linie
const SPAR_MAX_DROP = 20;   // so viel Gewinnchance (Prozentpunkte) darf dabei verloren gehen

export function createLineTrainer(el, { model, line, mode = 'review', onFinish, actions, onExit, stage = null, practice = false }) {
  const chapter = model.chapterById.get(line.chapterId);
  const side = line.side;
  const orient = orientationOf(side);
  const plies = line.plies;
  const ownTotal = plies.filter(p => p.own).length;

  const boardEl = h('div');
  const statusEl = h('div.op-status');
  const coachEl = h('div.op-coach');
  const movesBox = h('div.op-movesbox');
  const controls = h('div.row.op-controls');
  const header = h('div.card.tight.op-head',
    h('div.row',
      h('span.pill' + (mode === 'learn' ? '.good' : ''), stage ? `Stufe ${stage}/5: ${STAGES[stage]}` : practice ? 'Fallen' : mode === 'learn' ? 'Neue Linie' : 'Wiederholung'),
      priorityBadge(chapter?.priority),
      h('span.pill', `Du: ${sideName(side)}`)),
    h('h3.op-title', chapter?.title || ''),
    stage >= 3 || practice ? null : h('div.muted.small', line.name));   // ab Stufe 3 weißt du nicht, welche Abzweigung kommt
  el.append(h('div.trainer.op-trainer', boardEl, h('div.side', header, statusEl, coachEl, movesBox, controls)));

  const board = createBoard(boardEl, { orientation: orient, movable: 'none', autoQueen: true });

  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const stopTimers = () => { timers.forEach(clearTimeout); timers = []; };

  let phase = 'idle';      // demo | play | done
  let idx = 0;             // Demo: Anzahl ausgeführter Halbzüge
  let demoStart = 0;       // Demo beginnt hier (bekannter Anfang übersprungen)
  let p = 0;               // Nachspielen: nächster Halbzug
  let cur = null;          // aktueller eigener Zug {ply, wrong, hinted, alt, t0, hintLevel}
  let results = [];
  let mistakes = [];
  let graded = false;      // gewerteter Durchgang schon vorbei?
  let autoplay = null;
  let autoTimer = null;
  let primaryAction = null;
  let finding = false;     // Stufe 1: erster Durchgang, eigene Züge selbst finden
  let foundFirst = 0;      // davon auf Anhieb gefunden
  let question = null;     // Stufe 2: offene Frage {targets, ply}
  let questionMisses = 0;
  let hintedAny = false;
  let tempoTimer = null;
  let sparEnded = false;

  // ---------- Anzeige ----------

  function setStatus(text, kind = '') {
    statusEl.className = 'op-status' + (kind ? ' ' + kind : '');
    statusEl.textContent = text;
  }

  function noteBlock(ply, { prefix } = {}) {
    const trap = /Falle/i.test(ply.note);
    return h('div.op-note' + (trap ? '.trap' : '') + (ply.own ? '.own' : ''),
      h('div.op-note-head', prefix ? prefix + ' ' : '', h('b', moveLabel(ply.i, ply.san)), ply.own ? '' : h('span.muted.small', ' (Gegner)')),
      ply.note ? h('div', ply.note) : null);
  }

  function setCoach(...nodes) {
    clear(coachEl).append(...nodes.flat().filter(Boolean));
  }

  function setControls(btns) {
    clear(controls);
    primaryAction = null;
    for (const b of btns.filter(Boolean)) {
      controls.append(button(b));
      if (b.primary && !primaryAction && !b.disabled) primaryAction = b.onClick;
    }
    if (onExit && phase !== 'done') controls.append(h('span.spacer'), button({ label: 'Abbrechen', onClick: onExit }));
  }

  function renderMoves(count, curIdx = count - 1) {
    const box = moveList(line.moves.slice(0, count), {
      cur: curIdx,
      onClick: phase === 'demo' ? i => demoGoto(i + 1) : null,
    });
    clear(movesBox).append(box);
  }

  // ---------- Vorführung (nur Lernen) ----------

  function startDemo() {
    phase = 'demo';
    stopAuto();
    idx = demoStart = firstNewPly(line, progress());
    board.setMovable('none');
    board.setOnMove(null);
    board.loadLine(line.moves.slice(0, idx));
    showDemo();
  }

  function showDemo() {
    renderMoves(idx);
    const next = plies[idx];
    board.setShapes(next ? [{ orig: next.from, dest: next.to, brush: next.own ? 'green' : 'blue' }] : []);
    const items = [];
    if (idx > 0) items.push(noteBlock(plies[idx - 1]));
    else if (chapter?.intro) items.push(h('div.op-note', h('div.op-note-head', h('b', 'Worum es geht')), h('div', chapter.intro)));
    const skipped = demoStart;
    if (skipped > 0 && idx === skipped) items.unshift(h('div.muted.small', `Den Anfang ${formatLine(line.moves.slice(0, skipped))} kennst du schon.`));
    if (idx >= plies.length) {
      if (line.plan) items.push(h('div.op-note.plan', h('div.op-note-head', h('b', 'Wie es weitergeht')), h('div', line.plan)));
      setStatus('Ende der Linie. Jetzt spielst du sie selbst nach.', 'good');
      setControls([
        { label: '← Zurück', onClick: () => demoStep(-1) },
        { label: 'Jetzt selbst nachspielen ⏎', primary: true, onClick: () => startPlay() },
      ]);
    } else {
      setStatus(`Schau zu und lies mit (${idx}/${plies.length}). Pfeil = nächster Zug.`);
      setControls([
        { label: '← Zurück', onClick: () => demoStep(-1), disabled: idx === 0 },
        { label: 'Weiter → (Leertaste)', primary: true, onClick: () => demoStep(1) },
        { label: autoplay ? 'Pause' : 'Automatisch', onClick: toggleAuto },
        { label: 'Direkt nachspielen', onClick: () => startPlay() },
      ]);
    }
    setCoach(items);
  }

  function demoStep(dir) {
    if (phase !== 'demo') return;
    if (dir > 0 && idx < plies.length) { board.move(plies[idx].san); idx++; }
    else if (dir < 0 && idx > 0) { board.undo(); idx--; stopAuto(); }
    else if (dir > 0) stopAuto();
    showDemo();
  }

  function demoGoto(n) {
    stopAuto();
    idx = n;
    board.loadLine(line.moves.slice(0, n));
    showDemo();
  }

  function toggleAuto() {
    if (autoplay) { stopAuto(); showDemo(); return; }
    autoplay = true;
    const tick = () => {
      if (!autoplay || phase !== 'demo') return;
      if (idx >= plies.length) { stopAuto(); showDemo(); return; }
      demoStep(1);
      const note = plies[idx - 1]?.note || '';
      autoTimer = later(tick, Math.min(7000, 1100 + note.length * 40));
    };
    tick();
  }

  function stopAuto() { autoplay = null; clearTimeout(autoTimer); }

  // ---------- Nachspielen / Wiederholen ----------

  // Stufe 1: Vor dem ersten Durchgang der Plan, dann findest du deine Züge selbst
  function startFind() {
    startPlay(true);
    setCoach(
      chapter?.intro ? h('div.op-note', h('div.op-note-head', h('b', 'Worum es geht')), h('div', chapter.intro)) : null,
      line.plan ? h('div.op-note.plan', h('div.op-note-head', h('b', 'Dein Plan')), h('div', line.plan)) : null,
      h('div.muted.small', 'Überleg bei jedem Zug selbst, was du spielen würdest. Ein falscher Versuch kostet nichts.'));
  }

  function startPlay(find = false) {
    stopAuto();
    stopTimers();
    phase = 'play';
    finding = find;
    foundFirst = 0;
    questionMisses = 0;
    hintedAny = false;
    p = 0;
    cur = null;
    results = [];
    mistakes = [];
    board.setShapes([]);
    board.loadLine([]);
    board.setMovable(orient);
    board.setOnMove(onUserMove);
    setCoach(h('div.muted', graded
      ? 'Übungsdurchgang (wird nicht gewertet).'
      : mode === 'learn' ? 'Spiel die Linie aus dem Gedächtnis nach. Die Züge des Gegners kommen automatisch.'
        : 'Finde alle deine Repertoirezüge. Die Züge des Gegners kommen automatisch.'));
    advance();
  }

  function ownDone() {
    return plies.slice(0, p).filter(x => x.own).length;
  }

  function advance() {
    renderMoves(p);
    if (p >= plies.length) { finishPlay(); return; }
    const ply = plies[p];
    if (ply.own) {
      cur = { ply, wrong: false, hinted: false, alt: false, t0: Date.now(), hintLevel: 0 };
      setStatus(finding ? `Was würdest du hier spielen? (${ownDone() + 1}/${ownTotal})` : `Dein Zug (${ownDone() + 1}/${ownTotal})`);
      setControls(stage >= 3 || practice || finding ? [] : [{ label: 'Hinweis (h)', onClick: hint }]);
      if (stage === 4 && !graded) startTempo();
      return;
    }
    cur = null;
    setStatus('Gegner zieht …');
    setControls([]);
    later(() => {
      if (phase !== 'play') return;
      board.move(ply.san);
      // Gegnernotizen beim Lernen immer zeigen, beim Wiederholen nur Fallen
      if (ply.note && (mode === 'learn' || stage === 2 || /Falle/i.test(ply.note))) setCoach(noteBlock(ply));
      p++;
      if (stage === 2 && !graded && askQuestion(ply)) return;
      advance();
    }, OPP_DELAY);
  }

  function onUserMove(m) {
    if (phase === 'spar') return onSparMove(m);
    if (phase !== 'play' || !cur) return false;
    const exp = cur.ply;
    if (m.uci === exp.uci || m.san === exp.san) {
      stopTempo();
      const ms = Date.now() - cur.t0;
      if (finding && !cur.wrong) foundFirst++;
      const grade = finding ? (cur.wrong ? 1 : 2) : cur.wrong ? 0 : gradeFor({ hinted: cur.hinted || cur.alt, ms });
      results.push({ key: exp.key, grade, san: exp.san, ply: exp.i });
      board.setShapes([]);
      if (!cur.wrong) {
        board.flash('good');
        setCoach(noteBlock(exp, { prefix: finding ? '✓ Selbst gefunden' : grade >= 2 ? '✓' : '✓ (mit Hilfe)' }));
      } else {
        setCoach(h('div.muted.small', 'Gut, jetzt sitzt der Zug. Er kommt bald wieder dran.'), noteBlock(exp));
      }
      cur = null;
      p++;
      advance();
      return true;
    }
    // Anderer eigener Repertoirezug in dieser Stellung (andere Linie): kein Fehler
    const alt = ownMovesAt(model, side, exp.fenBefore).some(a => a.san === m.san && a.san !== exp.san);
    const arrow = [{ orig: exp.from, dest: exp.to, brush: alt ? 'blue' : 'green' }];
    if (alt) {
      cur.alt = true;
      setCoach(h('div.feedback.info', `${figurine(m.san)} steht auch in deinem Repertoire, aber in dieser Linie geht es mit ${figurine(exp.san)} weiter. Zieh ${figurine(exp.san)}.`));
    } else {
      if (!cur.wrong) mistakes.push({ ply: exp.i, expected: exp.san, played: m.san });
      cur.wrong = true;
      stopTempo();
      board.flash('bad');
      setCoach(
        h('div.feedback.bad', `${figurine(m.san)} ist nicht dein Repertoirezug. Richtig ist ${figurine(exp.san)}. Zieh ihn jetzt selbst.`),
        noteBlock(exp));
      setStatus(`Zieh ${figurine(exp.san)} (Pfeil)`, 'bad');
    }
    // Pfeil erst nach dem automatischen Zurücknehmen setzen
    later(() => board.setShapes(arrow), 0);
    return false;
  }

  function hint() {
    if (phase !== 'play' || !cur || stage >= 3 || practice || finding) return;
    cur.hinted = true;
    hintedAny = true;
    cur.hintLevel++;
    const exp = cur.ply;
    if (cur.hintLevel === 1) {
      board.setShapes([{ orig: exp.from, brush: 'yellow' }]);
      setCoach(h('div.feedback.warn', 'Tipp: Diese Figur zieht. Nochmal h für den Pfeil.'));
    } else {
      board.setShapes([{ orig: exp.from, dest: exp.to, brush: 'yellow' }]);
      setCoach(h('div.feedback.warn', 'Tipp: Der Pfeil zeigt den Zug.'), exp.note ? noteBlock(exp) : null);
    }
  }

  // Stufe 4: Zeit pro Zug. Läuft sie ab, zählt das wie ein Fehler und der Pfeil zeigt den Zug.
  function startTempo() {
    stopTempo();
    const bar = h('div.op-tempo', h('span', { style: { animationDuration: `${TEMPO_MS}ms` } }));
    statusEl.append(bar);
    tempoTimer = setTimeout(() => {
      if (phase !== 'play' || !cur || cur.wrong) return;
      const exp = cur.ply;
      mistakes.push({ ply: exp.i, expected: exp.san, played: '(Zeit um)' });
      cur.wrong = true;
      board.flash('bad');
      setStatus(`Zeit um. Zieh ${figurine(exp.san)} (Pfeil)`, 'bad');
      setCoach(noteBlock(exp));
      board.setShapes([{ orig: exp.from, dest: exp.to, brush: 'green' }]);
    }, TEMPO_MS);
  }

  function stopTempo() {
    clearTimeout(tempoTimer);
    statusEl.querySelector('.op-tempo')?.remove();
  }

  // Stufe 2: Greift der Gegnerzug etwas an, tippst du es an, bevor du antwortest
  function askQuestion(ply) {
    const targets = attackedBy(ply.fenAfter, ply);
    if (!targets.length) return false;
    question = { targets };
    board.setMovable('none');
    setStatus(`Was greift ${figurine(ply.san)} an? Tippe die Figur an.`);
    setControls([]);
    return true;
  }

  function answerQuestion(sq) {
    if (!question) return;
    const ok = question.targets.includes(sq);
    if (!ok) questionMisses++;
    const shapes = question.targets.map(t => ({ orig: t, brush: ok ? 'green' : 'red' }));
    question = null;
    board.flash(ok ? 'good' : 'bad');
    board.setShapes(shapes);
    board.setMovable(orient);
    later(() => { if (phase === 'play') board.setShapes([]); }, 900);
    advance();
  }
  board.cg.set({ events: { select: sq => answerQuestion(sq) } });

  // Stufe 5: Am Ende der Linie geht die Partie gegen die Engine weiter
  let sparStart = null;
  let sparCount = 0;
  let sparFinish = null;
  function startSpar(finish) {
    phase = 'spar';
    sparCount = 0;
    sparFinish = finish;
    sparStart = board.fen();
    const elo = Math.max(1320, Math.round(store.get('play').rating || 1320));
    sparElo = elo;
    setStatus(`Weiterspielen: ${SPAR_MOVES} Züge gegen die Engine (${elo}). Setz deinen Plan um.`);
    setCoach(line.plan ? h('div.op-note.plan', h('div.op-note-head', h('b', 'Dein Plan')), h('div', line.plan)) : null);
    setControls([]);
    board.setMovable(orient);
    board.setOnMove(onUserMove);
  }
  let sparElo = 1320;

  function onSparMove() {
    sparCount++;
    board.setMovable('none');
    const my = sparToken = sparToken + 1;
    later(async () => {
      if (board.chess.isGameOver() || sparCount >= SPAR_MOVES) return endSpar();
      setStatus('Engine zieht …');
      let uci = null;
      try { uci = await bestMove(board.fen(), { elo: sparElo, movetime: 400 }); } catch { /* unten */ }
      if (my !== sparToken || phase !== 'spar') return;
      if (!uci) return endSpar();
      board.move(uci);
      if (board.chess.isGameOver()) return endSpar();
      setStatus(`Dein Zug (${sparCount + 1}/${SPAR_MOVES})`);
      board.setMovable(orient);
    }, 0);
    return true;
  }
  let sparToken = 0;

  async function endSpar() {
    if (sparEnded) return;
    sparEnded = true;
    phase = 'done';
    board.setMovable('none');
    setStatus('Stellung wird bewertet …');
    const final = board.chess;
    let ok = false, drop = null;
    try {
      if (final.isCheckmate()) ok = final.turn() !== side;
      else if (final.isGameOver()) ok = true;
      else {
        const [a, b] = await Promise.all([analyse(sparStart, { movetime: 700 }), analyse(board.fen(), { movetime: 700 })]);
        drop = winPct(a.lines[0].score, side) - winPct(b.lines[0].score, side);
        ok = drop <= SPAR_MAX_DROP;
      }
    } catch { ok = true; }
    sparFinish?.(ok, drop);
  }

  function finishPlay() {
    if (finding) { finishFind(); return; }
    if (stage === 5 && !graded && !mistakes.length && !sparEnded && !practice) {
      startSpar((ok, drop) => completePlay({ sparOk: ok, sparDrop: drop }));
      return;
    }
    completePlay({});
  }

  // Stufe 1: Erster Durchgang vorbei, jetzt das Ganze aus dem Kopf
  function finishFind() {
    finding = false;
    cur = null;
    board.setMovable('none');
    board.setOnMove(null);
    setStatus(`${foundFirst} von ${ownTotal} Zügen selbst gefunden.`, 'good');
    setCoach(line.plan ? h('div.op-note.plan', h('div.op-note-head', h('b', 'Dein Plan')), h('div', line.plan)) : null);
    setControls([{ label: 'Jetzt aus dem Kopf ⏎', primary: true, onClick: () => startPlay() }]);
  }

  function completePlay({ sparOk, sparDrop }) {
    phase = 'done';
    cur = null;
    board.setMovable('none');
    board.setOnMove(null);
    const total = results.length;
    const correct = results.filter(r => r.grade > 0).length;
    const firstRun = !graded;
    let saved = null;
    let stageAfter = stage;
    if (firstRun) {
      graded = true;
      if (!practice) saved = saveLineResults(results.map(r => ({ key: r.key, grade: r.grade })), { learnLineId: mode === 'learn' ? line.id : undefined });
      if (stage && !practice) {
        stageAfter = nextStage(stage, { mistakes: mistakes.length + questionMisses, hinted: hintedAny, sparOk });
        setStage(line.id, stageAfter);
      }
    }
    const result = { line, mode, total, correct, results, mistakes, saved, stageAfter };

    const kind = mistakes.length ? 'warn' : 'good';
    setStatus(mistakes.length ? `Geschafft, mit ${mistakes.length} Fehler${mistakes.length === 1 ? '' : 'n'}.` : 'Perfekt, alles richtig!', kind);
    const items = [h(`div.feedback.${kind}`, `${correct} von ${total} eigenen Zügen richtig${firstRun ? '' : ' (Übung)'}.`)];
    if (mistakes.length) {
      items.push(h('div.op-mistakes', h('b', 'Hier hakte es:'),
        h('ul', mistakes.map(x => h('li', `${moveLabel(x.ply, x.expected)} (du: ${figurine(x.played)})`)))));
      if (firstRun) items.push(h('div.muted.small', 'Diese Züge kommen heute noch einmal dran.'));
    }
    if (saved?.newCards) items.push(h('div.muted.small', `${saved.newCards} neue Karte${saved.newCards === 1 ? '' : 'n'} gelernt. Morgen fragt dich der Trainer wieder ab.`));
    if (sparOk != null) items.push(h(`div.feedback.${sparOk ? 'good' : 'bad'}`, sparOk
      ? 'Stellung gehalten: Du hast den Plan sauber umgesetzt.'
      : `Die Stellung ist gekippt${sparDrop != null ? ` (${Math.round(sparDrop)} Prozentpunkte Gewinnchance verloren)` : ''}. Die Stufe kommt noch einmal.`));
    if (stage && firstRun && !practice && stageAfter !== stage) items.push(h('div.small', stageAfter > stage ? `Geschafft! Nächstes Mal: Stufe ${stageAfter}, ${STAGES[stageAfter]}.` : `Nächstes Mal wieder Stufe ${stageAfter}, ${STAGES[stageAfter]}.`));
    if (line.plan) items.push(h('div.op-note.plan', h('div.op-note-head', h('b', 'Wie es weitergeht')), h('div', line.plan)));
    const branches = lineBranches(model, line);
    if (branches.length) items.push(h('details.op-note.op-branch', h('summary', h('b', 'Die Weichen dieser Linie')),
      branches.map(b => h('div.small', `Nach ${formatLine(b.before)}:`, h('ul', b.rows.map(r => h('li' + (r.current ? '.op-branch-cur' : ''), `${moveLabel(b.ply, r.opp)} → ${r.answer ? moveLabel(b.ply + 1, r.answer) : 'Linie endet'}`)))))));
    setCoach(items);

    const extra = actions ? actions(result) : [];
    const btns = [];
    if (mistakes.length) btns.push({ label: 'Noch einmal nachspielen', onClick: () => startPlay(), primary: !extra.some(b => b.primary) });
    if (mode === 'learn') btns.push({ label: 'Vorführung ansehen', onClick: () => { stopTimers(); startDemo(); } });
    setControls([...extra, ...btns]);
    if (firstRun) onFinish?.(result);
  }

  // ---------- Tastatur ----------

  const offKeys = onKeys({
    ' ': () => (phase === 'demo' && idx < plies.length ? demoStep(1) : primaryAction?.()),
    Enter: () => (phase === 'demo' && idx < plies.length ? demoStep(1) : primaryAction?.()),
    ArrowRight: () => phase === 'demo' && demoStep(1),
    ArrowLeft: () => phase === 'demo' && demoStep(-1),
    h: hint,
  }, el);

  if (stage === 1) startFind(); else if (mode === 'learn') startDemo(); else startPlay();

  return {
    board,   // für Tests und Fehlersuche
    destroy() {
      stopAuto();
      stopTimers();
      stopTempo();
      sparToken++;
      offKeys();
      board.destroy();
    },
  };
}
