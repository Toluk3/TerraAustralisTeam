"""Pasos 2–8 — fires_raw → fires_norm / fires_excluded, más la máscara estática (§3).

Una consulta SQL por sensor. Cada fila de fires_raw termina en exactamente una de las dos tablas.
drop_reason toma el primer motivo que aplica, en este orden:
out_of_range → type_1 / type_2 / type_3 → static_mask → low_conf → duplicate.
"""
from __future__ import annotations

import logging

from .config import CONF_ORDER, Config
from .db import has_parquet, read_parquet_sql, refresh_views, reset_dir
from .qc import clear_step, write_qc

log = logging.getLogger(__name__)

# Valor de `satellite` → platform. Un valor fuera de esta tabla es un error (§2).
PLATFORMS = {
    "MODIS": {"terra": "terra", "t": "terra", "aqua": "aqua", "a": "aqua"},
    "VIIRS": {"n": "snpp", "npp": "snpp", "n20": "noaa20", "1": "noaa20", "j1": "noaa20",
              "n21": "noaa21", "2": "noaa21", "j2": "noaa21"},
}
CHANNELS = {"MODIS": ("brightness", "bright_t31"), "VIIRS": ("bright_ti4", "bright_ti5")}

NORM_COLUMNS = [
    "source_file", "row_number", "sensor", "platform", "latitude", "longitude", "datetime_utc",
    "local_solar_hour", "local_date", "year", "month", "period_8d", "is_day", "overpass_bucket",
    "t_mir_k", "t_tir_k", "frp_mw", "scan_km", "track_km", "pixel_area_km2", "confidence_raw",
    "conf_class", "fire_type", "product_version", "algo_epoch", "is_nrt", "country",
    "h3_r8", "h3_r7", "raw_year",
]
NRT_RE = "(NRT|URT|RT)$"


def _case_map(expr: str, mapping: dict[str, str]) -> str:
    whens = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in mapping.items())
    return f"CASE lower(trim({expr})) {whens} END"


def _raw_columns(con, cfg: Config, sensor: str) -> set[str]:
    return {r[0] for r in con.execute(
        f"DESCRIBE SELECT * FROM {read_parquet_sql(cfg, 'raw', sensor)}").fetchall()}


def check_platforms(con, cfg: Config, sensor: str) -> None:
    known = ", ".join(f"'{k}'" for k in PLATFORMS[sensor])
    bad = con.execute(f"""
        SELECT DISTINCT satellite FROM {read_parquet_sql(cfg, 'raw', sensor)}
        WHERE satellite IS NULL OR lower(trim(satellite)) NOT IN ({known})
    """).fetchall()
    if bad:
        raise ValueError(f"{sensor}: valores de satellite desconocidos: {[b[0] for b in bad]}. "
                         f"Agregarlos en pipeline/normalize.py → PLATFORMS")


def build_static_mask(cfg: Config, con) -> int:
    """Celdas r8 donde VIIRS standard tuvo focos type <> 0 en >= mask_min_months meses (§3, paso 3)."""
    con.execute("DELETE FROM static_mask")
    if not cfg["use_static_mask"] or not has_parquet(cfg, "raw", "VIIRS"):
        log.info("máscara estática: desactivada o sin VIIRS; queda vacía")
        return 0
    if "type" not in _raw_columns(con, cfg, "VIIRS"):
        return 0
    r8 = cfg["h3"]["cluster_res"]
    con.execute(f"""
        INSERT INTO static_mask
        WITH src AS (
            SELECT TRY_CAST(latitude AS DOUBLE) lat, TRY_CAST(longitude AS DOUBLE) lon,
                   date_trunc('month', TRY_CAST(acq_date AS DATE)) AS m
            FROM {read_parquet_sql(cfg, 'raw', 'VIIRS')}
            WHERE TRY_CAST(type AS INTEGER) IN (1, 2, 3)
              AND NOT regexp_matches(upper(coalesce(trim(version), '')), '{NRT_RE}')
        ),
        core AS (
            SELECT h3_cell(lat, lon, {r8}) AS h3_r8, count(DISTINCT m)::INTEGER AS n_months
            FROM src
            WHERE lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180 AND m IS NOT NULL
            GROUP BY 1 HAVING count(DISTINCT m) >= {int(cfg['mask_min_months'])}
        ),
        ring AS (SELECT DISTINCT unnest(h3_ring1(h3_r8)) AS h3_r8 FROM core)
        SELECT h3_r8, true, n_months FROM core
        UNION ALL
        SELECT h3_r8, false, NULL FROM ring WHERE h3_r8 NOT IN (SELECT h3_r8 FROM core)
    """)
    core, total = con.execute("SELECT count(*) FILTER (is_core), count(*) FROM static_mask").fetchone()
    log.info("máscara estática: %d celdas núcleo, %d con el anillo", core, total)
    return core


