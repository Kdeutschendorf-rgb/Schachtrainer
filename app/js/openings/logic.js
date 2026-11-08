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
// maxPlies: Linien nach so vielen Halbzügen abschneiden (Lerntiefe), 0 = ganze Linie.
export function buildModel(files, { maxPlies = 0 } = {}) {
  const model = {
    chapters: [], lines: [], chapterById: new Map(), lineById: new Map(),
    trees: { w: new Map(), b: new Map() }, keys: new Set(), keyLines: new Map(),
    errors: [], conflicts: [], missing: [],
  };
  const seen = new Set();
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
        const expanded = expandLine(ln.moves, side, ln.notes);
        if (expanded.error) { model.errors.push(`${ln.id}: ${expanded.error}`); return; }
        const plies = maxPlies > 0 ? expanded.plies.slice(0, maxPlies) : expanded.plies;
        if (!plies.some(p => p.own)) return;
        // Durch das Kürzen gleich gewordene Linien nur einmal aufnehmen
        const sig = side + ':' + plies.map(p => p.san).join(' ');
        if (seen.has(sig)) return;
        seen.add(sig);
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
  model.items = positionItems(model);
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
    if (!mv) node.moves.push(mv = { san: p.san, uci: p.uci, from: p.from, to: p.to, own: p.own, next: fenKey(p.fenAfter), notes: [], lineIds: [] });
    // Rückverweis: über welche Züge man in die nächste Stellung kommt (für das Weichen-Training)
    const nextKey = fenKey(p.fenAfter);
    let next = tree.get(nextKey);
    if (!next) tree.set(nextKey, next = { key: nextKey, fen: p.fenAfter, moves: [] });
    next.parents ||= [];
    if (!next.parents.some(x => x.key === key && x.san === p.san)) next.parents.push({ key, fen: p.fenBefore, san: p.san, uci: p.uci, from: p.from, to: p.to });
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

// Darf diese Linie heute noch gelernt werden? Die erste Linie des Tages geht immer
// (auch wenn sie mehr neue Züge hat als das Limit), außer das Limit steht auf 0.
export function canLearn(line, prog, day = todayStr()) {
  const limit = prog.settings?.newPerDay ?? DEFAULT_NEW_PER_DAY;
  const used = newCountToday(prog, day);
  const newCards = line.ownKeys.filter(k => !prog.cards?.[k]).length;
  return { ok: newCards === 0 || (used === 0 && limit > 0) || used + newCards <= limit, newCards, used, limit, left: Math.max(0, limit - used) };
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

// ---------- Weichen-Training (einzelne Stellungen statt ganzer Linien) ----------

// Jede Stellung, in der du am Zug bist, mit dem Gegnerzug davor. Weiche = der Gegner hatte im Repertoire
// mehrere Möglichkeiten; genau dort musst du wissen, welche Antwort zu welchem Zug gehört.
// → [{key, side, fen, san, from, to, parent: {fen, san, from, to} | null, branch, lineIds, chapterId}]
export function positionItems(model) {
  const out = [];
  for (const side of ['w', 'b']) {
    const tree = model.trees[side];
    for (const node of tree.values()) {
      for (const mv of node.moves.filter(m => m.own)) {
        const parents = node.parents || [];
        // Bevorzugt einen Gegnerzug an einer Weiche als Weg in die Stellung
        const ranked = parents.map(p => ({ p, n: (tree.get(p.key)?.moves || []).filter(m => !m.own).length }))
          .sort((a, b) => b.n - a.n);
        const best = ranked[0];
        const line = model.lineById.get(mv.lineIds[0]);
        out.push({
          key: cardKey(node.fen, mv.san), side, fen: node.fen, san: mv.san, from: mv.from, to: mv.to,
          parent: best ? { fen: best.p.fen, san: best.p.san, from: best.p.from, to: best.p.to } : null,
          branch: !!best && best.n >= 2, lineIds: mv.lineIds, chapterId: line?.chapterId || null,
        });
      }
    }
  }
  return out;
}

// Alle Gegnerzüge in der Stellung vor deinem Zug mit deiner jeweiligen Antwort: „spielt er X, spielst du Y“.
export function branchTable(model, side, parentFen) {
  const tree = model.trees[side];
  const node = tree.get(fenKey(parentFen));
  if (!node) return [];
  return node.moves.filter(m => !m.own).map(m => ({
    opp: m.san, answer: (tree.get(m.next)?.moves || []).find(x => x.own)?.san || null,
  }));
}

function shuffleWith(arr, seed) {
  let x = seed || 1;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// Übungsstellungen für einen Durchgang.
// mode 'due': fällige Karten in zufälliger Reihenfolge (keine Linienreihenfolge, die man sich merken könnte).
// mode 'branches': bekannte Weichen-Stellungen, die am längsten nicht geübt wurden.
export function drillQueue(model, prog, { mode = 'due', day = todayStr(), limit = 0, seed = Date.now(), filter = {} } = {}) {
  const cards = prog.cards || {};
  const seenAt = k => [prog.practiced?.[k] || '', cards[k]?.last || ''].sort().pop();
  const seenKeys = new Set();
  let items = (model.items || []).filter(it => {
    if (seenKeys.has(it.key) || !cards[it.key]) return false;
    if (filter.side && it.side !== filter.side) return false;
    if (filter.chapterId && it.chapterId !== filter.chapterId) return false;
    seenKeys.add(it.key);
    return true;
  });
  if (mode === 'due') items = shuffleWith(items.filter(it => isDue(cards[it.key], day)), seed);
  else {
    items = items.filter(it => it.branch)
      .sort((a, b) => String(seenAt(a.key)).localeCompare(String(seenAt(b.key))));
    items = shuffleWith(items.slice(0, Math.max(limit || 0, 12)), seed);
  }
  return limit ? items.slice(0, limit) : items;
}

// Ein Durchgang im Weichen-Training: neue Karten werden nicht angelegt, nicht fällige nur bei Fehler zurückgesetzt.
// (Das macht applyResults schon so.)

// ---------- Partie-Check ----------

// Eine Partie (SAN ab Grundstellung) mit dem Repertoire vergleichen.
// → {plies: wie viele Halbzüge im Repertoire, kind: 'ich' (du bist abgewichen) | 'gegner' (Zug nicht im Repertoire)
//    | 'ende' (Linie zu Ende) | 'partie' (Partie zu Ende), played, expected: [SAN], fen (Stellung davor), ownTurn}
export function followGame(model, side, sans) {
  const tree = model.trees[side];
  const chess = new Chess();
  for (let i = 0; i < sans.length; i++) {
    const node = tree.get(fenKey(chess.fen()));
    const ownTurn = chess.turn() === side;
    if (!node || !node.moves.length) return { plies: i, kind: 'ende', played: sans[i], expected: [], fen: chess.fen(), ownTurn };
    const hit = node.moves.find(m => m.san === sans[i]);
    if (!hit) {
      const exp = node.moves.filter(m => m.own === ownTurn).map(m => m.san);
      return { plies: i, kind: ownTurn ? 'ich' : 'gegner', played: sans[i], expected: exp, fen: chess.fen(), ownTurn };
    }
    try { chess.move(sans[i]); } catch { return { plies: i, kind: 'partie', played: sans[i], expected: [], fen: chess.fen(), ownTurn }; }
  }
  return { plies: sans.length, kind: 'partie', played: null, expected: [], fen: chess.fen(), ownTurn: chess.turn() === side };
}

// ---------- Baum-Übersicht ----------

// Linien eines Kapitels als Baum: gemeinsame Anfänge einmal, Verzweigungen als Kinder.
// Knoten: {san, own, ply, note, children: [], lineIds: []}; die Wurzel hat san = null.
export function chapterTrie(chapter) {
  const root = { san: null, own: false, ply: -1, children: [], lineIds: [] };
  for (const line of chapter.lines) {
    let node = root;
    for (const p of line.plies) {
      let child = node.children.find(c => c.san === p.san);
      if (!child) node.children.push(child = { san: p.san, own: p.own, ply: p.i, note: p.note, children: [], lineIds: [] });
      if (!child.lineIds.includes(line.id)) child.lineIds.push(line.id);
      node = child;
    }
  }
  return root;
}

// ---------- Lernstufen pro Linie ----------

export const STAGES = { 1: 'Selber finden', 2: 'Was will der Gegner?', 3: 'Aus dem Kopf', 4: 'Mit Tempo', 5: 'Weiterspielen' };

// Aktuelle Stufe: gespeichert, sonst gelernte Linien ab Stufe 3, neue ab Stufe 1
export function lineStage(line, prog) {
  return prog.stages?.[line.id] || (prog.learnedLines?.[line.id] ? 3 : 1);
}

// Neue Stufe nach einem gewerteten Durchgang
export function nextStage(stage, { mistakes = 0, hinted = false, sparOk } = {}) {
  const clean = !mistakes && !hinted;
  if (stage === 5) return clean && sparOk !== false ? 5 : mistakes >= 2 ? 4 : 5;
  if (clean) return stage + 1;
  if (stage >= 3 && mistakes >= 2) return stage - 1;
  return stage;
}

// Welche eigenen Steine greift die gerade gezogene Gegnerfigur an? (König ausgenommen, Bauern nur wenn ungedeckt)
export function attackedBy(fen, ply) {
  const c = new Chess(fen);
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const moverValue = VALUE[c.get(ply.to)?.type] ?? 0;
  const out = [];
  for (const row of c.board()) for (const pc of row) {
    if (!pc || pc.color === ply.color || pc.type === 'k') continue;
    if (!c.attackers(pc.square, ply.color).includes(ply.to)) continue;
    const defended = c.isAttacked(pc.square, pc.color);
    if (!defended || VALUE[pc.type] > moverValue) out.push(pc.square);
  }
  return out;
}

// Stellen einer Linie, an denen der Gegner im Repertoire mehrere Züge hat, mit deiner jeweiligen Antwort
export function lineBranches(model, line) {
  const out = [];
  for (const p of line.plies) {
    if (p.own) continue;
    const rows = branchTable(model, line.side, p.fenBefore);
    if (rows.length > 1) out.push({ ply: p.i, before: line.moves.slice(0, p.i), rows: rows.map(r => ({ ...r, current: r.opp === p.san })) });
  }
  return out;
}
