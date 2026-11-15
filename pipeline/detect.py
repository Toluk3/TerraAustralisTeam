"""Pesos de detectabilidad MODIS para los clusters VIIRS nocturnos: métrica n_clusters_det.

De noche MODIS no ve la mayoría de los fuegos débiles que ve VIIRS, y la proporción de fuegos débiles
cambia de un año y de una región a otra. Contar todos los clusters VIIRS hace que k cambie con esa
proporción (la noche de 2018 en Argentina da 1,18 en la validación). Un umbral fijo de FRP no alcanza:
la detección de MODIS crece de forma gradual con el FRP (Aqua ve ~2 % de los clusters de < 1 MW y ~50 %
de los de > 10 MW), y el umbral que mejor anda cambia con la región.

n_clusters_det cuenta cada cluster VIIRS nocturno con un peso proporcional a la probabilidad de que
MODIS lo detecte según su FRP. La probabilidad se estima con Aqua, que cruza a la misma hora que
NOAA-20 (~01:30): fracción de clusters VIIRS de cada tramo de FRP con alguna detección de Aqua en la
misma celda r7 y la misma noche local. Se estima por región (`detect_level`, r1 por defecto) con
respaldo al total si la región tiene pocos clusters en el tramo, y se normaliza para que la suma total
quede igual a la de n_clusters (así min_source_count y los k mantienen su escala).
De día, y para MODIS, n_clusters_det = n_clusters.

Los conteos por tramo los deja `aggregate` en fires_daily (vn_b*, va_b*). Con calibration_from los
pesos salen de la suma de todos los lotes, así que son los mismos en todos.
"""
from __future__ import annotations

import logging

from .config import Config

log = logging.getLogger(__name__)

# Límites de los tramos de FRP del cluster (MW): < 1, 1–1,5, 1,5–2, 2–5, 5–10, ≥ 10
DETECT_BINS = (1.0, 1.5, 2.0, 5.0, 10.0)
NB = len(DETECT_BINS) + 1
VN = [f"vn_b{i}" for i in range(NB)]   # clusters VIIRS nocturnos del tramo
VA = [f"va_b{i}" for i in range(NB)]   # de esos, con detección de Aqua en la misma celda r7 y noche


def bin_expr(frp: str) -> str:
    whens = " ".join(f"WHEN {frp} < {b} THEN {i}" for i, b in enumerate(DETECT_BINS))
    return f"CASE {whens} ELSE {NB - 1} END"


def fit_weights(rows, min_count: int) -> tuple[list[float], dict]:
    """Pesos por tramo, global y por región, normalizados.

    rows: iterable de (región, [vn por tramo], [va por tramo]).
    Devuelve (pesos globales, {región: [peso por tramo o None si no alcanza la muestra]}).
    Sin datos o sin ninguna detección de Aqua, todos los pesos son 1 (n_clusters_det = n_clusters).
    """
    reg_n: dict = {}
    reg_a: dict = {}
    for region, vn, va in rows:
        n, a = reg_n.setdefault(region, [0.0] * NB), reg_a.setdefault(region, [0.0] * NB)
        for i in range(NB):
            n[i] += vn[i] or 0
            a[i] += va[i] or 0
    tot_n = [sum(v[i] for v in reg_n.values()) for i in range(NB)]
    tot_a = [sum(v[i] for v in reg_a.values()) for i in range(NB)]
    p = [tot_a[i] / tot_n[i] if tot_n[i] else 0.0 for i in range(NB)]
    scale = sum(p[i] * tot_n[i] for i in range(NB)) / sum(tot_n) if sum(tot_n) else 0.0
    if scale <= 0:
        return [1.0] * NB, {}
    glob = [p[i] / scale for i in range(NB)]
    regional = {r: [(reg_a[r][i] / n[i]) / scale if n[i] >= min_count else None for i in range(NB)]
                for r, n in reg_n.items()}
    return glob, regional


