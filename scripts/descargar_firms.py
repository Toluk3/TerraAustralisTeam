#!/usr/bin/env python3
"""Descarga los CSV anuales por país del archivo de FIRMS (MODIS y VIIRS).

Fuente pública, sin clave: https://firms.modaps.eosdis.nasa.gov/data/country/
  <sensor>/<año>/<sensor>_<año>_<País>.csv

Los archivos quedan en Datos/<sensor>/<año>/, con la misma estructura que los zips
<sensor>_<año>_all_countries.zip, así que el pipeline lee cualquiera de las dos cosas.

Si un país no tuvo detecciones ese año, o el año todavía no está publicado, FIRMS devuelve 404:
se registra y se sigue (para el pipeline, la ausencia equivale a 0 focos).

Para los meses que todavía no están en el archivo anual (datos NRT), ver --nrt: usa la API de
área de FIRMS, que pide una MAP_KEY gratuita en la variable de entorno FIRMS_MAP_KEY.

Ejemplos:
  python scripts/descargar_firms.py                                   # Argentina, todo
  python scripts/descargar_firms.py --sensores modis --anios 2018-2021
  python scripts/descargar_firms.py --paises Argentina Chile --anios 2020
  FIRMS_MAP_KEY=... python scripts/descargar_firms.py --nrt --desde 2026-01-01
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
USER_AGENT = "terraaustralis-pipeline/1.0"

# sensor del archivo → (primer año, nombre en el pipeline)
SENSORES = {
    "modis": (2000, "MODIS Terra + Aqua"),
    "viirs-snpp": (2012, "VIIRS Suomi NPP"),
    "viirs-jpss1": (2018, "VIIRS NOAA-20"),
}
# Fuentes NRT de la API de área
NRT_SOURCES = ["MODIS_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT"]
# Caja de Argentina (oeste, sur, este, norte) para la API de área
BBOX = {"Argentina": (-73.6, -55.1, -53.6, -21.7)}


def parse_years(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += range(int(a), int(b) + 1)
        else:
            out.append(int(part))
    return out


def _request(url: str, method: str = "GET", range_: str | None = None):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    if range_:
        req.add_header("Range", range_)
    return urllib.request.urlopen(req, timeout=120)


def remote_size(url: str) -> int | None:
    try:
        with _request(url, "HEAD") as r:
            return int(r.headers.get("Content-Length") or 0) or None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return -1
        raise


def download(url: str, dest: Path, retries: int = 3) -> int:
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        try:
            with _request(url) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            tmp.replace(dest)
            return dest.stat().st_size
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code == 404:
                raise
            if attempt == retries:
                raise
            time.sleep(5 * attempt)
    return 0


def descargar_archivo(destino: Path, sensores: list[str], anios: list[int] | None,
                      paises: list[str], forzar: bool) -> dict:
    last_year = dt.date.today().year
    log = {"descargados": [], "existentes": [], "no_publicados": []}
    for sensor in sensores:
        first, nombre = SENSORES[sensor]
        years = [y for y in (anios or range(first, last_year + 1)) if y >= first]
        for year in years:
            for pais in paises:
                name = f"{sensor}_{year}_{pais.replace(' ', '_')}.csv"
                url = f"{BASE}/{sensor}/{year}/{name}"
                dest = destino / sensor / str(year) / name
                size = remote_size(url)
                if size == -1:
                    print(f"  -    {name}: no publicado (404)")
                    log["no_publicados"].append(name)
                    continue
                if dest.exists() and not forzar and (size is None or dest.stat().st_size == size):
                    print(f"  =    {name}: ya está ({dest.stat().st_size / 1e6:.1f} MB)")
                    log["existentes"].append(name)
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                n = download(url, dest)
                print(f"  ok   {name}: {n / 1e6:.1f} MB ({nombre})")
                log["descargados"].append(name)
    return log


def descargar_nrt(destino: Path, paises: list[str], desde: dt.date, hasta: dt.date,
                  fuentes: list[str]) -> dict:
    key = os.environ.get("FIRMS_MAP_KEY")
    if not key:
        sys.exit("Falta FIRMS_MAP_KEY. Se pide gratis en https://firms.modaps.eosdis.nasa.gov/api/map_key/")
    log = {"descargados": []}
    for pais in paises:
        if pais not in BBOX:
            sys.exit(f"No hay caja definida para {pais}; agregala en BBOX")
        w, s, e, n = BBOX[pais]
        for fuente in fuentes:
            d = desde
            while d <= hasta:
                days = min(5, (hasta - d).days + 1)  # la API devuelve como máximo 5 días por pedido
                url = f"{API}/{key}/{fuente}/{w},{s},{e},{n}/{days}/{d.isoformat()}"
                # El nombre no sigue <sensor>_<año>_<País>.csv: el pipeline le asigna default_country.
                dest = destino / "nrt" / fuente / f"{fuente}_{d.isoformat()}_{days}d.csv"
                dest.parent.mkdir(parents=True, exist_ok=True)
                with _request(url) as r:
                    body = r.read()
                if body.lstrip().startswith(b"Invalid") or body.lstrip().startswith(b"{"):
                    sys.exit(f"Error de la API de FIRMS: {body[:200].decode(errors='replace')}")
                dest.write_bytes(body)
                rows = max(body.count(b"\n") - 1, 0)
                print(f"  ok   {dest.name}: {rows} focos")
                log["descargados"].append(dest.name)
                d += dt.timedelta(days=days)
                time.sleep(1)  # la API limita pedidos por minuto
    return log


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--destino", default="Datos", help="carpeta de salida (por defecto Datos/)")
    ap.add_argument("--paises", nargs="+", default=["Argentina"])
    ap.add_argument("--sensores", nargs="+", default=list(SENSORES), choices=list(SENSORES))
    ap.add_argument("--anios", help="ej. 2018-2021 o 2010,2015,2020 (por defecto, todos los publicados)")
    ap.add_argument("--forzar", action="store_true", help="volver a bajar aunque el archivo ya esté")
    ap.add_argument("--nrt", action="store_true", help="bajar datos NRT recientes con la API (FIRMS_MAP_KEY)")
    ap.add_argument("--desde", help="NRT: primera fecha (YYYY-MM-DD)")
    ap.add_argument("--hasta", help="NRT: última fecha (por defecto, hoy)")
    ap.add_argument("--fuentes-nrt", nargs="+", default=NRT_SOURCES)
    args = ap.parse_args(argv)

    destino = Path(args.destino)
    if args.nrt:
        if not args.desde:
            ap.error("--nrt necesita --desde")
        hasta = dt.date.fromisoformat(args.hasta) if args.hasta else dt.date.today()
        log = descargar_nrt(destino, args.paises, dt.date.fromisoformat(args.desde), hasta, args.fuentes_nrt)
    else:
        anios = parse_years(args.anios) if args.anios else None
        log = descargar_archivo(destino, args.sensores, anios, args.paises, args.forzar)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "descarga_log.json").write_text(json.dumps(
        {"fecha": dt.datetime.now().isoformat(timespec="seconds"), "args": vars(args), **log},
        indent=2, ensure_ascii=False))
    print(f"\nListo: {len(log['descargados'])} descargados, "
          f"{len(log.get('existentes', []))} ya estaban, {len(log.get('no_publicados', []))} no publicados.")


if __name__ == "__main__":
    main()
