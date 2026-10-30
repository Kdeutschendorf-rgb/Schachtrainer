// Kleine UI-Bausteine, die mehrere Eröffnungs-Ansichten teilen.

import { h, clear, figurine } from '../ui.js';
import { PRIORITY_LABEL } from './logic.js';

export const sideName = s => (s === 'w' ? 'Weiß' : 'Schwarz');
export const orientationOf = s => (s === 'w' ? 'white' : 'black');

// Tastenkürzel. map: {' ': fn, Enter: fn, h: fn, ArrowLeft: fn, ...} → Funktion zum Abmelden.
// Leertaste/Enter auf einem fokussierten Knopf bleiben beim Knopf (sonst doppelt ausgelöst).
export function onKeys(map) {
  const handler = e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.key === ' ' || e.key === 'Enter') && t?.tagName === 'BUTTON') return;
    const fn = map[e.key] || map[e.key.toLowerCase?.()];
    if (!fn) return;
    e.preventDefault();
    fn(e);
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

// Zugnummer + Zug, z. B. „3. ♗c4“ oder „3… ♗c5“ (ply = Halbzugindex ab 0)
export function moveLabel(ply, san) {
  const n = Math.floor(ply / 2) + 1;
  return `${n}${ply % 2 === 0 ? '.' : '…'} ${figurine(san)}`;
}

// Klickbare Zugliste. cur = Index des zuletzt ausgeführten Halbzugs (-1 = Grundstellung).
export function moveList(sans, { cur = sans.length - 1, onClick, startPly = 0, faded = -1 } = {}) {
  const el = h('div.moves.op-moves');
  sans.forEach((san, i) => {
    const ply = startPly + i;
    if (ply % 2 === 0) el.append(h('span.op-num', `${ply / 2 + 1}.`));
    else if (i === 0) el.append(h('span.op-num', `${Math.floor(ply / 2) + 1}…`));
    const span = h('span.mv', figurine(san));
    if (i === cur) span.classList.add('cur');
    if (faded >= 0 && i >= faded) span.classList.add('op-faded');
    if (onClick) span.addEventListener('click', () => onClick(i));
    el.append(span, ' ');
  });
  if (!sans.length) el.append(h('span.muted', 'Grundstellung'));
  return el;
}

export function priorityBadge(p) {
  return h(`span.pill.op-prio.op-prio-${p || 3}`, PRIORITY_LABEL[p] || 'Später');
}

export function freqBadge(f) {
  return f ? h(`span.pill.op-freq.op-freq-${f === 'häufig' ? 'hi' : f === 'selten' ? 'lo' : 'mid'}`, f) : null;
}

// Freundlicher Hinweis, wenn Repertoire-Dateien fehlen oder kaputt sind. null, wenn alles da ist.
export function repertoireNotice(model) {
  const msgs = [];
  for (const p of model.problems || []) {
    msgs.push(p.kind === 'fehlt'
      ? `${p.file} gibt es noch nicht. Sobald die Datei erstellt ist, erscheinen die Kapitel hier (Seite neu laden).`
      : `${p.file} konnte nicht gelesen werden (noch in Arbeit oder fehlerhaft).`);
  }
  if (model.errors?.length) msgs.push(`${model.errors.length} Linie(n) mit Fehlern wurden übersprungen. Details in der Browser-Konsole.`);
  if (!msgs.length) return null;
  return h('div.feedback.warn.op-notice', msgs.map(m => h('div', m)));
}

export function emptyState(title, text, ...extra) {
  return h('div.card.op-empty', h('h3', title), h('p.muted', text), ...extra);
}

// Inhalt eines Elements ersetzen; null/false werden ausgelassen (append() würde „null“ schreiben).
export function put(el, ...nodes) {
  clear(el).append(...nodes.flat(Infinity).filter(n => n != null && n !== false));
  return el;
}

// Knopf-Fabrik: {label, onClick, primary, title, disabled}
export function button({ label, onClick, primary, title, disabled, cls }) {
  return h(`button${primary ? '.primary' : ''}${cls ? '.' + cls : ''}`, { onclick: onClick, title, disabled: !!disabled }, label);
}
