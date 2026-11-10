// Modul 5: Taktik. Ansicht mit Modi (#/taktik?modus=…) und Block für den Tagesplan (runBlock).
// Logik in ../tactics/logic.js (ohne DOM), Brett und Ablauf in ../tactics/trainer.js.
import { h, clear, loadCss, countdown, toast, TOUCH } from '../ui.js';
import * as store from '../store.js';
import { todayStr } from '../srs.js';
import { loadTacticsData } from '../tactics/data.js';
import { profileSets, setById, setOfDay, setOpenCount, setContext } from '../tactics/sets.js';
import { createTrainer } from '../tactics/trainer.js';
import { renderStats } from '../tactics/stats.js';
import { themeLabel, themeTip } from '../tactics/labels.js';
import {
  ensureArea, selectNext, dueCards, ownOpenCount, themeCount, themeErrorRate, THEME_GROUPS, isProvisional,
} from '../tactics/logic.js';

const MODES = [
  { key: 'standard', label: 'Standard', mode: 'standard', text: 'Gewertete Aufgaben um deine Wertung, gemischt nach deinen Schwächen.' },
  { key: 'thema', label: 'Thema wählen', mode: 'theme', text: 'Ein Motiv gezielt üben, bis es sitzt.' },
  { key: 'eigene', label: 'Eigene Fehler', mode: 'own', text: 'Stellungen aus deinen chess.com-Partien, in denen du danebengegriffen hast.' },
  { key: 'wiederholen', label: 'Wiederholen', mode: 'repeat', text: 'Nicht gelöste Aufgaben kommen nach 1, 3, 7, 14, 30 und 60 Tagen wieder.' },
  { key: 'rush', label: 'Rush', mode: 'rush', text: '3 Minuten, so viele Aufgaben wie möglich. Sie werden immer schwerer, nach 3 Fehlern ist Schluss.' },
  { key: 'rechnen', label: 'Rechnen', mode: 'calc', text: 'Nur lange Aufgaben. Rechne die Lösung bis zum Ende durch, bevor du den ersten Zug machst.' },
  { key: 'statistik', label: 'Statistik', mode: null, text: '' },
];

const area = () => ensureArea(store.get('tactics'));

// ---------------------------------------------------------------------------
// Ansicht

