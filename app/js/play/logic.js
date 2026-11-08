// Spielen gegen Bots: Spielstärke, eigene Wertung, Bewertung der Züge. Ohne DOM und ohne Engine (testbar in jsc).

export const START_RATING = 1000;

// Stockfish kennt eine echte Spielstärke-Begrenzung erst ab 1320, darunter spielt er unzusammenhängend.
export const MIN_BOT_ELO = 1320;

// Elo-Rechnung für die eigene Bot-Wertung. score: 1 Sieg, 0.5 Remis, 0 Niederlage
export function expected(rating, opp) {
  return 1 / (1 + 10 ** ((opp - rating) / 400));
}

export function newRating(rating, opp, score, games) {
  const k = games < 10 ? 40 : 24;
  return Math.round(rating + k * (score - expected(rating, opp)));
}

// Gewinnwahrscheinlichkeit 0–100 aus Sicht von color (Lichess-Formel)
export function winPct(score, color) {
  let cp = score.mate != null ? (score.mate > 0 ? 10000 : -10000) : score.cp;
  if (color === 'b') cp = -cp;
  cp = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Zugbewertung aus dem Verlust an Gewinnwahrscheinlichkeit (Prozentpunkte)
export function classify(loss) {
  if (loss >= 25) return 'blunder';
  if (loss >= 15) return 'mistake';
  if (loss >= 8) return 'inaccuracy';
  return null;
}

export const CLASS_DE = { blunder: 'Patzer', mistake: 'Fehler', inaccuracy: 'Ungenauigkeit' };

// Genauigkeit eines Zugs (Lichess-Formel), Durchschnitt ergibt die Partie-Genauigkeit
export function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669));
}

// Spielphase grob aus Halbzug und Material
export function phaseOf(fen, ply) {
  if (ply < 20) return 'eroeffnung';
  const pieces = fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length;
  return pieces <= 6 ? 'endspiel' : 'mittelspiel';
}

// Bedenkzeiten
export const TIME_CONTROLS = [
  { id: '10+0', label: '10 Minuten (Rapid)', base: 600, inc: 0 },
  { id: '15+10', label: '15 + 10', base: 900, inc: 10 },
  { id: '5+3', label: '5 + 3', base: 300, inc: 3 },
  { id: 'frei', label: 'Ohne Uhr', base: 0, inc: 0 },
];

// Was nach einem eigenen Fehler passiert (Widerlegung = pv ab der Stellung nach dem Fehler, UCI).
// Gleiche Einordnung wie analysis/analyze_games.py → motifs(), damit Bot- und chess.com-Fehler zusammenpassen.
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(chess, color) {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.color === color) s += VALUES[p.type];
  return s;
}
export function motifs(Chess, fenAfter, pv, myColor) {
  const tags = [];
  if (!pv?.length) return tags;
  const b = new Chess(fenAfter);
  const from = pv[0].slice(0, 2), to = pv[0].slice(2, 4);
  const captured = b.get(to);
  let m;
  try { m = b.move({ from, to, promotion: pv[0][4] || 'q' }); } catch { return tags; }
  if (!m) return tags;
  if (b.inCheck()) tags.push('schach');
  // Gabel: die gezogene Figur greift danach mindestens zwei wertvolle Steine (oder König) an
  const attacked = [];
  for (const row of b.board()) for (const p of row) {
    if (!p || p.color !== myColor || !(VALUES[p.type] >= 3 || p.type === 'k')) continue;
    if (b.attackers(p.square, m.color).includes(to)) attacked.push(p.square);
  }
  if (attacked.length >= 2) tags.push('gabel');
  if (captured && captured.color === myColor && VALUES[captured.type] >= 3) tags.push('figur_eingestellt');
  // Materialverlust über die ersten 4 Halbzüge der Widerlegung
  const b2 = new Chess(fenAfter);
  const other = myColor === 'w' ? 'b' : 'w';
  const before = material(b2, myColor) - material(b2, other);
  for (const u of pv.slice(0, 4)) {
    try { if (!b2.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' })) break; } catch { break; }
  }
  if (before - (material(b2, myColor) - material(b2, other)) >= 2) tags.push('materialverlust');
  return tags;
}
