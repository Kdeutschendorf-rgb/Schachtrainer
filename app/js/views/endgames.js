// Endspiele: Lernstellungen aus data/endgames.json gegen die Engine in voller Stärke ausspielen.
// Übersicht unter #/endspiele, eine Stellung unter #/endspiele?id=…, fällige der Reihe nach unter #/endspiele?run=1.
// Die Regeln (Ziel erreicht? Note? Reihenfolge?) stehen DOM-frei in vision/endgame.js.

import { h, clear, loadCss, countdown, toast, loadData, today, figurine, formatLine, progressBar, feedback } from '../ui.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import * as engine from '../engine.js';
import { createBoard } from '../board.js';
import * as E from '../vision/endgame.js';

const LEVELS = { 1: 'Grundlagen', 2: 'Wichtige Technik', 3: 'Für Fortgeschrittene' };
const SIDE_DE = { w: 'Weiß', b: 'Schwarz' };
const ENGINE_MS = 600;

// Bereich im Fortschritt: { cards: {id: srsCard}, stats: {id: [geschafft, versucht]}, history: [[id, ok, datum, hinweise, züge]] }
function area() {
  const d = store.get('endgames');
  d.cards ||= {};
  d.stats ||= {};
  d.history ||= [];
  return d;
}

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
      h('p.muted', 'Die wichtigsten Lernstellungen, gespielt gegen die Engine in voller Stärke. '
        + 'Was du sicher kannst, kommt seltener wieder, was danebengeht, bald noch einmal.'),
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
            h('span.pill' + (st.cls ? '.' + st.cls : ''), st.label)),
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

  nav.append(
    standalone ? h('a.btn', { href: '#/endspiele' }, 'Übersicht') : null,
    standalone ? null : h('button', { onclick: () => finishAll() }, 'Block beenden'),
  );

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

  function start(p) {
    pos = p;
    gen++;
    userMoves = 0;
    hintsUsed = 0;
    finished = false;
    sans.length = 0;
    const parts = p.fen.split(' ');
    startPly = (Number(parts[5]) - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
    title.textContent = p.title;
    goalEl.replaceChildren(
      h('span.pill' + (p.goal === 'draw' ? '.eg-draw' : '.eg-win'), p.goal === 'draw' ? 'Remis halten' : 'Gewinnen'),
      ' ', h('span', `Du spielst ${SIDE_DE[p.side]}. ${goalText(p)}`));
    introEl.textContent = p.intro;
    clear(hintsEl); clear(after); setFeedback('');
    board.setPosition(p.fen, { orientation: p.side === 'w' ? 'white' : 'black' });
    board.setOnMove(onUserMove);
    board.setMovable(p.side === 'w' ? 'white' : 'black');
    controls.replaceChildren(
      h('button', { onclick: showHint }, 'Hinweis (h)'),
      h('button', { onclick: () => start(p) }, 'Neu starten'),
      h('button', { onclick: () => giveUp() }, 'Aufgeben'),
    );
    primary = null;
    renderMoves();
  }

  // Hinweise aus der Datei, danach der Engine-Zug als Pfeil
  async function showHint() {
    if (finished || !pos) return;
    const shown = hintsEl.childElementCount;
    hintsUsed++;
    if (shown < (pos.hints || []).length) {
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
    if (v.status !== 'continue') return end(v);
    await sleep(250);
    if (my !== gen || destroyed) return;
    const om = reply && board.move(reply);
    if (!om) return end({ status: 'failed', reason: 'Die Engine hat keinen Zug gefunden.' });
    sans.push(om.san);
    renderMoves();
    const v2 = E.judgeAfterOpponent(pos, game);
    if (v2.status !== 'continue') return end(v2);
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
    store.update('endgames', d => {
      d.cards ||= {}; d.stats ||= {}; d.history ||= [];
      d.cards[pos.id] = srs.review(d.cards[pos.id], grade);
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
      h('div.small.muted', ok
        ? `Nächste Wiederholung: ${card.due === today() ? 'heute' : card.due.split('-').reverse().join('.')}`
        : 'Kommt heute noch einmal dran.')));
    const nextBtn = h('button.primary', { onclick: () => next() },
      timeUp ? 'Block abschließen ⏎' : qi + 1 < queue.length ? 'Nächste Stellung ⏎' : 'Fertig ⏎');
    primary = nextBtn;
    controls.replaceChildren(nextBtn, h('button', { onclick: () => start(pos) }, 'Nochmal'));
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
