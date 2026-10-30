// Rauchtest der Eröffnungs-UI mit Schein-DOM (jsc, kein Browser):
// /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m data/test/test_openings_ui.mjs
import { install, tick, findButton, Element } from './fake_dom.mjs';

const DIR = '/Users/keanudeutschendorf/Schachtrainer/data/test/';
const fetchMap = {
    'data/repertoire_white.json': DIR + 'repertoire_test.json',
    'data/repertoire_black.json': DIR + 'repertoire_test_black.json',
    'data/lichess_openings.json': DIR + 'lichess_test.json',
    // openings_catalog.json fehlt zunächst absichtlich
};
const doc = install({
  fetchMap,
  engine: body => body.elo
    ? { lines: [], bestmove: null }
    : { lines: [{ score: { cp: 35 }, pv: ['g1f3', 'b8c6'], san: ['Nf3', 'Nc6'], depth: 18 }], bestmove: 'g1f3' },
});

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; print('FEHLER: ' + m); } };

const store = await import('../../app/js/store.js');
await store.init();
const view = await import('../../app/js/views/openings.js');
const { createLineTrainer } = await import('../../app/js/openings/trainer.js');
const { loadModel } = await import('../../app/js/openings/data.js');

// Kein „null“/„undefined“/„NaN“ im sichtbaren Text
function noJunk(el) {
  const m = el.textContent.match(/.{0,40}\b(null|undefined|NaN)\b.{0,20}/);
  ok(!m, 'Textmüll: ' + (m && m[0]));
}
function container() {
  const el = new Element('main');
  doc.body.append(el);
  return el;
}
// Nutzerzug simulieren: so, als hätte Chessground ihn ausgeführt
function userMove(board, uci) {
  board.cg.state.movable.events.after(uci.slice(0, 2), uci.slice(2, 4));
}

// ---------- Übersicht ----------
let el = container();
let cleanup = await view.mount(el, {});
ok(el.textContent.includes('Italienisch (Test)'), 'Übersicht zeigt Kapitel');
ok(el.textContent.includes('Repertoire Schwarz'), 'Übersicht zeigt Schwarz');
ok(el.textContent.includes('Widerspruch'), 'Übersicht meldet Widerspruch');
ok(el.textContent.includes('Linie(n) mit Fehlern'), 'Übersicht meldet kaputte Linie');
noJunk(el); cleanup(); el.remove();

// ---------- Lernen: Vorführung, dann nachspielen ----------
const model = await loadModel();
const line = model.lineById.get('t-it-main');
el = container();
let finished = null;
let t = createLineTrainer(el, { model, line, mode: 'learn', onFinish: r => (finished = r), actions: () => [{ label: 'Weiter', primary: true, onClick: () => {} }] });
ok(el.textContent.includes('Schau zu'), 'Demo startet');
for (let i = 0; i < line.plies.length; i++) doc.key(' ');
ok(el.textContent.includes('Ende der Linie'), 'Demo am Ende');
ok(t.board.history().length === line.plies.length, 'Brett zeigt ganze Linie');
doc.key('Enter');
ok(t.board.history().length === 0, 'Nachspielen von vorn');
// Eigene Züge: e4 … falsch bei c3 (spiele d3), dann richtig
for (const p of line.plies) {
  if (!p.own) { await tick(450); continue; }
  if (p.san === 'c3') {
    userMove(t.board, 'd2d4');
    await tick(5);
    ok(t.board.history().length === p.i, 'falscher Zug zurückgenommen');
    ok(el.textContent.includes('nicht dein Repertoirezug'), 'Fehlermeldung');
    ok(t.board.cg.state.drawable.autoShapes.some(s => s.orig === 'c2' && s.dest === 'c3'), 'Pfeil zum richtigen Zug');
  }
  userMove(t.board, p.uci);
  await tick(5);
}
await tick(450);
ok(finished && finished.total === 6 && finished.correct === 5, 'Ergebnis 5/6: ' + JSON.stringify(finished && { t: finished.total, c: finished.correct }));
const prog = store.get('openings');
ok(Object.keys(prog.cards).length === 6, 'sechs Karten angelegt');
ok(prog.learnedLines['t-it-main'], 'Linie gelernt');
ok(prog.newToday.count === 6, 'newToday = 6');
ok(store.all().activity[Object.keys(store.all().activity)[0]].openingNew === 6, 'Aktivität geloggt');
ok(el.textContent.includes('Hier hakte es'), 'Fehlerliste angezeigt');
t.destroy();
ok(doc.listenerCount('keydown') === 0, 'Tastatur abgemeldet');
el.remove();

// ---------- Wiederholen: die falsche Karte (c3) ist heute fällig ----------
el = container();
cleanup = await view.mount(el, { tab: 'wiederholen' });
ok(el.textContent.includes('Wiederholung'), 'Wiederholen startet: ' + el.textContent.slice(0, 200));
noJunk(el); cleanup(); el.remove();

// ---------- Schwarz-Linie: Gegner beginnt automatisch ----------
el = container();
const bl = model.lineById.get('tb-qgd-1');
finished = null;
t = createLineTrainer(el, { model, line: bl, mode: 'review', onFinish: r => (finished = r) });
await tick(450);
ok(t.board.history().length === 1, 'Gegnerzug 1.d4 automatisch');
doc.key('h');
ok(t.board.cg.state.drawable.autoShapes.some(s => s.orig === 'd7'), 'Hinweis markiert Figur');
for (const p of bl.plies) {
  if (!p.own) { await tick(450); continue; }
  userMove(t.board, p.uci);
  await tick(5);
}
await tick(10);
ok(finished && finished.results[0].grade === 1, 'Hinweis → Note 1');
ok(finished.results.slice(1).every(r => r.grade === 3), 'schnell → Note 3');
noJunk(el); t.destroy(); el.remove();

