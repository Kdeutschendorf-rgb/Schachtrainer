"""Schwächenprofil aus den eigenen Rapid-Partien: Muster, die die Fehler-Tags nicht zeigen.

Aufruf:  .venv/bin/python -I analysis/weakness_profile.py [--print]
Wird auch von build_app_data.py aufgerufen (also bei jedem Sync und in der täglichen GitHub Action).
Braucht keine Engine: Grundlage sind die schon analysierten Fehler (data/analysis/mistakes.json, mit bestem Zug
und Widerlegung von Stockfish), alle Züge aus data/raw/*.pgn und die Bedenkzeiten (PGN-Kommentare %clk bzw.
data/analysis/clocks.json aus fetch_clocks.py).

Für jeden eigenen Zug jeder Rapid-Partie entsteht ein Datensatz mit Merkmalen der Stellung (Zentrum, Könige,
Material, ungedeckte Figuren, letzter Gegnerzug), der Bedenkzeit und der Einstufung des Zugs. Daraus:
  1. Stellungstypen: In welchen Stellungen passieren mehr grobe Fehler als sonst? Verglichen wird nur in offenen
     Partien (Material höchstens 2 Punkte auseinander, ab Zug 8): In entschiedenen Stellungen ändert kaum ein Zug die
     Gewinnchance um 15 Punkte, sie würden jede Gruppe mit vielen Endspielen künstlich „sicher“ aussehen lassen.
     Jede Gruppe wird mit dem Rest desselben Merkmals verglichen; gemeldet wird nur, was kein Zufall ist (z ≥ 2,5).
  2. Mechanik: WIE geht das Material verloren? Zielfeld nicht geprüft, Drohung stehen gelassen, Deckung weggezogen,
     Taktik des Gegners übersehen, eigene Chance verpasst.
  3. Bedenkzeit: Wie schnell fallen die Fehlzüge, wie viel Zeit bleibt am Ende ungenutzt?
  4. Übergang: Partien, die nach der Eröffnung gut standen und trotzdem verloren gingen. Wann und wie kippen sie?
Ausgabe: app/data/players/<name>/weakness_profile.json mit `findings` (Sätze mit Zahlen), Tabellen für den Bericht
und `sets`: Übungssätze aus eigenen Stellungen (Kennungen aus my_puzzles.json), die die Taktik und der Tagesplan nutzen.
"""
import argparse
import datetime
import glob
import json
import math
import os
import re
import statistics
import sys

import chess

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import build_app_data as bad    # noqa: E402

CLK_RE = re.compile(r"\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]")
VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
GROSS = ("blunder", "mistake")          # „grobe Fehler“ wie überall in der App
MIN_MOVES = 120                         # so viele Züge braucht eine Gruppe, damit sie zählt
MIN_ERRORS = 8
FAST_S = 5                              # „Schnellschuss“: Zug in unter 5 Sekunden …
CALM_CLOCK_S = 120                      # … obwohl noch mehr als 2 Minuten auf der Uhr waren
SET_MIN = 6                             # ein Übungssatz braucht mindestens so viele Stellungen
SET_MAX = 40


# ---------------------------------------------------------------------------
# Rohdaten

def read_games_full(folder=None):
    """→ {key: {"sans": [...], "clk": [Zehntelsekunden pro Halbzug] | None, "tc": "600"}} aus data/raw/*.pgn."""
    out = {}
    for path in sorted(glob.glob(os.path.join(folder or bad.RAW, "*.pgn"))):
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        for block in re.split(r"\n(?=\[Event )", text):
            headers = dict(bad.HEADER_RE.findall(block))
            if not headers:
                continue
            white = headers.get("White", "")
            opp = headers.get("Black", "") if white.lower() == bad.ME else white
            body = bad.HEADER_RE.sub("", block)
            clk = [int(round((int(h) * 3600 + int(m) * 60 + float(s)) * 10)) for h, m, s in CLK_RE.findall(body)]
            out[bad.game_key(headers.get("Date"), headers.get("EndTime"), opp)] = {
                "sans": bad.san_tokens(body, limit=10 ** 6), "clk": clk or None, "tc": headers.get("TimeControl", ""),
            }
    return out


def base_seconds(tc):
    """Grundzeit und Aufschlag aus dem TimeControl-Header ('600', '600+5') → (Sekunden, Aufschlag) oder None."""
    m = re.fullmatch(r"(\d+)(?:\+(\d+))?", tc or "")
    return (int(m.group(1)), int(m.group(2) or 0)) if m else None


# ---------------------------------------------------------------------------
# Merkmale einer Stellung (vor dem eigenen Zug)

def centre_type(board):
    """offen | halboffen | geschlossen, nach den Bauern auf den Mittellinien."""
    wp, bp = board.pieces(chess.PAWN, chess.WHITE), board.pieces(chess.PAWN, chess.BLACK)
    rammed = 0          # Bauernpaare, die sich auf den Linien c–f gegenseitig blockieren
    for sq in wp:
        if 2 <= chess.square_file(sq) <= 5 and sq + 8 in bp:
            rammed += 1
    central = sum(1 for sq in list(wp) + list(bp) if chess.square_file(sq) in (3, 4))
    if rammed >= 2 and central >= 3:
        return "geschlossen"
    if central <= 2 and not any(chess.square_file(sq) in (3, 4) and sq + 8 in bp for sq in wp):
        return "offen"
    return "halboffen"


def loose_pieces(board, color):
    """Eigene Figuren (ohne Bauern und König), die niemand deckt."""
    return [sq for sq, p in board.piece_map().items()
            if p.color == color and p.piece_type not in (chess.PAWN, chess.KING) and not board.attackers(color, sq)]


def cheapest(board, color, square):
    vals = [VAL[board.piece_type_at(s)] for s in board.attackers(color, square)]
    return min(vals) if vals else None


