"""Corre un lote del plan de análisis y lo vuelca en la base consolidada (documentacion/PLAN_ANALISIS_LOTES.md).

  python lotes/correr_lote.py L2                 # pasos por defecto del lote + consolidar
  python lotes/correr_lote.py L1 --solo-consolidar

Cada lote tiene su propia base (data/lotes/<L>/prehack.duckdb). Al terminar, sus tablas de resultados
se copian a data/lotes/lotes.duckdb con una columna `lote` (reemplazando lo que hubiera de ese lote),
y un resumen chico en CSV queda en lotes/resumen/<L>/ para versionar.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.__main__ import STEPS  # noqa: E402
from pipeline.config import load_config  # noqa: E402
from pipeline.db import connect, sql_str  # noqa: E402

CORE = ["ingest", "normalize", "support", "aggregate", "calibrate", "rollup", "validate", "qc"]
# L1 y L5 tienen la zona de la demo; L1 además publica, para compararla con la corrida principal.
DEFAULT_STEPS = {"L1": CORE + ["zone", "export"]}
CONSOLIDATED = ROOT / "data" / "lotes" / "lotes.duckdb"

# tabla consolidada → consulta sobre la base del lote
TABLES = {
    "calibration": "SELECT * EXCLUDE (fitted_at) FROM l.calibration",
    "k_by_year": "SELECT * FROM l.k_by_year",
    "validation": "SELECT * FROM l.validation",
    "qc_report": "SELECT * FROM l.qc_report",
    "qc_solar_hour": "SELECT * FROM l.qc_solar_hour",
    "qc_algo_epoch": "SELECT * FROM l.qc_algo_epoch",
    "static_mask": "SELECT * FROM l.static_mask",
    "coverage": "SELECT * FROM l.coverage WHERE period_kind = 'month'",
    # serie mensual por región r3 (no por celda): alcanza para comparar k entre regiones (P1, P3)
    "monthly_r3": """SELECT region_r3, year, month, sensor, platform, is_day,
                            sum(n_fires) n_fires, sum(n_clusters) n_clusters, sum(n_clusters_r7) n_clusters_r7,
                            sum(n_equiv) n_equiv, sum(n_equiv_series) n_equiv_series, any_value(config_hash) config_hash
                     FROM l.fires_monthly GROUP BY ALL""",
    # fires_daily por r2 × día: P3 (transferibilidad) necesita sumas por día para reajustar k
    "daily_r2": """SELECT region_r3, region_r2, local_date, platform, is_day,
                          sum(n_fires) n_fires, sum(n_clusters) n_clusters, sum(n_clusters_r7) n_clusters_r7
                   FROM l.fires_daily GROUP BY ALL""",
}
ZONE_TABLES = {"zone_series": "SELECT * FROM l.zone_series", "zone_baseline": "SELECT * FROM l.zone_baseline"}


def run_steps(cfg, steps: list[str]) -> dict[str, float]:
    con = connect(cfg)
    tmp = cfg.data_dir / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con.execute("SET memory_limit = '10GB'")
    con.execute(f"SET temp_directory = '{sql_str(tmp)}'")
    times = {}
    try:
        for step in steps:
            t0 = time.time()
            logging.info("── %s", step)
            res = STEPS[step](cfg, con)
            times[step] = round(time.time() - t0, 1)
            logging.info("── %s listo en %.1f s: %s", step, times[step], json.dumps(res, default=str)[:200])
    finally:
        con.close()
    return times


def consolidate(lote: str, cfg, times: dict[str, float]) -> dict:
    CONSOLIDATED.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(CONSOLIDATED))
    con.execute(f"ATTACH '{sql_str(cfg.db_path)}' AS l (READ_ONLY)")
    lote_tables = {r[0] for r in con.execute(
        "SELECT table_name FROM duckdb_tables() WHERE database_name = 'l'").fetchall()}
    tables = dict(TABLES)
    if {"zone_series", "zone_baseline"} <= lote_tables:
        tables.update(ZONE_TABLES)
    counts = {}
    for name, sql in tables.items():
        sel = f"SELECT '{lote}' AS lote, * FROM ({sql})"
        exists = con.execute("SELECT count(*) FROM duckdb_tables() WHERE database_name = current_database() "
                             "AND table_name = ?", [name]).fetchone()[0]
        if exists:
            con.execute(f"DELETE FROM {name} WHERE lote = ?", [lote])
            con.execute(f"INSERT INTO {name} BY NAME {sel}")
        else:
            con.execute(f"CREATE TABLE {name} AS {sel}")
        counts[name] = con.execute(f"SELECT count(*) FROM {name} WHERE lote = ?", [lote]).fetchone()[0]

    raw = con.execute("""SELECT sum(rows_in) FROM l.qc_report WHERE step = 'ingest'""").fetchone()[0]
    norm = con.execute("""SELECT sum(rows_out) FROM l.qc_report WHERE step = 'normalize'""").fetchone()[0]
    con.execute("""CREATE TABLE IF NOT EXISTS registro (lote VARCHAR, run_at TIMESTAMPTZ, config_hash VARCHAR,
                   countries VARCHAR, rows_raw BIGINT, rows_norm BIGINT, step_seconds JSON, disk_mb DOUBLE)""")
    con.execute("DELETE FROM registro WHERE lote = ?", [lote])
    disk = sum(f.stat().st_size for f in cfg.data_dir.rglob("*") if f.is_file()) / 1e6
    con.execute("INSERT INTO registro VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [lote, dt.datetime.now(dt.timezone.utc), cfg.config_hash, ", ".join(cfg["countries"]),
                 raw, norm, json.dumps(times), round(disk, 1)])
    write_summary(con, lote, cfg)
    con.execute("DETACH l")
    con.close()
    return {"rows_raw": raw, "rows_norm": norm, "disk_mb": round(disk, 1), "tablas": counts}


def write_summary(con, lote: str, cfg) -> None:
    """CSV chicos para versionar: k global, ablación, descartes y registro del lote."""
    # Cada año-mes entra en la ventana de 2·month_window + 1 meses calibrados: sumando los 12 meses,
    # sum_ref y sum_source quedan multiplicados por ese número. Se divide para informar la suma real.
    win = 2 * int(cfg["month_window"]) + 1
    out = ROOT / "lotes" / "resumen" / lote
    out.mkdir(parents=True, exist_ok=True)
    queries = {
        "k_global.csv": f"""SELECT source_platform, metric, is_day, round(sum(sum_ref) / sum(sum_source), 4) AS k,
                                   sum(sum_ref) / {win} AS sum_ref, sum(sum_source) / {win} AS sum_source
                            FROM calibration WHERE lote = '{lote}' AND level = 'global' GROUP BY ALL ORDER BY ALL""",
        "ablacion.csv": f"""SELECT variant, source_platform, round(rel_bias, 4) rel_bias, round(nmae, 4) nmae,
                                   round(corr, 4) corr, round(ratio_pred_obs, 4) ratio_pred_obs, n_region_months
                            FROM validation WHERE lote = '{lote}' AND held_out_year IS NULL AND is_day IS NULL
                            ORDER BY source_platform, nmae""",
        "k_por_anio.csv": f"""SELECT source_platform, metric, year, is_day, round(k, 4) k FROM k_by_year
                              WHERE lote = '{lote}' ORDER BY ALL""",
        "descartes.csv": f"""SELECT sensor, year, rows_in, rows_out, drops FROM qc_report
                             WHERE lote = '{lote}' AND step = 'normalize' ORDER BY sensor, year""",
        "registro.csv": f"SELECT * FROM registro WHERE lote = '{lote}'",
    }
    for name, sql in queries.items():
        con.execute(f"COPY ({sql}) TO '{sql_str(out / name)}' (HEADER, DELIMITER ',')")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("lote", help="L1, L2, L3, L4, L5_<conf>_<meses>")
    ap.add_argument("--pasos", nargs="+", help="pasos del pipeline (por defecto, los del lote)")
    ap.add_argument("--solo-consolidar", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        datefmt="%H:%M:%S")
    cfg = load_config(ROOT / "lotes" / f"{args.lote}.yaml")
    steps = args.pasos or DEFAULT_STEPS.get(args.lote) or (CORE + ["zone"] if args.lote.startswith("L5") else CORE)
    times = {} if args.solo_consolidar else run_steps(cfg, steps)
    res = consolidate(args.lote, cfg, times)
    logging.info("lote %s consolidado en %s: %s", args.lote, CONSOLIDATED, json.dumps(res, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
