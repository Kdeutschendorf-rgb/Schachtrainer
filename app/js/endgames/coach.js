// Endspiel-Coach für die Grundmatts (Dame, Turm, zwei Türme gegen König): erklärt zur aktuellen Stellung,
// was jetzt dran ist, statt nur feste Hinweistexte zu zeigen.
// - cage(fen, side): Felder, die der einsame König noch erreichen kann (Ziel: immer weniger)
// - explain(fen, uci, side): warum der (Engine-)Zug gut ist, in einem Satz
// - review(fenBefore, fenAfter, side): kurze Rückmeldung zum eigenen Zug (Käfig kleiner? Turm hängt? Patt?)

import { Chess } from '../../vendor/chess.js';

export const COACHED = {
  'kqk-mate': {
    steps: [
      'Dame einen Springerzug vom König entfernt hinstellen. So hat er nur noch einen kleinen Kasten.',
      'Dem König mit der Dame im Springerabstand folgen. Der Kasten wird mit jedem Zug kleiner, bis er am Rand steht.',
      'Steht er am Rand und pendelt zwischen zwei Feldern: Dame stehen lassen und den eigenen König heranholen.',
      'Matt: Dame auf die Randreihe, gedeckt vom König. Vor jedem Damenzug prüfen: Hat er noch ein Feld? Sonst Patt!',
    ],
  },
  'krk-mate': {
    steps: [
      'Turm zwischen die Könige stellen. Er baut eine Mauer, über die der König nicht darf.',
      'Eigenen König heranholen, bis er dem gegnerischen König direkt gegenübersteht, ein Feld dazwischen (Opposition).',
      'In der Opposition: Schach mit dem Turm. Der König muss eine Reihe zurück.',
      'Keine Opposition? Wartezug mit dem Turm entlang der Mauer, weit weg vom König. Dann muss er dir die Opposition geben.',
      'Greift er den Turm an: Turm ans andere Ende derselben Reihe. Am Rand folgt das Matt mit Schach auf der Randreihe.',
    ],
  },
  'two-rooks-mate': {
    steps: [
      'Turm 1 sperrt eine Reihe ab, der König darf nicht mehr darüber.',
      'Turm 2 gibt auf der nächsten Reihe Schach. Der König muss eine Stufe zurück.',
      'Jetzt überholt Turm 1 und gibt eine Reihe weiter Schach. So geht es Stufe für Stufe (Treppe).',
      'Kommt der König neben einen Turm, zieh diesen Turm weit weg ans andere Ende der Reihe und mach dann weiter.',
      'Am Rand ist das letzte Schach Matt: Der andere Turm deckt die Reihe davor.',
    ],
  },
};

const FILES = 'abcdefgh';
const sq = (f, r) => FILES[f] + (r + 1);
const fileOf = s => s.charCodeAt(0) - 97;
const rankOf = s => +s[1] - 1;
const other = c => (c === 'w' ? 'b' : 'w');

function find(chess, type, color) {
  const out = [];
  for (const row of chess.board()) for (const p of row) if (p && p.type === type && p.color === color) out.push(p.square);
  return out;
}

// Felder, die der einsame König erreichen kann, ohne ein angegriffenes Feld zu betreten
export function cage(fen, side) {
  const chess = new Chess(fen);
  const them = other(side);
  const [k] = find(chess, 'k', them);
  if (!k) return 0;
  chess.remove(k);   // sonst verdeckt der König Felder hinter sich, die in Wahrheit angegriffen sind
  const seen = new Set([k]);
  const queue = [k];
  while (queue.length) {
    const s = queue.pop();
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      const f = fileOf(s) + df, r = rankOf(s) + dr;
      if ((!df && !dr) || f < 0 || f > 7 || r < 0 || r > 7) continue;
      const t = sq(f, r);
      if (seen.has(t)) continue;
      const piece = chess.get(t);
      if (piece && piece.color === them) continue;
      if (chess.isAttacked(t, side)) continue;
      seen.add(t);
      queue.push(t);
    }
  }
  return seen.size;
}

const kingDist = (a, b) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));

// Opposition: gleiche Linie oder Reihe, genau ein Feld dazwischen
function opposition(a, b) {
  return (fileOf(a) === fileOf(b) && Math.abs(rankOf(a) - rankOf(b)) === 2)
    || (rankOf(a) === rankOf(b) && Math.abs(fileOf(a) - fileOf(b)) === 2);
}

