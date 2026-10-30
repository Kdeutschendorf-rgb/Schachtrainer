// Eingebauter Coach: erklärt Fehler und Aufgaben auf Deutsch, ohne KI-Aufruf.
// Gehört dem Coach-Modul (siehe SPEC.md). Andere Module nutzen nur die exportierten Funktionen.

import { Chess } from '../vendor/chess.js';

// Lichess-Themen → deutsche Namen (+ kurze Erklärung für Tooltips)
export const THEMES_DE = {
  fork: ['Gabel', 'Eine Figur greift zwei oder mehr gegnerische Figuren gleichzeitig an.'],
  pin: ['Fesselung', 'Eine Figur kann nicht ziehen, ohne eine wertvollere dahinter freizugeben.'],
  skewer: ['Spieß', 'Wie eine Fesselung, nur steht die wertvollere Figur vorne und muss weichen.'],
  hangingPiece: ['Hängende Figur', 'Eine ungedeckte Figur kann einfach geschlagen werden.'],
  discoveredAttack: ['Abzugsangriff', 'Eine Figur zieht weg und gibt den Angriff einer anderen frei.'],
  doubleCheck: ['Doppelschach', 'Zwei Figuren geben gleichzeitig Schach, nur der König kann ziehen.'],
  deflection: ['Ablenkung', 'Ein Verteidiger wird von seiner Aufgabe weggelockt.'],
  attraction: ['Hinlenkung', 'Eine gegnerische Figur wird auf ein ungünstiges Feld gezwungen.'],
  decoy: ['Hinlenkung', 'Eine gegnerische Figur wird auf ein ungünstiges Feld gelockt.'],
  clearance: ['Räumung', 'Ein Feld oder eine Linie wird für eine andere Figur frei gemacht.'],
  interference: ['Verstellung', 'Eine Figur unterbricht die Verbindung zwischen zwei gegnerischen Figuren.'],
  intermezzo: ['Zwischenzug', 'Statt sofort zurückzuschlagen, kommt erst ein stärkerer Zug dazwischen.'],
  trappedPiece: ['Gefangene Figur', 'Eine Figur hat keine sicheren Felder mehr und geht verloren.'],
  sacrifice: ['Opfer', 'Material wird gegeben, um etwas Größeres zu erreichen.'],
  xRayAttack: ['Röntgenangriff', 'Eine Figur wirkt durch eine andere hindurch.'],
  zugzwang: ['Zugzwang', 'Jeder Zug verschlechtert die eigene Stellung.'],
  quietMove: ['Stiller Zug', 'Ein Zug ohne Schach und ohne Schlagen, der trotzdem entscheidet.'],
  defensiveMove: ['Verteidigung', 'Die einzige Rettung gegen eine Drohung finden.'],
  capturingDefender: ['Verteidiger schlagen', 'Den Verteidiger einer Figur beseitigen.'],
  exposedKing: ['Offener König', 'Der König ist schlecht geschützt und wird angegriffen.'],
  kingsideAttack: ['Königsangriff', 'Angriff auf den kurz rochierten König.'],
  queensideAttack: ['Damenflügelangriff', 'Angriff auf den lang rochierten König.'],
  attackingF2F7: ['Angriff auf f2/f7', 'Der schwächste Punkt am Anfang der Partie.'],
  mate: ['Matt', 'Die Aufgabe endet mit Schachmatt.'],
  mateIn1: ['Matt in 1', ''], mateIn2: ['Matt in 2', ''], mateIn3: ['Matt in 3', ''],
  mateIn4: ['Matt in 4', ''], mateIn5: ['Matt in 5+', ''],
  backRankMate: ['Grundreihenmatt', 'Der König ist auf der Grundreihe von eigenen Bauern eingesperrt.'],
  smotheredMate: ['Ersticktes Matt', 'Springermatt gegen einen von eigenen Figuren eingeschlossenen König.'],
  anastasiaMate: ['Anastasias Matt', 'Springer und Turm mattsetzen am Brettrand.'],
  arabianMate: ['Arabisches Matt', 'Turm und Springer mattsetzen in der Ecke.'],
  hookMate: ['Hakenmatt', 'Turm, Springer und Bauer arbeiten zusammen.'],
  bodenMate: ['Bodens Matt', 'Zwei Läufer auf sich kreuzenden Diagonalen.'],
  doubleBishopMate: ['Läuferpaar-Matt', ''],
  dovetailMate: ['Schwalbenschwanz-Matt', ''],
  promotion: ['Umwandlung', 'Ein Bauer wird zur Dame (oder anderen Figur).'],
  underPromotion: ['Unterverwandlung', 'Umwandlung in eine andere Figur als die Dame.'],
  advancedPawn: ['Weit vorgerückter Bauer', 'Ein Bauer kurz vor der Umwandlung.'],
  enPassant: ['En passant', ''],
  castling: ['Rochade', ''],
  crushing: ['Vernichtend', 'Danach ist die Stellung klar gewonnen.'],
  advantage: ['Vorteil', 'Danach steht man deutlich besser.'],
  equality: ['Ausgleich', 'Aus schlechter Stellung zurück zum Ausgleich.'],
  opening: ['Eröffnung', ''], middlegame: ['Mittelspiel', ''], endgame: ['Endspiel', ''],
  rookEndgame: ['Turmendspiel', ''], pawnEndgame: ['Bauernendspiel', ''], queenEndgame: ['Damenendspiel', ''],
  bishopEndgame: ['Läuferendspiel', ''], knightEndgame: ['Springerendspiel', ''], queenRookEndgame: ['Dame-Turm-Endspiel', ''],
  short: ['Kurz', '2 eigene Züge'], long: ['Lang', '3 eigene Züge'], veryLong: ['Sehr lang', '4+ eigene Züge'], oneMove: ['Ein Zug', ''],
  master: ['Meisterpartie', ''], masterVsMaster: ['Meister gegen Meister', ''], superGM: ['Super-GM', ''],
};

