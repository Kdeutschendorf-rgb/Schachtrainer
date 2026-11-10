// Spaced Repetition (vereinfachtes SM-2) für Eröffnungszüge, Aufgaben und alles andere,
// das wiederholt werden soll. Karten sind reine Objekte und landen im Fortschritt.
//
// Karte: {due: 'YYYY-MM-DD', interval: Tage, ease, reps, lapses, last: 'YYYY-MM-DD'}
// grade: 0 = falsch, 1 = schwer, 2 = gut, 3 = leicht

const DAY = 86400000;

// Datum immer in lokaler Zeit, sonst springt der Tag nachts um 1 Uhr.
export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(day, days) {
  const d = new Date(day + 'T12:00:00');
  return dateStr(new Date(d.getTime() + days * DAY));
}

// Fortlaufende Tagesnummer (für alles, was täglich wechseln soll)
export function dayNumber(day = todayStr()) {
  return Math.round(Date.parse(day + 'T12:00:00Z') / 86400000);
}

export function todayStr() {
  return dateStr();
}

export function newCard() {
  return { due: todayStr(), interval: 0, ease: 2.5, reps: 0, lapses: 0, last: null };
}

export function isDue(card, day = todayStr()) {
  return !card || card.due <= day;
}

export function review(card, grade, day = todayStr()) {
  const c = { ...(card || newCard()) };
  if (grade === 0) {
    c.lapses += 1;
    c.reps = 0;
    c.interval = 0;            // heute noch einmal
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else {
    c.reps += 1;
    if (c.reps === 1) c.interval = grade === 3 ? 3 : 1;
    else if (c.reps === 2) c.interval = grade === 1 ? 2 : grade === 3 ? 7 : 4;
    else c.interval = Math.round(c.interval * (grade === 1 ? 1.2 : grade === 3 ? c.ease * 1.3 : c.ease));
    c.ease = Math.max(1.3, c.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  }
  c.last = day;
  c.due = addDays(day, c.interval);
  return c;
}

// Wie sicher eine Karte sitzt, 0–1 (für Fortschrittsbalken).
export function strength(card) {
  if (!card || !card.reps) return 0;
  return Math.min(1, Math.log2(1 + card.interval) / Math.log2(1 + 60));
}
