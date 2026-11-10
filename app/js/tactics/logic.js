// Taktik-Logik ohne DOM: Aufgaben-Index, Auswahl, Wertung (Glicko), Lösungsprüfung,
// Wiederholung der Fehlversuche (SRS) und das Speichern eines Versuchs im Fortschritt.
// Läuft auch in JavaScriptCore (siehe logic.test.mjs).

import { Chess } from '../../vendor/chess.js';
import { todayStr, addDays } from '../srs.js';

// ---------------------------------------------------------------------------
// Themen

// Für die Themenauswahl im Modus „Thema wählen“
export const THEME_GROUPS = [
  ['Motive', ['fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack', 'discoveredCheck', 'doubleCheck',
    'deflection', 'attraction', 'capturingDefender', 'clearance', 'interference', 'intermezzo', 'trappedPiece',
    'sacrifice', 'xRayAttack', 'quietMove', 'defensiveMove', 'zugzwang', 'exposedKing', 'kingsideAttack',
    'queensideAttack', 'attackingF2F7', 'advancedPawn', 'promotion']],
  ['Matt', ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'backRankMate', 'smotheredMate', 'anastasiaMate',
    'arabianMate', 'hookMate', 'operaMate', 'pillsburysMate', 'epauletteMate']],
  ['Partiephase', ['opening', 'middlegame', 'endgame', 'rookEndgame', 'pawnEndgame', 'queenEndgame',
    'bishopEndgame', 'knightEndgame', 'queenRookEndgame']],
  ['Länge', ['oneMove', 'short', 'long', 'veryLong']],
];

// Namen, die in coach.THEMES_DE (noch) fehlen
export const EXTRA_THEMES_DE = {
  discoveredCheck: ['Abzugsschach', 'Eine Figur zieht weg und gibt ein Schach einer anderen frei.'],
  operaMate: ['Opernmatt', 'Turm (oder Dame) und Läufer setzen auf der Grundreihe matt.'],
  pillsburysMate: ['Pillsbury-Matt', 'Turm und Läufer gegen den König in der Ecke.'],
  epauletteMate: ['Epaulettenmatt', 'Der König wird von seinen eigenen Türmen links und rechts eingeklemmt.'],
  cornerMate: ['Eckmatt', ''], triangleMate: ['Dreiecksmatt', ''], swallowstailMate: ['Schwalbenschwanz-Matt', ''],
  morphysMate: ['Morphy-Matt', ''], killBoxMate: ['Kill-Box-Matt', ''], blindSwineMate: ['Blinde-Schweine-Matt', ''],
  vukovicMate: ['Vuković-Matt', ''], balestraMate: ['Balestra-Matt', ''], collinearMove: ['Kollinearer Zug', ''],
};

// Themen für den gewichteten Mix (Standard/Hauptblock) mit Grundgewicht:
// Was auf ~1100–1400 am häufigsten Partien entscheidet, kommt öfter.
export const MIX_BASE = {
  fork: 3, hangingPiece: 3, pin: 2, mateIn1: 2, mateIn2: 2, skewer: 1.5, discoveredAttack: 1.5,
  backRankMate: 1.5, defensiveMove: 1.5, trappedPiece: 1.2, deflection: 1.2, attraction: 1,
  capturingDefender: 1, doubleCheck: 0.8, discoveredCheck: 0.8, intermezzo: 0.8, clearance: 0.6,
  interference: 0.5, xRayAttack: 0.6, sacrifice: 1, quietMove: 0.8, exposedKing: 1, kingsideAttack: 1,
  attackingF2F7: 0.8, advancedPawn: 0.8, promotion: 0.8, mateIn3: 1, smotheredMate: 0.5,
  endgame: 1, rookEndgame: 0.6, pawnEndgame: 0.6, opening: 1,
};

// Lange Aufgaben für den Modus „Rechnen“
export const CALC_THEMES = ['long', 'veryLong', 'mateIn3', 'mateIn4', 'mateIn5'];

