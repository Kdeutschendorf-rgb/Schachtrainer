// Tests für die Taktik-Logik. Aufruf (ohne Browser):
// /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m app/js/tactics/logic.test.mjs
import * as L from './logic.js';

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { fails++; print('FEHLER: ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); }

// deterministischer Zufall
function rng(seed = 1) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

// --- Beispieldaten (echte Zeilen aus puzzles.json) ---
const ROWS = [
  ['1361h', '2r4k/5p1p/3NpPp1/2r3P1/5P1P/2B5/PPKQ4/6q1 b - - 10 42', 'c8c7 d6f7 c7f7 d2d8 f7f8 d8f8', 700, 'clearance endgame long mate mateIn3 sacrifice', ''],
  ['07l35', '4r1k1/2b2pp1/ppp1q2p/8/3P4/2N2Q1P/PP3PP1/3R2K1 w - - 0 25', 'd4d5 e6e1 d1e1 e8e1', 700, 'endgame kingsideAttack mate mateIn2 pillsburysMate sacrifice short', ''],
  ['0E7V6', 'r6k/3q1p2/p2p1Prp/3Pp2Q/2p1P3/2P2P1R/nP4P1/6K1 b - - 0 35', 'a8g8 h5h6 g6h6 h3h6', 700, 'endgame kingsideAttack mate mateIn2 sacrifice short', ''],
];
// synthetische Zeilen für die Auswahl
const SYN = [];
for (let i = 0; i < 400; i++) {
  const r = 700 + ((i * 37) % 1400);
  SYN.push([`s${i}`, ROWS[i % 3][1], ROWS[i % 3][2], r, i % 5 === 0 ? 'fork short middlegame' : i % 7 === 0 ? 'pin long' : 'hangingPiece short', '']);
}
const index = L.buildIndex([...ROWS, ...SYN]);

// --- Index ---
eq(index.size, 403, 'Indexgröße');
ok(index.byTheme.fork.length === 80, 'Thema fork gezählt');
let sorted = true;
for (const list of Object.values(index.byTheme))
  for (let k = 1; k < list.length; k++) if (index.ratings[list[k - 1]] > index.ratings[list[k]]) sorted = false;
ok(sorted, 'Themenlisten nach Wertung sortiert');
ok(index.byTheme.__calc.length > 0 && index.byTheme.__calc.every(i => /long|mateIn3/.test(index.rows[i][4])), 'Rechnen-Liste');
ok(index.byTheme.__short.every(i => index.rows[i][2].split(' ').length <= 4), 'kurze Aufgaben');
eq(L.puzzleById(index, '07l35').moves, ['d4d5', 'e6e1', 'd1e1', 'e8e1'], 'puzzleById');

// --- Auswahl ---
const rnd = rng(7);
for (let k = 0; k < 50; k++) {
  const p = L.pickPuzzle(index, { target: 1300, window: 150, rnd });
  ok(Math.abs(p.rating - 1300) <= 150, 'Auswahl im Fenster: ' + p.rating);
}
const pf = L.pickPuzzle(index, { target: 1500, theme: 'fork', rnd });
ok(pf.themes.includes('fork'), 'Auswahl nach Thema');
const seenAll = new Set(index.rows.map(r => r[0]).filter(id => id !== 's5'));
eq(L.pickPuzzle(index, { target: 2000, theme: 'fork', seen: seenAll, rnd }).id, 's5', 'Fenster wird erweitert bis Ungesehenes');
ok(L.pickPuzzle(index, { target: 1000, theme: 'gibtsnicht', rnd }) === null, 'unbekanntes Thema → null');

// --- Glicko ---
let r = L.glicko(1300, 350, 1300, 1);
ok(r.rating > 1400 && r.rating < 1500 && r.rd < 300, 'Start: großer Sprung, RD sinkt ' + JSON.stringify(r));
let st = { rating: 1300, rd: 350 };
for (let k = 0; k < 15; k++) st = L.glicko(st.rating, st.rd, 1300, k % 2);
ok(st.rd < 110, 'RD sinkt schnell: ' + st.rd);
const small = L.glicko(1300, 60, 1300, 1);
ok(small.rating - 1300 > 3 && small.rating - 1300 < 15, 'kleine Änderung bei RD-Minimum: ' + small.rating);
ok(L.glicko(1300, 60, 900, 1).rating - 1300 < L.glicko(1300, 60, 1700, 1).rating - 1300, 'schwere Aufgabe bringt mehr');
ok(L.glicko(1300, 60, 900, 0).rating < 1290, 'leichte Aufgabe verpatzt kostet viel');
ok(L.inflateRd(60, 30) > 90 && L.inflateRd(60, 0) === 60 && L.inflateRd(300, 9999) === 350, 'RD wächst bei Pausen');
eq(L.daysBetween('2026-10-01', '2026-10-31'), 30, 'daysBetween');

// --- SRS ---
const day = '2026-10-30';
let c = L.srsFail(null, day);
eq([c.due, c.step, c.lapses], ['2026-10-31', 0, 1], 'Fehlversuch → morgen');
const dues = [];
for (let k = 0; k < 5; k++) { c = L.srsPass(c, c.due); dues.push(c.interval); }
eq(dues, [3, 7, 14, 30, 60], 'Leiter 1/3/7/14/30/60');
ok(L.srsPass(c, c.due) === null, 'nach 60 Tagen fertig');
c = L.srsFail(c, day);
eq([c.step, c.lapses], [0, 2], 'Fehler setzt zurück');

// --- Fortschritt ---
const area = L.ensureArea({});
const P = L.puzzleFromRow(ROWS[1]);
let res = L.recordAttempt(area, { puzzle: { ...P, rating: 1300 }, ok: true, sec: 12, rated: true, countThemes: true, day });
ok(res.delta > 50 && area.rating === res.rating && area.lastRated === day, 'gewertet: ' + JSON.stringify(res));
eq(area.history[0], ['07l35', 1, day, Math.round(area.rating), 12], 'Verlaufseintrag');
eq(area.themeStats.mateIn2, [1, 1], 'Themenstatistik');
ok(!area.cards['07l35'], 'gelöst → keine Karte');
res = L.recordAttempt(area, { puzzle: L.puzzleFromRow(ROWS[0]), ok: false, sec: 30, rated: false, countThemes: true, day });
eq(res.delta, 0, 'ungewertet ändert nichts');
eq(area.cards['1361h'].due, '2026-10-31', 'Fehlversuch → Karte');
eq(area.themeStats.mate, [1, 2], 'Themen summiert');
L.recordAttempt(area, { puzzle: L.puzzleFromRow(ROWS[0]), ok: true, repeat: true, day: '2026-10-31' });
eq(area.cards['1361h'].due, '2026-11-03', 'Wiederholung richtig → +3 Tage');
for (let k = 0; k < 2100; k++) area.history.push(['x', 1, day, 1300, 1]);
L.recordAttempt(area, { puzzle: P, ok: true, day });
eq(area.history.length, L.HISTORY_MAX, 'Verlauf gekürzt');
const own = L.normalizeOwn([{ id: 'g1_27', fen: '2kr3r/ppp2ppp/2n2q2/5bB1/2BPn3/5N2/P4PPP/R2QR1K1 b - - 2 14', moves: ['e4g5', 'f3g5', 'f6g5'], played: 'Qd6', cls: 'blunder', tags: ['gabel', 'figur_eingestellt'], tc: 'rapid', date: '2025.05.01' }]);
eq([own[0].key, own[0].themes], ['my:g1_27', ['fork', 'hangingPiece']], 'eigene Aufgaben normalisiert');
L.recordAttempt(area, { puzzle: own[0], ok: true, day });
eq(area.ownSeen.g1_27, 1, 'eigene Aufgabe als gesehen markiert');
eq(L.normalizeOwn(null), [], 'fehlende Datei');

// --- Gewichte ---
const wNone = L.themeWeights({ themeStats: {} }, {});
const wFocus = L.themeWeights({ themeStats: {} }, { fork: 2, pin: 1 });
ok(wFocus.fork > wNone.fork * 2.5 && wFocus.pin > wNone.pin, 'Fokus erhöht Gewicht');
const wErr = L.themeWeights({ themeStats: { skewer: [1, 20], pin: [19, 20] } }, {});
ok(wErr.skewer > wNone.skewer && wErr.pin < wNone.pin, 'Fehlerquote verschiebt Gewicht');
const counts = {};
const r2 = rng(3);
for (let k = 0; k < 4000; k++) { const t = L.weightedChoice({ a: 1, b: 3 }, r2); counts[t] = (counts[t] || 0) + 1; }
ok(counts.b > counts.a * 2.5 && counts.b < counts.a * 3.5, 'weightedChoice ' + JSON.stringify(counts));
const rank = L.themeRanking({ fork: [9, 10], pin: [2, 10], skewer: [1, 2] });
eq(rank.map(x => x.theme), ['fork', 'pin'], 'Ranking mit Mindestanzahl');

// --- selectNext ---
const a2 = L.ensureArea({ rating: 1400, rd: 80 });
const ctx = { index, area: a2, focus: {}, rnd: rng(11), session: new Set(), day };
for (let k = 0; k < 20; k++) {
  const p = L.selectNext({ ...ctx, mode: 'standard' });
  ok(p && p.rated && Math.abs(p.rating - 1400) <= 300, 'Standard im Bereich');
}
const w = L.selectNext({ ...ctx, mode: 'warmup' });
ok(w.moves.length <= 4 && w.rating <= 1250, 'Aufwärmen leicht und kurz: ' + w.rating);
ok(L.selectNext({ ...ctx, mode: 'calc' }).themes.some(t => L.CALC_THEMES.includes(t)), 'Rechnen lang');
const rush0 = L.selectNext({ ...ctx, mode: 'rush', rushLevel: 0 }), rush10 = L.selectNext({ ...ctx, mode: 'rush', rushLevel: 10 });
ok(!rush0.rated && rush10.rating > rush0.rating, 'Rush steigt: ' + rush0.rating + ' → ' + rush10.rating);
ok(L.selectNext({ ...ctx, mode: 'repeat' }) === null, 'nichts fällig');
a2.cards['07l35'] = L.srsFail(null, '2026-10-20');
a2.cards['my:g1_27'] = L.srsFail(null, '2026-10-25');
const rep = L.selectNext({ ...ctx, mode: 'repeat', own });
ok(rep.key === '07l35' && rep.repeat && !rep.rated, 'Wiederholung: älteste zuerst');
ok(L.selectNext({ ...ctx, mode: 'own', own }).key === 'my:g1_27', 'eigene: fällige zuerst');
ok(L.selectNext({ ...ctx, mode: 'main', counter: 3, own }).repeat, 'Hauptblock mischt Wiederholung ein');
ok(!L.selectNext({ ...ctx, mode: 'main', counter: 2, own }).repeat, 'sonst frische Aufgabe');
ok(!L.seenSet(a2).has('s1') && L.seenSet(a2).has('07l35'), 'seenSet');
eq(L.ownOpenCount(a2, own, day), 1, 'offene eigene Aufgaben');

// --- PuzzleRun: Lichess-Ablauf ---
let run = new L.PuzzleRun(L.puzzleFromRow(ROWS[1]));   // Weiß am Zug in FEN → Nutzer spielt Schwarz
eq(run.userColor, 'b', 'Nutzer spielt die Gegenfarbe der FEN');
eq(run.play('e6e1').result, 'invalid', 'vor dem Gegnerzug kein Zug');
eq(run.playOpening(), 'd4d5', 'Gegnerzug zuerst');
eq(run.userStep, 0, 'erster eigener Zug');
eq(run.play('e6d5').result, 'wrong', 'falscher Zug');
let pr = run.play('e6e1');
eq([pr.result, pr.reply, pr.done], ['correct', 'd1e1', false], 'richtiger Zug mit Antwort');
pr = run.play('e8e1');
eq([pr.result, pr.done], ['correct', true], 'Lösung fertig');
ok(run.chess.isCheckmate(), 'Matt am Ende');
eq(run.play('a6a5').result, 'invalid', 'nach Ende keine Züge');

// alternativer Mattzug: Grundreihe mit zwei Matts in 1 (Te8# und Td8#)
const alt = { key: 'alt', id: 'alt', source: 'lichess', fen: '6k1/p4ppp/8/8/8/8/8/3RR1K1 b - - 0 1', moves: ['a7a6', 'e1e8'], rating: 800, themes: ['mateIn1'] };
run = new L.PuzzleRun(alt);
run.playOpening();
pr = run.play('d1d8');
eq([pr.result, pr.done, run.altMove], ['mate', true, 'd1d8'], 'anderer Mattzug zählt');
run = new L.PuzzleRun(alt);
run.playOpening();
eq(run.play('e1e8').result, 'correct', 'gespeicherter Mattzug');
run = new L.PuzzleRun(alt); run.playOpening();
eq(run.play('d1d7').result, 'wrong', 'Nicht-Matt ist falsch');

// eigene Aufgabe: Nutzer sofort am Zug
run = new L.PuzzleRun(own[0]);
ok(!run.waitingForOpponent && run.userColor === 'b', 'eigene Aufgabe: sofort am Zug');
pr = run.play('e4g5');
eq([pr.result, pr.reply, run.isLastUserMove], ['correct', 'f3g5', true], 'eigene Aufgabe Schritt 1');
run.acceptAlternative('f6e6');
ok(run.done && run.altMove === 'f6e6', 'gleichwertiger Zug angenommen');

// Lösung zeigen und Nachspielen
run = new L.PuzzleRun(L.puzzleFromRow(ROWS[0]));
run.playOpening();
eq(run.reveal(), ['d6f7', 'c7f7'], 'reveal Schritt 1');
eq(run.reveal(), ['d2d8', 'f7f8'], 'reveal Schritt 2');
eq(run.reveal(), ['d8f8'], 'reveal letzter Zug');
ok(run.done, 'reveal beendet');
const sol = run.solution();
eq([sol.sans.length, sol.fens.length, sol.startPly], [6, 7, 83], 'Lösung zum Nachspielen');
eq(sol.sans[sol.sans.length - 1], 'Qxf8#', 'SAN der Lösung');
eq(L.sanOf(ROWS[1][1], 'd4d5'), 'd5', 'sanOf');
eq(L.plyOfFen('8/8/8/8/8/8/8/K6k w - - 0 1'), 0, 'plyOfFen');

// Promotion-Zug und Rochade in der Lösung
run = new L.PuzzleRun({ key: 'p', source: 'own', fen: '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', moves: ['e7e8q'], themes: [] });
eq(run.play('e7e8n').result, 'wrong', 'falsche Umwandlung');
eq(run.play('e7e8q').result, 'correct', 'richtige Umwandlung');

print(`${passes} ok, ${fails} Fehler`);
if (fails) throw new Error(`${fails} Tests fehlgeschlagen`);
