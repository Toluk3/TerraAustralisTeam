"""Genera los JSON de prueba del mapa a partir de una carpeta publish/ del pipeline.

Imitan lo que va a devolver la API (propuesta en frontend/map/README.md). Todo es columnar
({length, col1[], col2[], ...}) para que pese poco y deck.gl lo lea por índice.

  meta.json                         contorno, switch_date, cobertura, escala de color, armado de los focos
  calendar.json                     serie mensual de la zona (barra de tiempo, panel)
  timeline_8d.json                  serie de 8 días de la zona
  map/res=<r>/<YYYY-MM>.json        valor armonizado por celda H3 en ese mes
  series/res=<r>/<tesela>.json      historial mensual por celda H3 de una tesela r2
  points/<YYYY-MM>/index.json       teselas H3 r2 con focos ese mes y cuántos tiene cada una
  points/<YYYY-MM>/<r2>.json        focos de esa tesela y mes (mes de la fecha local solar)

Partir por mes y por tesela es lo que permite zonas grandes (varios países): el mapa baja solo los
meses del período y las teselas que se ven en pantalla.

Uso (con el venv del pipeline, que necesita numpy):
  python frontend/map/scripts/build_mocks.py                                   # data/publish
  python frontend/map/scripts/build_mocks.py --publish data/lotes/S1/publish --out frontend/map/public/mock-s1
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

import duckdb
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
MAP_DIR = Path(__file__).resolve().parents[1]
TILE_RES = 2                  # teselas de focos: H3 r2 (~86.000 km²)
POINTS_HEAVY = 150_000        # si algún mes de la zona supera esto, los focos se ven recién con zoom ≥ 6
POINTS_MIN_ZOOM_HEAVY = 6


def q(path: Path) -> str:
    return str(path).replace("\\", "/").replace("'", "''")


def write(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), default=str)
    path.write_text(data, encoding="utf-8")
    return len(data)


def columnar(con, sql: str) -> dict:
    cur = con.execute(sql)
    names = [d[0] for d in cur.description]
    rows = cur.fetchall()
    return {"length": len(rows)} | {n: [r[i] for r in rows] for i, n in enumerate(names)}


def split_runs(keys: np.ndarray):
    """Índices [inicio, fin) de cada tramo con la misma clave (el arreglo viene ordenado)."""
    if len(keys) == 0:
        return []
    cuts = np.flatnonzero(keys[1:] != keys[:-1]) + 1
    starts = np.concatenate(([0], cuts))
    ends = np.concatenate((cuts, [len(keys)]))
    return list(zip(starts.tolist(), ends.tolist()))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--publish", default=str(ROOT / "data" / "publish"))
    ap.add_argument("--out", default=str(MAP_DIR / "public" / "mock-api"))
    args = ap.parse_args()
    pub, out = Path(args.publish).resolve(), Path(args.out).resolve()
    if not (pub / "meta" / "version.json").exists():
        raise SystemExit(f"No hay {pub}/meta/version.json. Correr antes el pipeline hasta export.")
    if out.exists():
        shutil.rmtree(out)
    t0 = time.time()
    con = duckdb.connect()
    con.execute("INSTALL h3 FROM community; LOAD h3")

    raw = (pub / "meta" / "version.json").read_bytes()
    try:
        version = json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError:  # version.json escrito sin UTF-8 en Windows (export.py viejo)
        version = json.loads(raw.decode("cp1252"))
    outline = json.loads((pub / "zone" / "outline.geojson").read_text(encoding="utf-8"))

    # --- Serie de la zona ---
    write(out / "calendar.json", columnar(con, f"""
        SELECT year, month, round(n_equiv, 2) n_equiv, round(p05, 2) p05, round(p95, 2) p95, coverage_frac, status,
               round(median, 2) median, round(anomaly_abs, 2) anomaly_abs, round(anomaly_pct, 3) anomaly_pct,
               round(pct_rank, 3) pct_rank
        FROM '{q(pub / "zone/calendar.parquet")}' ORDER BY year, month"""))
    write(out / "timeline_8d.json", columnar(con, f"""
        SELECT year, period_8d, period_start, round(n_equiv, 2) n_equiv, round(p05, 2) p05, round(p95, 2) p95,
               coverage_frac, status, round(median, 2) median, round(anomaly_pct, 3) anomaly_pct
        FROM '{q(pub / "zone/timeline_8d.parquet")}' ORDER BY period_start"""))

    # --- map/: un archivo por resolución y mes ---
    domain, months_with_cells, n_map = {}, set(), 0
    resolutions = sorted(int(p.name.split("=")[1]) for p in (pub / "map").glob("res=*"))
    for res in resolutions:
        src = q(pub / "map" / f"res={res}" / "*.parquet")
        domain[res] = con.execute(f"""SELECT quantile_cont(n_equiv, 0.99)
                                      FROM read_parquet('{src}', hive_partitioning = false)""").fetchone()[0] or 1
        a = con.execute(f"""
            SELECT year * 100 + month AS ym, lower(hex(cell)) AS cell, round(n_equiv, 3) AS n_equiv,
                   round(anomaly_pct, 3) AS anomaly_pct
            FROM read_parquet('{src}', hive_partitioning = false) ORDER BY ym, cell""").fetchnumpy()
        for s, e in split_runs(a["ym"]):
            ym = int(a["ym"][s])
            key = f"{ym // 100}-{ym % 100:02d}"
            months_with_cells.add(key)
            anom = a["anomaly_pct"][s:e]
            n_map += write(out / "map" / f"res={res}" / f"{key}.json", {
                "res": res, "month": key, "length": e - s,
                "cell": a["cell"][s:e].tolist(), "n_equiv": a["n_equiv"][s:e].tolist(),
                "anomaly_pct": [None if v is None or v != v else v for v in anom.tolist()],
            })
        print(f"  map r{res}: escala hasta {domain[res]:.1f}")

        history = con.execute(f"""
            SELECT lower(hex(h3_cell_to_parent(cell, {TILE_RES}))) AS tile, lower(hex(cell)) AS cell,
                   year * 100 + month AS ym, round(n_equiv, 3) AS n_equiv
            FROM read_parquet('{src}', hive_partitioning = false)
            ORDER BY tile, cell, ym""").fetchnumpy()
        for s, e in split_runs(history["tile"]):
            tile = str(history["tile"][s])
            write(out / "series" / f"res={res}" / f"{tile}.json", {
                "res": res, "tile": tile, "length": e - s,
                "cell": history["cell"][s:e].tolist(),
                "month": [f"{ym // 100}-{ym % 100:02d}" for ym in history["ym"][s:e]],
                "n_equiv": history["n_equiv"][s:e].tolist(),
            })

    # --- points/: teselas r2 por mes de la fecha local ---
    pts = f"read_parquet('{q(pub / 'points')}/**/*.parquet', hive_partitioning = true)"
    years = [r[0] for r in con.execute(f"SELECT DISTINCT year(local_date) FROM {pts} ORDER BY 1").fetchall()]
    max_month, n_pts, n_files, point_months = 0, 0, 0, []
    for year in years:
        a = con.execute(f"""
            SELECT month(local_date) AS m, lower(hex(h3_latlng_to_cell(latitude, longitude, {TILE_RES}))) AS tile,
                   round(latitude, 4) AS lat, round(longitude, 4) AS lon,
                   CAST(epoch(datetime_utc) AS BIGINT) AS t,
                   CAST(local_date - DATE '1970-01-01' AS INTEGER) AS d,
                   round(frp_mw, 1) AS frp, round(t_mir_k, 1) AS t_mir,
                   round(t_tir_k, 1) AS t_tir, round(scan_km, 3) AS scan,
                   round(track_km, 3) AS track, CAST(is_day AS INTEGER) AS day,
                   platform, conf_class AS conf
            FROM {pts} WHERE year(local_date) = {year}
            ORDER BY m, tile, datetime_utc""").fetchnumpy()
        for ms, me in split_runs(a["m"]):
            key = f"{year}-{int(a['m'][ms]):02d}"
            index = {}
            for s, e in split_runs(a["tile"][ms:me]):
                s, e = s + ms, e + ms
                tile = str(a["tile"][s])
                index[tile] = e - s
                write(out / "points" / key / f"{tile}.json", {
                    "month": key, "tile": tile, "length": e - s,
                    **{c: a[c][s:e].tolist() for c in (
                        "lat", "lon", "t", "d", "frp", "t_mir", "t_tir", "scan", "track",
                        "day", "platform", "conf",
                    )},
                })
                n_files += 1
            write(out / "points" / key / "index.json", {"month": key, "tile_res": TILE_RES, "tiles": index})
            point_months.append(key)
            total = me - ms
            max_month = max(max_month, total)
            n_pts += total
        print(f"  points {year}: {len(a['m']):,} focos")

    heavy = max_month > POINTS_HEAVY
    write(out / "meta.json", {
        "zone": version["zone"],
        "outline": outline,
        "switch_date": version["switch_date"],
        "coverage": version["coverage"],
        "reduced_coverage_months": version["reduced_coverage_months"],
        "dataset_version": version["dataset_version"],
        "config_hash": version["config_hash"],
        "attribution": version["attribution"],
        "map": {"resolutions": resolutions, "domain": domain, "months": sorted(months_with_cells)},
        "points": {"tile_res": TILE_RES, "min_zoom": POINTS_MIN_ZOOM_HEAVY if heavy else 0,
                   "max_month": max_month, "months": point_months},
    })
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"Listo en {time.time() - t0:.0f} s: {out} ({size / 1e6:.0f} MB, {n_pts:,} focos en {n_files:,} teselas; "
          f"mes más pesado {max_month:,} focos → zoom mínimo de focos {POINTS_MIN_ZOOM_HEAVY if heavy else 0})")


if __name__ == "__main__":
    main()
