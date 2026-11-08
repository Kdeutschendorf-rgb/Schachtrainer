// Die vier Vorausdenk-Übungen als Aufgaben-Läufer. Jeder Läufer bekommt einen Kontext (Brett, Seitenleiste,
// Aufgabendaten) und liefert per Promise ein Ergebnis {ok, id, level, hint, details}. Die Logik dahinter steckt in logic.js.

import { h, clear, figurine, formatLine, toast } from '../ui.js';
import * as engine from '../engine.js';
import { Chess } from '../../vendor/chess.js';
import * as L from './logic.js';

export const EXERCISES = {
  calc: {
    key: 'blind', title: 'Blind rechnen', maxLevel: 20,
    short: 'Züge im Kopf weiterspielen, ohne dass sich das Brett bewegt.',
    levelText: lv => {
      const c = L.CALC_LEVELS[lv];
      return `${c.n} ${c.n === 1 ? 'Halbzug' : 'Halbzüge'} im Kopf${c.hide ? ', Züge verschwinden' : ''}${c.boost ? ', schwerere Aufgaben' : ''}`;
    },
  },
  threats: {
    key: 'threats', title: 'Drohung erkennen', maxLevel: 9,
    short: 'Erst sehen, was der Gegner will, dann die beste Antwort finden.',
    levelText: n => `Aufgaben um ${Math.round((L.THREAT_RATINGS[n][0] + L.THREAT_RATINGS[n][1]) / 2)}`,
  },
  cct: {
    key: 'cct', title: 'Schach & Schlagen', maxLevel: 7,
    short: 'Alle Schachgebote und Schlagzüge finden. Die Gewohnheit vor jedem Zug.',
    levelText: n => `${L.CCT_RANGES[n][0]}–${L.CCT_RANGES[n][1]} Züge zu finden`,
  },
  loose: {
    key: 'loose', title: 'Ungedeckte Figuren', maxLevel: 7,
    short: 'Alle ungedeckten und hängenden Steine beider Seiten markieren.',
    levelText: n => `${L.LOOSE_RANGES[n][0]}–${L.LOOSE_RANGES[n][1]} Steine`,
  },
  cand: {
    key: 'cand', title: 'Kandidatenzüge', maxLevel: 6,
    short: 'Erst mehrere Züge nennen, dann vergleichen. Die Engine bewertet deine Auswahl.',
    levelText: n => `${L.candNeeded(n)} Kandidaten, Aufgaben um ${Math.round((L.CAND_RATINGS[n][0] + L.CAND_RATINGS[n][1]) / 2)}`,
  },
};

const COLOR_DE = { w: 'Weiß', b: 'Schwarz' };
const orient = c => (c === 'w' ? 'white' : 'black');
const FIG = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };

// Gemeinsame Bausteine für die Seitenleiste
function primaryButton(ctx, label, onclick) {
  const b = h('button.primary', { onclick }, label);
  ctx.setPrimary(b);
  return b;
}

// Wartet auf einen Klick: gibt ein Promise zurück, das der Knopf auflöst
function waitButton(ctx, label) {
  return new Promise(resolve => ctx.controls.append(primaryButton(ctx, label, () => resolve())));
}

// Puzzle-Zeilen filtern, mit breiter werdendem Wertungsfenster
function pickPuzzle(ctx, filter, [lo, hi]) {
  const notSeen = r => !ctx.seen.has(r[0]);
  for (const widen of [0, 150, 300, 600, 3000]) {
    const r = L.pickRow(ctx.rows, row => row[3] >= lo - widen && row[3] <= hi + widen && notSeen(row) && filter(row), ctx.rnd);
    if (r) { ctx.seen.add(r[0]); return r; }
  }
  return null;
}

function moveCount(row) {
  let n = 1;
  for (const ch of row[2]) if (ch === ' ') n++;
  return n;
}

// Wertungsfenster aus der Taktik-Wertung (falls vorhanden)
function baseWindow(ctx, below = 350, above = 100) {
  const r = Math.max(900, Math.min(1900, ctx.tacticsRating || 1200));
  return [r - below, r + above];
}

