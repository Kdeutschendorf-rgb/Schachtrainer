// Heute: Startseite mit dem täglichen Trainingsplan (Standard 30 Minuten).
// Der Plan besteht aus Blöcken, die nacheinander über runBlock() der Module laufen
// (dynamisch importiert, ein Ausfall überspringt nur den Block). Die Planberechnung
// (computePlan) ist reine Logik ohne DOM und lässt sich mit jsc testen.

import { h, clear, loadCss, progressBar, formatTime, loadPlayerData } from '../ui.js';
import { trainingFocus } from '../tactics/focus.js';
import { openReviews } from './review.js';
import { goalPace } from '../report/weekly.js';
import * as store from '../store.js';
import { todayStr, addDays } from '../srs.js';
import { tipOfTheDay, themeName } from '../coach.js';

// ---------------------------------------------------------------------------
// Plan (reine Logik)

// Grundplan in Minuten bei 30 Minuten am Tag; MIN_UNITS = Untergrenze beim Umschichten.
// Mittelspiel vor Eröffnung: Die meisten Punkte gehen durch Fehler im Mittelspiel verloren, nicht in der Eröffnung.
export const DEFAULT_PLAN = { warmup: 4, openings: 8, tactics: 10, vision: 6, review: 3, finish: 2 };
const MIN_UNITS = { warmup: 2, openings: 4, tactics: 3, vision: 2, review: 1, finish: 1 };
const ORDER = ['warmup', 'openings', 'tactics', 'vision', 'review', 'finish'];

export const BLOCK_DEFS = {
  warmup: { label: 'Aufwärmen: Taktik', module: 'tactics', mode: 'warmup', icon: '⚡' },
  openings: { label: 'Eröffnungen', module: 'openings', mode: 'review', icon: '📖' },
  tactics: { label: 'Taktik (Schwächen)', module: 'tactics', mode: 'main', icon: '🎯' },
  vision: { label: 'Vorausdenken', module: 'vision', mode: 'mix', icon: '🧠' },
  review: { label: 'Partie-Besprechung', module: 'review', mode: 'review', icon: '🔍' },
  finish: { label: 'Abschluss', module: 'tactics', mode: 'own', icon: '🏁' },
};

export function dayNumber(day) {
  return Math.round(Date.parse(day + 'T12:00:00Z') / 86400000);
}

// Eröffnungskarten aus dem Fortschritt (openings.cards: {key: srsCard}) → {due, learned, total}
export function countDueCards(openings, day = todayStr()) {
  let due = 0, learned = 0;
  const cards = Object.values(openings?.cards || {});
  for (const c of cards) {
    if (!c) continue;
    if (c.reps > 0 || c.last) learned++;
    if (c.due && c.due <= day) due++;
  }
  return { due, learned, total: cards.length };
}

// Minuten von `donors` zu `target` schieben, ohne Untergrenzen zu verletzen. → tatsächlich verschoben
function shift(w, target, amount, donors) {
  let moved = 0;
  for (const d of donors) {
    if (moved >= amount) break;
    const can = Math.max(0, w[d] - (w[d] > 0 ? MIN_UNITS[d] : 0));
    const take = Math.min(can, amount - moved);
    w[d] -= take;
    moved += take;
  }
  w[target] += moved;
  return moved;
}

// Gewichte auf eine Gesamtdauer verteilen (größter Rest), jeder aktive Block ≥ 1 Minute.
export function distribute(weights, total) {
  const out = Object.fromEntries(Object.keys(weights).map(k => [k, 0]));
  const keys = Object.keys(weights).filter(k => weights[k] > 0);
  if (!keys.length || total <= 0) return out;
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  const raw = keys.map(k => ({ k, v: (weights[k] * total) / sum }));
  for (const r of raw) out[r.k] = Math.floor(r.v);
  let rest = total - keys.reduce((s, k) => s + out[k], 0);
  for (const r of raw.slice().sort((a, b) => (b.v % 1) - (a.v % 1))) {
    if (rest <= 0) break;
    out[r.k]++;
    rest--;
  }
  // Mindestens 1 Minute pro Block, notfalls vom größten Block nehmen
  for (const k of keys) {
    if (out[k] >= 1) continue;
    const big = keys.reduce((a, b) => (out[a] >= out[b] ? a : b));
    if (out[big] <= 1) break;
    out[big]--;
    out[k]++;
  }
  return out;
}

