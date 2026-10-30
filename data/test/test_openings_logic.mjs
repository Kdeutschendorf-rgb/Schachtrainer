// Test der Eröffnungslogik ohne Browser:
// /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m data/test/test_openings_logic.mjs
import * as L from '../../app/js/openings/logic.js';
import { addDays } from '../../app/js/srs.js';

const DIR = '/Users/keanudeutschendorf/Schachtrainer/data/test/';
const white = JSON.parse(read(DIR + 'repertoire_test.json'));
const black = JSON.parse(read(DIR + 'repertoire_test_black.json'));
const lichess = JSON.parse(read(DIR + 'lichess_test.json'));

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { fails++; print('FEHLER: ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); }

// --- Schlüssel ---
eq(L.fenKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'fenKey');
eq(L.cardKey('8/8/8/8/8/8/8/K6k w - - 12 40', 'Ka2'), '8/8/8/8/8/8/8/K6k w - -|Ka2', 'cardKey');
eq(L.splitCardKey('8/8/8/8/8/8/8/K6k w - -|Ka2').san, 'Ka2', 'splitCardKey');

// --- Modell ---
const model = L.buildModel([
  { name: 'repertoire_white.json', side: 'w', json: white },
  { name: 'repertoire_black.json', side: 'b', json: black },
  { name: 'fehlt.json', side: 'w', json: null },
]);
eq(model.missing, ['fehlt.json'], 'fehlende Datei gemeldet');
ok(model.errors.some(e => e.startsWith('t-broken')), 'kaputte Linie erkannt: ' + model.errors.join('; '));
ok(!model.lineById.has('t-broken'), 'kaputte Linie nicht im Modell');
eq(model.lines.length, 8, 'Anzahl gültiger Linien');
eq(model.chapters.length, 3, 'Kapitel');

const main = model.lineById.get('t-it-main');
eq(main.ownKeys.length, 6, 'eigene Züge Italienisch (e4 Nf3 Bc4 c3 d3 O-O)');
eq(main.plies[4].note, 'Lc4 zielt auf f7.', 'Note an Halbzug 4');
ok(main.plies[0].own && !main.plies[1].own, 'eigen/gegnerisch bei Weiß');

// Geteilte Karten: e4, Sf3, Lc4 sind in allen drei Italienisch-Linien gleich
const it2 = model.lineById.get('t-it-2nf6');
eq(it2.ownKeys.slice(0, 3), main.ownKeys.slice(0, 3), 'gemeinsamer Anfang → gleiche Karten');
ok(model.keyLines.get(main.ownKeys[2]).length === 3, 'Karte Lc4 gehört zu 3 Linien');

// Zugumstellung bei Schwarz: tb-qgd-2 und tb-qgd-3 enden in derselben Stellung mit Le7
const q2 = model.lineById.get('tb-qgd-2'), q3 = model.lineById.get('tb-qgd-3');
eq(q2.ownKeys[q2.ownKeys.length - 1], q3.ownKeys[q3.ownKeys.length - 1], 'Zugumstellung teilt Karte Le7');
ok(q2.plies[1].own && !q2.plies[0].own, 'eigen/gegnerisch bei Schwarz');

// Baum
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
eq(L.ownMovesAt(model, 'w', start).map(m => m.san), ['e4'], 'Mein Zug in der Grundstellung');
const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
eq(L.treeNode(model, 'w', afterE4).moves.map(m => m.san).sort(), ['d5', 'e5'], 'Gegnerzüge nach 1.e4');
const afterBc4 = main.plies[5].fenBefore;
eq(L.treeNode(model, 'w', afterBc4).moves.map(m => m.san).sort(), ['Bc5', 'Nd4', 'Nf6'], 'Antworten nach 3.Lc4');
ok(L.treeNode(model, 'w', main.plies[main.plies.length - 1].fenAfter), 'Endstellung im Baum');

// Widerspruch: nach 1.d4 d5 2.c4 spielt Schwarz in einer Linie e6, in einer anderen c6
eq(model.conflicts.length, 1, 'ein Widerspruch erkannt');
eq(model.conflicts[0].moves.sort(), ['c6', 'e6'], 'Widerspruch e6/c6');

// --- Fortschritt, Lernen, Fälligkeit ---
const day = '2026-10-30';
const prog = L.ensureProgress({});
eq(prog.settings.newPerDay, 12, 'Standardlimit 12');

const queue = L.newLineQueue(model, prog);
eq(queue.slice(0, 2).map(l => l.id), ['t-it-main', 'tb-qgd-1'], 'Lernreihenfolge: Kern-häufig, Weiß/Schwarz abwechselnd');
eq(queue[queue.length - 1].priority, 2, 'Priorität 2 zuletzt');

let line = L.pickNewLine(model, prog, day);
eq(line.id, 't-it-main', 'erste neue Linie');
eq(L.canLearn(line, prog, day).newCards, 6, 'neue Karten der ersten Linie');
eq(L.firstNewPly(line, prog), 0, 'Vorführung von vorn');

// Nachspielen: alles richtig, ein Zug falsch (c3), einer mit Hinweis (d3), einer schnell
const results = line.plies.filter(p => p.own).map((p, i) => ({
  key: p.key,
  grade: L.gradeFor({ wrong: p.san === 'c3', hinted: p.san === 'd3', ms: i === 0 ? 1000 : 6000 }),
}));
eq(results.map(r => r.grade), [3, 2, 2, 0, 1, 2], 'Noten');
const r1 = L.applyResults(prog, results, { learnLineId: line.id, day });
eq([r1.newCards, r1.reviewed, r1.correct], [6, 0, 5], 'Ergebnis Lernen');
eq(prog.newToday, { date: day, count: 6 }, 'newToday');
eq(prog.cards[main.ownKeys[0]].due, addDays(day, 1), 'neue Karte mit Note 3 → trotzdem morgen (Deckel 2)');
const c3Key = main.plies[6].key;
eq(prog.cards[c3Key].due, day, 'falsche Karte heute wieder fällig');
ok(prog.learnedLines['t-it-main'] === day, 'Linie gelernt');

// Heute fällig: nur die c3-Karte, also genau die Linie t-it-main
let dl = L.dueLines(model, prog, day);
eq(dl.map(x => [x.line.id, x.due]), [['t-it-main', 1]], 'fällige Linien heute');
eq(L.totals(model, prog, day).due, 1, 'fällige Karten heute');

// Limit: 6 von 12 verbraucht. tb-qgd-1 hat 3 eigene Züge (d5, e6, Sf6) → ok
line = L.pickNewLine(model, prog, day);
eq(line.id, 'tb-qgd-1', 'zweite neue Linie');
eq(L.canLearn(line, prog, day), { ok: true, newCards: 3, used: 6, limit: 12, left: 6 }, 'canLearn');
L.applyResults(prog, line.plies.filter(p => p.own).map(p => ({ key: p.key, grade: 2 })), { learnLineId: line.id, day });
eq(prog.newToday.count, 9, '9 neue heute');

// t-it-2nf6: e4, Nf3, Bc4 schon bekannt → nur d3 und O-O neu. firstNewPly springt vor.
const lit2 = model.lineById.get('t-it-2nf6');
eq(L.canLearn(lit2, prog, day).newCards, 2, 'nur 2 neue Karten in Zweiglinie');
eq(L.firstNewPly(lit2, prog), 4, 'Vorführung startet kurz vor dem ersten neuen Zug');
// Limit kleiner machen: 9 + 2 > 10 → nicht erlaubt
prog.settings.newPerDay = 10;
ok(!L.canLearn(lit2, prog, day).ok, 'Limit greift');
ok(L.canLearn(lit2, prog, addDays(day, 1)).ok, 'am nächsten Tag wieder frei');
prog.settings.newPerDay = 12;

// Wiederholen: c3-Karte richtig → morgen. Nicht fällige Karte (e4) richtig → bleibt unverändert, falsch → zurückgesetzt.
const e4Before = JSON.stringify(prog.cards[main.ownKeys[0]]);
const r2 = L.applyResults(prog, main.plies.filter(p => p.own).map(p => ({ key: p.key, grade: 2 })), { day });
eq([r2.reviewed, r2.newCards], [1, 0], 'nur die fällige Karte bewertet');
eq(JSON.stringify(prog.cards[main.ownKeys[0]]), e4Before, 'nicht fällige Karte unverändert');
eq(prog.cards[c3Key].due, addDays(day, 1), 'c3 nach richtiger Wiederholung morgen fällig');
eq(L.dueLines(model, prog, day).length, 0, 'heute nichts mehr fällig');
L.applyResults(prog, [{ key: main.ownKeys[0], grade: 0 }], { day });
eq(prog.cards[main.ownKeys[0]].due, day, 'Fehler bei nicht fälliger Karte → heute wieder fällig');
eq(prog.cards[main.ownKeys[0]].lapses, 1, 'lapse gezählt');

// Morgen: alle Karten von t-it-main und tb-qgd-1 fällig. Linie mit meisten fälligen Karten zuerst.
const tomorrow = addDays(day, 1);
dl = L.dueLines(model, prog, tomorrow);
eq(dl[0].line.id, 't-it-main', 'morgen zuerst die Linie mit den meisten fälligen Karten');
// Die Zweiglinien sind nicht gelernt und haben nicht alle Karten → nicht fällig
ok(!dl.some(x => x.line.id === 't-it-2nf6'), 'ungelernte Zweiglinie nicht in Wiederholung');
eq(L.pickDueLine(model, prog, tomorrow, { side: 'b' }).id, 'tb-qgd-1', 'Filter nach Seite');

// Kapitelstatistik
const st = L.chapterStats(model.chapterById.get('t-italian'), prog, tomorrow);
eq([st.lines, st.learned, st.cards], [3, 1, 10], 'Kapitelstatistik');
const ls = L.lineStatus(lit2, prog, day);
eq([ls.learned, ls.known, ls.total, ls.newCards], [false, 3, 5, 2], 'Linienstatus');

// --- Namen und Quiz ---
const idx = L.buildNameIndex(lichess);
const fens = main.plies.map(p => p.fenAfter);
eq(L.openingNameFor(idx, fens.slice(0, 6))?.name, 'Italian Game: Giuoco Piano', 'Eröffnungsname per Stellung');
eq(L.openingNameFor(idx, fens.slice(0, 5))?.name, 'Italian Game', 'Eröffnungsname kürzer');

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pool = L.quizPool([], lichess);
for (let n = 0; n < 30; n++) {
  const q = L.makeNameQuestion(pool, rnd);
  ok(q && q.options.length === 4 && q.options[q.answer] === q.entry.name && new Set(q.options).size === 4, 'Namensfrage gültig');
  const prefixes = pool.filter(p => p.name !== q.entry.name && p.moves.every((m, i) => m === q.entry.moves[i])).map(p => p.name);
  ok(!q.options.some(n => prefixes.includes(n)), 'kein Ablenker passt auf die Stellung: ' + q.entry.name + ' / ' + q.options.join(', '));
  const m = L.makeMoveQuestion(pool, rnd);
  ok(m && m.setup.length === m.entry.moves.length - 1, 'Zugfrage gültig');
}
const mq = L.makeMoveQuestion([{ name: 'QGD', moves: ['d4', 'd5', 'c4', 'e6'], group: 'x', src: 'lichess' }], rnd);
eq(mq.expected, 'e6', 'Zugfrage: erwarteter Zug');
ok(L.checkMoveAnswer(mq, 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3'), 'Zugfrage: richtige Stellung');
ok(!L.checkMoveAnswer(mq, 'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3'), 'Zugfrage: falscher Zug');

print(`${passes} bestanden, ${fails} fehlgeschlagen`);
