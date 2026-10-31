// Bericht: deine Partien (aus data/players/<name>/analysis_summary.json, gebaut von analysis/build_app_data.py)
// und dein Trainingsfortschritt (aus dem Store). Diagramme sind selbst gezeichnetes SVG.
// Optional oben: data/players/<name>/coach_report.json (schreibt Claude bei der Wochenauswertung).

import { h, clear, loadCss, loadPlayerData, figurine } from '../ui.js';
import * as store from '../store.js';
import { todayStr, addDays } from '../srs.js';
import { themeName, MISTAKE_TAGS_DE, sanDe } from '../coach.js';
import { countDueCards } from './today.js';

// ---------------------------------------------------------------------------
// Formatierung

const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY = 86400000;

// Modi in fester Reihenfolge, Farbe folgt dem Modus (nie dem Rang)
const TC = {
  rapid: { label: 'Rapid', color: '#3987e5' },
  blitz: { label: 'Blitz', color: '#d95926' },
  bullet: { label: 'Bullet', color: '#199e70' },
  daily: { label: 'Täglich', color: '#c98500' },
};
const TC_ORDER = ['rapid', 'blitz', 'bullet', 'daily'];
const PHASES = [['eroeffnung', 'Eröffnung'], ['mittelspiel', 'Mittelspiel'], ['endspiel', 'Endspiel']];
const CLS = [['blunder', 'Patzer', 'rp-c-blunder'], ['mistake', 'Fehler', 'rp-c-mistake'], ['inaccuracy', 'Ungenauigkeit', 'rp-c-inacc']];

const num = (x, d = 0) => (x == null || Number.isNaN(x) ? '–' : Number(x).toFixed(d).replace('.', ','));
const pctText = (x, d = 0) => (x == null ? '–' : `${num(x, d)} %`);

function germanDate(iso) {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || '');
}
const dayMs = iso => Date.parse(String(iso).replace(/\./g, '-').slice(0, 10) + 'T12:00:00');
const msDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// '1. e4 e5 2. Nf3' → mit Figurensymbolen
const lineFig = line => String(line || '').split(' ').map(t => (/^\d+\.$/.test(t) ? t : figurine(t))).join(' ');

// ---------------------------------------------------------------------------
// SVG-Liniendiagramm mit Achsen, Fadenkreuz und Tooltip

