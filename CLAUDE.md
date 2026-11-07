# Schachtrainer: Anleitung für Claude als Coach

Persönlicher Schachtrainer für Keanu (chess.com: **Keanu098**). Ziel: mit 30 Minuten Training am Tag die
**Rapid-Elo (10 min)** deutlich steigern. Schwächen laut Keanu: Eröffnungen und zu wenig vorausdenken.
Der verbindliche Bauplan der App steht in `SPEC.md`.

Dieser Ordner ist **kein Schulfach**: Die Ordner- und Dateiregeln aus dem Schulordner gelten hier nicht.
Antworten und Texte auf Deutsch, Ansprache mit „du“. In Fließtext deutsche Notation (K, D, T, L, S: „Sf3“),
in JSON-Zügen englische SAN.

## Wie die App läuft

- Online unter https://kdeutschendorf-rgb.github.io/Schachtrainer/ (GitHub Pages, Repo `Kdeutschendorf-rgb/Schachtrainer`).
  Jeder Push auf `main` veröffentlicht `app/` neu (`.github/workflows/pages.yml`, trägt die Version in `app/sw.js` ein).
  **Vor jedem Push Keanu fragen.** gh: `tools/gh_2.103.3_macOS_arm64/bin/gh`, beim Push als Credential-Helper.
- Offline-App (Service Worker `app/sw.js`, Dateiliste `app/precache.json` aus `scripts/build_precache.sh`),
  Engine: Stockfish 18 lite als WASM im Browser (`app/js/engine.js`).
- Fortschritt: im Browser (localStorage) und in Supabase, Tabelle `progress` (eine Zeile pro Nutzer, `data` jsonb),
  Abgleich in `app/js/store.js`. Login mit E-Mail und Passwort oder als Gast (nur ein Gerät).
  Den Fortschritt kann Claude nicht direkt lesen; Keanu kann im Bericht nachsehen oder Zahlen schicken.
- Lokal testen: `.venv/bin/python server.py` → http://localhost:8765 (Offline-Modus dort nur mit `?sw`).
  Einen laufenden Server nicht beenden oder neu starten, ohne dass Keanu es will.
- Python immer als `.venv/bin/python -I`. Engine-Jobs mit höchstens 2 Threads.
- Freunde: Jeder trägt seinen chess.com-Namen ein. Persönliche Daten liegen unter `app/data/players/<name klein>/`
  und werden nur geladen, wenn der Name in `app/data/players.json` steht; sonst zeigt die App eine neutrale Version.
  Angemeldete Nutzer melden ihren Namen in der Supabase-Tabelle `players` (`supabase_players.sql`). Die Action
  `.github/workflows/weekly.yml` läuft täglich: `analysis/update_players.py` wertet neue Namen aus (3 Monate, max. 200
  Partien, max. 5 Spieler pro Lauf), montags alle Spieler. Welcher Spieler: Umgebungsvariable `SCHACH_PLAYER`
  (`analysis/player.py`); Keanus Rohdaten liegen in `data/analysis/` und `data/raw/`, alle anderen in `data/players/<name>/`.
- Abgleich zwischen Geräten: Waren zwei Geräte gleichzeitig offline, führt `app/js/merge.js` die Stände zusammen
  (Karten: zuletzt geübt gewinnt, Verlauf und Sitzungen vereinigt, Tageszähler Maximum). Test: `data/test/test_merge.mjs`.

## Wo die Daten liegen

