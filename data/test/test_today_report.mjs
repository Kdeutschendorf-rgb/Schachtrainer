// Rauchtest für Heute, Bericht und Coach mit Schein-DOM (jsc, kein Browser):
// /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m data/test/test_today_report.mjs
import { install, tick, findButton, Element } from './fake_dom.mjs';

const ROOT = '/Users/keanudeutschendorf/Schachtrainer/';
const fetchMap = {
  'data/analysis_summary.json': ROOT + 'app/data/analysis_summary.json',
  'data/my_puzzles.json': ROOT + 'app/data/my_puzzles.json',
  'data/puzzles.json': ROOT + 'app/data/puzzles.json',
  'data/openings_catalog.json': ROOT + 'app/data/openings_catalog.json',
  'data/lichess_openings.json': ROOT + 'app/data/lichess_openings.json',
};
const doc = install({ fetchMap, engine: () => ({ lines: [{ score: { cp: 20 }, pv: ['e2e4'], san: ['e4'], depth: 10 }], bestmove: 'e2e4' }) });

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; print('FEHLER: ' + m); } };
function noJunk(el, where) {
  // ohne \b: Textmüll klebt oft direkt am Nachbartext („Tage in Folgenull“)
  const m = el.textContent.match(/.{0,40}(null|undefined|NaN|Infinity).{0,20}/);
  ok(!m, `${where}: Textmüll: ${m && m[0]}`);
}
function container() { const el = new Element('main'); doc.body.append(el); return el; }

const store = await import('../../app/js/store.js');
await store.init();
const coach = await import('../../app/js/coach.js');
const today = await import('../../app/js/views/today.js');

// --- Coach ---
ok(coach.TIPS.length >= 40, 'mindestens 40 Tipps');
const t1 = coach.tipOfTheDay({ date: '2026-10-30' });
ok(typeof t1 === 'string' && t1.length > 10, 'Tipp des Tages');
ok(coach.tipOfTheDay({ date: '2026-10-30' }) === t1, 'Tipp stabil pro Tag');
ok(coach.tipOfTheDay({ date: '2026-10-31' }) !== t1, 'nicht zwei Tage derselbe Tipp');
const ex = coach.explainMove({
  fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  played: 'f6', best: 'Nc6', refutation: ['Nxe5', 'fxe5', 'Qh5+'], drop: 25,
});
ok(ex[0] === 'f6 ist ein Fehler.', 'explainMove Grammatik: ' + ex[0]);
print('  explainMove: ' + ex.join(' '));

// --- Plan ---
const plan = today.computePlan({ dailyMinutes: 30, day: '2026-10-30', ownPuzzles: 10 });
ok(plan.total === 30, 'Plan 30 Minuten: ' + plan.total);
ok(plan.blocks.map(b => b.minutes).join() === '4,10,9,5,2', 'Standardplan 4/10/9/5/2: ' + plan.blocks.map(b => b.minutes).join());
for (const dm of [10, 15, 20, 45, 60]) {
  const p = today.computePlan({ dailyMinutes: dm, dueCards: 90, focus: { phases: { eroeffnung: 0.5, mittelspiel: 0.7, endspiel: 0.3 } }, ownPuzzles: 5 });
  ok(p.total === dm, `Plan ${dm} min ergibt ${p.total}`);
  ok(p.blocks.every(b => b.minutes >= 1), `jeder Block ≥ 1 min bei ${dm}`);
}
const busy = today.computePlan({ dailyMinutes: 30, dueCards: 60 });
ok(busy.blocks.find(b => b.id === 'openings').minutes > 10, 'viele fällige Karten → mehr Eröffnung');
const days = new Set([0, 1, 2, 3].map(i => today.computePlan({ day: `2026-11-0${i + 1}`, ownPuzzles: 5 }).blocks.at(-1).module));
ok(days.size === 2, 'Abschluss wechselt täglich: ' + [...days]);
ok(today.computePlan({ day: '2026-11-02', ownPuzzles: 0 }).blocks.at(-1).module === 'endgames', 'ohne eigene Aufgaben → Endspiel');
ok(today.countersFor('openings', { openingReviews: 5, openingQuiz: 2, openingCorrect: 4, openingQuizRight: 1 }).done === 7, 'countersFor');