const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function niceStep(range, target = 5) {
  const raw = range / target;
  for (const st of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (st >= raw) return st;
  return 1000;
}

// x-Achse: Monatsanfänge (lange Zeiträume) oder Wochen (kurze)
function timeTicks(t0, t1) {
  const out = [];
  if (t1 - t0 <= 75 * DAY) {
    const step = t1 - t0 <= 21 * DAY ? 3 : 7;
    for (let t = t0; t <= t1; t += step * DAY) {
      const d = new Date(t);
      out.push({ t, label: `${d.getDate()}.${d.getMonth() + 1}.` });
    }
    return out;
  }
  const d = new Date(t0);
  d.setDate(1); d.setHours(12, 0, 0, 0);
  if (d.getTime() < t0) d.setMonth(d.getMonth() + 1);
  const months = [];
  while (d.getTime() <= t1) { months.push(d.getTime()); d.setMonth(d.getMonth() + 1); }
  const every = Math.max(1, Math.ceil(months.length / 7));
  months.forEach((t, i) => {
    if (i % every) return;
    const m = new Date(t);
    out.push({ t, label: `${MONTH_SHORT[m.getMonth()]} ${String(m.getFullYear()).slice(2)}` });
  });
  return out;
}

// series: [{id, label, color, strong, points: [{t, v, tip}]}]
// opts: {height, xRange: [t0, t1], yStep, yFormat, gapDays, dots, annotations: [{t, v, label}], ariaLabel, tipDate}
export function lineChart(series, opts = {}) {
  const W = 800, H = opts.height || 260;
  const M = { l: 46, r: 58, t: 16, b: 28 };
  const yFormat = opts.yFormat || (v => num(v));
  const tipDate = opts.tipDate || (t => germanDate(msDay(t)));
  const gap = (opts.gapDays ?? 45) * DAY;

  const all = series.flatMap(se => se.points);
  const wrap = h('div.rp-chart');
  if (!all.length) return h('div.rp-empty.muted.small', 'Noch keine Daten.');

  let [t0, t1] = opts.xRange || [Math.min(...all.map(p => p.t)), Math.max(...all.map(p => p.t))];
  if (t1 - t0 < 2 * DAY) { t0 -= DAY; t1 += DAY; }
  const visible = series.map(se => ({ ...se, points: se.points.filter(p => p.t >= t0 && p.t <= t1) }));
  const vals = visible.flatMap(se => se.points.map(p => p.v));
  if (!vals.length) return h('div.rp-empty.muted.small', 'In diesem Zeitraum gibt es keine Daten.');

  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { lo -= 5; hi += 5; }
  const step = opts.yStep || niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;

  const X = t => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r);
  const Y = v => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rp-svg', role: 'img', 'aria-label': opts.ariaLabel || 'Liniendiagramm' });

  // Raster und Achsen
  const grid = s('g', { class: 'rp-grid' });
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v) }),
      s('text', { x: M.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, yFormat(v)));
  }
  for (const tk of timeTicks(t0, t1)) {
    grid.append(s('line', { class: 'rp-tick', x1: X(tk.t), x2: X(tk.t), y1: H - M.b, y2: H - M.b + 5 }),
      s('text', { x: X(tk.t), y: H - 8, 'text-anchor': 'middle' }, tk.label));
  }
  grid.append(s('line', { class: 'rp-axis', x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }));
  svg.append(grid);

  // Linien: durchgezogen, längere Pausen gestrichelt verbunden. Die hervorgehobene Linie zuletzt (oben).
  const order = visible.slice().sort((a, b) => (a.strong ? 1 : 0) - (b.strong ? 1 : 0));
  for (const se of order) {
    const pts = se.points;
    if (!pts.length) continue;
    let solid = '', dashed = '';
    pts.forEach((p, i) => {
      const xy = `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`;
      if (i === 0 || p.t - pts[i - 1].t > gap) {
        if (i > 0) dashed += `M${X(pts[i - 1].t).toFixed(1)},${Y(pts[i - 1].v).toFixed(1)}L${xy}`;
        solid += `M${xy}`;
      } else solid += `L${xy}`;
    });
    const g = s('g', { class: 'rp-series' + (se.strong ? ' strong' : ''), style: `--c:${se.color}` });
    if (dashed) g.append(s('path', { d: dashed, class: 'rp-line rp-dash' }));
    g.append(s('path', { d: solid, class: 'rp-line' }));
    if (opts.dots || pts.length === 1 || (se.strong && pts.length <= 40)) {
      for (const p of pts) g.append(s('circle', { cx: X(p.t), cy: Y(p.v), r: 3.5, class: 'rp-dot' + (p.faint ? ' faint' : '') }));
    }
    svg.append(g);
  }

  // Anmerkungen (z. B. Höchstwert)
  for (const a of opts.annotations || []) {
    if (a.t < t0 || a.t > t1) continue;
    const x = X(a.t), y = Y(a.v);
    const right = x < W - M.r - 120;
    svg.append(s('g', { class: 'rp-anno' },
      s('circle', { cx: x, cy: y, r: 5 }),
      s('text', { x: right ? x + 9 : x - 9, y: y - 8, 'text-anchor': right ? 'start' : 'end' }, a.label)));
  }

  // Endwerte direkt an die Linien schreiben (Text in Textfarbe, Punkt in Serienfarbe), Überlappung auflösen
  const ends = visible.filter(se => se.points.length).map(se => {
    const p = se.points[se.points.length - 1];
    return { se, p, y: Y(p.v) };
  }).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  for (const e of ends) {
    svg.append(s('g', { class: 'rp-end' },
      s('circle', { cx: W - M.r + 8, cy: e.y, r: 3.5, fill: e.se.color }),
      s('text', { x: W - M.r + 15, y: e.y + 4 }, yFormat(e.p.v))));
  }

  // Hover: Fadenkreuz + Tooltip mit dem Stand aller Linien am nächsten Datum
  const cross = s('line', { class: 'rp-cross', x1: 0, x2: 0, y1: M.t, y2: H - M.b, visibility: 'hidden' });
  const hoverDots = visible.map(se => s('circle', { r: 5, class: 'rp-hover-dot', fill: se.color, visibility: 'hidden' }));
  const hit = s('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: 'rp-hit' });
  svg.append(cross, ...hoverDots, hit);
  const tip = h('div.rp-tip', { hidden: true });
  wrap.append(svg, tip);

  const allT = [...new Set(visible.flatMap(se => se.points.map(p => p.t)))].sort((a, b) => a - b);
  function onMove(e) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const xv = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((xv - M.l) / (W - M.l - M.r)) * (t1 - t0);
    let near = allT[0];
    for (const x of allT) if (Math.abs(x - t) < Math.abs(near - t)) near = x;
    const cx = X(near);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    const rows = [];
    visible.forEach((se, i) => {
      // Stand der Linie an diesem Tag: letzter Punkt bis dahin
      let p = null;
      for (const q of se.points) { if (q.t <= near) p = q; else break; }
      const dot = hoverDots[i];
      if (!p) { dot.setAttribute('visibility', 'hidden'); return; }
      dot.setAttribute('cx', X(p.t)); dot.setAttribute('cy', Y(p.v)); dot.setAttribute('visibility', 'visible');
      const exact = p.t === near;
      rows.push(h('div.rp-tip-row' + (exact ? '' : '.old'),
        h('span.rp-sw', { style: { background: se.color } }),
        h('span', se.label), h('strong', yFormat(p.v)),
        exact && p.tip ? h('span.muted', p.tip) : !exact ? h('span.muted', `Stand ${germanDate(msDay(p.t))}`) : null));
    });
    clear(tip).append(h('div.rp-tip-head', tipDate(near)), ...rows);
    tip.hidden = false;
    const px = (cx / W) * rect.width;
    tip.style.left = px > rect.width * 0.6 ? '' : `${px + 14}px`;
    tip.style.right = px > rect.width * 0.6 ? `${rect.width - px + 14}px` : '';
  }
  function onLeave() {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    hoverDots.forEach(d => d.setAttribute('visibility', 'hidden'));
  }
  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerdown', onMove);
  hit.addEventListener('pointerleave', onLeave);
  return wrap;
}

