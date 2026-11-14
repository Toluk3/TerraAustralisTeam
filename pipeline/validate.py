"""Validación dejando un año afuera y tabla de ablación (§6).

Para cada año del solape estable se ajusta k con los demás años y se predice el excluido:
predicción = Σ fuente × k, observado = Σ referencia (MODIS), comparados en región r3 × mes.
"""
from __future__ import annotations

import logging
import statistics
from collections import defaultdict

from .calibrate import eligible_months, fit_windows
from .config import METRICS, Config
from .db import sql_in
from .qc import clear_step, write_qc

log = logging.getLogger(__name__)

# variante → (métrica, por región, por mes, día/noche por separado, sin corrección)
VARIANTS = {
    "sin_correccion":               ("n_fires", False, False, False, True),
    "k_global":                     ("n_fires", False, False, False, False),
    "k_region_mes":                 ("n_fires", True, True, False, False),
    "k_region_mes_dianoche":        ("n_fires", True, True, True, False),
    "k_region_mes_dianoche_clusters":    ("n_clusters", True, True, True, False),
    "k_region_mes_dianoche_clusters_r7": ("n_clusters_r7", True, True, True, False),
}
METRIC_VARIANT = {"n_fires": "k_region_mes_dianoche", "n_clusters": "k_region_mes_dianoche_clusters",
                  "n_clusters_r7": "k_region_mes_dianoche_clusters_r7"}


def load_overlap(cfg: Config, con, src: str, a, b) -> list[dict]:
    ref = sql_in(cfg.reference_platforms)
    sums = ", ".join(
        f"coalesce(sum(f.{m}) FILTER (f.platform IN ({ref})), 0)::DOUBLE, "
        f"coalesce(sum(f.{m}) FILTER (f.platform = '{src}'), 0)::DOUBLE" for m in METRICS)
    rows = con.execute(f"""
        SELECT f.region_r3, f.region_r2, year(f.local_date), month(f.local_date), f.is_day, {sums}
        FROM fires_daily f
        JOIN _eligible e ON e.source_platform = '{src}' AND e.year = year(f.local_date)
             AND e.month = month(f.local_date)
        WHERE f.local_date BETWEEN DATE '{a}' AND DATE '{b}' AND f.platform IN ({ref}, '{src}')
        GROUP BY ALL
    """).fetchall()
    keys = ["r3", "r2", "year", "month", "is_day"] + [f"{p}_{m}" for m in METRICS for p in ("ref", "src")]
    return [dict(zip(keys, r)) for r in rows]


def _mdist(a: int, b: int) -> int:
    d = abs(a - b)
    return min(d, 12 - d)


class Model:
    """Mismo estimador que calibrate.py (cociente de sumas, ventana, respaldo r3 → r2 → global)."""

    def __init__(self, train, metric, by_region, by_month, by_dn, window, min_count):
        self.metric, self.by_region, self.by_month, self.by_dn = metric, by_region, by_month, by_dn
        self.min_count = min_count
        self.sums: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
        months = range(1, 13) if by_month else [0]
        for r in train:
            dn = r["is_day"] if by_dn else None
            levels = [("r3", r["r3"]), ("r2", r["r2"]), ("global", 0)] if by_region else [("global", 0)]
            for m in months:
                if by_month and _mdist(m, r["month"]) > window:
                    continue
                for lvl, reg in levels:
                    s = self.sums[(lvl, reg, m, dn)]
                    s[0] += r[f"ref_{metric}"]
                    s[1] += r[f"src_{metric}"]

    def k(self, r: dict) -> float | None:
        m = r["month"] if self.by_month else 0
        dn = r["is_day"] if self.by_dn else None
        if self.by_region:
            for lvl, reg in (("r3", r["r3"]), ("r2", r["r2"])):
                s = self.sums.get((lvl, reg, m, dn))
                if s and s[1] >= self.min_count:
                    return s[0] / s[1]
        s = self.sums.get(("global", 0, m, dn))
        return s[0] / s[1] if s and s[1] > 0 else None


