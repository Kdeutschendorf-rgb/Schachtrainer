// Übungssätze aus dem Schwächenprofil: Auswahl, Satz des Tages, Einbindung in den Tagesplan.
// jsc -m data/test/test_profile.mjs
import { install, Element } from './fake_dom.mjs';
import { profileSets, setById, setOfDay, setOpenCount, setContext } from '../../app/js/tactics/sets.js';
import { nextOwn, normalizeOwn, ensureArea, recordAttempt, selectNext } from '../../app/js/tactics/logic.js';

install({ fetchMap: {} });      // today.js und der Bericht brauchen window/document
const { computePlan } = await import('../../app/js/views/today.js');
const { renderProfile } = await import('../../app/js/report/profile.js');
const { h } = await import('../../app/js/ui.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; print('FEHLER: ' + m); } };
const ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/data\/test\/[^/]*$/, ''));
const load = f => JSON.parse(read(ROOT + f));

const pz = (id, extra = {}) => ({ id, fen: 'x', moves: ['e2e4'], cls: 'blunder', tc: 'rapid', date: '2026.11.01', ...extra });
const own = normalizeOwn([pz('g1_10'), pz('g2_20', { date: '2026.11.03' }), pz('g3_30'), pz('g4_40'), pz('g5_50')]);
const profile = {
  findings: [{ title: 'B', set: 'b' }, { title: 'ohne Satz', set: null }, { title: 'A', set: 'a' }],
  sets: [
    { id: 'a', title: 'Satz A', rule: 'Regel A', puzzles: ['g1_10', 'g2_20'], n: 2 },
    { id: 'b', title: 'Satz B', rule: 'Regel B', puzzles: ['g3_30', 'weg_1'], n: 2 },
    { id: 'leer', title: 'leer', puzzles: [] },
  ],
};
const day = '2026-11-10';

// Reihenfolge wie die Befunde, leere Sätze fallen weg
ok(profileSets(profile).map(s => s.id).join() === 'b,a', 'Sätze nach Befund sortiert: ' + profileSets(profile).map(s => s.id));
ok(setById(profile, 'a')?.title === 'Satz A' && setById(profile, 'x') === null && setById(null, 'a') === null, 'setById');
ok(profileSets(null).length === 0 && setOfDay(null, {}, own, day) === null, 'ohne Profil: nichts');

// Auswahl nur aus dem Satz, neueste zuerst, Merksatz hängt an der Aufgabe
let area = ensureArea({});
const session = new Set();
const ctx = extra => ({ own, area, session, day, mode: 'own', ...extra });
let p = nextOwn(ctx(setContext(setById(profile, 'a'))));
ok(p?.id === 'g2_20' && p.set?.rule === 'Regel A' && p.rated === false, 'erste Aufgabe aus Satz A mit Merksatz: ' + p?.id);
ok(selectNext(ctx(setContext(setById(profile, 'a'))))?.id === 'g2_20', 'selectNext reicht den Satz durch');
ok(!nextOwn(ctx()).set, 'ohne Satz kein Merksatz');
ok(setOpenCount(setById(profile, 'b'), area, own, day) === 1, 'Aufgaben, die es nicht mehr gibt, zählen nicht');
ok(setOpenCount(setById(profile, 'b'), area, null, day) === 2, 'ohne Aufgabenliste zählen alle (Startseite)');

// Gelöst → nicht mehr offen; falsch → Wiederholungskarte, am nächsten Tag wieder offen
const tomorrow = '2026-11-11';
recordAttempt(area, { puzzle: p, ok: true, day });
session.add(p.key);
p = nextOwn(ctx(setContext(setById(profile, 'a'))));
ok(p?.id === 'g1_10', 'zweite Aufgabe des Satzes');
recordAttempt(area, { puzzle: p, ok: false, day });
session.clear();
ok(setOpenCount(setById(profile, 'a'), area, own, day) === 0, 'heute ist der Satz durch');
ok(nextOwn(ctx(setContext(setById(profile, 'a')))) === null, 'Satz durch: im Tagesplan kommt nichts mehr daraus');
ok(setOpenCount(setById(profile, 'a'), area, own, tomorrow) === 1, 'falsch gelöst: morgen wieder offen');
p = nextOwn(ctx({ ...setContext(setById(profile, 'a')), day: tomorrow }));
ok(p?.id === 'g1_10' && p.repeat === true && p.set?.title === 'Satz A', 'fällige Wiederholung kommt aus dem Satz, mit Merksatz');
ok(nextOwn(ctx({ ...setContext(setById(profile, 'b')), day: tomorrow }))?.id === 'g3_30', 'fällige Karte aus Satz A stört Satz B nicht');

