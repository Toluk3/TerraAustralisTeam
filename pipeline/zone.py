"""Zona de la demo (Río Negro y Neuquén): celdas, serie, mediana histórica y bandas (ARQUITECTURA §4.2).

La mediana de un área no es la suma de las medianas de sus celdas: se suma la zona año por año,
reponiendo los ceros con calendar, y recién después se toma la mediana por período.

Tablas que deja en data/prehack.duckdb:
  zone_cells        celdas r7 de la zona, por centroide
  zone_series       (period_kind, year, period, period_start, n_equiv, p05, p95, coverage_frac, status)
  zone_baseline     (period_kind, period, median, p10, p25, p75, p90, n_years)
  zone_before_after serie mensual de la zona por sensor sin k y armonizada (solo para el pitch)
"""
from __future__ import annotations

import logging

from .calibrate import k_lookup_sql
from .config import Config
from .db import load_spatial, sql_str

log = logging.getLogger(__name__)
PERIODS = {"month": ("month", "month_start"), "8d": ("period_8d", "period_8d_start")}


def build_cells(cfg: Config, con) -> int:
    outline = cfg.zone_outline
    if not outline or not outline.exists():
        raise FileNotFoundError(f"No está el contorno de la zona ({outline}): python scripts/descargar_zona.py")
    load_spatial(con)
    con.execute("DELETE FROM zone_cells")
    # h3_polygon_wkt_to_cells solo acepta POLYGON: con un MULTIPOLYGON (islas, varios países) devuelve
    # una lista vacía sin error. Por eso la unión se separa en polígonos con ST_Dump.
    con.execute(f"""
        INSERT INTO zone_cells
        SELECT DISTINCT unnest(h3_polygon_wkt_to_cells(ST_AsText(p.geom), {cfg['h3']['cell_res']}))
        FROM (SELECT unnest(ST_Dump(ST_Union_Agg(geom))) AS p FROM ST_Read('{sql_str(outline)}'))
    """)
    n = con.execute("SELECT count(*) FROM zone_cells").fetchone()[0]
    if n == 0:
        raise ValueError(f"La zona {outline} no cubre ninguna celda H3 r{cfg['h3']['cell_res']}: revisar el contorno")
    return n