// Ist die Figur auf s ungedeckt und vom gegnerischen König angegriffen?
function hanging(chess, s, side) {
  const [k] = find(chess, 'k', other(side));
  return k && kingDist(k, s) === 1 && !chess.isAttacked(s, side);
}

const NAME = { q: 'Dame', r: 'Turm', k: 'König' };
// Deutsche Notation im Fließtext: Ta4 statt Ra4
const de = san => san.replace(/[KQRBN]/g, c => ({ K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' })[c]);

// Erklärung für einen guten Zug (meist den Engine-Zug)
export function explain(fen, uci, side) {
  const chess = new Chess(fen);
  const from = uci.slice(0, 2), to = uci.slice(2, 4);
  const piece = chess.get(from);
  if (!piece) return '';
  const wasHanging = piece.type !== 'k' && hanging(chess, from, side);
  const cageBefore = cage(fen, side);
  const m = chess.move({ from, to, promotion: uci[4] || 'q' });
  if (!m) return '';
  if (chess.isCheckmate()) return `${de(m.san)} ist Matt!`;
  const cageAfter = cage(chess.fen(), side);
  const [myK] = find(chess, 'k', side);
  const [theirK] = find(chess, 'k', other(side));
  const n = NAME[piece.type];

  if (wasHanging) return `Dein ${n} stand ungedeckt neben dem König. ${de(m.san)} bringt ihn weit weg in Sicherheit, die Mauer bleibt dabei stehen.`;
  if (piece.type === 'k') {
    if (opposition(myK, theirK)) return `${de(m.san)}: Dein König stellt sich dem gegnerischen gegenüber (Opposition). Jetzt kann er nicht nach vorn, und dein nächstes Schach drängt ihn zurück.`;
    return `${de(m.san)}: Dein König kommt näher. Ohne ihn geht es nicht: Er soll dem gegnerischen König direkt gegenüberstehen, ein Feld dazwischen (Opposition).`;
  }
  if (m.san.includes('+')) {
    if (find(chess, 'r', side).length === 2) return `${de(m.san)}: Schach auf der nächsten Reihe, der andere Turm sperrt die Reihe dahinter. Der König muss eine Stufe zurück.`;
    if (opposition(myK, theirK)) return `${de(m.san)}: Schach, während sich die Könige gegenüberstehen. Nach vorn kann er nicht, also muss er eine Reihe zurück.`;
    return `${de(m.san)}: Schach. Der König muss weichen, ${cageAfter < cageBefore ? 'und sein Käfig wird kleiner' : 'aber achte darauf, dass die Mauer stehen bleibt'}.`;
  }
  if (cageAfter < cageBefore) {
    return piece.type === 'q'
      ? `${de(m.san)}: Die Dame rückt nach und bleibt einen Springerzug vom König entfernt. Sein Käfig schrumpft von ${cageBefore} auf ${cageAfter} Felder.`
      : `${de(m.san)}: Die Mauer rückt näher. Der Käfig schrumpft von ${cageBefore} auf ${cageAfter} Felder, und der ${n} ist sicher.`;
  }
  if (piece.type === 'r' && (fileOf(from) === fileOf(to) || rankOf(from) === rankOf(to))) {
    return `${de(m.san)}: Wartezug. Der Turm bleibt auf seiner Mauer. Jetzt muss der König ziehen und gibt deinem König die Opposition.`;
  }
  return `${de(m.san)}: hält den König im Käfig (${cageAfter} Felder) und bereitet den nächsten Schritt vor.`;
}

// Rückmeldung zum eigenen Zug: Käfig, hängende Figur, Patt-Gefahr
export function review(fenBefore, fenAfter, side) {
  const chess = new Chess(fenAfter);
  const before = cage(fenBefore, side), after = cage(fenAfter, side);
  for (const type of ['q', 'r']) {
    for (const s of find(chess, type, side)) {
      if (hanging(chess, s, side)) return { kind: 'bad', text: `Vorsicht: Dein ${NAME[type]} auf ${s} ist ungedeckt und wird angegriffen.` };
    }
  }
  if (chess.isStalemate()) return { kind: 'bad', text: 'Patt! Der König hatte kein Feld mehr, stand aber nicht im Schach.' };
  if (after < before) return { kind: 'good', text: `Käfig: ${before} → ${after} Felder.` };
  if (after > before) return { kind: 'warn', text: `Käfig: ${before} → ${after} Felder. Der König hat wieder mehr Platz.` };
  return { kind: 'info', text: `Käfig: ${after} Felder.` };
}