// Kleine Bausteine
const section = (id, title, ...body) => h('section.card.rp-section', { id: 'rp-' + id }, h('h2', title), ...body);
const tile = (value, label, sub) => h('div.rp-tile', h('div.stat', value), h('div.small.muted', label), sub ? h('div.small.rp-sub', sub) : null);
const empty = text => h('p.muted.small.rp-empty', text);

function segmented(options, value, onChange) {
  const el = h('div.rp-seg', { role: 'group' });
  const paint = v => {
    clear(el).append(...options.map(([k, label]) => h('button' + (k === v ? '.on' : ''),
      { 'aria-pressed': k === v ? 'true' : 'false', onclick: () => { paint(k); onChange(k); } }, label)));
  };
  paint(value);
  return el;
}

// Horizontaler Balken mit Beschriftung
function hbar(label, value, max, text, cls = '') {
  return h('div.rp-hbar',
    h('span.rp-hbar-label', label),
    h('span.rp-hbar-track', h('span.rp-hbar-fill' + (cls ? '.' + cls : ''), { style: { width: `${max ? Math.max(1, (100 * value) / max) : 0}%` } })),
    h('span.rp-hbar-val', text));
}

// ---------------------------------------------------------------------------
// Abschnitte

function renderHeader(summary, onSync) {
  const r = summary?.range;
  return h('div.card.rp-head',
    h('div.rp-head-text',
      h('h1', 'Bericht'),
      summary?.totals?.all?.games && r
        ? h('div.muted', `${summary.totals.all.games} Partien von ${germanDate(r.from)} bis ${germanDate(r.to)} · Stand ${germanDate(summary.generated)}`)
        : h('div.muted', 'Noch keine Partie-Analyse vorhanden.')),
    onSync);
}

function renderSync() {
  return h('div.small.muted.rp-sync-status', 'Neue Partien von chess.com werden jeden Montag automatisch ausgewertet.');
}

function renderCoachReport(cr) {
  if (!cr || typeof cr !== 'object') return null;
  const list = (title, items, cls) => (Array.isArray(items) && items.length
    ? h('div.rp-cr-col', h('h3', title), h('ul.rp-list' + (cls ? '.' + cls : ''), items.map(x => h('li', String(x))))) : null);
  return h('section.card.rp-coach',
    h('div.row', h('span.pill', 'Coach-Auswertung'), cr.date ? h('span.small.muted', `vom ${germanDate(cr.date)}`) : null),
    cr.headline ? h('h2.rp-cr-head', cr.headline) : null,
    h('div.rp-cr-grid',
      list('Das läuft gut', cr.strengths, 'good'),
      list('Daran arbeiten wir', cr.weaknesses, 'bad'),
      list('Plan', cr.plan, 'plan')),
    cr.notes ? h('p.rp-cr-notes', String(cr.notes)) : null);
}

function renderKpis(summary, prog) {
  const elo = summary?.elo || {};
  const rapidTot = summary?.totals?.byTc?.rapid;
  const t = prog.tactics || {};
  const activity = prog.activity || {};
  const minutes = Object.values(activity).reduce((acc, a) => acc + (a.minutes || 0), 0);
  const tiles = [];
  if (elo.current?.rapid) {
    const diff = elo.current.rapid - (elo.first?.rapid ?? elo.current.rapid);
    tiles.push(tile(String(elo.current.rapid), 'Rapid-Elo aktuell', `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} seit ${germanDate(summary.range?.from)}`));
    if (elo.peak?.rapid) tiles.push(tile(String(elo.peak.rapid.elo), 'Rapid-Höchstwert', germanDate(elo.peak.rapid.date)));
  }
  if (rapidTot) tiles.push(tile(pctText(rapidTot.score), 'Punkte im Rapid', `${rapidTot.w} S · ${rapidTot.d} R · ${rapidTot.l} N`));
  tiles.push(tile(t.rating ? String(Math.round(t.rating)) : '–', 'Aufgaben-Wertung', t.history?.length ? `${t.history.length} Aufgaben bearbeitet` : 'noch keine Aufgaben'));
  tiles.push(tile(String(Math.round(minutes)), 'Minuten trainiert', `${Object.values(activity).filter(a => a.minutes >= 1).length} Trainingstage`));
  tiles.push(tile(`🔥 ${store.streak()}`, 'Tage in Folge'));
  return h('div.rp-kpis', tiles);
}

function renderInsights(ins) {
  if (!ins || (!ins.strengths?.length && !ins.weaknesses?.length)) return null;
  return section('insights', 'Auf einen Blick',
    h('p.small.muted', 'Automatisch aus deinen Partien berechnet.'),
    h('div.rp-two',
      h('div', h('h3', 'Stärken'), ins.strengths?.length ? h('ul.rp-list.good', ins.strengths.map(x => h('li', x))) : empty('Noch nichts Auffälliges.')),
      h('div', h('h3', 'Baustellen'), ins.weaknesses?.length ? h('ul.rp-list.bad', ins.weaknesses.map(x => h('li', x))) : empty('Nichts Auffälliges.'))));
}

