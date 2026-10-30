#!/bin/zsh
# Doppelklick startet den Schachtrainer und öffnet ihn im Browser.
cd "$(dirname "$0")"
if ! curl -s -o /dev/null http://localhost:8765/; then
  .venv/bin/python server.py &
  sleep 1
fi
open http://localhost:8765/
wait
