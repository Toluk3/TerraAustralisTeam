"""Publicación: exporta las tablas finales con la estructura del bucket (ARQUITECTURA.md §4.2).

data/publish/
├── series/res=7/part-0.parquet       serie mensual por celda (toda la región procesada)
├── calibration/k.parquet, boot.parquet
├── map/res=<r>/part-0.parquet        valor armonizado por celda de la zona, por zoom
├── points/year=<YYYY>/h3_r3=<c>/     focos limpios de la zona
├── zone/outline.geojson, calendar.parquet, baseline.parquet, timeline_8d.parquet
├── reportes/                         CSV para validar y para el pitch (no van a la app)
└── meta/version.json

Para subirlo: gcloud storage cp -r data/publish/* gs://<bucket>/
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import shutil

from .config import Config
from .db import reset_dir, sql_str
from .zone import anomaly_sql

log = logging.getLogger(__name__)


def _copy(con, sql: str, dest, partition: str | None = None) -> None:
    opts = "FORMAT parquet, COMPRESSION zstd"
    if partition:
        opts += f", PARTITION_BY ({partition}), OVERWRITE_OR_IGNORE"
    con.execute(f"COPY ({sql}) TO '{sql_str(dest)}' ({opts})")


def _csv(con, sql: str, dest) -> None:
    con.execute(f"COPY ({sql}) TO '{sql_str(dest)}' (HEADER, DELIMITER ',')")


def run(cfg: Config, con) -> dict:
    out = cfg.publish_dir
    reset_dir(out)
    for d in ("series/res=7", "calibration", "zone", "reportes", "meta"):
        (out / d).mkdir(parents=True, exist_ok=True)

    _copy(con, """SELECT cell, region_r3, year, month, platform, is_day, n_fires, n_equiv, n_equiv_series,
                         coverage_frac, config_hash FROM fires_monthly ORDER BY cell, year, month""",
          out / "series/res=7/part-0.parquet")
    _copy(con, f"SELECT * FROM calibration WHERE metric = '{cfg['metric']}' ORDER BY ALL",
          out / "calibration/k.parquet")
    _copy(con, "SELECT source_platform, level, region, month, is_day, k, rep AS replica FROM calibration_boot",
          out / "calibration/boot.parquet")

    # map/: valor armonizado por celda de la zona y anomalía contra la mediana de esa celda
    for res in (cfg.get("zone") or {}).get("map_resolutions", [7]):
        (out / f"map/res={res}").mkdir(parents=True, exist_ok=True)
        _copy(con, f"""
            WITH m AS (
                SELECT h3_parent(f.cell, {res}) AS cell, f.year, f.month, sum(f.n_equiv_series) AS n_equiv
                FROM fires_monthly f WHERE f.cell IN (SELECT cell FROM zone_cells)
                GROUP BY ALL HAVING sum(f.n_equiv_series) > 0),
            ok_months AS (SELECT year, period AS month FROM series_coverage
                          WHERE period_kind = 'month' AND coverage_frac = 1),
            cells AS (SELECT DISTINCT cell FROM m),
            full_grid AS (SELECT c.cell, o.year, o.month, coalesce(m.n_equiv, 0) AS v
                          FROM cells c CROSS JOIN ok_months o
                          LEFT JOIN m ON m.cell = c.cell AND m.year = o.year AND m.month = o.month),
            med AS (SELECT cell, month, median(v) AS median FROM full_grid GROUP BY ALL)
            SELECT m.cell, m.year, m.month, m.n_equiv,
                   CASE WHEN med.median > 0 THEN (m.n_equiv - med.median) / med.median END AS anomaly_pct
            FROM m LEFT JOIN med USING (cell, month)
            ORDER BY m.year, m.month, m.cell""", out / f"map/res={res}/part-0.parquet")

    # points/: focos limpios de la zona, por año y celda r3
    _copy(con, f"""
        SELECT latitude, longitude, datetime_utc, local_date, frp_mw, t_mir_k, t_tir_k,
               is_day, sensor, platform, conf_class, scan_km, track_km, is_nrt, year,
               h3_parent(h3_r7, {cfg['h3']['region_res']}) AS h3_r3
        FROM fires_norm WHERE h3_r7 IN (SELECT cell FROM zone_cells)
        ORDER BY datetime_utc""", out / "points", partition="year, h3_r3")

    # zone/
    shutil.copy(cfg.zone_outline, out / "zone/outline.geojson")
    _copy(con, f"""SELECT year, period AS month, n_equiv, p05, p95, coverage_frac, status,
                          median, p10, p25, p75, p90, anomaly_abs, anomaly_pct, pct_rank
                   FROM ({anomaly_sql('month')})""", out / "zone/calendar.parquet")
    _copy(con, """SELECT period AS month, median, p10, p25, p75, p90, n_years FROM zone_baseline
                  WHERE period_kind = 'month' ORDER BY period""", out / "zone/baseline.parquet")
    _copy(con, f"""SELECT year, period AS period_8d, period_start, n_equiv, p05, p95, coverage_frac, status,
                          median, anomaly_abs, anomaly_pct, pct_rank
                   FROM ({anomaly_sql('8d')})""", out / "zone/timeline_8d.parquet")

    # reportes/ (CSV legibles, para validar y para la presentación)
    _csv(con, "SELECT * FROM zone_before_after", out / "reportes/zona_antes_despues.csv")
    _csv(con, "SELECT * FROM validation ORDER BY variant, source_platform, held_out_year NULLS LAST, is_day",
         out / "reportes/validacion.csv")
    _csv(con, """SELECT variant, source_platform, rel_bias, median_abs_err, nmae, corr, ratio_pred_obs
                 FROM validation WHERE held_out_year IS NULL AND is_day IS NULL ORDER BY source_platform, nmae""",
         out / "reportes/ablacion.csv")
    _csv(con, "SELECT * FROM k_by_year ORDER BY ALL", out / "reportes/k_por_anio.csv")
    _csv(con, "SELECT * FROM qc_solar_hour ORDER BY ALL", out / "reportes/hora_solar_por_plataforma.csv")
    _csv(con, """SELECT step, sensor, year, rows_in, rows_out, drops, date_min, date_max FROM qc_report
                 WHERE step IN ('ingest', 'normalize') ORDER BY step, sensor, year""",
         out / "reportes/qc_normalizacion.csv")

    periods = con.execute("""SELECT platform, valid_from, valid_to, kind FROM platform_periods
                             ORDER BY platform, valid_from""").fetchall()
    reduced = con.execute("""SELECT year, period, coverage_frac FROM series_coverage
                             WHERE period_kind = 'month' AND coverage_frac < 1 ORDER BY ALL""").fetchall()
    cal = con.execute("SELECT min(date), max(date) FROM calendar").fetchone()
    meta = {
        "dataset_version": dt.date.today().isoformat(),
        "processed_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "config_hash": cfg.config_hash,
        "zone": (cfg.get("zone") or {}).get("name"),
        "metric": cfg["metric"],
        "reference": cfg["reference"],
        "switch_date": str(cfg.date("switch_date")),
        "modis_stable_until": str(cfg.date("modis_stable_until")),
        "coverage": {"from": str(cal[0]), "to": str(cal[1])},
        "platform_periods": [{"platform": p, "valid_from": str(a), "valid_to": b and str(b), "kind": k}
                             for p, a, b, k in periods],
        "reduced_coverage_months": [{"year": y, "month": m, "coverage_frac": round(c, 3)}
                                    for y, m, c in reduced],
        "attribution": "NASA FIRMS (MODIS C6.1 y VIIRS C2 375 m). "
                       "https://www.earthdata.nasa.gov/data/tools/firms",
        "params": {k: cfg.get(k) for k in ("min_conf_class", "use_static_mask", "mask_min_months",
                                           "month_window", "min_source_count", "calibration_levels",
                                           "viirs_priority")},
    }
    (out / "meta/version.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False, default=str),
                                         encoding="utf-8")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    log.info("export: %s (%.1f MB)", out, size / 1e6)
    return {"dir": str(out), "mb": round(size / 1e6, 1)}