def hanging(board, color):
    """Eigene Steine, die der Gegner mit Gewinn schlagen kann: ungedeckt angegriffen oder von Billigerem angegriffen."""
    out = []
    for sq, p in board.piece_map().items():
        if p.color != color or p.piece_type == chess.KING:
            continue
        att = cheapest(board, not color, sq)
        if att is None:
            continue
        if not board.attackers(color, sq) or att < VAL[p.piece_type]:
            if p.piece_type != chess.PAWN or not board.attackers(color, sq):
                out.append(sq)
    return out


def king_zone(board, color):
    k = board.king(color)
    f = chess.square_file(k)
    home = 0 if color == chess.WHITE else 7
    if chess.square_rank(k) != home:
        return "unterwegs"
    return "kurz" if f >= 6 else "lang" if f <= 2 else "mitte"


def shield(board, color):
    """Bauern direkt vor dem rochierten König (höchstens zwei Reihen entfernt), 0–3."""
    k = board.king(color)
    f, r = chess.square_file(k), chess.square_rank(k)
    step = 1 if color == chess.WHITE else -1
    n = 0
    for df in (-1, 0, 1):
        ff = f + df
        if not 0 <= ff <= 7:
            continue
        for dr in (1, 2):
            rr = r + dr * step
            if 0 <= rr <= 7 and board.piece_at(chess.square(ff, rr)) == chess.Piece(chess.PAWN, color):
                n += 1
                break
    return n


def material(board, color):
    return sum(VAL[p.piece_type] * (1 if p.color == color else -1) for p in board.piece_map().values())


def features(board, me, last):
    """Merkmale der Stellung, in der ich am Zug bin. last = letzter Gegnerzug (oder None)."""
    opp = not me
    f = {}
    f["zentrum"] = centre_type(board)
    queens = bool(board.pieces(chess.QUEEN, me)) + bool(board.pieces(chess.QUEEN, opp))
    f["damen"] = "beide Damen" if queens == 2 else "ohne Damen" if queens == 0 else "eine Dame"
    mk, ok = king_zone(board, me), king_zone(board, opp)
    moved = board.fullmove_number
    if moved >= 10 and queens == 2:
        f["koenig"] = "rochiert" if mk in ("kurz", "lang") else "König in der Mitte"
        f["rochaden"] = "entgegengesetzt" if {mk, ok} == {"kurz", "lang"} else "gleiche Seite oder unrochiert"
    if mk in ("kurz", "lang") and queens == 2:
        f["schutz"] = "Königsschutz gelockert" if shield(board, me) <= 1 else "Königsschutz intakt"
    loose = len(loose_pieces(board, me))
    f["ungedeckt"] = "2+ ungedeckte Figuren" if loose >= 2 else "höchstens 1 ungedeckte Figur"
    f["haengt"] = "etwas hängt schon" if hanging(board, me) else "nichts hängt"
    pawn_caps = sum(1 for m in board.legal_moves if board.is_capture(m) and board.piece_type_at(m.from_square) == chess.PAWN
                    and board.piece_type_at(m.to_square) == chess.PAWN)
    f["spannung"] = "Bauernspannung" if pawn_caps else "keine Bauernspannung"
    if last is None:
        f["gegnerzug"] = "ruhig"
    else:
        lm, was_capture = last
        f["gegnerzug"] = "Schach" if board.is_check() else "hat geschlagen" if was_capture else "ruhig"
    return f


def move_type(board, mv):
    """Art des eigenen Zugs."""
    p = board.piece_type_at(mv.from_square)
    if board.is_castling(mv):
        return "Rochade"
    if board.is_capture(mv):
        victim = board.piece_type_at(mv.to_square) or chess.PAWN
        if p == chess.QUEEN and victim == chess.PAWN:
            return "Dame schlägt Bauer"
        return "Schlagzug"
    if board.gives_check(mv):
        return "Schach"
    if p == chess.PAWN:
        return "Bauernzug"
    if p == chess.KING:
        return "Königszug"
    back = chess.square_rank(mv.to_square) - chess.square_rank(mv.from_square)
    if (back < 0) == (board.turn == chess.WHITE) and back != 0:
        return "Rückzug"
    return "Figurenzug"


# ---------------------------------------------------------------------------
# Mechanik eines groben Fehlers: Wie geht es schief?

MECH_DE = {
    "zielfeld": "Figur auf ein Feld gestellt, auf dem sie geschlagen wird",
    "schlagfehler": "Geschlagen, obwohl das nicht ging (gedeckt oder Zwischenzug)",
    "drohung": "Drohung stehen gelassen: Die Figur hing schon vor deinem Zug",
    "deckung": "Deckung aufgegeben: Dein Zug hat eine andere Figur schutzlos gemacht",
    "taktik": "Taktik des Gegners übersehen: Schach, Gabel, Abtauschfolge",
    "chance": "Eigene Chance verpasst: Du konntest etwas gewinnen",
    "sonst": "Kein Materialverlust: Stellung verschlechtert",
}


def strip_numbers(line):
    return [t for t in re.sub(r"\d+\.(\.\.)?", " ", line or "").split() if t]


