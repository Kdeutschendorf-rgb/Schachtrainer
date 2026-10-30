// Deutsche Bezeichnungen für Themen, Fehlerklassen und Bedenkzeiten.
import { THEMES_DE, themeName, themeInfo, MISTAKE_TAGS_DE } from '../coach.js';
import { EXTRA_THEMES_DE } from './logic.js';

export function themeLabel(t) {
  if (THEMES_DE[t]) return themeName(t);
  return EXTRA_THEMES_DE[t]?.[0] || t;
}

export function themeTip(t) {
  return (THEMES_DE[t] ? themeInfo(t) : EXTRA_THEMES_DE[t]?.[1]) || '';
}

export function mistakeTag(t) {
  return MISTAKE_TAGS_DE[t] || t;
}

// mit unbestimmtem Artikel: „ein Patzer“, „eine Ungenauigkeit“
export const CLS_DE = { blunder: 'ein Patzer', mistake: 'ein Fehler', inaccuracy: 'eine Ungenauigkeit' };
export const TC_DE = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Täglich' };

// „2025.05.01“ oder „2025-05-01“ → „01.05.2025“
export function germanDate(d) {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})/.exec(String(d || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d || '');
}

// Lichess-Eröffnungstag „Sicilian_Defense_Alapin_Variation“ → lesbarer Name (genaueste Angabe)
export function openingLabel(tags) {
  const last = String(tags || '').split(' ').filter(Boolean).pop();
  return last ? last.replace(/_/g, ' ') : '';
}

// Zeit nur als Anzeige, ohne Einfluss auf die Wertung
export function speedLabel(sec) {
  if (sec <= 10) return '⚡ Blitzschnell';
  if (sec <= 30) return 'Zügig';
  if (sec <= 90) return '';
  return 'Gründlich';
}
