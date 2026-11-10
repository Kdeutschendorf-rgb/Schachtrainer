// Trainingsschwerpunkt: Basis sind die Fehler aus allen chess.com-Partien (analysis_summary.json → focus.themes).
// Neue Partien (chess.com der letzten 30 Tage und Bot-Partien) kommen als Ergänzung dazu: Ihr Anteil wächst mit
// der Zahl der Fehler, ist aber auf 40 % begrenzt. Eine einzelne Partie verschiebt den Schwerpunkt also nur wenig.

import { dateStr } from '../srs.js';

// Gleiche Gewichte wie analysis/build_app_data.py (TAG_THEMES, CLS_WEIGHT, PHASE_THEMES)
export const TAG_THEMES = {
  gabel: { fork: 1.0 },
  figur_eingestellt: { hangingPiece: 1.0, trappedPiece: 0.2 },
  materialverlust: { hangingPiece: 0.4, pin: 0.3, skewer: 0.2, discoveredAttack: 0.2, capturingDefender: 0.2 },
  schach: { exposedKing: 0.4, intermezzo: 0.3, discoveredAttack: 0.2 },
  matt_zugelassen: { mateIn1: 0.5, mateIn2: 0.5, defensiveMove: 0.6, backRankMate: 0.3 },
  matt_verpasst: { mateIn1: 0.6, mateIn2: 0.6, mateIn3: 0.2 },
  chance_verpasst: { crushing: 0.6, advantage: 0.6 },
};
const CLS_WEIGHT = { blunder: 2, mistake: 1 };
const PHASE_THEMES = { eroeffnung: 'opening', endspiel: 'endgame' };
const MAX_SHARE = 0.4;
const HALF_AT = 20;   // bei diesem Fehlergewicht ist die Hälfte des Höchstanteils erreicht

// Fehler [{cls, tags, phase}] → {themes: Rohgewichte, n: Summe der Gewichte}. weight: Faktor (z. B. 1.5 für Rapid)
export function themesFromErrors(errors, weight = 1) {
  const themes = {};
  let n = 0;
  for (const e of errors || []) {
    const w = (CLS_WEIGHT[e.cls] || 0) * weight;
    if (!w) continue;
    n += w;
    for (const t of e.tags || []) for (const [th, tw] of Object.entries(TAG_THEMES[t] || {})) themes[th] = (themes[th] || 0) + w * tw;
    const pt = PHASE_THEMES[e.phase];
    if (pt) themes[pt] = (themes[pt] || 0) + 0.3 * w;
  }
  return { themes, n };
}

const normalize = m => {
  const top = Math.max(0, ...Object.values(m));
  return top ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / top])) : {};
};

// Bot-Partien der letzten `days` Tage als Fehler-Rohgewichte (wie Rapid gewichtet: Bot-Partien sind langsam gespielt)
export function botRecent(games, days = 30, today = new Date()) {
  const since = dateStr(new Date(today.getTime() - days * 864e5));
  return themesFromErrors((games || []).filter(g => g.date >= since).flatMap(g => g.errors || []), 1.5);
}

// → {themes (normiert, max = 1), share: Anteil der neuen Partien, n}
export function blendFocus(baseThemes, recentParts) {
  const recent = {};
  let n = 0;
  for (const p of recentParts) {
    if (!p) continue;
    n += p.n || 0;
    for (const [k, v] of Object.entries(p.themes || {})) recent[k] = (recent[k] || 0) + v;
  }
  const base = normalize(baseThemes || {});
  const share = n > 0 ? MAX_SHARE * n / (n + HALF_AT) : 0;
  const rec = normalize(recent);
  const out = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(rec)])) out[k] = (1 - share) * (base[k] || 0) + share * (rec[k] || 0);
  const themes = normalize(out);
  return { themes: Object.fromEntries(Object.entries(themes).map(([k, v]) => [k, Math.round(v * 1000) / 1000])), share, n };
}

// Schwerpunkt aus der Analyse-Datei und den Bot-Partien im Fortschritt
export function trainingFocus(summary, playGames) {
  return blendFocus(summary?.focus?.themes, [summary?.recentFocus, botRecent(playGames)]);
}