// Tags der eigenen Fehler → Lichess-Themen (nur zur Anzeige und Statistik)
export const TAG_TO_THEME = {
  gabel: 'fork', figur_eingestellt: 'hangingPiece', materialverlust: 'hangingPiece',
  matt_verpasst: 'mate', matt_zugelassen: 'defensiveMove', chance_verpasst: 'advantage', schach: 'exposedKing',
};

// ---------------------------------------------------------------------------
// Aufgaben normalisieren und indizieren

// Lichess-Zeile [id, fen, movesUci, rating, themes, openingTags] → Aufgabe
export function puzzleFromRow(row) {
  return {
    key: row[0], id: row[0], source: 'lichess', fen: row[1], moves: row[2].split(' '),
    rating: row[3], themes: row[4] ? row[4].split(' ') : [], opening: row[5] || '',
  };
}

// Eigene Aufgaben aus my_puzzles.json. Schlüssel mit Präfix, damit nichts mit Lichess-IDs kollidiert.
export function normalizeOwn(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(p => p && p.fen && Array.isArray(p.moves) && p.moves.length).map(p => ({
    ...p, key: 'my:' + p.id, source: 'own', rating: null,
    themes: [...new Set((p.tags || []).map(t => TAG_TO_THEME[t]).filter(Boolean))],
  }));
}

// Index: alle Aufgaben nach Wertung sortiert, dazu eine Liste pro Thema (ebenfalls sortiert).
// Die Rohdaten bleiben unverändert; Aufgabenobjekte entstehen erst bei der Auswahl.
export function buildIndex(rows) {
  const n = rows.length;
  const ratings = new Int16Array(n);
  for (let i = 0; i < n; i++) ratings[i] = rows[i][3];
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => ratings[a] - ratings[b]);
  const themeLists = { __all: order, __calc: [], __short: [] };
  const byId = new Map();
  for (const i of order) {
    const row = rows[i];
    byId.set(row[0], i);
    let calc = false;
    for (const t of row[4].split(' ')) {
      if (!t) continue;
      (themeLists[t] ||= []).push(i);
      if (CALC_THEMES.includes(t)) calc = true;
    }
    if (calc) themeLists.__calc.push(i);
    // „schnell“: höchstens zwei eigene Züge (für das Aufwärmen)
    if (row[2].split(' ').length <= 4) themeLists.__short.push(i);
  }
  const byTheme = {};
  for (const [t, list] of Object.entries(themeLists)) byTheme[t] = Int32Array.from(list);
  return { rows, ratings, byTheme, byId, size: n };
}

export function themeCount(index, theme) {
  return index.byTheme[theme]?.length || 0;
}

export function puzzleById(index, id) {
  const i = index.byId.get(id);
  return i == null ? null : puzzleFromRow(index.rows[i]);
}

// erster Eintrag in list (nach Wertung sortiert) mit Wertung >= r
function lowerBound(list, ratings, r) {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ratings[list[mid]] < r) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Zufällige Aufgabe um target (±window), die nicht in `seen` liegt.
// Findet sich nichts, wird das Fenster schrittweise größer; zur Not auch schon Gesehenes.
// maxWindow: weiter nicht suchen (null zurückgeben), z. B. damit seltene Themen im Mix nicht zu leicht/schwer werden.
export function pickPuzzle(index, { target, window = 150, maxWindow = 3200, theme = '__all', seen, filter, rnd = Math.random } = {}) {
  const list = index.byTheme[theme];
  if (!list || !list.length) return null;
  const ok = i => (!seen || !seen.has(index.rows[i][0])) && (!filter || filter(index.rows[i]));
  for (let w = window; w <= maxWindow; w *= 2) {
    const a = lowerBound(list, index.ratings, target - w);
    const b = lowerBound(list, index.ratings, target + w + 1);
    if (b <= a) continue;
    // erst zufällig probieren, dann (kleine Bereiche) vollständig durchsuchen
    for (let k = 0; k < 40; k++) {
      const i = list[a + Math.floor(rnd() * (b - a))];
      if (ok(i)) return puzzleFromRow(index.rows[i]);
    }
    if (b - a <= 4000) {
      const start = Math.floor(rnd() * (b - a));
      for (let k = 0; k < b - a; k++) {
        const i = list[a + ((start + k) % (b - a))];
        if (ok(i)) return puzzleFromRow(index.rows[i]);
      }
    }
  }
  if (maxWindow < 3200) return null;
  // alles gesehen: dann eben eine Wiederholung
  const i = list[Math.min(list.length - 1, lowerBound(list, index.ratings, target))];
  return puzzleFromRow(index.rows[i]);
}