// ---------- Lernen mit erreichtem Tageslimit ----------
store.update('openings', d => { d.settings.newPerDay = 5; });
el = container();
cleanup = await view.mount(el, { tab: 'lernen', chapter: 't-italian' });
ok(el.textContent.includes('Tageslimit erreicht'), 'Tageslimit-Hinweis: ' + el.textContent.slice(0, 200));
findButton(el, 'Trotzdem').click();
ok(el.textContent.includes('Neue Linie'), 'Trotzdem lernen startet Trainer');
noJunk(el); cleanup(); el.remove();
store.update('openings', d => { d.settings.newPerDay = 12; });

// Übersicht nach dem Lernen
el = container();
cleanup = await view.mount(el, { chapter: 't-italian' });
ok(el.textContent.includes('1/3 Linien'), 'Kapitelfortschritt 1/3');
ok(el.textContent.includes('fällig'), 'Fällige Karten sichtbar');
ok(el.textContent.includes('Lc4 zielt') === false && el.textContent.includes('Testkapitel.'), 'Kapitel aufgeklappt mit Intro');
noJunk(el); cleanup(); el.remove();

// ---------- Explorer, Abweichung mit Engine ----------
el = container();
cleanup = await view.mount(el, { tab: 'explorer' });
ok(el.textContent.includes('Mein Zug hier'), 'Explorer: Mein Zug hier');
noJunk(el); cleanup(); el.remove();
el = container();
cleanup = await view.mount(el, { tab: 'explorer', moves: 'e4 c5' });
await tick(350);   // Engine startet entprellt nach 300 ms
ok(el.textContent.includes('Nicht im Repertoire'), 'Explorer: Abweichung erkannt');
ok(el.textContent.includes('Beste Antwort'), 'Explorer: Engine-Antwort: ' + el.textContent.slice(-300));
noJunk(el); cleanup(); el.remove();

// ---------- Katalog fehlt, Quiz mit Lichess-Daten ----------
el = container();
cleanup = await view.mount(el, { tab: 'katalog' });
ok(el.textContent.includes('openings_catalog.json gibt es noch nicht'), 'Katalog-Hinweis: ' + el.textContent.slice(0, 300));
noJunk(el); cleanup(); el.remove();
el = container();
cleanup = await view.mount(el, { tab: 'quiz' });
ok(el.textContent.includes('Wie heißt') || el.textContent.includes('Finde den Hauptzug'), 'Quiz-Frage');
noJunk(el); cleanup(); el.remove();

// Quiz beantworten (Tasten 1–4 bzw. Zug am Brett)
{
  const { createQuiz } = await import('../../app/js/openings/quiz.js');
  const { loadQuizPool } = await import('../../app/js/openings/data.js');
  const pool = await loadQuizPool();
  el = container();
  let answers = 0;
  const q = createQuiz(el, { pool, onAnswer: () => answers++ });
  for (let i = 0; i < 6; i++) {
    if (el.textContent.includes('Wie heißt')) doc.key('1');
    else {
      const arrowless = q.board.chess.moves({ verbose: true })[0];
      userMove(q.board, arrowless.from + arrowless.to);   // vermutlich falsch → Pfeil
      await tick(5);
      const shape = q.board.cg.state.drawable.autoShapes.find(s => s.dest);
      if (shape) userMove(q.board, shape.orig + shape.dest);
    }
    await tick(5);
    doc.key('Enter');
  }
  ok(answers === 6, 'Quiz: 6 Antworten gezählt (' + answers + ')');
  const qs = store.get('openings').quiz;
  ok(qs.right + qs.wrong === 6, 'Quiz-Fortschritt gespeichert');
  noJunk(el); q.destroy(); el.remove();
}

// Katalog mit Falle
fetchMap['data/openings_catalog.json'] = DIR + 'catalog_test.json';
el = container();
cleanup = await view.mount(el, { tab: 'katalog', id: 'italian-giuoco' });
ok(el.textContent.includes('Italienisch: Giuoco Piano') && el.textContent.includes('Plan Weiß'), 'Katalog zeigt Detail');
ok(el.textContent.includes('4 von 4'), 'Katalog zählt Einträge');
findButton(el, 'Falle zeigen').click();
ok(el.textContent.includes('Blackburne'), 'Falle wird gezeigt');
for (let i = 0; i < 20; i++) doc.key('ArrowRight');
ok(el.textContent.includes('Zurück zur Eröffnung'), 'Falle: Rückweg');
const fam = el.querySelectorAll('select')[0];
fam.value = 'Sizilianisch'; fam.dispatch('change');
ok(el.textContent.includes('1 von 4'), 'Familienfilter');
noJunk(el); cleanup(); el.remove();

// ---------- Sparring ----------
el = container();
cleanup = await view.mount(el, { tab: 'sparring', line: 'tb-qgd-1' });
ok(el.textContent.includes('Sparring'), 'Sparring startet');
noJunk(el); cleanup(); el.remove();

// ---------- runBlock: 1 Minute, Block beenden ----------
el = container();
let summary = null, calls = 0;
const stop = view.runBlock(el, { minutes: 1, mode: 'review', onDone: s => { summary = s; calls++; } });
await tick(50);
ok(el.textContent.includes('Wiederholen (1 fällig)'), 'Block beginnt mit fälliger Karte: ' + el.textContent.slice(0, 120));
findButton(el, 'Block beenden').click();
findButton(el, 'Block beenden')?.click();
ok(calls === 1 && summary.type === 'openings' && summary.mode === 'review', 'onDone genau einmal: ' + JSON.stringify(summary));
stop(); el.remove();

store.flush();
print(`${passes} bestanden, ${fails} fehlgeschlagen`);
