#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Prefer python3 on Linux (Render)
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "ERROR: python not found" >&2
  exit 127
fi

echo "Using: $($PY --version)"
echo "Starting SubSaverPH on PORT=${PORT:-8790}"

# Try gunicorn first, fall back to Flask
if $PY -c "import gunicorn" 2>/dev/null; then
  exec $PY -m gunicorn server:app --bind "0.0.0.0:${PORT:-8790}" --workers 1 --threads 4 --timeout 120
else
  exec $PY server.py
fi