| Datei | Inhalt |
|---|---|
| Supabase `progress` | Gesamter Trainingsfortschritt (Aufbau siehe unten) |
| `app/data/players/keanu098/analysis_summary.json` | Auswertung aller chess.com-Partien (Elo-Verlauf, Eröffnungen, Fehler, Zeit, `focus`, `insights`) |
| `app/data/players/keanu098/my_puzzles.json` | Aufgaben aus eigenen Fehlern (für die Taktik) |
| `app/data/players/keanu098/coach_report.json` | Deine Wochenauswertung, erscheint oben im Bericht (optional) |
| `data/analysis/games.json`, `mistakes.json`, `my_puzzles.json` | Rohdaten der Engine-Analyse jeder Partie bzw. jedes Fehlers |
| `data/raw/*.pgn` | Partien (Download und `chesscom_sync.pgn` aus dem Sync) |
| `app/data/repertoire_white.json`, `repertoire_black.json` | Eröffnungsrepertoire |
| `app/data/openings_catalog.json`, `lichess_openings.json` | Eröffnungskatalog und Namensliste |

Der Fortschritt ist so aufgebaut:

- `settings`: `displayName`, `chesscomName`, `dailyMinutes`, `plan` (Anteile der Blöcke), `adaptive`, `goalRapid`, `startRapid`
- `sessions`: `[{date, startedAt, minutes, planned, completed, blocks: [{id, type, mode, minutes, done, correct, skipped?, failed?, details?}]}]`
- `activity`: `{'YYYY-MM-DD': {minutes, puzzles, puzzlesSolved, openingReviews, openingCorrect, openingNew, openingLines, openingQuiz, openingQuizRight, visionTasks, visionSolved, endgames, endgamesSolved}}`
- `tactics`: `rating`, `rd`, `history: [[id, ok, datum, wertungDanach, sekunden]]`, `themeStats: {thema: [richtig, gesamt]}`, `cards`, `rush.best`
- `openings`: `cards: {fen+zug: srsKarte}`, `learnedLines: {lineId: datum}`, `quiz: {right, wrong}`, `settings.newPerDay`
- `vision`: `{blind|threats|cct|loose: {level, streak, history}}`, `endgames`: `{cards, stats, history}`

## Wochenauswertung (wenn Keanu danach fragt)

1. Neue Partien holt jeden Montag die GitHub Action `.github/workflows/weekly.yml` (sync.py mit System-Stockfish,
   committet und veröffentlicht). Vorher also `git pull`. Von Hand geht es mit `.venv/bin/python -I analysis/sync.py`
   (Probelauf: `--dry-run`), nicht starten, solange `pgrep -f analyze_games.py` etwas findet.
2. Lesen: den Fortschritt, falls Keanu ihn schickt (was wurde trainiert: `sessions`, `activity`, Taktik-Wertung, fällige Eröffnungskarten)
   und `app/data/players/keanu098/analysis_summary.json` (`elo.series.rapid`, `trend`, `insights`, `focus`, `openings`, `time`,
   `repertoire`). Für Details zu einzelnen Fehlern `data/analysis/mistakes.json` nach `tc == "rapid"` und Datum filtern.
3. Auswerten: Rapid-Elo der Woche, Trainingstage und Minuten, Trefferquoten, wiederkehrende Fehlermuster
   (Fehler-Tags, Phase, Eröffnung), Repertoire-Lücken (`repertoire.w.gaps`, `deviations`), verlassene Partien.
   Konkret und ehrlich, mit Zahlen. Jede Schachbehauptung mit python-chess oder der Engine prüfen.
4. `app/data/players/keanu098/coach_report.json` schreiben (UTF-8, gültiges JSON):
   ```json
   {
     "date": "2026-11-06",
     "headline": "Ein Satz, der die Woche zusammenfasst",
     "strengths": ["2–4 konkrete Stärken mit Zahlen"],
     "weaknesses": ["2–4 konkrete Baustellen mit Zahlen"],
     "plan": ["3–5 konkrete Aufgaben für die nächste Woche"],
     "notes": "Optional: längerer Text, Absätze mit \n"
   }
   ```
   Erscheint nach dem Push (vorher fragen) im Bericht. Plan-Änderungen (z. B. mehr Eröffnung) schlägt Keanu selbst
   unter „Plan anpassen“ ein.

## App-Daten neu bauen

