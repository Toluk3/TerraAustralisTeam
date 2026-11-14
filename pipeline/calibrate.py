"""Calibración (§5.3, §5.5): k = Σ referencia / Σ fuente por región × mes × día/noche × plataforma.

- Solape estable: hasta modis_stable_until (VIIRS) o terra_fit_to (Terra → referencia).
- Solo meses con coverage_frac = 1 en la fuente y en todas las plataformas de referencia.
- Ventana de ±month_window meses alrededor del mes calibrado (circular: diciembre ↔ enero).
- Niveles de `calibration_levels` (r<resolución H3> de más fina a más gruesa y, al final, global);
  `usable` dice si Σ fuente alcanza min_source_count.
- Con `calibration_from`, las sumas incluyen los fires_daily de otros lotes: el k de una región que
  cruza dos lotes, y el nivel global, son los mismos en todos (si no, "global" es "global del lote").
- Bootstrap: B réplicas remuestreando años-mes completos del solape.
- Se ajustan las tres métricas; la que se aplica es `metric` de config.yaml.
"""
from __future__ import annotations

import datetime as dt
import logging
import random

from .config import METRICS, Config
from .db import sql_in, sql_str
from .qc import data_fingerprint

log = logging.getLogger(__name__)

VIIRS_PLATFORMS = ("snpp", "noaa20", "noaa21")
DAILY_COLS = "cell, region_r3, region_r2, local_date, sensor, platform, is_day, n_fires, n_clusters, n_clusters_r7"


def calibration_daily(cfg: Config, con) -> str:
    """Tabla o vista con los agregados diarios que entran al ajuste de k.

    Sin `calibration_from` es fires_daily. Con `calibration_from`, la unión de fires_daily con los de
    las otras bases (la propia se saltea si figura en la lista, así todos los lotes comparten la lista).
    """
    others = []
    for p in cfg.calibration_from:
        db = p / "prehack.duckdb" if p.is_dir() else p
        if db.resolve() == cfg.db_path.resolve():
            continue
        if not db.exists():
            raise FileNotFoundError(f"calibration_from: no existe {db}. Correr antes ese lote hasta `aggregate`.")
        others.append(db)
    if not others:
        return "fires_daily"
    attached = {r[0] for r in con.execute("SELECT database_name FROM duckdb_databases()").fetchall()}
    parts = [f"SELECT {DAILY_COLS} FROM fires_daily"]
    for i, db in enumerate(others):
        alias = f"calib_{i}"
        if alias not in attached:
            con.execute(f"ATTACH '{sql_str(db)}' AS {alias} (READ_ONLY)")
        parts.append(f"SELECT {DAILY_COLS} FROM {alias}.fires_daily")
    con.execute("CREATE OR REPLACE TEMP VIEW _calib_daily AS " + " UNION ALL ".join(parts))
    log.info("calibración común: fires_daily + %d bases de calibration_from", len(others))
    return "_calib_daily"


def fit_windows(cfg: Config, con) -> dict[str, tuple[dt.date, dt.date]]:
    """Rango de ajuste por plataforma fuente, recortado a lo que hay en platform_days."""
    present = {r[0]: (r[1], r[2]) for r in con.execute(
        "SELECT platform, min(date), max(date) FROM platform_days GROUP BY 1").fetchall()}
    ref = cfg.reference_platforms
    if not all(p in present for p in ref):
        return {}
    ref_from = max(present[p][0] for p in ref)
    ref_to = min(present[p][1] for p in ref)
    out = {}
    for p in VIIRS_PLATFORMS:
        if p in present:
            a = max(present[p][0], ref_from)
            b = min(present[p][1], ref_to, cfg.date("modis_stable_until"))
            if a <= b:
                out[p] = (a, b)
    # Terra → referencia, para el período Terra sola (2000-11 → 2002-06)
    if "terra" in present:
        a = max(cfg.aqua_start, present["terra"][0], ref_from)
        b = min(cfg.date("terra_fit_to"), present["terra"][1], ref_to)
        if a <= b:
            out["terra"] = (a, b)
    return out