export function themeName(key) {
  return THEMES_DE[key]?.[0] || key;
}

export function themeInfo(key) {
  return THEMES_DE[key]?.[1] || '';
}

// Tags aus der eigenen Partie-Analyse (analysis/analyze_games.py) → deutsche Namen
export const MISTAKE_TAGS_DE = {
  figur_eingestellt: 'Figur eingestellt',
  materialverlust: 'Material verloren',
  gabel: 'Gabel übersehen',
  schach: 'Schach übersehen',
  matt_verpasst: 'Matt verpasst',
  matt_zugelassen: 'Matt zugelassen',
  chance_verpasst: 'Chance nicht genutzt',
};

// Einordnung eines Zugs nach Verlust an Gewinnchance (Prozentpunkte, Sicht des Ziehenden)
export function classify(drop) {
  if (drop >= 30) return { key: 'blunder', label: 'Patzer', kind: 'bad' };
  if (drop >= 20) return { key: 'mistake', label: 'Fehler', kind: 'bad' };
  if (drop >= 10) return { key: 'inaccuracy', label: 'Ungenauigkeit', kind: 'warn' };
  if (drop >= 3) return { key: 'ok', label: 'Ordentlich', kind: 'info' };
  return { key: 'good', label: 'Stark', kind: 'good' };
}

// ---------------------------------------------------------------------------
// Deutsche Notation und Grammatik

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Figurennamen mit Fällen. Bauer ist schwach dekliniert („den Bauern“).
const PIECE = {
  p: { nom: 'Bauer', acc: 'Bauern', f: false },
  n: { nom: 'Springer', acc: 'Springer', f: false },
  b: { nom: 'Läufer', acc: 'Läufer', f: false },
  r: { nom: 'Turm', acc: 'Turm', f: false },
  q: { nom: 'Dame', acc: 'Dame', f: true },
  k: { nom: 'König', acc: 'König', f: false },
};
const ARTICLE = {
  der: { nom: ['der', 'die'], acc: ['den', 'die'] },
  dein: { nom: ['dein', 'deine'], acc: ['deinen', 'deine'] },
  sein: { nom: ['sein', 'seine'], acc: ['seinen', 'seine'] },
  ein: { nom: ['ein', 'eine'], acc: ['einen', 'eine'] },
};

// piece('n', 'acc', 'dein') → „deinen Springer“; mit adj: „deinen ungedeckten Springer“
export function pieceName(type, kase = 'nom', art = 'der', adj = '') {
  const p = PIECE[type] || PIECE.p;
  const a = ARTICLE[art][kase][p.f ? 1 : 0];
  let ad = '';
  if (adj) {
    // schwache/gemischte Deklination: der → -e/-en, dein/ein (Nom. mask.) → -er
    const strongNom = kase === 'nom' && !p.f && art !== 'der';
    ad = adj + (p.f ? 'e' : kase === 'acc' ? 'en' : strongNom ? 'er' : 'e') + ' ';
  }
  return `${a} ${ad}${p[kase]}`;
}

