"""Datos sintéticos en formato FIRMS y una corrida completa del pipeline para las pruebas."""
from __future__ import annotations

import csv
import datetime as dt
import json
import random
from pathlib import Path

import pytest

from pipeline import aggregate, calibrate, detect, ingest, normalize, qc, rollup, support, validate, zone
from pipeline.config import load_config
from pipeline.db import connect

ROOT = Path(__file__).resolve().parents[1]
MODIS_COLS = ["latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time", "satellite",
              "instrument", "confidence", "version", "bright_t31", "frp", "daynight", "type"]
VIIRS_COLS = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite",
              "instrument", "confidence", "version", "bright_ti5", "frp", "daynight", "type"]

# Zona de prueba: rectángulo en Neuquén
ZONE = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "test"},
        "geometry": {"type": "Polygon", "coordinates": [[[-70, -41], [-66, -41], [-66, -37], [-70, -37], [-70, -41]]]}}]}


def modis_row(lat, lon, date, hhmm, sat, conf=70, version="6.03", dn="D", typ="0", bright=320.0):
    return [lat, lon, bright, 1.2, 1.1, date, hhmm, sat, "MODIS", conf, version, 295.0, 12.5, dn, typ]


def viirs_row(lat, lon, date, hhmm, sat="N20", conf="n", version="2", dn="D", typ="0", bright=330.0):
    return [lat, lon, bright, 0.4, 0.45, date, hhmm, sat, "VIIRS", conf, version, 290.0, 3.2, dn, typ]


def write_csv(path: Path, cols, rows) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)


def synthetic(datos: Path, seed: int = 7) -> None:
    """2019–2022: incendios con 1 píxel Terra, 1–2 Aqua y ~3–4 píxeles NOAA-20 cada uno."""
    rng = random.Random(seed)
    by_year: dict[tuple[str, int], list] = {}
    d = dt.date(2019, 1, 1)
    while d <= dt.date(2022, 12, 31):
        for _ in range(rng.randint(3, 8)):
            lat, lon = rng.uniform(-40.5, -37.5), rng.uniform(-69.5, -66.5)
            if rng.random() < 0.5:   # la mitad, en el resto de Argentina (fuera de la zona)
                lat, lon = rng.uniform(-34, -26), rng.uniform(-64, -58)
            night = rng.random() < 0.3
            ds = d.isoformat()
            # hora UTC ≈ hora solar − lon/15 (lon ≈ −60 → +4 h)
            t_terra, t_aqua, t_n20 = ("0230", "0530", "0600") if night else ("1430", "1730", "1800")
            dn = "N" if night else "D"
            m = by_year.setdefault(("modis", d.year), [])
            v = by_year.setdefault(("viirs-jpss1", d.year), [])
            m.append(modis_row(round(lat, 4), round(lon, 4), ds, t_terra, "Terra", dn=dn))
            for i in range(rng.randint(1, 2)):
                m.append(modis_row(round(lat + 0.01 * i, 4), round(lon, 4), ds, t_aqua, "Aqua", dn=dn))
            for i in range(rng.randint(3, 4 if not night else 6)):
                v.append(viirs_row(round(lat + 0.004 * i, 5), round(lon + 0.003 * i, 5), ds, t_n20, dn=dn))
        d += dt.timedelta(days=2)
    for (sensor, year), rows in by_year.items():
        write_csv(datos / sensor / str(year) / f"{sensor}_{year}_Argentina.csv",
                  MODIS_COLS if sensor == "modis" else VIIRS_COLS, rows)


