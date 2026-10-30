"""Quelle für app/data/repertoire_black.json (Modul 3, Repertoire Schwarz).

Format je Linie: "pgn" = englische SAN ab Grundstellung, Notiz in {…} direkt hinter dem Zug, zu dem sie gehört.
Fehlt einer Linie die Notiz zu einem Zug, übernimmt b_build.py sie aus einer anderen Linie mit gleicher
Stellung + gleichem Zug. Bauen: .venv/bin/python -I data/test/b_build.py
"""

G_E4 = "Schwarz: 1.e4 e5"
G_D4 = "Schwarz: gegen 1.d4"
G_OTHER = "Schwarz: andere erste Züge"

CHAPTERS = []

# ---------------------------------------------------------------------------------------------
# 1.e4 e5 2.Sf3 Sc6 3.Lc4 Lc5
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-italian", "group": G_E4, "priority": 1,
    "title": "Italienisch: 3…Lc5 (Giuoco Piano)",
    "intro": "Gegen 1.e4 spielst du 1…e5 und nach 2.Sf3 jetzt immer 2…Sc6 statt 2…Sf6. Mit 2…Sf6 hast du in "
             "deinen Rapidpartien nur 38 % geholt, oft nach 3.Sxe5 oder 3.Lc4 Sc6 4.Sg5. Nach 2…Sc6 3.Lc4 "
             "folgt 3…Lc5: Der Läufer steht aktiv und zielt wie der weiße auf f2, der Fried-Liver-Angriff "
             "(4.Sg5 gegen 3…Sf6) ist damit vom Tisch. Die Pläne sind einfach: …Sf6, …d6, kurz rochieren, "
             "dann …a6/…La7 und …h6.",
    "ideas": [
        "Ruhige Stellungen (c3/d3): …Sf6, …d6, …O-O, dann …a6 und …La7, damit der Läufer d4 und b4 übersteht.",
        "…h6 nimmt Weiß das Feld g5 (keine Fesselung Lg5, kein Sg5).",
        "Kommt d4 mit e5-Angriff auf den Sf6, ist …d5 fast immer die richtige Antwort.",
        "In offenen Stellungen mit weißem Isolani (d4 allein): Blockade mit einem Springer auf d5.",
        "Typischer Fehler: …Sxe4 schlagen, ohne zu prüfen, ob Weiß danach mit Te1 oder d4 die Figur zurückholt.",
    ],
    "lines": [
        {"id": "b-it-c3-d3", "name": "4.c3 Sf6 5.d3 d6 6.O-O O-O (Giuoco Pianissimo)", "frequency": "häufig",
         "pgn": "e4 e5 {Klassisch: Du stellst einen Bauern ins Zentrum und öffnest Dame und Läufer f8. Gegen 1.e4 "
                "spielst du immer 1…e5.} "
                "Nf3 Nc6 {Der Springer deckt e5 und entwickelt sich Richtung Zentrum. Gegen 2.Sf3 spielst du "
                "jetzt immer 2…Sc6.} "
                "Bc4 {Weiß zielt auf f7, den Punkt, den nur dein König deckt.} "
                "Bc5 {Giuoco Piano: Dein Läufer zielt genauso auf f2. Er steht aktiv und wird später von …d6 "
                "gestützt.} "
                "c3 {Weiß bereitet d4 vor, das deinen Läufer und e5 angreifen würde.} "
                "Nf6 {Entwickeln und den Bauern e4 angreifen. Jetzt muss Weiß sich entscheiden: ruhig mit d3 oder "
                "scharf mit d4.} "
                "d3 {Das ruhige Giuoco Pianissimo, auf deinem Niveau die häufigste Wahl.} "
                "d6 {Stützt e5 und öffnet den Läufer c8. Dein Zentrum steht jetzt fest.} "
                "O-O O-O {König in Sicherheit, der Turm f8 kommt später nach e8.} "
                "Re1 a6 {Schafft dem Läufer das Feld a7, damit er nach d4 oder b4 nicht abgetauscht oder vertrieben "
                "wird. Später ist auch …b5 möglich.} "
                "Bb3 Ba7 {Der Läufer zieht vorsorglich zurück: Auf a7 steht er sicher und zielt weiter auf f2, "
                "auch wenn Weiß d4 spielt.} "
                "h3 h6 {Nimmt dem weißen Läufer das Feld g5: Keine lästige Fesselung des Sf6 mehr. Ein typischer, "
                "nützlicher Wartezug in dieser ruhigen Struktur.}",
         "plan": "Entwickle mit …Le6 (bietet den Abtausch gegen Lb3 an) und …Te8. Spielt Weiß d4, hältst du e5 mit "
                 "…Te8 oder tauschst auf d4 und greifst e4 an. Gegen das Manöver Sbd2–f1–g3 hilft …Se7–g6. "
                 "Kein Grund zur Eile: Wer hier geduldig manövriert, steht gut."},
        {"id": "b-it-d4-bd2", "name": "4.c3 Sf6 5.d4 exd4 6.cxd4 Lb4+ 7.Ld2", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 "
                "d4 {Das scharfe Giuoco Piano: Weiß greift sofort dein Zentrum und den Lc5 an.} "
                "exd4 {Pflichtzug. Nach Rückzügen wie 5…Lb6 käme 6.dxe5 mit Tempo gegen den Sf6, und Weiß hätte "
                "freies Spiel.} "
                "cxd4 {Jetzt greift der Bauer d4 deinen Läufer an.} "
                "Bb4+ {Der Läufer entkommt mit Schach und zwingt Weiß zu einer Entscheidung: 7.Ld2 oder 7.Sc3.} "
                "Bd2 Bxd2+ {Tauschen ist einfach und gut. Weiß verliert seinen schwarzfeldrigen Läufer.} "
                "Nbxd2 d5 {Der wichtigste Befreiungszug: Du greifst das weiße Zentrum an, bevor e5 deinen Springer "
                "vertreibt. Merke: In offenen Stellungen immer an …d5 denken.} "
                "exd5 Nxd5 {Der Springer steht auf d5 zentral und stark. Weiß hat jetzt einen isolierten Bauern "
                "auf d4, ein Ziel für das ganze Spiel.} "
                "Qb3 {Weiß erhöht den Druck auf d5.} "
                "Nce7 {Deckt den Sd5 ein zweites Mal. Der Bauer b7 ist durch den Lc8 gedeckt: 10.Dxb7?? Lxb7.} "
                "O-O O-O {Beide Könige sind sicher, du bist fertig entwickelt.}",
         "plan": "Blockiere den Isolani: Springer auf d5 halten, …c6 und …Sf5 machen d4 zum Ziel. Gegen Se4–c5 "
                 "oder Lxd5 tauschst du ruhig ab, das Endspiel gegen einen Isolani ist für dich angenehm."},
        {"id": "b-it-moller", "name": "4.c3 Sf6 5.d4 exd4 6.cxd4 Lb4+ 7.Sc3 (Møller-Angriff)", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ "
                "Nc3 {Weiß bietet den Bauern e4 an, um schnell anzugreifen.} "
                "Nxe4 {Nimm den Bauern. Der Springer greift sofort den Sc3 an.} "
                "O-O {Weiß opfert weiter und rochiert.} "
                "Bxc3 {Der Läufer nimmt auf c3. Damit hast du schon eine Figur und einen Bauern mehr.} "
                "d5 {Die Pointe: Weiß greift deinen Sc6 an, statt den Läufer auf c3 zurückzunehmen.} "
                "Bf6 {Der Läufer zieht nach f6 zurück, wo er deinen Königsflügel verteidigt.} "
                "Re1 {Jetzt hängt der Se4.} "
                "Ne7 {Der angegriffene Sc6 geht nach e7. Den Se4 gibst du dafür zurück, am Ende bleibt dir ein "
                "gesunder Mehrbauer.} "
                "Rxe4 d6 {Öffnet den Lc8 und hält den Mehrbauern. Als Nächstes kommen …O-O und …Sf5 oder …Lf5.}",
         "plan": "Nach 12.Lg5 tauschst du mit 12…Lxg5 13.Sxg5 und spielst dann 13…h6, das ist sicherer als die "
                 "sofortige Rochade. Danach rochierst du, bringst den Springer nach f5 und den Läufer nach f5 oder "
                 "d7. Mit einem Bauern mehr und sicherem König stehst du gut."},
        {"id": "b-it-e5-bb5", "name": "4.c3 Sf6 5.d4 exd4 6.e5 d5 7.Lb5", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 "
                "e5 {Weiß greift deinen Sf6 mit dem Bauern an.} "
                "d5 {Die beste Antwort: Gegenschlag im Zentrum. Der Lc4 wird angegriffen, und dein Springer bekommt "
                "das Feld e4.} "
                "Bb5 {Weiß fesselt den Sc6.} "
                "Ne4 {Der Springer springt ins Zentrum, auf e4 ist er durch d5 gedeckt.} "
                "cxd4 {Jetzt hängt dein Lc5.} "
                "Bb6 {Rückzug nach b6, wo der Läufer weiter auf d4 drückt.}",
         "plan": "Rochiere kurz, dann greifst du das weiße Zentrum mit …f6 oder …f5 an, oder du entwickelst mit "
                 "…Lg4 und erhöhst den Druck auf d4. Dein Springer auf e4 ist ein Prachtstück."},
        {"id": "b-it-e5-exf6", "name": "4.c3 Sf6 5.d4 exd4 6.e5 d5 7.exf6", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 e5 d5 "
                "exf6 {Weiß nimmt deinen Springer.} "
                "dxc4 {Und du nimmst den Läufer: Figur gegen Figur, du hast dazu das Läuferpaar und Bauern im "
                "Zentrum.} "
                "Qe2+ {Ein lästiges Schach.} "
                "Be6 {Blockt mit Entwicklung.} "
                "fxg7 Rg8 {Der Turm holt sich bald den Bauern g7.}",
         "plan": "Nach …Txg7 oder …Dd5 stehst du klar besser: Deine Bauern auf c4 und d4 drücken, die Läufer "
                 "sind stark. Die Engine sieht dich hier deutlich vorn."},
        {"id": "b-it-oo", "name": "4.O-O Sf6 5.d3 d6 6.c3 O-O", "frequency": "häufig",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 "
                "O-O {Weiß rochiert zuerst.} "
                "Nf6 {Wie immer: entwickeln und e4 angreifen.} "
                "d3 d6 {Stützt e5 und öffnet den Lc8.} "
                "c3 O-O {Dieselbe Stellung wie in der Hauptlinie nach 4.c3 Sf6 5.d3 d6 6.O-O O-O.}",
         "plan": "Weiter wie in der Hauptlinie: …a6 und …La7, …h6, dann …Te8 und …Le6. Erst denken, dann "
                 "schlagen: Nach 5.Sc3 wäre 5…Sxe4? schlecht, weil 6.Sxe4 d5 7.Lxd5 die Figur zurückgewinnt."},
        {"id": "b-it-nc3-bg5", "name": "4.Sc3 Sf6 5.d3 d6 6.Lg5 h6", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 "
                "Nc3 {Ein ruhiger Entwicklungszug.} "
                "Nf6 {Entwickeln und e4 angreifen.} "
                "d3 d6 {Stützt e5 und öffnet den Lc8.} "
                "Bg5 {Weiß fesselt deinen Sf6 an die Dame.} "
                "h6 {Frag den Läufer sofort, was er will. Nach 7.Lh4 ist auch …g5 möglich.} "
                "Bxf6 Qxf6 {Mit der Dame zurückschlagen hält deine Bauern gesund.} "
                "Nd5 {Der Springer greift deine Dame und c7 an.} "
                "Qd8 {Ruhig zurück: c7 ist gedeckt, und gegen Sd5 kommt später …Se7 oder …c6.}",
         "plan": "Rochiere, dann …Se7 tauscht den starken Sd5 ab, oder du vertreibst ihn mit …c6. Mit dem "
                 "Läuferpaar stehst du langfristig gut."},
        {"id": "b-it-evans", "name": "4.b4 Evansgambit: 4…Lxb4 5.c3 La5 6.d4 d6", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 "
                "b4 {Das Evansgambit: Weiß opfert einen Bauern für ein schnelles Zentrum mit c3 und d4.} "
                "Bxb4 {Nimm den Bauern ruhig an.} "
                "c3 Ba5 {Der Läufer bleibt aktiv und fesselt später den Bauern c3.} "
                "d4 d6 {Hält e5 und öffnet den Lc8. Das ist die solide Lasker-Idee: Material halten, Zentrum "
                "stützen.} "
                "Qb3 {Weiß zielt auf f7.} "
                "Qd7 {Deckt f7 und bereitet …Lb6 vor.} "
                "dxe5 Bb6 {Der Läufer stellt sich auf die Diagonale nach f2. Nach …Sa5 tauschst du den gefährlichen "
                "Lc4 ab.}",
         "plan": "Spiele …Sa5 gegen den Lc4, dann …Se7 und …O-O. Mit dem Mehrbauern und ohne den starken "
                 "weißen Läufer stehst du gut."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Fallen: 4.Sg5 und 4.Sxe5
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-italian-traps", "group": G_E4, "priority": 1,
    "title": "Italienisch: Sg5- und Sxe5-Versuche gegen 3…Lc5",
    "intro": "Auf deinem Niveau probiert Weiß gegen 3…Lc5 gern 4.Sg5 (wie gegen 3…Sf6) oder 4.Sxe5 mit der "
             "Gabel-Idee d4. Beides verliert eine Figur, wenn du genau antwortest. Hier lernst du die Strafen.",
    "ideas": [
        "4.Sg5? Dxg5! Der Springer ist ungedeckt, und deine Dame steht nach dem Schlagen aktiv.",
        "Nach Lxf7+ immer mit dem König zurückschlagen, wenn es sicher ist: Du hast dann zwei Figuren mehr.",
        "4.Sxe5? Sxe5 5.d4: Die Gabel hält nicht, weil 5…Lb4+ den Läufer rettet.",
        "Nach dem Figurengewinn: Dame in Sicherheit bringen, entwickeln, rochieren. Nicht gierig werden.",
    ],
    "lines": [
        {"id": "b-trap-ng5-bxf7", "name": "4.Sg5? Dxg5 5.Lxf7+ Kxf7", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 "
                "Ng5 {Falle! Weiß greift f7 an wie gegen 3…Sf6, aber der Springer auf g5 ist ungedeckt.} "
                "Qxg5 {Die Strafe: Die Dame nimmt den Springer. Gleichzeitig greift sie g2 an.} "
                "Bxf7+ {Weiß versucht, mit Schach etwas zu retten.} "
                "Kxf7 {Einfach zurückschlagen. Jetzt hast du zwei Figuren für einen Bauern.} "
                "d4 {Weiß greift mit Tempo den Lc5 und deine Dame an.} "
                "Qxg2 {Die Dame schlägt g2 und greift den Th1 an.} "
                "Rf1 Nxd4 {Der Springer nimmt d4 und kommt ins Spiel. Du hast zwei Figuren und einen Bauern "
                "mehr.}",
         "plan": "Entwickle schnell mit …Sf6, …d6 und …Le6, bring den König mit …Te8 oder …Tf8 und …Kg8 in "
                 "Sicherheit. Tausche Damen, wenn es geht: Mit so viel Material gewinnt das Endspiel von "
                 "allein."},
        {"id": "b-trap-ng5-d4", "name": "4.Sg5? Dxg5 5.d4 Dxg2", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 Ng5 Qxg5 "
                "d4 {Weiß greift gleichzeitig Dame (über den Lc1) und Lc5 an.} "
                "Qxg2 {Die Dame schlägt g2 mit Angriff auf den Th1. Den Lc5 kann Weiß wegen der Drohungen nicht "
                "in Ruhe nehmen.} "
                "Rf1 {Der Turm flieht.} "
                "Qxe4+ {Noch ein Bauer, mit Schach.} "
                "Be2 Nxd4 {Der Springer droht 8…Sxc2+ mit Gabel gegen König und Ta1.}",
         "plan": "Du hast eine Figur und drei Bauern mehr. Spiele …Sf6, …d6, …O-O und tausche ab. Achte nur auf "
                 "Schachs gegen deinen König auf der e-Linie."},
        {"id": "b-trap-nxe5-d4", "name": "4.Sxe5? Sxe5 5.d4 Lb4+", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 "
                "Nxe5 {Falle! Weiß opfert den Springer, um mit d4 Läufer und Springer zu gabeln.} "
                "Nxe5 {Nimm den Springer. Weiß hat nur einen Bauern dafür.} "
                "d4 {Die Gabel: d4 greift Lc5 und Se5 an.} "
                "Bb4+ {Rettet den Läufer mit Schach. Nicht 5…Lxd4? 6.Dxd4: Weiß hat die Figur zurück, und die Dame "
                "greift Se5 und g7 an.} "
                "c3 {Weiß greift den Läufer erneut an.} "
                "Nxc4 {Erst den Lc4 schlagen, dann den Läufer retten. Jetzt hast du eine Figur mehr.} "
                "cxb4 d5 {Öffnet den Lc8 und greift e4 an. Dein Vorteil: eine ganze Figur.}",
         "plan": "Entwickle mit …Se7, …O-O und …Lf5 oder …Le6. Sichere den Springer auf c4 (…b5 oder …Sd6) und "
                 "tausche Figuren. Eine Figur mehr gewinnt fast jede Partie."},
        {"id": "b-trap-nxe5-bxf7", "name": "4.Sxe5? Sxe5 5.Lxf7+ Sxf7", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Bc4 Bc5 Nxe5 Nxe5 "
                "Bxf7+ {Weiß opfert noch eine Figur und hofft auf 5…Kxf7 6.d4 mit Rückgewinn.} "
                "Nxf7 {Mit dem Springer schlagen! Jetzt gibt es keine Gabel mit d4 mehr, weil dein Springer nicht "
                "auf e5 steht. Du hast zwei Leichtfiguren für zwei Bauern.} "
                "d4 {Weiß greift den Läufer an.} "
                "Bb6 {Der Läufer geht nach b6 und bleibt auf der Diagonale.}",
         "plan": "Spiele …Sf6, …d6, …O-O. Mit zwei Leichtfiguren gegen zwei Bauern stehst du auf Gewinn."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Schäfermatt-Versuche: 2.Dh5, 2.Df3, 2.Lc4 + Dh5
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-scholar", "group": G_E4, "priority": 1,
    "title": "Schäfermatt-Versuche: 2.Dh5 und 2.Df3",
    "intro": "Weiß bringt Dame und Läufer früh gegen f7 und hofft auf Dxf7 matt. Das kam in deinen Partien "
             "immer wieder vor. Wenn du f7 sicher deckst, steht die weiße Dame bald im Weg, und du gewinnst mit "
             "Tempo gegen sie Zeit für deine Entwicklung. Merke dir vor allem die Fallen nach 5.g4?, 5.Db3? und "
             "Dg3?: Dort gewinnst du Material.",
    "ideas": [
        "Erst e5 decken (…Sc6), dann f7 schließen: …g6 gegen Dh5, …Sf6 gegen Df3.",
        "Steht die Dame auf f3 und der Läufer auf c4, ist f7 zweimal angegriffen: Nie …Sd4?? spielen, solange "
        "Df3xf7 matt möglich ist.",
        "Der Sd4 ist dein bester Freund: Er greift Dame und c2 an, sobald f7 sicher ist.",
        "Gegen Db3 (Angriff auf f7 und b7) hilft …Sd4!: Die Dame muss weg, und nach Lxf7+ Ke7 fängst du den "
        "Läufer.",
    ],
    "lines": [
        {"id": "b-sch-qh5-ne2", "name": "2.Dh5 Sc6 3.Lc4 g6 4.Df3 Sf6 5.Se2", "frequency": "häufig",
         "pgn": "e4 e5 "
                "Qh5 {Die Dame greift e5 und f7 an. Ein früher Damenausflug, aber gefährlich, wenn du nicht "
                "aufpasst.} "
                "Nc6 {Deckt e5 mit Entwicklung. Gedeckt ist e5 jetzt, f7 bisher nur vom König.} "
                "Bc4 {Jetzt droht Dxf7 matt!} "
                "g6 {Vertreibt die Dame und blockiert die Linie h5–f7. Nicht 3…Sf6?? 4.Dxf7 matt.} "
                "Qf3 {Die Dame zielt erneut auf f7.} "
                "Nf6 {Schließt die Linie f3–f7 mit Entwicklung. Jetzt ist f7 sicher.} "
                "Ne2 {Weiß entwickelt so, dass die Dame auf f3 bleiben kann.} "
                "Bg7 {Der Läufer steht im Fianchetto stark und deckt den Königsflügel.} "
                "Nbc3 d6 {Öffnet den Lc8 und stützt e5.} "
                "d3 Nd4 {Der Springer greift die Dame und c2 an. Weiß muss reagieren.} "
                "Nxd4 exd4 {Mit dem Bauern zurück: Jetzt wird der Sc3 angegriffen.}",
         "plan": "Nach 9.Se2 kommen …Lg4 (greift die Dame an) und …O-O. Die weiße Dame steht schlecht, du "
                 "entwickelst mit Tempo und stehst mindestens gleich."},
        {"id": "b-sch-qh5-g4", "name": "2.Dh5 Sc6 3.Lc4 g6 4.Df3 Sf6 5.g4? Sd4!", "frequency": "mittel",
         "pgn": "e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6 "
                "g4 {Falle! Weiß will mit g5 deinen Springer vertreiben und dann wieder Dxf7 spielen.} "
                "Nd4 {Die Strafe: Angriff auf Dame und c2. Die Dame muss weichen, und f7 bleibt sicher.} "
                "Qd1 {Die Dame zieht zurück und deckt c2.} "
                "d5 {Gegenschlag im Zentrum: Der Lc4 wird angegriffen, und nach exd5 nimmt dein Läufer auf g4.} "
                "exd5 Bxg4 {Gewinnt den Bauern g4 mit Angriff auf die Dame. Weiß steht schon fast verloren.}",
         "plan": "Bring den König mit …Lg7 und …O-O in Sicherheit und nutze die offenen Linien gegen den "
                 "weißen König. Ziele: f3, c2 und die Dame."},
        {"id": "b-sch-qh5-qb3", "name": "2.Dh5 Sc6 3.Lc4 g6 4.Df3 Sf6 5.Db3? Sd4!", "frequency": "mittel",
         "pgn": "e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6 "
                "Qb3 {Falle! Die Dame greift f7 zusammen mit dem Läufer an.} "
                "Nd4 {Die Strafe: Angriff auf die Dame. Nach Damenzug kann Weiß f7 nicht mehr nehmen.} "
                "Bxf7+ {Weiß nimmt trotzdem.} "
                "Ke7 {Der König geht nach e7 (nicht nach f8, wo er im Weg steht). Jetzt hängt die Dame, und der "
                "Läufer f7 ist gefangen.} "
                "Qc4 {Die Dame flieht und deckt den Läufer.} "
                "b5 {Vertreibt die Dame. Danach fällt der Lf7.} "
                "Qd3 Kxf7 {Du hast eine Figur gewonnen.}",
         "plan": "Bring den König mit …Kg7 oder …Lg7 und …Tf8 in Sicherheit und spiele …d5. Eine Figur mehr: "
                 "Jetzt einfach entwickeln und abtauschen."},
        {"id": "b-sch-qh5-nc3", "name": "2.Dh5 Sc6 3.Lc4 g6 4.Df3 Sf6 5.Sc3 Sd4", "frequency": "mittel",
         "pgn": "e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6 "
                "Nc3 {Weiß entwickelt den Springer und deckt e4.} "
                "Nd4 {Wieder greift der Springer Dame und c2 an.} "
                "Qd1 {Der beste Rückzug: Die Dame deckt c2.} "
                "Bg7 {Erst entwickeln und den König vorbereiten. Die weiße Dame hat zwei Tempi verloren.} "
                "d3 c6 {Bereitet …d5 vor und nimmt dem Lc4 die Zukunft.} "
                "Nge2 d5 {Der Befreiungszug: Du greifst Läufer und e4 an. Dein Zentrum ist stark.}",
         "plan": "Nach exd5 cxd5 hast du ein großes Zentrum. Rochiere, dann …Lg4 oder …b5 gegen den Läufer. Du "
                 "stehst bequem besser."},
        {"id": "b-sch-qf3-nc3", "name": "2.Df3 Sc6 3.Lc4 Sf6 4.Sc3 Sd4 5.Dg3? Sxc2+", "frequency": "mittel",
         "pgn": "e4 e5 "
                "Qf3 {Die Dame zielt auf f7, verstellt aber dem Springer das Feld f3.} "
                "Nc6 {Deckt e5. Gegen Df3 ist f7 noch nicht in Gefahr.} "
                "Bc4 {Jetzt droht Dxf7 matt!} "
                "Nf6 {Schließt die Linie f3–f7. Achtung: 3…Sd4?? verliert sofort durch 4.Dxf7 matt.} "
                "Nc3 {Weiß entwickelt.} "
                "Nd4 {Jetzt ist f7 sicher, also darf der Springer nach d4: Angriff auf Dame und c2.} "
                "Qg3 {Falle! Die Dame greift e5 und g7 an, aber vergisst c2.} "
                "Nxc2+ {Gabel: Schach und Angriff auf den Ta1.} "
                "Kd1 Nxa1 {Du gewinnst den Turm.}",
         "plan": "Nach Dxe5+ schützt …Le7 deinen König. Rochiere, dann holst du den Springer aus der Ecke "
                 "(…b6 und …Lb7) oder tauschst ihn teuer gegen eine Figur. Mit einem Turm mehr gewinnst du."},
        {"id": "b-sch-bc4-qh5", "name": "2.Lc4 Sc6 3.Dh5 g6 4.Df3 Sf6", "frequency": "mittel",
         "pgn": "e4 e5 "
                "Bc4 {Läuferspiel: Weiß zielt sofort auf f7.} "
                "Nc6 {Entwickeln und e5 decken. Mit 2…Sc6 kommst du nach 3.Sf3 Lc5 in dein Italienisch.} "
                "Qh5 g6 Qf3 Nf6 "
                "Ne2 Bg7 {Dieselbe Stellung wie nach 2.Dh5 Sc6 3.Lc4 g6 4.Df3 Sf6 5.Se2 Lg7.}",
         "plan": "Weiter wie in der Linie 2.Dh5: …d6, …Sd4 mit Tempo gegen die Dame, dann …O-O."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Wiener Partie und Läuferspiel
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-vienna", "group": G_E4, "priority": 1,
    "title": "Wiener Partie (2.Sc3) und Läuferspiel (2.Lc4)",
    "intro": "Gegen 2.Sc3 spielst du 2…Sf6. Kommt das Wiener Gambit 3.f4, antwortest du mit dem Gegenschlag "
             "3…d5: Dein Springer springt nach e4, und das weiße Spiel am Königsflügel verpufft. Gegen 3.Lc4 "
             "entwickelst du mit 3…Sc6 und …Lc5, wie im Italienisch. Gegen 2.Lc4 spielst du 2…Sc6: Nach 3.Sf3 "
             "bist du direkt in deiner Italienisch-Stellung.",
    "ideas": [
        "Gegen f4 immer an …d5 denken: Öffnet das Zentrum, während der weiße König noch auf e1 steht.",
        "Der Springer auf e4 ist stark. Tausche ihn erst, wenn Weiß ihn angreift.",
        "Gegen Df3 im Wiener Gambit: …Sc6 und …Dh4+ nutzen den offenen weißen Königsflügel.",
        "Gegen Lc4 + d3 + f4: …d6 und …Lg4, dann den Springer f3 abtauschen und e4 schwächen.",
    ],
    "lines": [
        {"id": "b-vi-f4-nf3", "name": "2.Sc3 Sf6 3.f4 d5 4.fxe5 Sxe4 5.Sf3", "frequency": "mittel",
         "pgn": "e4 e5 "
                "Nc3 {Die Wiener Partie: Weiß deckt e4 und will oft f4 spielen.} "
                "Nf6 {Entwickeln und e4 angreifen.} "
                "f4 {Das Wiener Gambit.} "
                "d5 {Der Gegenschlag: Statt f4 zu nehmen, öffnest du das Zentrum.} "
                "fxe5 Nxe4 {Der Springer steht zentral und ist durch d5 gedeckt.} "
                "Nf3 Be7 {Entwickeln und rochieren vorbereiten. Ruhig und solide.} "
                "d4 O-O {König in Sicherheit.} "
                "Bd3 f5 {Stützt den Springer auf e4. Weiß kann ihn jetzt nicht mehr einfach vertreiben.} "
                "exf6 Bxf6 {Mit dem Läufer zurück: Die f-Linie ist offen für deinen Turm.}",
         "plan": "Spiele …Sc6, …Lg4 und …Dd6 oder …De7. Druck auf d4 und auf der f-Linie. Gleiche Stellung mit "
                 "aktiven Figuren für dich."},
        {"id": "b-vi-f4-qf3", "name": "2.Sc3 Sf6 3.f4 d5 4.fxe5 Sxe4 5.Df3", "frequency": "selten",
         "pgn": "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 "
                "Qf3 {Weiß greift den Springer e4 ein zweites Mal an.} "
                "Nc6 {Greift e5 an und bereitet …Sd4 vor. Nimmt Weiß mit 6.Sxe4, kommt 6…Sd4! mit Angriff auf Dame "
                "und c2, und erst danach …dxe4.} "
                "Bb5 {Weiß fesselt den Springer.} "
                "Nxc3 {Tauscht den Angreifer ab.} "
                "dxc3 Qh4+ {Schach! Der weiße Königsflügel ist offen.} "
                "g3 Qe4+ {Erzwingt den Damentausch in angenehmer Stellung.}",
         "plan": "Nach dem Damentausch spielst du …Ld7, …O-O-O und …Lc5. Weiß hat zerrissene Bauern, du stehst "
                 "bequem."},
        {"id": "b-vi-f4-d3", "name": "2.Sc3 Sf6 3.f4 d5 4.d3 exf4", "frequency": "selten",
         "pgn": "e4 e5 Nc3 Nf6 f4 d5 "
                "d3 {Weiß hält e4 mit einem Bauern.} "
                "exf4 {Jetzt nimmst du f4: Das weiße Zentrum wackelt.} "
                "Bxf4 Bb4 {Fesselt den Sc3, der e4 deckt. Danach droht …dxe4.}",
         "plan": "Rochiere und spiele …Te8 gegen den König auf der e-Linie. Weiß hat Probleme mit e4."},
        {"id": "b-vi-bc4", "name": "2.Sc3 Sf6 3.Lc4 Sc6 4.d3 Lc5 5.f4 d6", "frequency": "mittel",
         "pgn": "e4 e5 Nc3 Nf6 "
                "Bc4 {Weiß zielt auf f7.} "
                "Nc6 {Solide: Der Springer deckt e5.} "
                "d3 Bc5 {Wie im Italienisch: aktiver Läufer gegen f2.} "
                "f4 {Weiß greift e5 an.} "
                "d6 {Hält e5 fest und öffnet den Lc8.} "
                "Nf3 Bg4 {Fesselt den Springer, der e5 angreift.} "
                "h3 Bxf3 {Tauscht den Verteidiger ab.} "
                "Qxf3 Nd4 {Der Springer springt mit Tempo gegen die Dame ins Zentrum.}",
         "plan": "Spiele …c6, …b5 und …O-O. Dein Springer auf d4 ist stark, und der weiße Königsflügel ist "
                 "durch f4 geschwächt."},
        {"id": "b-vi-bishop", "name": "2.Lc4 Sc6 3.d3 Sf6 4.Sf3 Lc5", "frequency": "mittel",
         "pgn": "e4 e5 Bc4 Nc6 "
                "d3 Nf6 {Entwickeln und e4 angreifen.} "
                "Nf3 Bc5 {Jetzt steht genau die Italienisch-Stellung nach 3…Lc5 4.d3 Sf6 auf dem Brett.} "
                "c3 d6 O-O O-O",
         "plan": "Das ist die Hauptlinie deines Italienisch. Weiter mit …a6, …La7, …h6 und …Te8."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Mittelgambit, Nordisch
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-center", "group": G_E4, "priority": 1,
    "title": "Mittelgambit (2.d4) und Nordisches Gambit",
    "intro": "Gegen 2.d4 nimmst du mit 2…exd4. Schlägt die Dame zurück (Mittelgambit), vertreibst du sie mit "
             "3…Sc6 und gewinnst Entwicklungszeit. Gegen das Nordische Gambit 3.c3 gibst du den Bauern mit "
             "3…d5 sofort zurück und bekommst freies Spiel. Gegen 3.Sf3 spielst du 3…Sc6 und bist im "
             "Schottisch.",
    "ideas": [
        "Die weiße Dame im Zentrum ist ein Ziel: …Sc6, …Sf6, …Lb4 mit Tempo.",
        "Nach weißer langer Rochade: …Te8 und Druck auf e4. Achte auf den Trick …Sxe4.",
        "Im Nordischen Gambit: …d5 und schnell rochieren statt Bauern festhalten.",
    ],
    "lines": [
        {"id": "b-cg-qe3-bc4", "name": "2.d4 exd4 3.Dxd4 Sc6 4.De3 Sf6 5.Sc3 Lb4 6.Ld2 O-O 7.O-O-O Te8 8.Lc4",
         "frequency": "mittel",
         "pgn": "e4 e5 "
                "d4 {Weiß öffnet sofort das Zentrum.} "
                "exd4 {Nimm den Bauern. Danach muss Weiß ihn zurückholen.} "
                "Qxd4 {Das Mittelgambit: Die Dame schlägt zurück und steht früh im Zentrum.} "
                "Nc6 {Entwickeln mit Tempo: Die Dame muss wieder ziehen.} "
                "Qe3 {Der übliche Rückzug.} "
                "Nf6 {Entwickeln und e4 angreifen.} "
                "Nc3 Bb4 {Fesselt den Sc3, den einzigen Verteidiger von e4.} "
                "Bd2 O-O {König in Sicherheit, der Turm kommt nach e8.} "
                "O-O-O Re8 {Druck auf e4 und auf der e-Linie gegen die Dame.} "
                "Bc4 d6 {Stützt den Läufer, öffnet den Lc8. Bereit für …Le6 und …Sa5.}",
         "plan": "Spiele …Le6 gegen den Lc4 oder …Sa5. Behalte e4 im Blick: Wird der Sc3 abgelenkt, fällt der "
                 "Bauer. Du stehst bequem und hast Gegenspiel am Damenflügel mit …a5–a4."},
        {"id": "b-cg-qe3-qg3", "name": "… 8.Dg3? Sxe4!", "frequency": "selten",
         "pgn": "e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6 Nc3 Bb4 Bd2 O-O O-O-O Re8 "
                "Qg3 {Falle! Weiß greift g7 an, lässt aber e4 ohne Schutz.} "
                "Nxe4 {Der Springer nimmt e4: Du greifst den Bauern zweimal an (Sf6 und Te8), Weiß deckt ihn nur "
                "mit dem Sc3.} "
                "Nxe4 Rxe4 {Der Turm schlägt zurück. Du hast einen Bauern gewonnen.} "
                "Bxb4 Rxb4 {Auch die Läufer sind getauscht, dein Mehrbauer bleibt.}",
         "plan": "Bring den Turm b4 zurück (…Tb6 oder …Te4), spiele …d6 und …Le6. Mit dem Mehrbauern und "
                 "guter Entwicklung stehst du besser."},
        {"id": "b-cg-qd1", "name": "2.d4 exd4 3.Dxd4 Sc6 4.Dd1 Sf6 5.Sc3 Lb4 6.Ld3 d5", "frequency": "mittel",
         "pgn": "e4 e5 d4 exd4 Qxd4 Nc6 "
                "Qd1 {Die Dame geht ganz zurück. Weiß hat zwei Tempi verloren.} "
                "Nf6 {Greift sofort e4 an.} "
                "Nc3 Bb4 {Fesselt den Sc3, jetzt ist e4 schwach.} "
                "Bd3 d5 {Öffne das Zentrum, solange der weiße König noch in der Mitte steht.}",
         "plan": "Nach exd5 nimmt die Dame zurück (…Dxd5), dann …Lg4 und …O-O-O oder …O-O. Du bist viel "
                 "besser entwickelt."},
        {"id": "b-cg-nordic", "name": "2.d4 exd4 3.c3 d5 (Nordisches Gambit)", "frequency": "mittel",
         "pgn": "e4 e5 d4 exd4 "
                "c3 {Das Nordische Gambit: Weiß opfert Bauern für schnelle Entwicklung.} "
                "d5 {Die einfachste Antwort: Gegenschlag im Zentrum, du gibst den Bauern zurück.} "
                "exd5 Qxd5 {Die Dame steht zentral, und Weiß kann sie mit Sc3 nicht angreifen, weil c3 besetzt "
                "ist.} "
                "cxd4 Nc6 {Entwickeln mit Druck auf d4.} "
                "Nf3 Bg4 {Fesselt den Verteidiger von d4.} "
                "Be2 Bb4+ {Schach mit Entwicklung.} "
                "Nc3 Bxf3 {Tauscht den Verteidiger von d4 ab.} "
                "Bxf3 Qc4 {Greift d4 an und verhindert die kurze Rochade: Die Dame kontrolliert f1.}",
         "plan": "Spiele …O-O-O und …Sge7, dann Druck auf d4. Der isolierte weiße d-Bauer ist dein Ziel."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Schottisch
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-scotch", "group": G_E4, "priority": 1,
    "title": "Schottisch (3.d4) und Göring-Gambit",
    "intro": "Gegen 3.d4 nimmst du mit 3…exd4. Nach 4.Sxd4 spielst du 4…Sf6 und greifst sofort e4 an. Gegen "
             "4.Lc4 (Schottisches Gambit) antwortest du wie im Italienisch mit 4…Lc5, gegen 4.c3 (Göring) "
             "mit dem Gegenschlag 4…d5.",
    "ideas": [
        "Nach Sxc6 immer mit dem b-Bauern zurückschlagen (…bxc6): Er geht zum Zentrum, und …d5 folgt.",
        "Steht der weiße Bauer auf e5, fesselt …De7 ihn an den König.",
        "…La6 fesselt den Bauern c4 an die Dame e2: Dein Springer d5 steht dann sicher.",
        "Im Gambit gilt: Material zurückgeben ist okay, wenn du dafür gut entwickelst.",
    ],
    "lines": [
        {"id": "b-sc-e5", "name": "4.Sxd4 Sf6 5.Sxc6 bxc6 6.e5 De7 7.De2 Sd5 8.c4 La6", "frequency": "häufig",
         "pgn": "e4 e5 Nf3 Nc6 "
                "d4 {Schottisch: Weiß öffnet sofort das Zentrum.} "
                "exd4 {Nimm den Bauern, e5 ist sowieso nicht zu halten.} "
                "Nxd4 {Weiß holt den Bauern zurück.} "
                "Nf6 {Greift e4 an. Einfach und gut: schnelle Entwicklung.} "
                "Nxc6 {Weiß tauscht.} "
                "bxc6 {Mit dem b-Bauern zum Zentrum hin. Später kommt …d5.} "
                "e5 {Weiß vertreibt deinen Springer.} "
                "Qe7 {Greift e5 an und fesselt ihn an den weißen König: Zieht der Bauer, gibt es Schach.} "
                "Qe2 {Weiß deckt e5 und hebt die Fesselung auf.} "
                "Nd5 {Jetzt geht der Springer ins Zentrum.} "
                "c4 {Weiß greift den Springer an.} "
                "Ba6 {Fesselung: Nimmt der Bauer c4 deinen Springer, schlägst du die Dame e2.}",
         "plan": "Spiele …g6 und …Lg7 (Druck auf e5), dann …O-O. Der Springer geht bei Bedarf nach b6. Der "
                 "weiße Bauer e5 ist dein Hauptziel."},
        {"id": "b-sc-bd3", "name": "4.Sxd4 Sf6 5.Sxc6 bxc6 6.Ld3 d5", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 "
                "Bd3 {Weiß deckt e4.} "
                "d5 {Großes Zentrum mit Angriff auf e4.} "
                "exd5 cxd5 {Jetzt hast du zwei starke Zentrumsbauern.} "
                "O-O Be7 {Einfach entwickeln und dann rochieren.}",
         "plan": "Nach …O-O spielst du …c5 und …Lb7 oder …Le6. Die offene b-Linie gehört deinem Turm (…Tb8)."},
        {"id": "b-sc-nc3", "name": "4.Sxd4 Sf6 5.Sc3 Lb4 6.Sxc6 bxc6 7.Ld3 d5", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 "
                "Nc3 {Weiß deckt e4.} "
                "Bb4 {Fesselt den Sc3, den Verteidiger von e4.} "
                "Nxc6 bxc6 {Mit dem b-Bauern zum Zentrum hin zurückschlagen.} "
                "Bd3 d5 {Gegenschlag im Zentrum: Jetzt wackelt e4.} "
                "exd5 cxd5 {Zwei Bauern im Zentrum, die b-Linie ist halboffen.} "
                "O-O O-O {König in Sicherheit.} "
                "Bg5 c6 {Stützt d5 und gibt dem Läufer b4 einen Rückzug nach d6.}",
         "plan": "Spiele …Ld6, …h6 und …Te8. Mit dem stabilen Zentrum (c6, d5) und der halboffenen b-Linie "
                 "stehst du gut."},
        {"id": "b-sc-gambit", "name": "4.Lc4 Lc5 5.c3 Sf6 6.e5 d5", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 d4 exd4 "
                "Bc4 {Das Schottische Gambit: Weiß lässt den Bauern d4 stehen und zielt auf f7.} "
                "Bc5 {Wie im Italienisch: Der Läufer deckt d4 und zielt auf f2.} "
                "c3 {Weiß will den Bauern d4 zurück.} "
                "Nf6 {Entwickeln und e4 angreifen. Das ist dieselbe Stellung wie im Italienisch nach 4.c3 Sf6 "
                "5.d4 exd4.} "
                "e5 d5 Bb5 Ne4 cxd4 Bb6",
         "plan": "Wie im Italienisch: …O-O, dann …f6 oder …Lg4 gegen das weiße Zentrum. Dein Springer auf e4 "
                 "steht stark."},
        {"id": "b-sc-gambit-oo", "name": "4.Lc4 Lc5 5.O-O d6 6.c3 Lg4", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 d4 exd4 Bc4 Bc5 "
                "O-O {Weiß rochiert und opfert den Bauern weiter.} "
                "d6 {Stützt den Lc5 und den Bauern d4. Jetzt gibt es keine Tricks mit e5.} "
                "c3 Bg4 {Fesselt den Sf3 und hält den Mehrbauern. Nach 7.Db3 hilft 7…Lxf3 8.Lxf7+ Kf8.}",
         "plan": "Nach dem Abtausch auf f3 spielst du …Se5 oder …Df6 und dann …Sge7. Behalte den Mehrbauern, "
                 "aber rochiere erst, wenn f7 sicher ist."},
        {"id": "b-sc-goring", "name": "4.c3 d5 (Göring-Gambit)", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 d4 exd4 "
                "c3 {Das Göring-Gambit.} "
                "d5 {Gegenschlag im Zentrum, du gibst den Bauern lieber zurück, als lange zu verteidigen.} "
                "exd5 Qxd5 {Die Dame steht zentral, Sc3 ist nicht möglich.} "
                "cxd4 Bg4 {Fesselt den Verteidiger von d4.} "
                "Be2 Bb4+ {Schach mit Entwicklung.} "
                "Nc3 Bxf3 Bxf3 Qc4 {Greift d4 an und verhindert die kurze Rochade.}",
         "plan": "Wie im Nordischen Gambit: …O-O-O, …Sge7 und Druck auf den isolierten Bauern d4."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Vierspringer
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-fourknights", "group": G_E4, "priority": 1,
    "title": "Vierspringer (3.Sc3 Sf6)",
    "intro": "3.Sc3 ist auf deinem Niveau sehr häufig. Du antwortest mit 3…Sf6. Gegen 4.Lc4 lernst du den "
             "Gabeltrick 4…Sxe4!: Nach 5.Sxe4 gewinnt …d5 die Figur zurück, und du bekommst freies Spiel. "
             "Gegen 4.Lb5 spielst du symmetrisch 4…Lb4, gegen 4.d4 wie im Schottisch.",
    "ideas": [
        "Gabeltrick: …Sxe4 und …d5 gabelt Läufer und Springer.",
        "Nach Lxf7+ Kxf7 hast du das Läuferpaar: König nach g8 und …d5.",
        "Gegen Lg5-Fesselung im symmetrischen Vierspringer: …Lxc3 und dann …De7, nicht zu früh …h6.",
        "Gegen 4.Sxe5? (Halloween-Gambit) nimmst du und vertreibst mit …Sg6 und …Sg8: Du behältst die Figur.",
    ],
    "lines": [
        {"id": "b-4k-bc4", "name": "4.Lc4 Sxe4 5.Sxe4 d5 (Gabeltrick)", "frequency": "häufig",
         "pgn": "e4 e5 Nf3 Nc6 "
                "Nc3 {Vierspringer: Weiß entwickelt ruhig.} "
                "Nf6 {Entwickeln und e4 angreifen.} "
                "Bc4 {Weiß zielt auf f7.} "
                "Nxe4 {Der Gabeltrick: Du nimmst e4, denn nach 5.Sxe4 kommt …d5 mit einer Gabel.} "
                "Nxe4 d5 {Die Gabel: Der Bauer greift Läufer und Springer an. Du gewinnst die Figur zurück.} "
                "Bd3 dxe4 {Nimm den Springer. Material ist wieder ausgeglichen.} "
                "Bxe4 Bd6 {Deckt e5 und bereitet die Rochade vor.} "
                "d4 exd4 {Nimm den Bauern, der Läufer e4 deckt ihn nicht.} "
                "O-O O-O {Beide Könige sicher. Gleiche Stellung, deine Figuren sind frei.}",
         "plan": "Spiele …h6 (gegen Lg5), …Te8 und …Lf5 oder …Df6. Der Bauer d4 ist ein Mehrbauer, solange "
                 "Weiß ihn nicht zurückholt: Decke ihn mit …Lc5 oder …Df6."},
        {"id": "b-4k-bxf7", "name": "4.Lc4 Sxe4 5.Lxf7+ Kxf7 6.Sxe4 d5", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Nc3 Nf6 Bc4 Nxe4 "
                "Bxf7+ {Weiß tauscht den Läufer gegen den Bauern f7, um deinen König zu stören.} "
                "Kxf7 {Nimm den Läufer. Dein König steht nur kurz ungewohnt.} "
                "Nxe4 d5 {Mit Tempo gegen den Springer: Du bekommst ein großes Zentrum.} "
                "Neg5+ Kg8 {Der König geht nach g8. Mit dem Läuferpaar und dem Zentrum stehst du besser.}",
         "plan": "Spiele …h6 (vertreibt den Sg5), …Lg4 oder …e4 und bringe den Th8 mit …h6 und …Kh7 ins Spiel. "
                 "Die Engine sieht dich klar vorn."},
        {"id": "b-4k-oo", "name": "4.Lc4 Sxe4 5.O-O Sxc3 6.dxc3 f6", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Nc3 Nf6 Bc4 Nxe4 "
                "O-O {Weiß lässt den Bauern im Stich und rochiert.} "
                "Nxc3 {Tauscht einen Angreifer ab.} "
                "dxc3 f6 {Stützt e5 sicher. Du hast einen Bauern mehr.}",
         "plan": "Spiele …d6, …Le7 und …O-O, dann …Kh8 und …Sa5 gegen den Lc4. Mehrbauer mit solider "
                 "Stellung."},
        {"id": "b-4k-bb5", "name": "4.Lb5 Lb4 5.O-O O-O 6.d3 d6 7.Lg5 Lxc3", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Nc3 Nf6 "
                "Bb5 {Spanischer Vierspringer.} "
                "Bb4 {Symmetrisch und solide: Der Läufer fesselt den Sc3.} "
                "O-O O-O {König in Sicherheit.} "
                "d3 d6 {Stützt e5 und öffnet den Lc8.} "
                "Bg5 {Weiß fesselt deinen Sf6.} "
                "Bxc3 {Tausche zuerst auf c3: Weiß bekommt Doppelbauern.} "
                "bxc3 Qe7 {Bereitet …Sd8–e6 gegen den Lg5 vor. Nach Lxf6 schlägst du mit der Dame zurück und "
                "bekommst keine Doppelbauern.}",
         "plan": "Spiele …Sd8–e6 gegen den Lg5, oder …h6 im richtigen Moment. Die weißen Doppelbauern auf c2/c3 "
                 "sind ein Ziel für später."},
        {"id": "b-4k-d4", "name": "4.d4 exd4 5.Sxd4 Lb4", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Nc3 Nf6 "
                "d4 {Vierspringer-Schottisch.} "
                "exd4 {Nimm den Bauern.} "
                "Nxd4 Bb4 Nxc6 bxc6 Bd3 d5 exd5 cxd5 O-O O-O",
         "plan": "Dieselbe Stellung wie im Schottisch nach 4.Sxd4 Sf6 5.Sc3 Lb4. Weiter mit …c6, …Ld6 und …h6."},
        {"id": "b-4k-d3", "name": "4.d3 d5", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Nc3 Nf6 "
                "d3 {Weiß spielt sehr vorsichtig.} "
                "d5 {Gegen passives Spiel: Nimm das Zentrum ein.} "
                "exd5 Nxd5 {Der Springer steht zentral.} "
                "Be2 Bc5 {Aktiver Läufer, dann rochieren.}",
         "plan": "Rochiere und spiele …f6 oder …Te8 zur Stütze von e5. Mit mehr Raum im Zentrum stehst du "
                 "angenehm."},
        {"id": "b-4k-halloween", "name": "4.Sxe5? Sxe5 5.d4 Sg6 (Halloween-Gambit)", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Nc3 Nf6 "
                "Nxe5 {Das Halloween-Gambit: Weiß opfert einen Springer für ein großes Zentrum.} "
                "Nxe5 {Nimm den Springer.} "
                "d4 {Weiß vertreibt deinen Springer.} "
                "Ng6 {Nach g6, wo er nicht mehr im Weg steht.} "
                "e5 Ng8 {Ein ungewohnter Rückzug, aber du behältst die Figur. Gleich folgen …d6 oder …d5.}",
         "plan": "Spiele …d6 oder …d5, …Le7 und …Sh6 bzw. …Se7, dann rochieren. Du hast eine Figur mehr und "
                 "musst nur das weiße Zentrum (d4, e5) im Auge behalten."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Ponziani und andere 3. Züge
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-e5-third", "group": G_E4, "priority": 1,
    "title": "Ponziani (3.c3), 3.d3 und andere 3. Züge",
    "intro": "Spielt Weiß nach 2…Sc6 nicht Lc4, Lb5, d4 oder Sc3, ist fast immer …d5 oder …Sf6 mit …d5 "
             "die richtige Antwort: Weiß hat ein Tempo für einen ruhigen Zug verbraucht, also nimmst du dir das "
             "Zentrum. Gegen 3.c3 (Ponziani) kam das in deinen Partien öfter vor.",
    "ideas": [
        "Ruhige weiße Züge (c3, d3, Le2, h3) mit …d5 bestrafen: Du bekommst Raum und freies Spiel.",
        "Im Ponziani nach Da4: …f6 stützt e5 und hält den Springer c6 sicher gedeckt.",
        "Nach dem Damentausch auf d1 ist der weiße König in der Mitte ein Ziel für …O-O-O und …Lf5.",
    ],
    "lines": [
        {"id": "b-po-qa4", "name": "3.c3 d5 4.Da4 f6 5.Lb5 Se7", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 "
                "c3 {Die Ponziani-Eröffnung: Weiß bereitet d4 vor.} "
                "d5 {Gegenschlag sofort: Weiß hat mit c3 dem Springer das Feld c3 genommen.} "
                "Qa4 {Die Dame fesselt den Springer c6 und droht Sxe5.} "
                "f6 {Stützt e5 sicher. Jetzt geht Sxe5 nicht mehr.} "
                "Bb5 Ne7 {Deckt den Sc6 ein zweites Mal. Die Fesselung tut dir nicht weh.} "
                "exd5 Qxd5 {Die Dame steht zentral.} "
                "d4 Bd7 {Entwickelt und hebt die Fesselung des Sc6 auf.}",
         "plan": "Spiele …O-O-O oder …exd4 und …Se5. Deine Figuren stehen aktiv, die weiße Dame auf a4 steht "
                 "abseits."},
        {"id": "b-po-d4", "name": "3.c3 d5 4.d4 dxe4 5.Sxe5 Sxe5 6.dxe5 Dxd1+", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 c3 d5 "
                "d4 {Weiß öffnet das Zentrum.} "
                "dxe4 {Nimm den Bauern, der weiße Springer wird vertrieben.} "
                "Nxe5 Nxe5 {Tauscht den aktiven Springer.} "
                "dxe5 Qxd1+ {Damentausch mit Schach: Der weiße König kann nicht mehr rochieren.} "
                "Kxd1 Bf5 {Deckt e4 und entwickelt. Du hast den angenehmeren Teil des Endspiels.}",
         "plan": "Spiele …O-O-O mit Schach auf der d-Linie, dann …Se7–g6 gegen e5. Der weiße König in der "
                 "Mitte ist ein Ziel."},
        {"id": "b-po-d3", "name": "3.d3 Sf6 4.Le2 d5", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 "
                "d3 {Weiß spielt sehr ruhig.} "
                "Nf6 {Entwickeln und e4 angreifen.} "
                "Be2 {Auch 3.Le2 Sf6 4.d3 führt hierher.} "
                "d5 {Nimm dir das Zentrum: Weiß spielt zu passiv.} "
                "exd5 Nxd5 {Der Springer steht zentral.} "
                "O-O Be7 {Einfach entwickeln und dann rochieren.}",
         "plan": "Nach …O-O spielst du …f5 oder …Te8 und …Lf8. Du hast mehr Raum im Zentrum."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Spanisch
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-ruy", "group": G_E4, "priority": 2,
    "title": "Spanisch (3.Lb5): 3…a6 und …Le7",
    "intro": "Gegen 3.Lb5 spielst du 3…a6 und fragst den Läufer sofort. Nach 4.La4 Sf6 5.O-O Le7 bekommst "
             "du eine solide Stellung mit klaren Plänen. In deinen Partien kam Spanisch selten vor, deshalb "
             "reicht dieser einfache Kern. Wichtig ist die Abtauschvariante 4.Lxc6: Dort verliert Weiß nach "
             "5.Sxe5? den Bauern wieder.",
    "ideas": [
        "Nach Te1 droht Lxc6 und Sxe5: Deshalb kommt dann …b5.",
        "In der Abtauschvariante deckt …f6 den Bauern e5. Deine Läufer sind langfristig stark.",
        "Gegen 5.Sxe5? in der Abtauschvariante: …Dd4! gabelt Springer und e4.",
        "Typischer Plan: …Sa5 und …c5 am Damenflügel, …Lb7 und …Te8 im Zentrum.",
    ],
    "lines": [
        {"id": "b-ruy-main", "name": "4.La4 Sf6 5.O-O Le7 6.Te1 b5 7.Lb3 d6", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 "
                "Bb5 {Spanisch: Weiß greift den Verteidiger von e5 an.} "
                "a6 {Frag den Läufer sofort: tauschen oder zurückziehen.} "
                "Ba4 Nf6 {Entwickeln und e4 angreifen.} "
                "O-O Be7 {Solide: Der Läufer geht nach e7, dann kommt die Rochade.} "
                "Re1 {Jetzt ist e4 gedeckt, und Weiß droht Lxc6 nebst Sxe5.} "
                "b5 {Vertreibt den Läufer, damit er nicht mehr auf c6 tauschen kann.} "
                "Bb3 d6 {Stützt e5 dauerhaft und öffnet den Lc8.} "
                "c3 O-O {König in Sicherheit.} "
                "h3 Na5 {Der Springer jagt den Läufer b3.} "
                "Bc2 c5 {Raum am Damenflügel. Der Springer kommt später über c6 zurück ins Spiel.}",
         "plan": "Spiele …Dc7 und …Sc6 oder …Lb7, dann …Tfe8 und …Lf8. Gegen d4 hältst du e5 mit …Dc7 und "
                 "…Sc6."},
        {"id": "b-ruy-d3", "name": "4.La4 Sf6 5.d3 b5 6.Lb3 Le7", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 "
                "d3 {Weiß deckt e4 ruhig.} "
                "b5 {Vertreibt den Läufer gleich, bevor er wieder lästig wird.} "
                "Bb3 Be7 {Solide entwickeln.} "
                "O-O d6 {Stützt e5 und öffnet den Lc8.} "
                "c3 O-O {König in Sicherheit.}",
         "plan": "Wie in der Hauptlinie: …Sa5 gegen den Lb3, …c5 und …Lb7 oder …Le6."},
        {"id": "b-ruy-exch-nxe5", "name": "4.Lxc6 dxc6 5.Sxe5? Dd4!", "frequency": "mittel",
         "pgn": "e4 e5 Nf3 Nc6 Bb5 a6 "
                "Bxc6 {Die Abtauschvariante.} "
                "dxc6 {Mit dem d-Bauern zurück: Dame und Lc8 haben freie Bahn.} "
                "Nxe5 {Falle! Weiß nimmt e5, aber jetzt gibt es eine Gabel.} "
                "Qd4 {Die Dame greift Springer e5 und Bauer e4 gleichzeitig an.} "
                "Nf3 Qxe4+ {Du holst den Bauern mit Schach zurück.} "
                "Qe2 Qxe2+ {Tausch: Ohne Damen kann dir nichts mehr passieren.} "
                "Kxe2 Bd7 {Gleiches Material, und du hast das Läuferpaar.}",
         "plan": "Spiele …O-O-O, …Se7 und …f6. Mit zwei Läufern gegen Läufer und Springer stehst du im "
                 "Endspiel besser."},
        {"id": "b-ruy-exch-oo", "name": "4.Lxc6 dxc6 5.O-O f6 6.d4 Lg4", "frequency": "selten",
         "pgn": "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 "
                "O-O {Jetzt droht wirklich Sxe5.} "
                "f6 {Deckt e5 dauerhaft. Ungewohnt, aber hier Standard.} "
                "d4 Bg4 {Fesselt den Sf3 und erhöht den Druck auf d4.}",
         "plan": "Nach dxe5 tauschst du die Damen (…Dxd1) und spielst …fxe5. Sonst …exd4, …Dd7 und "
                 "…O-O-O. Das Läuferpaar ist dein Trumpf."},
    ],
})

# ---------------------------------------------------------------------------------------------
# Königsgambit und andere 2. Züge
# ---------------------------------------------------------------------------------------------
CHAPTERS.append({
    "id": "b-kings-gambit", "group": G_E4, "priority": 2,
    "title": "Königsgambit (2.f4)",
    "intro": "Gegen 2.f4 nimmst du an (2…exf4) und spielst nach 3.Sf3 sofort 3…d5: Du gibst Licht für deine "
             "Figuren und vermeidest die gefährlichen Angriffe auf f7. Gegen 3.Lc4 entwickelst du mit 3…Sf6 "
             "und …c6/…d5.",
    "ideas": [
        "…d5 öffnet das Zentrum, solange der weiße König auf e1 steht.",
        "Der Bauer f4 ist nicht heilig: Gib ihn zurück, wenn du dafür gut entwickelst.",
        "Gegen Lc4: …c6 und …d5 nehmen dem Läufer die Diagonale.",
    ],
    "lines": [
        {"id": "b-kg-bc4", "name": "2.f4 exf4 3.Sf3 d5 4.exd5 Sf6 5.Lc4 Sxd5", "frequency": "mittel",
         "pgn": "e4 e5 "
                "f4 {Das Königsgambit: Weiß opfert einen Bauern für die offene f-Linie.} "
                "exf4 {Nimm an.} "
                "Nf3 {Verhindert …Dh4+.} "
                "d5 {Der moderne Gegenschlag im Zentrum.} "
                "exd5 Nf6 {Entwickeln und den Bauern d5 angreifen.} "
                "Bc4 Nxd5 {Zurückgewonnen. Der Springer deckt f4.} "
                "O-O Be6 {Deckt den Springer d5 ein zweites Mal und entwickelt.}",
         "plan": "Spiele …Le7 oder …Ld6, …O-O und …Sc6. Den Bauern f4 hältst du, solange es bequem geht."},
        {"id": "b-kg-c4", "name": "2.f4 exf4 3.Sf3 d5 4.exd5 Sf6 5.c4 c6", "frequency": "selten",
         "pgn": "e4 e5 f4 exf4 Nf3 d5 exd5 Nf6 "
                "c4 {Weiß hält den Bauern d5.} "
                "c6 {Untergräbt den Bauern d5.} "
                "d4 Bb4+ {Schach mit Entwicklung.}",
         "plan": "Nach Ld2 tauschst du (…Lxd2+), dann …cxd5 und …O-O. Weiß hat ein offenes Königsfeld."},
        {"id": "b-kg-bc4-3", "name": "2.f4 exf4 3.Lc4 Sf6 4.Sc3 c6", "frequency": "selten",
         "pgn": "e4 e5 f4 exf4 "
                "Bc4 {Das Läufergambit.} "
                "Nf6 {Entwickeln und e4 angreifen.} "
                "Nc3 c6 {Bereitet …d5 vor.} "
                "Bb3 d5 {Jetzt hast du das Zentrum.}",
         "plan": "Nach exd5 cxd5 spielst du …Ld6, …O-O und hältst f4 mit …g5, wenn es sicher ist."},
    ],
})

# ---------------------------------------------------------------------------------------------
# 1.d4 d5: Damengambit abgelehnt
# ---------------------------------------------------------------------------------------------
INTRO_D4 = ("Gegen 1.d4 spielst du ab jetzt 1…d5 statt des Englund-Gambits 1…e5. Das Englund-Gambit kostet "
            "einen Bauern: In deinen Partien standest du damit nach Zug 10 im Mittel klar schlechter, und ab "
            "etwa 1300 kennen die Gegner die Fallen. Mit 1…d5 bekommst du gesunde Stellungen mit klaren Plänen. ")

CHAPTERS.append({
    "id": "b-qgd", "group": G_D4, "priority": 1,
    "title": "Damengambit abgelehnt (2.c4 e6) mit Elefantenfalle",
    "intro": INTRO_D4 + "Gegen 2.c4 spielst du 2…e6: Dein Zentrum steht fest, der Lf8 ist frei. Nach 3.Sc3 Sf6 "
             "4.Lg5 spielst du 4…Sbd7 und stellst damit die Elefantenfalle: 5.cxd5 exd5 6.Sxd5?? Sxd5! "
             "7.Lxd8 Lb4+ kostet Weiß eine Figur.",
    "ideas": [
        "Die Kette e6–d5 hält das Zentrum. Befreiungszüge sind …c5 oder …dxc4 mit …Sd5.",
        "Elefantenfalle: Nach …Sbd7 ist der Sf6 nicht wirklich gefesselt, weil …Lb4+ die Dame zurückholt.",
        "Gegen die Abtauschvariante (cxd5 exd5): …c6, …Ld6/…Le7, …Te8 und …Sf8–g6. Der Lc8 kommt nach f5 oder g4.",
        "Den Lc8 nicht vergessen: …b6 und …Lb7 oder …dxc4 und …e5 befreien ihn.",
    ],
    "lines": [
        {"id": "b-qgd-elephant", "name": "3.Sc3 Sf6 4.Lg5 Sbd7 5.cxd5 exd5 6.Sxd5?? (Elefantenfalle)",
         "frequency": "mittel",
         "pgn": "d4 d5 {Gegen 1.d4 spielst du immer 1…d5: Du hältst Weiß das Feld e4 und bekommst ein gesundes "
                "Zentrum.} "
                "c4 {Das Damengambit: Weiß bietet den Bauern c4 an, um dein Zentrum abzulenken.} "
                "e6 {Abgelehnt: Du stützt d5 und öffnest den Lf8. Der Bauer c4 ist kein echtes Geschenk.} "
                "Nc3 Nf6 {Entwickeln und d5 noch einmal decken.} "
                "Bg5 {Weiß fesselt den Sf6 an die Dame.} "
                "Nbd7 {Stellt die Elefantenfalle: Der Springer d7 deckt f6, und die Fesselung ist nur scheinbar.} "
                "cxd5 exd5 {Mit dem e-Bauern zurück, der Lc8 bekommt Luft.} "
                "Nxd5 {Falle! Weiß glaubt, den Bauern d5 gewinnen zu können, weil der Sf6 gefesselt ist.} "
                "Nxd5 {Nimm trotzdem! Nach 7.Lxd8 holst du die Dame zurück.} "
                "Bxd8 {Weiß nimmt die Dame.} "
                "Bb4+ {Schach! Weiß muss die Dame dazwischenstellen.} "
                "Qd2 Bxd2+ {Du holst die Dame zurück.} "
                "Kxd2 Kxd8 {Ergebnis: Du hast eine Leichtfigur mehr.}",
         "plan": "Bring den König nach e7, die Türme nach d8 und e8 und tausche weiter ab. Mit einer Figur mehr "
                 "gewinnst du das Endspiel."},
        {"id": "b-qgd-main", "name": "3.Sc3 Sf6 4.Lg5 Sbd7 5.e3 Le7 6.Sf3 O-O 7.Tc1 c6", "frequency": "häufig",
         "pgn": "d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 "
                "e3 {Weiß fällt nicht auf die Falle herein.} "
                "Be7 {Löst die Fesselung: Jetzt ist der Sf6 vom Läufer gedeckt.} "
                "Nf3 O-O {König in Sicherheit.} "
                "Rc1 c6 {Stützt d5 und bereitet …dxc4 mit …Sd5 vor.} "
                "Bd3 dxc4 {Jetzt hat Weiß mit dem Läufer ein Tempo verloren.} "
                "Bxc4 Nd5 {Der Springer tauscht Figuren und befreit deine Stellung. Danach folgt …e5.}",
         "plan": "Tausche auf g5 oder e7 und c3, dann spielst du …e5 und entwickelst den Lc8. Durch die "
                 "Abtäusche wird deine etwas enge Stellung frei."},
        {"id": "b-qgd-exch", "name": "3.Sc3 Sf6 4.Lg5 Sbd7 5.cxd5 exd5 6.e3 c6 (Abtauschvariante)",
         "frequency": "mittel",
         "pgn": "d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 "
                "e3 {Weiß spielt richtig weiter.} "
                "c6 {Stützt d5 und gibt der Dame das Feld c7 oder a5.} "
                "Bd3 Be7 {Entwickeln und den Sf6 entfesseln.} "
                "Qc2 O-O {König in Sicherheit.} "
                "Nf3 Re8 {Der Turm geht auf die halboffene e-Linie. Danach kommt …Sf8 und …Sg6 oder …Se4.}",
         "plan": "Typischer Plan: …Sf8, …Le6 oder …Sg6, …Se4 zum Abtauschen. Gegen den weißen Minoritätsangriff "
                 "(b4–b5) hältst du mit …a6 dagegen."},
        {"id": "b-qgd-cambridge", "name": "3.Sc3 Sf6 4.Lg5 Sbd7 5.Sf3 c6 6.e3 Da5 (Cambridge Springs)",
         "frequency": "selten",
         "pgn": "d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 "
                "Nf3 {Weiß entwickelt.} "
                "c6 {Stützt d5.} "
                "e3 Qa5 {Cambridge Springs: Die Dame fesselt den Sc3, und der Lg5 hat keinen Schutz mehr.} "
                "Nd2 {Die übliche Antwort: Der Springer deckt c4 und e4.} "
                "Bb4 {Noch ein Angreifer gegen c3.} "
                "Qc2 O-O {König in Sicherheit.}",
         "plan": "Spiele …e5 oder …c5 gegen das weiße Zentrum, oft nach …dxc4. Achte auf Lxf6: Mit …Sxf6 "
                 "zurück."},
        {"id": "b-qgd-nf3", "name": "3.Sc3 Sf6 4.Sf3 Le7 5.Lg5 O-O 6.e3 h6 7.Lh4 b6", "frequency": "häufig",
         "pgn": "d4 d5 c4 e6 Nc3 Nf6 "
                "Nf3 {Weiß entwickelt zuerst den Königsspringer.} "
                "Be7 {Solide: Läufer nach e7, dann rochieren.} "
                "Bg5 O-O {König in Sicherheit, der Sf6 ist durch den Le7 gedeckt.} e3 h6 {Frag den Läufer.} "
                "Bh4 b6 {Bereitet …Lb7 vor: Der Läufer zielt über die lange Diagonale auf e4.}",
         "plan": "Spiele …Lb7, …Sbd7 und …c5. Tausche bei Gelegenheit mit …Se4 die Leichtfiguren."},
        {"id": "b-qgd-bf4", "name": "3.Sc3 Sf6 4.Lf4 Le7 5.e3 O-O 6.Sf3 c5", "frequency": "mittel",
         "pgn": "d4 d5 c4 e6 Nc3 Nf6 "
                "Bf4 {Weiß entwickelt den Läufer vor die Bauernkette.} "
                "Be7 {Solide entwickeln, dann rochieren.} e3 O-O {König in Sicherheit.} Nf3 c5 {Der Befreiungszug: Du greifst d4 an, bevor Weiß alles fertig hat.}",
         "plan": "Nach dxc5 nimmst du mit dem Läufer zurück (…Lxc5), dann …Sc6 und …Da5 oder …dxc4. Freies "
                 "Spiel für deine Figuren."},
        {"id": "b-qgd-catalan", "name": "2.c4 e6 3.Sf3 Sf6 4.g3 Le7 (Katalanisch)", "frequency": "selten",
         "pgn": "d4 d5 c4 e6 "
                "Nf3 Nf6 {Entwickeln und d5 noch einmal decken.} "
                "g3 {Katalanisch: Der Läufer soll nach g2.} "
                "Be7 {Solide: Läufer nach e7, dann rochieren.} Bg2 O-O {König in Sicherheit.} O-O dxc4 {Nimm den Bauern c4: Weiß muss Zeit aufwenden, um ihn zurückzuholen.}",
         "plan": "Spiele …a6 und …b5 oder …Sc6, um den Bauern c4 zu halten, oder gib ihn für schnelle "
                 "Entwicklung (…c5, …Sc6) zurück."},
    ],
})