`.venv/bin/python -I analysis/build_app_data.py` liest `data/analysis/*.json`, `data/raw/*.pgn` und die Repertoire-Dateien
und schreibt `analysis_summary.json` und `my_puzzles.json` nach `app/data/players/keanu098/`. Dauert unter einer Sekunde.
Nötig nach Änderungen am Repertoire (für die Repertoire-Abdeckung) oder an der Analyse.
Die volle Neuanalyse aller Partien (`analysis/analyze_games.py <pgn>`) dauert lange und nutzt viele Kerne: nur auf Wunsch.

## Repertoire erweitern

- Dateien: `app/data/repertoire_white.json` (1.e4) und `app/data/repertoire_black.json` (1…e5 gegen 1.e4, 1…d5 gegen 1.d4).
  Format und inhaltliche Regeln stehen in `SPEC.md` (Abschnitt „Repertoire Weiß/Schwarz“): Kapitel mit `id`, `side`, `group`,
  `title`, `priority` (1 Kern, 2 Aufbau, 3 später), `intro`, `ideas`, `lines` mit `moves` (englische SAN ab Grundstellung),
  `notes` (Index → Text, jeder eigene Zug ab Index 2), `plan`, `frequency`.
- Gleiche Stellung → gleicher eigener Zug, in allen Linien beider Kapitel einer Seite.
- Fallen des Gegners als „Falle!“ markieren und die Strafe erklären. Jede Behauptung mit python-chess/Engine prüfen.
- Prüfen: `.venv/bin/python -I analysis/validate_openings.py --engine --only w` (bzw. `b`). Ziel: 0 Fehler,
  jede Warnung begründet oder behoben. Danach `build_app_data.py` laufen lassen.
- Wo Lücken sind, zeigt der Bericht unter „Repertoire-Abdeckung“ (bzw. `analysis_summary.json` → `repertoire`).
- Neue Linien lernt Keanu automatisch im Tagesplan (neue Züge bis zum Tageslimit). Lernstand hängt an der Stellung,
  geänderte Linien behalten also ihren Fortschritt, solange die Stellungen gleich bleiben.

## Aufbau der App (Kurzfassung)

- `app/` ohne Build-Schritt (ES-Module), Hash-Router in `app/js/main.js`, Views in `app/js/views/`.
- Heute (`views/today.js`): 30-Minuten-Plan aus Blöcken, die über `runBlock` der Module laufen.
  Standardplan: Aufwärmen 4 · Eröffnungen 8 · Taktik 10 · Vorausdenken 6 · Abschluss 2.
- Eröffnungen: Wiederholen und Weichen laufen als Stellungstraining (`openings/drill.js`): einzelne Stellungen
  gemischt, nach dem Zug die Weichentabelle („spielt er X, spielst du Y“). Baum-Übersicht `openings/tree.js`,
  Partie-Check `openings/gamecheck.js` (letzte 30 Partien aus `analysis_summary.json` → `recentGames` plus Bot-Partien).
  Lerntiefe einstellbar (Standard 8 Züge, `openings.settings.depth`), Linien werden dafür gekürzt.
- Spielen (`views/play.js`, `play/`): Bots mit eigener Wertung (`play.rating`, Start = chess.com-Rapid), Partie wird
  danach analysiert; Fehler werden eigene Taktikaufgaben (`play.puzzles`), Repertoire-Abweichungen fällige Karten.
- Endspiele: Coach für die Grundmatts (`endgames/coach.js`, Käfig = erreichbare Felder des Königs, erklärt Engine-Züge).
- Vorausdenken: Drohungen nur, wenn der letzte Gegnerzug sie erzeugt (`vision/logic.js` → `threatFromLastMove`);
  im Mix kommt „Blind rechnen“ dreimal so oft.
- Bericht (`views/report.js`), Coach-Texte und Tipp des Tages (`js/coach.js`).
- Tests ohne Browser mit JavaScriptCore:
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m data/test/test_today_report.mjs`
  (weitere Tests in `data/test/` und `app/js/*/logic.test.mjs`).