export async function mount(el, params = {}) {
  loadCss('css/tactics.css');
  const cfg = MODES.find(m => m.key === params.modus) || MODES[0];
  const navEl = h('nav.tk-modes');
  const body = h('div.tk-body', h('div.card.muted', 'Lade Aufgaben …'));
  const root = h('div.tk-view', navEl, cfg.text ? h('p.muted.small.tk-intro', cfg.text) : null, body);
  el.append(root);

  let data;
  try {
    data = await loadTacticsData();
  } catch (err) {
    clear(body).append(h('div.card', h('h2', 'Aufgaben konnten nicht geladen werden'), h('pre.small.muted', String(err))));
    return () => {};
  }
  if (!root.isConnected) return () => {};   // inzwischen weggeklickt
  store.update('tactics', ensureArea);
  renderNav(navEl, cfg.key, data);
  clear(body);

  const cleanups = [];
  const session = new Set();
  const ctx = extra => ({ index: data.index, own: data.own, focus: data.focus, area: area(), session, day: todayStr(), ...extra });

  // Trainer mit Standardverhalten; onEmpty zeigt eine Meldung statt des Bretts
  function startTrainer(selOpts, trainerOpts = {}, emptyMsg) {
    const t = createTrainer(body, {
      logMinutes: true,
      next: () => {
        const p = selectNext(ctx(selOpts));
        if (p) session.add(p.key);
        return p;
      },
      onResult: () => renderNav(navEl, cfg.key, data),
      onEmpty: () => { t.destroy(); body.append(emptyMsg()); renderNav(navEl, cfg.key, data); },
      ...trainerOpts,
    });
    cleanups.push(() => t.destroy());
    t.next();
    return t;
  }

  switch (cfg.key) {
    case 'standard':
      startTrainer({ mode: 'standard' }, { title: 'Standard' }, () => emptyCard('Keine passende Aufgabe gefunden.'));
      break;
    case 'rechnen':
      startTrainer({ mode: 'calc' }, { title: 'Rechnen' }, () => emptyCard('Keine passende Aufgabe gefunden.'));
      break;
    case 'thema': {
      const theme = params.thema;
      if (!theme || !themeCount(data.index, theme)) {
        if (theme) toast(`Zum Thema „${theme}“ gibt es keine Aufgaben.`, 'bad');
        body.append(themePicker(data));
        break;
      }
      startTrainer({ mode: 'theme', theme }, {
        title: themeLabel(theme),
        showTheme: () => null,
        header: h('div.row.small', h('a', { href: '#/taktik?modus=thema' }, '← alle Themen'), h('span.muted', themeTip(theme))),
      }, () => emptyCard('Keine Aufgabe mehr zu diesem Thema.'));
      break;
    }
    case 'eigene':
      if (!data.own.length) {
        body.append(emptyCard('Noch keine eigenen Aufgaben. Sie entstehen aus der Analyse deiner chess.com-Partien und erscheinen hier automatisch, sobald die Analyse fertig ist.'));
        break;
      }
      {
        // Übungssätze aus dem Schwächenprofil: ein Satz = ein Fehlermuster mit Merksatz (#/taktik?modus=eigene&set=…)
        const sets = profileSets(data.profile);
        const set = setById(data.profile, params.set);
        if (sets.length) {
          body.append(h('div.tk-sets',
            h('a' + (set ? '' : '.on'), { href: '#/taktik?modus=eigene' }, 'Alle'),
            sets.map(x => h('a' + (x.id === set?.id ? '.on' : ''), { href: `#/taktik?modus=eigene&set=${encodeURIComponent(x.id)}`, title: x.why || '' },
              `${x.title} (${setOpenCount(x, area(), data.own, todayStr())})`))));
        }
        if (set) {
          startTrainer({ mode: 'own', ...setContext(set, { setAgain: true }) }, { title: set.title },
            () => emptyCard('Diesen Übungssatz hast du für heute durch.', nextDueText()));
        } else {
          startTrainer({ mode: 'own' }, { title: 'Eigene Fehler' }, () => emptyCard('Für heute sind alle eigenen Fehler erledigt. Neue kommen mit den nächsten Partien dazu.', nextDueText()));
        }
      }
      break;
    case 'wiederholen':
      if (!dueCards(area()).length) { body.append(emptyCard('Heute ist nichts fällig.', nextDueText())); break; }
      startTrainer({ mode: 'repeat' }, { title: 'Wiederholen' }, () => emptyCard('Alle fälligen Wiederholungen erledigt.', nextDueText()));
      break;
    case 'rush':
      cleanups.push(rushMode(body, data, () => renderNav(navEl, cfg.key, data)));
      break;
    case 'statistik':
      renderStats(body, { area: area(), own: data.own });
      break;
  }
  return () => cleanups.forEach(f => { try { f(); } catch (e) { console.error(e); } });
}

function renderNav(navEl, active, data) {
  const a = area();
  const due = dueCards(a).length;
  const own = ownOpenCount(a, data.own);
  const badge = { wiederholen: due, eigene: own };
  clear(navEl).append(
    ...MODES.map(m => h('a' + (m.key === active ? '.active' : ''), { href: `#/taktik?modus=${m.key}` },
      m.label, badge[m.key] ? h('span.tk-badge', String(badge[m.key])) : null)),
    h('span.spacer'),
    h('span.pill.tk-rating', { title: isProvisional(a) ? 'Noch vorläufig' : `± ${Math.round(a.rd)}` },
      `Wertung ${Math.round(a.rating)}${isProvisional(a) ? '?' : ''}`));
}

function emptyCard(text, sub) {
  return h('div.card.tk-empty', h('p', text), sub ? h('p.small.muted', sub) : null,
    h('div.row', h('a.btn.primary', { href: '#/taktik?modus=standard' }, 'Zu den Standard-Aufgaben'),
      h('a.btn', { href: '#/taktik?modus=statistik' }, 'Statistik')));
}

function nextDueText() {
  const dates = Object.values(area().cards).map(c => c.due).filter(d => d > todayStr()).sort();
  if (!dates.length) return '';
  const [y, m, d] = dates[0].split('-');
  return `Nächste Wiederholung am ${d}.${m}.${y}.`;
}

