"""Prüft app/data/endgames.json (Modul 6, Endspiele).

Aufruf:  .venv/bin/python -I data/test/eg_check.py [--quick] [--only id,id] [--ms 400]

1. Format: Pflichtfelder, eindeutige ids, mindestens 18 Stellungen.
2. Regeln (python-chess): FEN gültig, die Seite des Nutzers ist am Zug, Partie nicht schon vorbei.
3. Engine (Stockfish, 2 Threads): Bewertung der Startstellung passt zum Ziel, dazu die besten Züge.
4. Ohne --quick: Stockfish spielt beide Seiten (Nutzerseite = beste Züge) mit denselben Regeln wie
   app/js/vision/endgame.js. Das Ziel muss innerhalb von maxMoves erreicht werden.
"""
import json
import sys
from pathlib import Path

import chess
import chess.engine

ROOT = Path(__file__).resolve().parents[2]
SF = ROOT / 'tools/stockfish/stockfish-macos-universal'
DATA = ROOT / 'app/data/endgames.json'

WIN_CP, LOST_WIN_CP, LOST_CP, DRAW_MARGIN = 500, 80, -400, 150
REQUIRED = ['id', 'title', 'level', 'fen', 'side', 'goal', 'maxMoves', 'intro', 'hints', 'technique']


def until_of(p):
    if p.get('until'):
        return p['until']
    if p['goal'] != 'win':
        return None
    board = p['fen'].split()[0]
    return 'promote' if ('P' if p['side'] == 'w' else 'p') in board else 'mate'


def user_cp(score, side):
    """Bewertung aus Sicht des Nutzers, Matt = ±100000 (wie endgame.js)."""
    s = score.pov(chess.WHITE if side == 'w' else chess.BLACK)
    if s.is_mate():
        m = s.mate()
        return 100000 if m > 0 else -100000 if m < 0 else 0
    return s.score()


VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}


def material_edge(b, side):
    me = chess.WHITE if side == 'w' else chess.BLACK
    return sum((1 if pc.color == me else -1) * VAL[pc.piece_type] for pc in b.piece_map().values())


def draw_reason(b):
    if b.is_stalemate():
        return 'Patt'
    if b.is_insufficient_material():
        return 'Material'
    if b.can_claim_threefold_repetition():
        return 'Wiederholung'
    if b.can_claim_fifty_moves():
        return '50 Züge'
    return None


def judge_after_user(p, b, cp, user_moves, last):
    if b.is_checkmate():
        return 'won', 'Matt'
    dr = draw_reason(b)
    if dr:
        return ('won' if p['goal'] == 'draw' else 'failed'), 'Remis: ' + dr
    opp = chess.BLACK if p['side'] == 'w' else chess.WHITE
    if p['goal'] == 'win':
        until = until_of(p)
        if cp is not None and cp >= WIN_CP:
            if until == 'promote' and last.promotion:
                return 'won', 'Umwandlung'
            if until == 'promote' and material_edge(b, p['side']) >= 5:
                return 'won', 'Figur für den Bauern bekommen'
            if until == 'material' and chess.popcount(b.occupied_co[opp]) == 1:
                return 'won', 'nur König übrig'
        if cp is not None and cp < LOST_WIN_CP:
            return 'failed', f'Gewinn verspielt ({cp})'
        if user_moves >= p['maxMoves']:
            return 'failed', 'Zuglimit'
        return 'continue', ''
    if cp is not None and cp <= p.get('lostCp', LOST_CP):
        return 'failed', f'verloren ({cp})'
    if user_moves >= p['maxMoves']:
        if cp is None or cp >= -p.get('drawMargin', DRAW_MARGIN):
            return 'won', f'Limit gehalten ({cp})'
        return 'failed', f'Limit, aber schlechter ({cp})'
    return 'continue', ''


def judge_after_opp(p, b):
    if b.is_checkmate():
        return 'failed', 'mattgesetzt'
    dr = draw_reason(b)
    if dr:
        return ('won' if p['goal'] == 'draw' else 'failed'), 'Remis: ' + dr
    return 'continue', ''


