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
  spielen: 'play',
};

const view = document.getElementById('view');
let cleanup = null;

function parseHash() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { route: ROUTES[path] ? path : 'heute', params };
}

async function render() {
  // Ein anderes Gerät hat inzwischen trainiert: beim Seitenwechsel den neuen Stand laden
  if (store.isStale()) { location.reload(); return; }
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

// Anmeldung: mit Konto (Fortschritt auf allen Geräten) oder als Gast (nur dieses Gerät).
function showLogin() {
  document.body.classList.add('logged-out');
  return new Promise(resolve => {
    const field = (label, attrs) => h('label.login-field', h('span', label), h('input', attrs));
    const name = field('Dein Vorname', { type: 'text', autocomplete: 'given-name' });
    const chess = field('chess.com-Name (optional)', { type: 'text', autocomplete: 'off', autocapitalize: 'off' });
    const email = field('E-Mail', { type: 'email', autocomplete: 'email' });
    const pw = field('Passwort (mind. 6 Zeichen)', { type: 'password', autocomplete: 'current-password' });
    const msg = h('div.small.login-msg');
    const profile = () => ({ displayName: name.lastChild.value.trim(), chesscomName: chess.lastChild.value.trim() });
    const run = async (fn, btn) => {
      msg.textContent = '';
      for (const b of view.querySelectorAll('button')) b.disabled = true;
      try { await fn(); resolve(profile()); } catch (e) {
        msg.textContent = /invalid login/i.test(e.message) ? 'E-Mail oder Passwort stimmt nicht.' : e.message;
        for (const b of view.querySelectorAll('button')) b.disabled = false;
      }
    };
    const signIn = h('button.primary', { onclick: () => run(() => store.signIn(email.lastChild.value.trim(), pw.lastChild.value)) }, 'Anmelden');
    const signUp = h('button', { onclick: () => run(() => store.signUp(email.lastChild.value.trim(), pw.lastChild.value)) }, 'Konto erstellen');
    const guest = h('button.td-link', { onclick: () => run(async () => store.useGuest()) }, 'Ohne Konto trainieren (nur dieses Gerät)');
    view.append(h('div.card.login',
      h('h1', '♞ Schachtrainer'),
      h('p.muted', 'Mit Konto wird dein Fortschritt auf allen Geräten abgeglichen, auch offline.'),
      name, chess, email, pw,
      h('div.row', signIn, signUp), msg, guest));
  });
}

let { user, guest } = await store.session();
let profile = null;
if (!user && !guest) {
  if (!navigator.onLine) store.useGuest();
  else profile = await showLogin();
}
clear(view);
document.body.classList.remove('logged-out');
await store.init();
if (profile) {
  store.update('settings', s => {
    if (profile.displayName) s.displayName = profile.displayName;
    if (profile.chesscomName) s.chesscomName = profile.chesscomName;
  });
}
store.registerPlayer(store.get('settings').chesscomName);
window.addEventListener('hashchange', render);
render();

// Offline-Modus. Auf dem lokalen Server (Entwicklung) nur mit ?sw, sonst sieht man Änderungen erst nach Cache-Wechsel.
if ('serviceWorker' in navigator && (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.search.includes('sw'))) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Offline-Modus nicht verfügbar', err));
}
