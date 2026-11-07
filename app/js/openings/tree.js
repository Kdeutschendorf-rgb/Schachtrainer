// Baum-Übersicht eines Kapitels: gemeinsame Anfänge einmal, an jeder Weiche eingerückt
// „Spielt Weiß X: …“. Zum Nachschlagen, wie die eigenen Züge von den Gegnerzügen abhängen.
//
// renderTree(el, { model, chapterId, onChapter(id), onPractice(lineId), onExplore(moves, side) })

import { h, clear, figurine } from '../ui.js';
import { chapterTrie } from './logic.js';
import { sideName, button } from './widgets.js';

const num = ply => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;

export function renderTree(el, { model, chapterId, onChapter, onPractice, onExplore }) {
  const chapters = [...model.chapters].sort((a, b) => (a.side === b.side ? 0 : a.side === 'w' ? -1 : 1) || a.priority - b.priority || a.order - b.order);
  const chapter = model.chapterById.get(chapterId) || chapters[0];
  if (!chapter) { el.append(h('div.muted', 'Noch kein Repertoire.')); return; }

  const select = h('select', { onchange: e => onChapter?.(e.target.value) },
    chapters.map(c => h('option', { value: c.id, selected: c.id === chapter.id }, `${sideName(c.side)}: ${c.title}`)));
  const opp = sideName(chapter.side === 'w' ? 'b' : 'w');

  el.append(h('div.card.op-tree-head',
    h('label.row', h('span.muted.small', 'Kapitel'), select),
    h('div.small.muted', `Gemeinsame Züge stehen einmal. Wo sich ${opp} entscheiden kann, teilt sich der Baum: `,
      'darunter steht jeweils deine Antwort. Grün = dein Zug.'),
    chapter.intro ? h('p.op-intro', chapter.intro) : null));

  const box = h('div.card.op-tree');
  el.append(box);
  renderBranch(box, chapterTrie(chapter), [], true);

  // Eine Kette ohne Verzweigung als eine Zeile, Verzweigungen als eingerückte Liste
  function renderBranch(parentEl, node, path, isRoot) {
    const run = [];
    let cur = node;
    const moves = [...path];
    while (cur.children.length === 1) {
      cur = cur.children[0];
      run.push(cur);
      moves.push(cur.san);
    }
    if (run.length || isRoot || !cur.children.length) {
      parentEl.append(h('div.op-tree-run',
        run.map((n, i) => h('span' + (n.own ? '.op-tree-own' : ''), (i === 0 || n.ply % 2 === 0) ? num(n.ply) + ' ' : '', figurine(n.san), ' ')),
        cur.children.length === 0 && cur.lineIds?.length
          ? h('span.op-tree-end', button({ label: 'Üben', cls: 'op-tree-btn', onClick: () => onPractice?.(cur.lineIds[0]) }))
          : null));
    }
    if (cur.children.length > 1) {
      const decider = cur.children[0].own ? 'Du' : opp;
      const list = h('ul.op-tree-branches');
      for (const child of cur.children) {
        const li = h('li', h('div.op-tree-if', decider === 'Du' ? 'Oder du spielst ' : `Spielt ${opp} `,
          h('b', `${num(child.ply)} ${figurine(child.san)}`), ':'));
        const sub = h('div.op-tree-sub');
        li.append(sub);
        // Kind selbst ist schon in der Überschrift, darunter geht es mit seinen Kindern weiter
        renderBranch(sub, { ...child, children: child.children }, [...moves, child.san], false);
        list.append(li);
      }
      parentEl.append(list);
    }
  }

  el.append(h('div.row', button({ label: 'Im Explorer ansehen', onClick: () => onExplore?.([], chapter.side) })));
}