// Elo-Verlauf pro Modus, Rapid hervorgehoben
function renderElo(summary) {
  const elo = summary?.elo;
  if (!elo?.series || !Object.keys(elo.series).length) return section('elo', 'Elo-Verlauf', empty('Keine Elo-Daten.'));
  const modes = TC_ORDER.filter(tc => (elo.series[tc] || []).length >= 2);
  if (!modes.length) return section('elo', 'Elo-Verlauf', empty('Für einen Verlauf braucht es Partien an mindestens zwei Tagen.'));
  const shown = new Set(modes);
  let range = 'all';
  const host = h('div');
  const allPts = modes.flatMap(tc => elo.series[tc].map(e => dayMs(e[0])));
  const last = Math.max(...allPts);
  const RANGES = [['all', 'Alles'], ['365', '12 Monate'], ['180', '6 Monate'], ['30', '30 Tage']];

  function draw() {
    const series = modes.filter(tc => shown.has(tc)).map(tc => ({
      id: tc, label: TC[tc].label, color: TC[tc].color, strong: tc === 'rapid',
      points: elo.series[tc].map(([d, v, n, w, dr, l]) => ({ t: dayMs(d), v, tip: `${n} ${n === 1 ? 'Partie' : 'Partien'}: ${w} S, ${dr} R, ${l} N` })),
    }));
    const xr = range === 'all' ? null : [last - Number(range) * DAY, last];
    const peak = elo.peak?.rapid;
    clear(host).append(series.length
      ? lineChart(series, {
        height: 300, xRange: xr, ariaLabel: 'Elo-Verlauf pro Modus',
        annotations: shown.has('rapid') && peak ? [{ t: dayMs(peak.date), v: peak.elo, label: `Höchstwert ${peak.elo}` }] : [],
      })
      : empty('Wähle mindestens einen Modus.'));
  }

  const legend = h('div.rp-legend', modes.map(tc => {
    const b = h('button.rp-leg.on', { 'aria-pressed': 'true', title: 'Ein- oder ausblenden' },
      h('span.rp-sw' + (tc === 'rapid' ? '.strong' : ''), { style: { background: TC[tc].color } }),
      `${TC[tc].label} ${elo.current[tc] ?? ''}`);
    b.addEventListener('click', () => {
      if (shown.has(tc)) shown.delete(tc); else shown.add(tc);
      b.classList.toggle('on', shown.has(tc));
      b.setAttribute('aria-pressed', shown.has(tc) ? 'true' : 'false');
      draw();
    });
    return b;
  }));

  const r = elo.peak?.rapid;
  const facts = elo.current?.rapid
    ? h('p.small.muted', `Rapid: Start ${elo.first.rapid} · Höchstwert ${r?.elo} am ${germanDate(r?.date)} · aktuell ${elo.current.rapid}. Gestrichelt: längere Pausen ohne Partie.`)
    : null;

  // Tabellenansicht: Monate
  const months = summary.months || [];
  const table = months.length ? h('details.rp-details', h('summary', 'Als Tabelle (pro Monat)'),
    h('table.rp-table', h('thead', h('tr', h('th', 'Monat'), h('th.num', 'Partien'), h('th.num', 'Punkte'), h('th.num', 'Rapid-Partien'), h('th.num', 'Rapid-Elo'), h('th.num', 'Patzer/Partie'))),
      h('tbody', months.slice().reverse().map(m => h('tr',
        h('td', `${MONTH_SHORT[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`),
        h('td.num', String(m.games)), h('td.num', pctText(m.score)), h('td.num', String(m.rapidGames)),
        h('td.num', m.rapidElo ?? '–'), h('td.num', num(m.blundersPerGame, 2))))))) : null;

  draw();
  return section('elo', 'Elo-Verlauf',
    h('div.rp-controls', legend, h('span.spacer'), segmented(RANGES, range, v => { range = v; draw(); })),
    host, facts, table);
}

