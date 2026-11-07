// Übersicht: Kapitel nach Gruppe und Priorität, Fortschritt (gelernt/fällig), Einstieg in Lernen/Wiederholen.
//
// renderOverview(el, { model, go(tab, params), openChapter })

import { h, clear, progressBar, formatLine } from '../ui.js';
import { chapterStats, lineStatus, totals, pickNewLine, newLineQueue, canLearn } from './logic.js';
import { progress, setSetting, learnDepth } from './data.js';
import { priorityBadge, freqBadge, repertoireNotice, sideName, button, emptyState, put } from './widgets.js';

export function renderOverview(el, { model, go, openChapter }) {
  const prog = progress();
  const t = totals(model, prog);
  const next = pickNewLine(model, prog);
  const notice = repertoireNotice(model);
  const open = new Set(openChapter ? [openChapter] : []);

  if (notice) el.append(notice);

  // ---------- Kopf: heute ----------
  const limitInput = h('input', {
    type: 'number', min: 0, max: 60, value: t.newPerDay, class: 'op-limit',
    onchange: () => {
      const v = Math.max(0, Math.min(60, Math.round(+limitInput.value || 0)));
      limitInput.value = v;
      setSetting('newPerDay', v);
    },
  });
  const depthSel = h('select', { onchange: e => { setSetting('depth', Number(e.target.value)); location.reload(); } },
    [[6, '6 Züge'], [8, '8 Züge (Standard)'], [10, '10 Züge'], [0, 'ganze Linien']].map(([v, l]) => h('option', { value: v, selected: v === learnDepth() }, l)));
  const nextInfo = next
    ? h('div.small', h('span.muted', 'Als Nächstes: '), h('b', model.chapterById.get(next.chapterId)?.title || ''), ' – ', next.name)
    : (newLineQueue(model, prog).length
      ? h('div.small.muted', `Tageslimit für neue Züge erreicht (${t.newToday}/${t.newPerDay}). Morgen geht es weiter.`)
      : (model.lines.length ? h('div.small.muted', 'Alle Linien gelernt. Stark!') : null));

  el.append(h('div.card.op-today',
    h('div.op-stats',
      stat(t.due, 'fällige Züge', t.due ? 'warn' : ''),
      stat(`${t.newToday}/${t.newPerDay}`, 'neue Züge heute'),
      stat(`${t.learnedLines}/${t.lines}`, 'Linien gelernt'),
      stat(`${t.known}/${t.cards}`, 'Züge im Kopf')),
    h('div.row.op-actions',
      button({ label: t.due ? `Wiederholen (${t.due})` : 'Nichts fällig', primary: !!t.due, disabled: !t.due, onClick: () => go('wiederholen') }),
      button({ label: 'Neue Linie lernen', primary: !t.due && !!next, disabled: !model.lines.length, onClick: () => go('lernen') }),
      button({ label: 'Weichen üben', onClick: () => go('weichen') }),
      button({ label: 'Partie-Check', onClick: () => go('partien') })),
    nextInfo,
    h('label.row.small.muted.op-setting', 'Neue Züge pro Tag:', limitInput, h('span', '(Standard 12, weniger = entspannter)')),
    h('label.row.small.muted.op-setting', 'Lerntiefe:', depthSel,
      h('span', 'Weiter hinten weichen Gegner auf deinem Niveau fast immer ab. Breite schlägt Tiefe.'))));

  if (!model.chapters.length) {
    el.append(emptyState('Noch kein Repertoire',
      'Sobald die Repertoire-Dateien da sind, findest du hier deine Kapitel. Bis dahin kannst du im Katalog stöbern.',
      h('div.row', button({ label: 'Alle Eröffnungen', onClick: () => go('katalog') }))));
    return;
  }

  if (model.conflicts.length) {
    el.append(h('details.op-conflicts.small',
      h('summary', `${model.conflicts.length} Stellung(en) mit mehreren eigenen Zügen (Widerspruch zwischen Linien)`),
      h('ul', model.conflicts.slice(0, 20).map(c => h('li', `${c.moves.join(' / ')} in ${[...new Set(c.lines)].join(', ')}`)))));
  }

  // ---------- Kapitel ----------
  for (const side of ['w', 'b']) {
    const chapters = model.chapters.filter(c => c.side === side);
    if (!chapters.length) continue;
    el.append(h('h2.op-sidehead', `Repertoire ${sideName(side)}`));
    const groups = new Map();
    for (const c of [...chapters].sort((a, b) => a.priority - b.priority || a.order - b.order)) {
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push(c);
    }
    for (const [group, list] of groups) {
      el.append(h('div.op-group',
        h('h3.op-grouphead', group),
        h('div.op-chapters', list.map(c => chapterCard(c)))));
    }
  }

  function chapterCard(ch) {
    const st = chapterStats(ch, prog);
    const nextHere = pickNewLine(model, prog, undefined, { chapterId: ch.id });
    const body = h('div.op-chbody');
    const card = h('div.card.op-chapter' + (st.due ? '.has-due' : ''),
      h('div.row.op-chtop',
        priorityBadge(ch.priority),
        st.due ? h('span.pill.bad', `${st.due} fällig`) : null,
        st.learned === st.lines && st.lines ? h('span.pill.good', 'komplett') : null),
      h('button.op-chtitle', { onclick: toggle }, ch.title),
      h('div.small.muted', `${st.learned}/${st.lines} Linien · ${st.known}/${st.cards} Züge`),
      progressBar(st.lines ? st.learned / st.lines : 0),
      h('div.row.op-chactions',
        st.due ? button({ label: 'Wiederholen', primary: true, onClick: () => go('wiederholen', { chapter: ch.id }) }) : null,
        nextHere ? button({ label: 'Lernen', primary: !st.due, onClick: () => go('lernen', { line: nextHere.id }) }) : null,
        button({ label: 'Baum', onClick: () => go('baum', { chapter: ch.id }) }),
        button({ label: 'Erkunden', onClick: () => go('explorer', { chapter: ch.id }) }),
        button({ label: open.has(ch.id) ? 'Weniger' : 'Linien', cls: 'op-more', onClick: toggle })),
      body);
    if (open.has(ch.id)) fill();
    function toggle() {
      if (open.has(ch.id)) { open.delete(ch.id); clear(body); }
      else { open.add(ch.id); fill(); }
      card.querySelector('.op-more').textContent = open.has(ch.id) ? 'Weniger' : 'Linien';
    }
    function fill() {
      put(body,
        ch.intro ? h('p.op-intro', ch.intro) : null,
        ch.ideas?.length ? h('ul.op-ideas', ch.ideas.map(i => h('li', i))) : null,
        h('div.op-lines', ch.lines.map(l => lineRow(l))));
    }
    return card;
  }

  function lineRow(l) {
    const st = lineStatus(l, prog);
    const cl = canLearn(l, prog);
    return h('div.op-linerow',
      h('div.op-linerow-main',
        h('div', l.name),
        h('div.muted.small.op-linemoves', formatLine(l.moves))),
      freqBadge(l.frequency),
      st.learned
        ? h('span.pill' + (st.due ? '.bad' : '.good'), st.due ? `${st.due} fällig` : `sitzt ${Math.round(st.strength * 100)} %`)
        : h('span.pill', st.newCards ? `${st.newCards} neu` : 'bekannt'),
      st.learned
        ? button({ label: 'Üben', onClick: () => go('wiederholen', { line: l.id }) })
        : button({ label: 'Lernen', title: cl.ok ? '' : 'Tageslimit erreicht, geht trotzdem', onClick: () => go('lernen', { line: l.id }) }),
      button({ label: 'Sparring', onClick: () => go('sparring', { line: l.id }) }));
  }
}

function stat(value, label, kind = '') {
  return h('div.op-stat' + (kind ? '.' + kind : ''), h('div.stat', String(value)), h('div.muted.small', label));
}
