// Spielen gegen Bots (#/spielen): eigene Wertung, Bot passt sich an, Partie wird danach sofort analysiert.
// Fehler und Patzer landen als eigene Aufgaben in der Taktik, Abweichungen vom Repertoire als fällige Eröffnungskarten.
//
// Bereich im Fortschritt `play`:
// { rating, games: [{id, date, color, result, botElo, ratingBefore, ratingAfter, moves, reason, accuracy, counts}],
//   puzzles: [eigene Aufgaben], current: laufende Partie | null, settings: {tc, color, diff} }

import { h, clear, loadCss, toast, figurine, formatLine, loadPlayerData, progressBar } from '../ui.js';
import * as store from '../store.js';
import { createBoard } from '../board.js';
import { Chess } from '../../vendor/chess.js';
import { START_RATING, TIME_CONTROLS, newRating, CLASS_DE, MIN_BOT_ELO } from '../play/logic.js';
import { bookMove } from '../play/book.js';
import { createPlayout } from '../play/playout.js';
import { botMove, analyseGame } from '../play/engine.js';
import { loadModel } from '../openings/data.js';
import { followGame, cardKey } from '../openings/logic.js';
import { todayStr } from '../srs.js';

const RESULT_DE = { W: 'Gewonnen', L: 'Verloren', D: 'Remis' };
const DIFFS = [[-100, "Etwas leichter"], [0, "Passend zu deiner Wertung"], [150, "Stärker (+150)"]];
const MAX_PUZZLES = 300;

function area() {
  const d = store.get('play');
  d.games ||= [];
  d.puzzles ||= [];
  d.settings ||= { tc: '10+0', color: 'zufall', diff: 0 };
  return d;
}

