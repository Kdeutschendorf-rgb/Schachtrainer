// Zusammenführen zweier Fortschritts-Stände (app/js/merge.js). Aufruf: jsc -m data/test/test_merge.mjs
import { mergeProgress } from '../../app/js/merge.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; print('FEHLER: ' + m); } };

// Gemeinsamer Stand, dann trainiert das Handy offline Taktik, der Mac Eröffnungen
const base = () => ({
  settings: { dailyMinutes: 30, chesscomName: 'Keanu098' },
  tactics: { rating: 1300, history: [['p1', 1, '2026-10-30', 1310, 20]], themeStats: { fork: [1, 2] } },
  openings: { cards: { a: { due: '2026-11-01', interval: 1, ease: 2.5, reps: 1, lapses: 0, last: '2026-10-30' } }, learnedLines: { l1: '2026-10-30' } },
  sessions: [{ date: '2026-10-30', startedAt: '2026-10-30T10:00:00Z', minutes: 30 }],
  activity: { '2026-10-30': { minutes: 30 } },
});
const phone = { ...base(), _updatedAt: 200 };
phone.tactics.rating = 1340;
phone.tactics.history.push(['p2', 1, '2026-10-31', 1340, 15]);
phone.tactics.themeStats.fork = [3, 4];
phone.sessions.push({ date: '2026-10-31', startedAt: '2026-10-31T07:30:00Z', minutes: 20 });
phone.activity['2026-10-31'] = { minutes: 20, puzzles: 12 };

const mac = { ...base(), _updatedAt: 300 };
mac.openings.cards.a = { due: '2026-11-05', interval: 4, ease: 2.5, reps: 2, lapses: 0, last: '2026-10-31' };
mac.openings.cards.b = { due: '2026-11-01', interval: 1, ease: 2.5, reps: 1, lapses: 0, last: '2026-10-31' };
mac.openings.learnedLines.l2 = '2026-10-31';
mac.sessions.push({ date: '2026-10-31', startedAt: '2026-10-31T18:00:00Z', minutes: 10 });
mac.activity['2026-10-31'] = { minutes: 10, openingReviews: 8 };
mac.settings.dailyMinutes = 20;

const keep = phone.tactics;   // Module halten Teilbereiche fest
const m = mergeProgress(phone, mac);
ok(m.tactics === keep, 'Teilbereich bleibt dasselbe Objekt');
ok(m.tactics.history.length === 2, 'Taktik-Verlauf vom Handy bleibt');
ok(m.tactics.themeStats.fork[0] === 3 && m.tactics.themeStats.fork[1] === 4, 'Themenstatistik Maximum');
ok(m.openings.cards.a.reps === 2 && m.openings.cards.b, 'Eröffnungskarten vom Mac kommen dazu');
ok(m.openings.learnedLines.l1 && m.openings.learnedLines.l2, 'gelernte Linien vereinigt');
ok(m.sessions.length === 3 && m.sessions[2].startedAt.includes('18:00'), 'Sitzungen vereinigt und sortiert');
ok(m.activity['2026-10-31'].puzzles === 12 && m.activity['2026-10-31'].openingReviews === 8, 'Tageszähler beider Geräte');
ok(m.activity['2026-10-31'].minutes === 20, 'Minuten: Maximum');
ok(m.settings.dailyMinutes === 20, 'Einstellung vom neueren Gerät');
ok(m.tactics.rating === 1340, 'Taktik-Wertung aus dem letzten Verlaufseintrag');
ok(m._updatedAt === 200, 'Zeitstempel unberührt');

// Älterer Stand darf eine neuere Karte nicht zurücksetzen
const x = { openings: { cards: { a: { due: '2026-11-09', reps: 3, lapses: 0, last: '2026-11-01' } } }, _updatedAt: 500 };
mergeProgress(x, { openings: { cards: { a: { due: '2026-11-02', reps: 1, lapses: 0, last: '2026-10-28' } } }, _updatedAt: 900 });
ok(x.openings.cards.a.reps === 3, 'neuere Karte bleibt, auch wenn der andere Stand jünger ist');

// Laufende Bot-Partie: wird nie gemischt (gleiche Züge wie „Nf3“ kommen in einer Partie mehrfach vor)
const game = moves => ({ id: 7, color: 'w', moves, clocks: { w: 1, b: 2 } });
let a = { play: { current: game(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3']), games: [] }, _updatedAt: 900 };
mergeProgress(a, { play: { current: game(['Nf3', 'Nf6', 'Ng1']), games: [] }, _updatedAt: 500 });
ok(a.play.current.moves.join(' ') === 'Nf3 Nf6 Ng1 Ng8 Nf3', 'laufende Partie: neuerer Stand bleibt unverändert');
a = { play: { current: game(['Nf3', 'Nf6', 'Ng1']), games: [] }, _updatedAt: 500 };
mergeProgress(a, { play: { current: game(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3']), games: [] }, _updatedAt: 900 });
ok(a.play.current.moves.length === 5 && a.play.current.moves[4] === 'Nf3', 'laufende Partie: neuerer Stand ersetzt den älteren ganz');
// Auf dem neueren Gerät beendet: Die Partie darf vom älteren Stand nicht wieder auftauchen
a = { play: { current: null, games: [{ id: 7, result: 'W', moves: ['e4'] }] }, _updatedAt: 900 };
mergeProgress(a, { play: { current: game(['e4']), games: [] }, _updatedAt: 500 });
ok(a.play.current === null, 'beendete Partie taucht nicht wieder als laufend auf');
// Auf dem älteren Gerät beendet, auf dem neueren noch als laufend gespeichert
a = { play: { current: game(['e4']), games: [] }, _updatedAt: 900 };
mergeProgress(a, { play: { current: null, games: [{ id: 7, result: 'W', moves: ['e4'] }] }, _updatedAt: 500 });
ok(a.play.current === null && a.play.games.length === 1, 'anderswo beendete Partie läuft nicht weiter');
// Gerät ohne Bot-Partien übernimmt die laufende Partie des anderen
a = { play: {}, _updatedAt: 900 };
mergeProgress(a, { play: { current: game(['e4']), games: [] }, _updatedAt: 500 });
ok(a.play.current?.id === 7, 'laufende Partie kommt auf ein Gerät ohne eigene');
// Dieselbe Partie einmal ohne und einmal mit Analyse: ein Eintrag, der vollständige
a = { play: { games: [{ id: 1, result: 'W', moves: ['e4'] }, { id: 2, result: 'L', moves: ['d4'] }] }, _updatedAt: 900 };
mergeProgress(a, { play: { games: [{ id: 1, result: 'W', moves: ['e4'], accuracy: 88, moments: [{ ply: 4 }] }, { id: 3, result: 'D', moves: ['c4'] }] }, _updatedAt: 500 });
ok(a.play.games.length === 3 && a.play.games.find(g => g.id === 1).accuracy === 88, 'Partien nach id vereinigt, Analyse bleibt: ' + JSON.stringify(a.play.games.map(g => g.id)));

// Verlauf beim Vorausdenken: [id, ok, stufe, datum, sekunden] wird nach Datum sortiert
a = { vision: { cand: { history: [['x', 1, 2, '2026-11-09', 12]] } }, _updatedAt: 900 };
mergeProgress(a, { vision: { cand: { history: [['y', 0, 1, '2026-11-07', 9]] } }, _updatedAt: 500 });
ok(a.vision.cand.history.map(h => h[0]).join('') === 'yx', 'Vorausdenken-Verlauf nach Datum sortiert');

print(`${pass} bestanden, ${fail} fehlgeschlagen`);