def mechanism(board, mv, m):
    """board: Stellung vor dem Fehlzug, mv: der Fehlzug, m: Eintrag aus mistakes.json."""
    tags = set(m.get("tags") or [])
    loses = tags & {"materialverlust", "figur_eingestellt", "matt_zugelassen"}
    if not loses and tags & {"chance_verpasst", "matt_verpasst"}:
        return "chance"
    after = board.copy()
    after.push(mv)
    reply = None
    toks = strip_numbers(m.get("refutation"))
    if toks:
        try:
            reply = after.parse_san(toks[0])
        except ValueError:
            reply = None
    if reply is None:
        return "chance" if tags & {"chance_verpasst", "matt_verpasst"} else "sonst"
    me = board.turn
    if after.is_capture(reply) and not after.is_en_passant(reply):
        target = reply.to_square
        victim = VAL[after.piece_type_at(target)]
        attacker = VAL[after.piece_type_at(reply.from_square)]
        gain = not after.attackers(me, target) or attacker < victim        # schlägt mit Gewinn
        if target == mv.to_square:
            if board.is_capture(mv):
                # Ich habe geschlagen und werde zurückgeschlagen: Fehler, wenn meine Figur mehr wert war als die Beute
                if VAL[board.piece_type_at(mv.from_square)] > VAL[board.piece_type_at(mv.to_square) or chess.PAWN]:
                    return "schlagfehler"
            elif gain:
                return "zielfeld"
        else:
            # Eine andere Figur fällt: Hing sie schon vor meinem Zug, oder hat mein Zug sie schutzlos gemacht?
            defenders = board.attackers(me, target)
            hung_before = reply.from_square in board.attackers(not me, target) and (not defenders or attacker < victim)
            if hung_before and mv.from_square not in defenders:
                return "drohung"
            if gain:
                return "deckung"
    if after.gives_check(reply) or loses or tags & {"gabel", "schach"}:
        return "taktik"
    if tags & {"chance_verpasst", "matt_verpasst"}:
        return "chance"
    return "sonst"


# ---------------------------------------------------------------------------
# Datensätze: ein Eintrag pro eigenem Zug