// Freies Üben (setAgain): Ist nichts mehr offen, beginnt der Satz von vorn, ohne die Wiederholungskarten zu ändern
const again = nextOwn(ctx(setContext(setById(profile, 'a'), { setAgain: true })));
ok(again && again.again === true && again.id === 'g2_20', 'freies Üben: schon gelöste Aufgabe kommt noch einmal: ' + again?.id);
const cardsBefore = JSON.stringify(area.cards);
recordAttempt(area, { puzzle: again, ok: true, repeat: again.repeat, day });
ok(JSON.stringify(area.cards) === cardsBefore, 'noch einmal gelöst: Karten unverändert');

// Satz des Tages: wechselt täglich, überspringt Sätze ohne offene Aufgaben
area = ensureArea({});
const d1 = setOfDay(profile, area, own, '2026-11-10')?.id, d2 = setOfDay(profile, area, own, '2026-11-11')?.id;
ok(d1 && d2 && d1 !== d2, `Satz des Tages wechselt: ${d1} → ${d2}`);
area.ownSeen = { g3_30: 1 };       // Satz B erledigt
ok(setOfDay(profile, area, own, '2026-11-10')?.id === 'a' && setOfDay(profile, area, own, '2026-11-11')?.id === 'a', 'erledigter Satz wird übersprungen');
area.ownSeen = { g3_30: 1, g1_10: 1, g2_20: 1 };
ok(setOfDay(profile, area, own, '2026-11-10') === null, 'alles erledigt: kein Satz des Tages');

// Tagesplan nennt den Satz
let plan = computePlan({ day: '2026-11-10', ownPuzzles: 5, ownSet: 'Drohung zuerst' });
ok(plan.blocks.find(b => b.id === 'tactics').why.includes('„Drohung zuerst“'), 'Taktik-Block nennt den Übungssatz');
plan = computePlan({ day: '2026-11-10', ownPuzzles: 5 });
ok(!plan.blocks.find(b => b.id === 'tactics').why.includes('undefined') && plan.blocks.find(b => b.id === 'tactics').why.startsWith('Gewertet'), 'ohne Profil wie bisher');
const own2 = [10, 11].map(i => computePlan({ day: `2026-11-${i}`, ownPuzzles: 5, ownSet: 'Zielfeld prüfen' }).blocks.find(b => b.id === 'finish')).find(b => b.mode === 'own');
ok(own2 && own2.why.includes('Zielfeld prüfen'), 'Abschluss „eigene Fehler“ nennt den Übungssatz');

// Das echte Profil: jeder Satz verweist nur auf vorhandene eigene Aufgaben, jeder Befund mit Satz findet ihn
const real = load('app/data/players/keanu098/weakness_profile.json');
const realOwn = new Set(load('app/data/players/keanu098/my_puzzles.json').map(x => x.id));
ok(real.findings.length >= 5 && real.sets.length >= 4, `echtes Profil: ${real.findings.length} Befunde, ${real.sets.length} Sätze`);
for (const s of real.sets) {
  ok(s.puzzles.length >= 6 && s.puzzles.every(id => realOwn.has(id)), `Satz ${s.id}: alle ${s.puzzles.length} Aufgaben vorhanden`);
  ok(s.title && typeof s.rule === 'string', `Satz ${s.id}: Titel und Merksatz`);
}
for (const f of real.findings) {
  ok(!f.set || real.sets.some(s => s.id === f.set), `Befund „${f.title}“ verweist auf vorhandenen Satz`);
  ok(f.text && !/None|null|undefined|NaN/.test(f.text + f.rule), `Befund „${f.title}“: Text ohne Platzhalter`);
}

// Abschnitt im Bericht: rendert mit dem echten Profil, ohne Platzhalter, mit Knöpfen zu den Sätzen
const sec = renderProfile(real, (id, title, ...body) => h('section', { id: 'rp-' + id }, h('h2', title), ...body));
const text = sec.textContent;
ok(sec.getAttribute('id') === 'rp-profil' && text.includes('Schwächenprofil'), 'Berichtsabschnitt vorhanden');
ok(!/\b(null|undefined|NaN)\b/.test(text), 'Bericht ohne Platzhalter: ' + (text.match(/.{0,30}\b(null|undefined|NaN)\b.{0,20}/) || [''])[0]);
ok(text.includes('Merksatz') && text.includes('Üben ('), 'Bericht zeigt Merksätze und Übungsknöpfe');
ok(renderProfile(null, () => null) === null && renderProfile({ findings: [] }, () => null) === null, 'ohne Profil kein Abschnitt');

print(`${pass} bestanden, ${fail} fehlgeschlagen`);
