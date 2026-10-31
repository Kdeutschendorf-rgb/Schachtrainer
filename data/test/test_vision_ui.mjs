// Rauchtest für Modul 6 (Vorausdenken & Endspiele) mit Schein-DOM (jsc, kein Browser):
// /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m data/test/test_vision_ui.mjs
// Prüft Aufbau, Knöpfe, Fortschritt und den runBlock-Vertrag (onDone genau einmal). Brettzüge selbst testet die Logik.
import { install, tick, findButton, Element } from './fake_dom.mjs';
import { Chess } from '../../app/vendor/chess.js';

const ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/data\/test\/[^/]*$/, '')) + '';
let engineCalls = 0;

// Was das Schein-DOM nicht kann, der Browser aber schon. Wie im echten DOM wird null zu „null“,
// damit der Test genau diesen Fehler findet.
Element.prototype.replaceChildren = function (...nodes) {
  this.textContent = '';
  this.append(...nodes);
};
Object.defineProperty(Element.prototype, 'childElementCount', { get() { return this.children.length; } });
const doc = install({
  fetchMap: {
    'data/endgames.json': ROOT + 'app/data/endgames.json',
    'data/puzzles.json': ROOT + 'app/data/puzzles.json',
  },
  // Schein-Engine: erster legaler Zug, Bewertung +6 für die Seite am Zug
  engine: body => {
    engineCalls++;
    const c = new Chess(body.fen);
    const m = c.moves({ verbose: true })[0];
    if (!m) return { lines: [], bestmove: null, gameOver: '1/2-1/2' };
    const cp = c.turn() === 'w' ? 600 : -600;
    const lines = [{ score: { cp }, pv: [m.from + m.to + (m.promotion || '')], san: [m.san], depth: 12 }];
    return { lines, bestmove: lines[0].pv[0] };
  },
});

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; print('FEHLER: ' + m); } };
function noJunk(el, where) {
  const m = el.textContent.match(/.{0,40}\b(null|undefined|NaN)\b.{0,20}/);
  ok(!m, `${where}: Textmüll ${m && m[0]}`);
}
function container() {
  const el = new Element('main');
  doc.body.append(el);
  return el;
}
async function until(cond, ms = 4000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await tick(20);
  return cond();
}

const store = await import('../../app/js/store.js');
await store.init();

// ---------------- Endspiele ----------------
const eg = await import('../../app/js/views/endgames.js');
let el = container();
let cleanup = eg.mount(el, {});
ok(await until(() => el.textContent.includes('Grundlagen')), 'Endspiel-Übersicht lädt');
ok(el.textContent.includes('Lucena'), 'Übersicht zeigt Lucena');
ok(el.textContent.includes('20 Stellungen') || /\d+ Stellungen/.test(el.textContent), 'Zähler Stellungen');
noJunk(el, 'Endspiel-Übersicht');
cleanup(); el.remove();

el = container();
cleanup = eg.mount(el, { id: 'kp-sixth-rank' });
ok(await until(() => el.textContent.includes('König auf der 6. Reihe')), 'Einzelstellung geöffnet');
ok(el.textContent.includes('Du spielst Weiß'), 'Seite angezeigt');
findButton(el, 'Hinweis').click();
ok(el.textContent.includes('Hinweis 1:'), 'Hinweis 1 erscheint');
findButton(el, 'Aufgeben').click();
ok(el.textContent.includes('Die Technik'), 'Technik nach Aufgeben');
ok(store.get('endgames').cards['kp-sixth-rank']?.reps === 0, 'SRS-Karte angelegt (Note 0)');
ok(store.get('endgames').stats['kp-sixth-rank'][1] === 1, 'Statistik gezählt');
noJunk(el, 'Endspiel nach Aufgeben');
findButton(el, 'Nächste Stellung').click();
ok(!el.textContent.includes('Die Technik'), 'Nächste Stellung gestartet');
cleanup(); el.remove();