// args: {dailyMinutes, base, adaptive, dueCards, focus (aus analysis_summary.json), day, ownPuzzles}
// → {blocks: [{id, label, module, mode, minutes, why, icon}], notes: [Sätze], total}
export function computePlan(args = {}) {
  const day = args.day || todayStr();
  const total = Math.max(5, Math.min(120, Math.round(args.dailyMinutes || 30)));
  const base = { ...DEFAULT_PLAN, ...(args.base || {}) };
  const w = {};
  for (const k of ORDER) w[k] = Math.max(0, Number(base[k]) || 0);
  // Die Besprechung gibt es nur, wenn eine Partie offen ist; sonst verteilt sich ihre Zeit auf die anderen Blöcke
  if (!args.reviewGames) w.review = 0;
  const notes = [];
  const focus = args.focus || {};
  const ph = focus.phases || {};
  const due = args.dueCards || 0;
  const adaptive = args.adaptive !== false;

  if (adaptive && w.openings > 0) {
    // Viele fällige Karten → mehr Eröffnung, sonst stauen sie sich
    const want = due >= 80 ? 5 : due >= 50 ? 4 : due >= 30 ? 3 : due >= 15 ? 1 : 0;
    if (want && shift(w, 'openings', want, ['vision', 'tactics']) > 0) {
      notes.push(`${due} Eröffnungskarten sind fällig, deshalb mehr Zeit für Eröffnungen.`);
    }
  }
  if (adaptive && ph.eroeffnung != null) {
    const s = Math.max(-2, Math.min(2, Math.round((ph.eroeffnung - 0.3) * 10)));
    if (s > 0 && w.openings > 0 && shift(w, 'openings', s, ['tactics']) > 0) {
      notes.push(`${Math.round(ph.eroeffnung * 100)} % deiner groben Fehler passieren in der Eröffnung: etwas mehr Eröffnungstraining.`);
    } else if (s < 0 && ph.eroeffnung < 0.15 && w.tactics > 0 && shift(w, 'tactics', -s, ['openings']) > 0) {
      notes.push('Deine groben Fehler passieren selten in der Eröffnung: etwas mehr Taktik.');
    }
  }
  if (adaptive && (ph.mittelspiel || 0) >= 0.6 && w.tactics > 0) {
    const s = ph.mittelspiel >= 0.7 ? 2 : 1;
    if (shift(w, 'tactics', s, ['openings']) > 0) {
      notes.push(`${Math.round(ph.mittelspiel * 100)} % deiner groben Fehler passieren im Mittelspiel: mehr Taktik.`);
    }
  }

  // Abschluss: wechselt täglich zwischen eigenen Fehlern und Endspiel
  let finishModule = dayNumber(day) % 2 === 0 ? 'own' : 'endgame';
  if (!args.ownPuzzles) finishModule = 'endgame';
  if (adaptive && (ph.endspiel || 0) >= 0.25 && w.finish > 0) {
    if (shift(w, 'finish', 1, ['vision', 'tactics']) > 0) {
      notes.push(`Viele grobe Fehler im Endspiel (${Math.round(ph.endspiel * 100)} %): längerer Abschluss.`);
    }
    if (dayNumber(day) % 3 !== 0) finishModule = 'endgame';
  }

  const minutes = distribute(w, total);
  const topThemes = Object.entries(focus.themes || {})
    .filter(([t]) => !['crushing', 'advantage', 'opening', 'endgame'].includes(t))
    .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => themeName(t));
  const why = {
    warmup: 'Leichte Aufgaben, um in Schwung zu kommen.',
    openings: due ? `Fällige Linien auf deiner Stufe, danach neue. ${due} Züge sind fällig.` : 'Neue Linien: erst selber finden, dann aus dem Kopf.',
    tactics: topThemes.length ? `Gewertet, mit Schwerpunkt ${topThemes.join(' und ')}.` : 'Gewertete Aufgaben, gemischt nach deinen Schwächen.',
    vision: 'Blind rechnen, Drohungen erkennen, Schach–Schlagen–Drohen.',
    review: `${args.reviewGames || 0} ${args.reviewGames === 1 ? 'Partie wartet' : 'Partien warten'}: die wichtigsten Momente selbst lösen.`,
    finish: finishModule === 'own' ? 'Stellungen aus deinen eigenen Partien.' : 'Grundtechnik im Endspiel.',
  };
  const blocks = ORDER.filter(k => minutes[k] > 0).map(k => {
    const def = { ...BLOCK_DEFS[k] };
    if (k === 'finish') {
      if (finishModule === 'endgame') Object.assign(def, { module: 'endgames', mode: 'basic', label: 'Abschluss: Endspiel' });
      else def.label = 'Abschluss: eigene Fehler';
    }
    return { id: k, ...def, minutes: minutes[k], why: why[k] };
  });
  return { blocks, notes, total: blocks.reduce((s, b) => s + b.minutes, 0) };
}

