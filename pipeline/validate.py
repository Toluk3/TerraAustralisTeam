"""Validación dejando un año afuera y tabla de ablación (§6).

Para cada año del solape estable se ajusta k con los demás años y se predice el excluido:
predicción = Σ fuente × k, observado = Σ referencia (MODIS), comparados en región r3 × mes.
Siempre con los datos de la corrida, aunque k se ajuste con calibration_from: mide el método en cada lote.
Para n_clusters_det los pesos de detectabilidad también se ajustan sin el año excluido.

Criterio de aceptación (§6): el cociente día + noche de cada año entre 0,9 y 1,1 (es lo que muestra la
serie) y el de día también. La noche se informa como aviso fuera de 0,85–1,15: MODIS detecta pocos
fuegos de noche y su cociente varía más de un año a otro.
"""
from __future__ import annotations

import logging
import statistics
from collections import defaultdict

from .calibrate import eligible_months, fit_windows
from .config import METRICS, Config
from .db import sql_in
from .detect import NB, VA, VN, fit_weights, region_sql
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
    "k_region_mes_dianoche_clusters_det": ("n_clusters_det", True, True, True, False),
}
METRIC_VARIANT = {"n_fires": "k_region_mes_dianoche", "n_clusters": "k_region_mes_dianoche_clusters",
                  "n_clusters_r7": "k_region_mes_dianoche_clusters_r7",
                  "n_clusters_det": "k_region_mes_dianoche_clusters_det"}
NIGHT_WARN = (0.85, 1.15)


def load_overlap(cfg: Config, con, src: str, a, b) -> list[dict]:
    """Sumas por región × año-mes × día/noche. `r3` es la región en la que se compara; `reg` tiene
    la región de cada nivel de calibration_levels."""
    ref = sql_in(cfg.reference_platforms)
    levels = [lv for lv in cfg["calibration_levels"] if lv != "global"]
    regs = "".join(f"{cfg.level_region_sql(lv)} AS _reg{i}, " for i, lv in enumerate(levels))
    sums = ", ".join(
        f"coalesce(sum(f.{m}) FILTER (f.platform IN ({ref})), 0)::DOUBLE, "
        f"coalesce(sum(f.{m}) FILTER (f.platform = '{src}'), 0)::DOUBLE" for m in METRICS)
    bins = ", ".join(f"coalesce(sum(f.{c}) FILTER (f.platform = '{src}'), 0)::DOUBLE" for c in VN + VA)
    rows = con.execute(f"""
        SELECT f.region_r3, {regs}year(f.local_date), month(f.local_date), f.is_day, {sums},
               {region_sql(cfg)} AS _rdet, {bins}
        FROM fires_daily f
        JOIN _eligible e ON e.source_platform = '{src}' AND e.year = year(f.local_date)
             AND e.month = month(f.local_date)
        WHERE f.local_date BETWEEN DATE '{a}' AND DATE '{b}' AND f.platform IN ({ref}, '{src}')
        GROUP BY ALL
    """).fetchall()
    n = len(levels)
    keys = ["year", "month", "is_day"] + [f"{p}_{m}" for m in METRICS for p in ("ref", "src")]
    nk = len(keys)
    out = []
    for r in rows:
        d = dict(zip(keys, r[1 + n:1 + n + nk]))
        d["r3"] = r[0]
        d["reg"] = dict(zip(levels, r[1:1 + n])) | {"global": 0}
        rest = r[1 + n + nk:]
        d["rdet"], d["vn"], d["va"] = rest[0], list(rest[1:1 + NB]), list(rest[1 + NB:])
        out.append(d)
    return out


