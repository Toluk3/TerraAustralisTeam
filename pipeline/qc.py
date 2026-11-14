"""qc_report y diagnósticos (§8)."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def write_qc(con, cfg, *, sensor, year, step, rows_in, rows_out, drops=None,
             date_min=None, date_max=None, stats=None, detail=None) -> None:
    drops, stats = drops or {}, stats or {}
    con.execute(
        """INSERT INTO qc_report VALUES (current_timestamp, ?, ?, ?, ?, ?, ?,
               map(?::VARCHAR[], ?::BIGINT[]), ?, ?, map(?::VARCHAR[], ?::DOUBLE[]), ?)""",
        [cfg.config_hash, sensor, year, step, rows_in, rows_out,
         list(drops.keys()), list(drops.values()), date_min, date_max,
         list(stats.keys()), list(stats.values()), detail],
    )


def data_fingerprint(con) -> str | None:
    """Huella de lo ingerido (filas y archivos por sensor × año). Cambia si se reingesta otra cosa."""
    return con.execute("""SELECT md5(string_agg(concat_ws('|', sensor, year, rows_in, detail), ';'
                                                   ORDER BY sensor, year))
                          FROM qc_report WHERE step = 'ingest'""").fetchone()[0]


def clear_step(con, step: str) -> None:
    con.execute("DELETE FROM qc_report WHERE step = ?", [step])


def run(cfg, con) -> dict:
    """Diagnósticos sobre fires_norm: deriva de la hora de pasada, épocas del algoritmo y estadísticas."""
    con.execute("DELETE FROM qc_solar_hour")
    con.execute("""INSERT INTO qc_solar_hour
                   SELECT platform, year, is_day, median(local_solar_hour), count(*)
                   FROM fires_norm GROUP BY ALL""")
    con.execute("DELETE FROM qc_algo_epoch")
    con.execute("""INSERT INTO qc_algo_epoch
                   SELECT sensor, platform, year, algo_epoch, is_nrt, count(*)
                   FROM fires_norm GROUP BY ALL""")
    clear_step(con, "norm_stats")
    rows = con.execute("""
        SELECT sensor, year, count(*), min(local_date), max(local_date),
               avg(t_mir_k), avg(t_tir_k), avg(frp_mw), avg(pixel_area_km2),
               avg(is_nrt::INTEGER), avg(is_day::INTEGER)
        FROM fires_norm GROUP BY ALL ORDER BY ALL
    """).fetchall()
    for s, y, n, dmin, dmax, tmir, ttir, frp, area, nrt, day in rows:
        write_qc(con, cfg, sensor=s, year=y, step="norm_stats", rows_in=n, rows_out=n,
                 date_min=dmin, date_max=dmax,
                 stats={"t_mir_k_mean": tmir, "t_tir_k_mean": ttir, "frp_mw_mean": frp,
                        "pixel_area_km2_mean": area, "nrt_frac": nrt, "day_frac": day})
    bad = check_closure(con)
    if bad:
        raise RuntimeError(f"No cierra norm + excluded = raw: {bad}")
    return {"solar_hour_rows": con.execute("SELECT count(*) FROM qc_solar_hour").fetchone()[0]}


def check_closure(con) -> list[tuple]:
    """Criterio de cierre (§3): norm + excluded = raw, por sensor y año del CSV."""
    views = {r[0] for r in con.execute("SELECT view_name FROM duckdb_views()").fetchall()}
    n_sql = ("SELECT sensor, raw_year AS year, count(*) n FROM fires_norm GROUP BY ALL"
             if "fires_norm" in views else "SELECT NULL sensor, NULL year, 0 n WHERE false")
    e_sql = ("SELECT sensor, raw_year AS year, count(*) n FROM fires_excluded GROUP BY ALL"
             if "fires_excluded" in views else "SELECT NULL sensor, NULL year, 0 n WHERE false")
    return con.execute(f"""
        WITH r AS (SELECT sensor, year, count(*) n FROM fires_raw GROUP BY ALL),
             n AS ({n_sql}), e AS ({e_sql})
        SELECT r.sensor, r.year, r.n, COALESCE(n.n, 0), COALESCE(e.n, 0)
        FROM r LEFT JOIN n USING (sensor, year) LEFT JOIN e USING (sensor, year)
        WHERE r.n <> COALESCE(n.n, 0) + COALESCE(e.n, 0)
    """).fetchall()
