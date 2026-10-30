// Tests für vision/logic.js und vision/endgame.js – ohne Browser:
// /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m app/js/vision/logic.test.mjs
import * as L from './logic.js';
import * as E from './endgame.js';
import { Chess } from '../../vendor/chess.js';

let fails = 0, passes = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) passes++;
  else { fails++; print(`FEHLER ${name}: ${g} statt ${w}`); }
}
function ok(name, cond) { eq(name, !!cond, true); }

// --- parsePuzzle / makeBlindTask ---
const row = ['1361h', '2r4k/5p1p/3NpPp1/2r3P1/5P1P/2B5/PPKQ4/6q1 b - - 10 42', 'c8c7 d6f7 c7f7 d2d8 f7f8 d8f8', 700, 'clearance endgame long mate mateIn3 sacrifice', ''];
const p = L.parsePuzzle(row);
eq('parse moves', p.moves.length, 6);
eq('parse themes', p.themes[0], 'clearance');
eq('blindLength', [1, 2, 3, 4, 8].map(L.blindLength), [2, 4, 4, 6, 10]);

const t4 = L.makeBlindTask(p, 4);      // nach c8c7 stehen: d6f7 c7f7 d2d8 f7f8 angesagt, gesucht d8f8
eq('blind4 announced', t4.announced.map(a => a.san), ['Nxf7+', 'Rxf7', 'Qd8+', 'Rf8']);
eq('blind4 target', t4.targetSan, 'Qxf8#');
ok('blind4 mate', t4.mate && t4.isLast);
eq('blind4 color', t4.color, 'w');
eq('blind4 startPly', t4.startPly, 84);
const t5 = L.makeBlindTask(p, 5);
eq('blind5 Start = Aufgaben-FEN', t5.startFen.split(' ')[0], p.fen.split(' ')[0]);
eq('blind5 announced', t5.announced.length, 5);
eq('blind6 zu lang', L.makeBlindTask(p, 6), null);
ok('blind Antwort richtig', L.checkBlindAnswer(t4, { from: 'd8', to: 'f8' }).ok);
ok('blind Antwort falsch', !L.checkBlindAnswer(t4, { from: 'd8', to: 'd7' }).ok);
eq('blind illegal', L.checkBlindAnswer(t4, { from: 'a1', to: 'a5' }).legal, false);
// anderes Matt zählt, wenn die Lösung mattsetzt
const mateTask = { target: 'a1a8', targetSan: 'Ra8#', imaginedFen: '6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1', mate: true, isLast: true };
const alt = L.checkBlindAnswer(mateTask, { from: 'e1', to: 'e8' });
ok('blind anderes Matt', alt.ok && alt.altMate);

