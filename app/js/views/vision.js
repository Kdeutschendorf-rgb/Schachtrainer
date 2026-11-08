// Vorausdenken: Blind rechnen, Drohung erkennen, Schach & Schlagen, Ungedeckte Figuren.
// Übersicht unter #/rechnen, eine Übung unter #/rechnen?ex=calc (optional &min=5 für eine Zeitvorgabe).
// Die Übungen selbst stehen in vision/exercises.js, die reine Logik in vision/logic.js.

import { h, clear, loadCss, countdown, toast, loadData, today, progressBar } from '../ui.js';
import * as store from '../store.js';
import { createBoard } from '../board.js';
import * as L from '../vision/logic.js';
import { EXERCISES, RUNNERS, setFeedback } from '../vision/exercises.js';

const MIX_ORDER = ['calc', 'threats', 'cct', 'loose', 'cand'];
// Reihenfolge im gemischten Block: Blind rechnen (Züge im Kopf sehen) kommt am häufigsten dran
const MIX_ROTATION = ['calc', 'threats', 'calc', 'cct', 'calc', 'cand', 'calc', 'loose'];

// Bereich im Fortschritt: { blind: {level, streak, history}, threats: {...}, cct: {...}, loose: {...} }
function area(kind) {
  const key = EXERCISES[kind].key;
  const v = store.get('vision');
  v[key] ||= { level: 1, streak: 0, history: [] };
  return v[key];
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------
export function mount(el, params = {}) {
  loadCss('css/vision.css');
  if (params.ex && (RUNNERS[params.ex] || params.ex === 'mix')) {
    const minutes = Number(params.min) || 0;
    const session = createSession(el, {
      mode: params.ex,
      seconds: minutes ? minutes * 60 : 0,
      standalone: true,
      onEnd: summary => showSummary(el, summary),
    });
    return () => session.destroy();
  }
  renderOverview(el);
  return () => {};
}

function renderOverview(el) {
  clear(el);
  const cards = Object.entries(EXERCISES).map(([kind, ex]) => {
    const st = area(kind);
    const rate = L.recentRate(st.history);
    const todayCount = (st.history || []).filter(e => e[3] === today()).length;
    return h('div.card.vision-card',
      h('div.row', h('h3', ex.title), h('span.spacer'), h('span.pill', `Stufe ${st.level}/${ex.maxLevel}`)),
      h('p.small.muted', ex.short),
      h('div.small', ex.levelText(st.level)),
      progressBar((st.level - 1) / (ex.maxLevel - 1 || 1)),
      h('div.row.small.muted',
        h('span', `${(st.history || []).length} ${(st.history || []).length === 1 ? 'Aufgabe' : 'Aufgaben'}`),
        rate != null ? h('span', `· zuletzt ${Math.round(rate * 100)} % richtig`) : null,
        todayCount ? h('span', `· heute ${todayCount}`) : null),
      h('div.row', h('a.btn.primary', { href: `#/rechnen?ex=${kind}` }, 'Starten')));
  });
  el.append(
    h('div.vision-head',
      h('h1', 'Vorausdenken'),
      h('p.muted', 'Mehr Züge vorausdenken lernt man wie Vokabeln: kurz, oft und knapp über der eigenen Grenze. '
        + 'Jede Übung passt ihre Stufe an: drei richtige in Folge → schwerer, zwei Fehler in Folge → leichter.'),
      h('div.row',
        h('a.btn.primary', { href: '#/rechnen?ex=mix&min=5' }, 'Gemischt, 5 Minuten'),
        h('a.btn', { href: '#/rechnen?ex=calc&min=5' }, 'Blind rechnen, 5 Minuten'))),
    h('div.grid.vision-grid', cards),
    h('div.card.small.muted.vision-tip',
      h('strong', 'Vor jedem Zug in deiner Partie: '),
      'Was will mein Gegner mit seinem letzten Zug? Welche Schachs und Schlagzüge habe ich, welche hat er? '
      + 'Was hängt? Genau diese drei Fragen übst du hier.'),
  );
}

function showSummary(el, s) {
  clear(el);
  el.append(h('div.card.vision-summary',
    h('h2', 'Geschafft'),
    h('p', `${s.done} ${s.done === 1 ? 'Aufgabe' : 'Aufgaben'}, davon ${s.correct} richtig.`),
    h('ul', Object.entries(s.details.byKind).map(([k, v]) =>
      h('li', `${EXERCISES[k].title}: ${v.correct}/${v.done}, jetzt Stufe ${area(k).level}`))),
    h('div.row',
      h('a.btn.primary', { href: '#/rechnen' }, 'Zur Übersicht'),
      h('button', { onclick: () => { location.hash = '#/rechnen?ex=' + s.mode + '&r=' + Date.now(); } }, 'Nochmal'))));
}

// ---------------------------------------------------------------------------
// Tagesplan-Block
// ---------------------------------------------------------------------------
export function runBlock(el, { minutes = 5, mode = 'mix', onDone } = {}) {
  loadCss('css/vision.css');
  const kind = mode === 'calc' || mode === 'threats' || mode === 'cct' || mode === 'loose' ? mode : 'mix';
  let called = false;
  const session = createSession(el, {
    mode: kind,
    seconds: Math.max(1, minutes) * 60,
    standalone: false,
    onEnd: summary => {
      if (called) return;
      called = true;
      onDone?.({ ...summary, mode });
    },
  });
  return () => session.destroy();
}

// ---------------------------------------------------------------------------
// Sitzung: Aufgaben nacheinander, mit oder ohne Zeitvorgabe
// ---------------------------------------------------------------------------
function createSession(el, { mode, seconds, standalone, onEnd }) {
  clear(el);
  const startedAt = Date.now();
  const stats = { done: 0, correct: 0, byKind: {} };
  let destroyed = false;
  let ended = false;
  let timeUp = false;
  let token = 0;            // erhöht sich pro Aufgabe; alte Promises werden ignoriert
  let mixIdx = 0;
  let timer = null;
  const timeouts = new Set();
  let primary = null;
  let selectFn = null;
  let idle = false;         // zwischen zwei Aufgaben (wartet auf „Weiter“)

  // Gerüst
  const boardHost = h('div');
  const title = h('h2.vision-title');
  const levelPill = h('span.pill');
  const timerSlot = h('span.vision-timer');
  const prompt = h('div.vision-prompt');
  const body = h('div.vision-body');
  const fb = h('div.vision-feedback');
  const controls = h('div.row.vision-controls');
  const nav = h('div.row.vision-nav');
  el.append(h('div.trainer.vision',
    boardHost,
    h('div.side',
      h('div.card.tight', h('div.row', title, h('span.spacer'), levelPill, timerSlot)),
      h('div.card', prompt, body),
      fb, controls, nav)));

  const board = createBoard(boardHost, { movable: 'none', autoQueen: true });
  // Ein Klick-Verteiler für Feld-Auswahl (Blind rechnen, Ungedeckte Figuren)
  board.cg.set({ events: { select: sq => selectFn?.(sq) } });

  const ctx = {
    board, prompt, body, controls,
    rows: [], seen: new Set(), rnd: Math.random,
    tacticsRating: store.get('tactics').rating,
    onHint: null,
    setSelect(fn) { selectFn = fn; },
    setPrimary(btn) { primary = btn; },
    feedback(text, kind = 'info') { setFeedback(fb, text, kind); },
    clearFeedback() { clear(fb); },
    timeout(fn, ms) {
      const id = setTimeout(() => { timeouts.delete(id); if (!destroyed) fn(); }, ms);
      timeouts.add(id);
      return id;
    },
    sleep(ms) { return new Promise(r => ctx.timeout(r, ms)); },
    stopped: () => destroyed || ended,
  };

  // Bereits gelöste Aufgaben nicht sofort wiederholen
  for (const k of MIX_ORDER) for (const e of area(k).history || []) ctx.seen.add(e[0]);

  function onKey(e) {
    if (e.target.matches?.('input, select, textarea')) return;
    if ((e.key === ' ' || e.key === 'Enter') && primary && primary.isConnected && !primary.disabled) {
      e.preventDefault();
      primary.click();
    } else if (e.key === 'h' && ctx.onHint) {
      ctx.onHint();
    }
  }
  document.addEventListener('keydown', onKey);

  // append() würde null als Text „null“ einfügen, darum filtern
  nav.append(...[
    standalone ? h('a.btn', { href: '#/rechnen' }, 'Übersicht') : null,
    h('button', { onclick: () => finish() }, standalone ? 'Beenden' : 'Block beenden'),
  ].filter(Boolean));

  if (seconds) {
    timer = countdown(seconds, {
      onEnd: () => {
        timeUp = true;
        // Zwischen zwei Aufgaben sofort abschließen, sonst darf die laufende Aufgabe fertig werden
        if (idle) finish();
        else toast('Zeit um. Die laufende Aufgabe darfst du noch fertig machen.');
      },
    });
    timerSlot.append(timer.el);
  }

  function nextKind() {
    if (mode !== 'mix') return mode;
    const k = MIX_ROTATION[mixIdx % MIX_ROTATION.length];
    mixIdx++;
    return k;
  }

  async function loop() {
    prompt.textContent = 'Lade Aufgaben …';
    try {
      ctx.rows = await loadData('puzzles.json');
    } catch (err) {
      prompt.textContent = 'Die Aufgaben (puzzles.json) konnten nicht geladen werden.';
      return;
    }
    let failures = 0;
    while (!destroyed && !ended) {
      if (timeUp) return finish();
      const kind = nextKind();
      const st = area(kind);
      const my = ++token;
      title.textContent = EXERCISES[kind].title;
      levelPill.textContent = `Stufe ${st.level}`;
      levelPill.title = EXERCISES[kind].levelText(st.level);
      clear(fb); clear(controls); clear(body);
      primary = null;
      board.setShapes([]);
      let result;
      try {
        result = await RUNNERS[kind](ctx, st.level);
      } catch (err) {
        if (destroyed || ended || my !== token) return;
        console.error(err);
        failures++;
        ctx.feedback(`Diese Übung geht gerade nicht: ${err.message}`, 'bad');
        if (failures >= 3 || mode !== 'mix') {
          clear(controls);
          controls.append(h('button', { onclick: () => loop() }, 'Nochmal versuchen'));
          return;
        }
        continue;
      }
      if (destroyed || ended || my !== token || !result) return;
      failures = 0;
      record(kind, result);
      // Weiter
      if (timeUp) { await waitNext('Block abschließen'); return finish(); }
      await waitNext('Weiter');
    }
  }

  function waitNext(label) {
    idle = true;
    return new Promise(resolve => {
      const b = h('button.primary', { onclick: () => { idle = false; resolve(); } }, label + ' ⏎');
      primary = b;
      controls.prepend(b);
    });
  }

  function record(kind, r) {
    const before = area(kind).level;
    store.update('vision', v => {
      const key = EXERCISES[kind].key;
      const st = (v[key] ||= { level: 1, streak: 0, history: [] });
      // Mit Hinweis: Stufe bleibt, wie sie ist
      if (!r.hint) Object.assign(st, L.adapt(st, r.ok, { max: EXERCISES[kind].maxLevel }));
      delete st.changed;
      L.pushHistory(st.history ||= [], [r.id, r.level, r.ok && !r.hint ? 1 : 0, today(), r.seconds || 0]);
    });
    const after = area(kind).level;
    if (after > before) toast(`Stufe ${after}: ${EXERCISES[kind].levelText(after)}`, 'good');
    else if (after < before) toast(`Eine Stufe leichter: ${EXERCISES[kind].levelText(after)}`);
    levelPill.textContent = `Stufe ${after}`;
    const okNow = r.ok && !r.hint;
    stats.done++;
    if (okNow) stats.correct++;
    const bk = (stats.byKind[kind] ||= { done: 0, correct: 0 });
    bk.done++;
    if (okNow) bk.correct++;
    store.logActivity({ visionTasks: 1, visionSolved: okNow ? 1 : 0 });
  }

  function finish() {
    if (ended || destroyed) return;
    ended = true;
    token++;
    timer?.stop();
    const minutes = Math.round((Date.now() - startedAt) / 6000) / 10;
    if (standalone && minutes > 0) store.logActivity({ minutes });
    const summary = { type: 'vision', mode, minutes, done: stats.done, correct: stats.correct, details: { byKind: stats.byKind } };
    cleanupBoard();
    onEnd?.(summary);
  }

  function cleanupBoard() {
    document.removeEventListener('keydown', onKey);
    for (const id of timeouts) clearTimeout(id);
    timeouts.clear();
    selectFn = null;
    try { board.destroy(); } catch { /* schon weg */ }
  }

  loop();

  return {
    // Von außen abgebrochen (Seitenwechsel, Block übersprungen): aufräumen, aber kein onEnd mehr
    destroy() {
      if (destroyed) return;
      if (!ended && standalone) {
        const minutes = Math.round((Date.now() - startedAt) / 6000) / 10;
        if (minutes > 0) store.logActivity({ minutes });
      }
      destroyed = true;
      ended = true;
      token++;
      timer?.stop();
      cleanupBoard();
    },
  };
}
