"""Paso 1 — Ingesta: CSV o zips de FIRMS → fires_raw (Parquet data/raw/sensor=*/year=*).

Todo como VARCHAR y con los nombres originales; se agregan sensor, country, source_file,
row_number e ingested_at. data/raw/ se reconstruye entera en cada corrida (idempotente).
"""
from __future__ import annotations

import logging
import re
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .config import Config
from .db import reset_dir
from .qc import clear_step, write_qc

log = logging.getLogger(__name__)

# modis_2020_Argentina.csv, viirs-jpss1_2020_Argentina.csv, viirs-snpp_2015_Rio_Negro.csv
NAME_RE = re.compile(r"^(?P<prefix>[A-Za-z0-9\-]+)_(?P<year>\d{4})_(?P<country>[^.]+)\.csv$", re.I)


@dataclass
class Source:
    label: str                      # source_file: "<zip>!<miembro>" o ruta relativa del CSV
    country: str
    path: Callable[[Path], Path]    # devuelve una ruta legible del CSV (extrae del zip si hace falta)


def discover(cfg: Config) -> list[Source]:
    """Zips y CSV sueltos en input_dir, filtrados por los países de la configuración."""
    root = cfg.input_dir
    if not root.exists():
        raise FileNotFoundError(f"No existe {root}. Bajar los datos: python scripts/descargar_firms.py")
    countries = {c.lower() for c in (cfg.get("countries") or [])}
    out: list[Source] = []

    def country_of(name: str) -> str:
        m = NAME_RE.match(Path(name).name)
        if m:
            return m.group("country").replace("_", " ")
        return cfg.get("default_country") or "unknown"

    def keep(country: str) -> bool:
        return not countries or country.lower() in countries

    for z in sorted(root.rglob("*.zip")):
        with zipfile.ZipFile(z) as zf:
            members = sorted(n for n in zf.namelist() if n.lower().endswith(".csv"))
        for m in members:
            c = country_of(m)
            if keep(c):
                out.append(Source(f"{z.name}!{m}", c, _extract(z, m)))
    for f in sorted(root.rglob("*.csv")):
        c = country_of(f.name)
        if keep(c):
            out.append(Source(str(f.relative_to(root)), c, lambda tmp, f=f: f))
    return out


def _extract(zpath: Path, member: str):
    def get(tmp: Path) -> Path:
        dest = tmp / "zipmember.csv"
        with zipfile.ZipFile(zpath) as zf, zf.open(member) as src, open(dest, "wb") as dst:
            while chunk := src.read(1 << 20):
                dst.write(chunk)
        return dest
    return get


def detect_sensor(header: str) -> str:
    cols = {c.strip().strip('"').lower() for c in header.split(",")}
    if "bright_ti4" in cols:
        return "VIIRS"
    if "brightness" in cols:
        return "MODIS"
    raise ValueError(f"No se reconoce el sensor por las columnas: {header}")


def _count_rows(path: Path) -> tuple[str, int]:
    """Encabezado y cantidad de filas no vacías del CSV."""
    header, n = "", 0
    with open(path, "rb") as f:
        for i, line in enumerate(f):
            if i == 0:
                header = line.decode("utf-8-sig", errors="replace").strip()
            elif line.strip():
                n += 1
    return header, n


def run(cfg: Config, con) -> dict:
    sources = discover(cfg)
    raw_dir = cfg.parquet_dir("raw")
    con.execute("DROP VIEW IF EXISTS fires_raw")
    reset_dir(raw_dir)
    clear_step(con, "ingest")
    clear_step(con, "ingest_skipped")
    totals: dict[tuple[str, int], list[int]] = {}
    skipped: list[str] = []

    with tempfile.TemporaryDirectory(prefix="ingesta_") as tmp:
        for idx, src in enumerate(sources):
            path = src.path(Path(tmp))
            header, expected = _count_rows(path)
            if not header:
                skipped.append(f"{src.label}: vacío")
                continue
            if expected == 0:
                skipped.append(f"{src.label}: sin filas")
                continue
            sensor = detect_sensor(header)
            label, country = src.label.replace("'", "''"), src.country.replace("'", "''")
            # row_number = orden real del archivo: parallel=false + row_number() sobre el escaneo (§1).
            con.execute(f"""
                CREATE OR REPLACE TEMP TABLE _ingest AS
                SELECT *,
                       '{sensor}' AS sensor,
                       COALESCE(TRY_CAST(substr(acq_date, 1, 4) AS INTEGER), 0) AS year,
                       '{country}' AS country,
                       '{label}' AS source_file,
                       CAST(row_number() OVER () AS INTEGER) AS row_number,
                       current_timestamp AS ingested_at
                FROM read_csv('{path}', header = true, all_varchar = true, parallel = false,
                              delim = ',', quote = '"')
            """)
            n = con.execute("SELECT count(*) FROM _ingest").fetchone()[0]
            if n != expected:
                raise RuntimeError(f"{src.label}: se leyeron {n} filas y el CSV tiene {expected}")
            con.execute(f"""
                COPY _ingest TO '{raw_dir}' (FORMAT parquet, PARTITION_BY (sensor, year),
                     OVERWRITE_OR_IGNORE, FILENAME_PATTERN 'f{idx:05d}_{{i}}')
            """)
            for year, cnt in con.execute("SELECT year, count(*) FROM _ingest GROUP BY 1").fetchall():
                t = totals.setdefault((sensor, year), [0, 0])
                t[0] += cnt
                t[1] += 1
            log.info("ingesta %s: %d filas (%s)", src.label, n, sensor)
    con.execute("DROP TABLE IF EXISTS _ingest")

    for (sensor, year), (n, files) in sorted(totals.items()):
        write_qc(con, cfg, sensor=sensor, year=year, step="ingest", rows_in=n, rows_out=n,
                 detail=f"{files} archivos")
    if skipped:
        write_qc(con, cfg, sensor=None, year=None, step="ingest_skipped", rows_in=0, rows_out=0,
                 detail="; ".join(skipped))
    total = sum(t[0] for t in totals.values())
    log.info("ingesta: %d archivos, %d filas, %d omitidos", len(sources) - len(skipped), total, len(skipped))
    return {"files": len(sources) - len(skipped), "rows": total, "skipped": skipped}
