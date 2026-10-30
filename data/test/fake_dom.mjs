// Minimales Schein-DOM für Rauchtests in jsc (kein echter Browser).
// Reicht für h()/clear()/Chessground-Aufbau, Layout-Werte sind Dummys.

const sink = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : sink),
  apply: () => sink,
  set: () => true,
});

export class Node {
  constructor() { this.childNodes = []; this.parentNode = null; }
  get children() { return this.childNodes.filter(c => c instanceof Element); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
  get isConnected() { let n = this; while (n) { if (n === globalThis.document?.documentElement) return true; n = n.parentNode; } return false; }
  append(...nodes) { for (const n of nodes) this.appendChild(n instanceof Node ? n : new Text(String(n))); }
  prepend(...nodes) { for (const n of nodes.reverse()) this.insertBefore(typeof n === 'string' ? new Text(n) : n, this.firstChild); }
  appendChild(n) { n.parentNode?.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) { n.parentNode?.removeChild(n); n.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  replaceChild(n, old) { this.insertBefore(n, old); this.removeChild(old); return old; }
  remove() { this.parentNode?.removeChild(this); }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach(c => (c.parentNode = null)); this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Text(String(v))); }
}

export class Text extends Node {
  constructor(t) { super(); this.data = t; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = v; }
}

class ClassList {
  constructor(el) { this.el = el; }
  get list() { return this.el.className.split(/\s+/).filter(Boolean); }
  add(...c) { this.el.className = [...new Set([...this.list, ...c])].join(' '); }
  remove(...c) { this.el.className = this.list.filter(x => !c.includes(x)).join(' '); }
  contains(c) { return this.list.includes(c); }
  toggle(c, force) { const has = this.contains(c); const want = force ?? !has; if (want) this.add(c); else this.remove(c); return want; }
}

export class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.attributes = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.listeners = {};
    this.classList = new ClassList(this);
    this.dataset = {};
    this.disabled = false;
    this.value = '';
    this.hidden = false;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'value') this.value = String(v); if (k === 'disabled') this.disabled = true; }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); }
  dispatch(t, ev = {}) { for (const f of this.listeners[t] || []) f({ target: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  set innerHTML(v) { this.textContent = ''; }
  get innerHTML() { return ''; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 }; }
  get offsetWidth() { return 400; }
  get offsetHeight() { return 400; }
  get clientWidth() { return 400; }
  get clientHeight() { return 400; }
  matches(sel) { return sel.startsWith('.') ? this.classList.contains(sel.slice(1)) : this.tagName === sel.toUpperCase(); }
  querySelectorAll(sel) { const out = []; const walk = n => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getElementsByTagName(t) { return this.querySelectorAll(t); }
  closest(sel) { let n = this; while (n instanceof Element) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  focus() {} blur() {} scrollIntoView() {}
  attachShadow() { return this; }
}

// Alle Knöpfe/Texte finden (für Tests)
export function allText(el) { return el.textContent; }
export function findButton(root, text) {
  return root.querySelectorAll('button').find(b => b.textContent.includes(text) && !b.disabled) || null;
}

export function install({ fetchMap = {}, engine } = {}) {
  const doc = new Element('document');
  const html = new Element('html');
  doc.appendChild(html);
  const head = new Element('head');
  const body = new Element('body');
  html.append(head, body);
  const toasts = new Element('div');
  toasts.attributes.id = 'toasts';
  body.append(toasts);
  const docListeners = {};
  Object.assign(doc, {
    documentElement: html, head, body,
    createElement: t => new Element(t),
    createElementNS: (_, t) => new Element(t),
    createTextNode: t => new Text(t),
    getElementById: id => (id === 'toasts' ? toasts : null),
    addEventListener: (t, f) => (docListeners[t] ||= []).push(f),
    removeEventListener: (t, f) => (docListeners[t] = (docListeners[t] || []).filter(x => x !== f)),
    key(k, target = body) { for (const f of docListeners.keydown || []) f({ key: k, target, preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false }); },
    listenerCount: t => (docListeners[t] || []).length,
  });
  // jsc hat setTimeout, aber kein clearTimeout/setInterval: nachbauen
  if (typeof globalThis.clearTimeout !== 'function') {
    const raw = globalThis.setTimeout;
    const cancelled = new Set();
    let id = 0;
    globalThis.setTimeout = (f, ms = 0) => { const my = ++id; raw(() => { if (!cancelled.delete(my)) f(); }, ms); return my; };
    globalThis.clearTimeout = t => { if (t) cancelled.add(t); };
    const intervals = new Set();
    globalThis.setInterval = (f, ms) => { const my = ++id; intervals.add(my); const loop = () => { if (!intervals.has(my)) return; f(); raw(loop, ms); }; raw(loop, ms); return my; };
    globalThis.clearInterval = t => intervals.delete(t);
  }
  globalThis.Node = Node;
  globalThis.Element = Element;
  globalThis.HTMLElement = Element;
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.scrollTo = () => {};
  globalThis.requestAnimationFrame = f => setTimeout(() => f(Date.now()), 0);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.getComputedStyle = () => sink;
  globalThis.performance ||= { now: () => Date.now() };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  globalThis.console = { log: (...a) => print(a.join(' ')), warn: (...a) => print('WARN ' + a.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ')), error: (...a) => print('ERROR ' + a.map(x => x?.stack || x).join(' ')) };
  globalThis.URLSearchParams ||= class {
    constructor() { this.m = []; }
    set(k, v) { this.m = this.m.filter(x => x[0] !== k); this.m.push([k, String(v)]); }
    toString() { return this.m.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'); }
  };
  globalThis.location = { hash: '' };
  globalThis.history = { replaceState: (_, __, url) => { globalThis.location.hash = url; } };
  globalThis.fetch = async (url, opts) => {
    if (url === 'api/engine') {
      const body = JSON.parse(opts.body);
      const data = engine ? engine(body) : { lines: [], bestmove: null };
      return { ok: true, status: 200, json: async () => data };
    }
    if (url === 'api/progress') return { ok: true, status: 200, json: async () => ({}) };
    const file = fetchMap[url];
    if (!file) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(read(file)) };
  };
  return doc;
}

export const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
