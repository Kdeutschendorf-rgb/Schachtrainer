// Vorausdenken: reine Logik ohne DOM (mit jsc testbar, siehe vision/logic.test.mjs).
// Stellungen aus puzzles.json auswählen, Schachs/Schlagzüge aufzählen, ungedeckte Figuren
// bestimmen, Nullzug-FEN für die Drohung bauen und die adaptive Stufe führen.

import { Chess } from '../../vendor/chess.js';

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_DE = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
export const PIECE_LETTER_DE = { p: '', n: 'S', b: 'L', r: 'T', q: 'D', k: 'K' };

// ---------- Aufgaben aus puzzles.json ----------

// Zeile [id, fen, movesUci, rating, themes, openingTags] → Objekt
export function parsePuzzle(row) {
  return { id: row[0], fen: row[1], moves: row[2].split(' '), rating: row[3], themes: row[4] ? row[4].split(' ') : [] };
}

// Halbzugnummer für formatLine (0 = Weiß im 1. Zug)
export function plyOf(fen) {
  const parts = fen.split(' ');
  return (Number(parts[5]) - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

export function turnOf(fen) {
  return fen.split(' ')[1];
}

// Stellung nach dem Gegnerzug moves[0] (dort ist der Nutzer am Zug)
export function afterFirstMove(p) {
  const c = new Chess(p.fen);
  const m = c.move(uciObj(p.moves[0]));
  return { fen: c.fen(), lastMove: p.moves[0], san: m.san };
}

export function uciObj(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}

// Einfache Zufallsquelle mit Startwert (für Tests reproduzierbar)
export function seededRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Zufällige Auswahl aus rows, die filter erfüllen. Probiert zuerst zufällige Treffer (schnell),
// danach linear, damit auch seltene Filter etwas finden.
export function pickRow(rows, filter, rnd = Math.random, tries = 400) {
  if (!rows.length) return null;
  for (let i = 0; i < tries; i++) {
    const r = rows[Math.floor(rnd() * rows.length)];
    if (filter(r)) return r;
  }
  const start = Math.floor(rnd() * rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[(start + i) % rows.length];
    if (filter(r)) return r;
  }
  return null;
}

// Wertungsfenster, das bei Bedarf breiter wird
export function ratingFilter(lo, hi) {
  return row => row[3] >= lo && row[3] <= hi;
}

// ---------- Blind rechnen ----------

// Bei N angesagten Halbzügen: N ungerade → Brett zeigt die Aufgabenstellung (vor dem Gegnerzug),
// N gerade → Brett zeigt die Stellung nach moves[0]. Gesucht ist immer ein eigener Zug.
// Länge der Zugliste, bei der der gesuchte Zug genau der Schlusszug ist:
export function blindLength(n) {
  return n % 2 ? n + 1 : n + 2;
}

// Baut die Blind-Aufgabe aus einem Puzzle. exact=false erlaubt längere Lösungen (Zielzug ist dann nicht der letzte).
export function makeBlindTask(p, n) {
  const offset = n % 2 ? 0 : 1;                // so viele Züge sind schon auf dem Brett
  const targetIdx = offset + n;
  if (targetIdx >= p.moves.length) return null;
  const c = new Chess(p.fen);
  let lastMove = null;
  if (offset) { c.move(uciObj(p.moves[0])); lastMove = p.moves[0]; }
  const startFen = c.fen();
  const announced = [];
  for (let i = offset; i < targetIdx; i++) {
    const m = c.move(uciObj(p.moves[i]));
    announced.push({ uci: p.moves[i], san: m.san });
  }
  const imaginedFen = c.fen();
  const target = p.moves[targetIdx];
  const tm = c.move(uciObj(target));
  return {
    id: p.id, rating: p.rating, themes: p.themes, n,
    startFen, lastMove, startPly: plyOf(startFen),
    announced, imaginedFen,
    target, targetSan: tm.san, finalFen: c.fen(),
    isLast: targetIdx === p.moves.length - 1,
    mate: c.isCheckmate(),
    color: turnOf(imaginedFen),
  };
}

// Prüft den Zug {from,to}, den der Nutzer auf dem *unveränderten* Brett gezogen hat.
// Richtig: genau der Lösungszug, oder (wenn die Lösung hier mattsetzt) jeder andere Mattzug.
export function checkBlindAnswer(task, { from, to }) {
  if (from === task.target.slice(0, 2) && to === task.target.slice(2, 4)) return { ok: true, san: task.targetSan };
  const c = new Chess(task.imaginedFen);
  let m;
  const piece = c.get(from);
  const promo = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined;
  try { m = c.move({ from, to, promotion: promo }); } catch { return { ok: false, legal: false }; }
  if (task.mate && task.isLast && c.isCheckmate()) return { ok: true, san: m.san, altMate: true };
  return { ok: false, legal: true, san: m.san };
}

// ---------- Schach–Schlagen-Check ----------

// Alle Schachgebote und Schlagzüge der Seite am Zug. Umwandlungen werden zu einem Eintrag
// (from+to) zusammengefasst. → [{key, from, to, san, check, capture}]
export function checksAndCaptures(fen) {
  const c = new Chess(fen);
  const map = new Map();
  for (const m of c.moves({ verbose: true })) {
    const check = /[+#]$/.test(m.san);
    const capture = !!m.captured;
    if (!check && !capture) continue;
    const key = m.from + m.to;
    const prev = map.get(key);
    if (prev) {
      prev.check ||= check; prev.capture ||= capture;
      if (m.promotion === 'q') prev.san = m.san;
    } else {
      map.set(key, { key, from: m.from, to: m.to, san: m.san, check, capture });
    }
  }
  return [...map.values()];
}

// Zielbereich (Anzahl Schachs+Schlagzüge) je Stufe 1–5
export const CCT_RANGES = [null, [2, 4], [4, 6], [6, 8], [8, 11], [10, 18]];

// ---------- Ungedeckte Figuren ----------

// Static Exchange Evaluation: Gewinn für den Angreifer, wenn er auf dem Feld zuerst schlägt
// (Werte der Angreifer/Verteidiger aufsteigend, beide Seiten dürfen jederzeit aufhören).
export function see(targetValue, attackers, defenders) {
  const att = attackers.slice().sort((a, b) => a - b);
  const def = defenders.slice().sort((a, b) => a - b);
  if (!att.length) return 0;
  const gain = [targetValue];
  let onSquare = att.shift();
  let side = def;                      // als Nächstes schlägt die verteidigende Seite
  let d = 0;
  while (side.length) {
    d++;
    gain[d] = onSquare - gain[d - 1];
    onSquare = side.shift();
    side = side === def ? att : def;
  }
  while (d > 0) {
    gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    d--;
  }
  return gain[0];
}

// Ungedeckte (Figuren außer König/Bauer ohne Deckung) und hängende Steine (Schlagen gewinnt Material, auch Bauern)
// beider Seiten. → [{square, color, type, defenders:[sq], attackers:[sq], reason: 'ungedeckt'|'hängt', see}]
export function loosePieces(fen) {
  const c = new Chess(fen);
  const out = [];
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.type === 'k') continue;
      const enemy = p.color === 'w' ? 'b' : 'w';
      const attackers = c.attackers(p.square, enemy);
      let defenders = c.attackers(p.square, p.color);
      // Der König deckt nur, wenn er danach nicht selbst im Angriff steht (höchstens ein Angreifer)
      if (attackers.length > 1) defenders = defenders.filter(sq => c.get(sq).type !== 'k');
      const val = sq => VALUE[c.get(sq).type];
      const gain = attackers.length ? see(VALUE[p.type], attackers.map(val), defenders.map(val)) : 0;
      let reason = null;
      if (gain > 0) reason = 'hängt';
      else if (!defenders.length && p.type !== 'p') reason = 'ungedeckt';
      if (reason) out.push({ square: p.square, color: p.color, type: p.type, attackers, defenders, reason, see: gain });
    }
  }
  return out;
}

