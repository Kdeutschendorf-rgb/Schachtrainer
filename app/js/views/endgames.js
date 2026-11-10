// Endspiele: Lernstellungen aus data/endgames.json gegen die Engine in voller Stärke ausspielen.
// Übersicht unter #/endspiele, eine Stellung unter #/endspiele?id=…, fällige der Reihe nach unter #/endspiele?run=1.
// Die Regeln (Ziel erreicht? Note? Reihenfolge?) stehen DOM-frei in vision/endgame.js.

import { h, clear, loadCss, countdown, toast, loadData, today, figurine, formatLine, progressBar, feedback } from '../ui.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import * as engine from '../engine.js';
import * as Coach from '../endgames/coach.js';
import { createBoard } from '../board.js';
import * as E from '../vision/endgame.js';

const LEVELS = { 1: 'Grundlagen', 2: 'Wichtige Technik', 3: 'Für Fortgeschrittene' };
const SIDE_DE = { w: 'Weiß', b: 'Schwarz' };
const ENGINE_MS = 600;
// Lektionsschritte: 1 Vorführung, 2 geführt mit Hilfe, 3 allein aus einer anderen Startstellung
const STEP_DE = { 1: 'Vorführung', 2: 'Geführt', 3: 'Allein' };
const DEMO_MOVES = 12;

// Bereich im Fortschritt: { cards: {id: srsCard}, stats: {id: [geschafft, versucht]}, history: [[id, ok, datum, hinweise, züge]] }
function area() {
  const d = store.get('endgames');
  d.cards ||= {};
  d.stats ||= {};
  d.history ||= [];
  d.stages ||= {};
  return d;
}

const stepOf = (id, d = area()) => d.stages[id] || 1;
const setStep = (id, step) => store.update('endgames', d => { (d.stages ||= {})[id] = step; });

async function loadPositions() {
  const data = await loadData('endgames.json');
  return Array.isArray(data) ? data : data.positions;
}

function goalText(pos) {
  if (pos.goal === 'draw') return `Halte Remis: ${pos.maxMoves} Züge überstehen.`;
  const until = E.untilOf(pos);
  if (until === 'mate') return `Setze matt, höchstens ${pos.maxMoves} Züge.`;
  if (until === 'material') return `Gewinne das gegnerische Material, höchstens ${pos.maxMoves} Züge.`;
  return `Wandle um und gewinne, höchstens ${pos.maxMoves} Züge.`;
}

