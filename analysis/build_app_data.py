"""Baut die Daten für Bericht, Tagesplan und Taktik aus der Partie-Analyse.

Aufruf:  .venv/bin/python -I analysis/build_app_data.py [--out DIR] [--rep-white F] [--rep-black F]
Liest:   data/analysis/games.json, mistakes.json, my_puzzles.json (von analyze_games.py),
         data/raw/*.pgn (Züge für die Repertoire-Abdeckung),
         app/data/repertoire_white.json, repertoire_black.json (dürfen fehlen)
Schreibt: app/data/players/<name>/analysis_summary.json und my_puzzles.json (Spieler: analysis/player.py)
"""
import argparse
import datetime
import glob
import json
import os
import sys
import re
from collections import Counter, defaultdict

import chess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -I: Nachbarmodul player.py
import player   # noqa: E402
ANALYSIS = player.ANALYSIS
RAW = player.RAW
APP_DATA = os.path.join(ROOT, "app", "data")
PLAYER_DATA = player.APP   # persönliche Daten, siehe app/data/players.json
ME = player.NAME
TCS = ("rapid", "blitz", "bullet", "daily")
TC_DE = {"rapid": "Rapid", "blitz": "Blitz", "bullet": "Bullet", "daily": "Täglich"}
PHASES = ("eroeffnung", "mittelspiel", "endspiel")
PHASE_DE = {"eroeffnung": "Eröffnung", "mittelspiel": "Mittelspiel", "endspiel": "Endspiel"}
CLS_WEIGHT = {"blunder": 2.0, "mistake": 1.0, "inaccuracy": 0.0}

# Fehler-Tags aus analyze_games.py → Lichess-Themen (Gewichte je Tag)
TAG_THEMES = {
    "gabel": {"fork": 1.0},
    "figur_eingestellt": {"hangingPiece": 1.0, "trappedPiece": 0.2},
    "materialverlust": {"hangingPiece": 0.4, "pin": 0.3, "skewer": 0.2, "discoveredAttack": 0.2, "capturingDefender": 0.2},
    "schach": {"exposedKing": 0.4, "intermezzo": 0.3, "discoveredAttack": 0.2},
    "matt_zugelassen": {"mateIn1": 0.5, "mateIn2": 0.5, "defensiveMove": 0.6, "backRankMate": 0.3},
    "matt_verpasst": {"mateIn1": 0.6, "mateIn2": 0.6, "mateIn3": 0.2},
    "chance_verpasst": {"crushing": 0.6, "advantage": 0.6},
}
PHASE_THEMES = {"eroeffnung": "opening", "endspiel": "endgame"}

