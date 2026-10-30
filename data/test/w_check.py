"""Hilfsskript (Repertoire Weiß): Behauptungen in Notizen nachprüfen.
Aufruf: python -I w_check.py "e4 e5 Nf3 ..." [...]
Gibt je Linie aus: Material (Weiß−Schwarz in Bauerneinheiten), Engine-Bewertung (Sicht Weiß),
beste Fortsetzung und die Drohung (Nullzug: was würde die Seite, die gerade gezogen hat, als Nächstes spielen?)."""
import sys, os, chess, chess.engine
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
eng = chess.engine.SimpleEngine.popen_uci(os.path.join(ROOT, "tools/stockfish/stockfish-macos-universal"))
eng.configure({"Threads": 2, "Hash": 64})
D = int(os.environ.get("D", "16"))

def mat(b):
    return sum(VAL[p.piece_type] * (1 if p.color else -1) for p in b.piece_map().values())

def ev(b, n=1):
    infos = eng.analyse(b, chess.engine.Limit(depth=D), multipv=n)
    return ["%s (%s)" % (b.variation_san(i["pv"][:6]), i["score"].white()) for i in infos]

for line in sys.argv[1:]:
    b = chess.Board()
    for san in line.split():
        b.push_san(san)
    print(line)
    print("  Material W-S: %+d   %s" % (mat(b), "MATT" if b.is_checkmate() else ("Schach" if b.is_check() else "")))
    if not b.is_game_over():
        for s in ev(b, 3):
            print("  am Zug:", s)
        if not b.is_check():
            n = b.copy(); n.push(chess.Move.null())
            if not n.is_check() or True:
                try:
                    print("  Drohung:", ev(n, 1)[0])
                except Exception as e:
                    print("  Drohung: -", e)
    print(flush=True)
eng.quit()