// ---------------------------------------------------------------------------
// Wertung (Glicko-1). Aufgaben haben eine feste, kleine Unsicherheit.

export const RATING_START = 1300;
export const RD_START = 350;
export const RD_MIN = 60;          // damit die Wertung beweglich bleibt
export const PUZZLE_RD = 75;
const RD_PER_DAY = 15;             // Unsicherheit wächst bei Pausen wieder
const Q = Math.LN10 / 400;
const g = rd => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));

export function expectedScore(rating, puzzleRating, prd = PUZZLE_RD) {
  return 1 / (1 + 10 ** ((-g(prd) * (rating - puzzleRating)) / 400));
}

export function inflateRd(rd, days) {
  return Math.min(RD_START, Math.sqrt(rd * rd + RD_PER_DAY * RD_PER_DAY * Math.max(0, days)));
}

// score: 1 = gelöst, 0 = nicht gelöst → {rating, rd}
export function glicko(rating, rd, puzzleRating, score, prd = PUZZLE_RD) {
  const gj = g(prd);
  const e = expectedScore(rating, puzzleRating, prd);
  const denom = 1 / (rd * rd) + Q * Q * gj * gj * e * (1 - e);
  return {
    rating: Math.round((rating + (Q / denom) * gj * (score - e)) * 10) / 10,
    rd: Math.round(Math.max(RD_MIN, Math.sqrt(1 / denom)) * 10) / 10,
  };
}

export function daysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

// Wertung gilt als vorläufig, solange die Unsicherheit hoch ist
export const isProvisional = area => (area.rd ?? RD_START) > 110;

// ---------------------------------------------------------------------------
// Wiederholung der Fehlversuche: 1 / 3 / 7 / 14 / 30 / 60 Tage, danach gilt die Aufgabe als sicher.
// Karten bleiben mit srs.js verträglich (due, interval, reps).

export const LADDER = [1, 3, 7, 14, 30, 60];

export function srsFail(card, day = todayStr()) {
  return { due: addDays(day, 1), interval: 1, step: 0, reps: 0, lapses: (card?.lapses || 0) + 1, last: day };
}

// gibt null zurück, wenn die Aufgabe „sitzt“ (Karte wird gelöscht)
export function srsPass(card, day = todayStr()) {
  const step = (card?.step ?? 0) + 1;
  if (step >= LADDER.length) return null;
  const interval = LADDER[step];
  return { due: addDays(day, interval), interval, step, reps: step, lapses: card?.lapses || 0, last: day };
}

export function dueCards(area, day = todayStr()) {
  return Object.entries(area.cards || {})
    .filter(([, c]) => c && c.due <= day)
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : 0))
    .map(([key]) => key);
}

// ---------------------------------------------------------------------------
// Fortschritt (`tactics`)

export const HISTORY_MAX = 2000;

export function ensureArea(d) {
  d.rating ??= RATING_START;
  d.rd ??= RD_START;
  d.history ||= [];
  d.themeStats ||= {};
  d.cards ||= {};
  d.rush ||= { best: 0 };
  d.ownSeen ||= {};
  return d;
}