// Trainingsfortschritt aus dem Store
function renderTraining(prog) {
  const activity = prog.activity || {};
  const goal = prog.settings?.dailyMinutes || 30;
  const today = todayStr();

  // Heatmap der letzten 18 Wochen (Spalten = Wochen ab Montag)
  const WEEKS = 18;
  const todayDate = new Date(today + 'T12:00:00');
  const mondayOffset = (todayDate.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - (WEEKS - 1) * 7);
  const level = m => (m <= 0 ? 0 : m < goal / 3 ? 1 : m < (2 * goal) / 3 ? 2 : m < goal ? 3 : 4);
  const cells = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = addDays(start, i);
    const m = activity[d]?.minutes || 0;
    const future = d > today;
    const wd = WEEKDAY_SHORT[new Date(d + 'T12:00:00').getDay()];
    cells.push(h('div.rp-cell.l' + (future ? 'x' : level(m)), {
      style: { gridColumn: String(Math.floor(i / 7) + 2), gridRow: String((i % 7) + 1) },
      title: future ? '' : `${wd}, ${germanDate(d)}: ${Math.round(m)} Minuten`,
      'aria-label': future ? null : `${germanDate(d)}: ${Math.round(m)} Minuten`,
    }));
  }
  const dayLabels = ['Mo', '', 'Mi', '', 'Fr', '', 'So'].map((t, i) => h('div.rp-wd.small.muted', { style: { gridColumn: '1', gridRow: String(i + 1) } }, t));
  const heat = h('div.rp-heat', dayLabels, cells);
  const heatLegend = h('div.rp-heat-legend.small.muted', 'weniger', [0, 1, 2, 3, 4].map(l => h('span.rp-cell.l' + l)), `mehr (Ziel ${goal} min)`);

  const days = Object.keys(activity).sort();
  const week = Array.from({ length: 7 }, (_, i) => activity[addDays(today, -i)]?.minutes || 0).reduce((a, b) => a + b, 0);
  const total = days.reduce((acc, d) => acc + (activity[d].minutes || 0), 0);
  const sum = key => days.reduce((acc, d) => acc + (activity[d][key] || 0), 0);

  // Aufgaben-Wertung (Taktik): letzter Wert pro Tag
  const t = prog.tactics || {};
  const byDay = new Map();
  for (const e of t.history || []) if (e && e[2] && e[3]) byDay.set(e[2], e[3]);
  const ratingPts = [...byDay.entries()].sort().map(([d, v]) => ({ t: dayMs(d), v }));
  const hist = t.history || [];
  const recent = hist.slice(-100);
  const recentOk = recent.filter(e => e[1]).length;

  // Eröffnungskarten
  const op = prog.openings || {};
  const cards = countDueCards(op);
  const lines = Object.keys(op.learnedLines || {}).length;

  // Vorausdenken & Endspiele
  const vis = prog.vision || {};
  const VIS = [['blind', 'Blind rechnen'], ['threats', 'Drohungen'], ['cct', 'Schach–Schlagen–Drohen'], ['loose', 'Ungedeckte Figuren']];
  const visLevels = VIS.filter(([k]) => vis[k]?.level).map(([k, n]) => `${n} Stufe ${vis[k].level}`);
  const eg = prog.endgames || {};
  const egMastered = Object.values(eg.cards || {}).filter(c => c?.reps >= 2).length;

  const sessions = (prog.sessions || []).slice(-5).reverse();

  return section('training', 'Dein Training',
    h('div.rp-train-top',
      h('div.rp-heat-box', h('h3', 'Minuten pro Tag'), heat, heatLegend,
        h('p.small.muted', `Letzte 7 Tage: ${Math.round(week)} min · insgesamt ${Math.round(total)} min an ${days.filter(d => activity[d].minutes >= 1).length} Tagen`)),
      h('div.rp-rating-box', h('h3', 'Aufgaben-Wertung'),
        ratingPts.length >= 2
          ? lineChart([{ id: 'rating', label: 'Wertung', color: TC.rapid.color, strong: true, points: ratingPts }], { height: 190, ariaLabel: 'Verlauf der Aufgaben-Wertung', gapDays: 10 })
          : empty(hist.length ? 'Der Verlauf erscheint ab dem zweiten Trainingstag.' : 'Noch keine Taktikaufgaben gelöst.'),
        hist.length ? h('p.small.muted', `Aktuell ${Math.round(t.rating)} (±${Math.round(t.rd || 0)}) · letzte ${recent.length} Aufgaben: ${Math.round((100 * recentOk) / recent.length)} % richtig${t.rush?.best ? ` · Rush-Bestwert ${t.rush.best}` : ''}`) : null)),
    h('div.rp-train-grid',
      h('div.rp-mini', h('div.small.muted', 'Eröffnungskarten'), h('div.stat', `${cards.learned}`),
        h('div.small', `gelernt · ${cards.due} fällig · ${lines} ${lines === 1 ? 'Linie' : 'Linien'}`),
        op.quiz && (op.quiz.right + op.quiz.wrong) ? h('div.small.muted', `Quiz: ${op.quiz.right} von ${op.quiz.right + op.quiz.wrong} richtig`) : null),
      h('div.rp-mini', h('div.small.muted', 'Taktikaufgaben'), h('div.stat', String(sum('puzzles'))),
        h('div.small', `${sum('puzzlesSolved')} gelöst`)),
      h('div.rp-mini', h('div.small.muted', 'Vorausdenken'), h('div.stat', String(sum('visionTasks'))),
        h('div.small', `${sum('visionSolved')} richtig`), visLevels.length ? h('div.small.muted', visLevels.join(' · ')) : null),
      h('div.rp-mini', h('div.small.muted', 'Endspiele'), h('div.stat', String(sum('endgames'))),
        h('div.small', `${sum('endgamesSolved')} geschafft${egMastered ? ` · ${egMastered} sicher` : ''}`))),
    sessions.length ? h('div.rp-sessions', h('h3', 'Letzte Trainingseinheiten'),
      h('table.rp-table', h('tbody', sessions.map(se => {
        const tasks = (se.blocks || []).reduce((a, b) => a + (b.done || 0), 0);
        const right = (se.blocks || []).reduce((a, b) => a + (b.correct || 0), 0);
        return h('tr', h('td', germanDate(se.date)), h('td.num', `${num(se.minutes)} min`),
          h('td', `${(se.blocks || []).length} Blöcke`), h('td', tasks ? `${tasks} Aufgaben, ${Math.round((100 * right) / tasks)} % richtig` : '–'),
          h('td.muted', se.completed ? 'vollständig' : 'vorzeitig beendet'));
      })))) : null);
}

