"""Hilfsskript für Modul 3 (Repertoire Schwarz).

  show "e4 e5 Nf3 ..." [depth]   – Züge mit Index, nach jedem Zug Engine-Bewertung (Sicht Weiß) und bester Zug
  multi "e4 e5 ..." [n] [depth]  – MultiPV-Zeilen für die Stellung nach den Zügen
  check                          – Struktur von app/data/repertoire_black.json prüfen (Noten für eigene Züge, Längen, Zählung)
"""
import json
import os
import sys

import chess
import chess.engine

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENGINE = os.path.join(ROOT, "tools", "stockfish", "stockfish-macos-universal")
REP = os.path.join(ROOT, "app", "data", "repertoire_black.json")


def eng():
    e = chess.engine.SimpleEngine.popen_uci(ENGINE)
    e.configure({"Threads": 2, "Hash": 128})
    return e


def fmt(score):
    s = score.white()
    return "#%d" % s.mate() if s.is_mate() else "%+.2f" % (s.score() / 100)


def show(moves, depth):
    e = eng()
    b = chess.Board()
    for i, san in enumerate(moves):
        mv = b.parse_san(san)
        b.push(mv)
        info = e.analyse(b, chess.engine.Limit(depth=depth))
        pv = info.get("pv", [])
        best = b.san(pv[0]) if pv else "-"
        print("%2d %-6s eval %-7s best %s" % (i, san, fmt(info["score"]), best))
    print(b.fen())
    e.quit()


def multi(moves, n, depth):
    e = eng()
    b = chess.Board()
    for san in moves:
        b.push_san(san)
    infos = e.analyse(b, chess.engine.Limit(depth=depth), multipv=n)
    for inf in infos:
        print(fmt(inf["score"]), b.variation_san(inf["pv"][:10]))
    e.quit()


def check():
    rep = json.load(open(REP, encoding="utf-8"))
    total = 0
    prio = {}
    problems = []
    for ch in rep["chapters"]:
        for k in ("id", "side", "group", "title", "priority", "intro", "ideas", "lines"):
            if k not in ch:
                problems.append("%s: Feld %s fehlt" % (ch.get("id"), k))
        for line in ch["lines"]:
            total += 1
            prio[ch["priority"]] = prio.get(ch["priority"], 0) + 1
            for k in ("id", "name", "frequency", "moves", "notes", "plan"):
                if k not in line:
                    problems.append("%s: Feld %s fehlt" % (line.get("id"), k))
            if line.get("frequency") not in ("häufig", "mittel", "selten"):
                problems.append("%s: frequency %r" % (line["id"], line.get("frequency")))
            mv = line["moves"]
            notes = line.get("notes", {})
            for i in range(1, len(mv), 2):  # Schwarz: ungerade Indizes
                if str(i) not in notes:
                    problems.append("%s: eigener Zug %d (%s) ohne Note" % (line["id"], i, mv[i]))
            if len(mv) % 2 == 1:
                problems.append("%s: endet mit Weißzug (%d Halbzüge)" % (line["id"], len(mv)))
            if ch["priority"] == 1 and len(mv) < 10:
                problems.append("%s: Kernlinie nur %d Halbzüge" % (line["id"], len(mv)))
            for t in notes.values():
                if any(x in t for x in ("Nf", "Bc", "Qh", "Bb", "Ng", "Nc", "Qd", "Bg", "Rf")):
                    problems.append("%s: englische Notation in Note? %r" % (line["id"], t[:60]))
    print("Linien: %d  nach Priorität: %s  Kapitel: %d" % (total, prio, len(rep["chapters"])))
    for p in problems:
        print("PROBLEM", p)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "show":
        show(sys.argv[2].split(), int(sys.argv[3]) if len(sys.argv) > 3 else 16)
    elif cmd == "multi":
        multi(sys.argv[2].split(), int(sys.argv[3]) if len(sys.argv) > 3 else 3, int(sys.argv[4]) if len(sys.argv) > 4 else 18)
    elif cmd == "check":
        check()