def special_rows(datos: Path) -> None:
    """Filas escritas a mano con el resultado esperado (prueba 1)."""
    m = [
        modis_row(-38.5, -68.0, "2019-06-01", "231", "Terra", conf=29),      # low_conf; acq_time sin cero
        modis_row(-38.5, -68.1, "2019-06-01", "0231", "Terra", conf=30),     # nominal
        modis_row(-38.5, -68.2, "2019-06-01", "0231", "Terra", conf=79),     # nominal
        modis_row(-38.5, -68.3, "2019-06-01", "0231", "Terra", conf=80),     # high
        modis_row(-38.5, -68.4, "2019-06-01", "0231", "Aqua", typ="2"),      # type_2
        modis_row(-38.5, -68.5, "2019-06-01", "0231", "Aqua", typ="1"),      # type_1
        modis_row(-38.5, -68.6, "2019-06-01", "0231", "Aqua", typ="3"),      # type_3
        modis_row(-95.0, -68.6, "2019-06-01", "0231", "Aqua"),               # out_of_range (latitud)
        modis_row(-38.5, -68.7, "2019-06-01", "0231", "Aqua", bright=900),   # out_of_range (t_mir)
        modis_row(-38.5, -68.8, "2019-13-45", "0231", "Aqua"),               # out_of_range (fecha)
        modis_row(-38.6, -68.9, "2019-06-02", "1500", "Aqua"),               # duplicado de la siguiente
        modis_row(-38.6, -68.9, "2019-06-02", "1500", "Aqua"),               # duplicate
        modis_row(-38.6, -68.9, "2019-06-02", "1500", "Terra"),              # otra plataforma: se queda
        modis_row(-38.6, -69.0, "2019-06-02", "1500", "Aqua", version="6.2"),  # algo_epoch c6_v2
    ]
    v = [
        viirs_row(-38.7, -68.0, "2019-06-03", "0400", conf="l"),             # low_conf
        viirs_row(-38.7, -68.1, "2019-06-03", "0400", conf="h"),             # high
        viirs_row(-38.7, -68.2, "2019-06-03", "0400", conf="x"),             # out_of_range (confianza)
        viirs_row(-38.7, -68.3, "2019-06-03", "0400", typ="2"),              # type_2
        viirs_row(25.0, 150.0, "2019-06-03", "0330"),                        # local_date: 2019-06-03 13:30
        viirs_row(-38.7, -68.4, "2019-06-03", "0400", version="2.0NRT"),     # is_nrt
        # Una pasada que cruza las 00:00 UTC (borde de las viejas ventanas de 50 min) y otra 2 h después
        viirs_row(-39.5, -67.5, "2019-06-02", "2359", dn="N"),
        viirs_row(-39.5001, -67.5001, "2019-06-03", "0001", dn="N"),
        viirs_row(-39.5002, -67.5002, "2019-06-03", "0201", dn="N"),
    ]
    write_csv(datos / "especiales" / "modis_2019_Argentina.csv", MODIS_COLS, m)
    write_csv(datos / "especiales" / "viirs-jpss1_2019_Argentina.csv", VIIRS_COLS, v)
    # Prueba 4: CSV vacío y CSV solo con encabezado no rompen la ingesta
    (datos / "especiales" / "modis_2020_Argentina.csv").write_text("")
    write_csv(datos / "especiales" / "viirs-jpss1_2020_Argentina.csv", VIIRS_COLS, [])
    # País que no está en la configuración: se ignora
    write_csv(datos / "especiales" / "modis_2019_Chile.csv", MODIS_COLS,
              [modis_row(-38.0, -71.0, "2019-06-01", "1500", "Terra")])


def make_config(tmp: Path, **overrides):
    (tmp / "zona").mkdir(exist_ok=True)
    (tmp / "zona" / "z.geojson").write_text(json.dumps(ZONE))
    cfg_text = (ROOT / "config.yaml").read_text(encoding="utf-8")
    (tmp / "config.yaml").write_text(cfg_text, encoding="utf-8")
    base = {"calendar_start": "2018-01-01", "min_source_count": 20, "bootstrap_reps": 20,
            "use_static_mask": False, "zone": {"outline": "zona/z.geojson", "map_resolutions": [6, 7]}}
    base.update(overrides)
    return load_config(tmp / "config.yaml", overrides=base)


def run_all(cfg):
    con = connect(cfg)
    for step in (ingest, normalize, support, aggregate, detect, calibrate, rollup, validate, qc, zone):
        step.run(cfg, con)
    return con


@pytest.fixture(scope="session")
def pipeline_run(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("run")
    synthetic(tmp / "Datos")
    special_rows(tmp / "Datos")
    cfg = make_config(tmp)
    con = run_all(cfg)
    yield cfg, con
    con.close()
