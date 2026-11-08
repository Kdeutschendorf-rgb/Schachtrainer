// Partie-Besprechung (#/besprechung): die drei wichtigsten Momente einer Rapid- oder Bot-Partie.
// Du siehst, was du gespielt hast, suchst zuerst selbst den besseren Zug und bekommst danach die Erklärung.
//
// Bereich im Fortschritt `review`: { done: {partieSchlüssel: datum} }

import { h, clear, loadCss, countdown, figurine, loadPlayerData, today } from '../ui.js';
import * as store from '../store.js';
import { createBoard } from '../board.js';
import { Chess } from '../../vendor/chess.js';
import { analyse, winPct } from '../engine.js';
import { TAG_DE } from '../report/weekly.js';

const MOMENTS = 3;
const OK_LOSS = 8;      // so viele Prozentpunkte unter dem besten Zug zählen noch als richtig

const area = () => { const d = store.get('review'); d.done ||= {}; return d; };
const keyOf = g => (g.id ? `bot${g.id}` : `${g.date}|${g.opponent}|${(g.moves || []).slice(0, 8).join('')}`);
const germanDate = d => String(d || '').split('-').reverse().join('.');
const num = ply => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;

function topMoments(list) {
  return [...list].sort((a, b) => (b.drop || 0) - (a.drop || 0)).slice(0, MOMENTS).sort((a, b) => a.ply - b.ply);
}

