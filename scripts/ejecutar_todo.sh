#!/usr/bin/env bash
# Descarga los datos que falten, arma la zona y corre el pipeline completo.
# Uso: scripts/ejecutar_todo.sh [argumentos extra para descargar_firms.py]
set -euo pipefail
cd "$(dirname "$0")/.."

PYTHON=$(command -v python3 || command -v python)
if [ ! -d .venv ]; then
  "$PYTHON" -m venv .venv
  NEW_VENV=1
fi
# En Windows (Git Bash) el venv usa Scripts/ en lugar de bin/
if [ -x .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python.exe; else PY=.venv/bin/python; fi
[ -z "${NEW_VENV:-}" ] || $PY -m pip install -q -r requirements.txt

$PY scripts/descargar_firms.py "$@"
[ -f zona/rio_negro_neuquen.geojson ] || $PY scripts/descargar_zona.py
$PY -m pipeline all
$PY -m pipeline status
