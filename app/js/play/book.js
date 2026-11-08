// Eröffnungsbuch der Bots: Der Bot spielt die Gegnerzüge aus deinem Repertoire, gewichtet nach Häufigkeit,
// damit nicht jede Partie gleich läuft. Weichst du ab oder endet die Linie, gibt es keinen Buchzug mehr.

import { treeNode } from '../openings/logic.js';

const FREQ_WEIGHT = { 'häufig': 3, 'mittel': 2, 'selten': 1 };

// → SAN des Bot-Zugs oder null. chapterId: nur Linien dieses Kapitels (leer = ganzes Repertoire)
export function bookMove(model, userSide, fen, { chapterId = null, rnd = Math.random } = {}) {
  const node = treeNode(model, userSide, fen);
  if (!node) return null;
  const weighted = [];
  for (const mv of node.moves.filter(m => !m.own)) {
    const lines = mv.lineIds.map(id => model.lineById.get(id)).filter(l => l && (!chapterId || l.chapterId === chapterId));
    const w = lines.reduce((s, l) => s + (FREQ_WEIGHT[l.frequency] || 1), 0);
    if (w) weighted.push([mv.san, w]);
  }
  if (!weighted.length) return null;
  let x = rnd() * weighted.reduce((s, [, w]) => s + w, 0);
  for (const [san, w] of weighted) { x -= w; if (x <= 0) return san; }
  return weighted[0][0];
}
