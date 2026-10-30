// Statistik der Taktik: Kennzahlen, Wertungsverlauf (eigenes SVG), stärkste/schwächste Themen.
import { h } from '../ui.js';
import { todayStr } from '../srs.js';
import { THEME_GROUPS, themeRanking, dueCards, ownOpenCount, isProvisional } from './logic.js';
import { themeLabel, themeTip } from './labels.js';

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

// Nur Motive, Matt- und Phasen-Themen in der Rangliste (keine Längen-/Meta-Themen)
const RANKED = THEME_GROUPS.filter(([g]) => g !== 'Länge').flatMap(([, list]) => list).concat(['mate', 'crushing', 'advantage', 'equality']);

export function renderStats(el, { area, own }) {
  const day = todayStr();
  const hist = area.history || [];
  const today = hist.filter(e => e[2] === day);
  const last100 = hist.slice(-100);
  const rate = list => (list.length ? Math.round((100 * list.filter(e => e[1]).length) / list.length) : null);

  const tile = (label, value, sub) => h('div.card.tk-tile', h('div.small.muted', label), h('div.stat', value), sub ? h('div.small.muted', sub) : null);
  el.append(h('div.tk-tiles',
    tile('Aufgaben-Wertung', `${Math.round(area.rating)}${isProvisional(area) ? '?' : ''}`, `Unsicherheit ± ${Math.round(area.rd)}`),
    tile('Heute', `${today.filter(e => e[1]).length}/${today.length}`, 'gelöst / versucht'),
    tile('Trefferquote', rate(last100) == null ? '–' : `${rate(last100)} %`, `letzte ${last100.length} Aufgaben`),
    tile('Rush-Bestwert', String(area.rush?.best || 0), '3 Minuten'),
    tile('Wiederholungen', String(dueCards(area, day).length), 'heute fällig'),
    tile('Eigene Fehler', String(ownOpenCount(area, own, day)), 'offen')));

  el.append(h('div.card', h('h3', 'Wertungsverlauf'), ratingChart(hist)));

  const ranking = themeRanking(area.themeStats, { min: 5, only: RANKED });
  const themeCard = h('div.card', h('h3', 'Trefferquote nach Thema'));
  if (!ranking.length) {
    themeCard.append(h('p.muted', 'Noch zu wenige Aufgaben. Ab 5 Versuchen pro Thema erscheint es hier.'));
  } else {
    const n = Math.min(6, Math.ceil(ranking.length / 2));
    const strong = ranking.slice(0, n);
    const weak = ranking.slice(-n).reverse().filter(x => !strong.includes(x));
    themeCard.append(h('div.tk-theme-cols',
      h('div', h('h4', 'Stärkste Themen'), strong.map(themeRow)),
      h('div', h('h4', 'Schwächste Themen'), weak.length ? weak.map(themeRow) : h('p.small.muted', 'Noch keine.'))));
    const all = h('details.tk-all', h('summary', `Alle Themen (${ranking.length})`), ranking.map(themeRow));
    themeCard.append(all);
  }
  el.append(themeCard);
}

function themeRow(x) {
  const pct = Math.round(x.rate * 100);
  const kind = pct >= 70 ? 'good' : pct < 50 ? 'bad' : 'warn';
  return h('div.tk-theme-row', { title: themeTip(x.theme) },
    h('a', { href: `#/taktik?modus=thema&thema=${encodeURIComponent(x.theme)}` }, themeLabel(x.theme)),
    h('div.tk-bar.' + kind, h('span', { style: { width: pct + '%' } })),
    h('span.small.muted', `${pct} % (${x.right}/${x.total})`));
}

function ratingChart(hist) {
  if (hist.length < 2) return h('p.muted', 'Nach ein paar Aufgaben siehst du hier deine Entwicklung.');
  // höchstens 300 Punkte: gleichmäßig ausdünnen, den letzten immer behalten
  const pts = hist.map(e => e[3]);
  const stepN = Math.max(1, Math.ceil(pts.length / 300));
  const ys = pts.filter((_, i) => i % stepN === 0);
  if ((pts.length - 1) % stepN) ys.push(pts[pts.length - 1]);
  const W = 640, H = 200, pad = { l: 44, r: 10, t: 10, b: 22 };
  let lo = Math.min(...ys), hi = Math.max(...ys);
  lo = Math.floor((lo - 20) / 100) * 100;
  hi = Math.ceil((hi + 20) / 100) * 100;
  const x = i => pad.l + (i / (ys.length - 1)) * (W - pad.l - pad.r);
  const y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tk-chart', role: 'img', 'aria-label': 'Wertungsverlauf' });
  const stepY = hi - lo > 600 ? 200 : 100;
  for (let v = lo; v <= hi; v += stepY) {
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(s('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'lbl' }, v));
  }
  const d = ys.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  svg.append(s('path', { d: `${d} L${x(ys.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`, class: 'area' }));
  svg.append(s('path', { d, class: 'line' }));
  svg.append(s('circle', { cx: x(ys.length - 1), cy: y(ys[ys.length - 1]), r: 4, class: 'dot' }));
  svg.append(s('text', { x: pad.l, y: H - 6, class: 'lbl' }, `${hist[0][2]}`));
  svg.append(s('text', { x: W - pad.r, y: H - 6, 'text-anchor': 'end', class: 'lbl' }, `${hist[hist.length - 1][2]} · ${pts.length} Aufgaben`));
  return svg;
}