// Standardziel: nächster Hunderter über max(aktuell + 100, Höchstwert)
export function defaultGoal(current, peak) {
  if (!current) return 1300;
  return Math.ceil(Math.max(current + 100, peak || 0) / 100) * 100;
}

// Tageszähler der Module (store.logActivity): [Aufgaben-Schlüssel], [Richtig-Schlüssel].
// Damit lässt sich auch für übersprungene oder pausierte Blöcke zählen, was erledigt wurde.
const COUNTERS = {
  tactics: [['puzzles'], ['puzzlesSolved']],
  openings: [['openingReviews', 'openingQuiz'], ['openingCorrect', 'openingQuizRight']],
  vision: [['visionTasks'], ['visionSolved']],
  endgames: [['endgames'], ['endgamesSolved']],
  review: [['reviewMoments'], ['reviewCorrect']],
};

export function countersFor(module, activity = {}) {
  const def = COUNTERS[module];
  if (!def) return { done: 0, correct: 0 };
  const sum = keys => keys.reduce((s, k) => s + (Number(activity?.[k]) || 0), 0);
  return { done: sum(def[0]), correct: sum(def[1]) };
}

// Ergebnis eines Blocks in einem Satzteil
export function describeResult(r) {
  if (r.failed) return 'nicht verfügbar, übersprungen';
  const parts = [];
  if (r.done) {
    parts.push(`${r.done} ${r.done === 1 ? 'Aufgabe' : 'Aufgaben'}`);
    parts.push(`${r.correct || 0} richtig (${Math.round((100 * (r.correct || 0)) / r.done)} %)`);
  }
  if (r.skipped) parts.push(r.done ? 'vorzeitig beendet' : 'übersprungen');
  return parts.join(', ') || 'keine Aufgaben';
}

// ---------------------------------------------------------------------------
// Ansicht

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function greeting() {
  const hr = new Date().getHours();
  return hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Hallo' : 'Guten Abend';
}

function dateLine(d = new Date()) {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function germanDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || '';
}

function settings() {
  const s = store.get('settings');
  s.dailyMinutes ??= 30;
  return s;
}

// Zielverfolgung auf der Startseite
function paceLine(now, goal, date) {
  const p = goalPace(now, goal, date);
  if (!p || p.left <= 0) return null;
  if (p.over) return h('div.small.muted', 'Dein Zieldatum ist vorbei. Setz unter „Plan anpassen“ ein neues.');
  return h('div.small', `Bis ${germanDay(date)}: ${p.perWeek} Punkte pro Woche nötig`);
}

