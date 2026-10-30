"""Eröffnungsdaten für die App.

Aufruf:  .venv/bin/python -I analysis/build_openings.py [--check] [--engine] [--sync-repertoire]

  ohne Option        data/raw/openings/*.tsv → app/data/lichess_openings.json
                     (Liste von {eco, name, moves:[SAN], uci:[...], epd}, sortiert nach ECO und Zuglänge)
  --check            prüft app/data/openings_catalog.json: Pflichtfelder, eindeutige IDs, legale Züge,
                     ECO/Name gegen die Lichess-Liste, Fallen legal
  --engine           (mit --check) jede Falle mit Stockfish prüfen: Endet sie mit Matt oder mit
                     klarem Vorteil (≥ 2 Bauern) für die Seite, die den letzten Zug macht?
  --sync-repertoire  setzt inRepertoire im Katalog neu aus app/data/repertoire_white/black.json
                     (nur, wenn mindestens eine der Dateien existiert)
"""
import csv
import glob
import json
import os
import sys

import chess
import chess.engine

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "openings")
DST = os.path.join(ROOT, "app", "data", "lichess_openings.json")
CAT = os.path.join(ROOT, "app", "data", "openings_catalog.json")
REPS = {"w": os.path.join(ROOT, "app", "data", "repertoire_white.json"),
        "b": os.path.join(ROOT, "app", "data", "repertoire_black.json")}
ENGINE = os.path.join(ROOT, "tools", "stockfish", "stockfish-macos-universal")

REQUIRED = ("id", "name", "nameEn", "eco", "family", "level", "moves", "ideas", "white", "black", "trap", "inRepertoire")
TRAP_MIN_CP = 200  # so viel muss die Falle mindestens bringen (aus Sicht des Fallenstellers)


def parse_pgn_moves(pgn):
    """'1. e4 e5 2. Nf3' → ['e4', 'e5', 'Nf3'] (Zugnummern weg)."""
    return [t for t in pgn.split() if not t[0].isdigit()]


