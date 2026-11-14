#!/usr/bin/env bash
# Corre todos los lotes en el orden que pide la calibración común (lotes/_comun.yaml):
#   1. fase 1 (ingest → aggregate) de L1–L4 y L6
#   2. fase 2 (calibrate → qc) de los mismos: el primero ajusta k con todos y el resto lo copia
#   3. las variantes L5, que calibran solas
# Uso: bash lotes/correr_todos.sh        Logs: data/lotes/logs/<lote>.log
set -uo pipefail
cd "$(dirname "$0")/.."
if [ -x .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python.exe; else PY=.venv/bin/python; fi
mkdir -p data/lotes/logs
COMUNES=$(grep -l "^extends: _comun.yaml" lotes/*.yaml | xargs -n1 basename | sed 's/\.yaml$//')
correr() {  # lote, argumentos extra
  local lote=$1; shift
  echo "inicio $lote $* $(date +%T)"
  PYTHONIOENCODING=utf-8 "$PY" lotes/correr_lote.py "$lote" "$@" >> "data/lotes/logs/$lote.log" 2>&1 \
    || { echo "FALLO $lote $*"; return 1; }
}
for l in $COMUNES; do correr "$l" --fase 1 || exit 1; done
for l in $COMUNES; do correr "$l" --fase 2 || exit 1; done
for f in lotes/L5_*.yaml; do correr "$(basename "$f" .yaml)" || exit 1; done
echo "listo $(date +%T)"
