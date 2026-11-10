// Automatischer Wochenbericht: die letzten 7 Tage im Vergleich zu vorher, aus Partien (chess.com und Bots)
// und Training. Ohne DOM, damit testbar. Den ausführlichen Bericht schreibt Claude weiterhin auf Wunsch.
//
// weeklyReport({ summary, playGames, activity, deviations, today }) →
//   { from, to, stats, good: [Sätze], todo: [Sätze], plan: [Sätze], headline }

import { dateStr } from '../srs.js';

export const TAG_DE = {
  figur_eingestellt: 'Figur eingestellt', materialverlust: 'Material verloren', gabel: 'Gabel übersehen',
  schach: 'Schach übersehen', matt_zugelassen: 'Matt zugelassen', matt_verpasst: 'Matt verpasst', chance_verpasst: 'Chance verpasst',
};
const TAG_PLAN = {
  figur_eingestellt: 'Vor jedem Zug: Welche meiner Figuren ist danach ungedeckt? Die Taktik übt „Hängende Figur“ verstärkt.',
  materialverlust: 'Vor jedem Zug alle Schlagzüge des Gegners durchgehen (Vorausdenken: „Schach & Schlagen“).',
  gabel: 'Auf Springer- und Bauerngabeln achten: Stehen zwei Figuren oder König und Figur einen Springerzug auseinander?',
  schach: 'Vor jedem Zug alle Schachgebote des Gegners prüfen.',
  matt_zugelassen: 'Grundreihe und König sichern: Hat dein König ein Luftloch?',
  matt_verpasst: 'Bei Angriffen erst alle Schachgebote durchrechnen, oft steckt ein Matt drin.',
  chance_verpasst: 'Macht der Gegner einen Fehler, kurz innehalten: Was hat sich geändert, was kann ich jetzt gewinnen?',
};

// Lokales Datum wie überall im Fortschritt (toISOString wäre UTC: nach Mitternacht fehlte sonst der heutige Tag)
const dayStr = d => dateStr(d);
export const de1 = x => x.toFixed(1).replace('.', ',');

// Zielverfolgung: Wie viele Punkte pro Woche braucht es bis zum Zieldatum? null, wenn Ziel oder Datum fehlen.
export function goalPace(now, target, date, today = new Date()) {
  if (!now || !target || !date) return null;
  const end = new Date(date + 'T12:00:00');
  const weeks = (end - today) / (7 * 864e5);
  if (!(weeks > 0)) return { weeks: 0, left: target - now, perWeek: null, over: true };
  return { weeks, left: target - now, perWeek: Math.ceil(Math.max(0, target - now) / weeks) };
}

