// Eröffnungen: Übersicht, Lernen, Wiederholen (SRS), Explorer, Katalog, Sparring.
// Unterseiten über Routen-Parameter, z. B. #/eroeffnungen?tab=lernen&line=<id>, ?tab=katalog&id=<id>,
// ?tab=explorer&side=b&chapter=<id>, ?tab=sparring&line=<id>.
// Dazu runBlock() für den Tagesplan: fällige Karten → neue Züge bis zum Tageslimit → weitere neue Linien → gelernte Linien üben.

import { h, clear, loadCss, countdown, toast, loadPlayerData, figurine } from '../ui.js';
import { pickDueLine, pickNewLine, newLineQueue, canLearn, totals, dueLines, drillQueue } from '../openings/logic.js';
import { loadModel, loadCatalog, progress, fileProblem, FILES } from '../openings/data.js';
import { createLineTrainer } from '../openings/trainer.js';
import { createExplorer } from '../openings/explorer.js';
import { createCatalog } from '../openings/catalog.js';
import { createSparring } from '../openings/sparring.js';
import { createDrill } from '../openings/drill.js';
import { renderTree } from '../openings/tree.js';
import { renderGameCheck } from '../openings/gamecheck.js';
import { analyse, formatScore } from '../engine.js';
import * as store from '../store.js';
import { renderOverview } from '../openings/overview.js';
import { repertoireNotice, emptyState, button } from '../openings/widgets.js';

const TABS = [
  ['uebersicht', 'Übersicht'],
  ['lernen', 'Lernen'],
  ['wiederholen', 'Wiederholen'],
  ['weichen', 'Weichen'],
  ['baum', 'Baum'],
  ['partien', 'Partie-Check'],
  ['explorer', 'Explorer'],
  ['katalog', 'Alle Eröffnungen'],
  ['sparring', 'Sparring'],
];

function hashFor(tab, params = {}) {
  const q = new URLSearchParams();
  if (tab && tab !== 'uebersicht') q.set('tab', tab);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, v);
  const s = q.toString();
  return '#/eroeffnungen' + (s ? '?' + s : '');
}

function go(tab, params) {
  location.hash = hashFor(tab, params);
}

// URL anpassen, ohne die Ansicht neu zu laden
function setUrl(tab, params) {
  history.replaceState(null, '', hashFor(tab, params));
}

function fileNotice(name, what) {
  const kind = fileProblem(name);
  return emptyState(
    kind === 'fehlerhaft' ? `${what}: Datei fehlerhaft` : `${what}: noch keine Daten`,
    kind === 'fehlerhaft'
      ? `${name} konnte nicht gelesen werden. Vermutlich wird sie gerade erstellt. Lade die Seite später neu.`
      : `${name} gibt es noch nicht. Sobald sie erstellt ist, funktioniert dieser Bereich (Seite neu laden).`,
    button({ label: 'Zur Übersicht', onClick: () => go('uebersicht') }));
}

// ---------------------------------------------------------------------------
// Ansicht

