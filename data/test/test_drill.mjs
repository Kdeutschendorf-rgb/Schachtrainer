// Weichen-Training, Lerntiefe, Partie-Check und Baum mit dem echten Repertoire.
// jsc -m data/test/test_drill.mjs
import * as L from '../../app/js/openings/logic.js';
import { review, newCard } from '../../app/js/srs.js';

const ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/data\/test\/[^/]*$/, ''));
const files = [
  { name: 'w', side: 'w', json: JSON.parse(read(ROOT + 'app/data/repertoire_white.json')) },
  { name: 'b', side: 'b', json: JSON.parse(read(ROOT + 'app/data/repertoire_black.json')) },
];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; print('FEHLER: ' + m); } };

const full = L.buildModel(files);
const short = L.buildModel(files, { maxPlies: 16 });
ok(!full.errors.length && !short.errors.length, 'keine Fehler ' + full.errors.concat(short.errors).join('; '));
ok(short.lines.every(l => l.plies.length <= 16), 'Lerntiefe 8 Züge');
ok(short.keys.size < full.keys.size, `weniger Karten bei Tiefe 8 (${short.keys.size} statt ${full.keys.size})`);
print(`Linien ${full.lines.length} → ${short.lines.length}, Karten ${full.keys.size} → ${short.keys.size}`);

const items = short.items;
const br = items.filter(i => i.branch);
ok(items.length > 50 && br.length > 10, `Stellungen ${items.length}, davon Weichen ${br.length}`);
ok(items.every(i => !i.parent || i.parent.fen), 'Elternstellung vorhanden');

// London: nach 2.Lf4 c5 hat Weiß mehrere Fortsetzungen
const lon = items.find(i => i.side === 'b' && i.parent?.san === 'e3' && i.san === 'Nc6');
ok(lon, 'London-Stellung nach 3.e3');
const tab = L.branchTable(short, 'b', lon.parent.fen);
ok(tab.length >= 1, 'Weichentabelle: ' + JSON.stringify(tab));
print('Nach 1.d4 d5 2.Lf4 c5: ' + JSON.stringify(L.branchTable(short, 'b', items.find(i => i.san === 'c5' && i.parent?.san === 'Bf4').fen)));

// Fällige Karten → Warteschlange
const prog = { cards: {} };
for (const i of items.slice(0, 30)) prog.cards[i.key] = review(newCard(), 2, '2026-11-01');
const due = L.drillQueue(short, prog, { mode: 'due', day: '2026-11-07', seed: 3 });
ok(due.length === new Set(items.slice(0, 30).map(i => i.key)).size, 'alle fälligen Karten in der Warteschlange: ' + due.length);
const brq = L.drillQueue(short, prog, { mode: 'branches', limit: 6, seed: 3 });
ok(brq.every(i => i.branch && prog.cards[i.key]), 'Weichen nur aus bekannten Karten');

// Partie-Check
const g1 = L.followGame(short, 'b', ['d4', 'e5', 'c3', 'exd4']);
ok(g1.kind === 'ich' && g1.played === 'e5' && g1.expected.includes('d5'), 'Englund erkannt: ' + JSON.stringify(g1));
const g2 = L.followGame(short, 'b', ['d4', 'd5', 'g3', 'Nf6']);
ok(g2.kind === 'gegner' && g2.played === 'g3' && g2.plies === 2, 'Gegner abgewichen: ' + JSON.stringify(g2));
const g3 = L.followGame(short, 'w', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
ok(g3.plies >= 5, 'Italienisch im Repertoire: ' + JSON.stringify(g3));

// Baum
const ch = short.chapters.find(c => c.id === 'b-london');
const trie = L.chapterTrie(ch);
ok(trie.children.length === 1 && trie.children[0].san === 'd4', 'Baum beginnt mit 1.d4');
print(`${pass} bestanden, ${fail} fehlgeschlagen`);
