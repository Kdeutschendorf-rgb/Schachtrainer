# Schachtrainer – Bauplan

Persönlicher Schachtrainer für Keanu (chess.com: **Keanu098**). Ziel: mit **30 Minuten Training am Tag**
die **Rapid-Elo (10 min)** auf chess.com deutlich steigern. Stand 30.10.2026: Rapid 1141 (Höchstwert 1219),
Bullet 590, Blitz 676. 948 Partien seit Mai 2025, davon 552 Bullet und 293 Rapid.
Selbst eingeschätzte Schwäche: **Eröffnungen** und **zu wenig vorausdenken**.
Auffällig: 225 Niederlagen auf Zeit, 77 abgebrochene Partien.

Gewünscht: Taktikaufgaben, ein festes Eröffnungsrepertoire (erst ein Kern, dann nach und nach fast alle
Eröffnungen), ein eingebauter Coach, der erklärt. Eigene Partien spielen muss nicht sein.

## Technik

- Lokale Web-App, **ohne Build-Schritt**: ES-Module im Browser, keine npm-Pakete, kein Netz zur Laufzeit.
- `server.py` (Python, läuft mit `.venv/bin/python`) liefert `app/` auf **http://localhost:8765** aus.
  Der Server **läuft bereits**. Nicht beenden und nicht neu starten. Nach Änderungen an `server.py` sagt
  der Agent im Abschlussbericht Bescheid.
  - `POST /api/engine` `{fen, depth?|nodes?|movetime?, multipv?, elo?}` → `{lines:[{score:{cp}|{mate}, pv:[uci], san:[SAN], depth}], bestmove}`.
    Bewertungen kommen **immer aus Sicht von Weiß**. Mit `elo` antwortet die Engine als schwächerer Gegner (`lines` ist dann leer).
  - `GET/PUT /api/progress`: der gesamte Fortschritt als JSON (`data/progress.json`).
  - `POST /api/sync`: startet `analysis/sync.py` (holt neue Partien von chess.com, siehe Coach-Modul).
- Natives Stockfish 19: `tools/stockfish/stockfish-macos-universal`. Python mit `python-chess`: `.venv/bin/python -I`.
- Vendor-Bibliotheken in `app/vendor/`: `chess.js` (v1.4, ESM, `import { Chess } from '../vendor/chess.js'`),
  `chessground.min.js` (v9.2, `import { Chessground }`), CSS ist schon in `index.html` eingebunden.
- JS kann man ohne Browser mit JavaScriptCore testen (reine Logik, ohne DOM):
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m datei.mjs` (`print()` statt `console.log`).
  Syntaxfehler in Views findet man so auch: Ein `SyntaxError` erscheint, bevor der DOM-Zugriff scheitert.
- Den Browser **nicht** benutzen. Den UI-Test im Browser macht der Hauptagent danach.
- Die CPU teilt sich eine laufende Partie-Analyse. Engine-Skripte also mit höchstens 2 Threads laufen lassen.

## Kern (fertig, nicht ändern)

| Datei | Zweck |
|---|---|
| `app/index.html`, `app/css/app.css` | Gerüst, Navigation, Grundstile (CSS-Variablen in `:root`) |
| `app/js/main.js` | Hash-Router `#/route?x=y`, lädt `views/<modul>.js`, ruft `mount(el, params)` auf, das eine Aufräumfunktion zurückgibt |
| `app/js/board.js` | `createBoard(el, {fen, orientation, movable, onMove, autoQueen})` → API (siehe Kopfkommentar): `move`, `undo`, `setPosition`, `loadLine`, `setShapes`, `flash`, `pickSquares`, `setMovable`, `setOnMove`, `fen`, `turn`, `chess`, `destroy` |
| `app/js/engine.js` | `analyse(fen, opts)`, `bestMove(fen, {elo})`, `winPct(score, color)`, `formatScore` |
| `app/js/store.js` | `init`, `get(key)`, `update(key, fn)`, `logActivity(counts)`, `addSession`, `streak`, `all` |
| `app/js/srs.js` | Spaced Repetition: `newCard`, `review(card, grade 0–3)`, `isDue`, `strength`, `todayStr`, `addDays` |
| `app/js/ui.js` | `h()`, `clear`, `toast`, `loadCss`, `countdown`, `progressBar`, `feedback`, `loadData(name)`, `figurine`, `formatLine`, `shuffle`, `today` |
| `app/js/coach.js` | Coach-Texte; **gehört dem Coach-Modul**, Signaturen bleiben aber stabil: `THEMES_DE`, `themeName`, `themeInfo`, `MISTAKE_TAGS_DE`, `classify(drop)`, `explainMove(args)` |

