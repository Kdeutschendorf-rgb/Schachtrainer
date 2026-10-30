// Alle Eröffnungen (Breite): Katalog mit Filter nach Familie, Level und Suche.
// Am Brett durchspielen, Ideen lesen, Fallen zeigen.
//
// const c = createCatalog(el, { catalog, focusId, onSelect(id), onQuiz });  c.destroy()

import { createBoard } from '../board.js';
import { h, clear } from '../ui.js';
import { onKeys, moveList, button, put } from './widgets.js';

const LEVEL = { 1: 'Grundwissen', 2: 'Wichtig', 3: 'Spezialwissen' };

export function createCatalog(el, { catalog, focusId, onSelect, onQuiz }) {
  const families = [...new Set(catalog.map(o => o.family).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const filter = { family: '', level: '', text: '', rep: false };
  let current = catalog.find(o => o.id === focusId) || catalog[0];
  let seq = [];           // aktuell gezeigte Zugfolge (Eröffnung oder Falle)
  let cursor = 0;
  let mode = 'main';      // main | trap

  const boardEl = h('div');
  const detailEl = h('div.op-cat-detail');
  const movesBox = h('div.op-movesbox');
  const nav = h('div.row.op-controls',
    button({ label: '⏮', onClick: () => goto(0) }),
    button({ label: '←', onClick: () => goto(cursor - 1) }),
    button({ label: '→', onClick: () => goto(cursor + 1) }),
    button({ label: '⏭', onClick: () => goto(seq.length) }),
    button({ label: 'Brett drehen', onClick: () => board.flip() }));
  const listEl = h('div.op-cat-list');
  const countEl = h('span.muted.small');

  const famSel = h('select', { onchange: () => { filter.family = famSel.value; renderList(); } },
    h('option', { value: '' }, 'Alle Familien'), families.map(f => h('option', { value: f }, f)));
  const lvlSel = h('select', { onchange: () => { filter.level = lvlSel.value; renderList(); } },
    h('option', { value: '' }, 'Alle Level'), Object.entries(LEVEL).map(([k, v]) => h('option', { value: k }, `${k} · ${v}`)));
  const search = h('input', { type: 'text', placeholder: 'Suchen (Name, ECO) …', oninput: () => { filter.text = search.value.trim().toLowerCase(); renderList(); } });
  const repBox = h('input', { type: 'checkbox', onchange: () => { filter.rep = repBox.checked; renderList(); } });

  el.append(
    h('div.trainer.op-trainer', boardEl, h('div.side', detailEl, nav, movesBox)),
    h('div.card.op-cat-filter',
      h('div.row', famSel, lvlSel, search, h('label.row.small', repBox, 'nur mein Repertoire'), h('span.spacer'), countEl,
        onQuiz ? button({ label: 'Quiz starten', primary: true, onClick: onQuiz }) : null),
      listEl));

  const board = createBoard(boardEl, { movable: 'none' });

  function matches(o) {
    if (filter.family && o.family !== filter.family) return false;
    if (filter.level && String(o.level) !== filter.level) return false;
    if (filter.rep && !o.inRepertoire) return false;
    if (filter.text) {
      const hay = `${o.name} ${o.nameEn || ''} ${o.eco || ''} ${o.family || ''}`.toLowerCase();
      if (!hay.includes(filter.text)) return false;
    }
    return true;
  }

  function renderList() {
    const items = catalog.filter(matches);
    countEl.textContent = `${items.length} von ${catalog.length}`;
    clear(listEl);
    if (!items.length) { listEl.append(h('div.muted', 'Keine Eröffnung passt zum Filter.')); return; }
    const byFam = new Map();
    for (const o of items) {
      const f = o.family || 'Sonstige';
      if (!byFam.has(f)) byFam.set(f, []);
      byFam.get(f).push(o);
    }
    for (const [fam, list] of byFam) {
      listEl.append(h('div.op-cat-fam', fam));
      listEl.append(h('div.op-cat-grid', list.map(o => h('button.op-cat-item' + (o === current ? '.active' : ''),
        { onclick: () => select(o) },
        h('div.op-cat-name', o.name),
        h('div.row.small',
          h('span.muted', o.eco || ''),
          h(`span.pill.op-lvl-${o.level || 3}`, LEVEL[o.level] || 'Spezialwissen'),
          o.inRepertoire ? h('span.pill.good', 'Repertoire') : null,
          o.trap ? h('span.pill.bad', 'Falle') : null)))));
    }
  }

  function select(o) {
    current = o;
    onSelect?.(o.id);
    showMain();
    renderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showMain() {
    mode = 'main';
    seq = current.moves || [];
    renderDetail();
    goto(seq.length);
  }

  function showTrap() {
    if (!current.trap?.moves?.length) return;
    mode = 'trap';
    seq = current.trap.moves;
    renderDetail();
    // Falle ab dem Ende der Eröffnung (bzw. dem gemeinsamen Anfang) Zug für Zug zeigen
    let common = 0;
    while (common < seq.length && seq[common] === current.moves?.[common]) common++;
    goto(common);
  }

  function goto(n) {
    cursor = Math.max(0, Math.min(seq.length, n));
    try {
      board.loadLine(seq.slice(0, cursor));
    } catch {
      clear(movesBox).append(h('div.feedback.bad', 'Diese Zugfolge ist fehlerhaft.'));
      return;
    }
    clear(movesBox).append(moveList(seq, { cur: cursor - 1, faded: cursor, onClick: i => goto(i + 1) }));
    const last = cursor === seq.length;
    trapTextEl.hidden = !(mode === 'trap' && last);
  }

  const trapTextEl = h('div.op-note.trap');

  function renderDetail() {
    const o = current;
    if (!o) { clear(detailEl).append(h('div.muted', 'Keine Eröffnung gewählt.')); return; }
    clear(trapTextEl).append(h('div.op-note-head', h('b', 'Falle')), h('div', o.trap?.text || ''));
    put(detailEl,
      h('div.card.tight.op-head',
        h('div.row', h('span.pill', o.eco || '–'), h(`span.pill.op-lvl-${o.level || 3}`, LEVEL[o.level] || ''), o.inRepertoire ? h('span.pill.good', 'in deinem Repertoire') : null),
        h('h3.op-title', o.name),
        o.nameEn ? h('div.muted.small', o.nameEn) : null),
      mode === 'trap'
        ? h('div.row', h('span.pill.bad', 'Falle'), button({ label: 'Zurück zur Eröffnung', onClick: showMain }))
        : (o.trap ? button({ label: 'Falle zeigen', cls: 'op-trapbtn', onClick: showTrap }) : null),
      o.ideas ? h('div.op-note', h('div.op-note-head', h('b', 'Idee')), h('div', o.ideas)) : null,
      o.white ? h('div.op-note', h('div.op-note-head', h('b', '♔ Plan Weiß')), h('div', o.white)) : null,
      o.black ? h('div.op-note', h('div.op-note-head', h('b', '♚ Plan Schwarz')), h('div', o.black)) : null,
      mode === 'trap' ? trapTextEl : null,
      mode === 'trap' ? h('div.muted.small', 'Mit → Zug für Zug durch die Falle.') : null);
  }

  const offKeys = onKeys({
    ArrowLeft: () => goto(cursor - 1),
    ArrowRight: () => goto(cursor + 1),
    Home: () => goto(0),
    End: () => goto(seq.length),
  }, el);

  renderList();
  if (current) showMain(); else renderDetail();

  return {
    board,   // für Tests und Fehlersuche
    destroy() {
      offKeys();
      board.destroy();
    },
  };
}

