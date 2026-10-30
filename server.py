"""Lokaler Server für den Schachtrainer.

Start:  .venv/bin/python server.py   (oder Doppelklick auf start.command)
Liefert app/ aus und bietet:
  GET  /api/progress          Fortschritt laden (data/progress.json)
  PUT  /api/progress          Fortschritt speichern (+ tägliche Sicherung)
  POST /api/engine            Stockfish: {fen, depth?|nodes?|movetime?, multipv?, elo?}
  POST /api/sync              neue Partien von chess.com holen und analysieren (analysis/sync.py)
"""
import datetime
import json
import os
import shutil
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import chess
import chess.engine

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, "app")
DATA = os.path.join(ROOT, "data")
PROGRESS = os.path.join(DATA, "progress.json")
BACKUPS = os.path.join(DATA, "backups")
ENGINE_PATH = os.path.join(ROOT, "tools", "stockfish", "stockfish-macos-universal")
PORT = int(os.environ.get("PORT", "8765"))

_engine_lock = threading.Lock()
_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
        _engine.configure({"Threads": 4, "Hash": 256})
    return _engine


def score_json(score):
    """Bewertung immer aus Sicht von Weiß."""
    w = score.white()
    if w.is_mate():
        return {"mate": w.mate()}
    return {"cp": w.score()}


def run_engine(req):
    board = chess.Board(req["fen"])
    if board.is_game_over():
        return {"lines": [], "bestmove": None, "gameOver": board.result(claim_draw=True)}
    if "movetime" in req:
        limit = chess.engine.Limit(time=float(req["movetime"]) / 1000)
    elif "nodes" in req:
        limit = chess.engine.Limit(nodes=int(req["nodes"]))
    else:
        limit = chess.engine.Limit(depth=int(req.get("depth", 16)))
    multipv = max(1, min(5, int(req.get("multipv", 1))))
    global _engine
    with _engine_lock:
        try:
            eng = get_engine()
            elo = req.get("elo")
            if elo:
                eng.configure({"UCI_LimitStrength": True, "UCI_Elo": max(1320, min(3190, int(elo)))})
            else:
                eng.configure({"UCI_LimitStrength": False})
            if elo and int(elo) < 1320:
                # Unter 1320 kennt Stockfish keinen Elo-Wert, dann über Skill Level schwächen
                eng.configure({"UCI_LimitStrength": False, "Skill Level": max(0, (int(elo) - 600) // 40)})
            else:
                eng.configure({"Skill Level": 20})
            if elo:
                result = eng.play(board, limit)
                return {"lines": [], "bestmove": result.move.uci() if result.move else None}
            infos = eng.analyse(board, limit, multipv=multipv)
        except chess.engine.EngineError:
            _engine = None
            raise
    if isinstance(infos, dict):
        infos = [infos]
    lines = []
    for info in infos:
        pv = info.get("pv", [])
        san, b = [], board.copy()
        for m in pv:
            san.append(b.san(m))
            b.push(m)
        lines.append({
            "score": score_json(info["score"]),
            "pv": [m.uci() for m in pv],
            "san": san,
            "depth": info.get("depth"),
        })
    return {"lines": lines, "bestmove": lines[0]["pv"][0] if lines and lines[0]["pv"] else None}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP, **kwargs)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8") or "{}")

    def do_GET(self):
        if self.path == "/api/progress":
            if os.path.exists(PROGRESS):
                with open(PROGRESS, encoding="utf-8") as fh:
                    return self.send_json(json.load(fh))
            return self.send_json({})
        return super().do_GET()

    def do_PUT(self):
        if self.path != "/api/progress":
            return self.send_json({"error": "unbekannt"}, 404)
        data = self.read_json()
        os.makedirs(BACKUPS, exist_ok=True)
        tmp = PROGRESS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, PROGRESS)
        backup = os.path.join(BACKUPS, "progress-%s.json" % datetime.date.today().isoformat())
        if not os.path.exists(backup):
            shutil.copy(PROGRESS, backup)
        return self.send_json({"ok": True})

    def do_POST(self):
        try:
            if self.path == "/api/engine":
                return self.send_json(run_engine(self.read_json()))
            if self.path == "/api/sync":
                script = os.path.join(ROOT, "analysis", "sync.py")
                proc = subprocess.run([sys.executable, "-I", script], capture_output=True, text=True, timeout=3600, cwd=ROOT)
                last = (proc.stdout.strip().splitlines() or ["{}"])[-1]
                try:
                    result = json.loads(last)
                except ValueError:
                    result = {"message": last}
                result["ok"] = proc.returncode == 0
                if proc.returncode != 0:
                    result["error"] = proc.stderr[-2000:]
                return self.send_json(result, 200 if proc.returncode == 0 else 500)
        except Exception as exc:  # Fehler an die Oberfläche melden statt Verbindung abbrechen
            return self.send_json({"error": str(exc)}, 500)
        return self.send_json({"error": "unbekannt"}, 404)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("Schachtrainer läuft auf http://localhost:%d" % PORT, flush=True)
    try:
        server.serve_forever()
    finally:
        if _engine:
            _engine.quit()


if __name__ == "__main__":
    main()