// Alle besprechbaren Partien, neueste zuerst: chess.com-Rapid und Bot-Partien mit Fehlern
export function reviewableGames(summary, playGames = []) {
  const cc = (summary?.recentGames || []).filter(g => g.tc === 'rapid' && g.errors?.some(e => e.fen))
    .map(g => ({ ...g, source: 'chess.com', moments: topMoments(g.errors.filter(e => e.fen)) }));
  const bots = playGames.filter(g => g.moments?.length).map(g => ({ ...g, opponent: `Bot ${g.botElo}`, source: 'Bot', moments: g.moments }));
  return [...bots, ...cc].map(g => ({ ...g, key: keyOf(g) })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function openReviews(summary, playGames, done = {}) {
  return reviewableGames(summary, playGames).filter(g => !done[g.key]);
}

// Eine Partie besprechen. onEnd({moments, correct})
function createReview(el, game, onEnd) {
  const boardEl = h('div');
  const statusEl = h('div.op-status');
  const coachEl = h('div.rv-coach');
  const controls = h('div.row');
  el.append(h('div.trainer', boardEl, h('div.side',
    h('div.card.tight', h('strong', `${game.color === 'w' ? 'Weiß' : 'Schwarz'} gegen ${game.opponent}`), h('div.small.muted', `${germanDate(game.date)} · ${game.source}`)),
    statusEl, coachEl, controls)));
  const board = createBoard(boardEl, { orientation: game.color === 'w' ? 'white' : 'black', movable: 'none', autoQueen: true });
  let i = -1, correct = 0, token = 0, gone = false;

  function next() {
    i++;
    if (i >= game.moments.length) return finish();
    const m = game.moments[i];
    token++;
    board.setPosition(m.fen);
    board.setShapes([]);
    statusEl.textContent = `Moment ${i + 1} von ${game.moments.length}: Zug ${num(m.ply)}`;
    coachEl.replaceChildren(h('div.feedback.warn', `Du hast ${figurine(m.played)} gespielt. Das hat dich viel gekostet. Was war besser? Zieh den Zug.`));
    controls.replaceChildren(h('button', { onclick: () => reveal(m, null) }, 'Lösung zeigen'));
    board.setMovable(game.color === 'w' ? 'white' : 'black');
    board.setOnMove(mv => { check(m, mv); return true; });
  }

  async function check(m, mv) {
    const my = ++token;
    board.setMovable('none');
    controls.replaceChildren();
    coachEl.replaceChildren(h('div.muted', 'Die Engine prüft deinen Zug …'));
    let loss = mv.uci === m.bestUci ? 0 : null;
    if (loss == null) {
      try {
        const c = new Chess(mv.fen);
        const [a, b] = [await analyse(m.fen, { movetime: 700 }), c.isGameOver() ? null : await analyse(mv.fen, { movetime: 500 })];
        if (my !== token || gone) return;
        const after = b ? winPct(b.lines[0].score, game.color) : c.isCheckmate() ? 100 : 50;
        loss = winPct(a.lines[0].score, game.color) - after;
      } catch { loss = 100; }
    }
    if (my !== token || gone) return;
    reveal(m, { ok: loss <= OK_LOSS, san: mv.san });
  }

  function reveal(m, res) {
    token++;
    board.setMovable('none');
    board.setOnMove(null);
    if (res?.ok) { correct++; board.flash('good'); } else if (res) board.flash('bad');
    if (!res?.ok) board.setPosition(m.fen);
    const played = (() => { try { return new Chess(m.fen).move(m.played); } catch { return null; } })();
    board.setShapes([
      played ? { orig: played.from, dest: played.to, brush: 'red' } : null,
      m.bestUci ? { orig: m.bestUci.slice(0, 2), dest: m.bestUci.slice(2, 4), brush: 'green' } : null,
    ].filter(Boolean));
    const why = (m.tags || []).map(t => TAG_DE[t]).filter(Boolean);
    coachEl.replaceChildren(...[
      res ? h(`div.feedback.${res.ok ? 'good' : 'bad'}`, res.ok ? `${figurine(res.san)} ist gut.` : `${figurine(res.san)} reicht nicht.`) : null,
      m.best ? h('div', 'Bester Zug: ', h('strong', figurine(m.best))) : null,
      why.length ? h('div.small', `Was passiert ist: ${why.join(', ')}.`) : null,
      m.pv ? h('div.small.muted', `Fortsetzung: ${m.pv.split(' ').map(figurine).join(' ')}`) : null,
      h('div.small.muted', 'Rot: dein Zug. Grün: der bessere Zug.'),
    ].filter(Boolean));
    controls.replaceChildren(h('button.primary', { onclick: next }, i + 1 < game.moments.length ? 'Nächster Moment' : 'Fertig'));
  }

  function finish() {
    store.update('review', d => { (d.done ||= {})[game.key] = today(); });
    onEnd?.({ moments: game.moments.length, correct });
  }

  next();
  return () => { gone = true; token++; board.destroy(); };
}

// ---------- Seite ----------
export async function mount(el) {
  loadCss('css/openings.css');
  let cleanup = null;
  const summary = await loadPlayerData('analysis_summary.json').catch(() => null);
  function list() {
    cleanup?.(); cleanup = null;
    clear(el);
    const done = area().done;
    const games = reviewableGames(summary, store.get('play').games || []);
    el.append(h('div.card',
      h('h1', 'Partie-Besprechung'),
      h('p.muted', 'Die drei wichtigsten Momente jeder Partie: Du suchst zuerst selbst den besseren Zug.'),
      games.length ? null : h('div.feedback.info', 'Noch keine Partien zum Besprechen. Spiel eine Rapid-Partie oder gegen einen Bot.')));
    el.append(...games.slice(0, 20).map(g => h('a.card.tight.rv-game', { href: 'javascript:void 0', onclick: () => open(g) },
      h('div.row', h('strong', `${g.color === 'w' ? 'Weiß' : 'Schwarz'} gegen ${g.opponent}`), h('span.spacer'),
        h('span.pill' + (done[g.key] ? '.good' : '.bad'), done[g.key] ? 'besprochen' : 'offen')),
      h('div.small.muted', `${germanDate(g.date)} · ${g.source} · ${g.moments.length} ${g.moments.length === 1 ? 'Moment' : 'Momente'}`))));
  }
  function open(g) {
    cleanup?.();
    clear(el);
    const host = h('div');
    el.append(host);
    cleanup = createReview(host, g, () => {
      store.logActivity({ reviews: 1 });
      list();
    });
  }
  list();
  return () => cleanup?.();
}

// ---------- Block im Tagesplan ----------
export function runBlock(el, { minutes = 3, mode = 'review', onDone } = {}) {
  const started = Date.now();
  const stats = { games: 0, moments: 0, correct: 0 };
  let cleanup = null, finished = false, timeUp = false;
  const timer = countdown(Math.max(1, minutes) * 60, { onEnd: () => { timeUp = true; } });
  const host = h('div');
  el.append(h('div.row', h('strong', 'Partie-Besprechung'), h('span.spacer'), timer.el, h('button', { onclick: () => end() }, 'Block beenden')), host);

  function end() {
    if (finished) return;
    finished = true;
    timer.stop();
    cleanup?.(); cleanup = null;
    onDone?.({ type: 'review', mode, minutes: Math.round((Date.now() - started) / 6000) / 10, done: stats.moments, correct: stats.correct, details: { ...stats } });
  }

  (async () => {
    const summary = await loadPlayerData('analysis_summary.json').catch(() => null);
    const next = () => {
      cleanup?.(); cleanup = null;
      clear(host);
      const g = timeUp || finished ? null : openReviews(summary, store.get('play').games || [], area().done)[0];
      if (!g) return end();
      cleanup = createReview(host, g, r => {
        stats.games++; stats.moments += r.moments; stats.correct += r.correct;
        store.logActivity({ reviews: 1 });
        next();
      });
    };
    next();
  })();

  return () => { finished = true; timer.stop(); cleanup?.(); };
}