export const LOOSE_RANGES = [null, [1, 2], [2, 3], [3, 4], [4, 6], [5, 9]];

// Auswertung der Auswahl: richtig markiert, übersehen, zu viel markiert
export function gradeSelection(targets, selected) {
  const t = new Set(targets);
  const s = new Set(selected);
  const hit = [...s].filter(x => t.has(x));
  const missed = [...t].filter(x => !s.has(x));
  const extra = [...s].filter(x => !t.has(x));
  return { hit, missed, extra, ok: !missed.length && !extra.length };
}

// ---------- Drohung erkennen ----------

// Nullzug: Seite am Zug tauschen, en passant löschen. null, wenn die Seite am Zug im Schach steht
// (dann wäre die getauschte Stellung ungültig) oder die neue Stellung sonst nicht ladbar ist.
export function nullMoveFen(fen) {
  const parts = fen.split(' ');
  const c = new Chess(fen);
  if (c.inCheck()) return null;
  const turn = parts[1] === 'w' ? 'b' : 'w';
  const full = Number(parts[5]) + (parts[1] === 'b' ? 1 : 0);
  const next = [parts[0], turn, parts[2], '-', parts[4], String(full)].join(' ');
  try {
    const t = new Chess(next);
    if (t.moves().length === 0) return null;   // Gegner hätte keinen Zug (Patt/Matt): keine sinnvolle Drohung
  } catch {
    return null;
  }
  return next;
}