def eligible_months(cfg: Config, con, sources) -> None:
    """_eligible: meses con cobertura completa en la fuente y en todas las plataformas de referencia."""
    ref = cfg.reference_platforms
    parts = []
    for src in sources:
        plats = sorted({*ref, src})
        parts.append(f"""
            SELECT '{src}' AS source_platform, year, period AS month
            FROM coverage WHERE period_kind = 'month' AND platform IN ({sql_in(plats)})
            GROUP BY year, period HAVING count(*) = {len(plats)} AND min(coverage_frac) = 1""")
    sql = " UNION ALL ".join(parts) or \
        "SELECT NULL::VARCHAR source_platform, NULL::INTEGER year, NULL::INTEGER month WHERE false"
    con.execute(f"CREATE OR REPLACE TEMP TABLE _eligible AS {sql}")


def build_month_sums(cfg: Config, con, windows: dict, levels, table: str = "_ym") -> None:
    """Σ referencia y Σ fuente por plataforma × nivel × región × año-mes × día/noche."""
    eligible_months(cfg, con, windows)
    daily = calibration_daily(cfg, con)
    ref = cfg.reference_platforms
    sums = ", ".join(
        f"coalesce(sum(f.{m}) FILTER (f.platform IN ({sql_in(ref)})), 0)::DOUBLE AS ref_{m}, "
        f"coalesce(sum(f.{m}) FILTER (f.platform = s.src), 0)::DOUBLE AS src_{m}" for m in METRICS)
    parts = []
    for src, (a, b) in windows.items():
        for level in levels:
            parts.append(f"""
            SELECT s.src AS source_platform, '{level}' AS level, {cfg.level_region_sql(level)} AS region,
                   year(f.local_date) AS year, month(f.local_date) AS month, f.is_day, {sums},
                   count(DISTINCT (f.cell, f.local_date)) AS n_cell_days
            FROM {daily} f
            CROSS JOIN (SELECT '{src}' AS src) s
            JOIN _eligible e ON e.source_platform = s.src
                 AND e.year = year(f.local_date) AND e.month = month(f.local_date)
            WHERE f.local_date BETWEEN DATE '{a}' AND DATE '{b}'
              AND f.platform IN ({sql_in({*ref, src})})
            GROUP BY ALL""")
    if parts:
        con.execute(f"CREATE OR REPLACE TEMP TABLE {table} AS " + " UNION ALL ".join(parts))
    else:
        cols = ", ".join(f"ref_{m} DOUBLE, src_{m} DOUBLE" for m in METRICS)
        con.execute(f"""CREATE OR REPLACE TEMP TABLE {table} (source_platform VARCHAR, level VARCHAR,
            region UBIGINT, year INTEGER, month INTEGER, is_day BOOLEAN, {cols}, n_cell_days BIGINT)""")


def _window(w: int) -> str:
    return f"least(abs(m.month - y.month), 12 - abs(m.month - y.month)) <= {w}"