Wer eine Änderung am Kern braucht, baut sie im eigenen Modul nach oder schreibt sie in den Abschlussbericht
(Abschnitt „Kern-Wünsche“). Kern-Dateien nicht bearbeiten.

## Regeln für alle Module

- **Dateihoheit:** Jedes Modul ändert nur seine eigenen Dateien (Liste unten).
- Eigene Stile in `app/css/<modul>.css`, geladen per `loadCss('css/<modul>.css')` in `mount`.
- Alle Texte auf **Deutsch**. Ansprache: „du“. In Fließtext deutsche Notation (K, D, T, L, S: „Sf3“, „Lc4“).
  In Zuglisten, unter der Haube und in JSON-Zügen englische SAN, angezeigt mit `figurine()`/`formatLine()`.
- Jede View exportiert `mount(el, params)` und gibt eine Aufräumfunktion zurück (Timer stoppen, `board.destroy()`).
- Jedes Trainingsmodul exportiert zusätzlich einen **Block für den Tagesplan**:
  ```js
  export function runBlock(el, { minutes, mode, onDone }) → cleanup
  ```
  Der Block füllt `el`, zeigt seine Restzeit an (`countdown`) und ruft **genau einmal** `onDone(summary)` auf:
  wenn die Zeit um ist (eine laufende Aufgabe darf noch fertig werden) oder der Nutzer „Block beenden“ klickt.
  `summary = { type, mode, minutes, done, correct, details? }`.
- Fortschritt nur im eigenen Bereich speichern: `store.update('<bereich>', d => {...})`.
  Zusätzlich Tageszähler per `store.logActivity({...})`, z. B. `{ puzzles: 1, puzzlesSolved: 1 }`.
  Fortschritt bleibt JSON-tauglich und kompakt (keine riesigen Arrays: Verläufe auf die letzten ~2000 Einträge kürzen).
- Spielerfarbe in Daten: `'w'`/`'b'`. Brett-Orientierung: `'white'`/`'black'`.
- Keine `alert()`/`confirm()`: lieber `toast()` oder Inline-Feedback.
- Tastatur: Wo es passt, `Leertaste`/`Enter` = weiter, `h` = Hinweis, `←`/`→` = durch Züge blättern.

## Module und Dateien

### 1. Eröffnungen (UI) – `app/js/views/openings.js` (+ ggf. `app/js/openings/*.js`), `app/css/openings.css`
Bereich im Fortschritt: `openings`.
- **Übersicht:** Kapitel aus `data/repertoire_white.json` und `data/repertoire_black.json`, gruppiert nach `group`,
  sortiert nach `priority`. Pro Kapitel: Fortschritt (gelernt/fällig), Priorität als Abzeichen („Kern“, „Aufbau“, „Später“).
- **Lernen** (neue Linie): Die Linie läuft Zug für Zug am Brett ab, mit `notes` als Coach-Text. Danach spielt der
  Nutzer sie sofort einmal selbst nach: Eigene Züge zieht er, Gegnerzüge kommen automatisch.
- **Wiederholen (SRS):** Eine Karte gibt es pro **eigenem Zug in einer Stellung**, Schlüssel = FEN ohne Zugzähler
  (die ersten 4 Felder) + eigener Zug. Gleiche Stellungen in mehreren Linien teilen sich die Karte. Geübt wird linienweise:
  Linie mit fälligen Karten von vorn, der Nutzer muss alle eigenen Züge finden. Falsch → richtigen Zug als Pfeil zeigen,
  Note dazu, Note 0. Richtig beim ersten Versuch → 2 (3, wenn schnell unter ~4 s). Mit Hinweis → 1.
  Limit für neue Züge pro Tag einstellbar (Standard 12).