// Themen, aus denen Drohungs-Stellungen kommen
export const THREAT_THEMES = ['defensiveMove', 'hangingPiece', 'fork', 'pin', 'skewer', 'discoveredAttack',
  'mateIn1', 'mateIn2', 'backRankMate', 'trappedPiece', 'kingsideAttack', 'attraction', 'deflection'];

// Wertungsfenster je Stufe 1–6
export const THREAT_RATINGS = [null, [600, 1050], [900, 1300], [1100, 1500], [1300, 1700], [1500, 1900], [1700, 2200]];

// Gewinnchance 0–100 (Lichess-Formel) aus Sicht von color, score = {cp}|{mate} aus Sicht von Weiß
export function winChance(score, color) {
  let cp = score.mate != null ? (score.mate > 0 ? 10000 : -10000) : score.cp;
  if (score.mate === 0) cp = 0;
  if (color === 'b') cp = -cp;
  cp = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Wie viel Gewinnchance (Prozentpunkte) der Nutzer verlöre, wenn der Gegner zweimal zöge.
// base = Bewertung der echten Stellung, threat = Bewertung nach dem Drohzug (beide Sicht Weiß)
export function threatGain(base, threat, userColor) {
  return winChance(base, userColor) - winChance(threat, userColor);
}

export const THREAT_MIN_GAIN = 18;    // ab hier gilt etwas als echte Drohung

// Ist der vom Nutzer genannte Drohzug gut genug? (fast so stark wie die beste Drohung)
export function threatAccepted(gain, bestGain) {
  return gain >= Math.max(THREAT_MIN_GAIN * 0.7, bestGain - 10);
}

// Zug in deutscher Kurzbeschreibung, z. B. „Dxf7“ → „Dame schlägt auf f7“
export function sanDe(san) {
  return san.replace(/^[KQRBN]/, p => ({ K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' })[p]).replace(/=([QRBN])/, (_, p) => '=' + ({ Q: 'D', R: 'T', B: 'L', N: 'S' })[p]);
}

// Erklärt eine Drohung in einem Satz: was zieht, was wird geschlagen, Schach/Matt.
export function describeThreat(fen, uci, score) {
  const c = new Chess(fen);
  const m = c.move(uciObj(uci));
  const who = PIECE_DE[m.piece];
  let text;
  if (c.isCheckmate()) text = `${sanDe(m.san)} wäre sofort Matt.`;
  else if (m.captured) text = `${sanDe(m.san)}: ${artikel(m.piece)} ${who} schlägt ${artikelAkk(m.captured)} ${PIECE_DE[m.captured]} auf ${m.to}${/\+$/.test(m.san) ? ' mit Schach' : ''}.`;
  else if (/\+$/.test(m.san)) text = `${sanDe(m.san)}: Schach durch ${artikelDat(m.piece)} ${who}.`;
  else text = `${sanDe(m.san)}: ${artikel(m.piece)} ${who} zieht nach ${m.to}.`;
  if (score?.mate != null && !c.isCheckmate()) text += ` Danach droht Matt in ${Math.abs(score.mate)}.`;
  return text;
}

function artikel(t) { return t === 'q' ? 'die' : 'der'; }
function artikelAkk(t) { return t === 'q' ? 'die' : 'den'; }
function artikelDat(t) { return t === 'q' ? 'die' : 'den'; }

// ---------- Adaptive Stufe ----------

// Drei Richtige in Folge → Stufe hoch, zwei Fehler in Folge → Stufe runter.
// st = {level, streak}; gibt neuen Zustand zurück (st bleibt unverändert).
export function adapt(st, ok, { min = 1, max = 8, up = 3, down = 2 } = {}) {
  let level = st?.level ?? min;
  let streak = st?.streak ?? 0;
  if (ok) streak = Math.max(0, streak) + 1;
  else streak = Math.min(0, streak) - 1;
  if (streak >= up && level < max) { level++; streak = 0; }
  else if (streak <= -down && level > min) { level--; streak = 0; }
  return { level, streak, changed: level !== (st?.level ?? min) };
}

// Verlauf kürzen (Fortschritt bleibt kompakt)
export function pushHistory(list, entry, max = 500) {
  const l = list || [];
  l.push(entry);
  if (l.length > max) l.splice(0, l.length - max);
  return l;
}

// Trefferquote der letzten n Einträge (ok steht an Index okIdx)
export function recentRate(history, n = 20, okIdx = 2) {
  const h = (history || []).slice(-n);
  if (!h.length) return null;
  return h.reduce((s, e) => s + (e[okIdx] ? 1 : 0), 0) / h.length;
}
