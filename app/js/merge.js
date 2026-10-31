// Zwei Fortschritts-Stände zusammenführen, wenn auf zwei Geräten trainiert wurde, bevor sie sich abgleichen konnten.
// Ändert `target` an Ort und Stelle, damit Module, die Teilbereiche (store.get) festhalten, weiter gültig bleiben.
//
// Regeln:
// - Lernkarten ({due, reps, last, …}): die zuletzt geübte Karte gewinnt (bei Gleichstand die mit mehr Wiederholungen).
// - Objekte: Schlüssel vereinigen, rekursiv.
// - Listen: Einträge vereinigen (Verlauf, Sitzungen), nach Datum sortiert. Zahlenpaare wie [richtig, gesamt]: Maximum.
// - Zähler unter `activity` (Minuten, Aufgaben pro Tag): Maximum.
// - Sonst (Einstellungen, Wertungen, Stufen): der neuere Stand gewinnt.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isCard = v => isObj(v) && 'due' in v && 'reps' in v;
const clone = v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

function cardNewer(a, b) {
  const la = a.last || '', lb = b.last || '';
  if (la !== lb) return la > lb;
  return (a.reps + (a.lapses || 0)) > (b.reps + (b.lapses || 0));
}

// Sortierschlüssel für Listeneinträge: Datum in [id, ok, datum, …] oder startedAt/date in Sitzungen
function when(item) {
  if (Array.isArray(item)) return typeof item[2] === 'string' ? item[2] : null;
  if (isObj(item)) return item.startedAt || item.date || null;
  return null;
}

function mergeArray(t, o) {
  if (t.length === o.length && t.every(x => typeof x === 'number') && o.every(x => typeof x === 'number')) {
    for (let i = 0; i < t.length; i++) t[i] = Math.max(t[i], o[i]);
    return;
  }
  const seen = new Set(t.map(x => JSON.stringify(x)));
  let added = false;
  for (const item of o) {
    const k = JSON.stringify(item);
    if (!seen.has(k)) { seen.add(k); t.push(clone(item)); added = true; }
  }
  if (added && t.every(x => when(x) != null)) {
    const sorted = t.map((x, i) => [x, i]).sort((a, b) => (when(a[0]) < when(b[0]) ? -1 : when(a[0]) > when(b[0]) ? 1 : a[1] - b[1]));
    sorted.forEach(([x], i) => { t[i] = x; });
  }
}

function mergeInto(t, o, otherNewer, inActivity) {
  for (const key of Object.keys(o)) {
    if (key.startsWith('_')) continue;   // Zeitstempel verwaltet store.js
    const ov = o[key];
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
  return target;
}