// runBlock: „Block beenden“ → onDone genau einmal
el = container();
let doneCount = 0, summary = null;
cleanup = eg.runBlock(el, { minutes: 2, mode: 'basic', onDone: s => { doneCount++; summary = s; } });
ok(await until(() => !!findButton(el, 'Block beenden')), 'Endspiel-Block läuft');
ok(el.querySelectorAll('.timer').length === 1, 'Restzeit sichtbar');
findButton(el, 'Block beenden').click();
findButton(el, 'Block beenden')?.click();
cleanup();
ok(doneCount === 1, `Endspiel onDone genau einmal (${doneCount})`);
ok(summary?.type === 'endgames' && summary.mode === 'basic' && typeof summary.done === 'number', 'Endspiel-Summary-Format');
el.remove();

// ---------------- Vorausdenken ----------------
const vis = await import('../../app/js/views/vision.js');
el = container();
cleanup = vis.mount(el, {});
ok(el.textContent.includes('Blind rechnen') && el.textContent.includes('Ungedeckte Figuren'), 'Vorausdenken-Übersicht');
noJunk(el, 'Vorausdenken-Übersicht');
cleanup(); el.remove();

async function block(mode, check) {
  const e = container();
  let n = 0, s = null;
  const c = vis.runBlock(e, { minutes: 3, mode, onDone: x => { n++; s = x; } });
  ok(await until(() => !e.textContent.includes('Lade Aufgaben'), 20000), `${mode}: Aufgaben geladen`);
  await check(e);
  noJunk(e, mode);
  findButton(e, 'Block beenden').click();
  c();
  ok(n === 1, `${mode}: onDone genau einmal (${n})`);
  ok(s?.type === 'vision' && s.mode === mode, `${mode}: Summary-Format`);
  e.remove();
  return s;
}

await block('cct', async e => {
  ok(await until(() => /\d+\/\d+ gefunden/.test(e.textContent)), 'CCT: Zähler');
  findButton(e, 'Fertig, auflösen').click();
  ok(await until(() => e.textContent.includes('Übersehen') || e.textContent.includes('Alle')), 'CCT: Auflösung');
  ok(!!findButton(e, 'Weiter'), 'CCT: Weiter-Knopf');
});

const sLoose = await block('loose', async e => {
  ok(await until(() => e.textContent.includes('0 markiert')), 'Ungedeckt: Start');
  findButton(e, 'Prüfen').click();
  ok(await until(() => /richtig/.test(e.textContent)), 'Ungedeckt: Auswertung');
  ok(!!findButton(e, 'Weiter'), 'Ungedeckt: Weiter-Knopf');
});
ok(sLoose.done === 1, 'Ungedeckt: eine Aufgabe gezählt');
ok((store.get('vision').loose.history || []).length >= 1, 'Ungedeckt: Verlauf gespeichert');

await block('calc', async e => {
  ok(await until(() => !!findButton(e, 'Weiß ich nicht'), 8000), 'Blind: Antwortphase');
  ok(e.textContent.includes('am Zug'), 'Blind: Aufgabe angesagt');
  findButton(e, 'Weiß ich nicht').click();
  ok(await until(() => e.textContent.includes('Gesucht war')), 'Blind: Auflösung');
});

await block('threats', async e => {
  ok(await until(() => e.textContent.includes('Schritt 1'), 8000), 'Drohung: Schritt 1');
});

await block('mix', async e => {
  ok(await until(() => e.querySelectorAll('.vision-title')[0]?.textContent === 'Blind rechnen'), 'Mix beginnt mit Blind rechnen');
});

ok(engineCalls > 0, 'Engine wurde benutzt');
ok(doc.listenerCount('keydown') === 0, `Tastatur-Listener aufgeräumt (${doc.listenerCount('keydown')})`);
print(`${passes} ok, ${fails} Fehler`);
