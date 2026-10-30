"""Prüft app/data/repertoire_white.json, repertoire_black.json und app/data/openings_catalog.json.

Aufruf:  .venv/bin/python -I analysis/validate_openings.py [--engine] [--only w|b]
  - alle Züge legal (SAN, ab Grundstellung)
  - notes-Indizes passen zu den Zügen
  - Linien eines Kapitels widersprechen sich nicht (gleiche Stellung → gleicher eigener Zug)
  - mit --engine: jeder EIGENE Zug wird mit Stockfish geprüft; Verlust > 60 Centibauern gegenüber
    dem besten Zug wird gemeldet (Gegnerzüge dürfen schlecht sein, das sind ja die Fallen).
Exit-Code 1, wenn Fehler gefunden wurden.
"""
import json
import os
import sys

import chess
import chess.engine

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "tools", "stockfish", "stockfish-macos-universal")
REPS = [os.path.join(ROOT, "app", "data", "repertoire_%s.json" % c) for c in ("white", "black")]
CAT = os.path.join(ROOT, "app", "data", "openings_catalog.json")


def key(board):
    return board.epd()


def main():
    use_engine = "--engine" in sys.argv
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    errors, warnings = [], []
    engine = chess.engine.SimpleEngine.popen_uci(ENGINE) if use_engine else None
    if engine:
        engine.configure({"Threads": 2, "Hash": 128})
    checked = {}

    ids = set()
    for rep_path in REPS:
        if not os.path.exists(rep_path):
            continue
        rep = json.load(open(rep_path, encoding="utf-8"))
        for ch in rep["chapters"]:
            side = chess.WHITE if ch["side"] == "w" else chess.BLACK
            if only and ch["side"] != only:
                continue
            own_choice = {}
            for line in ch["lines"]:
                lid = line["id"]
                if lid in ids:
                    errors.append("doppelte Linien-ID %s" % lid)
                ids.add(lid)
                board = chess.Board()
                for i, san in enumerate(line["moves"]):
                    try:
                        mv = board.parse_san(san)
                    except ValueError:
                        errors.append("%s: Zug %d '%s' ist illegal (Stellung %s)" % (lid, i, san, board.fen()))
                        break
                    if board.turn == side:
                        k = key(board)
                        if k in own_choice and own_choice[k][0] != mv:
                            errors.append("%s: Zug %d '%s' widerspricht Linie %s (dort %s)" % (
                                lid, i, san, own_choice[k][1], board.san(own_choice[k][0])))
                        own_choice.setdefault(k, (mv, lid))
                        if engine and (k, mv) not in checked:
                            infos = engine.analyse(board, chess.engine.Limit(depth=16), multipv=3)
                            best = infos[0]["score"].pov(side).score(mate_score=10000)
                            after = board.copy()
                            after.push(mv)
                            info = engine.analyse(after, chess.engine.Limit(depth=15))
                            got = info["score"].pov(side).score(mate_score=10000)
                            checked[(k, mv)] = best - got
                            if best - got > 60:
                                warnings.append("%s: Zug %d %s verliert %d cp (Engine: %s)" % (
                                    lid, i, san, best - got, board.san(infos[0]["pv"][0])))
                    board.push(mv)
                for idx in line.get("notes", {}):
                    if not idx.isdigit() or int(idx) >= len(line["moves"]):
                        errors.append("%s: notes-Index %s passt nicht" % (lid, idx))

    if os.path.exists(CAT) and not only:
        cat = json.load(open(CAT, encoding="utf-8"))
        for op in cat:
            board = chess.Board()
            for i, san in enumerate(op["moves"]):
                try:
                    board.push_san(san)
                except ValueError:
                    errors.append("Katalog %s: Zug %d '%s' illegal" % (op["id"], i, san))
                    break
            trap = op.get("trap")
            if trap:
                board = chess.Board()
                for i, san in enumerate(trap["moves"]):
                    try:
                        board.push_san(san)
                    except ValueError:
                        errors.append("Katalog %s Falle: Zug %d '%s' illegal" % (op["id"], i, san))
                        break

    if engine:
        engine.quit()
    for w in warnings:
        print("WARNUNG", w)
    for e in errors:
        print("FEHLER", e)
    print("%d Fehler, %d Warnungen" % (len(errors), len(warnings)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
