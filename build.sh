#!/usr/bin/env bash
set -euo pipefail
echo "=== SubSaverPH build ==="
echo "pwd=$(pwd)"
echo "ls=$(ls -la)"
if command -v python3 >/dev/null 2>&1; then
  PY=python3
else
  PY=python
fi
echo "using $PY ($($PY --version))"
$PY -m pip install --upgrade pip
$PY -m pip install -r requirements.txt
$PY -c "import flask; import waitress; print('OK flask', flask.__version__, 'waitress ok')"
echo "=== build done ==="