def run(cfg: Config, con) -> dict:
    windows = fit_windows(cfg, con)
    con.execute("DELETE FROM calibration")
    con.execute("DELETE FROM calibration_boot")
    con.execute("DELETE FROM calibration_meta")
    if not windows:
        log.warning("calibración: no hay solape entre fuente y referencia; no se ajusta k")
        return {"rows": 0}
    for p in cfg["viirs_priority"]:
        if p not in windows and p not in (cfg.get("k_fallback_platform") or {}):
            log.warning("calibración: %s está en viirs_priority pero no tiene datos en el solape con MODIS; "
                        "no aporta a la serie ni al ajuste (¿faltan sus archivos en la carpeta de entrada?)", p)
    for src, (a, b) in windows.items():
        if src in VIIRS_PLATFORMS and (b - a).days < 5 * 365:
            log.warning("calibración: el solape de %s con MODIS es de %.1f años (%s → %s); con S-NPP serían ~10",
                        src, (b - a).days / 365.25, a, b)
    build_month_sums(cfg, con, windows, cfg["calibration_levels"])
    w, minc, h = int(cfg["month_window"]), cfg["min_source_count"], cfg.config_hash
    for metric in METRICS:
        con.execute(f"""
            INSERT INTO calibration BY NAME
            WITH months AS (SELECT unnest(range(1, 13)) AS month)
            SELECT y.source_platform, '{cfg['reference']}' AS reference, '{metric}' AS metric,
                   y.level, y.region, m.month::INTEGER AS month, y.is_day,
                   sum(y.ref_{metric}) / nullif(sum(y.src_{metric}), 0) AS k,
                   sum(y.ref_{metric}) AS sum_ref, sum(y.src_{metric}) AS sum_source,
                   sum(y.n_cell_days) AS n_cell_days,
                   CASE WHEN y.level = 'global' THEN sum(y.src_{metric}) > 0
                        ELSE sum(y.src_{metric}) >= {minc} END AS usable,
                   '{h}' AS config_hash, current_timestamp AS fitted_at
            FROM _ym y JOIN months m ON {_window(w)}
            GROUP BY y.source_platform, y.level, y.region, m.month, y.is_day
        """)
    for src, (a, b) in windows.items():
        con.execute("UPDATE calibration SET fit_from = ?, fit_to = ? WHERE source_platform = ?", [a, b, src])
    con.execute("INSERT INTO calibration_meta VALUES (?, ?, ?, current_timestamp)",
                [h, data_fingerprint(con), ", ".join(str(p) for p in cfg.calibration_from)])
    bootstrap(cfg, con, windows)
    k_by_year(cfg, con)
    for row in con.execute("""
        SELECT source_platform, metric, is_day, round(sum(sum_ref) / sum(sum_source), 3)
        FROM calibration WHERE level = 'global' GROUP BY ALL ORDER BY ALL""").fetchall():
        log.info("k global %s %-13s día=%s: %s", *row)
    return {"rows": con.execute("SELECT count(*) FROM calibration").fetchone()[0],
            "windows": {k: (str(a), str(b)) for k, (a, b) in windows.items()}}


def bootstrap(cfg: Config, con, windows: dict) -> None:
    """calibration_boot: B réplicas de k remuestreando años-mes completos (§5.5)."""
    reps = int(cfg["bootstrap_reps"])
    if reps <= 0:
        return
    metric, w = cfg["metric"], int(cfg["month_window"])
    rng = random.Random(cfg["bootstrap_seed"])
    weights = []
    for src in windows:
        yms = con.execute("SELECT DISTINCT year, month FROM _ym WHERE source_platform = ? ORDER BY ALL",
                          [src]).fetchall()
        for rep in range(reps):
            counts: dict[tuple, int] = {}
            for _ in yms:
                ym = yms[rng.randrange(len(yms))]
                counts[ym] = counts.get(ym, 0) + 1
            weights += [(src, rep, y, m, c) for (y, m), c in counts.items()]
    con.execute("CREATE OR REPLACE TEMP TABLE _w (source_platform VARCHAR, rep INTEGER, year INTEGER, "
                "month INTEGER, w INTEGER)")
    if weights:
        con.executemany("INSERT INTO _w VALUES (?, ?, ?, ?, ?)", weights)
    con.execute(f"""
        INSERT INTO calibration_boot
        WITH months AS (SELECT unnest(range(1, 13)) AS month)
        SELECT y.source_platform, '{metric}', y.level, y.region, m.month, y.is_day, b.rep,
               sum(b.w * y.ref_{metric}) / nullif(sum(b.w * y.src_{metric}), 0), '{cfg.config_hash}'
        FROM _ym y
        JOIN _w b ON b.source_platform = y.source_platform AND b.year = y.year AND b.month = y.month
        JOIN months m ON {_window(w)}
        GROUP BY ALL
    """)
    con.execute(f"""
        UPDATE calibration c SET k_p05 = q.p05, k_p95 = q.p95
        FROM (SELECT source_platform, level, region, month, is_day,
                     quantile_cont(k, 0.05) p05, quantile_cont(k, 0.95) p95
              FROM calibration_boot GROUP BY ALL) q
        WHERE c.metric = '{metric}' AND c.source_platform = q.source_platform AND c.level = q.level
          AND c.region = q.region AND c.month = q.month AND c.is_day = q.is_day
    """)