export function weeklyReport({ summary, playGames = [], activity = {}, deviations = null, goal = null, today = new Date() }) {
  const to = dayStr(today);
  const from = dayStr(new Date(today.getTime() - 6 * 864e5));
  const inWeek = d => d >= from && d <= to;
  const beforeWeek = d => d < from;

  // Partien: chess.com Rapid (Ziel) und Bots; Bullet/Blitz zählen für Fehler nicht, die sind zu schnell gespielt
  const cc = (summary?.recentGames || []).filter(g => g.tc === 'rapid');
  const bots = playGames.map(g => ({ ...g, tc: 'bot' }));
  const games = [...cc, ...bots];
  const week = games.filter(g => inWeek(g.date));
  const earlier = games.filter(g => beforeWeek(g.date));
  const errRate = list => {
    const withErr = list.filter(g => Array.isArray(g.errors));
    return withErr.length ? withErr.reduce((s, g) => s + g.errors.length, 0) / withErr.length : null;
  };
  const tagCount = {};
  for (const g of week) for (const e of g.errors || []) for (const t of e.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);

  // Elo: letzter Rapid-Wert vor der Woche gegen den neuesten
  const series = summary?.elo?.series?.rapid || [];
  const before = [...series].reverse().find(r => r[0] < from)?.[1] ?? null;
  const now = series.length ? series[series.length - 1][1] : null;
  const botWeek = bots.filter(g => inWeek(g.date));
  const acc = botWeek.filter(g => g.accuracy != null);

  // Training
  const days = Object.entries(activity).filter(([d]) => inWeek(d));
  const minutes = Math.round(days.reduce((s, [, a]) => s + (a.minutes || 0), 0));
  const trainDays = days.filter(([, a]) => (a.minutes || 0) >= 5).length;
  const puzzles = days.reduce((s, [, a]) => s + (a.puzzles || 0), 0);
  const solved = days.reduce((s, [, a]) => s + (a.puzzlesSolved || 0), 0);

  const stats = {
    minutes, trainDays, puzzles, solved,
    games: week.length, rapid: week.filter(g => g.tc === 'rapid').length, bot: botWeek.length,
    score: week.length ? week.reduce((s, g) => s + (g.result === 'W' ? 1 : g.result === 'D' ? 0.5 : 0), 0) : 0,
    eloBefore: before, eloNow: now,
    errNow: errRate(week), errBefore: errRate(earlier),
    botAccuracy: acc.length ? Math.round(acc.reduce((s, g) => s + g.accuracy, 0) / acc.length) : null,
    botRating: botWeek.length ? [botWeek[0].ratingBefore, botWeek[botWeek.length - 1].ratingAfter] : null,
    topTags, deviations,
  };

  const good = [], todo = [], plan = [];
  if (trainDays >= 5) good.push(`An ${trainDays} von 7 Tagen trainiert (${minutes} Minuten). So wächst es.`);
  else if (trainDays > 0) todo.push(`Nur an ${trainDays} von 7 Tagen trainiert (${minutes} Minuten). Regelmäßig schlägt viel.`);
  else todo.push('Diese Woche noch nicht trainiert.');
  if (puzzles >= 20) good.push(`${puzzles} Taktikaufgaben, davon ${solved} gelöst (${Math.round(100 * solved / puzzles)} %).`);
  if (before != null && now != null && now !== before) (now > before ? good : todo).push(`Rapid-Elo ${before} → ${now} (${now > before ? '+' : ''}${now - before}).`);
  const pace = goal ? goalPace(now, goal.rapid, goal.date, today) : null;
  stats.pace = pace;
  if (pace && pace.left > 0 && !pace.over) {
    const gained = before != null && now != null ? now - before : null;
    const text = `Ziel ${goal.rapid} bis ${goal.date.split('-').reverse().join('.')}: noch ${pace.left} Punkte, also ${pace.perWeek} pro Woche.`;
    if (gained != null && gained >= pace.perWeek) good.push(`${text} Diese Woche waren es ${gained >= 0 ? '+' : ''}${gained}, du liegst im Plan.`);
    else todo.push(`${text}${gained != null ? ` Diese Woche waren es ${gained >= 0 ? '+' : ''}${gained}.` : ''}`);
  } else if (pace && pace.left <= 0) good.push(`Ziel ${goal.rapid} erreicht! Zeit für ein neues.`);
  else if (pace?.over) todo.push(`Das Zieldatum für ${goal.rapid} ist vorbei. Setz unter „Plan anpassen“ ein neues.`);
  if (stats.errNow != null && stats.errBefore != null && week.length >= 2) {
    const a = de1(stats.errNow), b = de1(stats.errBefore);
    if (stats.errNow < stats.errBefore - 0.15) good.push(`Weniger grobe Fehler: ${a} pro Partie (vorher ${b}).`);
    else if (stats.errNow > stats.errBefore + 0.15) todo.push(`Mehr grobe Fehler: ${a} pro Partie (vorher ${b}).`);
  }
  if (stats.botAccuracy != null) (stats.botAccuracy >= 80 ? good : todo).push(`Genauigkeit gegen Bots: ${stats.botAccuracy} %${stats.botRating ? `, Bot-Wertung ${stats.botRating[0]} → ${stats.botRating[1]}` : ''}.`);
  if (topTags.length) {
    const [t, n] = topTags[0];
    todo.push(`Häufigste Fehlerart: ${TAG_DE[t] || t} (${n}-mal).`);
    if (TAG_PLAN[t]) plan.push(TAG_PLAN[t]);
  }
  if (deviations?.mine) {
    todo.push(deviations.games === 1 ? 'In deiner Partie bist du selbst vom Repertoire abgewichen.' : `In ${deviations.mine} von ${deviations.games} Partien bist du selbst vom Repertoire abgewichen.`);
    plan.push('Eröffnungen → Partie-Check: die Abweichungen als Stellungen üben.');
  } else if (deviations?.games) good.push(deviations.games === 1 ? 'In deiner Partie bist du im Repertoire geblieben, bis der Gegner abwich.' : `In allen ${deviations.games} Partien bist du im Repertoire geblieben, bis der Gegner abwich.`);
  if (!week.length) plan.push('Spiel ein, zwei Rapid-Partien oder gegen einen Bot, damit der Trainer sieht, was im Spiel hängen bleibt.');
  if (trainDays < 5) plan.push('Ziel: an 5 Tagen die 30 Minuten aus „Heute“.');
  if (plan.length < 3) plan.push('Im Tagesplan läuft der Schwerpunkt automatisch mit, du musst nichts umstellen.');

  const headline = good.length > todo.length ? 'Gute Woche, weiter so.'
    : !week.length && !minutes ? 'Eine ruhige Woche. Ein kleiner Neustart reicht.'
      : 'Eine Woche mit Baustellen, der Plan unten packt sie an.';
  return { from, to, stats, good, todo, plan: plan.slice(0, 4), headline };
}