// --- Heute: Startseite ---
const el = container();
const unmount = await today.mount(el, {});
await tick(10);
ok(el.textContent.includes('Training starten'), 'Startknopf');
ok(el.textContent.includes('1141'), 'Rapid-Elo angezeigt');
ok(el.textContent.includes('Ziel 1300'), 'Standardziel 1300');
noJunk(el, 'Heute');
findButton(el, 'Plan anpassen').click();
ok(el.textContent.includes('Trainingszeit pro Tag'), 'Einstellungen offen');
noJunk(el, 'Einstellungen');

// --- Ablauf: alle Blöcke überspringen ---
findButton(el, 'Training starten').click();
await tick(300);
ok(el.textContent.includes('Block überspringen'), 'Ablauf gestartet');
for (let i = 0; i < 6; i++) {
  const b = findButton(el, 'Block überspringen');
  if (!b || el.textContent.includes('Training beendet') || el.textContent.includes('Geschafft')) break;
  b.click();
  await tick(400);
  const w = findButton(el, 'Weiter');           // Hinweis „nicht verfügbar“ (Modul fehlt)
  if (w && el.textContent.includes('nicht verfügbar')) { w.click(); await tick(300); }
}
const sumText = el.textContent;
ok(sumText.includes('Geschafft') || sumText.includes('Training beendet'), 'Zusammenfassung erreicht');
ok(sumText.includes('Coach-Tipp'), 'Coach-Tipp am Ende');
noJunk(el, 'Zusammenfassung');
unmount?.();

// --- Bericht ---
// Etwas Fortschritt simulieren
store.logActivity({ minutes: 12, puzzles: 8, puzzlesSolved: 6, openingReviews: 10, openingCorrect: 8 }, '2026-10-29');
store.logActivity({ minutes: 31, puzzles: 5, puzzlesSolved: 3 }, '2026-10-30');
store.update('tactics', d => { d.rating = 1350; d.rd = 80; d.history = [['a', 1, '2026-10-28', 1320, 10], ['b', 0, '2026-10-29', 1310, 20], ['c', 1, '2026-10-30', 1350, 12]]; });
store.update('openings', d => { d.cards = { x: { due: '2026-10-29', reps: 1, last: '2026-10-28' }, y: { due: '2030-01-01', reps: 2, last: '2026-10-28' } }; d.learnedLines = { l1: '2026-10-28' }; });
const report = await import('../../app/js/views/report.js');
const el2 = container();
const unmount2 = await report.mount(el2, {});
await tick(10);
const txt = el2.textContent;
for (const s of ['Elo-Verlauf', 'Dein Training', 'Ergebnisse nach Eröffnung', 'Repertoire-Abdeckung', 'Deine Fehler', 'Genauigkeit über die Zeit', 'Zeitverluste', 'Entwicklung', 'Neue Partien von chess.com holen']) {
  ok(txt.includes(s), 'Bericht enthält ' + s);
}
ok(el2.querySelectorAll('svg').length >= 3, 'mindestens 3 SVG-Diagramme: ' + el2.querySelectorAll('svg').length);
ok(el2.querySelectorAll('path').length >= 3, 'Linien gezeichnet');
noJunk(el2, 'Bericht');
// Legende: Rapid ausblenden und Zeitraum wechseln
const leg = el2.querySelectorAll('.rp-leg').find(b => b.tagName === 'BUTTON');
leg.click();
findButton(el2, '30 Tage').click();
findButton(el2, 'Alle Partien').click();
noJunk(el2, 'Bericht nach Umschalten');
// Tooltip
const hit = el2.querySelectorAll('rect').find(r => r.getAttribute('class') === 'rp-hit');
hit.dispatch('pointermove', { clientX: 200, clientY: 100 });
const tip = el2.querySelector('.rp-tip');
ok(tip && !tip.hidden && tip.textContent.length > 5, 'Tooltip erscheint: ' + tip?.textContent);
noJunk(tip, 'Tooltip');
unmount2?.();

// Bericht mit Coach-Report und ohne Analyse
fetchMap['data/coach_report.json'] = ROOT + 'data/test/coach_report_test.json';
const el3 = container();
await report.mount(el3, {});
await tick(10);
ok(el3.textContent.includes('Coach-Auswertung'), 'Coach-Report oben');
noJunk(el3, 'Bericht mit Coach-Report');

print(`${passes} ok, ${fails} Fehler`);
