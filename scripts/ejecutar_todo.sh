#!/usr/bin/env bash
# Descarga los datos que falten, arma la zona y corre el pipeline completo.
# Uso: scripts/ejecutar_todo.sh [argumentos extra para descargar_firms.py]
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
PY=.venv/bin/python

$PY scripts/descargar_firms.py "$@"
[ -f zona/rio_negro_neuquen.geojson ] || $PY scripts/descargar_zona.py
$PY -m pipeline all
$PY -m pipeline status
