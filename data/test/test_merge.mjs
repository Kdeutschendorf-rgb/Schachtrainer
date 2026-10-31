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

print(`${pass} bestanden, ${fail} fehlgeschlagen`);
