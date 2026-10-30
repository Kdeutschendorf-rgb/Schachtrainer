# Schachtrainer: Anleitung für Claude als Coach

Persönlicher Schachtrainer für Keanu (chess.com: **Keanu098**). Ziel: mit 30 Minuten Training am Tag die
**Rapid-Elo (10 min)** deutlich steigern. Schwächen laut Keanu: Eröffnungen und zu wenig vorausdenken.
Der verbindliche Bauplan der App steht in `SPEC.md`.

Dieser Ordner ist **kein Schulfach**: Die Ordner- und Dateiregeln aus dem Schulordner gelten hier nicht.
Antworten und Texte auf Deutsch, Ansprache mit „du“. In Fließtext deutsche Notation (K, D, T, L, S: „Sf3“),
in JSON-Zügen englische SAN.

## Server starten

- Doppelklick auf `start.command` oder im Terminal: `.venv/bin/python server.py` → http://localhost:8765
- Erst prüfen, ob er schon läuft (`curl -s -o /dev/null -w '%{http_code}' http://localhost:8765/`).
  Einen laufenden Server nicht beenden oder neu starten, ohne dass Keanu es will.
- Python immer als `.venv/bin/python -I`. Engine-Jobs mit höchstens 2 Threads.

## Wo die Daten liegen

| Datei | Inhalt |
|---|---|
| `data/progress.json` | Gesamter Trainingsfortschritt der App (schreibt die App über `PUT /api/progress`, Sicherungen in `data/backups/`) |
| `app/data/analysis_summary.json` | Auswertung aller chess.com-Partien (Elo-Verlauf, Eröffnungen, Fehler, Zeit, `focus`, `insights`) |
| `app/data/my_puzzles.json` | Aufgaben aus eigenen Fehlern (für die Taktik) |
| `app/data/coach_report.json` | Deine Wochenauswertung, erscheint oben im Bericht (optional) |
| `data/analysis/games.json`, `mistakes.json`, `my_puzzles.json` | Rohdaten der Engine-Analyse jeder Partie bzw. jedes Fehlers |
| `data/raw/*.pgn` | Partien (Download und `chesscom_sync.pgn` aus dem Sync) |
| `app/data/repertoire_white.json`, `repertoire_black.json` | Eröffnungsrepertoire |
| `app/data/openings_catalog.json`, `lichess_openings.json` | Eröffnungskatalog und Namensliste |

`data/progress.json` ist so aufgebaut:

- `settings`: `dailyMinutes`, `plan` (Anteile der Blöcke), `adaptive`, `goalRapid`, `startRapid`
- `sessions`: `[{date, startedAt, minutes, planned, completed, blocks: [{id, type, mode, minutes, done, correct, skipped?, failed?, details?}]}]`
- `activity`: `{'YYYY-MM-DD': {minutes, puzzles, puzzlesSolved, openingReviews, openingCorrect, openingNew, openingLines, openingQuiz, openingQuizRight, visionTasks, visionSolved, endgames, endgamesSolved}}`
- `tactics`: `rating`, `rd`, `history: [[id, ok, datum, wertungDanach, sekunden]]`, `themeStats: {thema: [richtig, gesamt]}`, `cards`, `rush.best`
- `openings`: `cards: {fen+zug: srsKarte}`, `learnedLines: {lineId: datum}`, `quiz: {right, wrong}`, `settings.newPerDay`
- `vision`: `{blind|threats|cct|loose: {level, streak, history}}`, `endgames`: `{cards, stats, history}`

## Wochenauswertung (wenn Keanu danach fragt)

1. Neue Partien holen: In der App unter „Bericht“ auf „Neue Partien von chess.com holen“ klicken lassen, oder selbst
   `.venv/bin/python -I analysis/sync.py` ausführen (holt die letzten 2 Monate, analysiert nur neue Partien mit
   höchstens 2 Engine-Prozessen, baut danach die App-Daten neu). Probelauf ohne Schreiben: `--dry-run`.
   Nicht starten, solange `pgrep -f analyze_games.py` etwas findet.
2. Lesen: `data/progress.json` (was wurde trainiert: `sessions`, `activity`, Taktik-Wertung, fällige Eröffnungskarten)
   und `app/data/analysis_summary.json` (`elo.series.rapid`, `trend`, `insights`, `focus`, `openings`, `time`,
   `repertoire`). Für Details zu einzelnen Fehlern `data/analysis/mistakes.json` nach `tc == "rapid"` und Datum filtern.
3. Auswerten: Rapid-Elo der Woche, Trainingstage und Minuten, Trefferquoten, wiederkehrende Fehlermuster
   (Fehler-Tags, Phase, Eröffnung), Repertoire-Lücken (`repertoire.w.gaps`, `deviations`), verlassene Partien.
   Konkret und ehrlich, mit Zahlen. Jede Schachbehauptung mit python-chess oder der Engine prüfen.
4. `app/data/coach_report.json` schreiben (UTF-8, gültiges JSON):
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
   Der Bericht zeigt ihn beim nächsten Öffnen oben an. Wenn es hilft, auch `settings.plan` in `data/progress.json`
   vorschlagen (z. B. mehr Eröffnung), aber den Fortschritt nur ändern, wenn Keanu zustimmt und die App geschlossen ist
   (sonst überschreibt die App die Datei beim nächsten Speichern).

## App-Daten neu bauen

`.venv/bin/python -I analysis/build_app_data.py` liest `data/analysis/*.json`, `data/raw/*.pgn` und die Repertoire-Dateien
und schreibt `app/data/analysis_summary.json` und `app/data/my_puzzles.json`. Dauert unter einer Sekunde.
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
- Bericht (`views/report.js`), Coach-Texte und Tipp des Tages (`js/coach.js`).
- Tests ohne Browser mit JavaScriptCore:
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m data/test/test_today_report.mjs`
  (weitere Tests in `data/test/` und `app/js/*/logic.test.mjs`).
