// Lernstufen, Bot-Eröffnungsbuch, Endspiel-Varianten, Rechen-Stufen, Zielverfolgung. jsc -m data/test/test_stages.mjs
import * as L from '../../app/js/openings/logic.js';
import { bookMove } from '../../app/js/play/book.js';
import { variantOf, mirrorFen, swapColorsFen } from '../../app/js/vision/endgame.js';
import { CALC_LEVELS, candLabel } from '../../app/js/vision/logic.js';
import { Chess } from '../../app/vendor/chess.js';

const ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/data\/test\/[^/]*$/, ''));
const load = f => JSON.parse(read(ROOT + f));
const model = L.buildModel([
  { name: 'w', side: 'w', json: load('app/data/repertoire_white.json') },
  { name: 'b', side: 'b', json: load('app/data/repertoire_black.json') },
], { maxPlies: 16 });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; print('FEHLER: ' + m); } };

// Stufen
ok(L.nextStage(1, {}) === 2, 'sauber → nächste Stufe');
ok(L.nextStage(1, { mistakes: 3 }) === 1, 'Stufe 1 fällt nicht');
ok(L.nextStage(3, { mistakes: 1 }) === 3, 'ein Fehler: bleibt');
ok(L.nextStage(4, { mistakes: 2 }) === 3, 'zwei Fehler: zurück');
ok(L.nextStage(5, { sparOk: true }) === 5 && L.nextStage(5, { mistakes: 2 }) === 4, 'Stufe 5');
ok(L.nextStage(2, { hinted: true }) === 2, 'mit Hinweis nicht sauber');
const line = model.lineById.get('b-lon-qc2-e5');
ok(L.lineStage(line, {}) === 1 && L.lineStage(line, { learnedLines: { [line.id]: 'x' } }) === 3 && L.lineStage(line, { stages: { [line.id]: 5 } }) === 5, 'lineStage');

// Was greift der Zug an? 5.Db3 greift in der London-Linie die Dame b6 an (gedeckt, aber wertvoll genug? gleichwertig)
const qb3 = line.plies.find(p => p.san === 'Qb3');
ok(Array.isArray(L.attackedBy(qb3.fenAfter, qb3)), 'attackedBy liefert Liste');
const e4 = { to: 'e4', color: 'w' };
ok(L.attackedBy('4k3/8/8/3q4/4P3/8/8/4K3 b - - 0 1', e4).join() === 'd5', 'Bauer greift Dame an');
ok(L.attackedBy('4k3/8/2p5/3p4/4P3/8/8/4K3 b - - 0 1', e4).length === 0, 'gedeckter Bauer zählt nicht');

// Weichen einer Linie
ok(L.lineBranches(model, line).length >= 2, 'Weichen gefunden: ' + L.lineBranches(model, line).length);

// Eröffnungsbuch
let c = new Chess();
ok(bookMove(model, 'b', c.fen(), { chapterId: 'b-london', rnd: () => 0 }) === 'd4', 'Bot spielt London: 1.d4');
c.move('d4'); c.move('d5');
const seen = new Set();
for (let i = 0; i < 200; i++) seen.add(bookMove(model, 'b', c.fen(), { chapterId: 'b-london' }));
ok(seen.has('Bf4') && seen.has('Nf3') && seen.size === 2, 'Bot wechselt Varianten: ' + [...seen]);
c = new Chess(); c.move('e4');
ok(bookMove(model, 'w', c.fen(), {}) != null, 'Bot antwortet aus dem Repertoire');
c.move('a5'); c.move('h4');
ok(bookMove(model, 'w', c.fen(), {}) === null, 'außerhalb des Buchs: null');

// Endspiel-Varianten: legal, gleiches Material
const eg = load('app/data/endgames.json');
const list = Array.isArray(eg) ? eg : eg.positions;
const count = fen => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
for (const p of list) {
  for (let i = 0; i < 25; i++) {
    const v = variantOf(p);
    let good = true;
    try { const g = new Chess(v.fen); good = !g.isGameOver() && g.turn() === v.side; } catch { good = false; }
    ok(good, `${p.id}: Variante gültig ${v.fen} (${v.side})`);
    ok(count(v.fen) === count(p.fen), `${p.id}: Material`);
  }
}
ok(mirrorFen('8/8/8/4k3/8/8/8/R3K3 w - - 0 1') === '8/8/8/3k4/8/8/8/3K3R w - - 0 1', 'spiegeln');
ok(swapColorsFen('8/8/8/4k3/8/8/8/R3K3 w - - 0 1') === 'r3k3/8/8/8/4K3/8/8/8 b - - 0 1', 'Farben tauschen');

// Rechnen
ok(CALC_LEVELS.length === 21 && CALC_LEVELS.slice(1).every(c => c.n >= 1), '20 Stufen');
ok(candLabel(2).text === 'bester Zug' && candLabel(30).text === 'Patzer', 'Kandidaten-Einstufung');
print(`${pass} bestanden, ${fail} fehlgeschlagen`);
