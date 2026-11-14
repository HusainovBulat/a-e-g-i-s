#!/usr/bin/env sh
# A.E.G.I.S. one-click start for macOS / Linux:  ./start.sh   (macOS Finder: double-click start.command)
#   * Docker (recommended): backend + console + HTTPS proxy for phones; certificates are created
#     automatically inside Docker (no mkcert, no sudo).
#   * No Docker: local Python 3.11+ and Node.js 20+ (phones over plain HTTP).
# Re-run it on a new network: links and the certificate are refreshed, phones keep trusting the CA.
set -e
cd "$(dirname "$0")"
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; } || true

# Laptop LAN addresses for the phone QR code and certificate (containers cannot see them).
lan_ips() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 -o addr show scope global 2>/dev/null \
      | awk '$2 !~ /^(docker|br-|veth|virbr|lxc|cni|flannel|podman|tailscale|zt|vmnet|vboxnet)/ {split($4, a, "/"); print a[1]}'
  elif command -v ipconfig >/dev/null 2>&1; then   # macOS
    for i in en0 en1 en2 en3 bridge100; do ipconfig getifaddr "$i" 2>/dev/null || true; done
  else
    hostname -I 2>/dev/null | tr ' ' '\n'
  fi
}
HOSTS=$(lan_ips | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | awk '!seen[$0]++' | paste -sd, - || true)
export AEGIS_PUBLIC_HOSTS="$HOSTS"
HOSTLIST=$(echo "$HOSTS" | tr ',' ' ')

open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  fi
  return 0
}

wait_ready() {
  echo; echo "Waiting for the services to come up..."
  i=0
  until curl -sf http://localhost:8000/health >/dev/null 2>&1 && curl -sf http://localhost:3000 >/dev/null 2>&1; do
    i=$((i + 1))
    [ $i -gt 180 ] && { echo "Services did not answer within 3 minutes. Details: docker compose logs"; exit 1; }
    sleep 1
  done
}

print_urls() {
  echo
  echo " ====================================================================="
  echo "  A.E.G.I.S. Mission Control is running"
  echo
  echo "  Laptop console:  http://localhost:3000"
  echo "  API / Swagger:   http://localhost:8000/docs"
  echo
  if [ -z "$HOSTLIST" ]; then
    echo "  Phones: no Wi-Fi / LAN connection found. Connect the laptop and run start again."
  elif [ "${AEGIS_PHONE_HTTPS:-}" = 1 ]; then
    echo "  Phone sensor page (same Wi-Fi, or scan the QR code in the console):"
    for h in $HOSTLIST; do echo "    https://$h/phone"; done
    echo
    echo "  iPhone, one time per phone (needed for fall / tilt sensors):"
    for h in $HOSTLIST; do echo "    1. Safari: http://$h/aegis-rootCA.crt  ->  Allow"; done
    echo "    2. Settings -> Profile Downloaded -> Install"
    echo "    3. Settings -> General -> About -> Certificate Trust Settings -> enable \"AEGIS Demo Local CA\""
    echo "    4. Open the phone page and tap \"Enable motion\""
    echo "  Android: open the phone page, tap Advanced -> Proceed."
  else
    echo "  Phone sensor page (same Wi-Fi, or scan the QR code in the console):"
    for h in $HOSTLIST; do echo "    http://$h:3000/phone"; done
  fi
  echo " ====================================================================="
  echo
}

docker_ready() {
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1 && return 0
  if [ "$(uname)" = Darwin ] && open -Ra Docker 2>/dev/null; then
    echo "Docker Desktop is not running - starting it, this can take a minute..."
    open -a Docker
    i=0
    until docker info >/dev/null 2>&1; do
      i=$((i + 1)); [ $i -gt 90 ] && { echo "Docker Desktop did not start in time."; return 1; }
      sleep 2
    done
    return 0
  fi
  echo "Docker is installed but not running (Linux: sudo systemctl start docker;"
  echo "permission denied? sudo usermod -aG docker \$USER and log in again)."
  return 1
}

# Only reads the firewall state and prints a hint; never changes it (that needs sudo / admin).
# Windows is handled by deploy/firewall.ps1 from start.bat.
firewall_hint() {   # $1 = docker | local
  FW=/usr/libexec/ApplicationFirewall/socketfilterfw
  if [ -x "$FW" ]; then   # macOS: off by default; per-app "Allow incoming connections?" prompts otherwise
    if "$FW" --getblockall 2>/dev/null | grep -qi 'enabled'; then
      echo "  ! macOS firewall blocks ALL incoming connections - phones cannot reach this Mac."
      echo "  ! System Settings -> Network -> Firewall -> Options -> turn off \"Block all incoming connections\"."
    elif [ "$1" = local ] && "$FW" --getglobalstate 2>/dev/null | grep -qi 'enabled'; then
      echo "  ! macOS firewall is on: click \"Allow\" when asked about incoming connections for python / node."
    fi
  elif [ "$1" = local ] && grep -qs '^ENABLED=yes' /etc/ufw/ufw.conf; then
    # Docker-published ports bypass ufw; the local Python / Node.js servers do not.
    echo "  ! ufw is active - let phones in once with:"
    echo "      sudo ufw allow proto tcp from any to any port 3000,8000 comment 'A.E.G.I.S. demo'"
  fi
}

# ------------------------------------------------------------------ Docker
if docker_ready; then
  echo; echo "[1/3] Building images (first run takes 3-5 min, later a few seconds)..."
  docker compose build

  echo; echo "[2/3] Starting the HTTPS proxy for phones..."
  export AEGIS_PHONE_HTTPS=1
  if ! docker compose up -d --force-recreate certs proxy; then
    export AEGIS_PHONE_HTTPS=0
    docker compose rm -sf proxy >/dev/null 2>&1 || true
    echo
    echo "  ! Ports 80/443 are busy (another web server?)."
    echo "  ! Continuing without HTTPS: phones use http://<ip>:3000/phone, iPhone motion sensors are off."
  fi

  echo; echo "[3/3] Starting backend + console..."
  docker compose up -d aegis console
  wait_ready
  print_urls
  firewall_hint docker
  echo "  Logs: docker compose logs -f"
  echo "  Stop: ./stop.sh  (you can close this window, the demo keeps running)"
  open_url http://localhost:3000
  exit 0
fi

# --------------------------------------------------------- Python fallback
echo
echo "Docker is not available - starting locally with Python + Node.js."
echo "(For the full demo incl. iPhone motion sensors install Docker: https://docs.docker.com/get-docker/)"
unset AEGIS_PHONE_HTTPS
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    PY=$c; break
  fi
done
[ -n "$PY" ] || { echo "Neither Docker nor Python 3.11+ was found. Install Docker (recommended) or Python 3.11+ and Node.js 20+."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Node.js 20+ is required for the web console: https://nodejs.org"; exit 1; }

[ -x .venv/bin/python ] || { echo "Creating Python virtual environment..."; "$PY" -m venv .venv; }
echo "Installing Python packages..."
.venv/bin/python -m pip install -q --disable-pip-version-check -r requirements.txt
[ -d frontend/node_modules ] || { echo "Installing web console packages..."; (cd frontend && npm ci --no-audit --no-fund); }

.venv/bin/python run.py &
BACK=$!
(cd frontend && npm run dev) &
FRONT=$!
trap 'kill $BACK $FRONT 2>/dev/null; exit 0' INT TERM
trap 'kill $BACK $FRONT 2>/dev/null' EXIT
wait_ready
print_urls
firewall_hint local
echo "  Stop: press Ctrl+C in this window"
open_url http://localhost:3000
wait
