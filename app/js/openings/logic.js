// Reine Eröffnungslogik ohne DOM: Repertoire aufbereiten, Stellungsbaum, SRS-Karten,
// Fälligkeiten, Auswahl der nächsten Linie und Quizfragen. Läuft auch in jsc (Tests).
//
// Karte = eigener Zug in einer Stellung. Schlüssel: FEN ohne Zugzähler (4 Felder) + '|' + SAN.
// Gleiche Stellungen in mehreren Linien teilen sich so automatisch die Karte.

import { Chess } from '../../vendor/chess.js';
import { newCard, review, isDue, todayStr, strength } from '../srs.js';

export const DEFAULT_NEW_PER_DAY = 12;
export const PRIORITY_LABEL = { 1: 'Kern', 2: 'Aufbau', 3: 'Später' };
const FREQ_RANK = { 'häufig': 0, 'mittel': 1, 'selten': 2 };
const FAST_MS = 4000;

// ---------- Schlüssel ----------

export function fenKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

// Nur Stellung, Zugrecht und Rochaderechte (für Vergleiche, bei denen en passant egal ist)
export function fenKey3(fen) {
  return fen.split(' ').slice(0, 3).join(' ');
}

export function cardKey(fen, san) {
  return fenKey(fen) + '|' + san;
}

export function splitCardKey(key) {
  const i = key.lastIndexOf('|');
  return { fen: key.slice(0, i) + ' 0 1', san: key.slice(i + 1) };
}

// ---------- Fortschritt ----------

// Fehlende Felder im Bereich `openings` ergänzen (ändert d direkt und gibt es zurück).
export function ensureProgress(d) {
  d.cards ||= {};
  d.learnedLines ||= {};
  d.newToday ||= { date: todayStr(), count: 0 };
  d.settings ||= {};
  if (!(d.settings.newPerDay >= 0)) d.settings.newPerDay = DEFAULT_NEW_PER_DAY;
  d.quiz ||= { right: 0, wrong: 0 };
  return d;
}

export function newCountToday(prog, day = todayStr()) {
  return prog.newToday?.date === day ? prog.newToday.count || 0 : 0;
}

// ---------- Linien und Repertoire ----------

// Zugfolge (SAN ab Grundstellung) durchrechnen. side = Seite des Nutzers ('w'|'b').
// → { plies: [{i, san, uci, from, to, color, own, fenBefore, fenAfter, key, note}], error }
export function expandLine(moves, side, notes = {}) {
  const chess = new Chess();
  const plies = [];
  for (let i = 0; i < moves.length; i++) {
    const fenBefore = chess.fen();
    let m;
    try {
      m = chess.move(moves[i]);
    } catch {
      m = null;
    }
    if (!m) return { plies, error: `Halbzug ${i + 1} („${moves[i]}“) ist nicht legal` };
    const own = m.color === side;
    plies.push({
      i, san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to, color: m.color, own,
      fenBefore, fenAfter: chess.fen(), key: own ? cardKey(fenBefore, m.san) : null,
      note: (notes && notes[String(i)]) || '',
    });
  }
  return { plies, error: null };
}

// Repertoire-Dateien zu einem Modell zusammenführen.
// files: [{ name, side: 'w'|'b', json }] (json darf null sein, wenn die Datei fehlt)
export function buildModel(files) {
  const model = {
    chapters: [], lines: [], chapterById: new Map(), lineById: new Map(),
    trees: { w: new Map(), b: new Map() }, keys: new Set(), keyLines: new Map(),
    errors: [], conflicts: [], missing: [],
  };
  for (const f of files) {
    if (!f.json) { model.missing.push(f.name); continue; }
    const chapters = Array.isArray(f.json.chapters) ? f.json.chapters : [];
    chapters.forEach((ch, ci) => {
      const side = ch.side || f.json.side || f.side;
      if (!ch.id || model.chapterById.has(ch.id)) {
        model.errors.push(`Kapitel ${ch.id || '(ohne id)'} in ${f.name} doppelt oder ohne id`);
        return;
      }
      const chapter = {
        id: ch.id, side, group: ch.group || (side === 'w' ? 'Weiß' : 'Schwarz'), title: ch.title || ch.id,
        priority: ch.priority || 3, intro: ch.intro || '', ideas: ch.ideas || [], lines: [],
        order: ci, file: f.name,
      };
      (ch.lines || []).forEach((ln, li) => {
        if (!ln.id || model.lineById.has(ln.id) || !Array.isArray(ln.moves) || !ln.moves.length) {
          model.errors.push(`Linie ${ln.id || '(ohne id)'} in ${ch.id} doppelt, ohne id oder ohne Züge`);
          return;
        }
        const { plies, error } = expandLine(ln.moves, side, ln.notes);
        if (error) { model.errors.push(`${ln.id}: ${error}`); return; }
        const ownKeys = [...new Set(plies.filter(p => p.own).map(p => p.key))];
        const line = {
          id: ln.id, name: ln.name || ln.id, frequency: ln.frequency || 'mittel', moves: plies.map(p => p.san),
          notes: ln.notes || {}, plan: ln.plan || '', chapterId: chapter.id, side, priority: chapter.priority,
          plies, ownKeys, order: li,
        };
        chapter.lines.push(line);
        model.lines.push(line);
        model.lineById.set(line.id, line);
        for (const k of ownKeys) {
          model.keys.add(k);
          if (!model.keyLines.has(k)) model.keyLines.set(k, []);
          model.keyLines.get(k).push(line.id);
        }
        addToTree(model.trees[side], line);
      });
      model.chapters.push(chapter);
      model.chapterById.set(chapter.id, chapter);
    });
  }
  // Widersprüche: gleiche Stellung, verschiedene eigene Züge
  for (const side of ['w', 'b']) {
    for (const node of model.trees[side].values()) {
      const own = node.moves.filter(m => m.own);
      if (own.length > 1) model.conflicts.push({ side, fen: node.fen, moves: own.map(m => m.san), lines: own.flatMap(m => m.lineIds) });
    }
  }
  return model;
}

