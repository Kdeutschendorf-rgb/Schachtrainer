"""Filtert die Lichess-Puzzle-Datenbank auf passende Aufgaben.

Aufruf:  .venv/bin/python -I analysis/filter_puzzles.py
Ausgabe: app/data/puzzles.json  (Liste von [id, fen, moves, rating, themes, openingTags])
"""
import csv
import io
import json
import os
import random

import zstandard

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "lichess_db_puzzle.csv.zst")
DST = os.path.join(ROOT, "app", "data", "puzzles.json")

MIN_RATING, MAX_RATING = 700, 2100
PER_THEME = 900        # Obergrenze pro Hauptthema
GENERAL = 6000         # zusätzliche gemischte Aufgaben
OPENING_EXTRA = 2500   # Aufgaben aus typischen Eröffnungen

THEMES = [
    "fork", "pin", "skewer", "hangingPiece", "discoveredAttack", "doubleCheck", "deflection",
    "attraction", "decoy", "clearance", "interference", "intermezzo", "trappedPiece", "sacrifice",
    "xRayAttack", "zugzwang", "quietMove", "defensiveMove", "capturingDefender", "exposedKing",
    "kingsideAttack", "mateIn1", "mateIn2", "mateIn3", "backRankMate", "smotheredMate",
    "anastasiaMate", "arabianMate", "hookMate", "promotion", "advancedPawn", "rookEndgame",
    "pawnEndgame", "queenEndgame", "bishopEndgame", "knightEndgame", "queenRookEndgame",
    "opening", "endgame", "equality",
]
OPENING_KEYS = ("Italian", "Two_Knights", "Scandinavian", "Sicilian", "French", "Caro-Kann",
                "Russian", "Petrov", "Philidor", "Englund", "Queens_Gambit", "London", "Scotch",
                "Ruy_Lopez", "Vienna", "Kings_Gambit", "Pirc", "Modern", "Center_Game", "Ponziani")


def main():
    rng = random.Random(42)
    by_theme = {t: [] for t in THEMES}
    general, opening = [], []
    seen_count = 0
    with open(SRC, "rb") as fh:
        reader = csv.reader(io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(fh), encoding="utf-8"))
        next(reader)
        for row in reader:
            pid, fen, moves, rating, rd, pop, plays, themes, _url, otags = row[:10]
            rating, rd, pop, plays = int(rating), int(rd), int(pop), int(plays)
            if not (MIN_RATING <= rating <= MAX_RATING) or rd > 90 or pop < 80 or plays < 300:
                continue
            seen_count += 1
            item = [pid, fen, moves, rating, themes, otags]
            tl = themes.split()
            # Reservoir-Sampling pro Thema, damit die Auswahl über die ganze Datei streut
            for t in tl:
                if t in by_theme:
                    bucket = by_theme[t]
                    if len(bucket) < PER_THEME:
                        bucket.append(item)
                    else:
                        j = rng.randrange(seen_count)
                        if j < PER_THEME:
                            bucket[j] = item
            if len(general) < GENERAL:
                general.append(item)
            else:
                j = rng.randrange(seen_count)
                if j < GENERAL:
                    general[j] = item
            if otags and any(k in otags for k in OPENING_KEYS):
                if len(opening) < OPENING_EXTRA:
                    opening.append(item)
                else:
                    j = rng.randrange(seen_count)
                    if j < OPENING_EXTRA:
                        opening[j] = item
    chosen = {}
    for bucket in list(by_theme.values()) + [general, opening]:
        for item in bucket:
            chosen[item[0]] = item
    out = sorted(chosen.values(), key=lambda x: x[3])
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print("%d Aufgaben gespeichert (%d passende in der Datenbank)" % (len(out), seen_count))


if __name__ == "__main__":
    main()
