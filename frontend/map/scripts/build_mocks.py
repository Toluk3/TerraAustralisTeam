"""Genera los JSON de prueba del mapa a partir de una carpeta publish/ del pipeline.

Imitan lo que va a devolver la API (propuesta en frontend/map/README.md). Todo es columnar
({length, col1[], col2[], ...}) para que pese poco y deck.gl lo lea por índice.

  meta.json                         contorno, switch_date, cobertura, escala de color, armado de los focos
  calendar.json                     serie mensual de la zona (barra de tiempo, panel)
  timeline_8d.json                  serie de 8 días de la zona
  map/res=<r>/<YYYY-MM>.json        valor armonizado por celda H3 en ese mes
  points/<YYYY-MM>/index.json       teselas H3 r2 con focos ese mes y cuántos tiene cada una
  points/<YYYY-MM>/<r2>.json        focos de esa tesela y mes (mes de la fecha local solar)
  est/<YYYY-MM>.json                parte convertida (× k) del valor de cada celda, por grupo de calibración
  est/ratios.json                   k de cada réplica del bootstrap ÷ k, por grupo (intervalo de una selección)

Un foco va a la tesela madre (r2) de su celda de la serie (r7), no a la tesela del punto: en H3 las
celdas hijas no quedan contenidas exactamente en la madre, y el panel de selección busca los focos de una
celda en `cellToParent(celda, 2)`. Con la tesela del punto se perdía ~8 % de los focos junto a los bordes.

Partir por mes y por tesela es lo que permite zonas grandes (varios países): el mapa baja solo los
meses del período y las teselas que se ven en pantalla.

Uso (con el venv del pipeline; numpy está en requirements.txt):
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
COORD_DECIMALS = 5            # ~1 m. La celda del foco se calcula con la coordenada ya redondeada (ver points/)
# Igual que k_fallback_platform de config.yaml (version.json no lo publica)
K_FALLBACK = {"noaa21": "noaa20"}


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


def build_uncertainty(con, pub: Path, out: Path, version: dict) -> dict | None:
    """Datos para el intervalo p05–p95 de una selección cualquiera (mismo cálculo que zone.py para la zona).

    El valor de una celda y mes se parte en lo observado con la referencia (k = 1, sin incertidumbre) y lo
    convertido con k (Terra antes de Aqua, VIIRS desde switch_date). Lo convertido se guarda por grupo de
    calibración (plataforma, nivel, región, mes, día/noche: el mismo k) y, por grupo, el cociente
    k_réplica ÷ k de cada réplica del bootstrap. El panel arma el total de cada réplica como
    observado + Σ convertido × cociente y toma los percentiles 5 y 95.

    Refleja solo la incertidumbre de k. El nivel de cada fila se resuelve como k_lookup_sql (primer nivel
    usable). El mes en que empieza Aqua se toma entero como observado (la serie mensual publicada no
    separa los días de Terra sola, que son los primeros 3 de julio de 2002).
    """
    cell_res = int(version["cell_res"])
    series = pub / "series" / f"res={cell_res}" / "part-0.parquet"
    k_path, boot_path = pub / "calibration" / "k.parquet", pub / "calibration" / "boot.parquet"
    zone_map = pub / "map" / f"res={cell_res}"
    if not (series.exists() and k_path.exists() and boot_path.exists() and zone_map.exists()):
        print("  est: faltan series/, calibration/ o map/ en la resolución de la serie; el panel no mostrará intervalo")
        return None
    ref = ["aqua"] if version.get("reference") == "aqua" else ["terra", "aqua"]
    aqua_start = min((p["valid_from"] for p in version["platform_periods"]
                      if p["platform"] == "aqua" and p["kind"] == "operación"), default="2002-07-04")
    levels = list(version["calibration_levels"])
    reg = lambda lv: "0::UBIGINT" if lv == "global" else f"h3_cell_to_parent(s.cell, {int(lv[1:])})"
    fb = " ".join(f"WHEN '{a}' THEN '{b}'" for a, b in K_FALLBACK.items())
    joins = "\n".join(f"""LEFT JOIN k c{i} ON c{i}.level = '{lv}' AND c{i}.usable AND c{i}.source_platform = s.cal
                          AND c{i}.region = {reg(lv)} AND c{i}.month = s.month AND c{i}.is_day = s.is_day"""
                      for i, lv in enumerate(levels))
    lvl = " ".join(f"WHEN c{i}.k IS NOT NULL THEN '{lv}'" for i, lv in enumerate(levels))
    region = " ".join(f"WHEN c{i}.k IS NOT NULL THEN {reg(lv)}" for i, lv in enumerate(levels))
    con.execute(f"CREATE OR REPLACE TEMP TABLE k AS SELECT * FROM '{q(k_path)}' WHERE metric = '{version['metric']}'")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE est AS
        WITH s AS (
            SELECT cell, year, month, is_day, n_equiv_series AS v,
                   CASE WHEN platform IN (SELECT source_platform FROM k) THEN platform
                        ELSE CASE platform {fb} ELSE platform END END AS cal
            FROM '{q(series)}'
            WHERE n_equiv_series > 0
              AND cell IN (SELECT DISTINCT cell FROM read_parquet('{q(zone_map)}/*.parquet', hive_partitioning = false))
              AND NOT (platform IN ({", ".join(f"'{p}'" for p in ref)})
                       AND make_date(year, month, 1) >= date_trunc('month', DATE '{aqua_start}')))
        SELECT s.cell, s.year, s.month, s.cal, CASE {lvl} END AS level, CASE {region} END AS region, s.is_day,
               sum(s.v) AS n_est
        FROM s {joins} GROUP BY ALL""")
    con.execute("""CREATE OR REPLACE TEMP TABLE grp AS
                   SELECT cal, level, region, month, is_day, row_number() OVER (ORDER BY cal, level, region, month, is_day) - 1 AS g
                   FROM (SELECT DISTINCT cal, level, region, month, is_day FROM est WHERE level IS NOT NULL)""")
    n_groups = con.execute("SELECT count(*) FROM grp").fetchone()[0]
    if not n_groups:
        return None
    boot = con.execute(f"""
        SELECT g.g, b.replica, b.k / k.k AS ratio
        FROM grp g
        JOIN k ON k.source_platform = g.cal AND k.level = g.level AND k.region = g.region
              AND k.month = g.month AND k.is_day = g.is_day
        JOIN '{q(boot_path)}' b ON b.source_platform = g.cal AND b.level = g.level AND b.region = g.region
              AND b.month = g.month AND b.is_day = g.is_day
        WHERE k.k > 0""").fetchnumpy()
    reps = int(boot["replica"].max()) + 1 if len(boot["g"]) else 0
    # Grupo sin réplicas: cociente 1 (no aporta ancho al intervalo). Réplica faltante en un grupo que sí
    # tiene: 0, como en zone.py (esa réplica no encontró datos de la fuente para ajustar k).
    ratios = np.ones((n_groups, reps))
    ratios[np.unique(boot["g"])] = 0
    ratios[boot["g"], boot["replica"]] = boot["ratio"]
    keys = [f"{c}|{lv}|{r:x}|{m}|{int(d)}" for c, lv, r, m, d in con.execute(
        "SELECT cal, level, region, month, is_day FROM grp ORDER BY g").fetchall()]
    write(out / "est" / "ratios.json", {"reps": reps, "groups": keys, "ratio": np.round(ratios, 4).tolist()})
    a = con.execute("""SELECT e.year * 100 + e.month AS ym, lower(hex(e.cell)) AS cell, coalesce(g.g, -1) AS g,
                              round(e.n_est, 3) AS n_est
                       FROM est e LEFT JOIN grp g ON g.cal = e.cal AND g.level IS NOT DISTINCT FROM e.level
                            AND g.region IS NOT DISTINCT FROM e.region AND g.month = e.month AND g.is_day = e.is_day
                       ORDER BY ym, cell, g""").fetchnumpy()
    months = []
    for s, e in split_runs(a["ym"]):
        ym = int(a["ym"][s])
        key = f"{ym // 100}-{ym % 100:02d}"
        months.append(key)
        write(out / "est" / f"{key}.json", {"month": key, "length": e - s, "cell": a["cell"][s:e].tolist(),
                                              "g": a["g"][s:e].tolist(), "n_est": a["n_est"][s:e].tolist()})
    print(f"  est: {len(months)} meses con valores convertidos, {n_groups} grupos de calibración, {reps} réplicas")
    return {"res": cell_res, "reps": reps, "months": months, "source": "bootstrap de k (p05–p95)"}


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
    try:
        con.execute("INSTALL h3 FROM community; LOAD h3")
    except duckdb.Error as e:
        raise SystemExit(f"No se pudo cargar la extensión h3 de DuckDB ({e}). Hace falta red la primera vez.")

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

    uncertainty = build_uncertainty(con, pub, out, version)

    # --- points/: teselas r2 por mes de la fecha local ---
    cell_res = int(version["cell_res"])
    pts = f"read_parquet('{q(pub / 'points')}/**/*.parquet', hive_partitioning = true)"
    years = [r[0] for r in con.execute(f"SELECT DISTINCT year(local_date) FROM {pts} ORDER BY 1").fetchall()]
    max_month, n_pts, n_files, point_months = 0, 0, 0, []
    for year in years:
        a = con.execute(f"""
            SELECT month(local_date) AS m,
                   -- tesela madre de la celda de la serie, calculada con la coordenada redondeada: es
                   -- exactamente lo que hace el panel con `lat`/`lon` (latLngToCell y cellToParent)
                   lower(hex(h3_cell_to_parent(h3_latlng_to_cell(round(latitude, {COORD_DECIMALS}),
                       round(longitude, {COORD_DECIMALS}), {cell_res}), {TILE_RES}))) AS tile,
                   round(latitude, {COORD_DECIMALS}) AS lat, round(longitude, {COORD_DECIMALS}) AS lon,
                   CAST(epoch(datetime_utc) AS BIGINT) AS t,
                   CAST(local_date - DATE '1970-01-01' AS INTEGER) AS d,
                   round(frp_mw, 1) AS frp, CAST(is_day AS INTEGER) AS day, platform, conf_class AS conf
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
                    **{c: a[c][s:e].tolist() for c in ("lat", "lon", "t", "d", "frp", "day", "platform", "conf")},
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
        "metric": version.get("metric"),
        "reference": version.get("reference"),
        "cell_res": cell_res,
        "calibration_levels": version.get("calibration_levels"),
        "platform_periods": version.get("platform_periods"),
        "uncertainty": uncertainty,
        "map": {"resolutions": resolutions, "domain": domain, "months": sorted(months_with_cells)},
        "points": {"tile_res": TILE_RES, "min_zoom": POINTS_MIN_ZOOM_HEAVY if heavy else 0,
                   "max_month": max_month, "months": point_months},
    })
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"Listo en {time.time() - t0:.0f} s: {out} ({size / 1e6:.0f} MB, {n_pts:,} focos en {n_files:,} teselas; "
          f"mes más pesado {max_month:,} focos; zoom mínimo de focos {POINTS_MIN_ZOOM_HEAVY if heavy else 0})")


if __name__ == "__main__":
    main()