def with_fold_weights(rows: list[dict], train: list[dict], min_count: int) -> list[dict]:
    """Copia de `rows` con src_n_clusters_det recalculado con pesos ajustados solo con `train`."""
    glob, regional = fit_weights(((r["rdet"], r["vn"], r["va"]) for r in train if not r["is_day"]), min_count)
    out = []
    for r in rows:
        d = dict(r)
        if not r["is_day"]:
            ws = regional.get(r["rdet"]) or [None] * NB
            d["src_n_clusters_det"] = sum(r["vn"][i] * (ws[i] if ws[i] is not None else glob[i]) for i in range(NB))
        else:
            d["src_n_clusters_det"] = r["src_n_clusters"]
        d["ref_n_clusters_det"] = r["ref_n_clusters"]
        out.append(d)
    return out


def _mdist(a: int, b: int) -> int:
    d = abs(a - b)
    return min(d, 12 - d)


class Model:
    """Mismo estimador que calibrate.py (cociente de sumas, ventana, respaldo por calibration_levels)."""

    def __init__(self, train, metric, levels, by_month, by_dn, window, min_count):
        self.metric, self.levels, self.by_month, self.by_dn = metric, levels, by_month, by_dn
        self.min_count = min_count
        self.sums: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
        months = range(1, 13) if by_month else [0]
        for r in train:
            dn = r["is_day"] if by_dn else None
            for m in months:
                if by_month and _mdist(m, r["month"]) > window:
                    continue
                for lvl in levels:
                    s = self.sums[(lvl, r["reg"][lvl], m, dn)]
                    s[0] += r[f"ref_{metric}"]
                    s[1] += r[f"src_{metric}"]

    def k(self, r: dict) -> float | None:
        m = r["month"] if self.by_month else 0
        dn = r["is_day"] if self.by_dn else None
        for lvl in self.levels:
            s = self.sums.get((lvl, r["reg"][lvl], m, dn))
            if not s:
                continue
            if lvl == "global":
                if s[1] > 0:
                    return s[0] / s[1]
            elif s[1] >= self.min_count:
                return s[0] / s[1]
        return None


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
    det_min = int(cfg.get("detect_min_count") or 200)
    levels = list(cfg["calibration_levels"])
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
                train = [r for r in data if r["year"] != y]
                test = [r for r in data if r["year"] == y]
                if metric == "n_clusters_det":
                    train, test = (with_fold_weights(x, train, det_min) for x in (train, test))
                model = None if none else Model(train, metric,
                                                levels if by_region else ["global"], by_month, by_dn, w, minc)
                cell: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
                for r in test:
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
    inside = lambda r, lo, hi: r is not None and lo <= r <= hi  # noqa: E731
    total_ok = all(inside(r[2], 0.9, 1.1) for r in rows if r[1] is None)
    day_ok = all(inside(r[2], 0.9, 1.1) for r in rows if r[1] is True)
    bias_ok = all(r[3] is not None and abs(r[3]) <= 0.10 for r in rows if r[1] is None)
    night_out = {r[0]: round(r[2], 3) if r[2] is not None else None
                 for r in rows if r[1] is False and not inside(r[2], *NIGHT_WARN)}
    best = con.execute("""SELECT variant FROM validation WHERE source_platform = ? AND held_out_year IS NULL
                          AND is_day IS NULL AND variant <> 'sin_correccion'
                          ORDER BY nmae LIMIT 1""", [src]).fetchone()
    res = {"variante_configurada": variant, "dia_noche_0.9_1.1": total_ok, "dia_0.9_1.1": day_ok,
           "sesgo_10pct": bias_ok, "noche_fuera_0.85_1.15": night_out,
           "mejor_variante": best[0] if best else None}
    write_qc(con, cfg, sensor="VIIRS", year=None, step="validation", rows_in=len(rows), rows_out=len(rows),
             detail=f"{src}: {res}")
    log.info("validación %s: %s", src, res)
    if night_out:
        log.warning("validación %s: cociente nocturno fuera de 0,85–1,15 en %s (aviso, no es criterio)",
                    src, night_out)
    if not (total_ok and day_ok and bias_ok):
        log.warning("validación %s: NO cumple el criterio de aceptación", src)
    return res