// Ergebnisse nach Eröffnung (Weiß/Schwarz)
function renderOpenings(summary) {
  const op = summary?.openings;
  if (!op) return null;
  const table = side => {
    const rows = op[side] || [];
    if (!rows.length) return empty('Keine Partien.');
    let all = false;
    const body = h('tbody');
    const paint = () => {
      clear(body).append(...(all ? rows : rows.slice(0, 10)).map(r => {
        const cls = r.score >= 55 ? 'good' : r.score <= 45 ? 'bad' : '';
        const vars = (r.variations || []).map(v => `${v.name} (${v.games})`).join('\n');
        return h('tr', { title: vars },
          h('td', h('div', r.nameDe), r.nameDe !== r.name ? h('div.small.muted', r.name) : null),
          h('td.num', String(r.games)),
          h('td.num.muted', `${r.w}/${r.d}/${r.l}`),
          h('td.rp-score', h('span.rp-score-track', h('span.rp-score-fill' + (cls ? '.' + cls : ''), { style: { width: `${r.score}%` } }), h('span.rp-score-mid')),
            h('span.rp-score-val', pctText(r.score))));
      }));
    };
    paint();
    const more = rows.length > 10 ? h('button.rp-more', 'Alle zeigen') : null;
    more?.addEventListener('click', () => { all = !all; more.textContent = all ? 'Weniger zeigen' : 'Alle zeigen'; paint(); });
    return h('div', h('table.rp-table.rp-op-table',
      h('thead', h('tr', h('th', 'Eröffnung'), h('th.num', 'Partien'), h('th.num', 'S/R/N'), h('th', 'Punkte'))), body), more);
  };
  const fm = summary.firstMoves || {};
  const starts = side => (fm[side] || []).slice(0, 6).map(x => h('span.pill', `${lineFig(x.line)} · ${x.count}`));
  return section('openings', 'Ergebnisse nach Eröffnung',
    h('p.small.muted', 'Alle Modi zusammen, sortiert nach Anzahl. Fahre über eine Zeile für die häufigsten Varianten.'),
    h('div.rp-two',
      h('div', h('h3', `Mit Weiß · ${op.wFamilies || 0} Eröffnungen`), table('w'), h('div.rp-pills', starts('w'))),
      h('div', h('h3', `Mit Schwarz · ${op.bFamilies || 0} Eröffnungen`), table('b'), h('div.rp-pills', starts('b')))));
}

// Repertoire-Abdeckung
const REASONS = {
  ende: 'Repertoire-Linie zu Ende',
  ich: 'Du bist abgewichen',
  gegner: 'Gegnerzug nicht im Repertoire',
  partie: 'Partie vorher zu Ende',
};
function renderRepertoire(summary) {
  const rep = summary?.repertoire;
  if (!rep) return null;
  if (!rep.available) {
    return section('repertoire', 'Repertoire-Abdeckung',
      empty('Sobald dein Repertoire (Weiß und Schwarz) da ist, siehst du hier, wie lange deine echten Partien darin geblieben wären.'));
  }
  const side = (key, name) => {
    const d = rep[key];
    if (!d) return h('div', h('h3', name), empty('Keine Daten.'));
    const reasons = Object.entries(d.reasons || {}).sort((a, b) => b[1] - a[1]);
    return h('div.rp-rep-side',
      h('h3', name),
      h('p', `Im Schnitt bleiben deine ${d.games} Partien `, h('strong', `${num(d.avgPlies / 2, 1)} Züge`), ' im Repertoire.'),
      h('div.rp-reach', Object.entries(d.reached || {}).map(([mv, p]) => hbar(`bis Zug ${mv}`, p, 100, pctText(p)))),
      h('div.small.muted.rp-sub-h', 'Wo die Partien das Repertoire verlassen'),
      reasons.map(([k, n]) => hbar(REASONS[k] || k, n, d.games, String(n), 'neutral')),
      d.gaps?.length ? h('div', h('div.small.muted.rp-sub-h', 'Häufigste Lücken (Gegnerzug fehlt)'),
        h('ul.rp-moves', d.gaps.slice(0, 6).map(g => h('li', h('span.moves', lineFig(g.line)), h('span.muted', ` · ${g.count}×`))))) : null,
      d.deviations?.length ? h('div', h('div.small.muted.rp-sub-h', 'Hier spielst du noch anders als im Repertoire'),
        h('ul.rp-moves', d.deviations.slice(0, 6).map(x => h('li',
          h('span.moves', x.line ? lineFig(x.line) : 'Startstellung'),
          ` – du: ${sanDe(x.played)}, Repertoire: ${sanDe(x.expected)}`, h('span.muted', ` · ${x.count}×`))))) : null);
  };
  const files = Object.values(rep.files || {});
  const problems = files.flatMap(f => f.problems || []);
  return section('repertoire', 'Repertoire-Abdeckung',
    h('p.small.muted', `Wie weit deine echten Partien in deinem Repertoire geblieben wären (${files.reduce((a, f) => a + f.lines, 0)} Linien). `,
      h('a', { href: '#/eroeffnungen' }, 'Zum Eröffnungstraining')),
    h('div.rp-two', side('w', 'Mit Weiß'), side('b', 'Mit Schwarz')),
    problems.length ? h('div.feedback.warn.small', `Hinweis zu den Repertoire-Dateien: ${problems.slice(0, 3).join('; ')}`) : null);
}

