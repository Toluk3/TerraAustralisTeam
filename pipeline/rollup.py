"""Rollups fires_monthly y fires_8d, con n_equiv aplicado por día (§4.4, §5.4)."""
from __future__ import annotations

import logging

from .calibrate import k_lookup_sql
from .config import Config
from .qc import data_fingerprint

log = logging.getLogger(__name__)


class ConfigHashMismatch(RuntimeError):
    pass


def check_hash(cfg: Config, con, table: str = "calibration") -> None:
    """El k solo vale para la configuración con la que se ajustó (§5.3)."""
    hashes = {r[0] for r in con.execute(f"SELECT DISTINCT config_hash FROM {table}").fetchall()}
    if hashes and hashes != {cfg.config_hash}:
        raise ConfigHashMismatch(
            f"{table} tiene config_hash {sorted(hashes)} y la configuración actual es {cfg.config_hash}. "
            f"Cambió algún filtro o parámetro: volver a correr `python -m pipeline calibrate rollup`.")
    if table == "calibration":
        sup = {r[0] for r in con.execute("SELECT config_hash FROM support_meta").fetchall()}
        if sup and sup != {cfg.config_hash}:
            raise ConfigHashMismatch(
                f"Las tablas de apoyo (cobertura, composición de la serie) se armaron con config_hash "
                f"{sorted(sup)} y la configuración actual es {cfg.config_hash}: "
                f"volver a correr `python -m pipeline support calibrate rollup`.")
        fitted = {r[0] for r in con.execute("SELECT DISTINCT data_fingerprint FROM calibration_meta").fetchall()}
        now = data_fingerprint(con)
        if fitted and now is not None and fitted != {now}:
            raise ConfigHashMismatch(
                "Los datos ingeridos cambiaron desde que se ajustó k (otra descarga u otros archivos): "
                "volver a correr `python -m pipeline calibrate rollup`.")


def run(cfg: Config, con) -> dict:
    check_hash(cfg, con)
    if not con.execute("SELECT count(*) FROM calibration").fetchone()[0]:
        log.warning("rollup: calibration está vacía; n_equiv solo se calcula para la referencia")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE _daily_k AS
        SELECT k.*, k.metric_value * k.k AS n_equiv, (s.platform IS NOT NULL) AS in_series
        FROM ({k_lookup_sql(cfg)}) k
        LEFT JOIN series_source s ON s.date = k.local_date AND s.platform = k.platform
    """)
    for p, n in con.execute("SELECT platform, count(*) FROM _daily_k WHERE k IS NULL GROUP BY 1").fetchall():
        log.warning("sin k para %s en %d filas de fires_daily: n_equiv queda NULL", p, n)
    for p, n in con.execute(
            "SELECT platform, count(*) FROM _daily_k WHERE k IS NULL AND in_series GROUP BY 1").fetchall():
        log.warning("¡%d filas de %s de la serie armonizada no tienen k!", n, p)

    out_n, out_f = con.execute("""SELECT count(*), coalesce(sum(n_fires), 0) FROM _daily_k
                                  WHERE local_date NOT IN (SELECT date FROM calendar)""").fetchone()
    if out_n:
        log.warning("rollup: %d filas de fires_daily (%d focos) quedan fuera del calendario "
                    "(calendar_start/calendar_end) y no entran a los rollups", out_n, out_f)

    h = cfg.config_hash
    for table, col, start_col, kind in (("fires_monthly", "month", "month_start", "month"),
                                        ("fires_8d", "period_8d", "period_8d_start", "8d")):
        con.execute(f"DELETE FROM {table}")
        con.execute(f"""
            INSERT INTO {table} BY NAME
            SELECT d.cell, d.region_r3, c.year, c.{col} AS {col}, min(c.{start_col}) AS period_start,
                   d.sensor, d.platform, d.is_day,
                   sum(d.n_fires)::INTEGER AS n_fires, sum(d.n_clusters)::INTEGER AS n_clusters,
                   sum(d.n_clusters_r7)::INTEGER AS n_clusters_r7, sum(d.frp_sum_mw) AS frp_sum_mw,
                   sum(d.n_clusters_det) AS n_clusters_det,
                   count(DISTINCT d.local_date)::INTEGER AS n_fire_days,
                   sum(d.n_equiv) AS n_equiv,
                   sum(CASE WHEN d.in_series THEN d.n_equiv ELSE 0 END) AS n_equiv_series,
                   sum(d.n_equiv) / nullif(sum(d.metric_value), 0) AS k_used,
                   any_value(cv.coverage_frac) AS coverage_frac,
                   '{h}' AS config_hash
            FROM _daily_k d
            JOIN calendar c ON c.date = d.local_date
            LEFT JOIN coverage cv ON cv.platform = d.platform AND cv.period_kind = '{kind}'
                 AND cv.year = c.year AND cv.period = c.{col}
            GROUP BY d.cell, d.region_r3, c.year, c.{col}, d.sensor, d.platform, d.is_day
            ORDER BY d.cell, c.year, c.{col}
        """)
    con.execute("DROP TABLE IF EXISTS _daily_k")
    rows, total = con.execute("SELECT count(*), sum(n_equiv_series) FROM fires_monthly").fetchone()
    log.info("fires_monthly: %d filas; serie armonizada = %.0f focos equivalentes", rows, total or 0)
    return {"monthly_rows": rows, "series_total": total}
