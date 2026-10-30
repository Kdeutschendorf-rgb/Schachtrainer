"""Hilfsskript (Repertoire Schwarz): baut app/data/repertoire_black.json aus b_source.py.

Quellformat je Linie: "pgn" = englische SAN, Notiz in {…} direkt hinter dem Zug, zu dem sie gehört.
Fehlt einer Linie die Notiz zu einem Zug, wird sie aus einer anderen Linie mit gleicher Stellung + gleichem Zug
übernommen (gleiche Stellung → gleiche Erklärung).

Prüft: legale Züge, jeder eigene Zug (ungerade Indizes) hat eine Notiz, gleiche Stellung → gleicher eigener Zug
(über ALLE Kapitel, weil die SRS-Karten global geteilt werden), englische Figurenkürzel in Texten.
Aufruf: .venv/bin/python -I data/test/b_build.py
"""
import json
import os
import re
import sys

import chess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "app", "data", "repertoire_black.json")
sys.path.insert(0, HERE)
from b_source import CHAPTERS  # noqa: E402

TOKEN = re.compile(r"\{[^}]*\}|[^\s{}]+")
# englische Figurenkürzel in deutschen Texten (z. B. "Nf3", "Bxc4", "Qh5", "Rf1")
ENGLISH = re.compile(r"(?<![A-Za-zÄÖÜäöüß])[NBRQ]x?[a-h]?[1-8]?x?[a-h][1-8]")


def parse(pgn):
    moves, notes = [], {}
    for tok in TOKEN.findall(pgn):
        if tok.startswith("{"):
            text = " ".join(tok[1:-1].split())
            idx = str(len(moves) - 1)
            notes[idx] = (notes[idx] + " " + text) if idx in notes else text
        else:
            moves.append(tok)
    return moves, notes


def main():
    errors, warnings = [], []
    parsed = []
    shared = {}  # (epd, san) -> Notiz
    for ch in CHAPTERS:
        for ln in ch["lines"]:
            moves, notes = parse(ln["pgn"])
            board = chess.Board()
            epds = []
            for i, san in enumerate(moves):
                try:
                    mv = board.parse_san(san)
                except ValueError:
                    errors.append("%s: Zug %d '%s' illegal" % (ln["id"], i, san))
                    break
                if board.san(mv) != san:
                    errors.append("%s: Zug %d '%s' sollte '%s' heißen" % (ln["id"], i, san, board.san(mv)))
                epds.append(board.epd())
                if str(i) in notes:
                    shared.setdefault((board.epd(), san), notes[str(i)])
                board.push(mv)
            parsed.append((ch, ln, moves, notes, epds))

    own = {}
    chapters_out = []
    by_id = {}
    for ch, ln, moves, notes, epds in parsed:
        for i, (san, epd) in enumerate(zip(moves, epds)):
            if str(i) not in notes and (epd, san) in shared:
                notes[str(i)] = shared[(epd, san)]
            if i % 2 == 1:
                if str(i) not in notes:
                    errors.append("%s: eigener Zug %d %s ohne Notiz" % (ln["id"], i, san))
                if epd in own and own[epd][0] != san:
                    errors.append("%s: Zug %d %s widerspricht %s (%s)" % (ln["id"], i, san, own[epd][1], own[epd][0]))
                own.setdefault(epd, (san, ln["id"]))
        if len(moves) % 2 == 1:
            errors.append("%s: endet mit Weißzug" % ln["id"])
        if ch["priority"] == 1 and len(moves) < 10:
            warnings.append("%s: Kernlinie nur %d Halbzüge" % (ln["id"], len(moves)))
        if ln["frequency"] not in ("häufig", "mittel", "selten"):
            errors.append("%s: frequency %r" % (ln["id"], ln["frequency"]))
        for k, t in notes.items():
            if ENGLISH.search(t):
                warnings.append("%s: Notiz %s enthält englische Notation: %s" % (ln["id"], k, ENGLISH.findall(t)))
        for field in ("plan", "name"):
            if ENGLISH.search(ln.get(field, "")):
                warnings.append("%s: %s enthält englische Notation" % (ln["id"], field))
        if ch["id"] not in by_id:
            out = {k: ch[k] for k in ("id", "group", "title", "priority", "intro", "ideas")}
            out = {"id": ch["id"], "side": "b", **{k: v for k, v in out.items() if k != "id"}, "lines": []}
            by_id[ch["id"]] = out
            chapters_out.append(out)
            for t in [ch["intro"]] + ch["ideas"]:
                if ENGLISH.search(t):
                    warnings.append("%s: Kapiteltext enthält englische Notation: %s" % (ch["id"], ENGLISH.findall(t)))
        by_id[ch["id"]]["lines"].append({
            "id": ln["id"], "name": ln["name"], "frequency": ln["frequency"], "moves": moves,
            "notes": {k: notes[k] for k in sorted(notes, key=int)}, "plan": ln["plan"],
        })

    for w in warnings:
        print("WARNUNG", w)
    for e in errors:
        print("FEHLER", e)
    n = sum(len(c["lines"]) for c in chapters_out)
    print("%d Kapitel, %d Linien, %d Fehler, %d Warnungen" % (len(chapters_out), n, len(errors), len(warnings)))
    if errors:
        sys.exit(1)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "side": "b", "chapters": chapters_out}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("geschrieben:", OUT)


if __name__ == "__main__":
    main()