// SAN → deutsche Notation: „Nf3“ → „Sf3“, „exd8=Q+“ → „exd8=D+“
const DE = { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' };
export function sanDe(san) {
  if (!san) return '';
  return String(san).replace(/^[KQRBN]/, p => DE[p]).replace(/=([QRBN])/, (_, p) => '=' + DE[p]);
}

// Zugfolge in deutscher Notation mit Zugnummern: „14…Sxe5 15.Dxe5 Lxe5“
export function lineDe(sans, fen) {
  const parts = (fen || '').split(' ');
  let ply = (Math.max(1, parseInt(parts[5], 10) || 1) - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
  return sans.map((s, i) => {
    const no = Math.floor(ply / 2) + 1;
    const txt = ply % 2 === 0 ? `${no}.${sanDe(s)}` : i === 0 ? `${no}…${sanDe(s)}` : sanDe(s);
    ply++;
    return txt;
  }).join(' ');
}

// Aufzählung: „A“, „A und B“, „A, B und C“
function listDe(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' und ' + items[items.length - 1];
}

// Figuren im Akkusativ aufzählen, gleiche Typen zusammengefasst: „deinen König und deine beiden Türme“
const PLURAL = { p: 'Bauern', n: 'Springer', b: 'Läufer', r: 'Türme', q: 'Damen', k: 'Könige' };
const PLURAL_ART = { der: 'die', dein: 'deine', sein: 'seine', ein: '' };
function pieceList(pieces, art) {
  const types = [];
  for (const p of pieces) if (!types.includes(p.type)) types.push(p.type);
  return listDe(types.map(t => {
    const n = pieces.filter(p => p.type === t).length;
    return n > 1 ? `${PLURAL_ART[art]} ${n === 2 ? 'beiden' : 'drei'} ${PLURAL[t]}`.trim() : pieceName(t, 'acc', art);
  }));
}

// Material in Worten (Bauerneinheiten), Akkusativ: „eine Figur“, „die Qualität“
function materialWords(units, exchange = false) {
  if (units >= 9) return 'Material im Wert einer Dame';
  if (units >= 5) return 'Material im Wert eines Turms';
  if (units >= 3) return 'eine Figur';
  if (units === 2) return exchange ? 'die Qualität' : 'zwei Bauern';
  return 'einen Bauern';
}

// ---------------------------------------------------------------------------
// Stellungslogik mit chess.js (wie python-chess in analyze_games.py)

// '6...Be6 7. Nh3' oder ['Be6','Nh3'] → ['Be6','Nh3']
function toMoves(line) {
  if (!line) return [];
  const arr = Array.isArray(line) ? line : String(line).split(/\s+/);
  return arr.map(t => String(t).replace(/^\d+\.(\.\.|…)?/, '').trim())
    .filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

function tryMove(chess, mv) {
  if (!mv) return null;
  try {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mv)) {
      return chess.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
    }
    return chess.move(mv);
  } catch {
    return null;
  }
}

function squares(chess, color) {
  const out = [];
  for (const row of chess.board()) for (const p of row) if (p && p.color === color) out.push(p);
  return out;
}

function materialBalance(chess, color) {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VALUE[p.type];
  return s;
}

// Steht die Figur auf sq (Farbe color) in Gefahr? Ungedeckt angegriffen oder von einer billigeren Figur angegriffen.
function isHanging(chess, sq, color) {
  const p = chess.get(sq);
  if (!p || p.type === 'k') return false;
  const opp = color === 'w' ? 'b' : 'w';
  const defenders = chess.attackers(sq, color);
  let attackers = chess.attackers(sq, opp);
  if (defenders.length) attackers = attackers.filter(a => chess.get(a)?.type !== 'k');
  if (!attackers.length) return false;
  if (!defenders.length) return true;
  return Math.min(...attackers.map(a => VALUE[chess.get(a).type] || 0)) < VALUE[p.type];
}

// Gegnerische Figuren, die die Figur auf `from` lohnend angreift (König, wertvoller oder ungedeckt)
function forkTargets(chess, from, victimColor) {
  const attacker = chess.get(from);
  if (!attacker) return [];
  const out = [];
  for (const p of squares(chess, victimColor)) {
    if (p.type === 'p') continue;
    if (!chess.attackers(p.square, attacker.color).includes(from)) continue;
    const undefended = !chess.attackers(p.square, victimColor).length;
    if (p.type === 'k' || VALUE[p.type] > VALUE[attacker.type] || undefended) out.push(p);
  }
  return out.sort((a, b) => (b.type === 'k') - (a.type === 'k') || VALUE[b.type] - VALUE[a.type]);
}

// Droht die Seite `color` ein Matt in 1, wenn sie jetzt am Zug wäre? (Nullzug per FEN)
function mateThreat(chess, color) {
  if (chess.inCheck()) return null;
  const parts = chess.fen().split(' ');
  parts[1] = color;
  parts[3] = '-';
  let probe;
  try {
    probe = new Chess(parts.join(' '));
  } catch {
    return null;
  }
  if (probe.inCheck()) return null;   // ungültig: Gegner stünde im Schach
  for (const m of probe.moves({ verbose: true })) {
    probe.move(m);
    const mate = probe.isCheckmate();
    probe.undo();
    if (mate) return m.san;
  }
  return null;
}

// Spielt eine Zugfolge und gibt zurück, ob sie im Matt endet und was sich am Material ändert.
// pre: Züge, die vorher gespielt, aber nicht angezeigt werden (z. B. der eigene Fehlerzug),
// damit der Materialvergleich bei der Stellung davor ansetzt.
function playLine(fen, moves, color, { maxPlies = 8, pre = [] } = {}) {
  const c = new Chess(fen);
  const before = materialBalance(c, color);
  const lost = { me: [], opp: [] };
  const played = [];
  const bal = [];          // Materialbilanz nach jedem angezeigten Zug
  let last = null;
  const all = [...pre.map(m => [m, false]), ...moves.slice(0, maxPlies).map(m => [m, true])];
  for (const [mv, shown] of all) {
    const m = tryMove(c, mv);
    if (!m) break;
    if (shown) played.push(m.san);
    if (m.captured) (m.color === color ? lost.opp : lost.me).push(m.captured);
    if (shown) { bal.push(materialBalance(c, color) - before); last = m; }
  }
  // Endet die (abgeschnittene) Zeile mit einem Schlagzug von `color`, kann die Gegenseite meist
  // zurückschlagen: dann vorsichtshalber den Stand vor diesem Zug nehmen.
  let gain = bal.length ? bal[bal.length - 1] : materialBalance(c, color) - before;
  if (last?.captured && last.color === color && bal.length >= 2 && !c.isCheckmate()) gain = Math.min(gain, bal[bal.length - 2]);
  return {
    sans: played,
    mate: c.isCheckmate(),
    winner: c.isCheckmate() ? (c.turn() === 'w' ? 'b' : 'w') : null,
    gain,
    // Qualität: die Gegenseite verliert einen Turm, `color` dafür eine Leichtfigur
    exchange: lost.opp.includes('r') && lost.me.some(t => t === 'n' || t === 'b') && !lost.opp.includes('q'),
  };
}

const CLASS_PHRASE = {
  blunder: 'ein Patzer', mistake: 'ein Fehler', inaccuracy: 'eine Ungenauigkeit',
  ok: 'ein ordentlicher Zug', good: 'ein starker Zug',
};

// ---------------------------------------------------------------------------
// Erklärt einen Zug in einer Stellung anhand der Engine-Ausgabe. Rückgabe: Array von Sätzen.
// args: {fen, played (SAN oder UCI), best (SAN/UCI), bestLine: [SAN] oder String,
//        refutation: [SAN] oder String (beste Antwort des Gegners auf den gespielten Zug), drop}
// Alles außer `played` darf fehlen; dann wird die Erklärung entsprechend kürzer.
export function explainMove(args = {}) {
  const out = [];
  const c = classify(args.drop ?? 0);
  const fen = args.fen;
  let board = null;
  try { board = fen ? new Chess(fen) : null; } catch { board = null; }

  // Gespielten und besten Zug in SAN auflösen (falls UCI übergeben wurde)
  let playedMove = null, bestMove = null;
  if (board) {
    playedMove = tryMove(new Chess(fen), args.played);
    bestMove = tryMove(new Chess(fen), args.best);
  }
  const played = playedMove?.san || args.played || '';
  const best = bestMove?.san || args.best || '';
  const isBest = best && best === played;

  if (isBest) {
    out.push(`${sanDe(played)} ist der beste Zug.`);
    return out;
  }
  out.push(`${sanDe(played)} ist ${CLASS_PHRASE[c.key]}.`);
  if (c.key === 'ok' || c.key === 'good') {
    if (best) out.push(c.key === 'ok' ? `Etwas genauer war ${sanDe(best)}.` : `Die Engine bevorzugt knapp ${sanDe(best)}.`);
    return out;
  }
  if (!board || !playedMove) {
    if (best) out.push(`Besser war ${sanDe(best)}.`);
    return out;
  }

  const me = board.turn();
  const opp = me === 'w' ? 'b' : 'w';
  const after = new Chess(fen);
  after.move(playedMove.san);
  if (after.isCheckmate()) return [`${sanDe(played)} setzt matt.`];

  // --- Was macht die Widerlegung? ---
  const refMoves = toMoves(args.refutation);
  const hangingBefore = new Set(squares(after, me).filter(p => isHanging(after, p.square, me)).map(p => p.square));
  let explained = false;

  if (refMoves.length) {
    const reply = tryMove(new Chess(after.fen()), refMoves[0]);
    if (reply) {
      const r = new Chess(after.fen());
      r.move(reply.san);
      const rDe = sanDe(reply.san);
      let mentioned = false;     // Antwortzug schon in einem Satz genannt?
      if (r.isCheckmate()) {
        out.push(`Danach setzt dich der Gegner mit ${rDe} sofort matt.`);
        explained = true;
      } else {
        // Material ab der Stellung vor deinem Zug zählen (was dein Zug geschlagen hat, zählt mit)
        const line = playLine(after.fen(), refMoves, opp);
        const lost = playLine(fen, refMoves, opp, { pre: [playedMove.san] });
        if (line.mate && line.winner === opp) {
          const n = Math.ceil(line.sans.length / 2);
          out.push(`Danach erzwingt der Gegner Matt in ${n} Zügen: ${lineDe(line.sans, after.fen())}.`);
          explained = true;
        }
        if (!explained && reply.captured) {
          const victim = pieceName(reply.captured, 'acc', 'dein', after.attackers(reply.to, me).length ? '' : 'ungedeckt');
          out.push(`Der Gegner antwortet mit ${rDe}${r.inCheck() ? ' (mit Schach)' : ''} und schlägt ${victim} auf ${reply.flags.includes('e') ? reply.to + ' en passant' : reply.to}.`);
          explained = mentioned = true;
        } else if (!explained && r.inCheck()) {
          out.push(`Der Gegner antwortet mit ${rDe} und gibt Schach.`);
          mentioned = true;
        }
        // Gabel durch die antwortende Figur
        const targets = forkTargets(r, reply.to, me);
        if (!line.mate && targets.length >= 2) {
          const mover = pieceName(r.get(reply.to).type, 'nom', 'der');
          if (!mentioned) out.push(`Der Gegner antwortet mit ${rDe}.`);
          out.push(`Das ist eine Gabel: ${cap(mover)} auf ${reply.to} greift ${pieceList(targets.slice(0, 3), 'dein')} gleichzeitig an.`);
          explained = mentioned = true;
        } else if (!line.mate) {
          // Abzug: andere Figuren greifen nach dem Zug neu an
          const disc = discovered(after, r, reply, me);
          if (disc) {
            if (!mentioned) out.push(`Der Gegner antwortet mit ${rDe}.`);
            out.push(disc.check
              ? `Dadurch gibt ${disc.attacker} auf ${disc.from} Abzugsschach.`
              : `Dadurch greift ${disc.attacker} auf ${disc.from} ${disc.victim} an (Abzugsangriff).`);
            explained = mentioned = true;
          }
        }
        if (!explained && !reply.captured && !r.inCheck()) {
          const threat = mateThreat(r, opp);
          if (threat) {
            out.push(`Der Gegner antwortet mit ${rDe} und droht ${sanDe(threat).replace('#', '')} matt.`);
            explained = true;
          } else {
            const newly = squares(r, me).filter(p => isHanging(r, p.square, me) && !hangingBefore.has(p.square))
              .sort((a, b) => VALUE[b.type] - VALUE[a.type]);
            if (newly.length) {
              out.push(`Der Gegner antwortet mit ${rDe} und greift ${pieceName(newly[0].type, 'acc', 'dein')} auf ${newly[0].square} an.`);
              explained = true;
            }
          }
        }
        if (!line.mate && lost.gain >= 1 && (line.sans.length > 1 || !reply.captured)) {
          const units = Math.round(lost.gain);
          out.push(units === 2 && lost.exchange
            ? `Nach ${lineDe(line.sans, after.fen())} hast du die Qualität verloren.`
            : `Nach ${lineDe(line.sans, after.fen())} hast du ${materialWords(units)} weniger.`);
          explained = true;
        }
      }
    }
  }

  // Ohne verwertbare Widerlegung: hängt etwas?
  if (!explained) {
    const moved = after.get(playedMove.to);
    if (moved && hangingBefore.has(playedMove.to)) {
      out.push(after.attackers(playedMove.to, me).length
        ? `Nach ${sanDe(played)} kann ${pieceName(moved.type, 'nom', 'dein')} auf ${playedMove.to} von einer schwächeren Figur geschlagen werden.`
        : `Nach ${sanDe(played)} steht ${pieceName(moved.type, 'nom', 'dein')} auf ${playedMove.to} ungedeckt.`);
    } else if ([...hangingBefore].some(sq => VALUE[after.get(sq).type] >= 3)) {
      const sq = [...hangingBefore].sort((a, b) => VALUE[after.get(b).type] - VALUE[after.get(a).type])[0];
      out.push(`Danach hängt ${pieceName(after.get(sq).type, 'nom', 'dein')} auf ${sq}.`);
    } else {
      const threat = mateThreat(after, opp);
      if (threat) out.push(`Danach droht der Gegner ${sanDe(threat).replace('#', '')} matt.`);
    }
  }

  // --- Was hätte der beste Zug gebracht? ---
  if (bestMove) out.push(...explainBest(fen, bestMove, toMoves(args.bestLine), me));
  else if (best) out.push(`Besser war ${sanDe(best)}.`);
  return out;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Neue Angriffe anderer Figuren nach dem Antwortzug (Abzugsangriff)
function discovered(before, after, reply, victimColor) {
  const attackerColor = reply.color;
  for (const p of squares(after, victimColor).sort((a, b) => VALUE[b.type] - VALUE[a.type])) {
    if (p.type === 'p') continue;
    const now = after.attackers(p.square, attackerColor).filter(sq => sq !== reply.to);
    const was = new Set(before.attackers(p.square, attackerColor));
    const fresh = now.find(sq => !was.has(sq) && sq !== reply.from);
    if (!fresh) continue;
    const atk = after.get(fresh);
    if (p.type !== 'k' && VALUE[atk.type] >= VALUE[p.type] && after.attackers(p.square, victimColor).length) continue;
    return { attacker: pieceName(atk.type, 'nom', 'der'), from: fresh, victim: pieceName(p.type, 'acc', 'dein'), check: p.type === 'k' };
  }
  return null;
}

function explainBest(fen, bestMove, bestLine, me) {
  const opp = me === 'w' ? 'b' : 'w';
  const b = new Chess(fen);
  const undefendedTarget = !b.attackers(bestMove.to, opp).length;
  b.move(bestMove.san);
  const bDe = sanDe(bestMove.san);
  if (b.isCheckmate()) return [`Mit ${bDe} hättest du sofort mattgesetzt.`];

  // bestLine beginnt normalerweise mit dem besten Zug selbst (Engine-Hauptvariante)
  const moves = bestLine[0] === bestMove.san || bestLine[0] === bestMove.lan ? bestLine : [bestMove.san];
  const line = playLine(fen, moves, me);
  if (line.mate && line.winner === me) {
    const n = Math.ceil(line.sans.length / 2);
    return [`Mit ${bDe} hättest du Matt in ${n} Zügen erzwungen: ${lineDe(line.sans, fen)}.`];
  }
  const out = [];
  const targets = forkTargets(b, bestMove.to, opp);
  if (bestMove.captured) {
    const victim = pieceName(bestMove.captured, 'acc', 'der', undefendedTarget ? 'ungedeckt' : '');
    out.push(`Besser war ${bDe}: Damit schlägst du ${b.inCheck() ? 'mit Schach ' : ''}${victim} auf ${bestMove.to}.`);
  } else if (targets.length >= 2) {
    out.push(`Besser war ${bDe}: eine Gabel gegen ${pieceList(targets.slice(0, 3), 'der')}.`);
  } else if (b.inCheck()) {
    out.push(`Besser war das Schach ${bDe}.`);
  } else {
    out.push(`Besser war ${bDe}.`);
  }
  if (line.sans.length > 1 && line.gain >= 2) {
    const units = Math.round(line.gain);
    out.push(`Nach ${lineDe(line.sans, fen)} gewinnst du ${units === 2 && line.exchange ? 'die Qualität' : materialWords(units)}.`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tipp des Tages: kurze, konkrete Gewohnheiten. Kategorie steuert die Auswahl nach Schwächen.

export const TIPS = [
  // Denkprozess
  { cat: 'denken', text: 'Vor jedem Zug drei Fragen: Was will der Gegner mit seinem letzten Zug? Welche Schachs, Schlagzüge und Drohungen habe ich? Was hängt nach meinem Zug?' },
  { cat: 'denken', text: 'Blundercheck: Bevor du loslässt, schau dir dein Zielfeld an. Wer greift es an, wer deckt es?' },
  { cat: 'denken', text: 'Frag nach jedem Gegnerzug: Was hat sich verändert? Neue Angriffe entstehen oft durch die Figur, die gerade weggezogen ist.' },
  { cat: 'denken', text: 'Suche zuerst die erzwingenden Züge: Schach, Schlagen, Drohen. Für beide Seiten.' },
  { cat: 'denken', text: 'Hast du einen guten Zug gefunden? Such noch einen besseren. Der erste Einfall ist oft nicht der stärkste.' },
  { cat: 'denken', text: 'Rechne Abtausche bis zum Ende: Wer schlägt zuletzt? Zähle Angreifer und Verteidiger.' },
  { cat: 'denken', text: 'Ungedeckte Figuren fallen leicht. Achte darauf, dass jede deiner Figuren gedeckt ist oder sicher steht.' },
  { cat: 'denken', text: 'Wenn du keinen Plan hast: Verbessere deine schlechteste Figur.' },
  { cat: 'denken', text: 'Stell dir die Stellung nach deinem Zug vor und such dort den besten Zug des Gegners. Erst dann ziehen.' },
  { cat: 'denken', text: 'Ein König in der Mitte mit offenen Linien ist ein Ziel. Rochiere früh und öffne Linien gegen einen unrochierten König.' },
  // Zeit
  { cat: 'zeit', text: 'Im 10-Minuten-Rapid: Eröffnung zügig (unter 1 Minute für die ersten 8 Züge), dann Zeit für die kritischen Momente.' },
  { cat: 'zeit', text: 'Faustregel für 10 Minuten: Nach Zug 20 solltest du noch mindestens 5 Minuten haben.' },
  { cat: 'zeit', text: 'Unter einer Minute Restzeit: Einfache, sichere Züge. Keine langen Rechnungen mehr, Figuren decken, Abtausche anbieten.' },
  { cat: 'zeit', text: 'Wenn du am Zug lange nachdenkst, dann dort, wo es Schlagzüge oder Schachs gibt. Ruhige Züge brauchen weniger Zeit.' },
  { cat: 'zeit', text: 'Plane, während der Gegner nachdenkt. Dann musst du bei seinem erwarteten Zug nur noch kurz prüfen.' },
  { cat: 'zeit', text: 'Spiel weniger Bullet, mehr Rapid. Im Bullet übst du Hektik, im Rapid übst du Denken.' },
  { cat: 'zeit', text: 'Eine verlorene Partie auf Zeit zählt genauso wie ein Matt. Behalte die Uhr nach jedem Zug kurz im Blick.' },
  // Eröffnung
  { cat: 'eroeffnung', text: 'Die drei Eröffnungsregeln: Zentrum besetzen, Leichtfiguren entwickeln, früh rochieren.' },
  { cat: 'eroeffnung', text: 'Zieh in der Eröffnung keine Figur zweimal, wenn es nicht nötig ist. Jeder Zug soll eine neue Figur ins Spiel bringen.' },
  { cat: 'eroeffnung', text: 'Bring die Dame nicht zu früh heraus. Sie wird gejagt, und der Gegner entwickelt sich mit Tempo.' },
  { cat: 'eroeffnung', text: 'Der Punkt f7 (bzw. f2) ist am Anfang nur vom König gedeckt. Achte auf Angriffe mit Lc4 und Sg5 oder Dh5.' },
  { cat: 'eroeffnung', text: 'Kennst du die Eröffnung nicht? Spiele nach Prinzipien und schau sie dir nach der Partie im Katalog an.' },
  { cat: 'eroeffnung', text: 'Lerne zu jeder Repertoire-Linie den Plan danach. Ein Zug, dessen Idee du verstehst, bleibt viel besser hängen.' },
  { cat: 'eroeffnung', text: 'Wenn der Gegner von der Theorie abweicht: Frag dich, was sein Zug angreift oder vernachlässigt.' },
  // Taktik
  { cat: 'taktik', text: 'Springergabeln: Prüfe, auf welche Felder ein gegnerischer Springer in einem Zug kommt und was er dort angreift.' },
  { cat: 'taktik', text: 'Figuren auf derselben Linie oder Diagonale wie König oder Dame sind anfällig für Fesselung und Spieß.' },
  { cat: 'taktik', text: 'Grundreihe: Hat dein König kein Luftloch, kann ein Turm auf der 8. (bzw. 1.) Reihe mattsetzen. Ein Zug wie h3 schafft Abhilfe.' },
  { cat: 'taktik', text: 'Bei Taktikaufgaben: Erst die ganze Lösung durchrechnen, dann ziehen. Nicht „mal probieren“.' },
  { cat: 'taktik', text: 'Überlastete Verteidiger: Deckt eine Figur zwei Dinge gleichzeitig, kann sie nicht beides halten.' },
  { cat: 'taktik', text: 'Nach einem Schlagzug des Gegners: Erst prüfen, ob es einen Zwischenzug gibt, bevor du automatisch zurückschlägst.' },
  { cat: 'taktik', text: 'Hast du mehr Material? Tausche Figuren (nicht Bauern). Je weniger auf dem Brett, desto leichter gewinnst du.' },
  // Endspiel
  { cat: 'endspiel', text: 'Im Endspiel wird der König zur Kampffigur. Bring ihn früh in die Mitte.' },
  { cat: 'endspiel', text: 'Türme gehören hinter Freibauern: hinter die eigenen und hinter die des Gegners.' },
  { cat: 'endspiel', text: 'Quadratregel: Passt der gegnerische König ins Quadrat des Freibauern, holt er ihn ein.' },
  { cat: 'endspiel', text: 'Opposition: Stehen sich die Könige mit einem Feld Abstand gegenüber, muss der Ziehende oft weichen.' },
  { cat: 'endspiel', text: 'Mit Dame gegen König: Erst die Dame einen Springerzug vom König entfernt stellen, Feld für Feld einengen, dann den König holen. Vorsicht vor Patt!' },
  // Training und Kopf
  { cat: 'training', text: 'Schau dir nach jeder verlorenen Rapid-Partie den ersten großen Fehler an. Nur den einen, aber gründlich.' },
  { cat: 'training', text: 'Jeden Tag 30 Minuten bringen mehr als einmal pro Woche 3 Stunden. Die Serie zählt.' },
  { cat: 'training', text: 'Nach einer Niederlage kurz durchatmen, bevor du die nächste Partie startest. Tilt kostet mehr Elo als jede Eröffnung.' },
  { cat: 'training', text: 'Gib eine Partie nicht zu früh auf und verlass sie nie. Auf deinem Niveau werden viele verlorene Stellungen noch gedreht.' },
  { cat: 'training', text: 'Spiel nach dem Training eine Rapid-Partie und setz bewusst eine Sache um, zum Beispiel den Blundercheck vor jedem Zug.' },
];

// Einfacher, stabiler Hash: derselbe Tag → derselbe Tipp
function hashStr(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  // Nachmischen, damit ähnliche Daten („…-30“, „…-31“) weit auseinander landen
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return x >>> 0;
}

// context: {date: 'YYYY-MM-DD', focus: {phases, timeTrouble, timeTroubleRapid}, category, salt}
// → String. Schwächen aus der Partie-Analyse machen passende Kategorien wahrscheinlicher.
export function tipOfTheDay(context = {}) {
  const weights = { denken: 3, zeit: 1, eroeffnung: 1.5, taktik: 1.5, endspiel: 0.7, training: 1 };
  const f = context.focus || {};
  if ((f.timeTroubleRapid || 0) >= 0.15 || (f.timeTrouble || 0) >= 0.25) weights.zeit = 3;
  const ph = f.phases || {};
  if ((ph.eroeffnung || 0) >= 0.3) weights.eroeffnung = 2.5;
  if ((ph.mittelspiel || 0) >= 0.55) weights.taktik = 2.5;
  if ((ph.endspiel || 0) >= 0.2) weights.endspiel = 1.5;
  const pool = context.category ? TIPS.filter(t => t.cat === context.category) : TIPS;
  const list = pool.length ? pool : TIPS;
  const total = list.reduce((s, t) => s + (weights[t.cat] || 1), 0);
  const pick = key => {
    let x = (hashStr(key) / 4294967296) * total;
    for (const t of list) {
      x -= weights[t.cat] || 1;
      if (x < 0) return t.text;
    }
    return list[list.length - 1].text;
  };
  const date = context.date || new Date().toISOString().slice(0, 10);
  const salt = context.salt ?? '';
  const tip = pick(date + salt);
  // nicht zwei Tage hintereinander derselbe Tipp
  const d = new Date(date + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return tip;
  d.setDate(d.getDate() - 1);
  const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return tip === pick(prev + salt) ? pick(date + salt + '#') : tip;
}