// Einen Versuch eintragen (mutiert `area`). Gibt {rating, delta} zurück.
// opts: {puzzle, ok, sec, rated, countThemes, repeat, day}
export function recordAttempt(area, { puzzle, ok, sec = 0, rated = false, countThemes = false, repeat = false, day = todayStr() }) {
  ensureArea(area);
  const before = area.rating;
  if (rated && puzzle.rating) {
    const rd = inflateRd(area.rd, daysBetween(area.lastRated, day));
    const res = glicko(area.rating, rd, puzzle.rating, ok ? 1 : 0);
    area.rating = res.rating;
    area.rd = res.rd;
    area.lastRated = day;
  }
  area.history.push([puzzle.key, ok ? 1 : 0, day, Math.round(area.rating), Math.round(sec)]);
  if (area.history.length > HISTORY_MAX) area.history.splice(0, area.history.length - HISTORY_MAX);
  if (countThemes) {
    for (const t of puzzle.themes || []) {
      const s = (area.themeStats[t] ||= [0, 0]);
      s[0] += ok ? 1 : 0;
      s[1] += 1;
    }
  }
  const card = area.cards[puzzle.key];
  if (!ok) area.cards[puzzle.key] = srsFail(card, day);
  else if (repeat || card) {
    const next = srsPass(card, day);
    if (next) area.cards[puzzle.key] = next; else delete area.cards[puzzle.key];
  }
  if (puzzle.source === 'own') area.ownSeen[puzzle.id] = 1;
  return { rating: area.rating, delta: Math.round(area.rating - before) };
}

// Fehlerquote pro Thema mit Vorannahme (35 % bei wenigen Versuchen)
export function themeErrorRate(stats, theme, prior = 0.35, k = 6) {
  const [right, total] = stats?.[theme] || [0, 0];
  return (total - right + prior * k) / (total + k);
}

// Gewicht eines Themas im Mix: Grundgewicht × Schwäche aus den Partien × eigene Fehlerquote
export function themeWeights(area, focus = {}) {
  const maxFocus = Math.max(0, ...Object.values(focus).filter(v => typeof v === 'number'));
  const out = {};
  for (const [t, base] of Object.entries(MIX_BASE)) {
    const f = maxFocus > 0 && focus[t] > 0 ? 1 + (2 * focus[t]) / maxFocus : 1;
    const e = 0.5 + 1.5 * themeErrorRate(area.themeStats, t);
    out[t] = base * f * e;
  }
  return out;
}

export function weightedChoice(weights, rnd = Math.random) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * sum;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries.length ? entries[entries.length - 1][0] : null;
}