def build_lichess():
    out = []
    for path in sorted(glob.glob(os.path.join(SRC, "*.tsv"))):
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f, delimiter="\t"):
                board = chess.Board()
                sans, ucis = [], []
                for san in parse_pgn_moves(row["pgn"]):
                    mv = board.parse_san(san)
                    sans.append(board.san(mv))   # normalisierte SAN, wie chess.js sie erzeugt
                    ucis.append(mv.uci())
                    board.push(mv)
                out.append({"eco": row["eco"], "name": row["name"], "moves": sans, "uci": ucis, "epd": board.epd()})
    out.sort(key=lambda o: (o["eco"], len(o["moves"]), o["name"]))
    # Kompakt: ein Eintrag pro Zeile
    with open(DST, "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(o, ensure_ascii=False, separators=(",", ":")) for o in out) + "\n]\n")
    print("%d Eröffnungen → %s (%d KB)" % (len(out), os.path.relpath(DST, ROOT), os.path.getsize(DST) // 1024))
    return out


def load_lichess():
    if not os.path.exists(DST):
        return build_lichess()
    return json.load(open(DST, encoding="utf-8"))


def deepest_match(moves, lichess_by_moves):
    """Längster Lichess-Eintrag, dessen Züge ein Anfang von `moves` sind."""
    for n in range(len(moves), 0, -1):
        hit = lichess_by_moves.get(tuple(moves[:n]))
        if hit:
            return n, hit
    return 0, None


def play(moves):
    """Spielt SAN-Züge ab, gibt (board, Fehlertext|None) zurück."""
    board = chess.Board()
    for i, san in enumerate(moves):
        try:
            board.push_san(san)
        except ValueError:
            return board, "Zug %d '%s' illegal" % (i, san)
    return board, None


def check_catalog(use_engine):
    cat = json.load(open(CAT, encoding="utf-8"))
    lichess = load_lichess()
    by_moves = {}
    for o in lichess:
        by_moves.setdefault(tuple(o["moves"]), o)
    errors, warnings = [], []
    ids = set()
    engine = None
    if use_engine:
        engine = chess.engine.SimpleEngine.popen_uci(ENGINE)
        engine.configure({"Threads": 2, "Hash": 128})

    for op in cat:
        oid = op.get("id", "?")
        for k in REQUIRED:
            if k not in op:
                errors.append("%s: Feld '%s' fehlt" % (oid, k))
        if oid in ids:
            errors.append("doppelte ID %s" % oid)
        ids.add(oid)
        if op.get("level") not in (1, 2, 3):
            errors.append("%s: level muss 1, 2 oder 3 sein" % oid)
        board, err = play(op["moves"])
        if err:
            errors.append("%s: %s" % (oid, err))
            continue
        exact = by_moves.get(tuple(op["moves"]))
        if exact and (exact["eco"] != op["eco"] or exact["name"] != op["nameEn"]):
            warnings.append("%s: Lichess nennt diese Zugfolge %s %s (Katalog: %s %s)" % (
                oid, exact["eco"], exact["name"], op["eco"], op["nameEn"]))
        if not exact:
            n, hit = deepest_match(op["moves"], by_moves)
            if hit and hit["eco"][0] != op["eco"][0]:
                warnings.append("%s: ECO %s passt nicht zu Lichess-Präfix %s %s" % (oid, op["eco"], hit["eco"], hit["name"]))

        trap = op.get("trap")
        if not trap:
            continue
        tb, err = play(trap["moves"])
        if err:
            errors.append("%s Falle: %s" % (oid, err))
            continue
        if not trap.get("text"):
            errors.append("%s Falle: Text fehlt" % oid)
        if trap["moves"][:len(op["moves"])] != op["moves"][:len(trap["moves"])] and \
                trap["moves"][:2] != op["moves"][:2]:
            warnings.append("%s Falle: beginnt anders als die Eröffnung" % oid)
        if engine:
            winner = not tb.turn  # wer den letzten Zug gemacht hat
            if tb.is_checkmate():
                continue
            info = engine.analyse(tb, chess.engine.Limit(depth=18))
            cp = info["score"].pov(winner).score(mate_score=10000)
            if cp < TRAP_MIN_CP:
                errors.append("%s Falle: Endstellung nur %+d cp für %s (Engine: %s)" % (
                    oid, cp, "Weiß" if winner else "Schwarz", tb.san(info["pv"][0]) if info.get("pv") else "-"))

    if engine:
        engine.quit()
    for w in warnings:
        print("WARNUNG", w)
    for e in errors:
        print("FEHLER", e)
    print("Katalog: %d Einträge, %d mit Falle, %d im Repertoire – %d Fehler, %d Warnungen" % (
        len(cat), sum(1 for o in cat if o.get("trap")), sum(1 for o in cat if o.get("inRepertoire")),
        len(errors), len(warnings)))
    return not errors


def repertoire_choices():
    """{side: {epd: SAN}} – was das Repertoire in jeder eigenen Stellung spielt."""
    choices = {}
    for side, path in REPS.items():
        if not os.path.exists(path):
            continue
        color = chess.WHITE if side == "w" else chess.BLACK
        own = choices.setdefault(side, {})
        for ch in json.load(open(path, encoding="utf-8"))["chapters"]:
            for line in ch["lines"]:
                board = chess.Board()
                for san in line["moves"]:
                    mv = board.parse_san(san)
                    if board.turn == color:
                        own.setdefault(board.epd(), mv)
                    board.push(mv)
    return choices


def in_repertoire(moves, side, own):
    """Passt die Zugfolge zum Repertoire der Seite? Jeder eigene Zug, für den das Repertoire eine
    Wahl kennt, muss genau diese Wahl sein; nach dem ersten unbekannten eigenen Zug ist Schluss.
    Mindestens ein eigener Zug muss übereinstimmen, oder das Repertoire hat eine Antwort auf die
    Endstellung (z. B. „1.b4“ für Schwarz)."""
    color = chess.WHITE if side == "w" else chess.BLACK
    board = chess.Board()
    matched = 0
    for san in moves:
        mv = board.parse_san(san)
        if board.turn == color:
            want = own.get(board.epd())
            if want is None:
                return matched > 0
            if want != mv:
                return False
            matched += 1
        board.push(mv)
    return matched > 0 or (board.turn == color and board.epd() in own)


def sync_repertoire():
    choices = repertoire_choices()
    if not choices:
        print("Keine Repertoire-Dateien gefunden – inRepertoire bleibt unverändert.")
        return
    cat = json.load(open(CAT, encoding="utf-8"))
    changed = []
    for op in cat:
        new = any(in_repertoire(op["moves"], side, own) for side, own in choices.items())
        if new != op["inRepertoire"]:
            changed.append("%s: %s → %s" % (op["id"], op["inRepertoire"], new))
            op["inRepertoire"] = new
    write_catalog(cat)
    for c in changed:
        print("inRepertoire", c)
    print("%d Einträge geändert (Seiten: %s)" % (len(changed), ", ".join(sorted(choices))))


def write_catalog(cat):
    with open(CAT, "w", encoding="utf-8") as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)
        f.write("\n")


def main():
    if "--sync-repertoire" in sys.argv:
        sync_repertoire()
    if "--check" in sys.argv:
        sys.exit(0 if check_catalog("--engine" in sys.argv) else 1)
    if "--sync-repertoire" not in sys.argv:
        build_lichess()


if __name__ == "__main__":
    main()