// Fehler: Phasen, Typen, Schwerpunkte
function renderMistakes(summary) {
  const ph = summary?.phases, tags = summary?.mistakeTags;
  if (!ph || !tags) return null;
  let scope = 'rapid';
  const host = h('div');
  const n = { all: summary.totals.all.games, rapid: summary.totals.byTc?.rapid?.games || 0 };

  function draw() {
    const P = ph[scope];
    const max = Math.max(...PHASES.map(([k]) => CLS.reduce((a, [c]) => a + (P[k]?.perGame?.[c] || 0), 0)), 0.1);
    const phaseRows = PHASES.map(([k, name]) => {
      const pg = P[k]?.perGame || {};
      const total = CLS.reduce((a, [c]) => a + (pg[c] || 0), 0);
      return h('div.rp-hbar',
        h('span.rp-hbar-label', name),
        h('span.rp-hbar-track.rp-stack', CLS.map(([c, label, cls]) => (pg[c] ? h('span.rp-hbar-fill.' + cls,
          { style: { width: `${(100 * pg[c]) / max}%` }, title: `${label}: ${num(pg[c], 2)} pro Partie (${P[k].total?.[c] || 0} insgesamt)` }) : null))),
        h('span.rp-hbar-val', num(total, 2)));
    });
    const T = tags[scope] || {};
    const entries = Object.entries(T);
    const tmax = Math.max(1, ...entries.map(e => e[1]));
    const serious = scope === 'all' ? tags.serious : null;
    clear(host).append(
      h('div.rp-two',
        h('div',
          h('h3', 'Fehler pro Partie und Phase'),
          h('div.rp-keys.small', CLS.map(([, label, cls]) => h('span', h('span.rp-sw.' + cls), label))),
          phaseRows,
          h('p.small.muted', `Durchschnitt über ${n[scope]} Partien. Fahre über einen Abschnitt für die Zahlen.`)),
        h('div',
          h('h3', 'Häufigste Fehlertypen'),
          entries.length ? entries.map(([k, v]) => hbar(MISTAKE_TAGS_DE[k] || k, v, tmax, String(v), 'neutral')) : empty('Keine Fehler markiert.'),
          h('p.small.muted', `Fehler und Patzer, ein Zug kann mehrere Typen haben.${serious ? ` ${serious} grobe Fehler, ${tags.untagged} davon ohne klares Muster.` : ''}`))));
  }
  draw();

  const f = summary.focus || {};
  const themes = Object.entries(f.themes || {}).filter(([k]) => !['crushing', 'advantage', 'opening', 'endgame'].includes(k)).slice(0, 8);
  const focusBox = themes.length ? h('div.rp-focus',
    h('h3', 'Daraus folgt für dein Taktiktraining'),
    h('p.small.muted', 'Diese Themen kommen in der Taktik häufiger dran (Gewicht relativ zum stärksten).'),
    h('div.rp-pills', themes.map(([k, w]) => h('span.pill.rp-theme', { style: { opacity: String(0.55 + 0.45 * w) } }, `${themeName(k)} ${Math.round(w * 100)}`))),
    f.firstBlunderMove ? h('p.small', `Dein erster Patzer kommt im Schnitt in Zug ${num(f.firstBlunderMove)}.`) : null,
    f.openings?.length ? h('div', h('div.small.muted.rp-sub-h', 'Eröffnungen mit schwachen Ergebnissen'),
      h('div.rp-pills', f.openings.map(o => h('span.pill.bad', `${o.nameDe} (${o.color === 'w' ? 'Weiß' : 'Schwarz'}): ${Math.round(o.score)} % aus ${o.games}`)))) : null) : null;

  return section('mistakes', 'Deine Fehler',
    h('div.rp-controls', h('span.small.muted', `${summary.totals.mistakes} markierte Züge aus der Engine-Analyse`), h('span.spacer'),
      segmented([['rapid', 'Nur Rapid'], ['all', 'Alle Partien']], scope, v => { scope = v; draw(); })),
    host, focusBox);
}