- **Repertoire-Explorer:** Den Baum am Brett durchklicken. Zu jeder Stellung: „Mein Zug hier“ plus Notiz.
  Spielt man einen Gegnerzug, der nicht im Repertoire steht, zeigt die Engine die beste Antwort (`engine.analyse`, depth 18) mit dem Hinweis
  „Nicht im Repertoire“.
- **Alle Eröffnungen** (Breite): Katalog aus `data/openings_catalog.json` mit Filter nach Familie und Level.
  Am Brett durchspielen, Ideen lesen, Fallen zeigen. Dazu ein **Eröffnungsquiz** aus `data/lichess_openings.json`
  („Wie heißt diese Eröffnung?“ mit 4 Antworten, und „Finde den Hauptzug“).
- **Sparring:** Ab dem Ende einer Repertoire-Linie gegen die Engine mit wählbarer Elo (Standard 1300) weiterspielen,
  um die typischen Pläne zu üben. Danach kurze Engine-Bewertung.
- `runBlock(el, {minutes, mode:'review'})`: zuerst fällige Karten, dann neue Züge bis zum Tageslimit, dann Quiz.
- Fortschritt (`openings`): `{ cards: {[key]: srsCard}, learnedLines: {[lineId]: 'YYYY-MM-DD'}, newToday: {date, count}, settings: {newPerDay}, quiz: {right, wrong} }`.

### 2. Repertoire Weiß (Daten) – `app/data/repertoire_white.json`
### 3. Repertoire Schwarz (Daten) – `app/data/repertoire_black.json`
Format (gilt für beide Dateien):
```json
{
  "version": 1,
  "side": "w",
  "chapters": [
    {
      "id": "w-italian",
      "side": "w",
      "group": "Weiß: 1.e4 e5",
      "title": "Italienisch – Giuoco Pianissimo",
      "priority": 1,
      "intro": "3–6 Sätze: worum es geht, warum diese Wahl auf deinem Niveau.",
      "ideas": ["Typischer Plan 1", "Typischer Plan 2", "Typischer Fehler, den man vermeiden muss"],
      "lines": [
        {
          "id": "w-italian-c3-d3-main",
          "name": "4.c3 Sf6 5.d3 d6 6.O-O",
          "frequency": "häufig",
          "moves": ["e4","e5","Nf3","Nc6","Bc4","Bc5","c3","Nf6","d3","d6","O-O","O-O","Re1","a6"],
          "notes": { "4": "Erklärung zum Zug mit Index 4 (Lc4)…", "13": "…" },
          "plan": "Wie es nach dem Ende der Linie weitergeht (2–4 Sätze)."
        }
      ]
    }
  ]
}
```
- `moves` sind englische SAN ab der Grundstellung. `notes`-Schlüssel sind Indizes in `moves` (als String).
- Pflicht: **jeder eigene Zug ab Index 2** hat eine Note (kurz: Idee und Zweck, 1–3 Sätze). Auch wichtige Gegnerzüge
  bekommen eine Note, Fehler des Gegners mit „Falle!“ markiert und mit der Strafe erklärt.
- Die Linien eines Kapitels dürfen sich nicht widersprechen: gleiche Stellung → gleicher eigener Zug.
- Tiefe: Kernlinien 10–16 Halbzüge, wichtige Fallenlinien gern bis zum Gewinn von Material oder Matt.
- `priority`: 1 = Kern (zuerst lernen), 2 = Aufbau, 3 = später/selten.
- `frequency`: wie oft das auf ca. 1000–1400 chess.com-Rapid vorkommt („häufig“, „mittel“, „selten“).
- Prüfen mit `.venv/bin/python -I analysis/validate_openings.py --engine --only w|b`. Ergebnis: 0 Fehler, und jede Warnung
  ist begründet (z. B. bewusst gewählte praktische Variante) oder behoben.
- Inhalt muss **schachlich korrekt** sein. Jede Behauptung in einer Note („droht Sxf7“, „gewinnt eine Figur“)
  mit python-chess bzw. der Engine nachprüfen.

