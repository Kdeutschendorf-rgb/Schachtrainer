"""Holt neue Partien von chess.com, analysiert sie und baut die App-Daten neu.

Aufruf:  .venv/bin/python -I analysis/sync.py [--dry-run] [--months 2]
  --dry-run   nur abrufen und zählen, nichts schreiben und nichts analysieren
Ablauf: Archive der letzten Monate über die öffentliche API laden → Partien, die noch nicht in
data/raw/*.pgn stehen (Schlüssel: Datum + Endzeit + Gegner), analysieren (Funktionen aus analyze_games.py)
→ an data/analysis/*.json anhängen → an data/raw/chesscom_sync.pgn anhängen → build_app_data.py.
Letzte Ausgabezeile ist immer JSON: {"new": n, "message": "…"} (liest server.py für /api/sync).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from multiprocessing import Pool

# Mit -I steht der Skriptordner nicht im Suchpfad; die Nachbarmodule liegen hier.
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import analyze_games as ag      # noqa: E402  (Analyse-Funktionen wiederverwenden, nicht kopieren)
import build_app_data as bad    # noqa: E402

API = "https://api.chess.com/pub/player/%s/games/archives" % ag.ME
USER_AGENT = "Schachtrainer/1.0 (lokaler Trainer, Spieler Keanu098)"
SYNC_PGN = os.path.join(bad.RAW, "chesscom_sync.pgn")

# Die API liefert englische Termination-Texte; analyze_games.py erwartet die deutschen aus dem Download.
TERMINATION_DE = [
    (r"^(\S+) won on time$", r"\1 gewinnt auf Zeit"),
    (r"^(\S+) won by checkmate$", r"\1 gewinnt durch Schachmatt"),
    (r"^(\S+) won by resignation$", r"\1 gewinnt durch Aufgabe"),
    (r"^(\S+) won - game abandoned$", r"\1 hat gewonnen - die Partie wurde verlassen"),
    (r"^Game drawn by repetition$", "Remis wegen Stellungswiederholung"),
    (r"^Game drawn by agreement$", "Remis durch Vereinbarung"),
    (r"^Game drawn by stalemate$", "Remis durch Patt"),
    (r"^Game drawn by timeout vs insufficient material$", "Remis - Zeitüberschreitung, jedoch ungenügend Material"),
    (r"^Game drawn by insufficient material$", "Remis - ungenügendes Material zum Mattsetzen"),
    (r"^Game drawn by 50-move rule$", "Remis durch 50-Züge-Regel"),
]


def emit(new, message, **extra):
    print(json.dumps({"new": new, "message": message, **extra}, ensure_ascii=False), flush=True)


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def german_termination(pgn):
    def repl(m):
        text = m.group(1)
        for pat, sub in TERMINATION_DE:
            if re.match(pat, text):
                text = re.sub(pat, sub, text)
                break
        return '[Termination "%s"]' % text
    return re.sub(r'^\[Termination "(.*)"\]$', repl, pgn, count=1, flags=re.M)


def headers_of(pgn):
    return dict(bad.HEADER_RE.findall(pgn))


def key_of(headers):
    white = headers.get("White", "")
    opp = headers.get("Black", "") if white.lower() == ag.ME else white
    return bad.game_key(headers.get("Date"), headers.get("EndTime"), opp)


def known_keys():
    keys = set()
    for path in sorted(os.listdir(bad.RAW)):
        if not path.endswith(".pgn"):
            continue
        with open(os.path.join(bad.RAW, path), encoding="utf-8", errors="replace") as fh:
            for block in re.split(r"\n(?=\[Event )", fh.read()):
                h = headers_of(block)
                if h:
                    keys.add(key_of(h))
    # Auch schon analysierte Partien: Bricht ein Lauf nach dem Analysieren, aber vor dem Anhängen an
    # chesscom_sync.pgn ab, würden sie sonst beim nächsten Mal doppelt in games.json landen.
    for g in bad.load_json(os.path.join(ag.OUT, "games.json"), []):
        keys.add(bad.game_key(g.get("date"), g.get("end"), g.get("opponent")))
    return keys


def fetch_new(months):
    archives = fetch_json(API).get("archives", [])[-months:]
    keys = known_keys()
    fresh, seen = [], set()
    total = 0
    for url in archives:
        for g in fetch_json(url).get("games", []):
            if g.get("rules", "chess") != "chess" or not g.get("pgn"):
                continue
            total += 1
            pgn = german_termination(g["pgn"].strip())
            h = headers_of(pgn)
            k = key_of(h)
            if k in keys or k in seen:
                continue
            seen.add(k)
            fresh.append((g.get("end_time", 0), pgn))
    fresh.sort(key=lambda x: x[0])
    return [p for _, p in fresh], total, len(archives)


def analysis_running():
    try:
        out = subprocess.run(["pgrep", "-f", "analyze_games.py"], capture_output=True, text=True)
        return bool(out.stdout.strip())
    except OSError:
        return False


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    os.replace(tmp, path)


def analyse_new(pgns):
    """Analysiert die neuen Partien mit fortlaufenden Indizes und hängt sie an data/analysis/ an."""
    paths = {n: os.path.join(ag.OUT, n + ".json") for n in ("games", "mistakes", "my_puzzles")}
    games = bad.load_json(paths["games"], [])
    mistakes = bad.load_json(paths["mistakes"], [])
    puzzles = bad.load_json(paths["my_puzzles"], [])
    start = max((g["game"] for g in games), default=-1) + 1
    book = ag.load_openings()
    jobs = [(start + i, text, book) for i, text in enumerate(pgns)]
    new_games = []
    with Pool(min(2, len(jobs))) as pool:     # höchstens 2 Engines mit je 1 Thread
        for n, (s, m, p) in enumerate(pool.imap_unordered(ag.analyse_game, jobs), 1):
            new_games.append(s)
            mistakes.extend(m)
            puzzles.extend(p)
            print("%d/%d neue Partien analysiert" % (n, len(jobs)), flush=True)
    new_games.sort(key=lambda g: g["game"])
    games.extend(new_games)
    games.sort(key=lambda g: g["game"])
    mistakes.sort(key=lambda m: (m["game"], m["ply"]))
    os.makedirs(ag.OUT, exist_ok=True)
    write_json(paths["games"], games)
    write_json(paths["mistakes"], mistakes)
    write_json(paths["my_puzzles"], puzzles)
    return new_games


def append_raw(pgns):
    need_sep = os.path.exists(SYNC_PGN) and os.path.getsize(SYNC_PGN) > 0
    with open(SYNC_PGN, "a", encoding="utf-8") as fh:
        for text in pgns:
            fh.write(("\n\n" if need_sep else "") + text.strip() + "\n")
            need_sep = True


def main():
    ap = argparse.ArgumentParser(description="Neue chess.com-Partien holen und analysieren")
    ap.add_argument("--dry-run", action="store_true", help="nur abrufen und zählen, nichts schreiben")
    ap.add_argument("--months", type=int, default=2, help="wie viele Monatsarchive (Standard 2)")
    args = ap.parse_args()

    if not args.dry_run and analysis_running():
        emit(0, "Die große Partie-Analyse läuft noch. Bitte später noch einmal synchronisieren.")
        return 0
    try:
        pgns, total, months = fetch_new(max(1, args.months))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        sys.stderr.write("chess.com nicht erreichbar: %s\n" % exc)
        emit(0, "chess.com ist gerade nicht erreichbar (%s)." % exc)
        return 1

    if args.dry_run:
        emit(len(pgns), "Probelauf: %d Partien in %d Monaten gefunden, davon %d neu. Nichts geschrieben."
             % (total, months, len(pgns)), dryRun=True)
        return 0
    if not pgns:
        emit(0, "Keine neuen Partien. Alles ist auf dem neuesten Stand.")
        return 0

    try:
        new_games = analyse_new(pgns)
        append_raw(pgns)
        bad.build(argparse.Namespace(out=bad.PLAYER_DATA,
                                     rep_white=os.path.join(bad.APP_DATA, "repertoire_white.json"),
                                     rep_black=os.path.join(bad.APP_DATA, "repertoire_black.json")))
    except Exception as exc:   # letzte Zeile muss trotzdem JSON sein (server.py liest sie)
        import traceback
        traceback.print_exc()
        emit(0, "Synchronisieren fehlgeschlagen: %s" % exc)
        return 1
    rapid = [g for g in new_games if g["tc"] == "rapid"]
    msg = "%d neue %s analysiert" % (len(new_games), "Partie" if len(new_games) == 1 else "Partien")
    if rapid:
        msg += ", davon %d Rapid (aktuell %d)" % (len(rapid), rapid[-1]["myElo"])
    emit(len(new_games), msg + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main())