def normalize_sql(cfg: Config, con, sensor: str) -> str:
    cols = _raw_columns(con, cfg, sensor)
    mir, tir = CHANNELS[sensor]
    type_expr = "TRY_CAST(type AS TINYINT)" if "type" in cols else "CAST(NULL AS TINYINT)"
    r8, r7 = cfg["h3"]["cluster_res"], cfg["h3"]["cell_res"]
    tmin, tmax = cfg["t_mir_range_k"]
    lo, hi = cfg["modis_conf_cuts"]
    if sensor == "MODIS":
        c = "TRY_CAST(confidence AS DOUBLE)"
        conf = (f"CASE WHEN {c} IS NULL OR {c} NOT BETWEEN 0 AND 100 THEN NULL "
                f"WHEN {c} < {lo} THEN 'low' WHEN {c} < {hi} THEN 'nominal' ELSE 'high' END")
        epoch = (f"CASE regexp_replace(trim(version), '{NRT_RE}', '', 'i') "
                 "WHEN '6.2' THEN 'c6_v2' WHEN '6.03' THEN 'c6_v3' WHEN '61.03' THEN 'c61_v3' "
                 "ELSE 'modis_' || trim(version) END")
        mask_hit = "m.h3_r8 IS NOT NULL"     # núcleo o anillo
    else:
        conf = _case_map("confidence", {"l": "low", "n": "nominal", "h": "high",
                                        "low": "low", "nominal": "nominal", "high": "high"})
        epoch = (f"CASE WHEN regexp_replace(trim(version), '{NRT_RE}', '', 'i') IN ('2', '2.0') "
                 "THEN 'c2' ELSE 'viirs_' || trim(version) END")
        mask_hit = "m.is_core"
    conf_rank = _case_map("conf_class", {c: str(i) for i, c in enumerate(CONF_ORDER)})
    mask_clause = ("WHEN coalesce(fire_type, 0) = 0 AND " + mask_hit + " THEN 'static_mask'"
                   if cfg["use_static_mask"] else "")

    return f"""
    WITH t AS (
        SELECT source_file, row_number, sensor, year AS raw_year, country,
               {_case_map('satellite', PLATFORMS[sensor])} AS platform,
               TRY_CAST(latitude AS DOUBLE) AS latitude,
               TRY_CAST(longitude AS DOUBLE) AS longitude,
               -- acq_time como texto, rellenado a 4 dígitos: "231" → "0231"
               TRY_STRPTIME(trim(acq_date) || ' ' || lpad(trim(acq_time), 4, '0'), '%Y-%m-%d %H%M') AS ts,
               TRY_CAST({mir} AS DOUBLE) AS t_mir_k,
               TRY_CAST({tir} AS DOUBLE) AS t_tir_k,
               TRY_CAST(frp AS DOUBLE) AS frp_mw,
               TRY_CAST(scan AS DOUBLE) AS scan_km,
               TRY_CAST(track AS DOUBLE) AS track_km,
               confidence AS confidence_raw,
               {conf} AS conf_class,
               {type_expr} AS fire_type,
               trim(version) AS product_version,
               {epoch} AS algo_epoch,
               regexp_matches(upper(coalesce(trim(version), '')), '{NRT_RE}') AS is_nrt,
               CASE upper(trim(daynight)) WHEN 'D' THEN true WHEN 'N' THEN false END AS is_day
        FROM {read_parquet_sql(cfg, 'raw', sensor)}
    ),
    d AS (
        SELECT t.*,
               coalesce(latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180, false) AS coord_ok,
               CAST(ts AS TIMESTAMPTZ) AS datetime_utc,
               -- fecha solar local: UTC + longitude/15 h (longitude × 240 s)
               CAST(ts + to_seconds(CAST(round(longitude * 240) AS BIGINT)) AS DATE) AS local_date,
               (((hour(ts) + minute(ts) / 60.0 + longitude / 15.0) % 24) + 24) % 24 AS local_solar_hour,
               floor(epoch(ts) / 3000)::BIGINT AS overpass_bucket,
               scan_km * track_km AS pixel_area_km2,
               ({conf_rank})::INTEGER AS conf_rank
        FROM t
    ),
    h AS (
        SELECT d.*, CASE WHEN coord_ok THEN h3_cell(latitude, longitude, {r8}) END AS h3_r8
        FROM d
    ),
    e AS (
        SELECT h.*,
               h3_parent(h.h3_r8, {r7}) AS h3_r7,
               CASE
                   WHEN NOT coord_ok OR ts IS NULL OR platform IS NULL OR is_day IS NULL
                        OR conf_class IS NULL OR t_mir_k IS NULL
                        OR t_mir_k NOT BETWEEN {tmin} AND {tmax}
                        OR frp_mw < 0 THEN 'out_of_range'
                   WHEN fire_type = 1 THEN 'type_1'
                   WHEN fire_type = 2 THEN 'type_2'
                   WHEN fire_type = 3 THEN 'type_3'
                   {mask_clause}
                   WHEN conf_rank < {cfg.min_conf_rank} THEN 'low_conf'
               END AS pre_reason
        FROM h LEFT JOIN static_mask m ON m.h3_r8 = h.h3_r8
    ),
    f AS (
        -- Paso 7: deduplicación solo dentro de la misma plataforma, entre filas que pasaron los filtros
        SELECT e.*,
               CASE WHEN pre_reason IS NOT NULL THEN pre_reason
                    WHEN row_number() OVER (
                        PARTITION BY platform, latitude, longitude, datetime_utc, (pre_reason IS NULL)
                        ORDER BY source_file, row_number) > 1 THEN 'duplicate'
               END AS drop_reason
        FROM e
    )
    SELECT source_file, row_number, sensor, platform, latitude, longitude, datetime_utc,
           local_solar_hour, local_date,
           COALESCE(year(local_date), raw_year)::INTEGER AS year,
           month(local_date)::INTEGER AS month,
           ((dayofyear(local_date) - 1) // 8 + 1)::INTEGER AS period_8d,
           is_day, overpass_bucket, t_mir_k, t_tir_k, frp_mw, scan_km, track_km, pixel_area_km2,
           confidence_raw, conf_class, fire_type, product_version, algo_epoch, is_nrt, country,
           h3_r8, h3_r7, raw_year, drop_reason
    FROM f
    """