// Stellungsbaum (eigentlich ein Graph, Zugumstellungen landen im selben Knoten).
// Knoten: { key, fen, moves: [{san, uci, own, next, notes: [], lineIds: []}] }
function addToTree(tree, line) {
  for (const p of line.plies) {
    const key = fenKey(p.fenBefore);
    let node = tree.get(key);
    if (!node) tree.set(key, node = { key, fen: p.fenBefore, moves: [] });
    let mv = node.moves.find(m => m.san === p.san);
    if (!mv) node.moves.push(mv = { san: p.san, uci: p.uci, own: p.own, next: fenKey(p.fenAfter), notes: [], lineIds: [] });
    if (p.note && !mv.notes.includes(p.note)) mv.notes.push(p.note);
    if (!mv.lineIds.includes(line.id)) mv.lineIds.push(line.id);
  }
  // Endstellung als (leeren) Knoten aufnehmen, damit der Explorer sie kennt
  const last = line.plies[line.plies.length - 1];
  if (last && !tree.has(fenKey(last.fenAfter))) tree.set(fenKey(last.fenAfter), { key: fenKey(last.fenAfter), fen: last.fenAfter, moves: [] });
}

export function treeNode(model, side, fen) {
  return model.trees[side]?.get(fenKey(fen)) || null;
}

// Eigene Repertoirezüge in einer Stellung (meist genau einer)
export function ownMovesAt(model, side, fen) {
  return (treeNode(model, side, fen)?.moves || []).filter(m => m.own);
}

// ---------- Status, Fälligkeit ----------

export function lineStatus(line, prog, day = todayStr()) {
  const cards = prog.cards || {};
  let due = 0, known = 0, str = 0;
  for (const k of line.ownKeys) {
    const c = cards[k];
    if (!c) continue;
    known++;
    str += strength(c);
    if (isDue(c, day)) due++;
  }
  const total = line.ownKeys.length;
  return {
    learned: !!prog.learnedLines?.[line.id], due, known, total,
    newCards: total - known, strength: total ? str / total : 0,
  };
}

// Fällige Karten (nur solche, die im aktuellen Repertoire vorkommen)
export function dueKeySet(model, prog, day = todayStr()) {
  const out = new Set();
  const cards = prog.cards || {};
  for (const k of model.keys) if (cards[k] && isDue(cards[k], day)) out.add(k);
  return out;
}

export function chapterStats(chapter, prog, day = todayStr()) {
  const cards = prog.cards || {};
  const keys = new Set(chapter.lines.flatMap(l => l.ownKeys));
  let due = 0, known = 0;
  for (const k of keys) {
    if (!cards[k]) continue;
    known++;
    if (isDue(cards[k], day)) due++;
  }
  const learned = chapter.lines.filter(l => prog.learnedLines?.[l.id]).length;
  return { lines: chapter.lines.length, learned, cards: keys.size, known, due };
}

export function totals(model, prog, day = todayStr()) {
  const cards = prog.cards || {};
  let known = 0;
  for (const k of model.keys) if (cards[k]) known++;
  return {
    lines: model.lines.length,
    learnedLines: model.lines.filter(l => prog.learnedLines?.[l.id]).length,
    cards: model.keys.size, known,
    due: dueKeySet(model, prog, day).size,
    newToday: newCountToday(prog, day),
    newPerDay: prog.settings?.newPerDay ?? DEFAULT_NEW_PER_DAY,
  };
}

