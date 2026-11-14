#!/usr/bin/env python3
"""Descarga el contorno de la zona de la demo (Río Negro y Neuquén) desde geoBoundaries.

Fuente: geoBoundaries gbOpen ARG ADM1 (provincias), licencia CC BY 2.5.
https://www.geoboundaries.org/api/current/gbOpen/ARG/ADM1/

Uso:
  python scripts/descargar_zona.py                       # zona/rio_negro_neuquen.geojson
  python scripts/descargar_zona.py --provincias "Río Negro" Neuquén Chubut --salida zona/otra.geojson
"""
from __future__ import annotations

import argparse
import json
import unicodedata
import urllib.request
from pathlib import Path

API = "https://www.geoboundaries.org/api/current/gbOpen/ARG/ADM1/"
USER_AGENT = "terraaustralis-pipeline/1.0"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def _norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower().strip()


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--provincias", nargs="+", default=["Río Negro", "Neuquén"])
    ap.add_argument("--salida", default="zona/rio_negro_neuquen.geojson")
    args = ap.parse_args(argv)

    meta = json.loads(_get(API))
    gj = json.loads(_get(meta["simplifiedGeometryGeoJSON"]))
    wanted = {_norm(p) for p in args.provincias}
    feats = [f for f in gj["features"] if _norm(f["properties"].get("shapeName", "")) in wanted]
    found = {_norm(f["properties"]["shapeName"]) for f in feats}
    if missing := wanted - found:
        names = sorted(f["properties"].get("shapeName") for f in gj["features"])
        raise SystemExit(f"No se encontraron {sorted(missing)}. Provincias disponibles: {names}")
    out = {
        "type": "FeatureCollection",
        "name": " y ".join(args.provincias),
        "attribution": f"geoBoundaries gbOpen ARG ADM1 ({meta.get('boundaryLicense')}), "
                       f"{meta.get('boundarySource')}",
        "features": [{"type": "Feature", "properties": {"name": f["properties"]["shapeName"]},
                      "geometry": f["geometry"]} for f in feats],
    }
    dest = Path(args.salida)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"ok {dest}: {', '.join(f['properties']['shapeName'] for f in feats)}")


if __name__ == "__main__":
    main()
