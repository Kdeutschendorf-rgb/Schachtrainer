"""Für welchen chess.com-Spieler die Analyse läuft (Umgebungsvariable SCHACH_PLAYER, Standard keanu098).

Keanus Daten liegen wie bisher in data/analysis/ und data/raw/, alle anderen in data/players/<name>/.
Die App-Daten landen immer in app/data/players/<name>/.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = (os.environ.get("SCHACH_PLAYER") or "keanu098").strip().lower()
if not re.fullmatch(r"[a-z0-9_-]{2,30}", NAME):
    raise SystemExit("Ungültiger chess.com-Name: %r" % NAME)

if NAME == "keanu098":
    ANALYSIS = os.path.join(ROOT, "data", "analysis")
    RAW = os.path.join(ROOT, "data", "raw")
else:
    ANALYSIS = os.path.join(ROOT, "data", "players", NAME, "analysis")
    RAW = os.path.join(ROOT, "data", "players", NAME, "raw")
APP = os.path.join(ROOT, "app", "data", "players", NAME)
OPENINGS_TSV = os.path.join(ROOT, "data", "raw", "openings")   # Eröffnungsnamen, für alle gleich
