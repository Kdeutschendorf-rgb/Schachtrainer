"""Hilfsskript (Repertoire Weiß): Linien mit Stockfish durchleuchten.
Aufruf: python -I w_explore.py "e4 e5 Nf3 ..." ["..."]
Pro Weißzug: Top-3 und Verlust; am Ende Top-3 mit Hauptvariante. Ergebnisse werden in w_cache.json gemerkt."""
import sys, os, json, chess, chess.engine
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, "w_cache.json")
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
eng = chess.engine.SimpleEngine.popen_uci(os.path.join(ROOT, "tools/stockfish/stockfish-macos-universal"))
eng.configure({"Threads": 2, "Hash": 64})
D = int(os.environ.get("D", "14"))
SKIP = int(os.environ.get("SKIP", "6"))  # erste Weißzüge (Index < SKIP) nicht prüfen

def top(b, n=3, d=D):
    k = "%s|%d|%d" % (b.epd(), n, d)
    if k not in cache:
        infos = eng.analyse(b, chess.engine.Limit(depth=d), multipv=n)
        cache[k] = [[x["score"].white().score(mate_score=10000), [m.uci() for m in x["pv"][:8]]] for x in infos]
    return cache[k]

def fmt(b, sc, pv):
    mv = [chess.Move.from_uci(u) for u in pv]
    return "%s(%+d) %s" % (b.san(mv[0]), sc, b.variation_san(mv[:6]))

for line in sys.argv[1:]:
    b = chess.Board(); print(line)
    try:
        for i, san in enumerate(line.split()):
            mv = b.parse_san(san)
            if b.turn == chess.WHITE and i >= SKIP:
                t = top(b)
                a = b.copy(); a.push(mv)
                got = top(a, 1, D - 1)[0][0] if not a.is_game_over() else (10000 if a.is_checkmate() else 0)
                loss = t[0][0] - got
                print("%2d %-6s | %s%s" % (i, san, "  ".join("%s(%+d)" % (b.san(chess.Move.from_uci(x[1][0])), x[0]) for x in t),
                      "  <-- %d" % loss if loss > 40 else ""), flush=True)
            b.push(mv)
        if not b.is_game_over():
            for sc, pv in top(b):
                print("   Ende: " + fmt(b, sc, pv))
        else:
            print("   Ende: Partie vorbei", b.result())
    except ValueError as e:
        print("   ILLEGAL", e)
    print(flush=True)
    json.dump(cache, open(CACHE, "w"))
eng.quit()
