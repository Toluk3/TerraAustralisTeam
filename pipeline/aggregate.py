"""fires_daily: celda r7 × día local × plataforma × día/noche, con las métricas de §4.2–4.3.

Primero se agrupa por cluster (h3_r8 × pasada) y después por celda y día. Para los clusters VIIRS
nocturnos se guardan además los conteos por tramo de FRP y con detección de Aqua (vn_b*, va_b*), que
usa `detect` para n_clusters_det. n_clusters_det queda en NULL hasta correr `detect`.
"""
from __future__ import annotations

import logging

from .config import Config
from .db import require_view
from .detect import NB, bin_expr

log = logging.getLogger(__name__)


def run(cfg: Config, con) -> dict:
    require_view(con, "fires_norm")
    r3, r2 = cfg["h3"]["region_res"], cfg["h3"]["fallback_res"]
    con.execute("DELETE FROM fires_daily")
    # Con agregados nuevos, el k ajustado antes ya no corresponde: que ningún lote lo copie de acá.
    con.execute("DELETE FROM calibration_meta")
    bins = ",\n".join([f"count(*) FILTER (vn AND b = {i})::INTEGER AS vn_b{i}" for i in range(NB)]
                       + [f"count(*) FILTER (vn AND b = {i} AND con_aqua)::INTEGER AS va_b{i}" for i in range(NB)])
    con.execute(f"""
        INSERT INTO fires_daily BY NAME
        WITH cl AS (
            SELECT h3_r7, h3_r8, overpass_bucket, local_date, sensor, platform, is_day,
                   count(*) AS n_pix, sum(frp_mw) AS frp
            FROM fires_norm
            GROUP BY h3_r7, h3_r8, overpass_bucket, local_date, sensor, platform, is_day),
        aq AS (SELECT DISTINCT h3_r7, local_date FROM fires_norm WHERE platform = 'aqua' AND NOT is_day),
        c AS (
            SELECT cl.*, {bin_expr('coalesce(cl.frp, 0)')} AS b,
                   (cl.sensor = 'VIIRS' AND NOT cl.is_day) AS vn,
                   (aq.h3_r7 IS NOT NULL) AS con_aqua
            FROM cl LEFT JOIN aq ON aq.h3_r7 = cl.h3_r7 AND aq.local_date = cl.local_date
                                AND cl.sensor = 'VIIRS' AND NOT cl.is_day)
        SELECT h3_r7 AS cell,
               h3_parent(h3_r7, {r3}) AS region_r3,
               h3_parent(h3_r7, {r2}) AS region_r2,
               local_date, sensor, platform, is_day,
               sum(n_pix)::INTEGER AS n_fires,
               -- foco equivalente MODIS: celdas de ~1 km con fuego en cada pasada
               count(*)::INTEGER AS n_clusters,
               -- lo mismo con celdas de ~5 km² (píxel MODIS en el borde de la pasada)
               count(DISTINCT overpass_bucket)::INTEGER AS n_clusters_r7,
               sum(frp) AS frp_sum_mw,
               NULL::DOUBLE AS n_clusters_det,
               {bins}
        FROM c
        GROUP BY h3_r7, local_date, sensor, platform, is_day
        ORDER BY cell, local_date
    """)
    n, fires = con.execute("SELECT count(*), sum(n_fires) FROM fires_daily").fetchone()
    log.info("fires_daily: %d filas, %s focos", n, fires)
    return {"rows": n, "fires": fires}