# Häufige Eröffnungsfamilien auf Deutsch (Rest bleibt englisch)
FAMILY_DE = {
    "Sicilian Defense": "Sizilianisch", "French Defense": "Französisch", "Caro-Kann Defense": "Caro-Kann",
    "Italian Game": "Italienisch", "Ruy Lopez": "Spanisch", "Scotch Game": "Schottisch",
    "Scandinavian Defense": "Skandinavisch", "Pirc Defense": "Pirc", "Modern Defense": "Moderne Verteidigung",
    "Alekhine Defense": "Aljechin", "Philidor Defense": "Philidor", "Petrov's Defense": "Russisch",
    "Russian Game": "Russisch", "Four Knights Game": "Vierspringer", "Three Knights Opening": "Dreispringer",
    "Vienna Game": "Wiener Partie", "King's Gambit": "Königsgambit", "King's Gambit Accepted": "Königsgambit angenommen",
    "King's Gambit Declined": "Königsgambit abgelehnt", "Center Game": "Mittelgambit", "Danish Gambit": "Nordisches Gambit",
    "Ponziani Opening": "Ponziani", "Bishop's Opening": "Läuferspiel", "King's Pawn Game": "Königsbauernspiel",
    "King's Knight Opening": "Königsspringerspiel", "Queen's Pawn Game": "Damenbauernspiel",
    "Queen's Gambit Declined": "Damengambit abgelehnt", "Queen's Gambit Accepted": "Damengambit angenommen",
    "Queen's Gambit": "Damengambit", "Slav Defense": "Slawisch", "Semi-Slav Defense": "Halbslawisch",
    "London System": "London-System", "English Opening": "Englisch", "Dutch Defense": "Holländisch",
    "King's Indian Defense": "Königsindisch", "Nimzo-Indian Defense": "Nimzo-Indisch", "Queen's Indian Defense": "Damenindisch",
    "Grünfeld Defense": "Grünfeld", "Englund Gambit": "Englund-Gambit", "Englund Gambit Declined": "Englund-Gambit abgelehnt",
    "Englund Gambit Complex": "Englund-Gambit", "Englund Gambit Complex Declined": "Englund-Gambit abgelehnt",
    "Blackmar-Diemer Gambit": "Blackmar-Diemer-Gambit", "Owen Defense": "Owen-Verteidigung", "St. George Defense": "St.-Georg-Verteidigung",
    "Nimzowitsch Defense": "Nimzowitsch-Verteidigung", "Van't Kruijs Opening": "Van't-Kruijs-Eröffnung", "Elephant Gambit": "Elefantengambit",
    "Latvian Gambit": "Lettisches Gambit", "Bird Opening": "Bird-Eröffnung", "Zukertort Opening": "Zukertort (1.Sf3)",
    "Indian Defense": "Indische Verteidigung", "Horwitz Defense": "Horwitz-Verteidigung", "Mieses Opening": "Mieses-Eröffnung",
    "Hungarian Opening": "Ungarische Eröffnung", "Polish Opening": "Polnisch (1.b4)", "Nimzo-Larsen Attack": "Nimzo-Larsen (1.b3)",
    "Amar Opening": "Amar-Eröffnung", "Grob Opening": "Grob", "Ware Opening": "Ware-Eröffnung", "Clemenz Opening": "Clemenz-Eröffnung",
    "Anderssen's Opening": "Anderssen-Eröffnung", "Barnes Defense": "Barnes-Verteidigung", "Duras Gambit": "Duras-Gambit",
    "Rat Defense": "Rattenverteidigung", "Benoni Defense": "Benoni", "Old Benoni Defense": "Alt-Benoni",
    "Trompowsky Attack": "Trompowsky", "Richter-Veresov Attack": "Richter-Veresov", "Colle System": "Colle-System",
    "Torre Attack": "Torre-Angriff", "Portuguese Opening": "Portugiesisch",
    "Bongcloud Attack": "Bongcloud", "Kádas Opening": "Kádas-Eröffnung", "Saragossa Opening": "Saragossa-Eröffnung",
}


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def iso(date):
    """'2025.05.01' → '2025-05-01'"""
    return (date or "").replace(".", "-")


def score_of(g):
    return 1.0 if g["result"] == "W" else 0.5 if g["result"] == "D" else 0.0


def pct(x, digits=1):
    return round(100.0 * x, digits)


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 1) if xs else None


def family_of(g):
    name = g.get("opening") or ""
    fam = name.split(":")[0].strip() if name else ""
    return fam or "Unbekannt"


def wdl(games):
    c = Counter(g["result"] for g in games)
    n = len(games)
    return {"games": n, "w": c["W"], "d": c["D"], "l": c["L"],
            "score": pct(sum(score_of(g) for g in games) / n) if n else None}


# ---------------------------------------------------------------------------
# Rohe Partien (Züge für die Repertoire-Abdeckung)

HEADER_RE = re.compile(r'^\[(\w+) "(.*)"\]\s*$', re.M)


def game_key(date, end_time, opponent):
    """Schlüssel einer Partie: Datum + Endzeit (HH:MM:SS) + Gegner.
    Der Download schreibt '8:35:07 GMT+0000', die API '08:35:07', daher normalisieren.
    Datum ist der Date-Header (UTC-Starttag), in Download und API gleich."""
    m = re.match(r"\s*(\d{1,2}):(\d{2}):(\d{2})", end_time or "")
    t = "%02d:%s:%s" % (int(m.group(1)), m.group(2), m.group(3)) if m else (end_time or "")
    return "%s|%s|%s" % ((date or "").replace("-", "."), t, (opponent or "").lower())


def san_tokens(movetext, limit=40):
    text = re.sub(r"\{[^}]*\}", " ", movetext)
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\$\d+", " ", text)
    out = []
    for tok in text.split():
        tok = re.sub(r"^\d+\.(\.\.)?", "", tok)
        if not tok or tok in ("1-0", "0-1", "1/2-1/2", "*") or tok.startswith("..."):
            continue
        out.append(tok)
        if len(out) >= limit:
            break
    return out