**Repertoire Weiß (1.e4)**, solide, wenig Theorie und klare Pläne:
- 1…e5 2.Sf3 Sc6 3.Lc4 → Italienisch mit c3/d3 (Giuoco Pianissimo). Gegen 3…Sf6: 4.d3. Fallen des Gegners
  einbauen (z. B. 3…Sd4 4.Sxe5?? Dg5!, also stattdessen 4.Sxd4 oder 4.c3; Légal-Muster).
- 1…e5 2.Sf3 andere: Philidor 2…d6 3.d4 · Russisch 2…Sf6 3.Sxe5 d6 4.Sf3 Sxe4 5.Sc3 (Falle 3…Sxe4?? 4.De2) ·
  2…f5, 2…Df6, 2…De7, 2…d5 kurz und praktisch.
- Skandinavisch 1…d5: 2.exd5 Dxd5 3.Sc3 (gegen Da5, Dd6, Dd8, De5+) sowie 2…Sf6 3.d4.
- Sizilianisch 1…c5: Alapin 2.c3 (gegen 2…d5, 2…Sf6, 2…e6, 2…d6, 2…Sc6, 2…g6).
- Französisch 1…e6: Vorstoß 2.d4 d5 3.e5.
- Caro-Kann 1…c6: Vorstoß 2.d4 d5 3.e5.
- Pirc/Modern 1…d6/1…g6: 2.d4, Sc3, Le3, Dd2, f3 (150er-Angriff).
- Sonstige: 1…Sc6, 1…Sf6 (Aljechin 2.e5), 1…b6, 1…a6 usw. mit einfachem Zentrumsaufbau.

**Repertoire Schwarz:**
- Gegen 1.e4: **1…e5**. Nach 2.Sf3 Sc6: gegen 3.Lc4 **3…Lc5** (Giuoco Piano: 4.c3 Sf6 5.d4/5.d3, 4.O-O, 4.d3,
  4.b4 Evansgambit, 4.Sc3, 4.Sxe5?!) · gegen 3.Lb5 3…a6 4.La4 Sf6 5.O-O Le7 (und 4.Lxc6) · gegen 3.d4 Schottisch
  (4.Sxd4 Sf6, 4.Lc4, 4.c3) · 3.Sc3 Sf6 (Vierspringer) · 3.c3 Ponziani · sonstige 3. Züge.
  Außerdem 2.Sc3 Wiener, 2.Lc4, 2.d4 Mittelgambit (+3.c3 Nordisch), 2.f4 Königsgambit, 2.Dh5, 2.Df3, sonstige.
- Gegen 1.d4: **1…d5** mit Damengambit abgelehnt (2.c4 e6) inkl. Abtauschvariante; gegen London (2.Lf4) mit …c5;
  gegen 2.Sf3 (London/Colle/Torre/c4); 2.e4 Blackmar-Diemer; 2.Lg5; 2.Sc3; sonstige 2. Züge.
  Das bisher gespielte Englund-Gambit 1…e5?! wird ersetzt. Ein kurzer Satz im `intro` erklärt, warum.
- Gegen 1.c4, 1.Sf3, 1.f4, 1.b3, 1.g3, 1.Sc3, 1.b4 und sonstige: einfache, robuste Aufbauten.

### 4. Eröffnungskatalog (Daten) – `app/data/openings_catalog.json`, `app/data/lichess_openings.json`, `analysis/build_openings.py`
- `openings_catalog.json`: **mindestens 120** wichtige Eröffnungen und Varianten (alle großen Systeme für Weiß und Schwarz, Gambits, Fallen):
  ```json
  [{ "id": "sicilian-najdorf", "name": "Sizilianisch: Najdorf-Variante", "nameEn": "Sicilian Defense: Najdorf Variation",
     "eco": "B90", "family": "Sizilianisch", "level": 2,
     "moves": ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"],
     "ideas": "2–4 Sätze zur Idee", "white": "typischer Plan Weiß", "black": "typischer Plan Schwarz",
     "trap": { "moves": ["…ab Grundstellung…"], "text": "Erklärung" } | null,
     "inRepertoire": false }]
  ```
  `level`: 1 = sollte man kennen, 2 = wichtig, 3 = Spezialwissen. `inRepertoire` = Teil des Repertoires aus 2/3.
