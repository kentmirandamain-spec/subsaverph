#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-10000}"
if command -v python3 >/dev/null 2>&1; then
  exec python3 server.py
fi
if command -v python >/dev/null 2>&1; then
  exec python server.py
fi
echo "ERROR: neither python3 nor python found" >&2
exit 127
