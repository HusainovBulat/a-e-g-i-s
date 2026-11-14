#!/usr/bin/env sh
# One-click start for macOS / Linux: ./start.sh
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env

# Host LAN addresses for the phone QR code (the container cannot see them itself).
HOSTS=$( (hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true) \
  | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | grep -v '^172\.1[7-9]\.' | paste -sd, - || true)
export AEGIS_PUBLIC_HOSTS="$HOSTS"

print_urls() {
  echo
  echo "A.E.G.I.S. is running: http://localhost:8000/docs"
  echo "Phone / console on the same Wi-Fi:"
  for h in $(echo "$HOSTS" | tr ',' ' '); do echo "  http://$h:8000   ws://$h:8000/ws/sensors"; done
}

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Building and starting A.E.G.I.S. (first run takes ~1-2 min)..."
  docker compose up -d --build
  i=0
  until curl -s http://localhost:8000/health >/dev/null 2>&1; do
    i=$((i+1)); [ $i -gt 90 ] && { echo "Server did not start: docker compose logs"; exit 1; }
    sleep 1
  done
  print_urls
  echo "Stop: ./stop.sh   Logs: docker compose logs -f"
  (command -v open >/dev/null && open http://localhost:8000/docs) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8000/docs) || true
else
  echo "Docker not available - using local Python 3.11+"
  PY=$(command -v python3 || command -v python)
  [ -d .venv ] || "$PY" -m venv .venv
  . .venv/bin/activate
  pip install -q -r requirements.txt
  print_urls
  exec python run.py
fi
