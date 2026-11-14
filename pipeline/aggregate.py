"""fires_daily: celda r7 × día local × plataforma × día/noche, con tres métricas (§4.2–4.3)."""
from __future__ import annotations

import logging

from .config import Config
from .db import require_view

log = logging.getLogger(__name__)


def run(cfg: Config, con) -> dict:
    require_view(con, "fires_norm")
    r3, r2 = cfg["h3"]["region_res"], cfg["h3"]["fallback_res"]
    con.execute("DELETE FROM fires_daily")
    # Con agregados nuevos, el k ajustado antes ya no corresponde: que ningún lote lo copie de acá.
    con.execute("DELETE FROM calibration_meta")
    con.execute(f"""
        INSERT INTO fires_daily
        SELECT h3_r7 AS cell,
               h3_parent(h3_r7, {r3}) AS region_r3,
               h3_parent(h3_r7, {r2}) AS region_r2,
               local_date, sensor, platform, is_day,
               count(*)::INTEGER AS n_fires,
               -- foco equivalente MODIS: celdas de ~1 km con fuego en cada pasada
               count(DISTINCT (h3_r8, overpass_bucket))::INTEGER AS n_clusters,
               -- lo mismo con celdas de ~5 km² (píxel MODIS en el borde de la pasada)
               count(DISTINCT overpass_bucket)::INTEGER AS n_clusters_r7,
               sum(frp_mw) AS frp_sum_mw
        FROM fires_norm
        GROUP BY ALL
        ORDER BY cell, local_date
    """)
    n, fires = con.execute("SELECT count(*), sum(n_fires) FROM fires_daily").fetchone()
    log.info("fires_daily: %d filas, %s focos", n, fires)
    return {"rows": n, "fires": fires}