// Gelernte Linien mit fälligen Karten. Sortiert: meiste fällige Karten zuerst, dann am längsten überfällig.
export function dueLines(model, prog, day = todayStr(), filter = {}) {
  const cards = prog.cards || {};
  const out = [];
  for (const line of model.lines) {
    if (filter.side && line.side !== filter.side) continue;
    if (filter.chapterId && line.chapterId !== filter.chapterId) continue;
    let due = 0, oldest = '9999';
    for (const k of line.ownKeys) {
      const c = cards[k];
      if (c && isDue(c, day)) { due++; if (c.due < oldest) oldest = c.due; }
    }
    // Neue Karten in einer gelernten Linie (z. B. nach Daten-Update) zählen nicht als fällig.
    if (due && (prog.learnedLines?.[line.id] || line.ownKeys.every(k => cards[k]))) out.push({ line, due, oldest });
  }
  out.sort((a, b) => (b.due - a.due) || a.oldest.localeCompare(b.oldest) || a.line.priority - b.line.priority);
  return out;
}

export function pickDueLine(model, prog, day = todayStr(), filter = {}) {
  return dueLines(model, prog, day, filter)[0]?.line || null;
}

// Noch nicht gelernte Linien in Lernreihenfolge:
// Priorität → Häufigkeit → Kapitel (Weiß und Schwarz abwechselnd) → Reihenfolge in der Datei.
export function newLineQueue(model, prog, filter = {}) {
  const sideIdx = { w: 0, b: 1 };
  return model.lines
    .filter(l => !prog.learnedLines?.[l.id])
    .filter(l => !filter.side || l.side === filter.side)
    .filter(l => !filter.chapterId || l.chapterId === filter.chapterId)
    .map(l => {
      const ch = model.chapterById.get(l.chapterId);
      return { l, s: [l.priority, FREQ_RANK[l.frequency] ?? 1, ch.order * 2 + (sideIdx[l.side] || 0), l.order] };
    })
    .sort((a, b) => {
      for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return a.s[i] - b.s[i];
      return 0;
    })
    .map(x => x.l);
}

// Darf diese Linie heute noch gelernt werden? Die erste Linie des Tages geht immer.
export function canLearn(line, prog, day = todayStr()) {
  const limit = prog.settings?.newPerDay ?? DEFAULT_NEW_PER_DAY;
  const used = newCountToday(prog, day);
  const newCards = line.ownKeys.filter(k => !prog.cards?.[k]).length;
  return { ok: newCards === 0 || used === 0 || used + newCards <= limit, newCards, used, limit, left: Math.max(0, limit - used) };
}

export function pickNewLine(model, prog, day = todayStr(), filter = {}) {
  for (const l of newLineQueue(model, prog, filter)) if (canLearn(l, prog, day).ok) return l;
  return null;
}

// Erster Halbzug, ab dem in der Lernvorführung etwas Neues kommt (bekannter Anfang wird übersprungen).
// Einen Zug Vorlauf lassen, damit man die Stellung einordnen kann.
export function firstNewPly(line, prog) {
  const idx = line.plies.findIndex(p => p.own && !prog.cards?.[p.key]);
  if (idx <= 0) return 0;
  return Math.max(0, idx - 2);
}

// ---------- Bewertung ----------

// Note für einen eigenen Zug: falsch → 0, mit Hinweis → 1, richtig → 2, richtig und schnell → 3
export function gradeFor({ wrong, hinted, ms }) {
  if (wrong) return 0;
  if (hinted) return 1;
  return ms != null && ms < FAST_MS ? 3 : 2;
}

// Ergebnisse einer Linie in den Fortschritt übernehmen.
// results: [{key, grade}]; learnLineId: Linie gilt danach als gelernt.
// Regeln: neue Karte → anlegen (Note höchstens 2, also morgen wieder dran);
// fällige Karte → normal bewerten; nicht fällige Karte → nur bei Fehler zurücksetzen.
export function applyResults(prog, results, { learnLineId, day = todayStr() } = {}) {
  ensureProgress(prog);
  const byKey = new Map();
  for (const r of results) byKey.set(r.key, Math.min(r.grade, byKey.has(r.key) ? byKey.get(r.key) : 3));
  let reviewed = 0, newCards = 0, correct = 0;
  for (const [key, grade] of byKey) {
    const card = prog.cards[key];
    if (grade > 0) correct++;
    if (!card) {
      prog.cards[key] = review(newCard(), Math.min(grade, 2), day);
      newCards++;
    } else if (isDue(card, day)) {
      prog.cards[key] = review(card, grade, day);
      reviewed++;
    } else if (grade === 0) {
      prog.cards[key] = review(card, 0, day);
      reviewed++;
    }
  }
  if (learnLineId) prog.learnedLines[learnLineId] = day;
  if (newCards) {
    if (prog.newToday.date !== day) prog.newToday = { date: day, count: 0 };
    prog.newToday.count += newCards;
  }
  return { reviewed, newCards, correct, total: byKey.size };
}