export async function mount(el) {
  loadCss('css/today.css');
  let summary = null;
  try { summary = await loadPlayerData('analysis_summary.json'); } catch { summary = null; }
  // Schwerpunkt: alle Partien als Basis, neue Partien (auch gegen Bots) als Ergänzung
  const focus = summary?.focus || store.get('play').games?.length
    ? { ...(summary?.focus || {}), themes: trainingFocus(summary, store.get('play').games).themes } : null;

  const root = h('div.td-root');
  el.append(root);
  let runner = null;          // laufendes Training
  let showSettings = false;

  // Ausgangswert für „seit Trainingsbeginn“ einmalig merken
  const rapidNow = summary?.elo?.current?.rapid;
  const rapidPeak = summary?.elo?.peak?.rapid?.elo;
  if (rapidNow && !settings().startRapid) {
    store.update('settings', s => { s.startRapid = { elo: rapidNow, date: todayStr() }; });
  }

  function buildPlan() {
    const s = settings();
    return computePlan({
      dailyMinutes: s.dailyMinutes, base: s.plan, adaptive: s.adaptive !== false,
      dueCards: countDueCards(store.get('openings')).due, focus,
      ownPuzzles: summary?.ownPuzzles ?? 0,
      reviewGames: openReviews(summary, store.get('play').games || [], store.get('review').done || {}).length,
    });
  }

  function renderElo() {
    if (!rapidNow) {
      return h('div.td-elo', h('div.small.muted', 'Rapid-Elo'),
        h('div.muted', !settings().chesscomName ? 'Trag unter „Plan anpassen“ deinen chess.com-Namen ein.' : store.currentUser() ? 'Deine Partien werden ausgewertet. Morgen früh ist die Auswertung da.' : 'Für die Auswertung deiner Partien brauchst du ein Konto.'));
    }
    const s = settings();
    const goal = s.goalRapid || defaultGoal(rapidNow, rapidPeak);
    const start = s.startRapid?.elo ?? rapidNow;
    const diff = rapidNow - start;
    const frac = goal > start ? Math.max(0, Math.min(1, diff / (goal - start))) : 1;
    return h('div.td-elo',
      h('div.small.muted', 'Rapid-Elo (chess.com)'),
      h('div.td-elo-row', h('span.stat', String(rapidNow)), h('span.muted', `Ziel ${goal}`)),
      progressBar(frac),
      h('div.small.muted', rapidNow >= goal ? 'Ziel erreicht! Setz dir unter „Plan anpassen“ ein neues.'
        : `Noch ${goal - rapidNow} Punkte${diff ? ` · ${diff > 0 ? '+' : ''}${diff} seit Trainingsbeginn` : ''}`),
      paceLine(rapidNow, goal, s.goalDate),
      summary?.range?.to ? h('div.small.muted', `Stand: letzte Partie am ${germanDay(summary.range.to)}`) : null);
  }

  function renderHome() {
    clear(root);
    const plan = buildPlan();
    const day = todayStr();
    const doneToday = store.all().activity?.[day]?.minutes || 0;
    const streak = store.streak();

    const hero = h('div.card.td-hero',
      h('div.td-hello',
        h('h1', settings().displayName ? `${greeting()}, ${settings().displayName}!` : `${greeting()}!`),
        h('div.muted', dateLine()),
        h('div.td-streak', streak ? `🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge trainiert` : 'Heute startest du eine neue Serie.'),
        doneToday >= 1 ? h('div.small.td-done', `Heute schon ${Math.round(doneToday)} Minuten trainiert. Stark!`) : null),
      renderElo());

    const planCard = h('div.card.td-plan',
      h('div.row', h('h2', `Dein Plan für heute · ${plan.total} Minuten`), h('span.spacer'),
        h('button.td-link', { onclick: () => { showSettings = !showSettings; renderHome(); } },
          showSettings ? 'Einstellungen schließen' : 'Plan anpassen')),
      h('ol.td-blocks', plan.blocks.map((b, i) => h('li.td-block',
        h('span.td-num', String(i + 1)),
        h('span.td-icon', b.icon),
        h('div.td-block-text', h('div.td-block-title', b.label), h('div.small.muted', b.why)),
        h('span.td-min', `${b.minutes} min`)))),
      plan.notes.length ? h('ul.td-notes.small.muted', plan.notes.map(n => h('li', n))) : null,
      plan.blocks.length ? null : h('div.feedback.warn', 'Alle Blöcke stehen auf 0. Unter „Plan anpassen“ mindestens einen Block einschalten.'),
      h('div.td-start-row',
        h('button.primary.td-start', { onclick: () => startTraining(plan), disabled: !plan.blocks.length },
          doneToday >= 1 ? 'Noch eine Runde trainieren' : 'Training starten'),
        h('span.small.muted.kbd-hint', 'oder Enter drücken')));

    const tip = h('div.card.td-tip', h('div.small.muted', 'Tipp des Tages'),
      h('div', tipOfTheDay({ date: day, focus })));

    // append(null) würde den Text „null“ einfügen, daher filtern
    root.append(...[hero, planCard, showSettings ? renderSettings() : null,
      h('div.td-grid', renderWeek(), tip), renderFreeLinks()].filter(Boolean));
  }

  // Einstellungen: Minuten am Tag, Ziel, adaptiv, Anteile der Blöcke
  function renderSettings() {
    const s = settings();
    const save = fn => { store.update('settings', fn); renderHome(); };
    const minutesSel = h('select', { onchange: e => save(x => { x.dailyMinutes = Number(e.target.value); }) },
      [10, 15, 20, 30, 45, 60].map(m => h('option', { value: m, selected: m === s.dailyMinutes }, `${m} Minuten`)));
    const goalIn = h('input', {
      type: 'number', min: 400, max: 3000, step: 25, value: s.goalRapid || defaultGoal(rapidNow, rapidPeak),
      onchange: e => save(x => {
        const v = Math.round(Number(e.target.value) || 0);
        if (v >= 400 && v <= 3000) x.goalRapid = v; else delete x.goalRapid;
      }),
    });
    const adaptiveIn = h('input', { type: 'checkbox', checked: s.adaptive !== false, onchange: e => save(x => { x.adaptive = e.target.checked; }) });
    const base = { ...DEFAULT_PLAN, ...(s.plan || {}) };
    const weightRows = ORDER.map(k => h('label.td-weight',
      h('span', k === 'warmup' ? 'Aufwärmen' : BLOCK_DEFS[k].label),
      h('input', {
        type: 'number', min: 0, max: 30, value: base[k],
        onchange: e => save(x => {
          x.plan = { ...DEFAULT_PLAN, ...(x.plan || {}), [k]: Math.max(0, Math.min(30, Math.round(Number(e.target.value) || 0))) };
        }),
      })));
    const text = (key, attrs) => h('input', { type: 'text', value: s[key] || '', ...attrs,
      onchange: e => {
        const v = e.target.value.trim();
        save(x => { if (v) x[key] = v; else delete x[key]; });
        if (key === 'chesscomName') store.registerPlayer(v);
      } });
    const user = store.currentUser();
    return h('div.card.td-settings',
      h('h2', 'Profil'),
      h('div.td-settings-grid',
        h('label', h('span', 'Vorname'), text('displayName')),
        h('label', h('span', 'chess.com-Name'), text('chesscomName', { autocapitalize: 'off' }))),
      h('div.row',
        h('span.small.muted', user ? `Angemeldet als ${user.email}, Fortschritt wird abgeglichen.` : 'Ohne Konto: Fortschritt nur auf diesem Gerät.'),
        h('span.spacer'),
        h('button', { onclick: () => store.signOut() }, user ? 'Abmelden' : 'Anmelden')),
      h('h2', 'Plan anpassen'),
      h('div.td-settings-grid',
        h('label', h('span', 'Trainingszeit pro Tag'), minutesSel),
        h('label', h('span', 'Rapid-Ziel'), goalIn),
        h('label', h('span', 'Bis wann? (optional)'), h('input', { type: 'date', value: s.goalDate || '', onchange: e => save(x => { if (e.target.value) x.goalDate = e.target.value; else delete x.goalDate; }) }))),
      h('label.td-check', adaptiveIn, h('span', 'Plan automatisch anpassen (fällige Karten, Schwächen aus deinen Partien)')),
      h('div.small.muted', 'Anteile der Blöcke, bezogen auf 30 Minuten. Sie werden auf deine Trainingszeit umgerechnet, 0 schaltet einen Block ab.'),
      h('div.td-weights', weightRows),
      h('div.row',
        h('button', { onclick: () => save(x => { delete x.plan; }) }, 'Standard wiederherstellen'),
        h('span.small.muted', 'Aufwärmen 4 · Eröffnungen 8 · Taktik 10 · Vorausdenken 6 · Besprechung 3 · Abschluss 2')));
  }

  // Letzte 7 Tage als kleine Balken
  function renderWeek() {
    const goal = settings().dailyMinutes || 30;
    const activity = store.all().activity || {};
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(todayStr(), -i));
    const total = days.reduce((s, d) => s + (activity[d]?.minutes || 0), 0);
    return h('div.card.td-week',
      h('div.row', h('h3', 'Die letzten 7 Tage'), h('span.spacer'), h('span.small.muted', `${Math.round(total)} min`)),
      h('div.td-week-bars', days.map(d => {
        const m = activity[d]?.minutes || 0;
        const wd = WEEKDAYS[new Date(d + 'T12:00:00').getDay()].slice(0, 2);
        return h('div.td-day', { title: `${germanDay(d)}: ${Math.round(m)} Minuten` },
          h('div.td-bar-box', h('div.td-bar' + (m >= goal ? '.full' : ''), { style: { height: `${Math.min(100, (100 * m) / goal)}%` } })),
          h('span.small.muted', wd));
      })));
  }

  function renderFreeLinks() {
    const links = [
      ['#/eroeffnungen', 'Eröffnungen', 'Repertoire lernen, Explorer, alle Eröffnungen'],
      ['#/taktik', 'Taktik', 'Aufgaben, Rush, eigene Fehler'],
      ['#/rechnen', 'Vorausdenken', 'Blind rechnen, Drohungen, CCT'],
      ['#/endspiele', 'Endspiele', 'Grundstellungen gegen die Engine'],
      ['#/spielen', 'Spielen', 'Bots mit deinen Eröffnungen, Stellungen zu Ende spielen'],
      ['#/besprechung', 'Partie-Besprechung', 'Die wichtigsten Momente deiner Partien'],
      ['#/bericht', 'Bericht', 'Deine Partien und dein Fortschritt'],
    ];
    return h('div.td-free', h('h3', 'Frei trainieren'),
      h('div.td-free-grid', links.map(([href, t, d]) => h('a.card.tight.td-free-link', { href }, h('strong', t), h('div.small.muted', d)))));
  }

  function startTraining(plan) {
    if (runner || !plan.blocks.length) return;
    runner = createRunner(root, plan, { focus, onExit: () => { runner = null; renderHome(); } });
  }

  const keyHandler = e => {
    if (runner || e.key !== 'Enter') return;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(e.target?.tagName || '')) return;
    e.preventDefault();
    startTraining(buildPlan());
  };
  document.addEventListener('keydown', keyHandler);

  renderHome();

  return () => {
    document.removeEventListener('keydown', keyHandler);
    runner?.destroy();
    runner = null;
  };
}

