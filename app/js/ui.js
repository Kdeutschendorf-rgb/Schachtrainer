// Kleine DOM-Helfer, die alle Module teilen.
import * as store from './store.js';

// Handy und iPad ohne Tastatur: Tasten-Hinweise wie „Hinweis (h)“ oder „Weiter ⏎“ weglassen.
export const TOUCH = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
export const keyless = text => (TOUCH ? String(text).replace(/\s*\((h|Leertaste|←|→)\)/g, '').replace(/\s*⏎/g, '') : String(text));
if (TOUCH) document.documentElement.classList.add('touch');

// h('div.card', {onclick}, 'Text', child) → Element. Klassen per Punkt im Tag.
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(keyless(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function toast(msg, kind = 'info', ms = 3500) {
  const t = h('div.toast.' + kind, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

const loadedCss = new Set();
// Jedes Modul lädt seine eigene CSS-Datei, damit sich niemand in app.css in die Quere kommt.
export function loadCss(href) {
  if (loadedCss.has(href)) return;
  loadedCss.add(href);
  document.head.append(h('link', { rel: 'stylesheet', href }));
}

export function formatTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// Countdown. onTick(restSekunden), onEnd(). Gibt {el, stop, add(sek), remaining()} zurück.
export function countdown(seconds, { onTick, onEnd } = {}) {
  const el = h('span.timer', formatTime(seconds));
  let end = Date.now() + seconds * 1000;
  let stopped = false;
  const iv = setInterval(() => {
    const rest = (end - Date.now()) / 1000;
    el.textContent = formatTime(rest);
    onTick?.(rest);
    if (rest <= 0) { clearInterval(iv); if (!stopped) { stopped = true; onEnd?.(); } }
  }, 250);
  return {
    el,
    stop() { stopped = true; clearInterval(iv); },
    add(s) { end += s * 1000; },
    remaining() { return Math.max(0, (end - Date.now()) / 1000); },
  };
}

export function progressBar(fraction) {
  const span = h('span', { style: { width: `${Math.round(fraction * 100)}%` } });
  const el = h('div.progress', span);
  el.set = f => { span.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`; };
  return el;
}

export function feedback(text, kind = 'info') {
  return h('div.feedback.' + kind, text);
}

export { todayStr as today } from './srs.js';

export async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// Einmal geladene Daten aus app/data cachen (z. B. puzzles.json).
const dataCache = new Map();
export function loadData(name) {
  if (!dataCache.has(name)) {
    const p = fetchJson(`data/${name}`);
    p.catch(() => dataCache.delete(name));   // Fehlschlag (z. B. offline) nicht merken
    dataCache.set(name, p);
  }
  return dataCache.get(name);
}

// Persönliche Daten (Analyse, eigene Aufgaben, Coach-Bericht) liegen unter data/players/<chess.com-Name>/.
// Gibt es für den Namen keine Auswertung, schlägt das Laden fehl und die Seiten zeigen die neutrale Version.
export function loadPlayerData(name) {
  const player = String(store.get('settings').chesscomName || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(player)) return Promise.reject(new Error('Kein chess.com-Name eingetragen'));
  return loadData('players.json').then(list => {
    if (!list[player]) throw new Error(`Keine Auswertung für ${player}`);
    return loadData(`players/${player}/${name}`);
  });
}

// SAN mit Figurensymbolen anzeigen: 'Nf3' → '♘f3'. Sprachneutral, daher überall in Zuglisten.
const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
export function figurine(san) {
  return san.replace(/[KQRBN](?=[a-h1-8x])/g, p => FIG[p]).replace(/=([QRBN])/, (_, p) => '=' + FIG[p]);
}

// Zugliste ['e4','e5','Nf3'] → '1. e4 e5 2. ♘f3' (startPly = Halbzugnummer des ersten Zugs, 0 = Weiß im 1. Zug)
export function formatLine(sans, startPly = 0) {
  let out = '';
  sans.forEach((san, i) => {
    const ply = startPly + i;
    if (ply % 2 === 0) out += `${ply / 2 + 1}. `;
    else if (i === 0) out += `${Math.floor(ply / 2) + 1}… `;
    out += figurine(san) + ' ';
  });
  return out.trim();
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