def metrics(pairs: list[tuple[float, float]]) -> tuple:
    """(sesgo relativo, error absoluto mediano, nmae, correlación, Σpred/Σobs, n)."""
    if not pairs:
        return (None, None, None, None, None, 0)
    sp, so = sum(p for p, _ in pairs), sum(o for _, o in pairs)
    corr = None
    if len(pairs) > 2:
        try:
            corr = statistics.correlation([p for p, _ in pairs], [o for _, o in pairs])
        except statistics.StatisticsError:
            pass
    mae = statistics.median(abs(p - o) for p, o in pairs)
    mean_obs = so / len(pairs)
    return ((sp - so) / so if so else None, mae, mae / mean_obs if mean_obs else None,
            corr, sp / so if so else None, len(pairs))


def run(cfg: Config, con) -> dict:
    windows = {k: v for k, v in fit_windows(cfg, con).items() if k != "terra"}
    con.execute("DELETE FROM validation")
    clear_step(con, "validation")
    if not windows:
        log.warning("validación: no hay solape VIIRS–MODIS")
        return {}
    eligible_months(cfg, con, windows)
    w, minc, h = int(cfg["month_window"]), cfg["min_source_count"], cfg.config_hash
    ins = "INSERT INTO validation VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    summary = {}
    for src, (a, b) in windows.items():
        data = load_overlap(cfg, con, src, a, b)
        years = sorted({r["year"] for r in data})
        if len(years) < 2:
            log.warning("validación %s: hace falta más de un año de solape (hay %s)", src, years)
            continue
        for name, (metric, by_region, by_month, by_dn, none) in VARIANTS.items():
            pooled, pooled_dn = [], defaultdict(list)
            for y in years:
                model = None if none else Model([r for r in data if r["year"] != y], metric,
                                                by_region, by_month, by_dn, w, minc)
                cell: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
                for r in (r for r in data if r["year"] == y):
                    k = 1.0 if none else model.k(r)
                    if k is None:
                        continue
                    acc = cell[(r["r3"], r["month"], r["is_day"])]
                    acc[0] += r[f"src_{metric}"] * k
                    acc[1] += r[f"ref_{metric}"]
                both: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
                for (r3, m, dn), (p, o) in cell.items():
                    both[(r3, m)][0] += p
                    both[(r3, m)][1] += o
                pairs = [tuple(v) for v in both.values()]
                pooled += pairs
                con.execute(ins, [name, src, y, None, *metrics(pairs), h])
                for dn in (True, False):
                    p = [tuple(v) for key, v in cell.items() if key[2] == dn]
                    pooled_dn[dn] += p
                    con.execute(ins, [name, src, y, dn, *metrics(p), h])
            con.execute(ins, [name, src, None, None, *metrics(pooled), h])
            for dn, p in pooled_dn.items():
                con.execute(ins, [name, src, None, dn, *metrics(p), h])
        summary[src] = acceptance(cfg, con, src)
    return summary


def acceptance(cfg: Config, con, src: str) -> dict:
    """Criterios de aceptación de §6 sobre la variante de la métrica configurada."""
    variant = METRIC_VARIANT[cfg["metric"]]
    rows = con.execute("""SELECT held_out_year, is_day, ratio_pred_obs, rel_bias FROM validation
                          WHERE variant = ? AND source_platform = ? AND held_out_year IS NOT NULL""",
                       [variant, src]).fetchall()
    ratio_ok = all(r[2] is not None and 0.9 <= r[2] <= 1.1 for r in rows if r[1] is not None)
    bias_ok = all(r[3] is not None and abs(r[3]) <= 0.10 for r in rows if r[1] is None)
    best = con.execute("""SELECT variant FROM validation WHERE source_platform = ? AND held_out_year IS NULL
                          AND is_day IS NULL AND variant <> 'sin_correccion'
                          ORDER BY nmae LIMIT 1""", [src]).fetchone()
    res = {"variante_configurada": variant, "ratio_0.9_1.1": ratio_ok, "sesgo_10pct": bias_ok,
           "mejor_variante": best[0] if best else None}
    write_qc(con, cfg, sensor="VIIRS", year=None, step="validation", rows_in=len(rows), rows_out=len(rows),
             detail=f"{src}: {res}")
    log.info("validación %s: %s", src, res)
    return res
