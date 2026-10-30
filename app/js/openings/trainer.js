// Linientrainer: Lernen (Vorführung → sofort nachspielen) und Wiederholen (linienweise, SRS).
//
// const t = createLineTrainer(el, { model, line, mode: 'learn'|'review', onFinish, actions, onExit });
// onFinish(result) kommt einmal nach dem gewerteten Durchgang:
//   result = { line, mode, total, correct, results: [{key, grade, san}], mistakes: [...], saved }
// actions(result) → [{label, onClick, primary}] erscheinen nach dem Durchgang (Enter = erster primärer Knopf).
// t.destroy() räumt auf.

import { createBoard } from '../board.js';
import { h, clear, figurine, formatLine } from '../ui.js';
import { ownMovesAt, gradeFor, firstNewPly } from './logic.js';
import { progress, saveLineResults } from './data.js';
import { onKeys, moveLabel, moveList, sideName, orientationOf, priorityBadge, button } from './widgets.js';

const OPP_DELAY = 400;

export function createLineTrainer(el, { model, line, mode = 'review', onFinish, actions, onExit }) {
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
      h('span.pill' + (mode === 'learn' ? '.good' : ''), mode === 'learn' ? 'Neue Linie' : 'Wiederholung'),
      priorityBadge(chapter?.priority),
      h('span.pill', `Du: ${sideName(side)}`)),
    h('h3.op-title', chapter?.title || ''),
    h('div.muted.small', line.name));
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

  function startPlay() {
    stopAuto();
    stopTimers();
    phase = 'play';
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
      setStatus(`Dein Zug (${ownDone() + 1}/${ownTotal})`);
      setControls([{ label: 'Hinweis (h)', onClick: hint }]);
      return;
    }
    cur = null;
    setStatus('Gegner zieht …');
    setControls([]);
    later(() => {
      if (phase !== 'play') return;
      board.move(ply.san);
      // Gegnernotizen beim Lernen immer zeigen, beim Wiederholen nur Fallen
      if (ply.note && (mode === 'learn' || /Falle/i.test(ply.note))) setCoach(noteBlock(ply));
      p++;
      advance();
    }, OPP_DELAY);
  }

  function onUserMove(m) {
    if (phase !== 'play' || !cur) return false;
    const exp = cur.ply;
    if (m.uci === exp.uci || m.san === exp.san) {
      const ms = Date.now() - cur.t0;
      const grade = cur.wrong ? 0 : gradeFor({ hinted: cur.hinted || cur.alt, ms });
      results.push({ key: exp.key, grade, san: exp.san, ply: exp.i });
      board.setShapes([]);
      if (!cur.wrong) {
        board.flash('good');
        setCoach(noteBlock(exp, { prefix: grade >= 2 ? '✓' : '✓ (mit Hilfe)' }));
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
    if (phase !== 'play' || !cur) return;
    cur.hinted = true;
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

  function finishPlay() {
    phase = 'done';
    cur = null;
    board.setMovable('none');
    board.setOnMove(null);
    const total = results.length;
    const correct = results.filter(r => r.grade > 0).length;
    const firstRun = !graded;
    let saved = null;
    if (firstRun) {
      graded = true;
      saved = saveLineResults(results.map(r => ({ key: r.key, grade: r.grade })), { learnLineId: mode === 'learn' ? line.id : undefined });
    }
    const result = { line, mode, total, correct, results, mistakes, saved };

    const kind = mistakes.length ? 'warn' : 'good';
    setStatus(mistakes.length ? `Geschafft, mit ${mistakes.length} Fehler${mistakes.length === 1 ? '' : 'n'}.` : 'Perfekt, alles richtig!', kind);
    const items = [h(`div.feedback.${kind}`, `${correct} von ${total} eigenen Zügen richtig${firstRun ? '' : ' (Übung)'}.`)];
    if (mistakes.length) {
      items.push(h('div.op-mistakes', h('b', 'Hier hakte es:'),
        h('ul', mistakes.map(x => h('li', `${moveLabel(x.ply, x.expected)} (du: ${figurine(x.played)})`)))));
      if (firstRun) items.push(h('div.muted.small', 'Diese Züge kommen heute noch einmal dran.'));
    }
    if (saved?.newCards) items.push(h('div.muted.small', `${saved.newCards} neue Karte${saved.newCards === 1 ? '' : 'n'} gelernt. Morgen fragt dich der Trainer wieder ab.`));
    if (line.plan) items.push(h('div.op-note.plan', h('div.op-note-head', h('b', 'Wie es weitergeht')), h('div', line.plan)));
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
  });

  if (mode === 'learn') startDemo(); else startPlay();

  return {
    board,   // für Tests und Fehlersuche
    destroy() {
      stopAuto();
      stopTimers();
      offKeys();
      board.destroy();
    },
  };
}