def run(cfg: Config, con) -> dict:
    refresh_views(cfg, con)
    if not has_parquet(cfg, "raw"):
        raise RuntimeError("fires_raw está vacía: correr antes `python -m pipeline ingest`")
    build_static_mask(cfg, con)
    clear_step(con, "normalize")
    cols = ", ".join(NORM_COLUMNS)
    result = {}
    for sensor in ("MODIS", "VIIRS"):
        for table in ("norm", "excluded"):
            reset_dir(cfg.parquet_dir(table) / f"sensor={sensor}")
        if not has_parquet(cfg, "raw", sensor):
            continue
        check_platforms(con, cfg, sensor)
        con.execute(f"CREATE OR REPLACE TEMP TABLE _norm AS {normalize_sql(cfg, con, sensor)}")
        con.execute(f"""COPY (SELECT {cols} FROM _norm WHERE drop_reason IS NULL ORDER BY h3_r7, local_date)
                        TO '{cfg.parquet_dir('norm')}' (FORMAT parquet, PARTITION_BY (sensor, year),
                        OVERWRITE_OR_IGNORE)""")
        con.execute(f"""COPY (SELECT {cols}, drop_reason FROM _norm WHERE drop_reason IS NOT NULL)
                        TO '{cfg.parquet_dir('excluded')}' (FORMAT parquet, PARTITION_BY (sensor, year),
                        OVERWRITE_OR_IGNORE)""")
        agg: dict[int, dict] = {}
        for y, reason, n, dmin, dmax in con.execute("""
                SELECT raw_year, drop_reason, count(*), min(local_date), max(local_date)
                FROM _norm GROUP BY ALL ORDER BY ALL""").fetchall():
            a = agg.setdefault(y, {"in": 0, "out": 0, "drops": {}, "dmin": None, "dmax": None})
            a["in"] += n
            if reason is None:
                a["out"], a["dmin"], a["dmax"] = n, dmin, dmax
            else:
                a["drops"][reason] = n
        for y, a in agg.items():
            write_qc(con, cfg, sensor=sensor, year=y, step="normalize", rows_in=a["in"],
                     rows_out=a["out"], drops=a["drops"], date_min=a["dmin"], date_max=a["dmax"])
        result[sensor] = (sum(a["in"] for a in agg.values()), sum(a["out"] for a in agg.values()))
        log.info("normalización %s: %d filas → %d en fires_norm", sensor, *result[sensor])
    con.execute("DROP TABLE IF EXISTS _norm")
    refresh_views(cfg, con)
    return result
