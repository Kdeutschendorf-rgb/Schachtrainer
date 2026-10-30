// Stockfish 18 (lite, WebAssembly) läuft im Browser in einem Web Worker, also auch offline und auf dem Handy.
// Bewertungen kommen immer aus Sicht von Weiß: {cp} oder {mate}.
// Aufträge laufen nacheinander; jeder Auftrag ist zeitlich gedeckelt, damit das Handy nicht minutenlang rechnet.

import { Chess } from '../vendor/chess.js';

const MAX_MS = 2500;          // Obergrenze pro Auftrag bei Tiefen-Angaben
let worker = null;
let ready = null;
let queue = Promise.resolve();
let listener = null;          // aktueller Zeilen-Empfänger

function boot() {
  if (ready) return ready;
  worker = new Worker(new URL('../vendor/stockfish.js', import.meta.url));
  worker.onmessage = e => listener?.(String(e.data));
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Engine startet nicht')), 20000);
    listener = line => {
      if (line === 'uciok') worker.postMessage('isready');
      if (line === 'readyok') { clearTimeout(timer); listener = null; resolve(); }
    };
    worker.postMessage('uci');
  });
  ready.catch(() => { ready = null; });
  return ready;
}

// Einen Auftrag ausführen: Befehle senden, Zeilen sammeln bis "bestmove".
function run(commands, onLine) {
  const job = queue.then(async () => {
    await boot();
    return new Promise(resolve => {
      listener = line => {
        if (line.startsWith('bestmove')) { listener = null; resolve(line.split(' ')[1]); }
        else onLine?.(line);
      };
      for (const c of commands) worker.postMessage(c);
    });
  });
  queue = job.catch(() => {});
  return job;
}

function goCommand({ depth = 16, nodes, movetime }) {
  if (movetime) return `go movetime ${movetime}`;
  if (nodes) return `go nodes ${nodes}`;
  return `go depth ${depth} movetime ${MAX_MS}`;
}

function strengthOptions(elo) {
  if (!elo) return ['setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20'];
  if (elo < 1320) {
    // Unter 1320 kennt Stockfish keinen Elo-Wert, dann über Skill Level schwächen
    return ['setoption name UCI_LimitStrength value false', `setoption name Skill Level value ${Math.max(0, Math.floor((elo - 600) / 40))}`];
  }
  return ['setoption name Skill Level value 20', 'setoption name UCI_LimitStrength value true', `setoption name UCI_Elo value ${Math.min(3190, elo)}`];
}

// → {lines: [{score:{cp|mate}, pv:[uci], san:[...], depth}], bestmove}
export async function analyse(fen, { depth = 16, nodes, movetime, multipv = 1 } = {}) {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return { lines: [], bestmove: null, gameOver: true };
  const sign = chess.turn() === 'w' ? 1 : -1;
  const found = new Map();
  multipv = Math.max(1, Math.min(5, multipv));
  const best = await run([
    ...strengthOptions(null),
    `setoption name MultiPV value ${multipv}`,
    `position fen ${fen}`,
    goCommand({ depth, nodes, movetime }),
  ], line => {
    if (!line.startsWith('info') || !line.includes(' pv ')) return;
    const m = line.match(/ depth (\d+).* multipv (\d+).* score (cp|mate) (-?\d+).* pv (.+)$/);
    if (!m) return;
    const value = sign * Number(m[4]);
    found.set(Number(m[2]), { depth: Number(m[1]), score: m[3] === 'cp' ? { cp: value } : { mate: value }, pv: m[5].trim().split(' ') });
  });
  const lines = [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => ({ ...l, san: toSan(fen, l.pv) }));
  return { lines, bestmove: best && best !== '(none)' ? best : lines[0]?.pv[0] ?? null };
}

// Zug für einen Gegner mit ungefährer Spielstärke (elo) oder volle Stärke (elo weglassen).
export async function bestMove(fen, { elo, movetime = 400 } = {}) {
  if (!elo) return (await analyse(fen, { movetime })).bestmove;
  const best = await run([
    ...strengthOptions(elo),
    'setoption name MultiPV value 1',
    `position fen ${fen}`,
    `go movetime ${movetime}`,
  ]);
  return best && best !== '(none)' ? best : null;
}

function toSan(fen, pv) {
  const c = new Chess(fen);
  const out = [];
  for (const uci of pv) {
    try {
      out.push(c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch { break; }
  }
  return out;
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
