// Spielen gegen Bots: Spielstärke, eigene Wertung, Bewertung der Züge. Ohne DOM und ohne Engine (testbar in jsc).

export const START_RATING = 1000;

// Wie der Bot spielt, abhängig von seiner Ziel-Elo.
// Unter 2000 wählt er aus den besten Engine-Zügen mit Zufall (temp in Centipawns: je höher, desto eher
// ein schwächerer Zug) und patzt manchmal (blunder = Wahrscheinlichkeit für einen beliebigen Zug).
// So spielt er wie ein Mensch dieser Stärke: meist vernünftig, ab und zu ein grober Fehler.
export function botStyle(elo) {
  const t = Math.max(0, Math.min(1, (elo - 500) / 1500));
  return {
    temp: Math.round(200 * (1 - t) ** 1.3 + 10),
    blunder: Math.round((0.08 * (1 - t) ** 2 + 0.004) * 1000) / 1000,
    depth: Math.round(5 + 7 * t),
    multipv: 5,
  };
}

// Score aus Sicht der Seite am Zug (Matt als großer Wert)
export function moverCp(score, color) {
  const cp = score.mate != null ? (score.mate > 0 ? 10000 - score.mate * 10 : -10000 - score.mate * 10) : score.cp;
  return color === 'w' ? cp : -cp;
}

// Zug aus Engine-Linien wählen. lines: [{score, pv}], color: Seite am Zug, rnd: () => [0,1)
export function chooseMove(lines, color, style, rnd = Math.random, legalUci = []) {
  const usable = lines.filter(l => l.pv?.length);
  if (!usable.length) return legalUci[0] || null;
  if (legalUci.length > 1 && rnd() < style.blunder) {
    // Patzer: irgendein legaler Zug, aber kein Zug, den die Engine als besten kennt
    const others = legalUci.filter(u => u !== usable[0].pv[0]);
    return others[Math.floor(rnd() * others.length)];
  }
  const best = moverCp(usable[0].score, color);
  const weights = usable.map(l => Math.exp(-(best - moverCp(l.score, color)) / Math.max(1, style.temp)));
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = rnd() * sum;
  for (let i = 0; i < usable.length; i++) {
    x -= weights[i];
    if (x <= 0) return usable[i].pv[0];
  }
  return usable[0].pv[0];
}

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