// ---------------------------------------------------------------------------
// 1. Blind rechnen
// ---------------------------------------------------------------------------
export async function runCalc(ctx, level) {
  const cfg = L.CALC_LEVELS[level];
  const [lo, hi] = baseWindow(ctx);
  const win = [lo + cfg.boost, hi + cfg.boost];
  // Sehr lange Aufgaben sind selten: Findet sich keine, wird die Zugfolge etwas kürzer
  let n = cfg.n, row = null;
  for (; n >= 1 && !row; n--) {
    const len = L.blindLength(n);
    row = pickPuzzle(ctx, r => moveCount(r) === len, win) || pickPuzzle(ctx, r => moveCount(r) >= len, win);
    if (row) break;
  }
  if (!row) throw new Error('Keine passende Aufgabe gefunden.');
  const task = L.makeBlindTask(L.parsePuzzle(row), n);
  const { board } = ctx;
  const t0 = Date.now();

  board.setPosition(task.startFen, { lastMove: task.lastMove || undefined, orientation: orient(task.color) });
  board.setMovable('none');

  ctx.prompt.replaceChildren(
    h('div', `Das Brett bleibt stehen. Stell dir ${n === 1 ? 'den nächsten Halbzug' : `die nächsten ${n} Halbzüge`} vor:`),
  );
  const lineEl = h('div.vision-line.moves');
  const after = h('div.vision-after.muted');
  ctx.body.replaceChildren(lineEl, after);

  // Züge nacheinander ansagen
  const sans = task.announced.map(a => a.san);
  const spans = [];
  sans.forEach((san, i) => {
    const ply = task.startPly + i;
    const num = ply % 2 === 0 ? `${ply / 2 + 1}. ` : i === 0 ? `${Math.floor(ply / 2) + 1}… ` : '';
    const s = h('span.vision-mv', num + figurine(san));
    spans.push(s);
    lineEl.append(s, ' ');
  });
  let shown = 0;
  const revealAll = () => { spans.forEach(s => s.classList.add('on')); shown = spans.length; };
  await new Promise(resolve => {
    const step = () => {
      if (shown >= spans.length) return resolve();
      spans[shown++].classList.add('on');
      ctx.timeout(step, shown === 1 ? 300 : cfg.ms);
    };
    ctx.controls.replaceChildren(h('button', { onclick: () => { revealAll(); resolve(); } }, 'Alle Züge zeigen'));
    step();
  });
  revealAll();
  // Ab Stufe 9 verschwinden die Züge: Du musst sie im Kopf behalten
  if (cfg.hide) {
    await ctx.sleep(cfg.ms);
    lineEl.replaceChildren(h('span.muted', 'Die Züge sind ausgeblendet. Behalte sie im Kopf.'));
  }

  // Jetzt den Zug in der vorgestellten Stellung finden
  after.textContent = `Jetzt ist ${COLOR_DE[task.color]} am Zug. Finde den besten Zug und zieh ihn auf dem Brett, `
    + 'als stünden die Figuren schon dort. Steht die Figur noch nicht auf ihrem Feld, klick erst das Startfeld, dann das Zielfeld.';
  let hint = false;
  const answer = await new Promise(resolve => {
    let pending = null;
    let done = false;
    const finish = mv => { if (!done) { done = true; resolve(mv); } };
    board.pickSquares(mv => finish(mv));
    ctx.setSelect(sq => {
      if (!pending) { pending = sq; board.setShapes([{ orig: sq, brush: 'yellow' }]); return; }
      if (sq === pending) { pending = null; board.setShapes([]); return; }
      finish({ from: pending, to: sq });
    });
    ctx.onHint = () => {
      hint = true;
      board.setShapes([{ orig: task.target.slice(0, 2), brush: 'blue' }]);
      toast(`Hinweis: Die Figur, die zieht, steht dann auf ${task.target.slice(0, 2)}.`);
    };
    ctx.controls.replaceChildren(
      h('button', { onclick: () => ctx.onHint() }, 'Hinweis (h)'),
      h('button', { onclick: () => finish(null) }, 'Weiß ich nicht'),
    );
  });
  board.pickSquares(null);
  board.setMovable('none');
  ctx.setSelect(null);
  ctx.onHint = null;

  const res = answer ? L.checkBlindAnswer(task, answer) : { ok: false };
  const sec = Math.round((Date.now() - t0) / 1000);
  if (cfg.hide) lineEl.replaceChildren(formatLine(sans, task.startPly));
  ctx.feedback(res.ok
    ? (res.altMate ? `Richtig: ${figurine(res.san)} ist auch Matt.` : `Richtig: ${figurine(task.targetSan)}!`)
    : `${answer ? (res.legal === false ? 'Dieser Zug geht in der vorgestellten Stellung nicht.' : `${figurine(res.san)} ist nicht die Lösung.`) + ' ' : ''}Gesucht war ${figurine(task.targetSan)}.`,
    res.ok ? 'good' : 'bad');
  board.flash(res.ok ? 'good' : 'bad');

  // Echte Stellung zur Kontrolle animieren
  const replay = async () => {
    board.setPosition(task.startFen, { lastMove: task.lastMove || undefined });
    for (const a of task.announced) {
      await ctx.sleep(650);
      board.move(a.uci);
    }
    await ctx.sleep(500);
    board.setShapes([{ orig: task.target.slice(0, 2), dest: task.target.slice(2, 4), brush: 'green' }]);
    await ctx.sleep(700);
    board.move(task.target);
  };
  ctx.controls.replaceChildren(h('button', { onclick: () => replay() }, 'Nochmal abspielen'));
  await replay();
  return { ok: res.ok, hint, id: task.id, level, seconds: sec, details: { target: task.targetSan } };
}