- `lichess_openings.json`: per Python aus `data/raw/openings/*.tsv` erzeugt:
  `[{eco, name, moves:[SAN], uci:[...], epd}]` (alle ~3.800), für Quiz und Eröffnungsnamen in der App.
- Prüfen mit `analysis/validate_openings.py` (ohne `--only`).

### 5. Taktik – `app/js/views/tactics.js` (+ ggf. `app/js/tactics/*.js`), `app/css/tactics.css`
Bereich: `tactics`.
- Daten: `data/puzzles.json` (≈37.000 Lichess-Aufgaben, Liste von `[id, fen, movesUci (mit Leerzeichen), rating, themes (mit Leerzeichen), openingTags]`).
  **Lichess-Format:** Die FEN zeigt die Stellung *vor* dem Gegnerzug. `moves[0]` ist der Gegnerzug und wird automatisch
  gespielt (nach ca. 500 ms). Danach zieht der Nutzer, abwechselnd mit automatischen Gegnerantworten. Brett aus Sicht des Nutzers.
  Bei Mattaufgaben zählt **jeder** mattsetzende Zug als richtig, nicht nur der gespeicherte.
- `data/my_puzzles.json` (aus den eigenen Partien, kann fehlen oder leer sein): `[{id, fen, moves:[uci], played, cls, phase, tags, tc, date}]`.
  Hier ist der **Nutzer sofort am Zug**: `moves[0]` ist schon der eigene Lösungszug. Anzeige: „Aus deiner Partie vom …,
  du hast hier ‹played› gespielt.“
- **Aufgaben-Wertung** (Glicko-artig, Start 1300 mit hoher Unsicherheit, die schnell sinkt). Auswahl um die eigene Wertung
  (±150), Zeitbonus nur als Anzeige.
- **Modi:** Standard (gewertet, Themenmix gewichtet nach Schwächen) · Thema wählen · Eigene Fehler · Wiederholen
  (falsch gelöste Aufgaben per SRS nach 1/3/7… Tagen) · Rush (3 Minuten, so viele wie möglich, steigende Schwierigkeit) ·
  Rechnen (nur lange Aufgaben, `long`/`veryLong`/`mateIn3+`).
- Schwächen-Gewichte: `data/analysis_summary.json` → `focus.themes: {lichessTheme: Gewicht}` (kann fehlen, dann gleichmäßig) und
  dazu die eigene Fehlerquote pro Thema.
- Nach jeder Aufgabe: richtig/falsch, Themen auf Deutsch (`coach.themeName`, `themeInfo`), Lösung als Pfeile nachspielbar,
  Link „auf Lichess ansehen“ (`https://lichess.org/training/<id>`), Knopf „Analysieren“ (Engine-Zeile anzeigen).
- Statistik im Modul: Wertungsverlauf, Trefferquote pro Thema (stärkste/schwächste Themen).
- `runBlock` Modi: `'warmup'` (leicht: Wertung −300, schnell), `'main'` (gewertet, Schwächen-Mix), `'own'` (eigene Fehler, sonst main).
- Fortschritt (`tactics`): `{ rating, rd, history: [[id, ok(0/1), dateISO, ratingAfter, sekunden]], themeStats: {theme: [richtig, gesamt]}, cards: {id: srsCard}, rush: {best} }`.

### 6. Vorausdenken & Endspiele – `app/js/views/vision.js`, `app/js/views/endgames.js` (+ ggf. `app/js/vision/*.js`), `app/css/vision.css`, `app/css/endgames.css`, `app/data/endgames.json`
Bereiche: `vision`, `endgames`.
**Vorausdenken** (Rechnen und Visualisieren, also genau „mehr Züge vorausdenken“):
- **Blind rechnen:** Eine Stellung aus einer Lichess-Aufgabe steht am Brett. Die nächsten N Halbzüge werden nur als Text angesagt
  (`formatLine`), das Brett bleibt stehen. Dann findet der Nutzer den Schlusszug der Lösung in der *vorgestellten*
  Stellung und zieht ihn auf dem unveränderten Brett (`board.pickSquares`). Danach wird die echte Stellung zur Kontrolle animiert.
  N steigt adaptiv (1→8). Für N≥2 die Aufgaben nehmen, deren Lösung lang genug ist.