def k_by_year(cfg: Config, con) -> None:
    """k global año por año, sin cortar en modis_stable_until: muestra la deriva de MODIS (§6)."""
    con.execute("DELETE FROM k_by_year")
    windows = {r[0]: (r[1], r[2]) for r in con.execute(f"""
        SELECT platform, min(date), max(date) FROM platform_days
        WHERE platform IN ({sql_in(VIIRS_PLATFORMS)}) GROUP BY 1""").fetchall()}
    if not windows:
        return
    build_month_sums(cfg, con, windows, ["global"], table="_ym_all")
    for metric in METRICS:
        con.execute(f"""
            INSERT INTO k_by_year
            SELECT source_platform, '{metric}', year, is_day,
                   sum(ref_{metric}) / nullif(sum(src_{metric}), 0), sum(ref_{metric}), sum(src_{metric})
            FROM _ym_all GROUP BY ALL HAVING sum(ref_{metric}) > 0
        """)


def k_lookup_sql(cfg: Config, daily: str = "fires_daily") -> str:
    """fires_daily con el k de cada fila, por la jerarquía de `calibration_levels` (§5.3–5.4).

    Plataformas de referencia desde el inicio de Aqua: k = 1. Terra antes de Aqua y VIIRS: k
    ajustado. Una plataforma sin calibración usa la de k_fallback_platform. Columnas que agrega:
    metric_value, cal_platform, k, k_level (ref o el nivel usado) y k_region (región de ese nivel).
    """
    metric = cfg["metric"]
    levels = list(cfg["calibration_levels"])
    ref = sql_in(cfg.reference_platforms)
    fb = cfg.get("k_fallback_platform") or {}
    fb_case = " ".join(f"WHEN '{a}' THEN '{b}'" for a, b in fb.items())
    fb_expr = f"CASE f.platform {fb_case} ELSE f.platform END" if fb_case else "f.platform"
    is_ref = f"d.platform IN ({ref}) AND d.local_date >= DATE '{cfg.aqua_start}'"
    regs = ", ".join(f"{cfg.level_region_sql(lv)} AS _reg{i}" for i, lv in enumerate(levels))
    joins = "\n    ".join(
        f"""LEFT JOIN calibration c{i} ON c{i}.metric = '{metric}' AND c{i}.level = '{lv}'
            AND c{i}.usable AND c{i}.source_platform = d.cal_platform AND c{i}.region = d._reg{i}
            AND c{i}.month = month(d.local_date) AND c{i}.is_day = d.is_day""" for i, lv in enumerate(levels))
    ks = ", ".join(f"c{i}.k" for i in range(len(levels)))
    lvl_case = " ".join(f"WHEN c{i}.k IS NOT NULL THEN '{lv}'" for i, lv in enumerate(levels))
    reg_case = " ".join(f"WHEN c{i}.k IS NOT NULL THEN d._reg{i}" for i in range(len(levels)))
    drop = ", ".join(f"_reg{i}" for i in range(len(levels)))

    return f"""
    WITH calibrated AS (SELECT DISTINCT source_platform FROM calibration),
    d AS (
        SELECT f.*, f.{metric} AS metric_value,
               CASE WHEN f.platform IN (SELECT source_platform FROM calibrated) THEN f.platform
                    ELSE {fb_expr} END AS cal_platform,
               {regs}
        FROM {daily} f
    )
    SELECT d.* EXCLUDE ({drop}),
           CASE WHEN {is_ref} THEN 1.0 ELSE COALESCE({ks}) END AS k,
           CASE WHEN {is_ref} THEN 'ref' {lvl_case} END AS k_level,
           CASE WHEN {is_ref} THEN NULL {reg_case} END AS k_region
    FROM d
    {joins}
    """