def read_raw_games(folder=None):
    """→ {key: [SAN, ...]} aus allen PGN-Dateien in data/raw/."""
    moves = {}
    for path in sorted(glob.glob(os.path.join(folder or RAW, "*.pgn"))):
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        for block in re.split(r"\n(?=\[Event )", text):
            headers = dict(HEADER_RE.findall(block))
            if not headers:
                continue
            white = headers.get("White", "")
            opp = headers.get("Black", "") if white.lower() == ME else white
            body = HEADER_RE.sub("", block)
            moves[game_key(headers.get("Date"), headers.get("EndTime"), opp)] = san_tokens(body)
    return moves


# ---------------------------------------------------------------------------
# Repertoire-Abdeckung

def pos_key(board):
    return " ".join(board.fen().split()[:4])


def load_repertoire(path, side):
    """→ {mine: {posKey: uci}, known: set(posKey), lines, chapters, problems} oder None."""
    data = load_json(path, None)
    if not data or not isinstance(data.get("chapters"), list):
        return None
    me = chess.WHITE if side == "w" else chess.BLACK
    mine, known, problems = {}, set(), []
    lines = 0
    start = chess.Board()
    known.add(pos_key(start))
    for ch in data["chapters"]:
        for line in ch.get("lines", []):
            lines += 1
            b = chess.Board()
            for i, san in enumerate(line.get("moves", [])):
                try:
                    mv = b.parse_san(san)
                except ValueError:
                    problems.append("%s: Zug %d (%s) ungültig" % (line.get("id"), i, san))
                    break
                if b.turn == me:
                    key = pos_key(b)
                    if key in mine and mine[key] != mv.uci():
                        problems.append("%s: Widerspruch bei Zug %d" % (line.get("id"), i))
                    mine.setdefault(key, mv.uci())
                b.push(mv)
                known.add(pos_key(b))
    return {"mine": mine, "known": known, "lines": lines, "chapters": len(data["chapters"]), "problems": problems[:20]}


def follow_repertoire(sans, rep, side):
    """Wie weit eine echte Partie im Repertoire bleibt.
    → (plies, reason, detail). reason: 'ende' (Linie zu Ende), 'ich' (selbst abgewichen),
    'gegner' (Gegnerzug nicht abgedeckt), 'partie' (Partie vorher zu Ende)."""
    me = chess.WHITE if side == "w" else chess.BLACK
    b = chess.Board()
    for ply, san in enumerate(sans):
        try:
            mv = b.parse_san(san)
        except ValueError:
            return ply, "partie", None
        key = pos_key(b)
        if b.turn == me:
            expected = rep["mine"].get(key)
            if expected is None:
                return ply, "ende", None
            if mv.uci() != expected:
                return ply, "ich", {"played": san, "expected": b.san(chess.Move.from_uci(expected))}
            b.push(mv)
        else:
            b.push(mv)
            if pos_key(b) not in rep["known"]:
                return ply, "gegner", {"played": san}
    return len(sans), "partie", None


