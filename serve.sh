#!/bin/sh
# Serve Auslan Tutor on http://localhost:8000 (the camera needs localhost, not file://).
# If it's already running, just open the browser.
cd "$(dirname "$0")" || exit 1
PORT="${1:-8000}"
URL="http://localhost:$PORT/"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Auslan Tutor is already running → $URL"
  open "$URL"
  exit 0
fi

( sleep 1; open "$URL" ) &
echo "Auslan Tutor → $URL  (Ctrl+C to stop)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