// ---------------------------------------------------------------------------
// 2. Drohung erkennen
// ---------------------------------------------------------------------------
export async function runThreats(ctx, level) {
  const { board } = ctx;
  ctx.prompt.replaceChildren(h('div.muted', 'Suche eine Stellung mit echter Drohung …'));
  ctx.body.replaceChildren();
  ctx.controls.replaceChildren();
  board.setMovable('none');

  // Kandidaten durchprobieren, bis die Engine eine echte Drohung bestätigt
  let found = null;
  for (let tries = 0; tries < 25 && !found; tries++) {
    const row = pickPuzzle(ctx, r => r[4].split(' ').some(t => L.THREAT_THEMES.includes(t)), L.THREAT_RATINGS[level]);
    if (!row) break;
    const p = L.parsePuzzle(row);
    if (new Chess(p.fen).inCheck()) continue;       // Gegner zieht nur aus dem Schach: keine echte Drohung
    const after = L.afterFirstMove(p);
    if (after.san.includes('x')) continue;          // Rückschlag-Stellungen sind keine Drohungsübung
    const nullFen = L.nullMoveFen(after.fen);
    if (!nullFen) continue;
    const user = L.turnOf(after.fen);
    const base = await engine.analyse(after.fen, { depth: 14 });
    if (ctx.stopped()) return null;
    const thr = await engine.analyse(nullFen, { depth: 14, multipv: 3 });
    if (ctx.stopped()) return null;
    if (!base.lines.length || !thr.lines.length) continue;
    const baseScore = base.lines[0].score;
    const lines = thr.lines.map(l => ({ ...l, gain: L.threatGain(baseScore, l.score, user) }));
    if (lines[0].gain < L.THREAT_MIN_GAIN) continue;
    // Die Drohung muss vom letzten Zug kommen, nicht schon vorher dagewesen sein
    if (!L.threatFromLastMove(after.lastMove, lines[0].pv[0])) continue;
    found = { p, after, nullFen, user, baseScore, lines };
  }
  if (!found) throw new Error('Keine Drohungs-Stellung gefunden.');
  const { p, after, nullFen, user, baseScore, lines } = found;
  const best = lines[0];
  const t0 = Date.now();
  let hint = false;

  // Schritt 1: Was droht?
  board.setPosition(nullFen, { lastMove: after.lastMove, orientation: orient(user) });
  board.setMovable('turn');
  ctx.prompt.replaceChildren(
    h('div', h('strong', 'Schritt 1: Was droht? '), `Dein Gegner hat gerade ${figurine(after.san)} gespielt.`),
    h('div.small.muted', `Stell dir vor, du passt. Zieh den Zug, den ${COLOR_DE[user === 'w' ? 'b' : 'w']} dann spielen würde.`),
  );
  const describeBest = L.describeThreat(nullFen, best.pv[0], best.pv.length > 1 ? best.score : null);
  ctx.controls.replaceChildren(h('button', { onclick: () => ctx.onHint() }, 'Hinweis (h)'));
  ctx.onHint = () => {
    hint = true;
    board.setShapes([{ orig: best.pv[0].slice(0, 2), brush: 'blue' }]);
    toast('Hinweis: Diese Figur führt die Drohung aus.');
  };
  const step1 = await new Promise(resolve => {
    board.setOnMove(m => {
      board.setMovable('none');
      resolve(m);
      return false;
    });
  });
  board.setOnMove(null);
  ctx.onHint = null;
  let gain = lines.find(l => l.pv[0] === step1.uci)?.gain;
  if (gain == null) {
    ctx.feedback('Prüfe deinen Zug …', 'info');
    const r = await engine.analyse(step1.fen, { depth: 12 });
    if (ctx.stopped()) return null;
    gain = r.lines.length ? L.threatGain(baseScore, r.lines[0].score, user)
      : (r.gameOver?.startsWith('1-0') && user === 'b') || (r.gameOver?.startsWith('0-1') && user === 'w') ? 100 : 0;
  }
  const ok1 = L.threatAccepted(gain, best.gain);
  const threatLine = best.san.slice(0, 3);
  ctx.feedback(ok1
    ? `Genau. ${describeBest}`
    : `${figurine(step1.san)} droht nicht genug. Die eigentliche Drohung: ${describeBest}`, ok1 ? 'good' : 'bad');
  ctx.body.replaceChildren(h('div.small.muted', 'Drohung mit Fortsetzung: ', h('span.moves', formatLine(threatLine, L.plyOf(nullFen)))));
  board.setShapes([{ orig: best.pv[0].slice(0, 2), dest: best.pv[0].slice(2, 4), brush: 'red' }]);
  ctx.controls.replaceChildren();
  await waitButton(ctx, 'Weiter zu Schritt 2');
  if (ctx.stopped()) return null;

  // Schritt 2: beste Antwort
  board.setPosition(after.fen, { lastMove: after.lastMove });
  const threatArrow = [{ orig: best.pv[0].slice(0, 2), dest: best.pv[0].slice(2, 4), brush: 'red' }];
  board.setShapes(threatArrow);
  board.setMovable('turn');
  ctx.prompt.replaceChildren(
    h('div', h('strong', 'Schritt 2: Deine Antwort. '), 'Der rote Pfeil zeigt die Drohung.'),
    h('div.small.muted', 'Finde den besten Zug. Manchmal ist Angriff die beste Verteidigung.'),
  );
  ctx.clearFeedback();
  const solution = p.moves[1];
  const solSan = new Chess(after.fen).move(L.uciObj(solution)).san;
  ctx.controls.replaceChildren(h('button', { onclick: () => ctx.onHint() }, 'Hinweis (h)'));
  ctx.onHint = () => {
    hint = true;
    board.setShapes([...threatArrow, { orig: solution.slice(0, 2), brush: 'blue' }]);
  };
  const step2 = await new Promise(resolve => {
    board.setOnMove(m => { board.setMovable('none'); resolve(m); });
  });
  board.setOnMove(null);
  ctx.onHint = null;
  let ok2 = step2.uci === solution || board.chess.isCheckmate();
  if (!ok2) {
    ctx.feedback('Prüfe deinen Zug …', 'info');
    const r = await engine.analyse(step2.fen, { depth: 14 });
    if (ctx.stopped()) return null;
    if (r.lines.length) ok2 = L.winChance(baseScore, user) - L.winChance(r.lines[0].score, user) <= 6;
  }
  ctx.feedback(ok2
    ? (step2.uci === solution ? `Stark: ${figurine(step2.san)}!` : `${figurine(step2.san)} ist auch gut. Die Musterlösung war ${figurine(solSan)}.`)
    : `${figurine(step2.san)} reicht nicht. Besser war ${figurine(solSan)}.`, ok2 ? 'good' : 'bad');
  board.flash(ok2 ? 'good' : 'bad');
  if (!ok2) {
    board.undo();
    board.setShapes([...threatArrow, { orig: solution.slice(0, 2), dest: solution.slice(2, 4), brush: 'green' }]);
  }
  ctx.controls.replaceChildren(
    h('a.btn', { href: `https://lichess.org/training/${p.id}`, target: '_blank', rel: 'noopener' }, 'Auf Lichess ansehen'),
  );
  return {
    ok: ok1 && ok2, hint, id: p.id, level, seconds: Math.round((Date.now() - t0) / 1000),
    details: { step1: ok1, step2: ok2 },
  };
}