def weights_join(alias: str, region_sql: str) -> tuple[str, str]:
    """(JOIN con detect_weights, expresión de n_clusters_det) para una fila `alias` de fires_daily."""
    piv = ", ".join(f"max(w) FILTER (bin = {i}) AS w{i}" for i in range(NB))
    join = f"""
        LEFT JOIN (SELECT region, {piv} FROM detect_weights WHERE level <> 'global' AND usable GROUP BY region) _wr
               ON _wr.region = {region_sql}
        LEFT JOIN (SELECT {piv} FROM detect_weights WHERE level = 'global') _wg ON true"""
    terms = " + ".join(f"{alias}.{VN[i]} * coalesce(_wr.w{i}, _wg.w{i})" for i in range(NB))
    expr = (f"CASE WHEN {alias}.sensor = 'VIIRS' AND NOT {alias}.is_day THEN ({terms})::DOUBLE "
            f"ELSE {alias}.n_clusters::DOUBLE END")
    return join, expr


def region_sql(cfg: Config, alias: str = "f") -> str:
    return cfg.level_region_sql(cfg.get("detect_level") or "r1", alias)


def run(cfg: Config, con) -> dict:
    from .calibrate import calibration_daily, fit_windows   # import local: calibrate importa este módulo

    windows = {p: w for p, w in fit_windows(cfg, con).items() if p != "terra"}
    daily = calibration_daily(cfg, con)
    rows = []
    if windows:
        # Solape con MODIS de cada plataforma VIIRS, y solo días con Aqua operando (sin el corte de 2020)
        cond = " OR ".join(f"(f.platform = '{p}' AND f.local_date BETWEEN DATE '{a}' AND DATE '{b}')"
                           for p, (a, b) in windows.items())
        sums = ", ".join(f"sum(f.{c})" for c in VN + VA)
        rows = [(r[0], list(r[1:1 + NB]), list(r[1 + NB:])) for r in con.execute(f"""
            SELECT {region_sql(cfg)} AS region, {sums}
            FROM {daily} f
            WHERE f.sensor = 'VIIRS' AND NOT f.is_day AND ({cond})
              AND f.local_date IN (SELECT date FROM platform_days WHERE platform = 'aqua')
            GROUP BY 1""").fetchall()]
    minc = int(cfg.get("detect_min_count") or 200)
    glob, regional = fit_weights(rows, minc)
    level = cfg.get("detect_level") or "r1"
    out = [("global", 0, i, None, None, glob[i], True) for i in range(NB)]
    for r, ws in regional.items():
        out += [(level, r, i, None, None, w, w is not None) for i, w in enumerate(ws)]
    con.execute("DELETE FROM detect_weights")
    con.executemany("INSERT INTO detect_weights VALUES (?, ?, ?, ?, ?, ?, ?)", out)
    if rows:   # muestra de cada tramo, para el informe
        for i in range(NB):
            n = sum(r[1][i] or 0 for r in rows)
            a = sum(r[2][i] or 0 for r in rows)
            con.execute("UPDATE detect_weights SET n_viirs = ?, n_aqua = ? WHERE level = 'global' AND bin = ?",
                        [n, a, i])

    join, expr = weights_join("f", region_sql(cfg))
    con.execute(f"""CREATE OR REPLACE TEMP TABLE _det AS
                    SELECT f.* REPLACE ({expr} AS n_clusters_det) FROM fires_daily f {join}""")
    con.execute("DELETE FROM fires_daily")
    con.execute("INSERT INTO fires_daily BY NAME SELECT * FROM _det ORDER BY cell, local_date")
    con.execute("DROP TABLE _det")
    usable = sum(1 for ws in regional.values() for w in ws if w is not None)
    log.info("detectabilidad: pesos globales por tramo de FRP %s; %d región×tramo con muestra propia",
             [round(w, 3) for w in glob], usable)
    return {"pesos_globales": [round(w, 3) for w in glob], "regiones": len(regional)}