def check_format(data):
    errs = []
    ids = set()
    if len(data) < 18:
        errs.append(f'nur {len(data)} Stellungen (mindestens 18)')
    for p in data:
        pid = p.get('id', '?')
        for k in REQUIRED:
            if k not in p:
                errs.append(f'{pid}: Feld {k} fehlt')
        if pid in ids:
            errs.append(f'{pid}: id doppelt')
        ids.add(pid)
        if p.get('goal') not in ('win', 'draw'):
            errs.append(f'{pid}: goal muss win oder draw sein')
        if p.get('side') not in ('w', 'b'):
            errs.append(f'{pid}: side muss w oder b sein')
        if p.get('level') not in (1, 2, 3):
            errs.append(f'{pid}: level 1–3')
        if not p.get('hints'):
            errs.append(f'{pid}: keine Hinweise')
        if p.get('until') not in (None, 'mate', 'promote', 'material'):
            errs.append(f'{pid}: until unbekannt')
        try:
            b = chess.Board(p['fen'])
        except Exception as e:  # noqa: BLE001
            errs.append(f'{pid}: FEN kaputt ({e})')
            continue
        if not b.is_valid():
            errs.append(f'{pid}: ungültige Stellung ({b.status()})')
        if ('w' if b.turn else 'b') != p['side']:
            errs.append(f'{pid}: falsche Seite am Zug')
        if b.is_game_over():
            errs.append(f'{pid}: Partie schon vorbei')
    return errs


def selfplay(eng, p, ms):
    b = chess.Board(p['fen'])
    limit = chess.engine.Limit(time=ms / 1000)
    user_moves = 0
    sans = []
    while True:
        mv = eng.play(b, limit).move
        sans.append(b.san(mv))
        b.push(mv)
        user_moves += 1
        cp = None
        reply = None
        if not b.is_game_over():
            info = eng.analyse(b, limit)
            cp = user_cp(info['score'], p['side'])
            reply = info['pv'][0] if info.get('pv') else None
        st, why = judge_after_user(p, b, cp, user_moves, mv)
        if st != 'continue':
            return st, why, user_moves, sans
        if reply is None:
            return 'failed', 'kein Gegnerzug', user_moves, sans
        sans.append(b.san(reply))
        b.push(reply)
        st, why = judge_after_opp(p, b)
        if st != 'continue':
            return st, why, user_moves, sans


def main():
    args = sys.argv[1:]
    quick = '--quick' in args
    only = None
    ms = 400
    if '--only' in args:
        only = set(args[args.index('--only') + 1].split(','))
    if '--ms' in args:
        ms = int(args[args.index('--ms') + 1])
    raw = json.loads(DATA.read_text())
    data = raw if isinstance(raw, list) else raw['positions']
    errs = check_format(data)
    for e in errs:
        print('FEHLER', e)
    eng = chess.engine.SimpleEngine.popen_uci(str(SF))
    eng.configure({'Threads': 2, 'Hash': 128})
    bad = len(errs)
    try:
        for p in data:
            if only and p['id'] not in only:
                continue
            b = chess.Board(p['fen'])
            infos = eng.analyse(b, chess.engine.Limit(depth=22), multipv=3)
            tops = ', '.join(f"{b.san(i['pv'][0])} {user_cp(i['score'], p['side'])}" for i in infos)
            best = user_cp(infos[0]['score'], p['side'])
            note = ''
            if p['goal'] == 'win' and best < WIN_CP:
                note = '  WARNUNG: Start nicht klar gewonnen'
            if p['goal'] == 'draw' and abs(best) > p.get('drawMargin', DRAW_MARGIN):
                note = '  WARNUNG: Start nicht klar remis'
            print(f"{p['id']:22s} L{p['level']} {p['side']} {p['goal']:4s} max {p['maxMoves']:2d} | {tops}{note}")
            if quick:
                continue
            st, why, n, sans = selfplay(eng, p, ms)
            flag = 'OK ' if st == 'won' else 'XX '
            if st != 'won':
                bad += 1
            print(f"   {flag}{why} nach {n} Zügen (par {p.get('par', '-')}): {' '.join(sans[:24])}{' …' if len(sans) > 24 else ''}")
    finally:
        eng.quit()
    print('Fehler:', bad)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
