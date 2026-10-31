"""Engine-Analyse aller chess.com-Partien.

Aufruf:  .venv/bin/python -I analysis/analyze_games.py data/raw/<datei>.pgn
Ausgabe: data/analysis/games.json, mistakes.json, my_puzzles.json
"""
import io
import json
import math
import os
import sys
from multiprocessing import Pool

import chess
import chess.engine
import chess.pgn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# In der GitHub Action kommt Stockfish aus dem System (Umgebungsvariable STOCKFISH)
ENGINE = os.environ.get("STOCKFISH") or os.path.join(ROOT, "tools", "stockfish", "stockfish-macos-universal")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -I: Nachbarmodul player.py
import player   # noqa: E402
OUT = player.ANALYSIS
ME = player.NAME
VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
PIECE_DE = {chess.PAWN: "Bauer", chess.KNIGHT: "Springer", chess.BISHOP: "Läufer",
            chess.ROOK: "Turm", chess.QUEEN: "Dame", chess.KING: "König"}


def tc_category(tc):
    if not tc or tc == "?":
        return "rapid"
    if "/" in tc:
        return "daily"
    base, _, inc = tc.partition("+")
    total = int(base) + 40 * int(inc or 0)
    if total < 180:
        return "bullet"
    if total < 600:
        return "blitz"
    return "rapid"


def win_pct(cp):
    cp = max(-1500, min(1500, cp))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def score_cp(score):
    return score.white().score(mate_score=10000)


def material(board, color):
    return sum(VALUES[p.piece_type] for p in board.piece_map().values() if p.color == color)


def non_pawn_material(board):
    return sum(VALUES[p.piece_type] for p in board.piece_map().values() if p.piece_type not in (chess.PAWN, chess.KING))


def phase(board, ply):
    npm = non_pawn_material(board)
    queens = board.pieces(chess.QUEEN, chess.WHITE) or board.pieces(chess.QUEEN, chess.BLACK)
    if npm <= 20 or (npm <= 26 and not queens):
        return "endspiel"
    if ply < 20:
        return "eroeffnung"
    return "mittelspiel"


def load_openings():
    """EPD -> (eco, name) aus der Lichess-Eröffnungsliste."""
    book = {}
    folder = player.OPENINGS_TSV
    for f in sorted(os.listdir(folder)):
        if not f.endswith(".tsv"):
            continue
        with open(os.path.join(folder, f), encoding="utf-8") as fh:
            next(fh)
            for line in fh:
                eco, name, pgn = line.rstrip("\n").split("\t")
                game = chess.pgn.read_game(io.StringIO(pgn))
                board = game.board()
                for mv in game.mainline_moves():
                    board.push(mv)
                book[board.epd()] = (eco, name)
    return book


def motifs(board_after, pv, my_color):
    """Grobe Einordnung, was nach meinem Fehler passiert (Widerlegung = pv)."""
    tags = []
    if not pv:
        return tags
    b = board_after.copy()
    reply = pv[0]
    moved = b.piece_at(reply.from_square)
    captured = b.piece_at(reply.to_square)
    b.push(reply)
    if b.is_check():
        tags.append("schach")
    if moved:
        attacked = [sq for sq in b.attacks(reply.to_square)
                    if b.piece_at(sq) and b.piece_at(sq).color == my_color
                    and VALUES[b.piece_at(sq).piece_type] >= 3 or (b.piece_at(sq) and b.piece_at(sq).piece_type == chess.KING and b.piece_at(sq).color == my_color)]
        if len(attacked) >= 2:
            tags.append("gabel")
    if captured and captured.color == my_color and VALUES[captured.piece_type] >= 3:
        tags.append("figur_eingestellt")
    # Materialverlust über die ersten 4 Halbzüge der Widerlegung
    b2 = board_after.copy()
    before = material(b2, my_color) - material(b2, not my_color)
    for mv in pv[:4]:
        if not b2.is_legal(mv):
            break
        b2.push(mv)
    after = material(b2, my_color) - material(b2, not my_color)
    if before - after >= 2:
        tags.append("materialverlust")
    return tags


