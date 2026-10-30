// Router: #/route?param=wert → views/<datei>.js, export mount(el, params) → optional cleanup().
import * as store from './store.js';
import { h, clear } from './ui.js';

const ROUTES = {
  heute: 'today',
  eroeffnungen: 'openings',
  taktik: 'tactics',
  rechnen: 'vision',
  endspiele: 'endgames',
  bericht: 'report',
};

const view = document.getElementById('view');
let cleanup = null;

function parseHash() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { route: ROUTES[path] ? path : 'heute', params };
}

async function render() {
  const { route, params } = parseHash();
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('active', a.dataset.route === route);
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  clear(view);
  try {
    const mod = await import(`./views/${ROUTES[route]}.js`);
    cleanup = await mod.mount(view, params);
  } catch (err) {
    console.error(err);
    view.append(h('div.card', h('h2', 'Fehler beim Laden'), h('pre.small.muted', String(err.stack || err))));
  }
  updateStreak();
}

export function updateStreak() {
  const n = store.streak();
  document.getElementById('streak').textContent = n ? `🔥 ${n} ${n === 1 ? 'Tag' : 'Tage'}` : '';
}

await store.init();
window.addEventListener('hashchange', render);
render();
