"""Partie-Auswertung für alle Spieler, die sich in der App mit chess.com-Namen angemeldet haben.

Aufruf (GitHub Action, täglich):  python analysis/update_players.py [--weekly]
- Neue Namen aus der Supabase-Tabelle "players" bekommen eine erste Auswertung (letzte 3 Monate, höchstens 200 Partien,
  höchstens 5 neue Spieler pro Lauf).
- Mit --weekly werden zusätzlich alle bekannten Spieler um neue Partien ergänzt.
- Wer ausgewertet ist, steht in app/data/players.json; nur dann lädt die App persönliche Daten.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS_JSON = os.path.join(ROOT, "app", "data", "players.json")
CONFIG_JS = os.path.join(ROOT, "app", "js", "config.js")
NAME_RE = re.compile(r"[a-z0-9_-]{2,30}")


def supabase_names():
    """Namen aus der Tabelle players (lesbar mit dem öffentlichen Schlüssel aus app/js/config.js)."""
    cfg = open(CONFIG_JS, encoding="utf-8").read()
    url = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1)
    key = re.search(r"SUPABASE_KEY = '([^']+)'", cfg).group(1)
    req = urllib.request.Request(url + "/rest/v1/players?select=name", headers={"apikey": key, "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=30) as res:
        rows = json.load(res)
    return sorted({r["name"].strip().lower() for r in rows if NAME_RE.fullmatch(r.get("name", "").strip().lower())})


def sync(name, extra):
    """sync.py für einen Spieler; → letzte JSON-Zeile oder None bei Fehler."""
    env = dict(os.environ, SCHACH_PLAYER=name)
    res = subprocess.run([sys.executable, os.path.join(ROOT, "analysis", "sync.py"), "--workers", "4", *extra],
                         env=env, capture_output=True, text=True)
    sys.stderr.write(res.stderr[-2000:])
    lines = [l for l in res.stdout.splitlines() if l.startswith("{")]
    try:
        return json.loads(lines[-1]) if res.returncode == 0 and lines else None
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weekly", action="store_true", help="auch bekannte Spieler aktualisieren")
    args = ap.parse_args()

    players = json.load(open(PLAYERS_JSON, encoding="utf-8"))
    try:
        names = supabase_names()
    except Exception as exc:   # Tabelle fehlt oder Netz: bekannte Spieler trotzdem aktualisieren
        print("Spielerliste nicht lesbar: %s" % exc)
        names = []

    fresh = [n for n in names if n not in players][:5]   # höchstens 5 neue pro Lauf, der Rest folgt morgen
    for name in fresh:
        print("Neuer Spieler: %s" % name, flush=True)
        r = sync(name, ["--months", "3", "--max-games", "200"])
        print("  %s" % (r or "fehlgeschlagen (Name bei chess.com unbekannt?)"), flush=True)
        if r and os.path.exists(os.path.join(ROOT, "app", "data", "players", name, "analysis_summary.json")):
            players[name] = {"since": datetime.date.today().isoformat()}

    if args.weekly:
        for name in sorted(players):
            print("Aktualisiere %s" % name, flush=True)
            print("  %s" % (sync(name, []) or "fehlgeschlagen"), flush=True)

    with open(PLAYERS_JSON, "w", encoding="utf-8") as fh:
        json.dump(players, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
