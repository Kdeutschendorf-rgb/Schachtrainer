// Stockfish läuft nativ im lokalen Server (server.py, /api/engine).
// Bewertungen kommen immer aus Sicht von Weiß: {cp} oder {mate}.

async function call(body) {
  const res = await fetch('api/engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Engine-Fehler');
  return data;
}

// → {lines: [{score:{cp|mate}, pv:[uci], san:[...], depth}], bestmove}
export function analyse(fen, { depth = 16, nodes, movetime, multipv = 1 } = {}) {
  const body = { fen, multipv };
  if (movetime) body.movetime = movetime;
  else if (nodes) body.nodes = nodes;
  else body.depth = depth;
  return call(body);
}

// Zug für einen Gegner mit ungefährer Spielstärke (elo) oder volle Stärke (elo weglassen).
export async function bestMove(fen, { elo, movetime = 400 } = {}) {
  if (!elo) return (await analyse(fen, { movetime })).bestmove;
  return (await call({ fen, elo, movetime })).bestmove;
}

// Gewinnwahrscheinlichkeit 0–100 aus Sicht von `color` ('w'|'b'), Lichess-Formel.
export function winPct(score, color = 'w') {
  let cp = score.mate != null ? (score.mate > 0 ? 10000 : -10000) : score.cp;
  if (color === 'b') cp = -cp;
  cp = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Lesbare Bewertung, z. B. "+1.3" oder "#3" (Sicht Weiß).
export function formatScore(score) {
  if (score.mate != null) return `#${score.mate}`;
  const v = score.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