// --- checksAndCaptures ---
eq('cct Grundstellung', L.checksAndCaptures(new Chess().fen()).length, 0);
const cct = L.checksAndCaptures('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
eq('cct Schäfermatt', cct.map(m => m.san).sort(), ['Bxf7+', 'Qxe5+', 'Qxf7#', 'Qxh7'].sort());
ok('cct Flags', cct.find(m => m.san === 'Qxf7#').check && cct.find(m => m.san === 'Qxh7').capture);
// Umwandlungen zählen als ein Eintrag
const promo = L.checksAndCaptures('1n5k/P7/8/8/8/8/8/K7 w - - 0 1');
eq('cct Umwandlung', promo.map(m => m.key), ['a7b8']);

// --- see / loosePieces ---
eq('see Springer gegen Bauer gedeckt', L.see(3, [1], [1]), 2);
eq('see ungedeckter Turm', L.see(5, [9], []), 5);
eq('see Turm durch Dame, Bauer deckt', L.see(5, [9], [1]), -4);
eq('see 2 gegen 1', L.see(3, [3, 3], [3]), 3);
eq('see gleich', L.see(3, [3], [3]), 0);
const loose = L.loosePieces('4k3/8/3n4/4P3/8/2B5/8/4K2R w - - 0 1');
// Sd6 hängt (Bauer greift an), Lc3 und Th1 ungedeckt, Bauer e5 ungedeckt, aber nicht angegriffen (Bauern zählen nur, wenn sie hängen)
eq('loose Felder', loose.map(x => x.square + ':' + x.reason).sort(), ['c3:ungedeckt', 'd6:hängt', 'h1:ungedeckt']);
const loose2 = L.loosePieces('4k3/8/8/3p4/4N3/8/8/4K3 b - - 0 1');
eq('loose Bauer schlägt Springer', loose2.map(x => x.square + ':' + x.reason), ['e4:hängt']);
eq('grade', L.gradeSelection(['a1', 'b2'], ['a1', 'c3']), { hit: ['a1'], missed: ['b2'], extra: ['c3'], ok: false });

// --- nullMoveFen ---
eq('null normal', L.nullMoveFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'),
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2');
eq('null Schwarz → Zugzähler', L.nullMoveFen('4k3/8/8/8/8/8/8/4K3 b - - 0 7'), '4k3/8/8/8/8/8/8/4K3 w - - 0 8');
eq('null im Schach', L.nullMoveFen('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1'), null);

// --- winChance / threatGain ---
ok('winChance 0', Math.abs(L.winChance({ cp: 0 }, 'w') - 50) < 1e-9);
ok('winChance Matt Schwarz', L.winChance({ mate: -3 }, 'b') > 99);
ok('threatGain', L.threatGain({ cp: 0 }, { cp: -500 }, 'w') > 30);
ok('threat akzeptiert', L.threatAccepted(40, 45) && !L.threatAccepted(20, 45));
eq('sanDe', [L.sanDe('Qxf7#'), L.sanDe('e8=Q+'), L.sanDe('Nf3')], ['Dxf7#', 'e8=D+', 'Sf3']);
const dt = L.describeThreat('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7');
eq('describeThreat Matt', dt, 'Dxf7# wäre sofort Matt.');
eq('describeThreat Schlag', L.describeThreat('4k3/8/3n4/4P3/8/2B5/8/4K2R w - - 0 1', 'e5d6'), 'exd6: der Bauer schlägt den Springer auf d6.');

// --- adapt ---
let st = { level: 1, streak: 0 };
for (let i = 0; i < 3; i++) st = L.adapt(st, true);
eq('adapt hoch', st.level, 2);
st = L.adapt(st, false); st = L.adapt(st, false);
eq('adapt runter', st.level, 1);
st = L.adapt({ level: 1, streak: 0 }, false); st = L.adapt(st, false);
eq('adapt Untergrenze', st.level, 1);
eq('adapt Obergrenze', L.adapt({ level: 8, streak: 2 }, true, { max: 8 }).level, 8);
const hist = [];
for (let i = 0; i < 510; i++) L.pushHistory(hist, [i]);
eq('history gekürzt', [hist.length, hist[0][0]], [500, 10]);
eq('recentRate', L.recentRate([[0, 0, 1], [0, 0, 0]]), 0.5);

// --- pickRow ---
const rnd = L.seededRandom(7);
const rows = Array.from({ length: 100 }, (_, i) => [String(i), '', '', i * 10]);
const r = L.pickRow(rows, L.ratingFilter(500, 520), rnd);
ok('pickRow Filter', r && r[3] >= 500 && r[3] <= 520);
eq('pickRow nichts', L.pickRow(rows, () => false, rnd), null);

// --- Endspiel-Logik ---
const kqk = { id: 'x', goal: 'win', until: 'mate', side: 'w', maxMoves: 10 };
eq('until Standard (nackter König)', E.untilOf({ fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', goal: 'win' }), 'mate');
eq('until Standard (Bauer)', E.untilOf({ fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', goal: 'win' }), 'promote');
// Matt durch Nutzer
const mated = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1'); mated.move('Qg7');
eq('judge Matt', E.judgeAfterUser(kqk, mated, { score: null, userMoves: 3 }).status, 'won');
// Patt im Gewinnversuch
const stale = new Chess('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1'); stale.move('Qf7');
eq('judge Patt', E.judgeAfterUser(kqk, stale, { score: null, userMoves: 3 }).status, 'failed');
// Zuglimit
const cont = new Chess('8/8/8/4k3/8/8/8/3QK3 w - - 0 1'); cont.move('Qd4+');
eq('judge weiter', E.judgeAfterUser(kqk, cont, { score: { mate: 8 }, userMoves: 3 }).status, 'continue');
eq('judge Limit', E.judgeAfterUser(kqk, cont, { score: { mate: 8 }, userMoves: 10 }).status, 'failed');
// Umwandlung mit klarer Bewertung
const kp = { goal: 'win', until: 'promote', side: 'w', maxMoves: 15 };
const pr = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1'); const pm = pr.move('e8=Q');
eq('judge Umwandlung', E.judgeAfterUser(kp, pr, { score: { cp: 900 }, userMoves: 5, lastMove: pm }).status, 'won');
eq('judge Umwandlung, aber unklar', E.judgeAfterUser(kp, pr, { score: { cp: 300 }, userMoves: 5, lastMove: pm }).status, 'continue');
eq('judge Gewinn verspielt', E.judgeAfterUser(kp, cont, { score: { cp: 20 }, userMoves: 5 }).status, 'failed');
// Remis halten
const dr = { goal: 'draw', side: 'b', maxMoves: 8 };
const dpos = new Chess('8/8/8/4k3/4P3/4K3/8/8 b - - 0 1'); dpos.move('Ke6');
eq('remis weiter', E.judgeAfterUser(dr, dpos, { score: { cp: 0 }, userMoves: 3 }).status, 'continue');
eq('remis gehalten (Limit)', E.judgeAfterUser(dr, dpos, { score: { cp: 0 }, userMoves: 8 }).status, 'won');
eq('remis verloren', E.judgeAfterUser(dr, dpos, { score: { cp: 700 }, userMoves: 3 }).status, 'failed');
const ins = new Chess('8/8/8/8/8/2k5/2P5/K7 b - - 0 1'); ins.move('Kxc2');
eq('remis durch Material', E.judgeAfterUser(dr, ins, { score: { cp: 0 }, userMoves: 2 }).status, 'won');
// nach dem Gegnerzug: Nutzer mattgesetzt
const um = new Chess('6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1');
eq('judgeAfterOpponent Matt', E.judgeAfterOpponent(dr, um).status, 'failed');
// Note und Auswahl
eq('grade ohne Hinweis schnell', E.gradeFor({ ok: true, hints: 0, userMoves: 5, par: 8 }), 3);
eq('grade mit Hinweis', E.gradeFor({ ok: true, hints: 1, userMoves: 5, par: 8 }), 1);
eq('grade falsch', E.gradeFor({ ok: false, hints: 0 }), 0);
const list = [{ id: 'a', level: 1 }, { id: 'b', level: 1 }, { id: 'c', level: 2 }];
const cards = { a: { due: '2026-10-29', interval: 1 }, b: { due: '2026-11-05', interval: 7 } };
eq('Reihenfolge fällig → neu', E.queue(list, cards, '2026-10-30').map(x => x.id), ['a', 'c', 'b']);

// Figur für den Bauern gegeben zählt wie die Umwandlung (until 'promote')
const sac = new Chess('8/8/8/8/8/1k6/8/K6R w - - 0 1');
eq('materialEdge', E.materialEdge(sac, 'w'), 5);
eq('judge Figur für Bauer', E.judgeAfterUser({ goal: 'win', until: 'promote', side: 'w', maxMoves: 20 }, sac, { score: { cp: 2000 }, userMoves: 4 }).status, 'won');
eq('judge Figur, aber Matt-Ziel', E.judgeAfterUser({ goal: 'win', until: 'mate', side: 'w', maxMoves: 20 }, sac, { score: { cp: 2000 }, userMoves: 4 }).status, 'continue');
// lostCp pro Stellung
eq('remis lostCp', E.judgeAfterUser({ goal: 'draw', side: 'b', maxMoves: 8, lostCp: -800 }, dpos, { score: { cp: 700 }, userMoves: 3 }).status, 'continue');
eq('remis drawMargin', E.judgeAfterUser({ goal: 'draw', side: 'b', maxMoves: 8, drawMargin: 300 }, dpos, { score: { cp: 250 }, userMoves: 8 }).status, 'won');

// --- endgames.json: Format und Regeln (Engine-Prüfung: data/test/eg_check.py) ---
let egText = null;
for (const path of ['app/data/endgames.json', '../../data/endgames.json', 'data/endgames.json']) {
  try { egText = read(path); break; } catch { /* nächster Pfad */ }
}
if (!egText) { fails++; print('FEHLER endgames.json nicht gefunden (Test aus dem Projektordner starten)'); }
else {
  const eg = JSON.parse(egText);
  ok('endgames mindestens 18', eg.length >= 18);
  eq('endgames ids eindeutig', new Set(eg.map(p => p.id)).size, eg.length);
  for (const pos of eg) {
    const missing = ['id', 'title', 'level', 'fen', 'side', 'goal', 'maxMoves', 'intro', 'hints', 'technique'].filter(k => pos[k] == null);
    eq(`${pos.id} Felder`, missing, []);
    let g = null;
    try { g = new Chess(pos.fen); } catch (e) { print(`FEHLER ${pos.id}: ${e.message}`); fails++; continue; }
    eq(`${pos.id} Seite am Zug`, g.turn(), pos.side);
    ok(`${pos.id} nicht vorbei`, !g.isGameOver());
    ok(`${pos.id} Ziel`, (pos.goal === 'win' || pos.goal === 'draw') && pos.hints.length >= 2 && pos.maxMoves > 0);
    ok(`${pos.id} until`, pos.goal === 'draw' || ['mate', 'promote', 'material'].includes(E.untilOf(pos)));
  }
  eq('Reihenfolge neu nach Stufe', E.queue(eg, {}, '2026-10-30')[0].level, 1);
}

print(`${passes} ok, ${fails} Fehler`);