// ---------------------------------------------------------------------------
// 3. Schach & Schlagen (CCT)
// ---------------------------------------------------------------------------
export async function runCct(ctx, level) {
  const { board } = ctx;
  const [lo, hi] = L.CCT_RANGES[level];
  let pos = null;
  for (let tries = 0; tries < 400 && !pos; tries++) {
    const row = pickPuzzle(ctx, () => true, baseWindow(ctx, 600, 400));
    if (!row) break;
    const after = L.afterFirstMove(L.parsePuzzle(row));
    const targets = L.checksAndCaptures(after.fen);
    if (targets.length >= lo && targets.length <= hi) pos = { id: row[0], ...after, targets };
  }
  if (!pos) throw new Error('Keine passende Stellung gefunden.');
  const user = L.turnOf(pos.fen);
  const t0 = Date.now();
  const found = new Map();
  let wrong = 0;
  let hint = false;

  board.setPosition(pos.fen, { lastMove: pos.lastMove, orientation: orient(user) });
  board.setMovable('turn');
  const counter = h('div.vision-counter');
  const list = h('div.vision-found.moves');
  ctx.prompt.replaceChildren(
    h('div', `${COLOR_DE[user]} ist am Zug. Finde `, h('strong', 'alle Schachgebote und alle Schlagzüge'), '.'),
    h('div.small.muted', 'Zieh jeden Kandidaten auf dem Brett. Er wird notiert und zurückgenommen. Gute oder schlechte Züge, egal: alle zählen.'),
  );
  ctx.body.replaceChildren(counter, list);
  const arrows = () => [...found.values()].map(t => ({ orig: t.from, dest: t.to, brush: t.check ? 'blue' : 'green' }));
  const render = () => {
    counter.textContent = `${found.size}/${pos.targets.length} gefunden${wrong ? ` · ${wrong} daneben` : ''}`;
    list.replaceChildren(...[...found.values()].map(t => h('span.pill' + (t.check ? '.check' : '.good'), figurine(t.san))));
    board.setShapes(arrows());
  };
  render();

  await new Promise(resolve => {
    board.setOnMove(m => {
      const key = m.from + m.to;
      const t = pos.targets.find(x => x.key === key);
      if (!t) {
        wrong++;
        board.flash('bad');
        ctx.feedback(`${figurine(m.san)} ist weder Schach noch Schlagzug.`, 'bad');
      } else if (found.has(key)) {
        ctx.feedback(`${figurine(t.san)} hast du schon.`, 'info');
      } else {
        found.set(key, t);
        board.flash('good');
        ctx.clearFeedback();
      }
      // Nach dem Zurücknehmen Pfeile neu zeichnen
      ctx.timeout(() => { render(); if (found.size === pos.targets.length) resolve(); }, 0);
      return false;
    });
    ctx.onHint = () => {
      const miss = pos.targets.find(t => !found.has(t.key));
      if (!miss) return;
      hint = true;
      board.setShapes([...arrows(), { orig: miss.from, brush: 'yellow' }]);
      toast('Hinweis: Von diesem Feld aus geht noch etwas.');
    };
    ctx.controls.replaceChildren(
      primaryButton(ctx, 'Fertig, auflösen', () => resolve()),
      h('button', { onclick: () => ctx.onHint() }, 'Hinweis (h)'),
    );
  });
  board.setOnMove(null);
  board.setMovable('none');
  ctx.onHint = null;

  const missed = pos.targets.filter(t => !found.has(t.key));
  const ok = !missed.length && wrong <= 1;
  board.setShapes([...arrows(), ...missed.map(t => ({ orig: t.from, dest: t.to, brush: 'red' }))]);
  list.replaceChildren(
    ...[...found.values()].map(t => h('span.pill' + (t.check ? '.check' : '.good'), figurine(t.san))),
    ...missed.map(t => h('span.pill.bad', { title: 'übersehen' }, figurine(t.san))),
  );
  const sec = Math.round((Date.now() - t0) / 1000);
  ctx.feedback(missed.length
    ? `${found.size} von ${pos.targets.length} gefunden. Übersehen (rot): ${missed.map(t => figurine(t.san)).join(', ')}.`
    : `Alle ${pos.targets.length} gefunden in ${sec} s${wrong ? `, ${wrong}× daneben` : ''}.`, ok ? 'good' : missed.length ? 'bad' : 'warn');
  ctx.controls.replaceChildren(h('div.small.muted', 'Grün = Schlagzug, Blau = Schach, Rot = übersehen.'));
  return { ok, hint, id: pos.id, level, seconds: sec, details: { found: found.size, total: pos.targets.length, wrong } };
}

