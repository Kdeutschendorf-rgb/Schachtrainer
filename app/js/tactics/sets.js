// Übungssätze aus dem Schwächenprofil (data/players/<name>/weakness_profile.json, erstellt von
// analysis/weakness_profile.py): Stellungen aus den eigenen Rapid-Partien, nach Fehlermuster gruppiert.
// Jeder Satz hat einen Merksatz (rule), der beim Üben über der Aufgabe steht. Ohne DOM, testbar in jsc.

import { dayNumber } from '../srs.js';

// Sätze in der Reihenfolge der Befunde (wichtigster zuerst), nur solche mit Aufgaben
export function profileSets(profile) {
  const sets = (profile?.sets || []).filter(s => s && s.id && Array.isArray(s.puzzles) && s.puzzles.length);
  const rank = new Map();
  (profile?.findings || []).forEach((f, i) => { if (f.set && !rank.has(f.set)) rank.set(f.set, i); });
  return [...sets].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

export function setById(profile, id) {
  return profileSets(profile).find(s => s.id === id) || null;
}

// Wie viele Aufgaben eines Satzes sind offen (neu oder zur Wiederholung fällig)?
export function setOpenCount(set, area, own, day) {
  const have = own ? new Set(own.map(p => p.id)) : null;      // ohne Aufgabenliste (Startseite): alle zählen
  const seen = area?.ownSeen || {};
  const cards = area?.cards || {};
  return set.puzzles.filter(id => (!have || have.has(id)) && ((!seen[id] && !cards['my:' + id]) || cards['my:' + id]?.due <= day)).length;
}

// Satz des Tages: Die Sätze wechseln sich täglich ab; Sätze ohne offene Aufgaben werden übersprungen.
export function setOfDay(profile, area, own, day) {
  const sets = profileSets(profile);
  if (!sets.length) return null;
  const start = dayNumber(day) % sets.length;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[(start + i) % sets.length];
    if (setOpenCount(s, area, own, day) > 0) return s;
  }
  return null;
}

// Auswahl-Zusatz für selectNext/nextOwn: nur Aufgaben dieses Satzes, mit Merksatz
export function setContext(set, extra = {}) {
  return set ? { setIds: new Set(set.puzzles), setInfo: { id: set.id, title: set.title, rule: set.rule || '' }, ...extra } : {};
}