function themePicker(data) {
  const a = area();
  const wrap = h('div.tk-picker');
  const focus = Object.entries(data.focus).filter(([t, w]) => w > 0 && themeCount(data.index, t)).sort((x, y) => y[1] - x[1]).slice(0, 6);
  if (focus.length) {
    wrap.append(h('div.card', h('h3', 'Aus deinen Partien: hier verlierst du am meisten'),
      h('div.row', focus.map(([t]) => h('a.btn', { href: `#/taktik?modus=thema&thema=${t}`, title: themeTip(t) }, themeLabel(t))))));
  }
  for (const [group, themes] of THEME_GROUPS) {
    const items = themes.filter(t => themeCount(data.index, t) >= 20).map(t => {
      const [right, total] = a.themeStats[t] || [0, 0];
      const weak = total >= 5 && themeErrorRate(a.themeStats, t, 0, 0) > 0.5;
      return h('a.card.tight.tk-theme' + (weak ? '.weak' : ''), { href: `#/taktik?modus=thema&thema=${t}`, title: themeTip(t) },
        h('div.tk-theme-name', themeLabel(t)),
        h('div.small.muted', `${themeCount(data.index, t)} Aufgaben`,
          total ? ` · ${Math.round((100 * right) / total)} % von ${total}` : ''));
    });
    if (items.length) wrap.append(h('h3.tk-group', group), h('div.tk-theme-grid', items));
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Rush: 3 Minuten, steigende Schwierigkeit, 3 Leben

function rushMode(body, data, onChange) {
  let trainer = null, cd = null, over = false;
  const results = [];
  let score = 0, lives = 3, level = 0;

  function startScreen() {
    clear(body).append(h('div.card.tk-rush-start',
      h('h2', 'Rush'),
      h('p', 'Drei Minuten, so viele Aufgaben wie möglich. Es beginnt leicht und wird mit jeder Aufgabe schwerer. Nach drei Fehlern ist Schluss.'),
      h('p.muted', `Dein Bestwert: ${area().rush.best || 0}`),
      h('button.primary', { onclick: start }, 'Start (Leertaste)')));
  }

  function start() {
    trainer?.destroy();
    over = false; score = 0; lives = 3; level = 0; results.length = 0;
    clear(body);
    const timerSlot = h('span');
    const scoreEl = h('span.stat');
    const livesEl = h('span.tk-lives');
    const header = h('div.card.tk-rush-head', h('div.row', timerSlot, h('span.spacer'), scoreEl, livesEl,
      h('button', { onclick: () => end('Abgebrochen') }, 'Beenden')));
    const paint = () => {
      scoreEl.textContent = String(score);
      livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    };
    paint();
    trainer = createTrainer(body, {
      title: 'Rush', header, rush: true, logMinutes: true,
      next: () => (over ? null : selectNext({
        index: data.index, own: data.own, focus: data.focus, area: area(), mode: 'rush', rushLevel: level,
        session: new Set(results.map(r => r.p.key)), day: todayStr(),
      })),
      onResult: (p, res) => {
        results.push({ p, ok: res.ok });
        if (res.ok) score++; else lives--;
        level++;
        paint();
      },
      beforeNext: () => {
        if (lives <= 0) { end('Drei Fehler'); return false; }
        return !over;
      },
      onEmpty: () => end('Keine Aufgaben mehr'),
    });
    cd = countdown(180, { onEnd: () => end('Zeit um') });
    timerSlot.append(cd.el);
    trainer.next();

    function end(reason) {
      if (over) return;
      over = true;
      cd.stop();
      trainer.halt();
      let best = false;
      store.update('tactics', d => {
        ensureArea(d);
        if (score > (d.rush.best || 0)) { d.rush.best = score; best = score > 0; }
        d.rush.last = score;
        d.rush.runs = (d.rush.runs || 0) + 1;
      });
      onChange();
      clear(header).append(
        h('h2', `${reason}: ${score} gelöst`),
        best ? h('div.feedback.good', 'Neuer Bestwert!') : h('p.muted', `Bestwert: ${area().rush.best}`),
        h('div.tk-rush-list', results.map(r => h(r.p.source === 'lichess' ? 'a' : 'span',
          { class: 'pill ' + (r.ok ? 'good' : 'bad'), href: `https://lichess.org/training/${r.p.id}`, target: '_blank', rel: 'noopener', title: r.p.rating },
          `${r.ok ? '✓' : '✗'} ${r.p.rating}`))),
        results.some(r => !r.ok) ? h('p.small.muted', 'Nicht gelöste Aufgaben kommen unter „Wiederholen“ wieder.') : null,
        h('div.row', h('button.primary', { onclick: start }, 'Nochmal (Leertaste)'), h('a.btn', { href: '#/taktik?modus=statistik' }, 'Statistik')));
    }
  }

  function onKey(e) {
    if (e.key !== ' ' || e.target.closest?.('input, select, textarea')) return;
    if (!trainer || over) { e.preventDefault(); start(); }
  }
  document.addEventListener('keydown', onKey);
  startScreen();
  return () => {
    document.removeEventListener('keydown', onKey);
    cd?.stop();
    trainer?.destroy();
  };
}

// ---------------------------------------------------------------------------
// Block für den Tagesplan
// modes: 'warmup' (leicht, schnell) · 'main' (gewertet, Schwächen-Mix) · 'own' (eigene Fehler, sonst main)

const BLOCK_TITLES = { warmup: 'Aufwärmen', main: 'Taktik: Schwächen', own: 'Eigene Fehler' };
const SET_PUZZLES_IN_MAIN = 2;   // so viele Stellungen aus dem Übungssatz des Tages eröffnen den Hauptblock

export function runBlock(el, { minutes = 5, mode = 'main', onDone } = {}) {
  loadCss('css/tactics.css');
  if (!BLOCK_TITLES[mode]) mode = 'main';
  const started = Date.now();
  let finished = false, timeUp = false, destroyed = false;
  let trainer = null, cd = null;
  let done = 0, correct = 0, ratingStart = null;
  const wrongThemes = {};
  const session = new Set();

  const timerSlot = h('span', h('span.timer', '…'));
  const countEl = h('span.small.muted');
  const noteEl = h('span.small.tk-note');
  const header = h('div.card.tight.tk-block-head', h('div.row', timerSlot, countEl, h('span.spacer'),
    h('button', { onclick: () => finishBlock() }, 'Block beenden')), noteEl);
  const holder = h('div.tk-block', h('div.card.muted', 'Lade Aufgaben …'));
  el.append(holder);

  const paintCount = () => { countEl.textContent = done ? `${correct}/${done} gelöst` : ''; };

  function finishBlock() {
    if (finished) return;
    finished = true;
    cd?.stop();
    trainer?.halt();
    const top = Object.entries(wrongThemes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    onDone?.({
      type: 'tactics', mode, minutes: Math.round((Date.now() - started) / 6000) / 10, done, correct,
      details: { ratingStart, ratingEnd: Math.round(area().rating), wrongThemes: top },
    });
  }

  loadTacticsData().then(data => {
    if (destroyed || finished) return;
    store.update('tactics', ensureArea);
    ratingStart = Math.round(area().rating);
    clear(holder);
    const pick = (m, extra = {}) => {
      const p = selectNext({ index: data.index, own: data.own, focus: data.focus, area: area(), session, day: todayStr(), mode: m, counter: done, ...extra });
      if (p) session.add(p.key);
      return p;
    };
    // Übungssatz des Tages aus dem Schwächenprofil: im Abschluss durchgehend, im Hauptblock die ersten zwei Aufgaben
    const daySet = setOfDay(data.profile, area(), data.own, todayStr());
    const fromSet = () => (daySet ? pick('own', setContext(daySet)) : null);
    let setShown = 0;
    const setFirst = () => {
      if (setShown >= SET_PUZZLES_IN_MAIN) return null;
      const p = fromSet();
      if (p) setShown++;
      return p;
    };
    trainer = createTrainer(holder, {
      title: BLOCK_TITLES[mode], header,
      autoNext: mode === 'warmup' ? 900 : 0,
      next: () => (mode === 'own' ? fromSet() || pick('own') || pick('main') : mode === 'main' ? setFirst() || pick('main') : pick(mode)),
      onResult: (p, res) => {
        done++;
        if (res.ok) correct++;
        else for (const t of p.themes || []) wrongThemes[t] = (wrongThemes[t] || 0) + 1;
        paintCount();
      },
      beforeNext: () => {
        if (timeUp) { finishBlock(); return false; }
        return !finished;
      },
      nextLabel: () => (timeUp ? 'Block abschließen' : 'Weiter'),
      onEmpty: () => finishBlock(),
    });
    cd = countdown(Math.max(1, minutes) * 60, {
      onEnd: () => {
        timeUp = true;
        const ph = trainer.phase();
        if (ph === 'idle') return finishBlock();
        noteEl.textContent = ph === 'finished' ? TOUCH ? 'Zeit um.' : 'Zeit um. Weiter mit der Leertaste.' : 'Zeit um. Lös diese Aufgabe noch zu Ende.';
        trainer.refresh();
      },
    });
    clear(timerSlot).append(cd.el);
    trainer.next();
  }).catch(err => {
    if (destroyed) return;
    clear(holder).append(h('div.card', h('p', 'Die Aufgaben konnten nicht geladen werden.'), h('pre.small.muted', String(err)),
      h('button.primary', { onclick: () => finishBlock() }, 'Block überspringen')));
  });

  return () => {
    destroyed = true;
    cd?.stop();
    trainer?.destroy();
    holder.remove();
  };
}