export async function mount(el, params = {}) {
  loadCss('css/openings.css');
  const tab = TABS.some(t => t[0] === params.tab) ? params.tab : 'uebersicht';
  const tabsEl = h('nav.op-tabs');
  const content = h('div.op-content', h('div.muted', 'Lade Repertoire …'));
  const root = h('div.op-root', tabsEl, content);
  el.append(root);

  let sub = null;          // aktive Komponente mit destroy()
  const setSub = s => { sub?.destroy?.(); sub = s; };
  const cleanup = () => setSub(null);

  const model = await loadModel();
  if (!root.isConnected) return cleanup;

  const due = totals(model, progress()).due;
  for (const [id, label] of TABS) {
    tabsEl.append(h('a.op-tab' + (id === tab ? '.active' : ''), { href: hashFor(id) },
      label, id === 'wiederholen' && due ? h('span.op-badge', String(due)) : null));
  }
  clear(content);

  // ----- Übersicht -----
  if (tab === 'uebersicht') {
    renderOverview(content, { model, go, openChapter: params.chapter });
    return cleanup;
  }

  // ----- Lernen -----
  if (tab === 'lernen') {
    const filter = { chapterId: params.chapter, side: params.side };
    const notice = repertoireNotice(model);
    const startLearn = line => {
      clear(content);
      if (notice && !line) content.append(notice);
      if (!line) {
        const queue = newLineQueue(model, progress(), filter);
        if (!model.lines.length) {
          content.append(emptyState('Noch kein Repertoire', 'Die Repertoire-Dateien fehlen noch. Schau solange in den Katalog.',
            button({ label: 'Alle Eröffnungen', onClick: () => go('katalog') })));
        } else if (queue.length) {
          const c = canLearn(queue[0], progress());
          content.append(emptyState('Tageslimit erreicht',
            c.limit > 0
              ? `Du hast heute schon ${c.used} neue Züge gelernt (Limit ${c.limit}). Wiederholen bringt jetzt mehr als Neues.`
              : 'Dein Limit für neue Züge pro Tag steht auf 0 (einstellbar in der Übersicht).',
            h('div.row',
              button({ label: 'Wiederholen', primary: true, onClick: () => go('wiederholen') }),
              button({ label: 'Trotzdem eine Linie lernen', onClick: () => startLearn(queue[0]) }))));
        } else {
          content.append(emptyState('Alles gelernt', 'Du hast alle Linien in diesem Bereich gelernt. Jetzt heißt es wiederholen und sparren.',
            h('div.row', button({ label: 'Wiederholen', primary: true, onClick: () => go('wiederholen') }))));
        }
        return;
      }
      setUrl('lernen', { line: line.id });
      const wrap = h('div');
      content.append(wrap);
      setSub(createLineTrainer(wrap, {
        model, line, mode: 'learn',
        onExit: () => go('uebersicht'),
        actions: () => {
          const next = pickNewLine(model, progress(), undefined, filter);
          return [
            next ? { label: 'Nächste Linie ⏎', primary: true, onClick: () => startLearn(next) }
              : { label: 'Zur Übersicht ⏎', primary: true, onClick: () => go('uebersicht') },
            { label: 'Sparring ab hier', onClick: () => go('sparring', { line: line.id }) },
            next ? { label: 'Übersicht', onClick: () => go('uebersicht') } : null,
          ].filter(Boolean);
        },
      }));
    };
    let line = params.line ? model.lineById.get(params.line) : null;
    if (params.line && !line) toast('Diese Linie gibt es nicht (mehr).', 'bad');
    line ||= pickNewLine(model, progress(), undefined, filter);
    startLearn(line);
    return cleanup;
  }

  // ----- Wiederholen: fällige Stellungen gemischt -----
  if (tab === 'wiederholen' && !params.line) {
    const filter = { chapterId: params.chapter, side: params.side };
    const items = drillQueue(model, progress(), { mode: 'due', filter });
    if (!items.length) {
      const next = pickNewLine(model, progress());
      content.append(emptyState('Nichts fällig', 'Gerade ist keine Stellung fällig. Übe die Weichen oder lerne eine neue Linie.',
        h('div.row',
          button({ label: 'Weichen üben', primary: true, onClick: () => go('weichen') }),
          next ? button({ label: 'Neue Linie lernen', onClick: () => go('lernen') }) : null)));
      return cleanup;
    }
    const wrap = h('div');
    content.append(wrap);
    setSub(createDrill(wrap, {
      model, items, title: 'Wiederholen',
      actions: () => [
        { label: 'Weichen üben ⏎', primary: true, onClick: () => go('weichen') },
        { label: 'Übersicht', onClick: () => go('uebersicht') },
      ],
    }));
    return cleanup;
  }

  // ----- Weichen: Stellungen nach verschiedenen Gegnerzügen -----
  if (tab === 'weichen') {
    const filter = { chapterId: params.chapter, side: params.side };
    let items;
    if (params.keys) {
      const want = new Set(params.keys.split(','));
      const seen = new Set();
      items = (model.items || []).filter(it => want.has(it.key) && !seen.has(it.key) && seen.add(it.key));
    } else {
      items = drillQueue(model, progress(), { mode: 'branches', limit: 10, filter });
    }
    if (!items.length) {
      content.append(emptyState('Noch keine Weichen', 'Weichen-Training gibt es für Stellungen, die du schon gelernt hast. Lerne zuerst ein paar Linien.',
        button({ label: 'Neue Linie lernen', primary: true, onClick: () => go('lernen') })));
      return cleanup;
    }
    const wrap = h('div');
    content.append(wrap);
    setSub(createDrill(wrap, {
      model, items, title: params.keys ? 'Partie-Check' : 'Weichen',
      actions: () => [
        { label: 'Noch eine Runde ⏎', primary: true, onClick: () => { location.hash = hashFor('weichen', { chapter: params.chapter, side: params.side }); } },
        { label: 'Baum ansehen', onClick: () => go('baum', { chapter: items[0]?.chapterId }) },
      ],
    }));
    return cleanup;
  }

  // ----- Baum -----
  if (tab === 'baum') {
    renderTree(content, {
      model, chapterId: params.chapter,
      onChapter: id => go('baum', { chapter: id }),
      onPractice: id => go('wiederholen', { line: id }),
      onExplore: (moves, side) => go('explorer', { side, chapter: params.chapter }),
    });
    return cleanup;
  }

  // ----- Partie-Check -----
  if (tab === 'partien') {
    const summary = await loadPlayerData('analysis_summary.json').catch(() => null);
    if (!root.isConnected) return cleanup;
    const bots = (store.get('play').games || []).slice(-20).reverse()
      .map(g => ({ ...g, tc: 'bot', opponent: `Bot ${g.botElo}` }));
    const games = [...bots, ...(summary?.recentGames || [])]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    renderGameCheck(content, {
      model, games,
      onDrill: keys => go('weichen', { keys: keys.join(',') }),
      onEngine: async fen => {
        try {
          const r = await analyse(fen, { depth: 16, multipv: 1 });
          const l = r.lines[0];
          return l ? `Engine-Vorschlag: ${figurine(l.san[0])} (${formatScore(l.score)})` : 'Keine Antwort.';
        } catch { return 'Engine nicht verfügbar.'; }
      },
    });
    return cleanup;
  }

  // ----- Wiederholen einer einzelnen Linie -----
  if (tab === 'wiederholen') {
    const filter = { chapterId: params.chapter, side: params.side };
    const session = { lines: 0, total: 0, correct: 0 };
    const startReview = (line, single) => {
      clear(content);
      if (!line) {
        const next = pickNewLine(model, progress());
        content.append(emptyState(
          session.lines ? 'Alles wiederholt!' : 'Nichts fällig',
          session.lines
            ? `${session.lines} Linie${session.lines === 1 ? '' : 'n'}, ${session.correct} von ${session.total} Zügen auf Anhieb richtig.`
            : 'Gerade ist keine Karte fällig. Lerne eine neue Linie.',
          h('div.row',
            next ? button({ label: 'Neue Linie lernen', primary: true, onClick: () => go('lernen') }) : null,
            button({ label: 'Übersicht', onClick: () => go('uebersicht') }))));
        return;
      }
      setUrl('wiederholen', single ? { line: line.id } : { chapter: params.chapter, side: params.side });
      const wrap = h('div');
      content.append(wrap);
      setSub(createLineTrainer(wrap, {
        model, line, mode: 'review',
        onExit: () => go('uebersicht'),
        onFinish: r => { session.lines++; session.total += r.total; session.correct += r.correct; },
        actions: () => {
          const left = dueLines(model, progress(), undefined, filter);
          const nextLine = left.find(x => x.line.id !== line.id)?.line || left[0]?.line || null;
          return [
            nextLine ? { label: `Nächste Linie (${left.reduce((s, x) => s + x.due, 0)} fällig) ⏎`, primary: true, onClick: () => startReview(nextLine) }
              : { label: 'Fertig ⏎', primary: true, onClick: () => startReview(null) },
            { label: 'Sparring ab hier', onClick: () => go('sparring', { line: line.id }) },
          ];
        },
      }));
    };
    if (params.line) {
      const line = model.lineById.get(params.line);
      if (!line) toast('Diese Linie gibt es nicht (mehr).', 'bad');
      startReview(line || pickDueLine(model, progress(), undefined, filter), !!line);
    } else {
      const notice = repertoireNotice(model);
      if (notice) content.append(notice);
      startReview(pickDueLine(model, progress(), undefined, filter));
    }
    return cleanup;
  }

  // ----- Explorer -----
  if (tab === 'explorer') {
    const notice = repertoireNotice(model);
    if (notice) content.append(notice);
    const wrap = h('div');
    content.append(wrap);
    const moves = params.moves ? params.moves.split(/[\s,]+/).filter(Boolean) : [];
    setSub(createExplorer(wrap, {
      model, side: params.side === 'b' ? 'b' : 'w', moves, chapterId: params.chapter,
      onLearn: l => go('lernen', { line: l.id }),
      onPractice: l => go('wiederholen', { line: l.id }),
      onSpar: (l, mv, side) => go('sparring', l && l.moves.join(' ') === mv.join(' ') ? { line: l.id } : { moves: mv.join(' '), side }),
      onSide: side => setUrl('explorer', { side }),
    }));
    return cleanup;
  }

  // ----- Katalog -----
  if (tab === 'katalog') {
    const catalog = await loadCatalog();
    if (!root.isConnected) return cleanup;
    if (!catalog?.length) { content.append(fileNotice(FILES.catalog, 'Alle Eröffnungen')); return cleanup; }
    const wrap = h('div');
    content.append(wrap);
    setSub(createCatalog(wrap, {
      catalog, focusId: params.id,
      onSelect: id => setUrl('katalog', { id }),
    }));
    return cleanup;
  }


  // ----- Sparring -----
  if (tab === 'sparring') {
    let line = params.line ? model.lineById.get(params.line) : null;
    const moves = line ? line.moves : (params.moves ? params.moves.split(/[\s,]+/).filter(Boolean) : null);
    if (!moves) {
      // Auswahl: gelernte Linien zuerst
      const prog = progress();
      const lines = [...model.lines].sort((a, b) => (!!prog.learnedLines[b.id] - !!prog.learnedLines[a.id]) || a.priority - b.priority);
      content.append(h('div.card',
        h('h2', 'Sparring'),
        h('p.muted', 'Wähl eine Linie. Du spielst ab ihrem Ende gegen die Engine weiter und übst die typischen Pläne.'),
        lines.length
          ? h('div.op-lines', lines.slice(0, 60).map(l => h('div.op-linerow',
            h('div.op-linerow-main', h('div', l.name), h('div.muted.small', model.chapterById.get(l.chapterId)?.title || '')),
            prog.learnedLines[l.id] ? h('span.pill.good', 'gelernt') : h('span.pill', 'neu'),
            button({ label: 'Sparring', onClick: () => go('sparring', { line: l.id }) }))))
          : h('div.muted', 'Noch keine Repertoire-Linien vorhanden.')));
      return cleanup;
    }
    const side = line ? line.side : (params.side === 'b' ? 'b' : 'w');
    const wrap = h('div');
    content.append(wrap);
    try {
      setSub(createSparring(wrap, {
        moves, side,
        title: line ? `${model.chapterById.get(line.chapterId)?.title || ''} – ${line.name}` : 'Sparring',
        plan: line?.plan,
        onExit: () => go('uebersicht'),
      }));
    } catch (err) {
      clear(content).append(emptyState('Sparring nicht möglich', 'Die Zugfolge ist fehlerhaft: ' + err.message));
    }
    return cleanup;
  }

  return cleanup;
}