// Genauigkeit pro Monat
function renderAccuracy(summary) {
  const acc = summary?.accuracy;
  if (!acc?.byMonth || !Object.keys(acc.byMonth).length) return null;
  const modes = TC_ORDER.filter(tc => tc !== 'daily' && acc.byMonth[tc]?.length);
  const series = modes.map(tc => ({
    id: tc, label: TC[tc].label, color: TC[tc].color, strong: tc === 'rapid',
    points: acc.byMonth[tc].map(([m, v, n]) => ({ t: dayMs(m + '-15'), v, tip: `${n} ${n === 1 ? 'Partie' : 'Partien'}`, faint: n < 3 })),
  }));
  return section('accuracy', 'Genauigkeit über die Zeit',
    h('div.rp-legend.static', modes.map(tc => h('span.rp-leg', h('span.rp-sw' + (tc === 'rapid' ? '.strong' : ''), { style: { background: TC[tc].color } }),
      `${TC[tc].label} Ø ${pctText(acc.avg?.[tc], 1)}`))),
    lineChart(series, {
      height: 230, dots: true, gapDays: 62, yStep: 5, yFormat: v => `${num(v)} %`, ariaLabel: 'Genauigkeit pro Monat',
      tipDate: t => { const d = new Date(t); return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`; },
    }),
    h('p.small.muted', 'Monatsdurchschnitt der Genauigkeit (wie bei chess.com, aus der Engine-Analyse). Blasse Punkte: weniger als 3 Partien.'));
}

// Zeitverluste und Partieenden
function renderTime(summary) {
  const t = summary?.time;
  if (!t) return null;
  const TERM = { zeit: 'auf Zeit', matt: 'Matt', aufgabe: 'Aufgabe', verlassen: 'Partie verlassen' };
  const terms = Object.entries(t.byTermination || {}).sort((a, b) => b[1] - a[1]);
  const rapid = t.byTc?.rapid;
  return section('time', 'Zeitverluste und Partieenden',
    h('div.rp-kpis.small-tiles',
      tile(String(t.timeLosses), 'Niederlagen auf Zeit', `${pctText(t.timeLossShare)} aller Niederlagen`),
      tile(String(t.timeLossesNotLost), 'davon nicht verloren', 'Stellung war noch mindestens ausgeglichen'),
      tile(String(t.winsOnTime), 'Siege auf Zeit'),
      tile(String(t.abandoned), 'Partien verlassen', rapid ? `${rapid.verlassen} davon im Rapid` : null)),
    h('div.rp-two',
      h('div', h('h3', `Wie deine ${t.losses} Niederlagen endeten`), terms.map(([k, v]) => hbar(TERM[k] || k, v, t.losses, String(v), k === 'zeit' || k === 'verlassen' ? 'warn' : 'neutral'))),
      h('div', h('h3', 'Nach Modus'),
        h('table.rp-table', h('thead', h('tr', h('th', 'Modus'), h('th.num', 'Niederlagen'), h('th.num', 'auf Zeit'), h('th.num', 'verlassen'))),
          h('tbody', TC_ORDER.filter(tc => t.byTc?.[tc]).map(tc => h('tr', h('td', TC[tc].label), h('td.num', String(t.byTc[tc].losses)),
            h('td.num', String(t.byTc[tc].zeit)), h('td.num', String(t.byTc[tc].verlassen)))))),
        h('p.small.muted', 'Im 10-Minuten-Rapid ist Zeit selten das Problem. Verlassene Partien zählen dagegen voll als Niederlage.'))));
}

// Entwicklung: erstes gegen letztes Drittel
function renderTrend(summary) {
  const tr = summary?.trend;
  if (!tr || !Object.keys(tr).length) return null;
  const rows = TC_ORDER.filter(tc => tr[tc]).flatMap(tc => [['early', 'erstes Drittel'], ['late', 'letztes Drittel']].map(([k, label]) => {
    const x = tr[tc][k];
    return h('tr' + (k === 'late' ? '.rp-late' : ''),
      h('td', k === 'early' ? TC[tc].label : ''), h('td.muted', `${label}: ${germanDate(x.from)} – ${germanDate(x.to)}`),
      h('td.num', String(x.games)), h('td.num', pctText(x.score)), h('td.num', pctText(x.accuracy, 1)),
      h('td.num', num(x.blundersPerGame, 2)), h('td.num', String(x.elo)));
  }));
  return section('trend', 'Entwicklung',
    h('p.small.muted', 'Deine ersten gegen deine letzten Partien pro Modus (je ein Drittel).'),
    h('div.rp-scroll', h('table.rp-table', h('thead', h('tr', h('th', 'Modus'), h('th', 'Zeitraum'), h('th.num', 'Partien'), h('th.num', 'Punkte'),
      h('th.num', 'Genauigkeit'), h('th.num', 'Patzer/Partie'), h('th.num', 'Elo am Ende'))), h('tbody', rows))));
}

// ---------------------------------------------------------------------------
// Ansicht

export async function mount(el) {
  loadCss('css/report.css');
  let alive = true;
  const root = h('div.rp-root', h('div.card.muted', 'Lade Bericht …'));
  el.append(root);

  const [summary, coachReport] = await Promise.all([
    loadPlayerData('analysis_summary.json').catch(() => null),
    loadPlayerData('coach_report.json').catch(() => null),   // optional, schreibt Claude bei der Wochenauswertung
  ]);
  if (!alive) return () => {};

  const prog = store.all() || {};
  const sync = renderSync();
  const parts = [
    renderHeader(summary, sync),
    renderCoachReport(coachReport),
    renderKpis(summary, prog),
  ];
  if (summary) {
    parts.push(renderElo(summary));
  } else {
    parts.push(h('div.card', h('div.feedback.info', store.all().settings?.chesscomName ? 'Deine Partien werden ausgewertet, morgen früh steht hier die Auswertung. Dein Trainingsfortschritt steht schon unten.' : 'Trag auf der Startseite unter „Plan anpassen“ deinen chess.com-Namen ein, dann werden deine Partien ausgewertet.')));
  }
  parts.push(renderTraining(prog));
  if (summary) {
    parts.push(renderInsights(summary.insights), renderOpenings(summary), renderRepertoire(summary),
      renderMistakes(summary), renderAccuracy(summary), renderTime(summary), renderTrend(summary));
  }

  // Sprungleiste zu den Abschnitten (Hash ist vom Router belegt, daher per Klick scrollen)
  const sections = parts.filter(p => String(p?.getAttribute?.('id') || '').startsWith('rp-'));
  const nav = sections.length > 2 ? h('nav.rp-nav', sections.map(sec => h('button.rp-navbtn',
    { onclick: () => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, sec.querySelector('h2')?.textContent || ''))) : null;

  // append(null) würde den Text „null“ einfügen, daher alles Leere herausfiltern
  clear(root).append(...[...parts.slice(0, 3), nav, ...parts.slice(3)].filter(Boolean));

  return () => { alive = false; };
}