// Stärkste und schwächste Themen (nur mit genug Versuchen)
export function themeRanking(stats, { min = 5, only } = {}) {
  return Object.entries(stats || {})
    .filter(([t, [, total]]) => total >= min && (!only || only.includes(t)))
    .map(([theme, [right, total]]) => ({ theme, right, total, rate: right / total }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total);
}

// ---------------------------------------------------------------------------
// Auswahl der nächsten Aufgabe je Modus
//
// ctx: {index, area, mode, focus, theme, own, session: Set (in dieser Sitzung gezeigt),
//       counter (Anzahl bisher), rushLevel, rnd, day}
// Rückgabe: Aufgabe mit Flags {rated, repeat, countThemes} oder null.

export function seenSet(area, session) {
  const s = new Set(session || []);
  for (const e of area.history || []) s.add(e[0]);
  for (const k of Object.keys(area.cards || {})) s.add(k);
  return s;
}

function byKey(ctx, key) {
  if (key.startsWith('my:')) return (ctx.own || []).find(p => p.key === key) || null;
  return ctx.index ? puzzleById(ctx.index, key) : null;
}

export function nextRepeat(ctx, filter = () => true) {
  for (const key of dueCards(ctx.area, ctx.day)) {
    if (ctx.session?.has(key) || !filter(key)) continue;
    const p = byKey(ctx, key);
    if (p) return { ...p, rated: false, repeat: true, countThemes: false };
  }
  return null;
}

// eigene Fehler: zuerst fällige, dann neue (Rapid zuerst, dann Patzer, dann neueste)
// Mit ctx.setIds (Übungssatz aus dem Schwächenprofil) nur Aufgaben dieses Satzes; ctx.setInfo {title, rule} wandert
// an die Aufgabe, damit der Trainer den Merksatz zeigt. ctx.setAgain: Ist im Satz nichts mehr offen, kommen die
// schon gelösten noch einmal (am längsten nicht geübte zuerst), ohne die Wiederholungs-Abstände zu ändern.
export function nextOwn(ctx) {
  const inSet = id => !ctx.setIds || ctx.setIds.has(id);
  const flags = { rated: false, countThemes: false, ...(ctx.setInfo ? { set: ctx.setInfo } : {}) };
  const due = nextRepeat(ctx, k => k.startsWith('my:') && inSet(k.slice(3)));
  if (due) return { ...due, ...flags };
  const seen = ctx.area.ownSeen || {};
  const rank = p => (p.tc === 'rapid' ? 0 : p.tc === 'blitz' ? 1 : 2) * 10 + (p.cls === 'blunder' ? 0 : 1);
  const fresh = (ctx.own || []).filter(p => inSet(p.id) && !seen[p.id] && !ctx.area.cards?.[p.key] && !ctx.session?.has(p.key))
    .sort((a, b) => rank(a) - rank(b) || String(b.date).localeCompare(String(a.date)));
  if (fresh.length) return { ...fresh[0], repeat: false, ...flags };
  if (ctx.setIds && ctx.setAgain) {
    const lastSeen = new Map();
    (ctx.area.history || []).forEach((e, i) => lastSeen.set(e[0], i));
    const again = (ctx.own || []).filter(p => inSet(p.id) && !ctx.session?.has(p.key) && !ctx.area.cards?.[p.key])
      .sort((a, b) => (lastSeen.get(a.key) ?? -1) - (lastSeen.get(b.key) ?? -1));
    if (again.length) return { ...again[0], repeat: false, again: true, ...flags };
  }
  return null;
}

export function ownOpenCount(area, own, day = todayStr()) {
  const seen = area.ownSeen || {};
  return (own || []).filter(p => (!seen[p.id] && !area.cards?.[p.key]) || (area.cards?.[p.key]?.due <= day)).length;
}

export function selectNext(ctx) {
  const { index, area, mode, rnd = Math.random } = ctx;
  const rating = area.rating ?? RATING_START;
  const seen = seenSet(area, ctx.session);
  const fresh = (opts, flags = {}) => {
    const p = pickPuzzle(index, { seen, rnd, ...opts });
    return p && { ...p, rated: true, repeat: false, countThemes: true, ...flags };
  };
  switch (mode) {
    case 'repeat':
      return nextRepeat(ctx);
    case 'own':
      return nextOwn(ctx);
    case 'warmup':
      return fresh({ target: rating - 300, theme: '__short' });
    case 'theme':
      return fresh({ target: rating, theme: ctx.theme });
    case 'calc':
      return fresh({ target: rating, theme: '__calc' });
    case 'rush': {
      const start = Math.max(600, Math.round(rating - 450));
      return fresh({ target: start + 45 * (ctx.rushLevel || 0), window: 80 }, { rated: false });
    }
    case 'main':
    case 'standard':
    default: {
      // im Hauptblock jede vierte Aufgabe eine fällige Wiederholung, damit das SRS im Tagesplan läuft
      if (mode === 'main' && (ctx.counter || 0) % 4 === 3) {
        const rep = nextRepeat(ctx);
        if (rep) return rep;
      }
      const theme = rnd() < 0.25 ? '__all' : weightedChoice(themeWeights(area, ctx.focus), rnd) || '__all';
      // seltenes Thema ohne passende Aufgabe in der Nähe → gemischte Aufgabe statt einer viel zu leichten/schweren
      return (index.byTheme[theme] && fresh({ target: rating, theme, maxWindow: 300 })) || fresh({ target: rating });
    }
  }
}

// ---------------------------------------------------------------------------
// Ablauf einer Aufgabe und Prüfung der Lösungszüge
//
// Lichess: FEN vor dem Gegnerzug, moves[0] ist der Gegnerzug, danach abwechselnd Nutzer/Gegner.
// Eigene Aufgaben: der Nutzer ist sofort am Zug, moves[0] ist sein Lösungszug.

export function parseUci(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}

export function plyOfFen(fen) {
  const parts = fen.split(' ');
  return (Number(parts[5] || 1) - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

export class PuzzleRun {
  constructor(puzzle) {
    this.p = puzzle;
    this.moves = puzzle.moves;
    this.chess = new Chess(puzzle.fen);
    this.opponentFirst = puzzle.source !== 'own';
    this.ply = 0;
    const turn = this.chess.turn();
    this.userColor = this.opponentFirst ? (turn === 'w' ? 'b' : 'w') : turn;
    this.done = false;
    this.altMove = null;       // anderer Mattzug / gleichwertiger Zug des Nutzers
  }

  get waitingForOpponent() { return this.opponentFirst && this.ply === 0; }
  get expected() { return this.done || this.waitingForOpponent ? null : this.moves[this.ply]; }
  // wie vielter eigener Zug gerade gefragt ist (0 = erster)
  get userStep() { return Math.floor((this.ply - (this.opponentFirst ? 1 : 0)) / 2); }
  get isLastUserMove() { return this.ply >= this.moves.length - 1; }
  fen() { return this.chess.fen(); }

  _apply(uci) { return this.chess.move(parseUci(uci)); }

  // Gegnerzug zu Beginn (nur Lichess). Gibt den UCI-Zug zurück.
  playOpening() {
    if (!this.waitingForOpponent) return null;
    this._apply(this.moves[0]);
    this.ply = 1;
    return this.moves[0];
  }

  // Zug des Nutzers prüfen. → {result: 'correct'|'mate'|'wrong'|'invalid', done, reply, expected}
  play(uci) {
    if (this.done || this.waitingForOpponent) return { result: 'invalid' };
    const exp = this.moves[this.ply];
    if (uci === exp) {
      this._apply(uci);
      this.ply++;
      return this._reply('correct');
    }
    // Jeder mattsetzende Zug ist richtig, auch wenn er nicht gespeichert ist.
    const test = new Chess(this.chess.fen());
    try { test.move(parseUci(uci)); } catch { return { result: 'invalid' }; }
    if (test.isCheckmate()) {
      this.acceptAlternative(uci);
      return { result: 'mate', done: true, reply: null };
    }
    return { result: 'wrong', done: false, reply: null, expected: exp };
  }

  _reply(result) {
    if (this.ply >= this.moves.length) { this.done = true; return { result, done: true, reply: null }; }
    const reply = this.moves[this.ply];
    this._apply(reply);
    this.ply++;
    if (this.ply >= this.moves.length) this.done = true;   // kommt bei sauberen Daten nicht vor
    return { result, done: this.done, reply };
  }

  // gleichwertigen Zug annehmen (z. B. nach Engine-Prüfung bei eigenen Aufgaben); beendet die Aufgabe
  acceptAlternative(uci) {
    this._apply(uci);
    this.altMove = uci;
    this.ply++;
    this.done = true;
  }

  // Lösung zeigen: nächsten eigenen Zug (+ Antwort) ausführen → [uci, reply?]
  reveal() {
    const exp = this.expected;
    if (!exp) return [];
    this._apply(exp);
    this.ply++;
    const r = this._reply('reveal');
    return r.reply ? [exp, r.reply] : [exp];
  }

  // Ganze Lösung zum Nachspielen: {fens: [Start, nach Zug 1, ...], sans, ucis, startPly}
  solution() {
    const c = new Chess(this.p.fen);
    const fens = [c.fen()], sans = [];
    for (const u of this.moves) {
      try { sans.push(c.move(parseUci(u)).san); } catch { break; }
      fens.push(c.fen());
    }
    return { fens, sans, ucis: this.moves.slice(0, sans.length), startPly: plyOfFen(this.p.fen) };
  }
}

// SAN eines UCI-Zugs in einer Stellung (für Texte)
export function sanOf(fen, uci) {
  try { return new Chess(fen).move(parseUci(uci)).san; } catch { return uci; }
}
