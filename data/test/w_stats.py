# Häufigkeiten der Gegnerantworten in Keanus Weißpartien (nur Rapid/alle)
import chess.pgn, collections, sys
f = open(sys.argv[1], encoding="utf-8")
c1 = collections.Counter(); c2 = collections.Counter(); first = collections.Counter()
while True:
    g = chess.pgn.read_game(f)
    if g is None: break
    if g.headers.get("White","").lower() != "keanu098": continue
    mv = [m for m in g.mainline_moves()]
    b = chess.Board(); sans = []
    for m in mv[:6]:
        sans.append(b.san(m)); b.push(m)
    if not sans: continue
    first[sans[0]] += 1
    if sans[0] == "e4" and len(sans) > 1:
        c1[sans[1]] += 1
        if len(sans) > 4: c2[" ".join(sans[:5])] += 1
print(first.most_common(5)); print(c1.most_common(20)); print(c2.most_common(30))
