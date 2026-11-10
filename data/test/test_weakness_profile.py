"""Prüft die Einordnung der Fehler im Schwächenprofil an Stellungen, die man am Brett nachvollziehen kann.
Aufruf:  .venv/bin/python -I data/test/test_weakness_profile.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "analysis"))
import chess                      # noqa: E402
import weakness_profile as wp     # noqa: E402

passed = failed = 0


def ok(cond, text):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FEHLER: " + text)


def mech(fen, san, refutation, tags=("materialverlust",)):
    b = chess.Board(fen)
    return wp.mechanism(b, b.parse_san(san), {"refutation": refutation, "tags": list(tags)})


# Kein Materialverlust
ok(mech("rnbqkbnr/ppp1pppp/8/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 2", "Nb5", "2... c6 3. Nc3", ()) == "sonst", "kein Schlagen, keine Tags → sonst")
ok(mech("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", "Qh4", "3. Nxh4", ("figur_eingestellt", "materialverlust")) == "zielfeld", "Dame auf angegriffenes Feld gestellt → zielfeld")
# Schlagfehler: nur, wenn die schlagende Figur mehr wert ist als die Beute
ok(mech("rnbqkbnr/ppp2ppp/4p3/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3", "exd5", "3... exd5", ()) == "sonst", "gleichwertiger Abtausch ist kein Schlagfehler")
ok(mech("rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3", "Qxd2+", "4. Bxd2", ("figur_eingestellt", "materialverlust")) == "schlagfehler", "Dame schlägt gedeckten Bauern → schlagfehler")
# Drohung stehen gelassen: Die Dame d5 ist vom Springer c3 angegriffen, Schwarz zieht etwas anderes
ok(mech("rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3", "Nf6", "4. Nxd5", ("figur_eingestellt", "materialverlust")) == "drohung", "angegriffene Dame stehen gelassen → drohung")
# Taktik: Die Widerlegung beginnt mit einem Schach. Deckung: Die weggezogene Figur hat gedeckt
ok(mech("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3", "Nxe4", "4. Bxf7+ Kxf7", ("schach",)) == "taktik", "Schach als Widerlegung → taktik")
ok(mech("4k3/8/8/n2r4/8/8/1P6/3RK3 b - - 0 1", "Nc6", "2. Rxd5", ("materialverlust", "figur_eingestellt")) == "drohung", "Turm hing schon und der Springer deckte ihn nicht → drohung")
ok(mech("4k3/8/5n2/3r4/8/8/1P6/3RK3 b - - 0 1", "Ng4", "2. Rxd5", ("materialverlust", "figur_eingestellt")) == "deckung", "Springer zieht weg und der Turm verliert seine Deckung → deckung")
# Eigene Chance verpasst: keine Materialverlust-Tags
ok(mech("4k3/8/8/3r4/8/8/1P6/3RK3 w - - 0 1", "b3", "1... Rxd1+ 2. Kxd1", ("chance_verpasst",)) == "chance", "Chance verpasst ohne Materialverlust → chance")

# Stellungsmerkmale
b = chess.Board("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5")
ok(wp.centre_type(b) == "halboffen" or wp.centre_type(b) == "offen", "Italienisch: Zentrum nicht geschlossen")
ok(wp.centre_type(chess.Board("rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3")) == "geschlossen", "Französisch Vorstoß (d4/e5 gegen d5/e6 verkeilt): geschlossen")
ok(wp.centre_type(chess.Board("rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3")) == "halboffen", "ein blockiertes Paar (e4/e5) und Spannung: halboffen")
ok(wp.centre_type(chess.Board("r1bq1rk1/ppp2ppp/2n2n2/8/8/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 9")) == "offen", "keine Zentrumsbauern: offen")
h = wp.hanging(chess.Board("rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3"), chess.BLACK)
ok(chess.D5 in h, "Dame d5 hängt (vom Springer angegriffen)")
ok(wp.loose_pieces(chess.Board(), chess.WHITE) == [chess.A1, chess.H1] or set(wp.loose_pieces(chess.Board(), chess.WHITE)) == {chess.A1, chess.H1}, "Grundstellung: nur die Türme sind ungedeckt")
ok(wp.base_seconds("600") == (600, 0) and wp.base_seconds("600+5") == (600, 5) and wp.base_seconds("1/86400") is None, "TimeControl lesen")
ok(wp.strip_numbers("13. Qg5 Qxg5 14. Nxg5") == ["Qg5", "Qxg5", "Nxg5"] and wp.strip_numbers("12...Bg4+ 13. Kd2") == ["Bg4+", "Kd2"], "Zugnummern entfernen")

print("%d bestanden, %d fehlgeschlagen" % (passed, failed))
sys.exit(1 if failed else 0)