const fmtClock = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export async function mount(el) {
  loadCss('css/play.css');
  const root = h('div.pl-root');
  el.append(root);
  let alive = true;
  let game = null;   // laufende Partie (Objekt mit destroy)
  let round = 0;     // zählt gestartete Partien: Eine neue Partie bricht die Analyse der alten ab (die Engine gehört dann dem Bot)
  const analysing = new Set();

  // Startwertung einmalig aus der chess.com-Rapid-Elo, sonst 1000
  if (area().rating == null) {
    const summary = await loadPlayerData('analysis_summary.json').catch(() => null);
    const start = summary?.elo?.current?.rapid || START_RATING;
    store.update('play', d => { d.rating = start; });
  }
  const model = await loadModel().catch(() => null);
  if (!alive) return () => {};

  const summary = await loadPlayerData('analysis_summary.json').catch(() => null);
  if (!alive) return () => {};

  if (area().current) startGame(area().current);
  else renderSetup();

  // Ergebnis der Analyse speichern: Genauigkeit, Aufgaben für die Taktik, Momente für die Besprechung
  function saveAnalysis(id, res) {
    store.update('play', d => {
      const g = d.games.find(x => x.id === id);
      if (g) {
        g.accuracy = res.accuracy; g.counts = res.counts; g.errors = res.errors;
        // Die drei teuersten Fehler für die Partie-Besprechung
        g.moments = res.moves.filter(m => m.cls === 'blunder' || m.cls === 'mistake').sort((x, y) => y.loss - x.loss).slice(0, 3)
          .sort((x, y) => x.ply - y.ply)
          .map(m => ({ ply: m.ply, fen: m.fen, played: m.san, best: m.bestSan, bestUci: m.best, drop: m.loss, tags: m.tags, pv: '' }));
      }
      const ids = new Set(d.puzzles.map(p => p.id));
      d.puzzles.push(...res.puzzles.filter(p => !ids.has(p.id)));
      d.puzzles = d.puzzles.slice(-MAX_PUZZLES);
    });
  }

  // Partien, deren Analyse abgebrochen wurde (Seite verlassen, gleich die nächste Partie gestartet), in Ruhe nachholen
  async function analysePending() {
    for (const g of area().games.slice(-5).reverse()) {
      if (!alive || game) return;
      if (g.accuracy != null || g.moves.length < 4 || analysing.has(g.id)) continue;
      analysing.add(g.id);
      const res = await analyseGame({ sans: g.moves, color: g.color, id: g.id, date: g.date }, { alive: () => alive && !game }).catch(() => null);
      analysing.delete(g.id);
      if (!res) return;
      saveAnalysis(g.id, res);
      if (alive && !game) renderSetup();
    }
  }

  // Stellungen aus eigenen Partien ausspielen: noch nicht gespielte zuerst
  function startPlayout(kind) {
    const list = summary?.playouts?.[kind] || [];
    const done = area().playouts || {};
    const pos = list.find(p => done[p.id] == null) || list[Math.floor(Math.random() * list.length)];
    if (!pos) return toast('Noch keine passenden Stellungen aus deinen Partien.');
    game?.destroy(); game = null;
    clear(root);
    const host = h('div');
    root.append(host);
    const destroy = createPlayout(host, {
      pos, elo: area().rating,
      onEnd: ({ ok, controls }) => {
        store.update('play', d => { (d.playouts ||= {})[pos.id] = ok ? 1 : 0; });
        store.logActivity({ playouts: 1, playoutsWon: ok ? 1 : 0 });
        controls.replaceChildren(
          h('button.primary', { onclick: () => startPlayout(kind) }, 'Nächste Stellung'),
          h('button', { onclick: () => renderSetup() }, 'Übersicht'));
      },
    });
    game = { destroy };
  }

  function renderSetup() {
    game?.destroy();
    game = null;
    clear(root);
    const a = area();
    const s = a.settings;
    const sel = (key, options) => h('select', { onchange: e => store.update('play', d => { d.settings[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value; }) },
      options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(s[key]) }, l)));
    const last = a.games.slice(-10).reverse();
    root.append(
      h('div.card.pl-setup',
        h('div.row', h('h1', 'Spielen'), h('span.spacer'), h('div.pl-rating', h('div.stat', String(a.rating)), h('div.small.muted', 'deine Bot-Wertung'))),
        h('p.muted', 'Gewinnst du, steigt deine Wertung und der nächste Bot wird stärker. Nach jeder Partie analysiert die Engine deine Züge: Fehler werden zu Taktikaufgaben, Abweichungen vom Repertoire kommen in die Eröffnungs-Wiederholung.'),
        h('div.pl-settings',
          h('label', h('span', 'Bedenkzeit'), sel('tc', TIME_CONTROLS.map(t => [t.id, t.label]))),
          h('label', h('span', 'Farbe'), sel('color', [['zufall', 'Zufall'], ['w', 'Weiß'], ['b', 'Schwarz']])),
          h('label', h('span', 'Gegner'), sel('diff', DIFFS)),
          h('label', h('span', 'Eröffnung'), sel('opening', openingOptions()))),
        h('div.small.muted', `Der Bot spielt die gewählte Eröffnung, danach entwickelt sich die Partie frei. Bots beginnen bei ${MIN_BOT_ELO}.`),
        h('div.row', h('button.primary.pl-start', { onclick: () => newGame() }, 'Partie starten'))),
      h('div.card.pl-extra',
        h('h3', 'Stellungen zu Ende spielen'),
        h('p.small.muted', 'Stellungen aus deinen eigenen Partien. Verwerten: gewonnen halten. Retten: nicht aufgeben, auch schlechte Stellungen drehen sich noch.'),
        h('div.row',
          h('button', { onclick: () => startPlayout('win'), disabled: !summary?.playouts?.win?.length }, 'Verwerten'),
          h('button', { onclick: () => startPlayout('save'), disabled: !summary?.playouts?.save?.length }, 'Retten'),
          h('a.btn', { href: '#/besprechung' }, 'Partie-Besprechung'))),
      last.length ? h('div.card',
        h('div.row', h('h3', 'Letzte Partien'), h('span.spacer'), h('a.small', { href: '#/eroeffnungen?tab=partien' }, 'Partie-Check der Eröffnungen')),
        h('table.pl-games', last.map(g => h('tr',
          h('td', h('span.pill' + (g.result === 'W' ? '.good' : g.result === 'L' ? '.bad' : ''), RESULT_DE[g.result])),
          h('td', `${g.color === 'w' ? 'Weiß' : 'Schwarz'} gegen Bot ${g.botElo}`),
          h('td.muted', g.accuracy != null ? `${String(g.accuracy).replace('.', ',')} % Genauigkeit` : g.moves.length >= 4 ? 'Analyse läuft …' : ''),
          h('td.muted', `${g.ratingAfter - g.ratingBefore >= 0 ? '+' : ''}${g.ratingAfter - g.ratingBefore}`))))) : null);
    analysePending();
  }

  // Eröffnungen zur Auswahl: gemischt, ohne Buch oder ein Kapitel des Repertoires (legt deine Farbe fest)
  function openingOptions() {
    const chapters = model ? [...model.chapters].sort((x, y) => (x.side === y.side ? x.order - y.order : x.side === 'w' ? -1 : 1)) : [];
    return [['', 'Gemischt aus meinem Repertoire'], ['frei', 'Keine feste Eröffnung'],
      ...chapters.map(c => [c.id, `${c.side === 'w' ? 'Du Weiß' : 'Du Schwarz'}: ${c.title}`])];
  }

  function newGame() {
    const a = area();
    const s = a.settings;
    const tc = TIME_CONTROLS.find(t => t.id === s.tc) || TIME_CONTROLS[0];
    const chapter = model?.chapterById.get(s.opening);
    const color = chapter ? chapter.side : s.color === 'w' || s.color === 'b' ? s.color : (Math.random() < 0.5 ? 'w' : 'b');
    const cur = {
      id: Date.now(), date: todayStr(), color, botElo: Math.max(MIN_BOT_ELO, a.rating + (s.diff || 0)), ratingBefore: a.rating, opening: s.opening || '',
      tc: { base: tc.base, inc: tc.inc }, clocks: { w: tc.base * 1000, b: tc.base * 1000 }, moves: [], startedAt: Date.now(),
    };
    store.update('play', d => { d.current = cur; });
    startGame(cur);
  }

  function saveCurrent(cur) {
    store.update('play', d => { d.current = { ...cur, moves: [...cur.moves], clocks: { ...cur.clocks } }; });
  }

  // ---------- Partie ----------
  function startGame(cur) {
    game?.destroy();
    clear(root);
    const mine = ++round;
    let over = false;
    let gen = 0;
    const timed = cur.tc.base > 0;
    const botClock = h('span.pl-clock');
    const myClock = h('span.pl-clock');
    const statusEl = h('div.pl-status');
    const movesEl = h('div.moves.pl-moves');
    const controls = h('div.row');
    const boardEl = h('div');
    const side = h('div.side',
      h('div.card.tight.pl-bar', h('span', `🤖 Bot ${cur.botElo}`), h('span.spacer'), timed ? botClock : null),
      model?.chapterById.get(cur.opening) ? h('div.small.muted', `Eröffnung: ${model.chapterById.get(cur.opening).title}`) : null,
      statusEl, movesEl, controls,
      h('div.card.tight.pl-bar.me', h('span', `Du (${cur.ratingBefore})`), h('span.spacer'), timed ? myClock : null));
    root.append(h('div.trainer.pl-game', boardEl, side));

    const board = createBoard(boardEl, { orientation: cur.color === 'w' ? 'white' : 'black', movable: 'none', autoQueen: true });
    board.loadLine(cur.moves);
    const chess = board.chess;
    const botColor = cur.color === 'w' ? 'b' : 'w';
    let lastTick = Date.now();

    const tick = () => {
      if (over || !timed) return;
      const now = Date.now();
      const turn = chess.turn();
      cur.clocks[turn] -= now - lastTick;
      lastTick = now;
      botClock.textContent = fmtClock(cur.clocks[botColor]);
      myClock.textContent = fmtClock(cur.clocks[cur.color]);
      botClock.classList.toggle('on', turn === botColor);
      myClock.classList.toggle('on', turn === cur.color);
      myClock.classList.toggle('low', cur.clocks[cur.color] < 30000);
      if (cur.clocks[turn] <= 0) finish(turn === cur.color ? 'L' : 'W', 'Zeit abgelaufen');
    };
    const interval = setInterval(tick, 200);
    tick();

    controls.append(h('button', { onclick: () => { if (!over && confirm('Partie aufgeben?')) finish('L', 'Aufgegeben'); } }, 'Aufgeben'));

    function renderMoves() {
      movesEl.textContent = cur.moves.length ? formatLine(cur.moves) : 'Noch keine Züge.';
      movesEl.scrollTop = movesEl.scrollHeight;
    }

    function afterMove(mover) {
      if (timed) cur.clocks[mover] += cur.tc.inc * 1000;
      lastTick = Date.now();
      renderMoves();
      saveCurrent(cur);
      if (chess.isGameOver()) {
        if (chess.isCheckmate()) return finish(mover === cur.color ? 'W' : 'L', 'Matt'), true;
        const why = chess.isStalemate() ? 'Patt' : chess.isThreefoldRepetition() ? 'Stellungswiederholung'
          : chess.isInsufficientMaterial() ? 'zu wenig Material' : '50-Züge-Regel';
        return finish('D', why), true;
      }
      return false;
    }

    function myTurn() {
      statusEl.textContent = 'Du bist am Zug.';
      board.setMovable(cur.color === 'w' ? 'white' : 'black');
      board.setOnMove(m => {
        board.setMovable('none');
        cur.moves.push(m.san);
        if (!afterMove(cur.color)) botTurn();
        return true;
      });
    }

    async function botTurn() {
      const my = ++gen;
      statusEl.textContent = 'Der Bot überlegt …';
      const t0 = Date.now();
      let uci;
      try {
        const book = model && cur.opening !== 'frei' ? bookMove(model, cur.color, chess.fen(), { chapterId: cur.opening || null }) : null;
        uci = book || await botMove(chess.fen(), cur.botElo);
      } catch {
        statusEl.textContent = 'Die Engine antwortet nicht. Lade die Seite neu, die Partie bleibt gespeichert.';
        return;
      }
      // Menschliches Tempo: mindestens eine kurze Bedenkzeit
      const wait = Math.max(0, 400 + Math.random() * 900 - (Date.now() - t0));
      await new Promise(r => setTimeout(r, wait));
      if (my !== gen || over || !root.isConnected) return;
      const m = board.move(uci);
      if (!m) { statusEl.textContent = 'Der Bot hat keinen Zug gefunden.'; return; }
      cur.moves.push(m.san);
      if (!afterMove(botColor)) myTurn();
    }

    function finish(result, reason) {
      if (over) return;
      over = true;
      gen++;
      clearInterval(interval);
      board.setMovable('none');
      // Noch kein Zug von beiden Seiten: abgebrochen, zählt nicht für die Wertung
      if (cur.moves.length < 2) {
        store.update('play', d => { d.current = null; });
        statusEl.replaceChildren(h('div.pl-result.draw', h('b', 'Partie abgebrochen'), ` (${reason}, nicht gewertet)`));
        clear(controls).append(
          h('button.primary', { onclick: () => newGame() }, 'Neue Partie'),
          h('button', { onclick: () => renderSetup() }, 'Übersicht'));
        return;
      }
      const a = area();
      const played = a.games.length;
      const score = result === 'W' ? 1 : result === 'D' ? 0.5 : 0;
      const after = newRating(cur.ratingBefore, cur.botElo, score, played);
      const record = {
        id: cur.id, date: cur.date, color: cur.color, result, botElo: cur.botElo,
        ratingBefore: cur.ratingBefore, ratingAfter: after, moves: [...cur.moves], reason,
      };
      const minutes = Math.min(60, Math.round((Date.now() - cur.startedAt) / 6000) / 10);
      store.update('play', d => { d.games.push(record); d.games = d.games.slice(-100); d.rating = after; d.current = null; });
      store.logActivity({ minutes, botGames: 1 });
      renderResult(record);
    }

    async function renderResult(record) {
      const diff = record.ratingAfter - record.ratingBefore;
      statusEl.replaceChildren(h('div.pl-result.' + (record.result === 'W' ? 'good' : record.result === 'L' ? 'bad' : 'draw'),
        h('b', `${RESULT_DE[record.result]}`), ` (${record.reason})`),
        h('div.small', `Wertung ${record.ratingBefore} → ${record.ratingAfter} (${diff >= 0 ? '+' : ''}${diff})`));
      clear(controls).append(
        h('button.primary', { onclick: () => newGame() }, 'Neue Partie'),
        h('button', { onclick: () => renderSetup() }, 'Übersicht'));
      const report = h('div.card.pl-report', h('div.muted', 'Analyse läuft …'));
      const bar = progressBar(0);
      report.append(bar);
      side.insertBefore(report, controls.nextSibling);
      if (record.moves.length < 4) { report.replaceChildren(h('div.muted', 'Zu kurz für eine Analyse.')); return; }

      analysing.add(record.id);
      const res = await analyseGame({ sans: record.moves, color: record.color, id: record.id, date: record.date }, {
        alive: () => root.isConnected && round === mine,
        onProgress: f => bar.set(f),
      }).catch(() => null);
      analysing.delete(record.id);
      if (!res) return;
      saveAnalysis(record.id, res);
      if (!root.isConnected || round !== mine) return;
      if (!game) { renderSetup(); return; }     // inzwischen zur Übersicht gewechselt: dort die Genauigkeit nachtragen
      let opening = null;
      try {
        const model = await loadModel();
        const c = followGame(model, record.color, record.moves);
        opening = { c, upTo: c.plies ? `Nach ${formatLine(record.moves.slice(0, c.plies))} ` : 'Gleich im ersten Zug ' };
        if (c.kind === 'ich' && c.expected[0]) {
          const key = cardKey(c.fen, c.expected[0]);
          opening.known = model.keys.has(key) && !!store.get('openings').cards?.[key];
          if (opening.known) store.update('openings', d => { d.cards[key].due = todayStr(); });
          opening.key = key;
        }
      } catch { /* Repertoire fehlt */ }

      const bad = res.moves.filter(m => m.cls);
      report.replaceChildren(...[
        h('div.row.pl-acc', h('div', h('div.stat', res.accuracy != null ? `${String(res.accuracy).replace('.', ',')} %` : '–'), h('div.small.muted', 'Genauigkeit')),
          ...['blunder', 'mistake', 'inaccuracy'].map(k => h('div', h('div.stat.pl-' + k, String(res.counts[k])), h('div.small.muted', CLASS_DE[k] + (res.counts[k] === 1 ? '' : k === 'inaccuracy' ? 'en' : '')))) ),
        opening ? h('div.small', opening.c.kind === 'ich'
          ? h('span', `Eröffnung: ${opening.upTo}hast du ${formatLine([opening.c.played], opening.c.plies)} gespielt, dein Repertoire sagt ${figurine(opening.c.expected[0])}. ${opening.known ? 'Die Stellung kommt heute in die Wiederholung.' : 'Diese Stellung hast du noch nicht gelernt, sie kommt mit ihrer Linie im Tagesplan.'}`)
          : opening.c.kind === 'gegner'
            ? `Eröffnung: ${opening.upTo}wich der Bot mit ${formatLine([opening.c.played], opening.c.plies)} ab.`
            : `Eröffnung: ${opening.upTo}war alles Repertoire.`) : null,
        bad.length ? h('div.pl-mistakes', h('b', 'Deine Fehler (antippen zum Ansehen):'),
          h('ul', bad.map(m => h('li', h('a', {
            href: 'javascript:void 0',
            onclick: () => {
              const played = new Chess(m.fen).move(m.san);
              board.setPosition(m.fen, { orientation: record.color === 'w' ? 'white' : 'black' });
              board.setShapes([
                { orig: played.from, dest: played.to, brush: 'red' },
                ...(m.best ? [{ orig: m.best.slice(0, 2), dest: m.best.slice(2, 4), brush: 'green' }] : []),
              ]);
            },
          }, formatLine([m.san], m.ply)), ` ${CLASS_DE[m.cls]}`, m.bestSan ? h('span.muted', `, besser ${figurine(m.bestSan)}`) : null))))
          : h('div.feedback.good', 'Keine groben Fehler. Stark!'),
        res.puzzles.length ? h('div.row', h('a.btn', { href: '#/taktik?modus=eigene' }, `${res.puzzles.length} Fehler als Aufgaben üben`)) : null,
      ].filter(Boolean));
    }

    renderMoves();
    if (chess.turn() === cur.color) myTurn(); else botTurn();
    game = { destroy() { over = true; gen++; clearInterval(interval); board.destroy(); } };
  }

  return () => { alive = false; game?.destroy(); };
}
