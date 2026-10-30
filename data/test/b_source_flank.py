"""Quelle (Teil 2) für app/data/repertoire_black.json: London & andere 1.d4-Systeme, Flankeneröffnungen.

Gleiches Format wie b_source.py ("pgn" = englische SAN, Notiz in {…} direkt hinter dem Zug).
Das Damengambit-Kapitel (b-qgd) steht in b_source.py. Bauen: .venv/bin/python -I data/test/b_build.py
"""

G_D4 = "Schwarz: gegen 1.d4"
G_FLANK = "Schwarz: Flankeneröffnungen"

CHAPTERS = []

# ---------------------------------------------------------------------------------------------
# London-System: 2.Lf4 bzw. 2.Sf3 Sf6 3.Lf4, jeweils mit …c5
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-london", "group": G_D4, "priority": 1,
    "title": "London-System (2.Lf4 und 2.Sf3/3.Lf4) mit …c5",
    "intro": "Gegen das London-System schlägst du mit …c5 sofort gegen d4. Weil der weiße Läufer schon auf f4 "
             "steht, fehlt er am Damenflügel: Mit …Db6 greifst du den Bauern b2 an. Weiß muss dafür Zeit "
             "aufwenden, oft mit Db3, und du antwortest mit …c4 und gewinnst Raum.",
    "ideas": [
        "Zugfolge: …c5, …Sc6, dann …Db6 gegen b2. Kommt Db3, schiebst du mit …c4 und vertreibst die Dame.",
        "Steht dein Springer schon auf f6, ist …Lf5 nach Dc2 gut: d5 ist gedeckt, und Dxf5 verliert b2 und mehr.",
        "Ohne Sf6 (Zugfolge 2.Lf4 c5 3.e3 Sc6 4.c3) ist d5 ungedeckt, dann kommt statt …Lf5 der Schlag …e5.",
        "Spielt Weiß früh Sd2 ohne Sf3, prüfe …cxd4: Nach exd4 ist der Bauer d4 oft nicht gedeckt.",
    ],
    "lines": [
        {"id": "b-lon-qc2-e5", "name": "2.Lf4 c5 3.e3 Sc6 4.c3 Db6 5.Db3 c4 6.Dc2 e5", "frequency": "häufig",
         "pgn": "d4 d5 "
                "Bf4 {Das London-System: Der Läufer kommt vor die Bauernkette.} "
                "c5 {Greift d4 sofort an. Der Lf4 fehlt jetzt bei der Verteidigung von b2.} "
                "e3 {Weiß stützt d4.} "
                "Nc6 {Noch ein Angreifer gegen d4.} "
                "c3 {Weiß baut die Pyramide c3–d4–e3.} "
                "Qb6 {Die Dame greift b2 an, den Bauern, den der Lf4 nicht mehr deckt.} "
                "Qb3 {Die übliche Verteidigung: Weiß bietet den Damentausch an.} "
                "c4 {Gewinnt Raum mit Tempo: Die weiße Dame muss weg.} "
                "Qc2 {Die Dame zieht sich zurück.} "
                "e5 {Der Gegenschlag greift den Lf4 an und öffnet deinen Lc8. Nicht 6…Lf5? wegen 7.Dxf5 Dxb2 "
                "8.Dxd5: Ohne Springer auf f6 ist d5 ungedeckt.} "
                "dxe5 {Weiß nimmt den Bauern.} "
                "Bf5 {Mit Tempo gegen die Dame. Du holst den Bauern e5 später mit …Sge7–g6 oder …Sxe5 zurück.}",
         "plan": "Entwickle mit …Sge7 und …Sg6 und hol dir den Bauern e5 zurück. Dein Bauer c4 gibt dir Raum am "
                 "Damenflügel, …b5–b4 ist ein typischer Hebel."},
        {"id": "b-lon-qxb6", "name": "2.Lf4 c5 3.e3 Sc6 4.c3 Db6 5.Db3 c4 6.Dxb6 axb6", "frequency": "mittel",
         "pgn": "d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 "
                "Qxb6 {Weiß tauscht die Damen.} "
                "axb6 {Zur Mitte hin schlagen geht nicht, also mit dem a-Bauern: Dein Ta8 steht jetzt auf der "
                "offenen a-Linie.}",
         "plan": "Spiele …b5–b4 und nutze die a-Linie mit dem Turm. Der Bauer c4 hält Weiß am Damenflügel "
                 "eingeengt. Der König bleibt im Endspiel in der Mitte."},
        {"id": "b-lon-nd2-trap", "name": "2.Lf4 c5 3.e3 Sc6 4.Sd2? cxd4 5.exd4 Sxd4", "frequency": "mittel",
         "pgn": "d4 d5 Bf4 c5 e3 Nc6 "
                "Nd2 {Ein Fehler: Der Springer verstellt der Dame die d-Linie.} "
                "cxd4 {Erst tauschen: Jetzt muss Weiß mit dem e-Bauern zurückschlagen.} "
                "exd4 {Der neue Bauer d4 hat keinen Schutz: Die Dame sieht ihn wegen des Sd2 nicht.} "
                "Nxd4 {Bauer gewonnen.} "
                "Ngf3 {Weiß greift deinen Springer an.} "
                "Nc6 {Zurück auf ein sicheres Feld. Du hast einen Bauern mehr.}",
         "plan": "Entwickle mit …Sf6, …e6 und …Ld6 und rochiere. Tausche Figuren: Mit dem Mehrbauern hilft "
                 "dir jeder Tausch."},
        {"id": "b-lon-nf3-main", "name": "2.Sf3 Sf6 3.Lf4 c5 4.e3 Sc6 5.c3 Db6 6.Db3 c4 7.Dc2 Lf5",
         "frequency": "häufig",
         "pgn": "d4 d5 "
                "Nf3 {Weiß entwickelt zuerst den Springer.} "
                "Nf6 {Entwickeln und e4 kontrollieren.} "
                "Bf4 {London-System mit Zugumstellung.} "
                "c5 {Auch hier sofort gegen d4.} "
                "e3 Nc6 {Noch ein Angreifer gegen d4.} "
                "c3 Qb6 {Wieder die Idee gegen b2.} "
                "Qb3 c4 {Gewinnt Raum mit Tempo: Die weiße Dame muss weg.} "
                "Qc2 {Die Dame zieht sich zurück.} "
                "Bf5 {Mit Tempo gegen die Dame. 8.Dxf5? Dxb2 verliert für Weiß: Der Sf6 deckt d5, und Ta1 und "
                "Sb1 hängen.} "
                "Qc1 {Die Dame muss weiter weg.} "
                "e6 {Öffnet den Lf8 und stützt d5.} "
                "Nbd2 h6 {Ein Fluchtfeld für den Lf5 auf h7 und keine Ideen mit Sh4 oder Lg5.}",
         "plan": "Spiele …Le7, …O-O und dann …b5–b4 am Damenflügel. Dein Bauer c4 gibt dir dort Raum. "
                 "Kommt Weiß mit e4, nimmst du mit …dxe4 und hast Druck auf d4."},
        {"id": "b-lon-nbd2", "name": "2.Lf4 c5 3.e3 Sc6 4.Sf3 Sf6 5.Sbd2 cxd4 6.exd4 Lf5", "frequency": "mittel",
         "pgn": "d4 d5 Bf4 c5 e3 Nc6 "
                "Nf3 {Weiß entwickelt.} "
                "Nf6 {Jetzt ist es dieselbe Stellung wie nach 2.Sf3 Sf6 3.Lf4 c5 4.e3 Sc6.} "
                "Nbd2 {Weiß verzichtet auf c3.} "
                "cxd4 {Tauschen: Weiß muss mit dem e-Bauern zurückschlagen, der Lf4 bleibt außen vor.} "
                "exd4 Bf5 {Der Läufer kommt aktiv vor die Bauernkette.} "
                "c3 e6 {Läufer f8 frei, d5 gestützt.} "
                "Bb5 Nd7 {Der Springer macht Platz für …Le7 und deckt e5.}",
         "plan": "Spiele …Le7, …O-O und …Tc8. Der Plan heißt Minoritätsangriff mit …b5–b4 gegen c3."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Andere 1.d4-Systeme
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-d4-systems", "group": G_D4, "priority": 2,
    "title": "Colle, Torre, Blackmar-Diemer, 2.Sc3, 2.Lg5",
    "intro": "Gegen die Nebensysteme nach 1.d4 d5 reicht ein einfacher Aufbau: Springer nach f6, Bauer nach e6 "
             "oder c5 und der Gegenschlag …c5 gegen d4. Fehlt der weiße Damenläufer am Damenflügel, prüfst du "
             "jedes Mal …Db6 gegen b2.",
    "ideas": [
        "Colle (e3, Ld3, c3): …c5, …Sc6, …Ld6 und rochieren. Weiß will e4, dann tauschst du im Zentrum.",
        "Torre (Lg5): …h6 fragt den Läufer, …cxd4 und …Db6 greifen b2 an.",
        "Blackmar-Diemer (2.e4): Nimm den Bauern, entwickle schnell und gib ihn nur zurück, wenn es Zeit "
        "spart.",
        "2.Sf3 Sf6 3.c4 e6 führt ins Damengambit, das du schon kennst.",
    ],
    "lines": [
        {"id": "b-sys-colle", "name": "2.Sf3 Sf6 3.e3 e6 4.Ld3 c5 5.c3 Sc6 (Colle)", "frequency": "mittel",
         "pgn": "d4 d5 Nf3 Nf6 "
                "e3 {Das Colle-System: Weiß baut ruhig auf und will später e4.} "
                "e6 {Solide: Der Lf8 wird frei.} "
                "Bd3 c5 {Der Gegenschlag gegen d4.} "
                "c3 Nc6 {Entwickeln und d4 weiter angreifen.} "
                "Nbd2 Bd6 {Der Läufer kontrolliert e5, wo Weiß gern einen Springer hinstellt.} "
                "O-O O-O {König in Sicherheit.} "
                "dxc5 {Weiß bereitet e4 vor.} "
                "Bxc5 {Zurückschlagen, der Läufer steht aktiv.} "
                "e4 Qc7 {Die Dame zielt auf e5 und h2 und stellt sich auf die c-Linie.}",
         "plan": "Nach exd5 schlägst du mit …exd5 zurück und hast aktive Figuren. Ziele: …Lg4, …Tad8 und Druck "
                 "auf der e-Linie."},
        {"id": "b-sys-torre", "name": "2.Sf3 Sf6 3.Lg5 e6 4.e3 c5 5.Sbd2 h6 (Torre)", "frequency": "selten",
         "pgn": "d4 d5 Nf3 Nf6 "
                "Bg5 {Torre-Angriff: Der Läufer fesselt den Sf6.} "
                "e6 {Entfesseln über …Le7 ist möglich, und d5 ist fest.} "
                "e3 c5 {Gegen d4, wie immer.} "
                "Nbd2 h6 {Frag den Läufer.} "
                "Bh4 cxd4 {Erst tauschen.} "
                "exd4 Qb6 {Die Dame greift b2 an: Der weiße Läufer ist am Königsflügel und fehlt dort.} "
                "Rb1 Nc6 {Entwickeln mit Druck auf d4.}",
         "plan": "Spiele …Le7, …O-O und …Ld7. Achte bei Lxf6 darauf, mit dem Läufer zurückzuschlagen, dann "
                 "hast du das Läuferpaar."},
        {"id": "b-sys-c4", "name": "2.Sf3 Sf6 3.c4 e6 4.Sc3 Le7 (Damengambit)", "frequency": "mittel",
         "pgn": "d4 d5 Nf3 Nf6 "
                "c4 {Jetzt doch das Damengambit.} "
                "e6 {Wie gegen 2.c4: Das Zentrum steht fest. Das ist Damengambit abgelehnt.} "
                "Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6",
         "plan": "Spiele …Lb7, …Sbd7 und …c5. Tausche bei Gelegenheit mit …Se4 die Leichtfiguren."},
        {"id": "b-sys-bdg", "name": "2.e4 dxe4 3.Sc3 Sf6 4.f3 exf3 5.Sxf3 c6 (Blackmar-Diemer)",
         "frequency": "selten",
         "pgn": "d4 d5 "
                "e4 {Das Blackmar-Diemer-Gambit: Weiß opfert einen Bauern.} "
                "dxe4 {Nimm ihn.} "
                "Nc3 Nf6 {Entwickeln und e4 halten.} "
                "f3 {Weiß opfert den Bauern wirklich.} "
                "exf3 {Annehmen: Du hast einen Bauern mehr.} "
                "Nxf3 c6 {Kontrolliert d5 und b5 und gibt der Dame das Feld a5 oder b6.} "
                "Bc4 Bf5 {Aktive Entwicklung vor die Bauernkette.} "
                "O-O e6 {Schließt den Lc4 aus und macht den Lf8 frei. Danach …Le7 und …O-O.}",
         "plan": "Rochiere schnell (…Le7, …O-O, …Sbd7). Der weiße Druck auf f7 lässt nach, wenn du "
                 "entwickelt bist, dann zählt dein Mehrbauer."},
        {"id": "b-sys-nc3", "name": "2.Sc3 Sf6 3.Lg5 c5 4.e3 e6 (Veresov)", "frequency": "selten",
         "pgn": "d4 d5 "
                "Nc3 {Der Springer steht vor dem c-Bauern. Weiß will e4.} "
                "Nf6 {Kontrolliert e4.} "
                "Bg5 {Veresov-Angriff.} "
                "c5 {Gegen d4: Ohne c-Bauern kann Weiß d4 nicht mit c3 stützen.} "
                "e3 e6 {Stützt d5 und öffnet den Lf8.} "
                "Nf3 Be7 {Entfesselt den Sf6.} "
                "Bd3 Nc6 {Druck auf d4.} O-O O-O {König in Sicherheit.}",
         "plan": "Spiele …b6 und …Lb7 oder …c4 mit Raum am Damenflügel. Gegen 3.Lf4 hilft derselbe Plan: …c5, "
                 "…e6, …Sc6."},
        {"id": "b-sys-bg5", "name": "2.Lg5 h6 3.Lh4 c5 4.e3 cxd4 5.exd4 Sc6 6.c3 Db6", "frequency": "selten",
         "pgn": "d4 d5 "
                "Bg5 {Der Läufer greift e7 an und will …Sf6 fesseln.} "
                "h6 {Frag den Läufer sofort.} "
                "Bh4 c5 {Gegen d4.} "
                "e3 cxd4 {Tauschen, der Lh4 fehlt am Damenflügel.} "
                "exd4 Nc6 {Druck auf d4.} "
                "c3 Qb6 {Greift b2 an.} "
                "Qb3 Bf5 {Entwickeln. Nach Dxb6 axb6 hast du die offene a-Linie.}",
         "plan": "Spiele …e6, …Sf6 und …Ld6. Tauscht Weiß die Damen, nutzt du die offene a-Linie."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Englisch, Réti, Königsindischer Angriff
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-english-reti", "group": G_FLANK, "priority": 2,
    "title": "1.c4 und 1.Sf3: …e6 und …d5",
    "intro": "Gegen 1.c4 und 1.Sf3 spielst du denselben Aufbau wie gegen 1.d4: Bauern auf d5 und e6, Springer "
             "f6, Läufer e7, kurze Rochade. Zieht Weiß d4, landest du im Damengambit.",
    "ideas": [
        "Gegen 1.c4 erst 1…e6, dann …d5: Du vermeidest Sc3 mit Druck auf d5 und kommst sicher ins Zentrum.",
        "Gegen g3/Lg2 (Réti, Katalanisch-Aufbau): …Le7, …O-O, dann …c5 und …Sc6.",
        "Gegen den Königsindischen Angriff (d3, e4): …c5, …Sc6 und Raum am Damenflügel mit …b5.",
    ],
    "lines": [
        {"id": "b-eng-nc3-exch", "name": "1.c4 e6 2.Sc3 d5 3.cxd5 exd5 4.d4 Sf6 5.Lg5 Le7", "frequency": "mittel",
         "pgn": "c4 {Englisch.} "
                "e6 {Bereitet …d5 vor. Zieht Weiß d4, bist du im Damengambit.} "
                "Nc3 d5 {Das Zentrum besetzen.} "
                "cxd5 exd5 {Mit dem e-Bauern zurück, der Lc8 bekommt Luft.} "
                "d4 Nf6 {Entwickeln. Das ist die Abtauschvariante des Damengambits.} "
                "Bg5 Be7 {Entfesselt den Sf6.} "
                "e3 O-O {König in Sicherheit.}",
         "plan": "Wie in der Abtauschvariante: …c6, …Sbd7, …Te8 und …Sf8. Der Lc8 kommt nach f5 oder g4."},
        {"id": "b-eng-nf3-g3", "name": "1.c4 e6 2.Sf3 d5 3.g3 Sf6 4.Lg2 Le7 5.O-O O-O 6.b3 c5", "frequency": "mittel",
         "pgn": "c4 e6 "
                "Nf3 d5 {Zentrum.} "
                "g3 Nf6 {Entwickeln.} "
                "Bg2 Be7 {Solide: Der König kommt schnell in Sicherheit.} "
                "O-O O-O {König in Sicherheit.} "
                "b3 c5 {Raum im Zentrum. Das funktioniert genauso nach 1.Sf3 d5 2.c4 e6 3.g3.} "
                "Bb2 Nc6 {Druck auf d4 und e5.}",
         "plan": "Spiele …b6 und …Lb7 und stell die Türme nach c8 und d8. Nimmt Weiß auf d5, schlägst du mit "
                 "dem e-Bauern zurück."},
        {"id": "b-reti-kia", "name": "1.Sf3 d5 2.g3 Sf6 3.Lg2 e6 4.O-O Le7 5.d3 O-O 6.Sbd2 c5 7.e4 Sc6",
         "frequency": "mittel",
         "pgn": "Nf3 {Réti. Nach 2.d4 Sf6 bist du im 1.d4-Repertoire.} "
                "d5 {Nimm das Zentrum.} "
                "g3 Nf6 {Entwickeln. Nach 1.g3 d5 2.Lg2 Sf6 3.Sf3 ist es dieselbe Stellung.} "
                "Bg2 e6 {Solide Kette d5–e6.} "
                "O-O Be7 {Bereitet die Rochade vor.} "
                "d3 {Weiß will den Königsindischen Angriff mit e4.} "
                "O-O {König in Sicherheit.} "
                "Nbd2 c5 {Raum am Damenflügel.} "
                "e4 Nc6 {Entwickeln und d4 kontrollieren.}",
         "plan": "Spiele …b5–b4 und …Lb7 am Damenflügel. Weiß greift mit e5 und Sh4–f4 am Königsflügel an, "
                 "darum musst du dort schnell sein."},
    ],
})

# ---------------------------------------------------------------------------------------------
# 1.e3, 1.f4, sonstige
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-flank-other", "group": G_FLANK, "priority": 2,
    "title": "1.e3, 1.f4, 1.b3 und 1.Sc3",
    "intro": "1.e3 kam in deinen Partien 14-mal vor. Gegen alle diese Züge besetzt du mit 1…d5 das Zentrum und "
             "entwickelst normal. Zieht Weiß d4, bist du im 1.d4-Repertoire. Gegen 1.f4 (Bird) stellst du den "
             "Läufer nach g7, weil die lange Diagonale nach e3 und f4 offen ist.",
    "ideas": [
        "1.e3 d5 2.d4: Weiß spielt Colle oder Stonewall. …c5 und …Sc6 greifen d4 an.",
        "Gegen den Stonewall (f4 und d4 mit Ld3): Der Lc8 kommt nach g4 oder f5, bevor …e6 ihn einsperrt.",
        "Gegen 1.f4: …Sf6, …g6, …Lg7, …O-O und …c5.",
        "Gegen 1.b3 und Lb2: …Sf6, …e6, …Le7 und …c5. Der Bauer d5 nimmt dem Lb2 die Wirkung.",
    ],
    "lines": [
        {"id": "b-e3-stonewall", "name": "1.e3 d5 2.d4 Sf6 3.Ld3 c5 4.c3 Sc6 5.f4 Lg4", "frequency": "mittel",
         "pgn": "e3 {Ein ruhiger erster Zug.} "
                "d5 {Nimm das Zentrum.} "
                "d4 {Jetzt ist es eine 1.d4-Eröffnung.} "
                "Nf6 {Entwickeln. Nach 3.Sf3 e6 bist du im Colle-Kapitel.} "
                "Bd3 c5 {Gegen d4.} "
                "c3 Nc6 {Noch mehr Druck auf d4.} "
                "f4 {Der Stonewall: Weiß will Se5 und einen Angriff am Königsflügel.} "
                "Bg4 {Der Läufer kommt heraus, bevor …e6 ihn einsperrt.} "
                "Nf3 e6 {Jetzt erst …e6. Der Lf8 wird frei.}",
         "plan": "Tausche den Lg4 gegen den Sf3, wenn Weiß Se5 vorbereitet. Spiele …Ld6, …O-O und …Tc8 mit "
                 "Druck auf der c-Linie."},
        {"id": "b-e3-b3", "name": "1.e3 d5 2.b3 Sf6 3.Lb2 e6 4.Sf3 Le7 5.c4 O-O", "frequency": "mittel",
         "pgn": "e3 d5 "
                "b3 {Der Läufer kommt nach b2.} "
                "Nf6 {Entwickeln.} "
                "Bb2 e6 {Solide Kette d5–e6.} "
                "Nf3 Be7 {Bereitet die Rochade vor.} "
                "c4 O-O {König in Sicherheit.}",
         "plan": "Spiele …c5 und …Sc6 oder …b6 und …Lb7. Nimmt Weiß auf d5, schlägst du mit dem e-Bauern "
                 "zurück."},
        {"id": "b-bird", "name": "1.f4 d5 2.Sf3 Sf6 3.e3 g6 4.Le2 Lg7 5.O-O O-O 6.d3 c5", "frequency": "mittel",
         "pgn": "f4 {Bird-Eröffnung: Weiß kontrolliert e5.} "
                "d5 {Nimm das Zentrum.} "
                "Nf3 Nf6 {Entwickeln.} "
                "e3 g6 {Der Läufer kommt auf die lange Diagonale, die nach e3 und f4 offen ist.} "
                "Be2 Bg7 {Der Läufer zielt auf b2.} "
                "O-O O-O {König in Sicherheit.} "
                "d3 c5 {Raum am Damenflügel.}",
         "plan": "Spiele …Sc6, …b6 und …Lb7. Will Weiß mit e4 öffnen, hältst du mit …d4 oder …dxe4 dagegen."},
        {"id": "b-larsen", "name": "1.b3 d5 2.Lb2 Sf6 3.Sf3 e6 4.g3 Le7 5.Lg2 O-O 6.O-O c5", "frequency": "selten",
         "pgn": "b3 {Larsen-Eröffnung.} "
                "d5 {Das Zentrum besetzen. Der Bauer d5 bremst den Lb2.} "
                "Bb2 Nf6 {Entwickeln.} "
                "Nf3 e6 {Solide Kette d5–e6.} "
                "g3 Be7 {Bereitet die Rochade vor.} "
                "Bg2 O-O {König in Sicherheit.} "
                "O-O c5 {Raum im Zentrum.}",
         "plan": "Spiele …Sc6, …b6 und …Lb7. Das ist wie gegen Réti, nur mit vertauschter Zugfolge."},
        {"id": "b-nc3-e4", "name": "1.Sc3 d5 2.e4 d4 3.Sce2 e5 4.Sg3 Le6", "frequency": "selten",
         "pgn": "Nc3 {Der Springer kommt zuerst. Nach 2.d4 Sf6 bist du im 1.d4-Repertoire.} "
                "d5 {Zentrum.} "
                "e4 {Weiß bietet einen Bauern an.} "
                "d4 {Vertreib den Springer und gewinne Raum.} "
                "Nce2 e5 {Stützt d4.} "
                "Ng3 Be6 {Entwickeln und den Weg f1–c4 kontrollieren.}",
         "plan": "Spiele …c5, …Sc6 und …Ld6. Du hast mehr Raum im Zentrum, Weiß hat mit den Springern Zeit "
                 "verloren."},
    ],
})