function statusOf(pos, d) {
  const c = d.cards[pos.id];
  if (!c) return { label: 'neu', cls: '' };
  if (srs.isDue(c)) return { label: 'fällig', cls: 'bad' };
  return { label: `sitzt (${c.due.slice(8, 10)}.${c.due.slice(5, 7)}.)`, cls: 'good' };
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------
export function mount(el, params = {}) {
  loadCss('css/endgames.css');
  let player = null;
  let gone = false;
  (async () => {
    let list;
    try {
      list = await loadPositions();
    } catch (err) {
      el.append(feedback('endgames.json konnte nicht geladen werden.', 'bad'));
      return;
    }
    if (gone) return;
    if (params.id || params.run) {
      const q = params.id
        ? [list.find(p => p.id === params.id), ...E.queue(list, area().cards, today()).filter(p => p.id !== params.id)].filter(Boolean)
        : E.queue(list, area().cards, today());
      if (!q.length) return renderOverview(el, list);
      player = createPlayer(el, { queue: q, standalone: true });
    } else {
      renderOverview(el, list);
    }
  })();
  return () => { gone = true; player?.destroy(); };
}

function renderOverview(el, list) {
  clear(el);
  const d = area();
  const due = list.filter(p => d.cards[p.id] && srs.isDue(d.cards[p.id])).length;
  const fresh = list.filter(p => !d.cards[p.id]).length;
  const groups = {};
  for (const p of list) (groups[p.level] ||= []).push(p);
  el.append(
    h('div.eg-head',
      h('h1', 'Endspiele'),
      h('p.muted', 'Jede Stellung läuft in drei Schritten: Vorführung, geführt mit Hilfe, dann allein aus einer anderen Startstellung. '
        + 'Was du sicher kannst, kommt seltener wieder.'),
      h('div.row',
        h('a.btn.primary', { href: '#/endspiele?run=1' }, due ? `${due} fällige üben` : fresh ? 'Nächste neue Stellung' : 'Wiederholen'),
        h('span.muted.small', `${list.length} Stellungen · ${list.length - fresh} begonnen · ${due} fällig`))),
    ...Object.keys(groups).sort().map(lv => h('section.eg-group',
      h('h2', LEVELS[lv] || `Stufe ${lv}`),
      h('div.grid.eg-grid', groups[lv].map(p => {
        const st = statusOf(p, d);
        const [won, tries] = d.stats[p.id] || [0, 0];
        return h('a.card.eg-card', { href: `#/endspiele?id=${encodeURIComponent(p.id)}` },
          h('div.row', h('strong', p.title)),
          h('div.row.small',
            h('span.pill' + (p.goal === 'draw' ? '.eg-draw' : '.eg-win'), p.goal === 'draw' ? 'Remis halten' : 'Gewinnen'),
            h('span.pill', SIDE_DE[p.side]),
            h('span.pill' + (st.cls ? '.' + st.cls : ''), st.label),
            h('span.pill', `Schritt ${stepOf(p.id, d)}/3`)),
          progressBar(srs.strength(d.cards[p.id])),
          h('div.small.muted', tries ? `${won}/${tries} geschafft` : 'noch nicht gespielt'));
      })))),
  );
}

// ---------------------------------------------------------------------------
// Tagesplan-Block
// ---------------------------------------------------------------------------
export function runBlock(el, { minutes = 2, mode = 'basic', onDone } = {}) {
  loadCss('css/endgames.css');
  let player = null;
  let destroyed = false;
  let called = false;
  const done = summary => {
    if (called) return;
    called = true;
    onDone?.({ ...summary, mode });
  };
  (async () => {
    let list;
    try {
      list = await loadPositions();
    } catch {
      el.append(feedback('endgames.json konnte nicht geladen werden.', 'bad'));
      done({ type: 'endgames', minutes: 0, done: 0, correct: 0 });
      return;
    }
    if (destroyed) return;
    player = createPlayer(el, { queue: E.queue(list, area().cards, today()), seconds: Math.max(1, minutes) * 60, onEnd: done });
  })();
  return () => { destroyed = true; player?.destroy(); };
}

// ---------------------------------------------------------------------------
// Spieler: eine Stellung nach der anderen aus queue
// ---------------------------------------------------------------------------
function createPlayer(el, { queue, seconds = 0, standalone = false, onEnd }) {
  clear(el);
  const startedAt = Date.now();
  const stats = { done: 0, correct: 0, ids: [] };
  let qi = 0;
  let pos = null;
  let destroyed = false;
  let ended = false;
  let timeUp = false;
  let gen = 0;               // Generation: verwirft Engine-Antworten einer alten Partie
  let userMoves = 0;
  let hintsUsed = 0;
  let finished = false;
  let primary = null;
  const sans = [];
  let startPly = 0;
  let fenBeforeUser = null;
  let base = null;           // Lernstellung aus der Datei (pos kann eine Variante davon sein)
  let step = 1;              // Lektionsschritt der laufenden Stellung

  const boardHost = h('div');
  const title = h('h2.eg-title');
  const timerSlot = h('span');
  const goalEl = h('div.eg-goal');
  const introEl = h('p.eg-intro');
  const counter = h('div.small.muted');
  const movesEl = h('div.moves.eg-moves');
  const hintsEl = h('div.eg-hints');
  const fb = h('div.eg-feedback');
  const controls = h('div.row');
  const after = h('div.eg-after');
  const nav = h('div.row');
  el.append(h('div.trainer.eg',
    boardHost,
    h('div.side',
      h('div.card.tight', h('div.row', title, h('span.spacer'), timerSlot)),
      h('div.card', goalEl, introEl, counter, movesEl),
      hintsEl, fb, controls, after, nav)));

  const board = createBoard(boardHost, { movable: 'none' });

  let timer = null;
  if (seconds) {
    timer = countdown(seconds, {
      onEnd: () => {
        timeUp = true;
        if (finished) finishAll();
        else toast('Zeit um. Spiel die Stellung noch zu Ende oder beende den Block.');
      },
    });
    timerSlot.append(timer.el);
  }

  // append() würde null als Text „null“ einfügen, darum nur das Passende anhängen
  nav.append(standalone
    ? h('a.btn', { href: '#/endspiele' }, 'Übersicht')
    : h('button', { onclick: () => finishAll() }, 'Block beenden'));

  function onKey(e) {
    if (e.target.matches?.('input, select, textarea')) return;
    if ((e.key === ' ' || e.key === 'Enter') && primary?.isConnected) { e.preventDefault(); primary.click(); }
    else if (e.key === 'h' && !finished) showHint();
  }
  document.addEventListener('keydown', onKey);

  function setFeedback(text, kind = 'info') {
    clear(fb);
    if (text) fb.append(feedback(text, kind));
  }

  function renderMoves() {
    movesEl.textContent = sans.length ? formatLine(sans, startPly) : '';
    counter.textContent = `Zug ${Math.min(userMoves, pos.maxMoves)} von ${pos.maxMoves}${hintsUsed ? ` · ${hintsUsed} ${hintsUsed === 1 ? 'Hinweis' : 'Hinweise'}` : ''}`;
  }

  function start(original) {
    base = original;
    step = stepOf(original.id);
    const p = step === 3 ? E.variantOf(original) : original;
    pos = p;
    gen++;
    userMoves = 0;
    hintsUsed = 0;
    finished = false;
    sans.length = 0;
    const parts = p.fen.split(' ');
    startPly = (Number(parts[5]) - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
    title.textContent = `${p.title} · ${STEP_DE[step]}`;
    goalEl.replaceChildren(
      h('span.pill' + (p.goal === 'draw' ? '.eg-draw' : '.eg-win'), p.goal === 'draw' ? 'Remis halten' : 'Gewinnen'),
      ' ', h('span', `Du spielst ${SIDE_DE[p.side]}. ${goalText(p)}`));
    introEl.textContent = step === 3 ? 'Eine andere Startstellung, dieselbe Technik. Keine Erklärungen mehr, zeig, dass du es kannst.' : p.intro;
    clear(hintsEl); clear(after); setFeedback('');
    const coached = Coach.COACHED[p.id];
    if (coached && step < 3) {
      hintsEl.append(h('div.card.eg-method',
        h('b', 'So geht’s, Schritt für Schritt:'),
        h('ol', coached.steps.map(t => h('li', t))),
        h('div.small.muted', `Der Käfig zählt die Felder, die der König noch erreichen kann: jetzt ${Coach.cage(p.fen, p.side)}. Jeder gute Zug macht ihn kleiner. Der Hinweis erklärt dir den nächsten Zug.`)));
    }
    board.setPosition(p.fen, { orientation: p.side === 'w' ? 'white' : 'black' });
    fenBeforeUser = p.fen;
    primary = null;
    renderMoves();
    if (step === 1) { startDemo(); return; }
    // Geführt: alle Hinweise stehen von Anfang an da, ohne Abzug
    if (step === 2 && !coached) hintsEl.append(...(p.hints || []).map((t, i) => h('div.feedback.info', `${i + 1}. ${t}`)));
    board.setOnMove(onUserMove);
    board.setMovable(p.side === 'w' ? 'white' : 'black');
    controls.replaceChildren(
      h('button', { onclick: showHint }, step === 2 ? 'Besten Zug zeigen (h)' : 'Hinweis (h)'),
      h('button', { onclick: () => start(base) }, 'Neu starten'),
      h('button', { onclick: () => giveUp() }, 'Aufgeben'),
    );
  }

  // Vorführung: Die Engine spielt beide Seiten, jeder eigene Zug wird erklärt
  function startDemo() {
    const my = gen;
    let shown = 0;
    let textIdx = 0;
    const coached = Coach.COACHED[pos.id];
    const nextBtn = h('button.primary', 'Nächster Zug ⏎');
    const finish = () => {
      if (my !== gen) return;
      setStep(base.id, 2);
      toast('Jetzt spielst du selbst, mit Hilfe.');
      start(base);
    };
    const showText = text => {
      hintsEl.querySelectorAll(':scope > .eg-explain').forEach(x => x.remove());
      if (text) hintsEl.append(h('div.feedback.info.eg-explain', text));
    };
    const stepDemo = async () => {
      if (my !== gen || finished) return;
      nextBtn.disabled = true;
      try {
        const game = board.chess;
        if (game.isGameOver() || shown >= Math.min(pos.par || DEMO_MOVES, DEMO_MOVES)) return showEnd();
        const fen = board.fen();
        const r = await engine.analyse(fen, { movetime: ENGINE_MS });
        if (my !== gen || !r.bestmove) return;
        showText(coached ? Coach.explain(fen, r.bestmove, pos.side) : (pos.hints || [])[Math.min(textIdx++, (pos.hints || []).length - 1)]);
        board.setShapes([{ orig: r.bestmove.slice(0, 2), dest: r.bestmove.slice(2, 4), brush: 'green' }]);
        await sleep(700);
        if (my !== gen) return;
        board.setShapes([]);
        const m = board.move(r.bestmove);
        sans.push(m.san);
        shown++;
        renderMoves();
        if (game.isGameOver()) return showEnd();
        const reply = await engine.analyse(board.fen(), { movetime: ENGINE_MS });
        if (my !== gen || !reply.bestmove) return;
        await sleep(350);
        if (my !== gen) return;
        const om = board.move(reply.bestmove);
        sans.push(om.san);
        renderMoves();
        if (game.isGameOver()) return showEnd();
        nextBtn.disabled = false;
      } catch {
        setFeedback('Die Engine antwortet nicht.', 'bad');
      }
    };
    const showEnd = () => {
      nextBtn.disabled = false;
      nextBtn.textContent = 'Jetzt selbst spielen ⏎';
      nextBtn.onclick = finish;
      setFeedback('So geht die Technik. Jetzt bist du dran.', 'good');
    };
    nextBtn.onclick = stepDemo;
    primary = nextBtn;
    controls.replaceChildren(nextBtn, h('button', { onclick: finish }, 'Überspringen'));
    setFeedback('Schau zu: Die Engine zeigt die Technik und erklärt die Züge.', 'info');
  }

  // Hinweise aus der Datei, danach der Engine-Zug als Pfeil
  async function showHint() {
    if (finished || !pos) return;
    if (step === 1) return;
    const shown = hintsEl.querySelectorAll(':scope > .feedback').length;
    if (step === 3) hintsUsed++;
    if (Coach.COACHED[pos.id] || step === 2) {
      // Grundmatts: den besten Zug zeigen und erklären, warum er gut ist
      const my = gen;
      const fen = board.fen();
      try {
        const r = await engine.analyse(fen, { movetime: ENGINE_MS });
        if (my !== gen || !r.bestmove) return;
        board.setShapes([{ orig: r.bestmove.slice(0, 2), dest: r.bestmove.slice(2, 4), brush: 'blue' }]);
        hintsEl.querySelectorAll(':scope > .eg-explain').forEach(x => x.remove());
        if (Coach.COACHED[pos.id]) hintsEl.append(h('div.feedback.info.eg-explain', Coach.explain(fen, r.bestmove, pos.side)));
      } catch {
        toast('Engine nicht erreichbar.', 'bad');
      }
    } else if (shown < (pos.hints || []).length) {
      hintsEl.append(h('div.feedback.info', `Hinweis ${shown + 1}: ${pos.hints[shown]}`));
    } else {
      const my = gen;
      try {
        const r = await engine.analyse(board.fen(), { movetime: ENGINE_MS });
        if (my !== gen || !r.bestmove) return;
        board.setShapes([{ orig: r.bestmove.slice(0, 2), dest: r.bestmove.slice(2, 4), brush: 'blue' }]);
        toast(`Engine-Tipp: ${figurine(r.lines[0].san[0])}`);
      } catch {
        toast('Engine nicht erreichbar.', 'bad');
      }
    }
    renderMoves();
  }

  async function onUserMove(m) {
    const my = gen;
    if (Coach.COACHED[pos.id]) {
      const r = Coach.review(fenBeforeUser, m.fen, pos.side);
      setFeedback(r.text, r.kind);
      hintsEl.querySelectorAll(':scope > .eg-explain').forEach(x => x.remove());
    }
    userMoves++;
    sans.push(m.san);
    board.setMovable('none');
    board.setShapes([]);
    renderMoves();
    const game = board.chess;
    let score = null;
    let reply = null;
    if (!game.isGameOver()) {
      try {
        const r = await engine.analyse(board.fen(), { movetime: ENGINE_MS });
        if (my !== gen || destroyed) return;
        score = r.lines[0]?.score || null;
        reply = r.bestmove;
      } catch {
        if (my !== gen) return;
        setFeedback('Die Engine antwortet nicht. Läuft der Server?', 'bad');
        board.undo(); sans.pop(); userMoves--;
        board.setMovable(pos.side === 'w' ? 'white' : 'black');
        renderMoves();
        return;
      }
    }
    const v = E.judgeAfterUser(pos, game, { score, userMoves, lastMove: m });
    // Geführt: Ein Fehler beendet nichts. Der Zug wird zurückgenommen und du versuchst es noch einmal.
    if (step === 2 && v.status === 'failed' && !game.isGameOver() && userMoves < pos.maxMoves) {
      board.undo();
      sans.pop();
      userMoves--;
      setFeedback(`${v.reason} Der Zug ist zurückgenommen, versuch es noch einmal.`, 'warn');
      board.setMovable(pos.side === 'w' ? 'white' : 'black');
      renderMoves();
      return;
    }
    if (v.status !== 'continue') return end(v);
    await sleep(250);
    if (my !== gen || destroyed) return;
    const om = reply && board.move(reply);
    if (!om) return end({ status: 'failed', reason: 'Die Engine hat keinen Zug gefunden.' });
    sans.push(om.san);
    renderMoves();
    const v2 = E.judgeAfterOpponent(pos, game);
    if (v2.status !== 'continue') return end(v2);
    fenBeforeUser = board.fen();
    board.setMovable(pos.side === 'w' ? 'white' : 'black');
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function giveUp() {
    if (finished) return;
    gen++;
    end({ status: 'failed', reason: 'Aufgegeben.' });
  }

  function end(v) {
    finished = true;
    board.setMovable('none');
    const ok = v.status === 'won';
    board.flash(ok ? 'good' : 'bad');
    setFeedback(v.reason, ok ? 'good' : 'bad');
    const grade = E.gradeFor({ ok, hints: hintsUsed, userMoves, par: pos.par });
    // Geführt geschafft → nächstes Mal allein; allein gescheitert → wieder mit Hilfe
    const stepAfter = step === 2 ? (ok ? 3 : 2) : ok ? 3 : 2;
    setStep(base.id, stepAfter);
    store.update('endgames', d => {
      d.cards ||= {}; d.stats ||= {}; d.history ||= [];
      // Schon geübt und noch nicht wieder fällig („Nochmal“): Ein weiterer Erfolg schiebt die Wiederholung nicht hinaus
      const prev = d.cards[pos.id];
      if (!prev || srs.isDue(prev) || !ok) d.cards[pos.id] = srs.review(prev, step === 2 ? Math.min(grade, 2) : grade);
      const s = d.stats[pos.id] || [0, 0];
      d.stats[pos.id] = [s[0] + (ok ? 1 : 0), s[1] + 1];
      d.history.push([pos.id, ok ? 1 : 0, today(), hintsUsed, userMoves]);
      if (d.history.length > 500) d.history.splice(0, d.history.length - 500);
    });
    store.logActivity({ endgames: 1, endgamesSolved: ok ? 1 : 0 });
    stats.done++;
    if (ok) stats.correct++;
    stats.ids.push(pos.id);
    const card = area().cards[pos.id];
    after.replaceChildren(h('div.card.eg-technique',
      h('h3', 'Die Technik'),
      h('p', pos.technique),
      pos.variant ? h('div.small.muted', 'Beschrieben für die Grundstellung, die Technik ist dieselbe.') : null,
      h('div.small.muted', ok
        ? `Nächste Wiederholung: ${card.due === today() ? 'heute' : card.due.split('-').reverse().join('.')}`
        : 'Kommt heute noch einmal dran.')));
    const nextBtn = h('button.primary', { onclick: () => next() },
      timeUp ? 'Block abschließen ⏎' : qi + 1 < queue.length ? 'Nächste Stellung ⏎' : 'Fertig ⏎');
    primary = nextBtn;
    controls.replaceChildren(nextBtn, h('button', { onclick: () => start(base) }, 'Nochmal'));
  }

  function next() {
    if (timeUp) return finishAll();
    qi++;
    if (qi >= queue.length) {
      if (standalone) { finishAll(); return; }
      qi = 0;                       // im Block: von vorn (Wiederholung)
    }
    start(queue[qi]);
  }

  function finishAll() {
    if (ended || destroyed) return;
    ended = true;
    gen++;
    timer?.stop();
    const minutes = Math.round((Date.now() - startedAt) / 6000) / 10;
    if (standalone && minutes > 0) store.logActivity({ minutes });
    const summary = { type: 'endgames', mode: 'basic', minutes, done: stats.done, correct: stats.correct, details: { ids: stats.ids } };
    teardown();
    if (standalone) {
      clear(el);
      el.append(h('div.card.eg-summary',
        h('h2', 'Endspiel-Training beendet'),
        h('p', `${stats.done} ${stats.done === 1 ? 'Stellung' : 'Stellungen'} gespielt, ${stats.correct} geschafft.`),
        h('a.btn.primary', { href: '#/endspiele' }, 'Zur Übersicht')));
    }
    onEnd?.(summary);
  }

  function teardown() {
    document.removeEventListener('keydown', onKey);
    try { board.destroy(); } catch { /* schon weg */ }
  }

  start(queue[0]);

  return {
    // Von außen abgebrochen: aufräumen, ohne onEnd
    destroy() {
      if (destroyed) return;
      if (!ended && standalone) {
        const minutes = Math.round((Date.now() - startedAt) / 6000) / 10;
        if (minutes > 0) store.logActivity({ minutes });
      }
      destroyed = true;
      ended = true;
      gen++;
      timer?.stop();
      teardown();
    },
  };
}