// ---------------------------------------------------------------------------
// 4. Ungedeckte Figuren
// ---------------------------------------------------------------------------
export async function runLoose(ctx, level) {
  const { board } = ctx;
  const [lo, hi] = L.LOOSE_RANGES[level];
  let pos = null;
  for (let tries = 0; tries < 400 && !pos; tries++) {
    const row = pickPuzzle(ctx, () => true, baseWindow(ctx, 600, 400));
    if (!row) break;
    const after = L.afterFirstMove(L.parsePuzzle(row));
    const targets = L.loosePieces(after.fen);
    if (targets.length >= lo && targets.length <= hi) pos = { id: row[0], ...after, targets };
  }
  if (!pos) throw new Error('Keine passende Stellung gefunden.');
  const user = L.turnOf(pos.fen);
  const t0 = Date.now();
  const game = new Chess(pos.fen);
  const selected = new Set();
  let hint = false;

  board.setPosition(pos.fen, { lastMove: pos.lastMove, orientation: orient(user) });
  board.setMovable('none');
  ctx.prompt.replaceChildren(
    h('div', 'Klick alle Steine an (beide Farben), die ', h('strong', 'ungedeckt'), ' sind oder ', h('strong', 'hängen'), '.'),
    h('div.small.muted', 'Ungedeckt: Figur ohne Deckung (Bauern und Könige zählen hier nicht). '
      + 'Hängt: Schlagen gewinnt Material, z. B. ein Springer, den ein Bauer angreift, oder mehr Angreifer als Verteidiger. Auch Bauern.'),
  );
  const counter = h('div.vision-counter', '0 markiert');
  ctx.body.replaceChildren(counter);
  const draw = () => {
    board.setShapes([...selected].map(sq => ({ orig: sq, brush: 'yellow' })));
    counter.textContent = `${selected.size} markiert`;
  };
  await new Promise(resolve => {
    ctx.setSelect(sq => {
      const piece = game.get(sq);
      if (!piece || piece.type === 'k') return;
      if (selected.has(sq)) selected.delete(sq); else selected.add(sq);
      draw();
    });
    ctx.onHint = () => {
      hint = true;
      const w = pos.targets.filter(t => t.color === 'w').length;
      toast(`Hinweis: Weiß hat ${w}, Schwarz hat ${pos.targets.length - w} solche ${pos.targets.length === 1 ? 'Stein' : 'Steine'}.`);
    };
    ctx.controls.replaceChildren(
      primaryButton(ctx, 'Prüfen', () => resolve()),
      h('button', { onclick: () => ctx.onHint() }, 'Hinweis (h)'),
    );
  });
  ctx.setSelect(null);
  ctx.onHint = null;

  const g = L.gradeSelection(pos.targets.map(t => t.square), [...selected]);
  board.setShapes([
    ...g.hit.map(sq => ({ orig: sq, brush: 'green' })),
    ...g.missed.map(sq => ({ orig: sq, brush: 'red' })),
    ...g.extra.map(sq => ({ orig: sq, brush: 'blue' })),
  ]);
  const sec = Math.round((Date.now() - t0) / 1000);
  const name = t => `${FIG[t.type]}${t.square} (${COLOR_DE[t.color]})`;
  const why = t => t.reason === 'hängt'
    ? `hängt: angegriffen von ${t.attackers.join(', ')}${t.defenders.length ? `, gedeckt nur von ${t.defenders.join(', ')}` : ', ungedeckt'}`
    : `ungedeckt${t.attackers.length ? ` und angegriffen von ${t.attackers.join(', ')}` : ''}`;
  ctx.body.replaceChildren(h('div.vision-solution',
    h('ul.vision-loose', pos.targets.map(t =>
      h('li', { class: g.missed.includes(t.square) ? 'miss' : 'hit' }, h('strong', name(t)), ' ', why(t)))),
    g.extra.length ? h('div.small.muted', `Zu viel markiert (blau): ${g.extra.join(', ')}. Diese Steine sind ausreichend gedeckt.`) : null));
  ctx.feedback(g.ok ? `Alles richtig in ${sec} s.` : `${g.hit.length} von ${pos.targets.length} richtig.`, g.ok ? 'good' : 'bad');
  ctx.controls.replaceChildren(h('div.small.muted', 'Grün = richtig, Rot = übersehen, Blau = zu viel.'));
  return { ok: g.ok, hint, id: pos.id, level, seconds: sec, details: { hit: g.hit.length, missed: g.missed.length, extra: g.extra.length } };
}

