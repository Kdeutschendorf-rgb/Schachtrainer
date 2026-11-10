"""Bedenkzeiten pro Zug nachladen (für das Schwächenprofil, analysis/weakness_profile.py).

Aufruf:  .venv/bin/python -I analysis/fetch_clocks.py [--months 0]
  --months N   nur die letzten N Monatsarchive (0 = alle)

Der große PGN-Download von chess.com enthält keine Uhrzeiten, die öffentliche API schon. Dieses Skript holt
die Monatsarchive und schreibt pro Rapid- und Blitzpartie die Uhrstände nach jedem Halbzug nach
data/analysis/clocks.json: {partieSchlüssel: {"tc": "600", "clk": [Zehntelsekunden …]}}.
Nur einmal nötig: Neue Partien kommen über sync.py samt Uhrzeiten nach data/raw/chesscom_sync.pgn.
"""
import argparse
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import sync                      # noqa: E402  (API-Zugriff und Partie-Schlüssel wiederverwenden)
import analyze_games as ag       # noqa: E402

CLK_RE = re.compile(r"\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]")
OUT = os.path.join(ag.OUT, "clocks.json")


def clocks_of(pgn):
    """Uhrstände in Zehntelsekunden, ein Wert pro Halbzug (leer, wenn die Partie keine enthält)."""
    return [int(round((int(h) * 3600 + int(m) * 60 + float(s)) * 10)) for h, m, s in CLK_RE.findall(pgn)]


def main():
    ap = argparse.ArgumentParser(description="Bedenkzeiten pro Zug von chess.com nachladen")
    ap.add_argument("--months", type=int, default=0, help="nur die letzten N Monatsarchive (0 = alle)")
    args = ap.parse_args()
    archives = sync.fetch_json(sync.API).get("archives", [])
    if args.months > 0:
        archives = archives[-args.months:]
    try:
        with open(OUT, encoding="utf-8") as fh:
            out = json.load(fh)
    except (OSError, ValueError):
        out = {}
    added = 0
    for url in archives:
        for g in sync.fetch_json(url).get("games", []):
            if g.get("rules", "chess") != "chess" or not g.get("pgn") or g.get("time_class") not in ("rapid", "blitz"):
                continue
            pgn = g["pgn"]
            clk = clocks_of(pgn)
            if not clk:
                continue
            h = sync.headers_of(pgn)
            key = sync.key_of(h)
            if key not in out:
                added += 1
            out[key] = {"tc": h.get("TimeControl", ""), "clk": clk}
        print("%s: %d Partien mit Uhrzeiten" % (url.rsplit("/", 2)[-2] + "-" + url.rsplit("/", 1)[-1], len(out)), flush=True)
        time.sleep(0.3)
    sync.write_json(OUT, out)
    print("clocks.json: %d Partien (%d neu)" % (len(out), added))


if __name__ == "__main__":
    main()