// ---------------------------------------------------------------------------
// Ablauf: Blöcke nacheinander, mit Pause, Überspringen und Tageszusammenfassung. → {destroy()}

function createRunner(root, plan, { focus, onExit }) {
  const blocks = plan.blocks.map(b => ({ ...b }));
  const results = [];
  const startedAt = new Date();
  let idx = -1;
  let current = null;        // {idx, token, cleanup, usedMs, snap, resumed, recorded, failed}; token = null → Block wurde abgebrochen
  let paused = false;
  let finished = false;
  let saved = false;
  let activeMs = 0;
  let lastTick = Date.now();

  const plannedMs = () => blocks.reduce((s, b) => s + b.minutes * 60000, 0);
  const bar = progressBar(0);
  const timeEl = h('span.small.muted.td-time');
  const titleEl = h('h2.td-run-title');
  const pauseBtn = h('button', { onclick: () => togglePause() }, 'Pause');
  const skipBtn = h('button', { onclick: () => skip() }, 'Block überspringen');
  const endBtn = h('button.td-link', { onclick: () => endEarly() }, 'Training beenden');
  const steps = h('ol.td-steps');
  const stage = h('div.td-stage');

  clear(root).append(
    h('div.card.td-run-head', h('div.row', titleEl, h('span.spacer'), timeEl, pauseBtn, skipBtn, endBtn), bar, steps),
    stage);

  function paintSteps() {
    clear(steps).append(...blocks.map((b, i) => h('li.td-step' + (i < idx ? '.done' : i === idx ? '.cur' : ''),
      h('span', b.icon), ` ${b.label} `, h('span.muted', `${b.minutes} min`))));
  }

  // Aktive Zeit fortschreiben (läuft nur, solange ein Block aktiv ist, nicht in der Pause)
  function advance() {
    const now = Date.now();
    if (!paused && !finished && current?.token) {
      activeMs += now - lastTick;
      current.usedMs += now - lastTick;
    }
    lastTick = now;
  }

  // Gesamtfortschritt: fertige Blöcke voll, der laufende anteilig (höchstens bis zu seiner Planzeit)
  const iv = setInterval(() => {
    advance();
    const doneMs = blocks.slice(0, Math.max(0, idx)).reduce((s, b) => s + b.minutes * 60000, 0);
    const curMs = current && blocks[idx] ? Math.min(current.usedMs, blocks[idx].minutes * 60000) : 0;
    bar.set((doneMs + curMs) / (plannedMs() || 1));
    timeEl.textContent = `${formatTime(activeMs / 1000)} / ${formatTime(plannedMs() / 1000)}`;
  }, 500);

  function stopCurrent() {
    if (!current) return;
    advance();                       // Zeit bis jetzt noch dem Block gutschreiben
    current.token = null;            // ab jetzt ignoriert blockDone diesen Block
    const fn = current.cleanup;
    current.cleanup = null;
    try { fn?.(); } catch (e) { console.error(e); }
  }

  // Was seit Blockbeginn in den Tageszählern dazugekommen ist
  function counted() {
    const b = blocks[idx];
    if (!b || !current?.snap) return { done: 0, correct: 0 };
    const now = countersFor(b.module, store.all().activity?.[todayStr()]);
    return { done: Math.max(0, now.done - current.snap.done), correct: Math.max(0, now.correct - current.snap.correct) };
  }

  // Ergebnis des aktuellen Blocks festhalten, höchstens einmal pro Blockstart
  // (sonst zählt z. B. „Überspringen“ nach einem ausgefallenen Block doppelt)
  function record(extra) {
    if (!current || current.recorded) return;
    current.recorded = true;
    const b = blocks[idx];
    const minutes = Math.round((current?.usedMs || 0) / 6000) / 10;
    results.push({ id: b.id, type: b.module, mode: b.mode, planned: b.minutes, done: 0, correct: 0, ...extra, minutes });
  }

  async function startBlock(i, minutes) {
    const resumed = !!current && current.idx === i;   // nach einer Pause: bisherige Zeit und Zählerstand behalten
    const keep = resumed ? current.usedMs : 0;
    const snap = resumed ? current.snap : null;
    idx = i;
    paintSteps();
    if (i >= blocks.length) { finish(true); return; }
    const b = blocks[i];
    titleEl.textContent = `${b.icon} ${b.label}`;
    const token = {};
    current = { idx: i, token, cleanup: null, usedMs: keep, resumed,
      snap: snap || countersFor(b.module, store.all().activity?.[todayStr()]) };
    clear(stage).append(h('div.card.muted', 'Lade …'));
    let mod;
    try {
      mod = await import(`./${b.module}.js`);
      if (typeof mod.runBlock !== 'function') throw new Error('runBlock fehlt');
    } catch (err) {
      failBlock(token, err);
      return;
    }
    if (current?.token !== token) return;
    const host = h('div.td-block-host');
    clear(stage).append(host);
    try {
      const ret = mod.runBlock(host, { minutes: minutes ?? b.minutes, mode: b.mode, onDone: s => blockDone(token, s) });
      const cleanup = ret && typeof ret.then === 'function' ? await ret : ret;
      if (current?.token === token) current.cleanup = typeof cleanup === 'function' ? cleanup : null;
      else if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    } catch (err) {
      failBlock(token, err);
    }
  }

  // Modul fehlt oder wirft: Hinweis zeigen, Minuten an den nächsten Block geben, weiter
  function failBlock(token, err) {
    if (current?.token !== token) return;
    console.error(err);
    stopCurrent();
    record({ failed: true, error: String(err?.message || err).slice(0, 200) });
    current.failed = true;
    const b = blocks[idx];
    const next = blocks[idx + 1];
    if (next) { next.minutes += b.minutes; paintSteps(); }
    const myIdx = idx;
    const go = () => { if (!finished && idx === myIdx && current?.token === null) startBlock(myIdx + 1); };
    clear(stage).append(h('div.card',
      h('div.feedback.warn', `„${b.label}“ ist gerade nicht verfügbar und wird übersprungen.`),
      h('p.small.muted', next ? `Die ${b.minutes} Minuten kommen zu „${next.label}“ dazu.` : 'Das war der letzte Block.'),
      h('button.primary', { onclick: go }, 'Weiter')));
    setTimeout(go, 3500);
  }

  function blockDone(token, summary) {
    if (!current || current.token !== token || finished) return;   // abgebrochene Blöcke melden nichts mehr
    stopCurrent();
    const s = summary && typeof summary === 'object' ? summary : {};
    // Nach einer Pause kennt das Modul nur den zweiten Teil: dann zählen die Tageszähler
    const c = current.resumed ? counted() : null;
    const done = c && c.done > (s.done || 0) ? c : { done: s.done || 0, correct: s.correct || 0 };
    record({ type: s.type || blocks[idx].module, mode: s.mode || blocks[idx].mode, ...done, details: s.details });
    startBlock(idx + 1);
  }

  function setPaused(p) {
    paused = p;
    pauseBtn.textContent = p ? 'Weiter' : 'Pause';
    pauseBtn.classList.toggle('primary', p);
  }

  // Pause beendet den Block (Module haben keine Pause-Schnittstelle) und startet ihn danach mit der Restzeit neu.
  function togglePause() {
    if (finished || !current || current.failed || idx >= blocks.length) return;
    if (!paused) {
      setPaused(true);
      stopCurrent();
      clear(stage).append(h('div.card.td-pause',
        h('h2', 'Pause'),
        h('p.muted', 'Der Block startet beim Weitermachen neu, mit deiner Restzeit.'),
        h('button.primary', { onclick: () => togglePause() }, 'Weiter trainieren')));
    } else {
      setPaused(false);
      const rest = Math.max(1, Math.round((blocks[idx].minutes * 60000 - current.usedMs) / 30000) / 2);
      startBlock(idx, rest);
    }
  }

  function skip() {
    if (finished || !current || idx >= blocks.length) return;
    stopCurrent();
    record({ skipped: true, ...counted() });
    setPaused(false);
    startBlock(idx + 1);
  }

  function endEarly() {
    if (finished) return;
    if (current && idx < blocks.length) { stopCurrent(); record({ skipped: true, ...counted() }); }
    finish(false);
  }

  function save(completed) {
    if (saved) return;
    const minutes = Math.round(activeMs / 6000) / 10;
    if (minutes < 0.5 && !results.some(r => r.done)) return;    // nichts Nennenswertes passiert
    saved = true;
    store.addSession({ date: todayStr(), startedAt: startedAt.toISOString(), minutes, blocks: results, planned: plan.total, completed });
    store.logActivity({ minutes });
    import('../main.js').then(m => m.updateStreak?.()).catch(() => {});
  }

  function finish(completed) {
    if (finished) return;
    stopCurrent();
    finished = true;
    clearInterval(iv);
    window.removeEventListener('pagehide', onPageHide);
    current = null;
    save(completed);
    renderSummary(completed);
  }

  function renderSummary(completed) {
    const minutes = Math.round(activeMs / 60000);
    const tasks = results.reduce((s, r) => s + (r.done || 0), 0);
    const right = results.reduce((s, r) => s + (r.correct || 0), 0);
    clear(root).append(
      h('div.card.td-summary',
        h('h1', completed ? 'Geschafft! 🎉' : 'Training beendet'),
        h('div.td-sum-stats',
          h('div', h('div.stat', String(minutes)), h('div.small.muted', 'Minuten')),
          h('div', h('div.stat', String(tasks)), h('div.small.muted', 'Aufgaben')),
          h('div', h('div.stat', tasks ? `${Math.round((100 * right) / tasks)} %` : '–'), h('div.small.muted', 'richtig')),
          h('div', h('div.stat', `🔥 ${store.streak()}`), h('div.small.muted', 'Tage in Folge'))),
        results.length ? h('table.td-sum-table', h('tbody', results.map(r => {
          const b = blocks.find(x => x.id === r.id) || {};
          return h('tr', h('td', `${b.icon || ''} ${b.label || r.type}`), h('td.muted', `${String(r.minutes).replace('.', ',')} min`), h('td', describeResult(r)));
        }))) : null),
      h('div.card.td-tip', h('div.small.muted', 'Coach-Tipp'), h('div', tipOfTheDay({ date: todayStr(), focus, salt: 'abschluss' }))),
      h('div.row',
        h('button.primary', { onclick: () => onExit() }, 'Zur Startseite'),
        h('a.btn', { href: '#/bericht' }, 'Zum Bericht')));
  }

  // Seite verlassen (anderer Menüpunkt) oder Tab schließen: laufenden Block beenden, bisherige Zeit speichern
  function abort() {
    if (!finished) {
      if (current && idx < blocks.length) { stopCurrent(); record({ skipped: true, ...counted() }); }
      finished = true;
      save(false);
    }
    clearInterval(iv);
    window.removeEventListener('pagehide', onPageHide);
  }
  // Beim Schließen des Tabs gibt es keinen Router-Wechsel: Sitzung sofort sichern
  function onPageHide() {
    if (finished) return;
    abort();
    store.flush();
  }
  window.addEventListener('pagehide', onPageHide);

  startBlock(0);

  return { destroy: abort };
}