def run(cfg: Config, con) -> dict:
    n_cells = build_cells(cfg, con)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE _zone_daily AS
        SELECT k.*, s.platform IS NOT NULL AS in_series
        FROM ({k_lookup_sql(cfg)}) k
        LEFT JOIN series_source s ON s.date = k.local_date AND s.platform = k.platform
        WHERE k.cell IN (SELECT cell FROM zone_cells)
    """)
    con.execute("""CREATE OR REPLACE TABLE zone_series (period_kind VARCHAR, year INTEGER, period INTEGER,
                   period_start DATE, n_equiv DOUBLE, p05 DOUBLE, p95 DOUBLE, coverage_frac DOUBLE,
                   status VARCHAR)""")
    metric = cfg["metric"]
    for kind, (col, start_col) in PERIODS.items():
        con.execute(f"""
            INSERT INTO zone_series
            WITH d AS (SELECT z.*, c.year, c.{col} AS period FROM _zone_daily z
                       JOIN calendar c ON c.date = z.local_date WHERE z.in_series),
            point AS (SELECT year, period, sum(metric_value * k) v FROM d GROUP BY ALL),
            fixed AS (SELECT year, period, sum(metric_value) v FROM d WHERE k_level = 'ref' GROUP BY ALL),
            boot AS (
                SELECT d.year, d.period, b.rep, sum(d.metric_value * b.k) v
                FROM d JOIN calibration_boot b
                  ON b.source_platform = d.cal_platform AND b.level = d.k_level AND b.metric = '{metric}'
                 AND b.region = CASE d.k_level WHEN 'r3' THEN d.region_r3 WHEN 'r2' THEN d.region_r2 ELSE 0 END
                 AND b.month = month(d.local_date) AND b.is_day = d.is_day
                WHERE d.k_level <> 'ref'
                GROUP BY ALL),
            band AS (SELECT year, period, quantile_cont(v, 0.05) lo, quantile_cont(v, 0.95) hi
                     FROM boot GROUP BY ALL),
            periods AS (SELECT year, {col} AS period, min({start_col}) AS period_start FROM calendar GROUP BY ALL)
            SELECT '{kind}', p.year, p.period, p.period_start,
                   CASE WHEN sc.coverage_frac > 0 THEN coalesce(pt.v, 0) END,
                   CASE WHEN sc.coverage_frac > 0 THEN coalesce(f.v, 0) + coalesce(b.lo, pt.v - coalesce(f.v, 0), 0) END,
                   CASE WHEN sc.coverage_frac > 0 THEN coalesce(f.v, 0) + coalesce(b.hi, pt.v - coalesce(f.v, 0), 0) END,
                   sc.coverage_frac,
                   CASE WHEN coalesce(sc.coverage_frac, 0) = 0 THEN 'sin_datos'
                        WHEN sc.coverage_frac < 1 THEN 'parcial' ELSE 'ok' END
            FROM periods p
            LEFT JOIN series_coverage sc ON sc.period_kind = '{kind}' AND sc.year = p.year AND sc.period = p.period
            LEFT JOIN point pt ON pt.year = p.year AND pt.period = p.period
            LEFT JOIN fixed f ON f.year = p.year AND f.period = p.period
            LEFT JOIN band b ON b.year = p.year AND b.period = p.period
            ORDER BY p.year, p.period
        """)
    # Mediana y percentiles por período, solo con años de cobertura completa (con sus ceros)
    con.execute("""
        CREATE OR REPLACE TABLE zone_baseline AS
        SELECT period_kind, period, median(n_equiv) AS median,
               quantile_cont(n_equiv, 0.10) p10, quantile_cont(n_equiv, 0.25) p25,
               quantile_cont(n_equiv, 0.75) p75, quantile_cont(n_equiv, 0.90) p90,
               count(*) AS n_years
        FROM zone_series WHERE status = 'ok' GROUP BY ALL ORDER BY ALL
    """)
    # Serie por sensor sin k contra la armonizada: el gráfico antes/después del pitch (no va a la app)
    con.execute(f"""
        CREATE OR REPLACE TABLE zone_before_after AS
        SELECT c.year, c.month, c.month_start,
               sum(z.n_fires) FILTER (z.sensor = 'MODIS') AS modis_n_fires,
               sum(z.n_fires) FILTER (z.platform = '{cfg['viirs_priority'][0]}') AS viirs_n_fires,
               sum(z.metric_value * z.k) FILTER (z.in_series) AS harmonized
        FROM calendar c LEFT JOIN _zone_daily z ON z.local_date = c.date
        GROUP BY ALL ORDER BY c.year, c.month
    """)
    con.execute("DROP TABLE IF EXISTS _zone_daily")
    total = con.execute("SELECT sum(n_equiv) FROM zone_series WHERE period_kind = 'month'").fetchone()[0]
    log.info("zona: %d celdas r7, %.0f focos equivalentes en la serie", n_cells, total or 0)
    return {"cells": n_cells, "series_total": total}


def anomaly_sql(kind: str) -> str:
    """Serie de la zona con mediana, percentiles y anomalía (absoluta, % si la mediana > 0, percentil)."""
    return f"""
        SELECT s.year, s.period, s.period_start, s.n_equiv, s.p05, s.p95, s.coverage_frac, s.status,
               b.median, b.p10, b.p25, b.p75, b.p90,
               s.n_equiv - b.median AS anomaly_abs,
               CASE WHEN b.median > 0 THEN (s.n_equiv - b.median) / b.median END AS anomaly_pct,
               (SELECT avg((h.n_equiv <= s.n_equiv)::INTEGER::DOUBLE) FROM zone_series h
                WHERE h.period_kind = s.period_kind AND h.period = s.period AND h.status = 'ok') AS pct_rank
        FROM zone_series s
        LEFT JOIN zone_baseline b ON b.period_kind = s.period_kind AND b.period = s.period
        WHERE s.period_kind = '{kind}'
        ORDER BY s.year, s.period
    """