- **Drohung erkennen:** Stellung nach dem Gegnerzug (Lichess-Themen `defensiveMove`, `hangingPiece`, `fork` usw.). Schritt 1: „Was droht?“
  Der Nutzer zieht den drohenden Gegnerzug. Die Drohung bestimmt die Engine, indem sie per Nullzug die Seite tauscht
  (FEN mit getauschter Farbe, ohne en passant; ungültige Stellungen wie ein König im Schach überspringen). Schritt 2: die beste Antwort finden.
- **Schach–Schlagen–Drohen-Check (CCT):** In einer Stellung alle Schachgebote und alle Schlagzüge der Seite am Zug finden
  (per Zug am Brett eingeben, Zähler „4/6 gefunden“, dann Auflösung). Trainiert die Gewohnheit vor jedem Zug.
- **Ungedeckte Figuren:** Alle ungedeckten oder zu schwach gedeckten Figuren beider Seiten anklicken.
- Adaptive Schwierigkeit pro Übung, Fortschritt in `vision`: `{ blind: {level, history}, threats: {...}, cct: {...}, loose: {...} }`.
- `runBlock` Modi: `'calc'` (Blind rechnen), `'threats'`, `'cct'`, `'mix'`.
**Endspiele:**
- `endgames.json`: **mindestens 18** Lernstellungen mit `{id, title, level, fen, side, goal: 'win'|'draw', maxMoves, intro, hints:[...], technique}`:
  D+K gegen K, T+K gegen K, K+B gegen K (Opposition, Schlüsselfelder, Quadratregel), Turm gegen Bauer, Lucena, Philidor,
  Dame gegen Bauer auf der 7., falscher Läufer mit Randbauer, Dreiecksmanöver, Durchbruch, Turm hinter den Freibauern,
  verschiedenfarbige Läufer usw. Jede FEN mit python-chess und Engine prüfen: Das Ziel muss erreichbar sein.
- Gespielt wird gegen die Engine in voller Stärke (`engine.bestMove(fen)`). Ziel erreicht: Matt bzw. Umwandlung mit
  klar gewonnener Stellung (Engine-Bewertung ≥ +5 aus Nutzersicht) bzw. Remis gehalten (Zuglimit erreicht, Bewertung nahe 0,
  oder Remis nach Regeln). Hinweise auf Knopfdruck.
- Fortschritt in `endgames` mit SRS pro Stellung. `runBlock` Modus `'basic'`.

### 7. Heute, Bericht & Coach – `app/js/views/today.js`, `app/js/views/report.js`, `app/js/coach.js`, `app/css/today.css`, `app/css/report.css`, `analysis/build_app_data.py`, `analysis/sync.py`, `CLAUDE.md`
**Heute** (Startseite): der 30-Minuten-Plan.
- Begrüßung, Streak, aktuelle Rapid-Elo und Ziel, heutiger Plan als Liste von Blöcken mit Minuten, großer Knopf „Training starten“.
- Standardplan (30 min, anpassbar in den Einstellungen): Aufwärmen Taktik 4 · Eröffnungen 10 · Taktik (Schwächen) 9 ·
  Vorausdenken 5 · Abschluss 2 (eigene Fehler oder Endspiel, wechselt täglich).
  **Adaptiv:** Viele fällige Eröffnungskarten → mehr Eröffnung. Schwächen aus `analysis_summary.json` (`focus`) verschieben die Gewichte.
  Gesamtdauer bleibt bei `settings.dailyMinutes`.
- Ablauf: Blöcke nacheinander über `runBlock` der Module (dynamisch importieren: `../views/openings.js` usw.),
  Gesamtfortschrittsbalken, Pause, „Block überspringen“. Am Ende: Zusammenfassung des Tages, ein Coach-Tipp,
  `store.addSession({date, startedAt, minutes, blocks})`, `store.logActivity({minutes})`.
