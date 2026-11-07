// Partie-Check: die letzten Partien (chess.com und gegen Bots) mit dem Repertoire vergleichen.
// Pro Partie: wie lange du im Repertoire warst, wer zuerst abgewichen ist und was richtig gewesen wäre.
// Eigene Abweichungen lassen sich direkt als Stellungen üben (Weichen-Training mit diesen Stellungen).
//
// renderGameCheck(el, { model, games, onDrill(keys), onEngine(fen) → Promise<text> })
// games: [{date, color, opponent, result, tc, moves: [SAN], source}]

import { Chess } from '../../vendor/chess.js';
import { h, figurine, formatLine } from '../ui.js';
import { followGame, cardKey } from './logic.js';
import { moveLabel, button } from './widgets.js';

const RESULT = { W: 'gewonnen', L: 'verloren', D: 'remis' };
const TC = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', daily: 'Täglich', bot: 'Bot' };

export function checkGames(model, games) {
  return games.map(g => {
    const c = followGame(model, g.color, g.moves || []);
    const key = c.kind === 'ich' && c.expected[0] ? cardKey(c.fen, c.expected[0]) : null;
    return { game: g, check: c, key };
  });
}

// Auswahl: Rapid und Bot-Partien zählen fürs Training, Bullet und Blitz nur auf Wunsch
const FILTERS = [['training', 'Rapid und Bots', g => g.tc === 'rapid' || g.tc === 'bot'], ['alle', 'Alle Partien', () => true]];

export function renderGameCheck(el, { model, games, onDrill, onEngine }) {
  let current = 'training';
  const body = h('div');
  const bar = h('div.row.op-gc-filter');
  el.append(bar, body);
  function draw() {
    bar.replaceChildren(...FILTERS.map(([id, label]) => button({ label, primary: id === current, onClick: () => { current = id; draw(); } })));
    body.replaceChildren();
    const f = FILTERS.find(x => x[0] === current)[2];
    renderList(body, { model, games: games.filter(f), onDrill, onEngine });
  }
  draw();
}

function renderList(el, { model, games, onDrill, onEngine }) {
  if (!games.length) {
    el.append(h('div.card.muted', 'Noch keine Partien. Spiel gegen einen Bot oder warte auf die nächste Auswertung deiner chess.com-Partien.'));
    return;
  }
  const rows = checkGames(model, games);
  const mine = rows.filter(r => r.check.kind === 'ich');
  const theirs = rows.filter(r => r.check.kind === 'gegner');
  const avg = rows.reduce((s, r) => s + Math.floor(r.check.plies / 2), 0) / rows.length;

  // Häufigste eigene Abweichungen zusammenfassen
  const byKey = new Map();
  for (const r of mine) {
    const k = r.key + '|' + r.check.played;
    const e = byKey.get(k) || { ...r, count: 0 };
    e.count++;
    byKey.set(k, e);
  }
  const top = [...byKey.values()].sort((a, b) => b.count - a.count);
  const keys = [...new Set(mine.map(r => r.key).filter(k => model.keys.has(k)))];

  el.append(h('div.card.op-gc-head',
    h('div.op-stats',
      stat(rows.length, 'Partien'),
      stat(avg.toFixed(1), 'Züge im Repertoire (Ø)'),
      stat(mine.length, 'selbst abgewichen', mine.length ? 'warn' : ''),
      stat(theirs.length, 'Gegner abgewichen')),
    top.length ? h('div.op-gc-top',
      h('b', 'Das passiert dir am häufigsten:'),
      h('ul', top.slice(0, 5).map(r => h('li',
        r.check.plies ? h('span.muted', `Nach ${formatLine(r.game.moves.slice(0, r.check.plies))}: `) : null,
        `${moveLabel(r.check.plies, r.check.played)} statt ${figurine(r.check.expected[0])}`,
        r.count > 1 ? h('span.muted', ` (${r.count}-mal)`) : null)))) : h('div.feedback.good', 'Du bist in keiner Partie selbst vom Repertoire abgewichen.'),
    keys.length ? h('div.row', button({ label: `Diese ${keys.length} Stellung${keys.length === 1 ? '' : 'en'} üben`, primary: true, onClick: () => onDrill?.(keys) })) : null));

  const list = h('div.op-gc-list');
  for (const r of rows) list.append(gameRow(r));
  el.append(list);

  function gameRow({ game: g, check: c, key }) {
    const head = h('div.row.op-gc-meta',
      h('span.pill', TC[g.tc] || g.tc || ''),
      h('span', `${g.color === 'w' ? 'Weiß' : 'Schwarz'} gegen ${g.opponent || '?'}`),
      h('span.muted.small', `${g.date || ''} · ${RESULT[g.result] || ''}`));
    const inBook = Math.floor(c.plies / 2);
    let body;
    if (c.kind === 'ich') {
      body = h('div',
        h('div.feedback.bad', c.plies ? `Nach ${formatLine(g.moves.slice(0, c.plies))} ` : 'Gleich ', `hast du ${moveLabel(c.plies, c.played)} gespielt. Dein Repertoire spielt hier ${c.expected.map(figurine).join(' oder ')}.`),
        key && model.keys.has(key) ? button({ label: 'Üben', onClick: () => onDrill?.([key]) }) : null);
    } else if (c.kind === 'gegner') {
      const out = h('span.muted.small');
      body = h('div',
        h('div.feedback.info', `${inBook} Züge im Repertoire, dann kam ${moveLabel(c.plies, c.played)}. Dafür hast du noch keine vorbereitete Antwort.`),
        h('div.row', onEngine ? button({
          label: 'Was spiele ich da?',
          onClick: async e => {
            e.target.disabled = true;
            out.textContent = 'Engine rechnet …';
            const fen = afterMove(c.fen, c.played);
            out.textContent = fen ? await onEngine(fen) : 'Zug nicht lesbar.';
          },
        }) : null, out));
    } else {
      body = h('div.feedback.good', `${inBook} Züge im Repertoire, bis die Linie zu Ende war.`);
    }
    return h('div.card.tight.op-gc-game', head, body);
  }
}

function afterMove(fen, san) {
  try {
    const c = new Chess(fen);
    c.move(san);
    return c.fen();
  } catch { return null; }
}

function stat(value, label, kind = '') {
  return h('div.op-stat' + (kind ? '.' + kind : ''), h('div.stat', String(value)), h('div.muted.small', label));
}