// ---------------------------------------------------------------------------
// Block für den Tagesplan

export function runBlock(el, { minutes = 10, mode = 'review', onDone } = {}) {
  loadCss('css/openings.css');
  const started = Date.now();
  const stats = { lines: 0, newLines: 0, newCards: 0, moves: 0, correct: 0 };
  const doneKeys = new Set();   // in diesem Block schon geübte Stellungen
  let lastWasDrill = false;
  let finished = false;
  let alive = true;
  let timeUp = false;
  let busy = false;        // läuft gerade eine Aufgabe (darf noch fertig werden)?
  let sub = null;
  let model = null;

  const phaseEl = h('span.op-block-phase', 'Eröffnungen');
  const timeNote = h('span.muted.small');
  const timer = countdown(Math.max(1, minutes) * 60, {
    onEnd: () => {
      timeUp = true;
      if (!busy) finish();
      else timeNote.textContent = 'Zeit um: diese Aufgabe noch zu Ende machen.';
    },
  });
  const stage = h('div.op-block-stage', h('div.muted', 'Lade Repertoire …'));
  el.append(h('div.op-root.op-block',
    h('div.row.op-block-head', phaseEl, timeNote, h('span.spacer'), timer.el,
      button({ label: 'Block beenden', onClick: () => finish() })),
    stage));

  const setSub = s => { sub?.destroy?.(); sub = s; };

  function finish() {
    if (finished || !alive) return;   // nach dem Aufräumen kein onDone mehr
    finished = true;
    busy = false;
    timer.stop();
    setSub(null);
    clear(stage).append(h('div.muted', 'Block beendet.'));
    const summary = {
      type: 'openings', mode,
      minutes: Math.round((Date.now() - started) / 6000) / 10,
      done: stats.moves,
      correct: stats.correct,
      details: { ...stats },
    };
    onDone?.(summary);
  }

  async function next() {
    if (!alive || finished) return;
    if (timeUp) { finish(); return; }
    model ||= await loadModel();
    if (!alive || finished) return;
    const prog = progress();
    const notDone = list => list.filter(i => !doneKeys.has(i.key));
    const due = notDone(drillQueue(model, prog, { mode: 'due' }));
    if (due.length) return runDrill(due.slice(0, 6), `Eröffnungen · Wiederholen (${due.length} fällig)`);
    const fresh = pickNewLine(model, prog);
    if (fresh) return runLine(fresh, 'learn');
    // Tageslimit erreicht: abwechselnd Weichen üben und weitere neue Linien
    const branches = () => notDone(drillQueue(model, prog, { mode: 'branches', limit: 6 }));
    if (!lastWasDrill && branches().length) return runDrill(branches(), 'Eröffnungen · Weichen');
    const more = newLineQueue(model, prog)[0];
    if (more) return runLine(more, 'learn', 'Eröffnungen · Weitere neue Linie');
    if (branches().length) return runDrill(branches(), 'Eröffnungen · Weichen');
    const old = practiceLine();
    if (old) return runLine(old, 'review', 'Eröffnungen · Gelernte Linie üben');
    clear(stage).append(h('div.feedback.warn', 'Keine Eröffnungslinien gefunden. Der Block endet gleich.'));
    setTimeout(finish, 3000);
  }

  // Stellungstraining (fällige Stellungen oder Weichen) als Teil des Blocks
  function runDrill(items, label) {
    lastWasDrill = true;
    phaseEl.textContent = label;
    busy = true;
    clear(stage);
    const wrap = h('div');
    stage.append(wrap);
    setSub(createDrill(wrap, {
      model, items, title: label.includes('Weichen') ? 'Weichen' : 'Wiederholen',
      onFinish: st => {
        busy = false;
        for (const it of items) doneKeys.add(it.key);
        stats.moves += st.total;
        stats.correct += st.correct;
      },
      actions: () => [{ label: timeUp ? 'Block abschließen ⏎' : 'Weiter ⏎', primary: true, onClick: step }],
    }));
  }

  function runLine(line, lineMode, label) {
    lastWasDrill = false;
    const t = totals(model, progress());
    phaseEl.textContent = label || (lineMode === 'review'
      ? `Eröffnungen · Wiederholen (${t.due} fällig)`
      : `Eröffnungen · Neue Linie (${t.newToday}/${t.newPerDay} neue Züge heute)`);
    busy = true;
    clear(stage);
    const wrap = h('div');
    stage.append(wrap);
    setSub(createLineTrainer(wrap, {
      model, line, mode: lineMode,
      onFinish: r => {
        busy = false;
        stats.lines++;
        if (lineMode === 'learn') stats.newLines++;
        stats.newCards += r.saved?.newCards || 0;
        stats.moves += r.total;
        stats.correct += r.correct;
      },
      actions: () => [{ label: timeUp ? 'Block abschließen ⏎' : 'Weiter ⏎', primary: true, onClick: step }],
    }));
  }

  // Alles gelernt und nichts fällig: gelernte Linien üben, die am längsten zurückliegen, jede nur einmal pro Block.
  const practiced = new Set();
  function practiceLine() {
    const learned = progress().learnedLines || {};
    const line = model.lines.filter(l => learned[l.id] && !practiced.has(l.id))
      .sort((a, b) => String(learned[a.id]).localeCompare(String(learned[b.id])))[0] || null;
    if (line) practiced.add(line.id);
    return line;
  }

  // Jeder Schritt mit Fehlerbehandlung: Ein Fehler beendet den Block sauber (onDone kommt trotzdem).
  function step() {
    next().catch(err => {
      console.error(err);
      if (!alive || finished) return;
      busy = false;
      clear(stage).append(h('div.feedback.bad', 'Eröffnungsblock: ' + err.message));
      setTimeout(finish, 3000);
    });
  }
  step();

  return () => {
    alive = false;
    timer.stop();
    setSub(null);
  };
}
