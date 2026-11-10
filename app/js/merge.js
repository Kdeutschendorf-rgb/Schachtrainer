// Zwei Fortschritts-Stände zusammenführen, wenn auf zwei Geräten trainiert wurde, bevor sie sich abgleichen konnten.
// Ändert `target` an Ort und Stelle, damit Module, die Teilbereiche (store.get) festhalten, weiter gültig bleiben.
//
// Regeln:
// - Lernkarten ({due, reps, last, …}): die zuletzt geübte Karte gewinnt (bei Gleichstand die mit mehr Wiederholungen).
// - Objekte: Schlüssel vereinigen, rekursiv.
// - Listen: Einträge vereinigen (Verlauf, Sitzungen), nach Datum sortiert. Zahlenpaare wie [richtig, gesamt]: Maximum.
// - Zähler unter `activity` (Minuten, Aufgaben pro Tag): Maximum.
// - Listeneinträge mit eigener Kennung (Bot-Partien, eigene Aufgaben): pro id nur ein Eintrag, der vollständigere bleibt.
// - Laufende Bot-Partie (`current`): wird nie gemischt, der neuere Stand gilt. Ist sie anderswo schon beendet, ist sie weg.
// - Sonst (Einstellungen, Wertungen, Stufen): der neuere Stand gewinnt.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isCard = v => isObj(v) && 'due' in v && 'reps' in v;
const clone = v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

function cardNewer(a, b) {
  const la = a.last || '', lb = b.last || '';
  if (la !== lb) return la > lb;
  return (a.reps + (a.lapses || 0)) > (b.reps + (b.lapses || 0));
}

// Sortierschlüssel für Listeneinträge: das Datum in [id, ok, datum, …] bzw. [id, ok, stufe, datum, …] oder startedAt/date in Sitzungen
function when(item) {
  if (Array.isArray(item)) return item.find(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) ?? null;
  if (isObj(item)) return item.startedAt || item.date || null;
  return null;
}

const idOf = x => (isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number') ? x.id : null);

function mergeArray(t, o) {
  if (t.length === o.length && t.every(x => typeof x === 'number') && o.every(x => typeof x === 'number')) {
    for (let i = 0; i < t.length; i++) t[i] = Math.max(t[i], o[i]);
    return;
  }
  let added = false;
  if (t.length + o.length > 0 && t.every(x => idOf(x) != null) && o.every(x => idOf(x) != null)) {
    // Einträge mit Kennung: Dieselbe Bot-Partie kann einmal ohne und einmal mit Analyse vorliegen
    const at = new Map(t.map((x, i) => [x.id, i]));
    for (const item of o) {
      const i = at.get(item.id);
      if (i == null) { at.set(item.id, t.length); t.push(clone(item)); added = true; }
      else if (JSON.stringify(item).length > JSON.stringify(t[i]).length) t[i] = clone(item);
    }
  } else {
    const seen = new Set(t.map(x => JSON.stringify(x)));
    for (const item of o) {
      const k = JSON.stringify(item);
      if (!seen.has(k)) { seen.add(k); t.push(clone(item)); added = true; }
    }
  }
  if (added && t.every(x => when(x) != null)) {
    const sorted = t.map((x, i) => [x, i]).sort((a, b) => (when(a[0]) < when(b[0]) ? -1 : when(a[0]) > when(b[0]) ? 1 : a[1] - b[1]));
    sorted.forEach(([x], i) => { t[i] = x; });
  }
}

// Werte, die nur als Ganzes Sinn ergeben (Zugliste und Uhren der laufenden Partie)
const ATOMIC = new Set(['current']);

function mergeInto(t, o, otherNewer, inActivity) {
  for (const key of Object.keys(o)) {
    if (key.startsWith('_')) continue;   // Zeitstempel verwaltet store.js
    const ov = o[key];
    if (ATOMIC.has(key)) { if (!(key in t) || otherNewer) t[key] = clone(ov); continue; }
    if (!(key in t) || t[key] == null) { t[key] = clone(ov); continue; }
    const tv = t[key];
    if (isCard(tv) && isCard(ov)) { if (cardNewer(ov, tv)) t[key] = clone(ov); }
    else if (isObj(tv) && isObj(ov)) mergeInto(tv, ov, otherNewer, inActivity || key === 'activity');
    else if (Array.isArray(tv) && Array.isArray(ov)) mergeArray(tv, ov);
    else if (inActivity && typeof tv === 'number' && typeof ov === 'number') t[key] = Math.max(tv, ov);
    else if (otherNewer) t[key] = clone(ov);
  }
}

// Führt `other` in `target` zusammen und gibt `target` zurück. Zeitstempel (_updatedAt, _syncedAt) bleiben unberührt.
export function mergeProgress(target, other) {
  if (!other) return target;
  mergeInto(target, other, (other._updatedAt || 0) > (target._updatedAt || 0), false);
  // Taktik-Wertung: Der Verlauf speichert sie nach jeder Aufgabe, der letzte Eintrag ist also der aktuelle Stand
  const last = target.tactics?.history?.at?.(-1);
  if (last && typeof last[3] === 'number') target.tactics.rating = last[3];
  // Bot-Partien: Eine Partie, die auf dem anderen Gerät schon beendet wurde, läuft nicht noch einmal weiter
  const play = target.play;
  if (play?.current && Array.isArray(play.games) && play.games.some(g => g.id === play.current.id)) play.current = null;
  if (Array.isArray(play?.games) && play.games.length > 100) play.games.splice(0, play.games.length - 100);
  if (Array.isArray(play?.puzzles) && play.puzzles.length > 300) play.puzzles.splice(0, play.puzzles.length - 300);
  return target;
}