def line_text(sans):
    out = []
    for i, s in enumerate(sans):
        out.append(("%d. %s" % (i // 2 + 1, s)) if i % 2 == 0 else s)
    return " ".join(out)


def recent_games(games, raw_moves, mistakes=(), n=60, plies=30):
    """Die letzten Partien mit den ersten Zügen (Partie-Check) und ihren Fehlern (Wochenbericht)."""
    by_game = defaultdict(list)
    for m in mistakes:
        if m.get("cls") in ("blunder", "mistake"):
            by_game[m["game"]].append(m)
    out = []
    for g in games[-n:][::-1]:
        sans = raw_moves.get(game_key(g.get("date"), g.get("end"), g.get("opponent")))
        if not sans:
            continue
        out.append({"date": iso(g["date"]), "tc": g["tc"], "color": g["color"], "opponent": g.get("opponent"),
                    "result": g["result"], "myElo": g.get("myElo"), "opening": g.get("opening"),
                    "moves": sans[:plies], "accuracy": g.get("accuracy"),
                    "errors": [error_entry(m, g["tc"] == "rapid") for m in by_game[g["game"]]]})
    return out


def error_entry(m, detail):
    """Fehler einer Partie. Bei Rapid mit Stellung und besserem Zug (für die Partie-Besprechung)."""
    e = {"cls": m["cls"], "tags": m.get("tags") or [], "phase": m.get("phase")}
    if detail:
        e.update({"ply": m["ply"], "fen": m["fen"], "played": m["played"], "best": m.get("best"), "bestUci": m.get("bestUci"),
                  "pv": m.get("pv") or "", "drop": m.get("drop")})
    return e


def playouts(games, mistakes, n=30):
    """Stellungen zum Zu-Ende-Spielen: gewonnene zum Verwerten, schlechte zum Retten (neueste zuerst, Rapid bevorzugt)."""
    tc_of = {g["game"]: g["tc"] for g in games}
    date_of = {g["game"]: iso(g["date"]) for g in games}
    win, save = [], []
    for m in sorted(mistakes, key=lambda x: (tc_of.get(x["game"]) != "rapid", -x["game"])):
        if m.get("cls") != "blunder" or not m.get("playedUci") or not (16 <= m["ply"] <= 70):
            continue
        entry = {"id": "%d_%d" % (m["game"], m["ply"]), "date": date_of.get(m["game"]), "tc": tc_of.get(m["game"])}
        if m["winBefore"] >= 80 and len(win) < n:
            win.append({**entry, "kind": "win", "fen": m["fen"], "win": m["winBefore"]})
        if m["winAfter"] <= 25 and len(save) < n:
            b = chess.Board(m["fen"])
            b.push_uci(m["playedUci"])
            save.append({**entry, "kind": "save", "fen": b.fen(), "win": m["winAfter"]})
        if len(win) >= n and len(save) >= n:
            break
    return {"win": win, "save": save}


def recent_focus(games, mistakes, days=30):
    """Fehlerthemen der letzten Tage als Rohgewichte. Die App mischt sie (zusammen mit Bot-Partien) als Ergänzung
    unter den Schwerpunkt aus allen Partien: je mehr neue Fehler, desto stärker, höchstens 40 %."""
    if not games:
        return {"themes": {}, "n": 0, "since": None}
    last = max(iso(g["date"]) for g in games)
    since = (datetime.date.fromisoformat(last) - datetime.timedelta(days=days)).isoformat()
    recent_ids = {g["game"] for g in games if iso(g["date"]) >= since}
    themes = defaultdict(float)
    n = 0.0
    for m in mistakes:
        w = CLS_WEIGHT.get(m["cls"], 0)
        if not w or m["game"] not in recent_ids:
            continue
        if m.get("tc") == "rapid":
            w *= 1.5
        n += w
        for t in m.get("tags") or []:
            for theme, tw in TAG_THEMES.get(t, {}).items():
                themes[theme] += w * tw
        pt = PHASE_THEMES.get(m.get("phase"))
        if pt:
            themes[pt] += 0.3 * w
    return {"themes": {k: round(v, 2) for k, v in themes.items()}, "n": round(n, 1), "since": since}


def repertoire_coverage(games, raw_moves, reps):
    result = {"available": any(reps.values()), "files": {}}
    for side, rep in reps.items():
        if not rep:
            continue
        result["files"][side] = {"chapters": rep["chapters"], "lines": rep["lines"],
                                 "positions": len(rep["mine"]), "problems": rep["problems"]}
        reasons = Counter()
        depths = []
        reached = Counter()
        gaps, devs = Counter(), Counter()
        for g in games:
            if g["color"] != side:
                continue
            sans = raw_moves.get(game_key(g.get("date"), g.get("end"), g.get("opponent")))
            if not sans:
                continue
            plies, reason, detail = follow_repertoire(sans, rep, side)
            reasons[reason] += 1
            depths.append(plies)
            for mv in (2, 4, 6, 8, 10, 12):
                if plies >= 2 * mv:
                    reached[mv] += 1
            if reason == "gegner":
                gaps[line_text(sans[:plies + 1])] += 1
            elif reason == "ich":
                devs[(line_text(sans[:plies]), detail["played"], detail["expected"])] += 1
        n = len(depths)
        if not n:
            continue
        result[side] = {
            "games": n,
            "avgPlies": round(sum(depths) / n, 1),
            "reached": {str(k): pct(reached[k] / n) for k in (2, 4, 6, 8, 10, 12)},
            "reasons": dict(reasons),
            "gaps": [{"line": k, "count": c} for k, c in gaps.most_common(10)],
            "deviations": [{"line": k[0], "played": k[1], "expected": k[2], "count": c} for k, c in devs.most_common(10)],
        }
    return result


# ---------------------------------------------------------------------------
# Aggregate

def elo_block(games):
    series, current, peak, first = {}, {}, {}, {}
    for tc in TCS:
        gs = [g for g in games if g["tc"] == tc and g.get("myElo")]
        if not gs:
            continue
        days = {}
        for g in gs:   # Partien sind zeitlich sortiert: letzter Wert des Tages gewinnt
            d = iso(g["date"])
            e = days.setdefault(d, [d, 0, 0, 0, 0, 0])
            e[1] = g["myElo"]
            e[2] += 1
            e[3 + "WDL".index(g["result"])] += 1
        series[tc] = list(days.values())   # [Datum, Elo, Partien, Siege, Remis, Niederlagen]
        current[tc] = gs[-1]["myElo"]
        first[tc] = gs[0]["myElo"]
        best = max(gs, key=lambda g: g["myElo"])
        peak[tc] = {"elo": best["myElo"], "date": iso(best["date"])}
    return {"series": series, "current": current, "peak": peak, "first": first}


def month_of(g):
    return iso(g["date"])[:7]


def accuracy_block(games):
    by_month = {}
    avg = {}
    for tc in TCS:
        gs = [g for g in games if g["tc"] == tc and g.get("accuracy") is not None]
        if not gs:
            continue
        avg[tc] = mean(g["accuracy"] for g in gs)
        months = defaultdict(list)
        for g in gs:
            months[month_of(g)].append(g["accuracy"])
        by_month[tc] = [[m, mean(v), len(v)] for m, v in sorted(months.items())]
    return {"byMonth": by_month, "avg": avg}


def months_table(games):
    out = []
    months = defaultdict(list)
    for g in games:
        months[month_of(g)].append(g)
    for m, gs in sorted(months.items()):
        blunders = sum(v for k, v in c_items(gs) if k.endswith("_blunder"))
        row = {"month": m, **wdl(gs), "accuracy": mean(g.get("accuracy") for g in gs),
               "blundersPerGame": round(blunders / len(gs), 2)}
        rapid = [g for g in gs if g["tc"] == "rapid"]
        row["rapidGames"] = len(rapid)
        row["rapidElo"] = rapid[-1]["myElo"] if rapid else None
        out.append(row)
    return out


def c_items(games):
    for g in games:
        for k, v in (g.get("counts") or {}).items():
            yield k, v


def openings_block(games):
    out = {}
    for side in ("w", "b"):
        groups = defaultdict(list)
        for g in games:
            if g["color"] == side:
                groups[family_of(g)].append(g)
        rows = []
        for fam, gs in groups.items():
            var = Counter(g.get("opening") or fam for g in gs).most_common(3)
            ecos = Counter(g.get("eco") for g in gs if g.get("eco")).most_common(1)
            rows.append({"name": fam, "nameDe": FAMILY_DE.get(fam, fam), "eco": ecos[0][0] if ecos else "",
                         **wdl(gs), "accuracy": mean(g.get("accuracy") for g in gs),
                         "rapid": len([g for g in gs if g["tc"] == "rapid"]),
                         "variations": [{"name": n, "games": c} for n, c in var]})
        rows.sort(key=lambda r: -r["games"])
        out[side] = rows[:20]
        out[side + "Families"] = len(rows)
    return out


def first_moves_block(games):
    """Häufigste erste Züge (eigene und gegnerische)."""
    out = {}
    for side in ("w", "b"):
        c = Counter()
        for g in games:
            if g["color"] == side and g.get("firstMoves"):
                toks = san_tokens(g["firstMoves"], 2)
                if len(toks) >= 2:
                    c[line_text(toks)] += 1
        out[side] = [{"line": k, "count": v} for k, v in c.most_common(8)]
    return out


def phases_block(games, mistakes):
    n = len(games) or 1
    counts = {ph: Counter() for ph in PHASES}
    for m in mistakes:
        if m.get("phase") in counts:
            counts[m["phase"]][m["cls"]] += 1
    rapid_games = [g for g in games if g["tc"] == "rapid"]
    rapid_ids = {g["game"] for g in rapid_games}
    rapid = {ph: Counter() for ph in PHASES}
    for m in mistakes:
        if m["game"] in rapid_ids and m.get("phase") in rapid:
            rapid[m["phase"]][m["cls"]] += 1
    nr = len(rapid_games) or 1

    def per_game(cnt, k):
        return {c: round(cnt[c] / k, 2) for c in ("inaccuracy", "mistake", "blunder")}

    return {
        "all": {ph: {"total": dict(counts[ph]), "perGame": per_game(counts[ph], n)} for ph in PHASES},
        "rapid": {ph: {"total": dict(rapid[ph]), "perGame": per_game(rapid[ph], nr)} for ph in PHASES},
    }


def tags_block(mistakes):
    c, rapid = Counter(), Counter()
    untagged = 0
    serious = [m for m in mistakes if m["cls"] in ("mistake", "blunder")]
    for m in serious:
        tags = m.get("tags") or []
        if not tags:
            untagged += 1
        for t in tags:
            c[t] += 1
            if m.get("tc") == "rapid":
                rapid[t] += 1
    return {"all": dict(c.most_common()), "rapid": dict(rapid.most_common()), "untagged": untagged,
            "serious": len(serious), "byCls": dict(Counter(m["cls"] for m in mistakes))}


def last_win(g):
    for k in ("winAt25", "winAt15", "winAt10"):
        if g.get(k) is not None:
            return g[k]
    return None


def time_block(games):
    losses = [g for g in games if g["result"] == "L"]
    by_term = Counter(g["termination"] for g in losses)
    by_tc = {}
    for tc in TCS:
        ls = [g for g in losses if g["tc"] == tc]
        if ls:
            by_tc[tc] = {"losses": len(ls), "zeit": len([g for g in ls if g["termination"] == "zeit"]),
                         "verlassen": len([g for g in ls if g["termination"] == "verlassen"])}
    time_losses = [g for g in losses if g["termination"] == "zeit"]
    ok = [g for g in time_losses if (last_win(g) or 0) >= 40]
    wins_time = len([g for g in games if g["result"] == "W" and g["termination"] == "zeit"])
    return {"losses": len(losses), "byTermination": dict(by_term), "byTc": by_tc,
            "timeLosses": len(time_losses), "timeLossesNotLost": len(ok),
            "timeLossShare": pct(len(time_losses) / len(losses)) if losses else None,
            "winsOnTime": wins_time,
            "abandoned": len([g for g in losses if g["termination"] == "verlassen"])}


def trend_block(games):
    """Erstes gegen letztes Drittel pro Modus (Entwicklung)."""
    out = {}
    for tc in TCS:
        gs = [g for g in games if g["tc"] == tc]
        if len(gs) < 9:
            continue
        k = len(gs) // 3

        def stats(part):
            blunders = sum(v for key, v in c_items(part) if key.endswith("_blunder"))
            return {"from": iso(part[0]["date"]), "to": iso(part[-1]["date"]), **wdl(part),
                    "accuracy": mean(g.get("accuracy") for g in part),
                    "blundersPerGame": round(blunders / len(part), 2),
                    "elo": part[-1]["myElo"]}
        out[tc] = {"early": stats(gs[:k]), "late": stats(gs[-k:])}
    return out


def focus_block(games, mistakes, openings, time):
    themes = defaultdict(float)
    phase_w = Counter()
    for m in mistakes:
        w = CLS_WEIGHT.get(m["cls"], 0)
        if not w:
            continue
        if m.get("tc") == "rapid":
            w *= 1.5     # Rapid ist das Ziel, dort zählen Fehler mehr
        phase_w[m.get("phase")] += w
        for t in m.get("tags") or []:
            for theme, tw in TAG_THEMES.get(t, {}).items():
                themes[theme] += w * tw
        pt = PHASE_THEMES.get(m.get("phase"))
        if pt:
            themes[pt] += 0.3 * w
    top = max(themes.values()) if themes else 0
    theme_out = {k: round(v / top, 3) for k, v in sorted(themes.items(), key=lambda x: -x[1])} if top else {}
    total = sum(phase_w[p] for p in PHASES)
    phases = {p: round(phase_w[p] / total, 3) for p in PHASES} if total else {}
    weak = []
    for side in ("w", "b"):
        for r in openings.get(side, []):
            if r["games"] >= 4 and r["score"] is not None and r["score"] < 45:
                weak.append({"name": r["name"], "nameDe": r["nameDe"], "color": side, "games": r["games"],
                             "score": r["score"], "weight": round(r["games"] * (50 - r["score"]) / 100, 2)})
    weak.sort(key=lambda r: -r["weight"])
    rapid_losses = [g for g in games if g["tc"] == "rapid" and g["result"] == "L"]
    first_blunders = [g["firstBlunderPly"] // 2 + 1 for g in games if g.get("firstBlunderPly") is not None]
    return {
        "themes": theme_out,
        "phases": phases,
        "openings": weak[:8],
        "timeTrouble": round(time["timeLosses"] / time["losses"], 3) if time["losses"] else 0,
        "timeTroubleRapid": round(len([g for g in rapid_losses if g["termination"] == "zeit"]) / len(rapid_losses), 3)
        if rapid_losses else 0,
        "firstBlunderMove": round(sum(first_blunders) / len(first_blunders), 1) if first_blunders else None,
    }


def insights(summary):
    """Automatische Stärken/Schwächen in ganzen Sätzen (ohne Claude)."""
    strengths, weaknesses = [], []
    elo = summary["elo"]
    if "rapid" in elo["current"]:
        a, b = elo["first"]["rapid"], elo["current"]["rapid"]
        if b > a:
            strengths.append("Rapid-Elo von %d auf %d gesteigert (Höchstwert %d)." % (a, b, elo["peak"]["rapid"]["elo"]))
        else:
            weaknesses.append("Rapid-Elo steht bei %d (Start %d, Höchstwert %d)." % (b, a, elo["peak"]["rapid"]["elo"]))
    for side, name in (("w", "Weiß"), ("b", "Schwarz")):
        good = [r for r in summary["openings"].get(side, []) if r["games"] >= 5 and (r["score"] or 0) >= 55]
        if good:
            r = max(good, key=lambda r: r["games"])
            strengths.append("Mit %s läuft %s gut: %d %% aus %d Partien." % (name, r["nameDe"], round(r["score"]), r["games"]))
    for r in summary["focus"]["openings"][:2]:
        weaknesses.append("%s (%s): nur %d %% aus %d Partien." % (r["nameDe"], "Weiß" if r["color"] == "w" else "Schwarz",
                                                                  round(r["score"]), r["games"]))
    t = summary["time"]
    if t["losses"] and t["timeLosses"] / t["losses"] >= 0.2:
        bullet = t["byTc"].get("bullet", {}).get("zeit", 0)
        where = (", %d davon im Bullet" % bullet) if bullet >= 0.6 * t["timeLosses"] else ""
        weaknesses.append("%d deiner %d Niederlagen waren Zeitverluste (%d %%%s)." % (
            t["timeLosses"], t["losses"], round(100 * t["timeLosses"] / t["losses"]), where))
    rapid_t = t["byTc"].get("rapid", {})
    if rapid_t.get("verlassen", 0) >= 5:
        weaknesses.append("%d deiner %d Rapid-Niederlagen kamen durch Verlassen der Partie. Spiel weiter, "
                          "auf deinem Niveau drehen sich viele Stellungen noch." % (rapid_t["verlassen"], rapid_t["losses"]))
    elif t["abandoned"] >= 5:
        weaknesses.append("%d Partien hast du verlassen statt weiterzuspielen." % t["abandoned"])
    tags = summary["mistakeTags"]["all"]
    if tags:
        tag, n = next(iter(tags.items()))
        names = {"figur_eingestellt": "eingestellte Figuren", "materialverlust": "Materialverlust nach einer Taktik",
                 "gabel": "übersehene Gabeln", "schach": "übersehene Schachgebote", "matt_verpasst": "verpasste Matts",
                 "matt_zugelassen": "zugelassene Matts", "chance_verpasst": "nicht genutzte Fehler des Gegners"}
        weaknesses.append("Häufigstes Fehlermuster: %s (%d-mal)." % (names.get(tag, tag), n))
    ph = summary["phases"]["all"]
    per_game = {p: ph[p]["perGame"]["blunder"] + 0.5 * ph[p]["perGame"]["mistake"] for p in PHASES}
    if any(per_game.values()):
        # Nur die schwächste Phase nennen: Endspiele werden seltener erreicht, ein Vergleich pro Partie
        # würde das Endspiel sonst fälschlich als Stärke ausweisen.
        worst = max(per_game, key=per_game.get)
        where = {"eroeffnung": "in der Eröffnung", "mittelspiel": "im Mittelspiel", "endspiel": "im Endspiel"}[worst]
        weaknesses.append("Die meisten groben Fehler passieren %s (%s pro Partie)." % (
            where, ("%.1f" % per_game[worst]).replace(".", ",")))
    tr = summary["trend"].get("rapid")
    if tr and tr["early"]["accuracy"] and tr["late"]["accuracy"]:
        d = tr["late"]["accuracy"] - tr["early"]["accuracy"]
        if d >= 1:
            strengths.append("Deine Rapid-Genauigkeit ist gestiegen: von %.0f %% auf %.0f %%." % (tr["early"]["accuracy"], tr["late"]["accuracy"]))
        elif d <= -1:
            weaknesses.append("Deine Rapid-Genauigkeit ist gesunken: von %.0f %% auf %.0f %%." % (tr["early"]["accuracy"], tr["late"]["accuracy"]))
    fb = summary["focus"].get("firstBlunderMove")
    if fb and fb <= 20:
        weaknesses.append("Dein erster Patzer kommt im Schnitt schon in Zug %d." % round(fb))
    return {"strengths": strengths[:5], "weaknesses": weaknesses[:8]}


def clean_puzzles(puzzles):
    out = []
    seen = set()
    for p in puzzles:
        if not p.get("fen") or not p.get("moves") or p.get("id") in seen:
            continue
        seen.add(p["id"])
        out.append({k: p.get(k) for k in ("id", "fen", "moves", "played", "cls", "phase", "tags", "tc", "date",
                                          "winBest", "winSecond")})
    out.sort(key=lambda p: (p.get("date") or "", p["id"]), reverse=True)
    return out


def build(args):
    games = load_json(os.path.join(ANALYSIS, "games.json"), [])
    mistakes = load_json(os.path.join(ANALYSIS, "mistakes.json"), [])
    puzzles = load_json(os.path.join(ANALYSIS, "my_puzzles.json"), [])
    games.sort(key=lambda g: (iso(g.get("date")), g.get("end") or "", g["game"]))

    summary = {
        "version": 1,
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "player": "Keanu098",
        "range": {"from": iso(games[0]["date"]), "to": iso(games[-1]["date"])} if games else None,
        "totals": {"all": wdl(games), "byTc": {tc: wdl([g for g in games if g["tc"] == tc]) for tc in TCS
                                               if any(g["tc"] == tc for g in games)},
                   "white": wdl([g for g in games if g["color"] == "w"]),
                   "black": wdl([g for g in games if g["color"] == "b"]),
                   "mistakes": len(mistakes)},
        "elo": elo_block(games),
        "accuracy": accuracy_block(games),
        "months": months_table(games),
        "openings": openings_block(games),
        "firstMoves": first_moves_block(games),
        "phases": phases_block(games, mistakes),
        "mistakeTags": tags_block(mistakes),
        "time": time_block(games),
        "trend": trend_block(games),
    }
    summary["focus"] = focus_block(games, mistakes, summary["openings"], summary["time"])
    reps = {"w": load_repertoire(args.rep_white, "w"), "b": load_repertoire(args.rep_black, "b")}
    raw_moves = read_raw_games()
    summary["repertoire"] = repertoire_coverage(games, raw_moves, reps)
    summary["recentGames"] = recent_games(games, raw_moves, mistakes)
    summary["recentFocus"] = recent_focus(games, mistakes)
    summary["playouts"] = playouts(games, mistakes)
    summary["insights"] = insights(summary)
    clean = clean_puzzles(puzzles)
    summary["ownPuzzles"] = len(clean)

    os.makedirs(args.out, exist_ok=True)
    for name, data in (("analysis_summary.json", summary), ("my_puzzles.json", clean)):
        tmp = os.path.join(args.out, name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, os.path.join(args.out, name))   # atomar, damit die App nie eine halbe Datei liest
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=PLAYER_DATA, help="Zielordner (Standard: app/data/players/<name>)")
    ap.add_argument("--rep-white", default=os.path.join(APP_DATA, "repertoire_white.json"))
    ap.add_argument("--rep-black", default=os.path.join(APP_DATA, "repertoire_black.json"))
    args = ap.parse_args()
    s = build(args)
    rep = s["repertoire"]
    print("analysis_summary.json: %d Partien, %d Fehler, %d eigene Aufgaben, Repertoire %s" % (
        s["totals"]["all"]["games"], s["totals"]["mistakes"], s["ownPuzzles"],
        "ja" if rep["available"] else "fehlt"))


if __name__ == "__main__":
    main()