// ---------- Eröffnungsnamen und Quiz ----------

// Lichess-Liste → Map(FEN-Schlüssel → {eco, name})
export function buildNameIndex(list) {
  const map = new Map();
  for (const o of list || []) {
    if (!o?.epd) continue;
    const parts = o.epd.trim().split(/\s+/).slice(0, 4);
    while (parts.length < 4) parts.push('-');
    map.set(fenKey3(parts.join(' ')), { eco: o.eco, name: o.name });
  }
  return map;
}

// Name der tiefsten bekannten Stellung entlang einer Zugfolge (fens = alle FENs, älteste zuerst)
export function openingNameFor(index, fens) {
  for (let i = fens.length - 1; i >= 0; i--) {
    const hit = index.get(fenKey3(fens[i]));
    if (hit) return hit;
  }
  return null;
}

// Gruppe eines Eröffnungsnamens: Teil vor dem Doppelpunkt („Sicilian Defense: Najdorf“ → „Sicilian Defense“)
export function nameGroup(name) {
  return String(name).split(':')[0].trim();
}

// Quiz-Pool vereinheitlichen. Einträge: {name, moves, group, eco, src}
export function quizPool(catalog, lichess) {
  const pool = [];
  for (const o of catalog || []) {
    if (Array.isArray(o.moves) && o.moves.length >= 2 && o.name) pool.push({ name: o.name, moves: o.moves, group: o.family || nameGroup(o.name), eco: o.eco, level: o.level, src: 'katalog' });
  }
  // Lichess: nur nicht zu tiefe Varianten (höchstens eine Untervariante im Namen), sonst wird es Spezialwissen
  for (const o of lichess || []) {
    if (Array.isArray(o.moves) && o.moves.length >= 2 && o.moves.length <= 12 && o.name && (o.name.match(/,/g) || []).length <= 1) pool.push({ name: o.name, moves: o.moves, group: nameGroup(o.name), eco: o.eco, src: 'lichess' });
  }
  return pool;
}

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

// „Wie heißt diese Eröffnung?“ → {type:'name', entry, options:[names], answer: index}
// Ablenker möglichst aus derselben Familie (schwieriger), Rest zufällig, alle mit anderem Namen.
export function makeNameQuestion(pool, rnd = Math.random, src) {
  const cands = src ? pool.filter(p => p.src === src) : pool;
  if (cands.length < 4) return null;
  const entry = pick(cands, rnd);
  const names = new Set([entry.name]);
  const opts = [];
  // Kein Ablenker darf auf die gezeigte Stellung passen: also keine Vorstufe (Zugfolge ist Anfang der Antwort)
  const isPrefix = p => p.moves.length <= entry.moves.length && p.moves.every((m, i) => m === entry.moves[i]);
  const usable = p => !names.has(p.name) && !isPrefix(p);
  const same = cands.filter(p => p.group === entry.group && usable(p));
  for (let tries = 0; opts.length < 2 && tries < 20 && same.length; tries++) {
    const p = pick(same, rnd);
    if (usable(p)) { names.add(p.name); opts.push(p.name); }
  }
  for (let tries = 0; opts.length < 3 && tries < 200; tries++) {
    const p = pick(cands, rnd);
    if (usable(p)) { names.add(p.name); opts.push(p.name); }
  }
  if (opts.length < 3) return null;
  const answer = Math.floor(rnd() * 4);
  opts.splice(answer, 0, entry.name);
  return { type: 'name', entry, options: opts, answer };
}

// „Finde den Hauptzug“: Stellung vor dem letzten Zug, Nutzer zieht ihn.
// → {type:'move', entry, setup:[SAN], expected: SAN, targetKey}
export function makeMoveQuestion(pool, rnd = Math.random, src) {
  const cands = (src ? pool.filter(p => p.src === src) : pool).filter(p => p.moves.length >= 3);
  if (!cands.length) return null;
  for (let tries = 0; tries < 20; tries++) {
    const entry = pick(cands, rnd);
    const chess = new Chess();
    try {
      for (const mv of entry.moves.slice(0, -1)) chess.move(mv);
      const fen = chess.fen();
      const m = chess.move(entry.moves[entry.moves.length - 1]);
      return { type: 'move', entry, setup: entry.moves.slice(0, -1), fen, expected: m.san, expectedUci: m.from + m.to + (m.promotion || ''), targetKey: fenKey3(chess.fen()) };
    } catch {
      continue;
    }
  }
  return null;
}

// Prüft einen Quizzug: richtig, wenn dieselbe Stellung entsteht (Zugumstellung zählt).
export function checkMoveAnswer(q, fenAfter) {
  return fenKey3(fenAfter) === q.targetKey;
}
