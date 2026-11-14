#!/usr/bin/env python3
"""Descarga el contorno de uno o varios países desde geoBoundaries (ADM0, geometría simplificada).

Sirve para usar como zona (`zone.outline` de la configuración) una región de varios países.
Fuente: geoBoundaries gbOpen ADM0, licencia CC BY 4.0 / ODbL según el país (queda en `attribution`).

Uso:
  python scripts/descargar_paises.py ARG CHL URY BRA PRY BOL --salida zona/sudamerica_6.geojson
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

API = "https://www.geoboundaries.org/api/current/gbOpen/{iso}/ADM0/"
USER_AGENT = "terraaustralis-pipeline/1.0"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paises", nargs="+", help="códigos ISO 3166-1 alfa-3 (ARG, CHL, BRA, ...)")
    ap.add_argument("--salida", required=True)
    ap.add_argument("--nombre", help="nombre de la zona (por defecto, los códigos)")
    args = ap.parse_args(argv)

    feats, licencias = [], set()
    for iso in args.paises:
        meta = json.loads(_get(API.format(iso=iso.upper())))
        gj = json.loads(_get(meta["simplifiedGeometryGeoJSON"]))
        licencias.add(meta.get("boundaryLicense") or "?")
        for f in gj["features"]:
            feats.append({"type": "Feature", "properties": {"name": f["properties"].get("shapeName", iso), "iso": iso},
                          "geometry": f["geometry"]})
        print(f"ok {iso}: {meta.get('boundaryName', iso)}")
    out = {
        "type": "FeatureCollection",
        "name": args.nombre or ", ".join(args.paises),
        "attribution": f"geoBoundaries gbOpen ADM0 ({', '.join(sorted(licencias))})",
        "features": feats,
    }
    dest = Path(args.salida)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"ok {dest}: {len(feats)} polígonos, {dest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