- Fällt ein Modul aus (Import-Fehler), wird der Block mit Hinweis übersprungen. Der Tagesplan läuft trotzdem weiter.
**Bericht:**
- Daten: `data/analysis_summary.json` (von `build_app_data.py`). Inhalt: Elo-Verlauf pro Modus (SVG-Diagramm, selbst gezeichnet,
  keine Bibliothek), Ergebnisse nach Eröffnung (Weiß/Schwarz, Punkte %, Anzahl), Fehler pro Partiephase, häufigste Fehlertypen,
  Genauigkeit über die Zeit, Zeitverluste, Repertoire-Abdeckung (wie oft deine echten Partien im Repertoire geblieben wären und bis zu welchem Zug).
  Dazu der **Trainingsfortschritt** aus dem Store: Minuten pro Tag (Heatmap/Balken), Aufgaben-Wertung, Eröffnungskarten gelernt/fällig.
- Optional `data/coach_report.json` (schreibt Claude): `{date, headline, strengths:[..], weaknesses:[..], plan:[..], notes}`. Wenn vorhanden, oben anzeigen.
- Knopf „Neue Partien von chess.com holen“ → `POST /api/sync`, danach neu laden.
**Coach (`coach.js`)**: `explainMove` ausbauen. Mit python-chess-ähnlicher Logik in JS (chess.js) erkennen:
  Was schlägt/bedroht die Widerlegung? Hängt danach eine Figur? Gabel? Schach? Matt?
  Ergebnis sind gute deutsche Sätze. Grammatik prüfen („ein Fehler“, „ein Patzer“, „eine Ungenauigkeit“).
  Außerdem `tipOfTheDay(context)` mit ca. 40 kurzen, konkreten Tipps (Denkprozess vor jedem Zug, Zeitmanagement im Rapid usw.).
**`analysis/build_app_data.py`:** liest `data/analysis/games.json`, `mistakes.json`, `my_puzzles.json` (Format siehe
  `analysis/analyze_games.py`, die volle Analyse läuft gerade, zum Testen liegen 7 Beispielpartien da) und schreibt
  `app/data/analysis_summary.json` (Aggregate + `focus: {themes: {lichessTheme: weight}, phases: {...}, openings: [...]}`)
  sowie `app/data/my_puzzles.json`. Zuordnung der Fehler-Tags zu Lichess-Themen (z. B. gabel→fork, figur_eingestellt→hangingPiece,
  matt_zugelassen→mateIn1/mateIn2/defensiveMove, matt_verpasst→mateIn1/mateIn2, chance_verpasst→crushing/advantage).
  Repertoire-Abdeckung über `app/data/repertoire_*.json` (können anfangs fehlen).
**`analysis/sync.py`:** holt über die öffentliche chess.com-API (`https://api.chess.com/pub/player/keanu098/games/archives`,
  mit User-Agent-Header) die Partien der letzten 2 Monate, hängt neue (nicht schon in `data/raw/*.pgn`, Schlüssel: Datum+EndTime+Gegner)
  an `data/raw/chesscom_sync.pgn` an, analysiert nur die neuen (Funktionen aus `analyze_games.py` wiederverwenden: importieren, nicht kopieren,
  Indizes fortlaufend anhängen) und baut danach `build_app_data.py` neu. Letzte Ausgabezeile: JSON `{"new": n, "message": "…"}`.
  `analyze_games.py` darf dafür minimal erweitert werden (z. B. eine Funktion, die eine Liste von PGN-Texten mit Startindex analysiert),
  ohne das bestehende Verhalten zu ändern. **Nicht ausführen**, solange die große Analyse läuft (`pgrep -f analyze_games.py`), sondern mit `--dry-run` testen
  (nur abrufen und zählen, nichts schreiben).
**`CLAUDE.md`** im Projektordner: Anleitung für Claude als Coach in diesem Ordner. Wo die Daten liegen, wie man eine Wochenauswertung
  macht (progress.json + analysis_summary.json lesen und `coach_report.json` schreiben), wie man das Repertoire erweitert (Format, Validator),
  wie man den Server startet.
