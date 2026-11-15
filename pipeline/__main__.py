"""Línea de comandos del pipeline.

  python -m pipeline all                    # todos los pasos, en orden
  python -m pipeline ingest normalize       # algunos pasos
  python -m pipeline status                 # qué hay en la base
  python -m pipeline all --config otra.yaml

Pasos: ingest → normalize → support → aggregate → detect → calibrate → rollup → validate → qc → zone → export
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time

from . import aggregate, calibrate, detect, export, ingest, normalize, qc, rollup, support, validate, zone
from .config import load_config
from .db import connect

STEPS = {
    "ingest": ingest.run,          # paso 1: CSV/zips → fires_raw
    "normalize": normalize.run,    # pasos 2–8: fires_norm / fires_excluded + static_mask
    "support": support.run,        # calendar, platform_periods, coverage, series_source
    "aggregate": aggregate.run,    # fires_daily
    "detect": detect.run,          # detect_weights y fires_daily.n_clusters_det
    "calibrate": calibrate.run,    # calibration, calibration_boot, k_by_year
    "rollup": rollup.run,          # fires_monthly, fires_8d
    "validate": validate.run,      # validation (dejando un año afuera + ablación)
    "qc": qc.run,                  # qc_solar_hour, qc_algo_epoch, cierre de conteos
    "zone": zone.run,              # zone_cells, zone_series, zone_baseline
    "export": export.run,          # data/publish/
}


def status(cfg, con) -> dict:
    out = {"config_hash": cfg.config_hash, "db": str(cfg.db_path)}
    for t in ("fires_raw", "fires_norm", "fires_excluded", "fires_daily", "fires_monthly", "fires_8d",
              "calibration", "calibration_boot", "detect_weights", "static_mask", "validation", "zone_cells"):
        try:
            out[t] = con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        except Exception:  # noqa: BLE001 - tabla o vista todavía no creada
            out[t] = None
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m pipeline", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("steps", nargs="+", help="all, status o pasos: " + ", ".join(STEPS))
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    cfg = load_config(args.config)
    steps = list(STEPS) if args.steps == ["all"] else args.steps
    unknown = [s for s in steps if s not in STEPS and s != "status"]
    if unknown:
        ap.error(f"pasos desconocidos: {unknown}")
    con = connect(cfg)
    try:
        for step in steps:
            if step == "status":
                print(json.dumps(status(cfg, con), indent=2, default=str))
                continue
            t0 = time.time()
            logging.info("── %s", step)
            res = STEPS[step](cfg, con)
            logging.info("── %s listo en %.1f s: %s", step, time.time() - t0,
                         json.dumps(res, default=str, ensure_ascii=False)[:300])
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