export const RUNNERS = { calc: runCalc, threats: runThreats, cct: runCct, loose: runLoose, cand: runCand };

// Kleiner Helfer für die Seitenleiste: Feedback-Box ersetzen
export function setFeedback(el, text, kind) {
  clear(el);
  if (text) el.append(h('div.feedback.' + kind, text));
}

// ---------------------------------------------------------------------------
// 5. Kandidatenzüge
// ---------------------------------------------------------------------------
export async function runCand(ctx, level) {
  const { board } = ctx;
  ctx.prompt.replaceChildren(h('div.muted', 'Suche eine Stellung …'));
  ctx.body.replaceChildren();
  ctx.controls.replaceChildren();
  board.setMovable('none');
  const row = pickPuzzle(ctx, () => true, L.CAND_RATINGS[level]);
  if (!row) throw new Error('Keine passende Stellung gefunden.');
  const after = L.afterFirstMove(L.parsePuzzle(row));
  const user = L.turnOf(after.fen);
  const need = L.candNeeded(level);
  const t0 = Date.now();
  board.setPosition(after.fen, { orientation: orient(user) });
  board.setMovable('turn');
  ctx.prompt.replaceChildren(
    h('div', h('strong', `Nenne ${need} Kandidatenzüge. `), `${COLOR_DE[user]} ist am Zug.`),
    h('div.small.muted', 'Zieh jeden Zug, den du ernsthaft erwägst. Er wird notiert und das Brett springt zurück.'),
  );
  const list = h('div.moves');
  ctx.body.replaceChildren(list);
  const cands = [];
  const go = h('button.primary', { disabled: true }, 'Bewerten');
  await new Promise(resolve => {
    go.onclick = () => resolve();
    ctx.controls.replaceChildren(go);
    board.setOnMove(m => {
      if (!cands.some(c => c.uci === m.uci) && cands.length < 3) cands.push(m);
      list.textContent = cands.map(c => figurine(c.san)).join('   ');
      go.disabled = cands.length < need;
      board.setShapes(cands.map(c => ({ orig: c.uci.slice(0, 2), dest: c.uci.slice(2, 4), brush: 'yellow' })));
      return false;
    });
  });
  if (ctx.stopped()) return null;
  board.setOnMove(null);
  board.setMovable('none');
  ctx.controls.replaceChildren();
  ctx.feedback('Die Engine vergleicht deine Züge …', 'info');
  const base = await engine.analyse(after.fen, { movetime: 1000, multipv: 3 });
  if (ctx.stopped()) return null;
  const bestLine = base.lines[0];
  const bestWin = L.winChance(bestLine.score, user);
  const rated = [];
  for (const c of cands) {
    const r = await engine.analyse(c.fen, { movetime: 500 });
    if (ctx.stopped()) return null;
    const win = r.lines.length ? L.winChance(r.lines[0].score, user)
      : new Chess(c.fen).isCheckmate() ? 100 : 50;
    const loss = Math.max(0, bestWin - win);
    rated.push({ ...c, loss, label: L.candLabel(loss) });
  }
  rated.sort((a, b) => a.loss - b.loss);
  const ok = rated[0].loss <= 8;   // Entscheidend: War der beste Zug dabei? Schwache Kandidaten sind nur Ideen
  const wild = rated.some(c => c.loss > 20);
  ctx.body.replaceChildren(...[h('ul', rated.map(c => h('li', h('strong', figurine(c.san)), ' ', h('span.small', c.label.text)))),
    rated[0].loss > 3 ? h('div.small', 'Der beste Zug war ', h('strong', figurine(bestLine.san[0])), '.') : null].filter(Boolean));
  ctx.feedback(ok ? `Gute Auswahl: Der beste oder ein gleichwertiger Zug war dabei.${wild ? ' Prüf bei den anderen auch die Antwort des Gegners.' : ''}` : 'Der beste Zug war nicht unter deinen Kandidaten.', ok ? 'good' : 'bad');
  board.flash(ok ? 'good' : 'bad');
  board.setShapes([{ orig: bestLine.pv[0].slice(0, 2), dest: bestLine.pv[0].slice(2, 4), brush: 'green' }]);
  return { ok, hint: false, id: row[0], level, seconds: Math.round((Date.now() - t0) / 1000), details: { cands: rated.map(c => c.san) } };
}