def analyse_game(args):
    idx, pgn_text, book = args
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    h = game.headers
    white = h.get("White", "").lower() == ME
    my_color = chess.WHITE if white else chess.BLACK
    tc = tc_category(h.get("TimeControl"))
    nodes = 200000 if tc in ("rapid", "daily") else 80000
    engine = chess.engine.SimpleEngine.popen_uci(ENGINE)
    engine.configure({"Threads": 1, "Hash": 64})

    board = game.board()
    moves = list(game.mainline_moves())
    evals, bests, pvs = [], [], []
    boards = [board.copy()]
    for mv in moves:
        board.push(mv)
        boards.append(board.copy())
    for b in boards:
        if b.is_checkmate():
            evals.append(-10000 if b.turn == chess.WHITE else 10000)
            bests.append(None)
            pvs.append([])
            continue
        if b.is_game_over():
            evals.append(0)
            bests.append(None)
            pvs.append([])
            continue
        info = engine.analyse(b, chess.engine.Limit(nodes=nodes))
        evals.append(score_cp(info["score"]))
        pv = info.get("pv", [])
        pvs.append(pv)
        bests.append(pv[0] if pv else None)

    sign = 1 if white else -1
    opening = ("", "")
    book_ply = 0
    mistakes = []
    acc = []
    counts = {}
    first_blunder = None
    for ply, mv in enumerate(moves):
        b = boards[ply]
        epd = boards[ply + 1].epd()
        if epd in book:
            opening = book[epd]
            book_ply = ply + 1
        if b.turn != my_color:
            continue
        wb = win_pct(sign * evals[ply])
        wa = win_pct(sign * evals[ply + 1])
        drop = wb - wa
        acc.append(max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * max(0.0, drop)) - 3.1669)))
        cls = "blunder" if drop >= 30 else "mistake" if drop >= 20 else "inaccuracy" if drop >= 10 else None
        if not cls:
            continue
        ph = phase(b, ply)
        counts[ph + "_" + cls] = counts.get(ph + "_" + cls, 0) + 1
        if cls == "blunder" and first_blunder is None:
            first_blunder = ply
        prev_drop = 0.0
        if ply > 0:
            prev_drop = win_pct(sign * evals[ply]) - win_pct(sign * evals[ply - 1])
        tags = motifs(boards[ply + 1], pvs[ply + 1], my_color)
        if sign * evals[ply] >= 9000 and sign * evals[ply + 1] < 9000:
            tags.append("matt_verpasst")
        if sign * evals[ply + 1] <= -9000:
            tags.append("matt_zugelassen")
        if prev_drop >= 20:
            tags.append("chance_verpasst")
        best = bests[ply]
        mistakes.append({
            "game": idx, "ply": ply, "moveNo": ply // 2 + 1, "color": "w" if white else "b",
            "tc": tc, "fen": b.fen(), "played": b.san(mv), "playedUci": mv.uci(),
            "best": b.san(best) if best else None, "bestUci": best.uci() if best else None,
            "pv": b.variation_san(pvs[ply][:6]) if pvs[ply] else "",
            "refutation": boards[ply + 1].variation_san(pvs[ply + 1][:4]) if pvs[ply + 1] else "",
            "winBefore": round(wb, 1), "winAfter": round(wa, 1), "drop": round(drop, 1),
            "cls": cls, "phase": ph, "tags": tags,
        })

    # Zweiter Durchgang: eindeutige Lösungen -> eigene Taktikaufgaben
    puzzles = []
    for m in mistakes:
        if m["drop"] < 20 or not m["bestUci"]:
            continue
        b = chess.Board(m["fen"])
        infos = engine.analyse(b, chess.engine.Limit(nodes=400000), multipv=2)
        if len(infos) < 2:
            continue
        w1 = win_pct(sign * score_cp(infos[0]["score"]))
        w2 = win_pct(sign * score_cp(infos[1]["score"]))
        if w1 - w2 < 15 or w1 < 55:
            continue
        line = infos[0].get("pv", [])[:3]
        if len(line) % 2 == 0:
            line = line[:-1]
        puzzles.append({
            "id": "g%d_%d" % (idx, m["ply"]), "fen": m["fen"], "moves": [x.uci() for x in line],
            "played": m["played"], "cls": m["cls"], "phase": m["phase"], "tags": m["tags"],
            "tc": tc, "date": h.get("Date"), "winBest": round(w1, 1), "winSecond": round(w2, 1),
        })
    engine.quit()

    res = h.get("Result")
    out = "D" if res == "1/2-1/2" else ("W" if (res == "1-0") == white else "L")
    term = h.get("Termination", "")
    term_kind = ("zeit" if "Zeit" in term else "matt" if "matt" in term.lower() else
                 "aufgabe" if "aufgabe" in term.lower() else "verlassen" if "verlassen" in term else
                 "remis" if out == "D" else "sonst")

    def win_at(p):
        return round(win_pct(sign * evals[p]), 1) if p < len(evals) else None

    summary = {
        "game": idx, "date": h.get("Date"), "end": h.get("EndTime"), "tc": tc, "timeControl": h.get("TimeControl"),
        "color": "w" if white else "b", "myElo": int(h.get("WhiteElo" if white else "BlackElo", 0) or 0),
        "oppElo": int(h.get("BlackElo" if white else "WhiteElo", 0) or 0),
        "opponent": h.get("Black" if white else "White"), "result": out, "termination": term_kind,
        "eco": opening[0], "opening": opening[1], "family": opening[1].split(":")[0],
        "bookPly": book_ply, "plies": len(moves), "accuracy": round(sum(acc) / len(acc), 1) if acc else None,
        "counts": counts, "firstBlunderPly": first_blunder,
        "winAt10": win_at(20), "winAt15": win_at(30), "winAt25": win_at(50),
        "firstMoves": " ".join(boards[0].variation_san(moves[:8]).split()) if moves else "",
    }
    return summary, mistakes, puzzles


def main():
    path = sys.argv[1]
    text = open(path, encoding="utf-8").read()
    chunks = [c for c in text.split("\n\n[Event ") if c.strip()]
    chunks = [c if c.startswith("[Event ") else "[Event " + c for c in chunks]
    if len(sys.argv) > 2:
        chunks = chunks[:int(sys.argv[2])]
    book = load_openings()
    os.makedirs(OUT, exist_ok=True)
    games, mistakes, puzzles = [], [], []
    with Pool(7) as pool:
        for n, (s, m, p) in enumerate(pool.imap_unordered(analyse_game, [(i, c, book) for i, c in enumerate(chunks)]), 1):
            games.append(s)
            mistakes.extend(m)
            puzzles.extend(p)
            if n % 25 == 0:
                print("%d/%d Partien analysiert" % (n, len(chunks)), flush=True)
    games.sort(key=lambda g: g["game"])
    mistakes.sort(key=lambda m: (m["game"], m["ply"]))
    for name, data in (("games", games), ("mistakes", mistakes), ("my_puzzles", puzzles)):
        with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
    print("fertig: %d Partien, %d Fehler, %d eigene Aufgaben" % (len(games), len(mistakes), len(puzzles)))


if __name__ == "__main__":
    main()