def build_records(games, mistakes, raw, clocks, tcs=("rapid",)):
    by_ply = {(m["game"], m["ply"]): m for m in mistakes}
    records, used = [], []
    for g in games:
        if g.get("tc") not in tcs:
            continue
        key = bad.game_key(g.get("date"), g.get("end"), g.get("opponent"))
        src = raw.get(key)
        if not src or not src["sans"]:
            continue
        clk = src["clk"] or (clocks.get(key) or {}).get("clk")
        tc = base_seconds(src["tc"] if src["clk"] else (clocks.get(key) or {}).get("tc") or src["tc"])
        if clk and (not tc or len(clk) < len(src["sans"]) - 1):
            clk = None
        me = chess.WHITE if g["color"] == "w" else chess.BLACK
        board = chess.Board()
        last = None
        n_own = 0
        for ply, san in enumerate(src["sans"]):
            try:
                mv = board.parse_san(san)
            except ValueError:
                break
            if board.turn == me:
                rec = {"game": g["game"], "ply": ply, "move": ply // 2 + 1, "fen": board.fen(), "san": san}
                rec["f"] = features(board, me, last)
                rec["f"]["zugart"] = move_type(board, mv)
                rec["mat"] = material(board, me)
                m = by_ply.get((g["game"], ply))
                rec["cls"] = m["cls"] if m else None
                rec["drop"] = m["drop"] if m else 0
                rec["win"] = m["winBefore"] if m else None
                rec["tags"] = (m.get("tags") or []) if m else []
                rec["mech"] = mechanism(board, mv, m) if m and m["cls"] in GROSS else None
                if clk and ply < len(clk):
                    prev = clk[ply - 2] if ply >= 2 else tc[0] * 10
                    rec["spent"] = max(0.0, (prev - clk[ply]) / 10 + tc[1])
                    rec["clock"] = prev / 10
                    rec["oppClock"] = (clk[ply - 1] if ply >= 1 else tc[0] * 10) / 10
                records.append(rec)
                n_own += 1
            last = (mv, board.is_capture(mv))
            board.push(mv)
        used.append({"g": g, "key": key, "own": n_own, "clk": clk, "tc": tc, "plies": len(src["sans"])})
    return records, used


# ---------------------------------------------------------------------------
# Auswertung

def rate(recs):
    n = len(recs)
    k = sum(1 for r in recs if r["cls"] in GROSS)
    return n, k, (100.0 * k / n if n else 0.0)


def z_score(n, k, p0):
    sd = math.sqrt(n * p0 * (1 - p0))
    return (k - n * p0) / sd if sd else 0.0


def bucket_table(records, feature):
    """Fehler pro 100 Züge je Ausprägung, verglichen mit dem Rest desselben Merkmals (Zwei-Stichproben-z-Test)."""
    groups = {}
    for r in records:
        v = r["f"].get(feature)
        if v is not None:
            groups.setdefault(v, []).append(r)
    total_n = sum(len(v) for v in groups.values())
    total_k = sum(rate(v)[1] for v in groups.values())
    rows = []
    for v, recs in groups.items():
        n, k, per100 = rate(recs)
        rn, rk = total_n - n, total_k - k
        rest = 100.0 * rk / rn if rn else 0.0
        p = total_k / total_n if total_n else 0
        sd = math.sqrt(p * (1 - p) * (1.0 / n + 1.0 / rn)) if n and rn and 0 < p < 1 else 0
        z = ((k / n) - (rk / rn)) / sd if sd else 0.0
        rows.append({"feature": feature, "value": v, "moves": n, "errors": k, "per100": round(per100, 1),
                     "rest": round(rest, 1), "lift": round(per100 / rest, 2) if rest else 0, "z": round(z, 1),
                     "extra": round(k - n * rk / rn, 1) if rn else 0})
    return sorted(rows, key=lambda r: -r["per100"])


FEATURE_DE = {
    "zentrum": "Zentrum", "damen": "Damen", "koenig": "Dein König", "rochaden": "Rochaden", "schutz": "Königsschutz",
    "ungedeckt": "Ungedeckte Figuren", "haengt": "Vor deinem Zug", "spannung": "Bauern",
    "gegnerzug": "Letzter Gegnerzug", "zugart": "Dein Zug",
}
# Was in welcher Stellung hilft (erscheint als Merksatz beim Üben)
RULES = {
    ("zentrum", "offen"): "Offenes Zentrum: Linien und Diagonalen sind frei. Vor jedem Zug alle Schachs und Schlagzüge des Gegners durchgehen.",
    ("zentrum", "geschlossen"): "Geschlossenes Zentrum: Es eilt nicht. Erst den Plan (Bauernhebel, Figurenumgruppierung), dann der Zug.",
    ("damen", "ohne Damen"): "Ohne Damen entscheidet Technik: König aktivieren, Bauern zählen, keine Figur ungedeckt lassen.",
    ("koenig", "König in der Mitte"): "König in der Mitte und die Damen sind noch da: zuerst rochieren oder die Mitte geschlossen halten.",
    ("rochaden", "entgegengesetzt"): "Entgegengesetzte Rochaden: Tempo zählt, aber jeder Bauernzug vor dem eigenen König braucht einen Grund.",
    ("schutz", "Königsschutz gelockert"): "Gelockerter Königsschutz: Bei jedem Gegnerzug prüfen, ob eine Figur Richtung König kommt.",
    ("damen", "beide Damen"): "Solange die Damen auf dem Brett sind, ist jede ungedeckte Figur und jeder offene König ein Ziel. Erst sichern, dann angreifen.",
    ("zentrum", "halboffen"): "Halboffenes Zentrum: Die offene Linie gehört den Türmen. Wer sie zuerst besetzt, bestimmt das Spiel.",
    ("ungedeckt", "2+ ungedeckte Figuren"): "Ungedeckte Figuren fallen irgendwann: Zähl vor dem Zug, was niemand deckt, und deck oder zieh es weg.",
    ("haengt", "etwas hängt schon"): "Etwas hängt bereits: zuerst diese Drohung lösen, dann erst der eigene Plan.",
    ("spannung", "Bauernspannung"): "Bauernspannung: Rechne beide Schlagreihenfolgen durch, bevor du die Spannung auflöst oder stehen lässt.",
    ("gegnerzug", "hat geschlagen"): "Nach einem Schlagzug des Gegners: nicht automatisch zurückschlagen. Gibt es einen Zwischenzug, womit schlage ich am besten?",
    ("gegnerzug", "Schach"): "Im Schach: alle drei Wege prüfen (schlagen, dazwischenziehen, wegziehen), nicht den ersten nehmen.",
    ("zugart", "Dame schlägt Bauer"): "Bauernraub mit der Dame: Kommt sie danach wieder heraus, und was greift der Gegner währenddessen an?",
    ("zugart", "Schlagzug"): "Vor dem Schlagen: Wer schlägt zurück, und was steht danach ungedeckt?",
    ("zugart", "Königszug"): "Königszüge im Mittelspiel: Steht der König danach in einer Fessel, einem Abzug oder auf einer offenen Linie?",
    ("zugart", "Bauernzug"): "Bauernzüge gehen nicht zurück: Welches Feld und welche Figur verliert dadurch ihren Schutz?",
    ("zugart", "Rückzug"): "Beim Rückzug: Deckt die Figur danach noch, was sie vorher gedeckt hat?",
    ("zugart", "Figurenzug"): "Vor jedem Figurenzug: Ist das Zielfeld angegriffen, und was deckte die Figur bisher?",
    ("zugart", "Schach"): "Ein Schach ist nur gut, wenn danach etwas folgt. Wohin geht der König, und steht deine Figur dann noch sicher?",
}
# Kurze Namen für Befunde und Übungssätze zu einem Stellungstyp
TYPE_TITLE = {
    ("zentrum", "offen"): "Offenes Zentrum", ("zentrum", "geschlossen"): "Geschlossenes Zentrum", ("zentrum", "halboffen"): "Halboffenes Zentrum",
    ("damen", "beide Damen"): "Mit Damen auf dem Brett", ("damen", "ohne Damen"): "Ohne Damen",
    ("koenig", "König in der Mitte"): "König in der Mitte", ("rochaden", "entgegengesetzt"): "Entgegengesetzte Rochaden",
    ("schutz", "Königsschutz gelockert"): "Gelockerter Königsschutz", ("ungedeckt", "2+ ungedeckte Figuren"): "Ungedeckte Figuren",
    ("haengt", "etwas hängt schon"): "Etwas hängt schon", ("spannung", "Bauernspannung"): "Bauernspannung",
    ("gegnerzug", "hat geschlagen"): "Nach einem Schlagzug des Gegners", ("gegnerzug", "Schach"): "Im Schach",
    ("zugart", "Figurenzug"): "Ruhige Figurenzüge", ("zugart", "Rückzug"): "Rückzüge", ("zugart", "Schlagzug"): "Schlagzüge",
    ("zugart", "Dame schlägt Bauer"): "Bauernraub mit der Dame", ("zugart", "Bauernzug"): "Bauernzüge", ("zugart", "Königszug"): "Königszüge",
}
MECH_RULE = {
    "zielfeld": "Zielfeld-Check: Bevor du loslässt, zähl Angreifer und Verteidiger auf dem Feld, auf das du ziehst.",
    "schlagfehler": "Vor dem Schlagen die ganze Abtauschfolge zählen: Wer schlägt zuletzt, gibt es einen Zwischenzug?",
    "drohung": "Zuerst die Frage: Was droht der letzte Gegnerzug? Erst wenn nichts hängt, kommt dein Plan.",
    "deckung": "Jede Figur hat eine Aufgabe. Vor dem Wegziehen: Was hat sie gedeckt oder verstellt?",
    "taktik": "Schach, Schlagen, Drohen: alle erzwingenden Züge des Gegners nach deinem Zug durchgehen.",
    "chance": "Nach jedem Gegnerzug kurz innehalten: Was hat sich geändert, was kann ich jetzt gewinnen?",
}


def median(xs):
    return statistics.median(xs) if xs else None


def pctl(xs, q):
    if not xs:
        return None
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def time_block(records, used):
    timed = [r for r in records if "spent" in r and r["move"] > 5]     # die ersten Züge sind Routine
    if len(timed) < 300:
        return None
    errs = [r for r in timed if r["cls"] in GROSS]
    ok = [r for r in timed if r["cls"] is None]
    p0 = len(errs) / len(timed)
    edges = [(0, 3, "unter 3 s"), (3, 5, "3–5 s"), (5, 10, "5–10 s"), (10, 20, "10–20 s"), (20, 40, "20–40 s"), (40, 1e9, "über 40 s")]
    buckets = []
    for lo, hi, label in edges:
        recs = [r for r in timed if lo <= r["spent"] < hi]
        n, k, per100 = rate(recs)
        buckets.append({"label": label, "moves": n, "errors": k, "per100": round(per100, 1), "share": round(100.0 * n / len(timed), 1)})
    fast_calm = [r for r in errs if r["spent"] < FAST_S and r["clock"] > CALM_CLOCK_S]
    low_clock = [r for r in errs if r["clock"] <= 60]
    # Kritische Momente: Der Gegner hat gerade geschlagen oder Schach gegeben, oder es hängt schon etwas
    critical = [r for r in timed if r["f"]["gegnerzug"] != "ruhig" or r["f"]["haengt"] == "etwas hängt schon"]
    quiet = [r for r in timed if r not in critical] if len(timed) < 20000 else []
    crit_ids = {id(r) for r in critical}
    quiet = [r for r in timed if id(r) not in crit_ids]
    # Wie viel Zeit bleibt am Ende? Nur Partien mit Uhr
    left_loss, left_win, quick_losses = [], [], 0
    losses = 0
    for u in used:
        if not u["clk"] or u["own"] < 10:
            continue
        g = u["g"]
        mine = [u["clk"][i] for i in range(0 if g["color"] == "w" else 1, len(u["clk"]), 2)]
        if not mine:
            continue
        left = mine[-1] / 10
        if g["result"] == "L":
            losses += 1
            left_loss.append(left)
            if left >= u["tc"][0] * 0.5:
                quick_losses += 1
        elif g["result"] == "W":
            left_win.append(left)
    # Nach einem eigenen groben Fehler: Wie schnell kommt der nächste Zug, und wie oft ist er wieder einer?
    by_game = {}
    for r in timed:
        by_game.setdefault(r["game"], []).append(r)
    after_err, after_err_bad = [], 0
    for recs in by_game.values():
        recs.sort(key=lambda r: r["ply"])
        for a, b in zip(recs, recs[1:]):
            if a["cls"] in GROSS and b["ply"] == a["ply"] + 2:
                after_err.append(b["spent"])
                after_err_bad += b["cls"] in GROSS
    return {
        "moves": len(timed), "errors": len(errs), "per100": round(100 * p0, 1),
        "medianAll": round(median([r["spent"] for r in timed]), 1),
        "medianOk": round(median([r["spent"] for r in ok]), 1),
        "medianError": round(median([r["spent"] for r in errs]), 1),
        "medianBlunder": round(median([r["spent"] for r in errs if r["cls"] == "blunder"]) or 0, 1),
        "buckets": buckets,
        "fastCalm": len(fast_calm), "fastCalmShare": round(100.0 * len(fast_calm) / len(errs), 1) if errs else 0,
        "under10Share": round(100.0 * sum(1 for r in errs if r["spent"] < 10) / len(errs), 1) if errs else 0,
        "lowClock": len(low_clock), "lowClockShare": round(100.0 * len(low_clock) / len(errs), 1) if errs else 0,
        "medianCritical": round(median([r["spent"] for r in critical]) or 0, 1),
        "medianQuiet": round(median([r["spent"] for r in quiet]) or 0, 1),
        "criticalPer100": round(rate(critical)[2], 1), "quietPer100": round(rate(quiet)[2], 1),
        "criticalFastShare": round(100.0 * sum(1 for r in critical if r["spent"] < FAST_S) / len(critical), 1) if critical else 0,
        "leftLossMedian": round(median(left_loss) or 0), "leftWinMedian": round(median(left_win) or 0),
        "losses": losses, "lossesHalfClock": quick_losses,
        "afterError": {"n": len(after_err), "median": round(median(after_err) or 0, 1),
                       "again": round(100.0 * after_err_bad / len(after_err), 1) if after_err else 0},
    }


def transition_block(records, used):
    """Partien, die nach der Eröffnung gut standen (Gewinnchance ≥ 60 % nach Zug 10) und trotzdem verloren gingen."""
    by_game = {}
    for r in records:
        by_game.setdefault(r["game"], []).append(r)
    good = [u for u in used if (u["g"].get("winAt10") or 0) >= 60]
    if len(good) < 15:
        return None
    lost = [u for u in good if u["g"]["result"] == "L"]
    fam = {}
    for u in good:
        f = fam.setdefault(bad.family_of(u["g"]), {"good": 0, "lost": 0})
        f["good"] += 1
        f["lost"] += u["g"]["result"] == "L"
    first, mech, spent, phase_moves = [], {}, [], {"11–15": 0, "16–20": 0, "21–30": 0, "ab 31": 0, "bis 10": 0}
    turning = []
    for u in lost:
        errs = [r for r in by_game.get(u["g"]["game"], []) if r["cls"] in GROSS and (r["win"] or 0) >= 45]
        if not errs:
            continue
        # Der Zug, mit dem die Partie kippt: der erste grobe Fehler aus ordentlicher Stellung
        t = sorted(errs, key=lambda r: r["ply"])[0]
        turning.append(t)
        first.append(t["move"])
        mech[t["mech"]] = mech.get(t["mech"], 0) + 1
        if "spent" in t:
            spent.append(t["spent"])
        mv = t["move"]
        phase_moves["bis 10" if mv <= 10 else "11–15" if mv <= 15 else "16–20" if mv <= 20 else "21–30" if mv <= 30 else "ab 31"] += 1
    return {
        "good": len(good), "lost": len(lost), "lostShare": round(100.0 * len(lost) / len(good), 1),
        "scoreGood": round(100.0 * sum(bad.score_of(u["g"]) for u in good) / len(good), 1),
        "families": sorted(({"family": bad.FAMILY_DE.get(k, k), "good": v["good"], "lost": v["lost"],
                             "lostShare": round(100.0 * v["lost"] / v["good"], 1)} for k, v in fam.items() if v["good"] >= 8),
                           key=lambda x: -x["lostShare"])[:6],
        "turnMedian": median(first), "turnWindow": phase_moves,
        "mech": sorted(({"mech": k, "label": MECH_DE.get(k, k), "n": v} for k, v in mech.items()), key=lambda x: -x["n"]),
        "turnSpentMedian": round(median(spent), 1) if spent else None,
        "turnFastShare": round(100.0 * sum(1 for s in spent if s < FAST_S) / len(spent), 1) if spent else None,
        "_turning": turning,
    }


def de(x, digits=1):
    return ("%.*f" % (digits, x)).replace(".", ",")


def conversion_table(used):
    """Gewinnchance nach Zug 10 gegen das tatsächliche Ergebnis: Was ist ein Eröffnungsvorteil bei dir wert?"""
    rows = []
    for lo, hi, label in ((0, 25, "klar schlechter (unter 25 %)"), (25, 40, "schlechter (25–40 %)"), (40, 60, "ausgeglichen (40–60 %)"),
                          (60, 75, "besser (60–75 %)"), (75, 101, "klar besser (ab 75 %)")):
        gs = [u["g"] for u in used if u["g"].get("winAt10") is not None and lo <= u["g"]["winAt10"] < hi]
        if len(gs) < 8:
            continue
        w15 = [g["winAt15"] for g in gs if g.get("winAt15") is not None]
        rows.append({"label": label, "games": len(gs), "win10": round(statistics.mean(g["winAt10"] for g in gs)),
                     "win15": round(statistics.mean(w15)) if w15 else None,
                     "score": round(100.0 * statistics.mean(bad.score_of(g) for g in gs), 1)})
    return rows


def build_profile(games, mistakes, puzzles, raw=None, clocks=None, today=None):
    raw = raw if raw is not None else read_games_full()
    clocks = clocks if clocks is not None else bad.load_json(os.path.join(bad.ANALYSIS, "clocks.json"), {})
    records, used = build_records(games, mistakes, raw, clocks)
    if len(records) < 600:
        return None                      # zu wenige Rapid-Partien für belastbare Aussagen
    n, k, per100 = rate(records)
    errs = [r for r in records if r["cls"] in GROSS]

    # 1. Stellungstypen: nur offene Partien (siehe Kopfkommentar)
    live = [r for r in records if r["move"] >= 8 and abs(r["mat"]) <= 2]
    live_n, live_k, live_per100 = rate(live)
    structure = []
    for feat in FEATURE_DE:
        structure += bucket_table(live, feat)
    sized = [r for r in structure if r["moves"] >= MIN_MOVES]
    notable = sorted([r for r in sized if r["errors"] >= MIN_ERRORS and r["z"] >= 2.5 and r["lift"] >= 1.25], key=lambda r: -r["extra"])
    strong = sorted([r for r in sized if r["z"] <= -2.5 and r["lift"] <= 0.8], key=lambda r: r["lift"])

    # 2. Mechanik
    mech = {}
    for r in errs:
        mech.setdefault(r["mech"], []).append(r)
    mech_rows = []
    for key, recs in mech.items():
        sp = [r["spent"] for r in recs if "spent" in r]
        mech_rows.append({"mech": key, "label": MECH_DE[key], "n": len(recs), "share": round(100.0 * len(recs) / len(errs), 1),
                          "blunders": sum(1 for r in recs if r["cls"] == "blunder"),
                          "medianSpent": round(median(sp), 1) if sp else None,
                          "fastShare": round(100.0 * sum(1 for s in sp if s < FAST_S) / len(sp), 1) if sp else None})
    mech_rows.sort(key=lambda r: -r["n"])

    # 3. Zeit, 4. Übergang, 5. Gewinnstellungen
    time = time_block(records, used)
    trans = transition_block(records, used)
    turning = trans.pop("_turning") if trans else []
    conversion = conversion_table(used)
    by_game = {}
    for r in errs:
        by_game.setdefault(r["game"], []).append(r)
    losses = [u["g"] for u in used if u["g"]["result"] == "L"]
    thrown = [g for g in losses if any((r["win"] or 0) >= 85 for r in by_game.get(g["game"], []))]
    from_winning = [r for r in errs if (r["win"] or 0) >= 85]
    winning = {"losses": len(losses), "thrown": len(thrown), "errors": len(from_winning),
               "blunders": sum(1 for r in from_winning if r["cls"] == "blunder"),
               "medianSpent": round(median([r["spent"] for r in from_winning if "spent" in r]) or 0, 1)}

    # ----- Übungssätze: Stellungen aus my_puzzles.json (klarer bester Zug, von der Engine geprüft) -----
    rec_at = {(r["game"], r["ply"]): r for r in records}
    turning_ids = {(r["game"], r["ply"]) for r in turning}
    pool = []
    for p in puzzles:
        m = re.fullmatch(r"g(\d+)_(\d+)", str(p.get("id", "")))
        r = rec_at.get((int(m.group(1)), int(m.group(2)))) if m else None
        if r and p.get("cls") in GROSS:
            pool.append((p, r))
    pool.sort(key=lambda x: x[0].get("date") or "", reverse=True)        # neueste zuerst
    sets = []

    def add_set(sid, title, rule, why, pick):
        ids = [p["id"] for p, r in pool if pick(p, r)][:SET_MAX]
        if len(ids) < SET_MIN:
            return None
        sets.append({"id": sid, "title": title, "rule": rule, "why": why, "puzzles": ids, "n": len(ids)})
        return sid

    findings = []

    def finding(area, title, text, weight, set_id=None, rule=None):
        findings.append({"area": area, "title": title, "text": text, "weight": round(weight, 1), "set": set_id, "rule": rule or ""})

    # Zeit
    if time:
        t = time
        if t["medianAll"] <= 8 and t["losses"] >= 10 and t["lossesHalfClock"] / t["losses"] >= 0.3:
            rule = "Die Uhr ist dein Werkzeug: Bei jedem Zug, der schlägt, Schach gibt oder eine Figur angreift, mindestens 10 Sekunden rechnen."
            sid = add_set("schnellschuss", "Zu schnell gezogen", "Diese Stellungen hast du in der Partie in unter %d Sekunden verpatzt. Jetzt mit Zeit: Schach, Schlagen, Drohung prüfen, dann erst ziehen." % FAST_S,
                          "%d grobe Fehler in unter %d Sekunden, obwohl noch über %d Minuten auf der Uhr waren." % (t["fastCalm"], FAST_S, CALM_CLOCK_S // 60),
                          lambda p, r: r.get("spent", 99) < FAST_S and r.get("clock", 0) > CALM_CLOCK_S)
            finding("zeit", "Rapid im Blitztempo",
                    "Du brauchst im Mittel %s Sekunden pro Zug (ab Zug 6), die Hälfte deiner Züge fällt in unter 5 Sekunden. "
                    "In %d von %d verlorenen Rapid-Partien hattest du am Ende noch mehr als die halbe Bedenkzeit übrig, im Mittel %d:%02d von %d:00 Minuten. "
                    "Bei %s %% deiner groben Fehler hast du weniger als 10 Sekunden überlegt, nur %s %% passieren mit unter einer Minute auf der Uhr."
                    % (de(t["medianAll"]), t["lossesHalfClock"], t["losses"], t["leftLossMedian"] // 60, t["leftLossMedian"] % 60,
                       round((used[0]["tc"] or (600, 0))[0] / 60) if used else 10, de(t["under10Share"]), de(t["lowClockShare"])),
                    t["lossesHalfClock"] * 2.0, sid, rule)
        a = t["afterError"]
        if a["n"] >= 30 and a["again"] >= t["per100"] * 1.5:
            finding("zeit", "Fehler kommen im Doppelpack",
                    "Direkt nach einem groben Fehler ist dein nächster Zug in %s %% der Fälle wieder einer (sonst %s %%). Du ziehst dann schon nach %s Sekunden weiter."
                    % (de(a["again"]), de(t["per100"]), de(a["median"])),
                    a["n"] * (a["again"] - t["per100"]) / 100, None,
                    "Nach einem Fehler: Hände weg, einmal durchatmen und die Stellung neu ansehen, als hätte die Partie gerade begonnen.")

    # Gewinnstellungen
    if winning["losses"] >= 10 and winning["thrown"] / winning["losses"] >= 0.2:
        sid = add_set("vorteil", "Gewinnstellung festhalten",
                      "Du stehst auf Gewinn. Such nicht den schönsten Zug, sondern den sichersten: Was droht der Gegner, was kann ich abtauschen?",
                      "%d grobe Fehler aus Stellungen mit über 85 %% Gewinnchance." % winning["errors"],
                      lambda p, r: (p.get("winBest") or 0) >= 85)
        finding("vorteil", "Gewinnstellungen verschenkt",
                "In %d von %d verlorenen Rapid-Partien standest du zwischendurch klar auf Gewinn (über 85 %%). Insgesamt %d grobe Fehler aus solchen Stellungen, "
                "gespielt nach %s Sekunden (Median)." % (winning["thrown"], winning["losses"], winning["errors"], de(winning["medianSpent"])),
                winning["thrown"] * 1.5, sid,
                "Mit Vorteil: vereinfachen statt zaubern. Vor jedem Zug die eine Frage: Welche Drohung hat der Gegner noch?")

    # Mechanik
    titles = {"zielfeld": "Zielfeld prüfen", "schlagfehler": "Richtig schlagen", "drohung": "Drohung zuerst",
              "deckung": "Was deckt die Figur?", "taktik": "Schach, Schlagen, Drohen", "chance": "Chancen nutzen"}
    for row in mech_rows:
        key = row["mech"]
        if key == "sonst" or row["n"] < MIN_ERRORS or row["share"] < 6:
            continue
        sid = add_set(key, titles[key], MECH_RULE[key], "%d grobe Fehler dieser Art in deinen Rapid-Partien." % row["n"],
                      lambda p, r, key=key: r["mech"] == key)
        extra = (" Bedenkzeit dabei: %s Sekunden (Median)." % de(row["medianSpent"])) if row["medianSpent"] is not None else ""
        finding("mechanik", row["label"].split(":")[0],
                "%s. Das passiert %d-mal, also bei %s %% deiner groben Fehler.%s" % (row["label"], row["n"], de(row["share"]), extra),
                row["n"] * 0.5, sid, MECH_RULE[key])

    # Stellungstypen
    for row in notable[:4]:
        key = (row["feature"], row["value"])
        title = TYPE_TITLE.get(key) or "%s: %s" % (FEATURE_DE[row["feature"]], row["value"])
        sid = add_set("typ_" + row["feature"], title, RULES.get(key, ""),
                      "%s grobe Fehler pro 100 Züge, sonst %s." % (de(row["per100"]), de(row["rest"])),
                      lambda p, r, key=key: r["f"].get(key[0]) == key[1] and r["move"] >= 8)
        finding("stellung", title,
                "%s grobe Fehler pro 100 Züge (%d in %d Zügen), sonst %s. Das ist das %s-Fache und kein Zufall. "
                "Verglichen in offenen Partien: Material etwa gleich, ab Zug 8."
                % (de(row["per100"]), row["errors"], row["moves"], de(row["rest"]), de(row["lift"])),
                row["extra"], sid, RULES.get(key))

    # Übergang
    if trans and conversion:
        top = conversion[-1]
        sid = add_set("uebergang", "Nach der Eröffnung",
                      "Die Eröffnung ist vorbei. Bevor du ziehst: Was ist mein Plan, und was droht der Gegner?",
                      "Stellungen aus den Zügen 9 bis 22, in denen du noch gut standest und die Partie gekippt ist.",
                      lambda p, r: 9 <= r["move"] <= 22 and ((r["game"], r["ply"]) in turning_ids or (p.get("winBest") or 0) >= 55))
        w = trans["turnWindow"]
        early = w["11–15"] + w["16–20"]
        finding("uebergang", "Der Eröffnungsvorteil hält nicht",
                "Stehst du nach Zug 10 klar besser (%d Partien, im Mittel %d %% Gewinnchance), sind es fünf Züge später nur noch %s %%, und am Ende holst du %s %% der Punkte. "
                "Von %d Partien mit guter Eröffnung (ab 60 %%) hast du %d verloren. Sie kippen meist früh: %d-mal in den Zügen 11 bis 20, im Mittel bei Zug %d."
                % (top["games"], top["win10"], top["win15"] if top["win15"] is not None else "?", de(top["score"]),
                   trans["good"], trans["lost"], early, round(trans["turnMedian"] or 0)),
                trans["lost"] * 1.2, sid,
                "Nach Zug 10 beginnt die eigentliche Partie: einen Plan fassen und keinen Zug mehr aus der Hand spielen.")

    findings.sort(key=lambda f: -f["weight"])
    dates = sorted(bad.iso(u["g"]["date"]) for u in used)
    return {
        "generated": (today.isoformat() if today else dates[-1]),      # Stand = letzte Partie, damit sich die Datei nur mit neuen Partien ändert
        "games": len(used), "gamesWithClock": sum(1 for u in used if u["clk"]),
        "range": {"from": dates[0], "to": dates[-1]},
        "moves": n, "errors": k, "per100": round(per100, 1),
        "live": {"moves": live_n, "errors": live_k, "per100": round(live_per100, 1)},
        "findings": findings, "sets": sets,
        "structure": sized, "notable": notable[:6], "strong": strong[:4],
        "mechanism": mech_rows, "time": time, "transition": trans, "conversion": conversion, "winning": winning,
    }


def write(profile, out=None):
    path = os.path.join(out or bad.PLAYER_DATA, "weakness_profile.json")
    if profile is None:
        if os.path.exists(path):
            os.remove(path)
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(profile, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)
    return path


def main():
    ap = argparse.ArgumentParser(description="Schwächenprofil aus den Rapid-Partien")
    ap.add_argument("--print", action="store_true", help="Ergebnisse lesbar ausgeben")
    args = ap.parse_args()
    games = bad.load_json(os.path.join(bad.ANALYSIS, "games.json"), [])
    mistakes = bad.load_json(os.path.join(bad.ANALYSIS, "mistakes.json"), [])
    puzzles = bad.clean_puzzles(bad.load_json(os.path.join(bad.ANALYSIS, "my_puzzles.json"), []))
    profile = build_profile(games, mistakes, puzzles)
    path = write(profile)
    if profile is None:
        print("Zu wenige Rapid-Partien für ein Schwächenprofil.")
        return 0
    print("%s: %d Partien, %d Züge, %d grobe Fehler (%s pro 100 Züge), %d Befunde, %d Übungssätze"
          % (os.path.relpath(path, bad.ROOT), profile["games"], profile["moves"], profile["errors"], de(profile["per100"]),
             len(profile["findings"]), len(profile["sets"])))
    if args.print:
        for f in profile["findings"]:
            print("\n[%s] %s (Gewicht %s%s)\n  %s\n  Regel: %s" % (f["area"], f["title"], f["weight"], ", Satz " + f["set"] if f["set"] else "", f["text"], f["rule"]))
        print("\nÜbungssätze:", ", ".join("%s (%d)" % (s["id"], s["n"]) for s in profile["sets"]))
        print("\nStellungstypen (Fehler pro 100 Züge, ab %d Zügen):" % MIN_MOVES)
        for r in profile["structure"]:
            print("  %-18s %-30s %5d Züge %4d Fehler %5.1f  sonst %5.1f  ×%.2f  z=%+.1f" % (FEATURE_DE[r["feature"]], r["value"], r["moves"], r["errors"], r["per100"], r["rest"], r["lift"], r["z"]))
        print("\nMechanik:")
        for r in profile["mechanism"]:
            print("  %-12s %4d  %5.1f %%  Patzer %3d  Median %s s  unter %d s: %s %%" % (r["mech"], r["n"], r["share"], r["blunders"], r["medianSpent"], FAST_S, r["fastShare"]))
        print("\nZeit:", json.dumps(profile["time"], ensure_ascii=False))
        print("\nÜbergang:", json.dumps(profile["transition"], ensure_ascii=False))
        print("\nEröffnung → Ergebnis:", json.dumps(profile["conversion"], ensure_ascii=False))
        print("\nGewinnstellungen:", json.dumps(profile["winning"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
