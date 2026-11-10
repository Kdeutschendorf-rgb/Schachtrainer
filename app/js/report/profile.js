// Abschnitt „Schwächenprofil“ im Bericht: Muster aus den eigenen Rapid-Partien, die die Fehler-Tags nicht zeigen
// (Bedenkzeit, Art der Fehler, Stellungstypen, Übergang aus der Eröffnung). Die Zahlen kommen aus
// weakness_profile.json (analysis/weakness_profile.py), jeder Befund führt zu einem Übungssatz in der Taktik.

import { h } from '../ui.js';

const num = (x, d = 1) => (x == null || Number.isNaN(x) ? '–' : Number(x).toFixed(d).replace('.', ','));
const germanDate = iso => String(iso || '').split('-').reverse().join('.');
const AREA_DE = { zeit: 'Bedenkzeit', vorteil: 'Vorteil verwerten', mechanik: 'So entsteht der Fehler', stellung: 'Stellungstyp', uebergang: 'Nach der Eröffnung' };
const FEATURE_DE = {
  zentrum: 'Zentrum', damen: 'Damen', koenig: 'Dein König', rochaden: 'Rochaden', schutz: 'Königsschutz',
  ungedeckt: 'Ungedeckte Figuren', haengt: 'Vor deinem Zug', spannung: 'Bauern', gegnerzug: 'Letzter Gegnerzug', zugart: 'Dein Zug',
};

function bar(label, value, max, text, cls = '') {
  return h('div.rp-hbar',
    h('span.rp-hbar-label', { title: label }, label),
    h('span.rp-hbar-track', h('span.rp-hbar-fill' + (cls ? '.' + cls : ''), { style: { width: `${max ? Math.max(1, (100 * value) / max) : 0}%` } })),
    h('span.rp-hbar-val', text));
}

function table(head, rows) {
  return h('table.rp-table',
    h('thead', h('tr', head.map(([t, numeric]) => h(numeric ? 'th.num' : 'th', t)))),
    h('tbody', rows.map(r => h('tr', r.map((c, i) => h(head[i][1] ? 'td.num' : 'td', c))))));
}

// Befunde als Liste: Titel, Zahlen, Merksatz, Knopf zum Übungssatz
function findingList(profile, limit) {
  const sets = new Map((profile.sets || []).map(s => [s.id, s]));
  return h('div.rp-findings', (profile.findings || []).slice(0, limit).map(f => {
    const set = f.set && sets.get(f.set);
    return h('div.rp-finding',
      h('div.row', h('strong', f.title), h('span.pill', AREA_DE[f.area] || f.area), h('span.spacer'),
        set ? h('a.btn', { href: `#/taktik?modus=eigene&set=${encodeURIComponent(set.id)}` }, `Üben (${set.n} Stellungen)`) : null),
      h('div', f.text),
      f.rule ? h('div.small.rp-rule', h('b', 'Merksatz: '), f.rule) : null);
  }));
}

export function renderProfile(profile, section) {
  if (!profile?.findings?.length) return null;
  const t = profile.time;
  const maxBucket = t ? Math.max(...t.buckets.map(b => b.share)) : 0;
  const maxMech = Math.max(1, ...(profile.mechanism || []).map(m => m.n));
  const details = [];
  if (t) {
    details.push(h('details.rp-details', h('summary', 'Bedenkzeit im Einzelnen'),
      h('div.rp-kpis.small-tiles',
        h('div.rp-tile', h('div.stat', `${num(t.medianAll)} s`), h('div.small.muted', 'pro Zug (Median, ab Zug 6)')),
        h('div.rp-tile', h('div.stat', `${Math.floor(t.leftLossMedian / 60)}:${String(t.leftLossMedian % 60).padStart(2, '0')}`), h('div.small.muted', 'übrig bei Niederlagen (Median)')),
        h('div.rp-tile', h('div.stat', `${t.lossesHalfClock}/${t.losses}`), h('div.small.muted', 'Niederlagen mit über der halben Zeit auf der Uhr')),
        h('div.rp-tile', h('div.stat', `${num(t.afterError.again, 0)} %`), h('div.small.muted', `Fehler direkt nach einem Fehler (sonst ${num(t.per100, 0)} %)`))),
      h('h3', 'So verteilst du deine Bedenkzeit'),
      t.buckets.map(b => bar(b.label, b.share, maxBucket, `${num(b.share, 0)} %`)),
      h('p.small.muted', `Die Hälfte deiner Züge fällt in unter 5 Sekunden, nur ${num(t.buckets.slice(-2).reduce((s, b) => s + b.share, 0), 0)} % bekommen mehr als 20 Sekunden. `
        + 'Bei 10 Minuten und rund 40 Zügen hättest du im Schnitt 15 Sekunden pro Zug.')));
  }
  if (profile.mechanism?.length) {
    details.push(h('details.rp-details', h('summary', 'Wie deine groben Fehler entstehen'),
      profile.mechanism.map(m => bar(m.label, m.n, maxMech, `${m.n}`, m.mech === 'chance' ? 'neutral' : 'warn')),
      h('p.small.muted', `${profile.errors} grobe Fehler (Patzer und Fehler) in ${profile.games} Rapid-Partien. Eingeordnet nach dem ersten Zug der Widerlegung, die Stockfish gefunden hat.`)));
  }
  if (profile.structure?.length) {
    const rows = [...profile.structure].sort((a, b) => b.z - a.z)
      .map(r => [FEATURE_DE[r.feature] || r.feature, r.value, String(r.moves), num(r.per100), num(r.rest), Math.abs(r.z) >= 2.5 ? (r.z > 0 ? 'mehr Fehler' : 'weniger Fehler') : 'kein Unterschied']);
    details.push(h('details.rp-details', h('summary', 'Stellungstypen im Vergleich'),
      table([['Merkmal'], ['Ausprägung'], ['Züge', true], ['Fehler je 100', true], ['sonst', true], ['Urteil']], rows),
      h('p.small.muted', `Grobe Fehler pro 100 eigene Züge, verglichen in offenen Partien (Material etwa gleich, ab Zug 8: ${profile.live?.moves ?? '–'} Züge). `
        + '„Kein Unterschied“ heißt: Die Abweichung kann Zufall sein. Die Bauernstruktur im Zentrum und die Rochadeseite machen bei dir keinen messbaren Unterschied.')));
  }
  if (profile.conversion?.length) {
    details.push(h('details.rp-details', h('summary', 'Was eine gute Eröffnung bei dir wert ist'),
      table([['Stand nach Zug 10'], ['Partien', true], ['Gewinnchance Zug 10', true], ['Zug 15', true], ['geholte Punkte', true]],
        profile.conversion.map(c => [c.label, String(c.games), `${c.win10} %`, c.win15 == null ? '–' : `${c.win15} %`, `${num(c.score)} %`])),
      h('p.small.muted', 'Gewinnchance laut Engine aus deiner Sicht. Liegen die geholten Punkte in allen Zeilen nah beieinander, entscheidet nicht die Eröffnung deine Partien, sondern das Mittelspiel danach.')));
  }
  return section('profil', 'Schwächenprofil',
    h('p.small.muted', `Aus ${profile.games} Rapid-Partien (${germanDate(profile.range?.from)} bis ${germanDate(profile.range?.to)}): ${profile.moves} eigene Züge, `
      + `${profile.errors} grobe Fehler, Bedenkzeit pro Zug aus ${profile.gamesWithClock} Partien. Wird mit jeder neuen Partie neu berechnet. `
      + 'Der Tagesplan übt jeden Tag einen dieser Sätze mit.'),
    findingList(profile, 8),
    ...details);
}
