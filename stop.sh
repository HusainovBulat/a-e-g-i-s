#!/usr/bin/env sh
# Stops the Docker stack (certificate volumes are kept, so phones stay trusted).
# The local Python / Node.js fallback stops with Ctrl+C in the start window.
cd "$(dirname "$0")" && docker compose down && echo "All A.E.G.I.S. services stopped."
