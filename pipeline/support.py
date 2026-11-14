"""Tablas de apoyo: calendar, platform_periods, platform_days, coverage y composición de la serie
(§4.5, §5.2)."""
from __future__ import annotations

import datetime as dt
import logging

from .config import Config
from .db import require_view, sql_in

log = logging.getLogger(__name__)
PERIODS = (("month", "month", "month_start"), ("8d", "period_8d", "period_8d_start"))


def calendar_end(cfg: Config, con) -> dt.date:
    end = cfg.date("calendar_end")
    if end:
        return end
    last = con.execute("SELECT max(local_date) FROM fires_norm").fetchone()[0]
    return last or dt.date.today()


def run(cfg: Config, con) -> dict:
    require_view(con, "fires_norm")
    start, end = cfg.date("calendar_start"), calendar_end(cfg, con)

    con.execute("DELETE FROM calendar")
    con.execute(f"""
        INSERT INTO calendar
        SELECT d::DATE, year(d), month(d), dayofyear(d),
               (dayofyear(d) - 1) // 8 + 1,
               (make_date(year(d), 1, 1) + INTERVAL (((dayofyear(d) - 1) // 8) * 8) DAY)::DATE,
               date_trunc('month', d)::DATE
        FROM range(DATE '{start}', DATE '{end}' + INTERVAL 1 DAY, INTERVAL 1 DAY) r(d)
    """)

    # Lo documentado (config.yaml) + lo que efectivamente hay en Datos/ (kind = datos): un solo bloque
    # por plataforma, del primer al último año publicado.
    #  - Año publicado = hay un archivo de ese año para la plataforma (data_years: un zip de todos los
    #    países o un CSV de un país pedido) o
    #    hay focos. El archivo de FIRMS es anual y continuo: un año intermedio sin archivo para los
    #    países pedidos significa 0 focos, no falta de datos.
    #  - El bloque termina el 31/12 si el último año viene de un archivo anual completo; si viene de
    #    descargas NRT o de archivos sin nombre reconocible, termina en el último foco del archivo
    #    (Terra y Aqua comparten archivo). Así un sensor que llega hasta 2023 no figura con cobertura
    #    en 2024 solo porque otro sensor sí tiene datos.
    con.execute("DELETE FROM platform_periods")
    for p in cfg["platform_periods"]:
        con.execute("INSERT INTO platform_periods VALUES (?, ?, ?, ?)",
                    [p["platform"], p["valid_from"], p.get("valid_to"), p["kind"]])
    con.execute(f"""
        INSERT INTO platform_periods
        WITH fy AS (SELECT platform, year(local_date) AS y, max(local_date) AS last_d
                    FROM fires_norm GROUP BY ALL),
             grp AS (SELECT CASE WHEN platform IN ('terra', 'aqua') THEN 'modis' ELSE platform END AS g,
                            max(last_d) AS last_d FROM fy GROUP BY 1),
             yrs AS (SELECT platform, y, false AS complete FROM fy
                     UNION ALL SELECT platform, year, complete FROM data_years),
             rng AS (SELECT platform, min(y) AS y0, max(y) AS y1 FROM yrs GROUP BY 1),
             fin AS (SELECT r.platform, r.y0, r.y1, bool_or(y.complete) AS complete
                     FROM rng r JOIN yrs y ON y.platform = r.platform AND y.y = r.y1 GROUP BY ALL)
        SELECT f.platform, make_date(f.y0, 1, 1),
               least(CASE WHEN f.complete THEN make_date(f.y1, 12, 31)
                          ELSE coalesce(g.last_d, make_date(f.y1, 12, 31)) END, DATE '{end}'),
               'datos'
        FROM fin f
        LEFT JOIN grp g ON g.g = CASE WHEN f.platform IN ('terra', 'aqua') THEN 'modis' ELSE f.platform END
        WHERE make_date(f.y0, 1, 1) <= DATE '{end}'
    """)

    con.execute("DELETE FROM platform_days")
    con.execute("""
        INSERT INTO platform_days
        SELECT DISTINCT o.platform, c.date
        FROM calendar c
        JOIN platform_periods o ON o.kind = 'operación'
             AND c.date BETWEEN o.valid_from AND COALESCE(o.valid_to, DATE '9999-12-31')
        JOIN platform_periods d ON d.kind = 'datos' AND d.platform = o.platform
             AND c.date BETWEEN d.valid_from AND d.valid_to
        WHERE NOT EXISTS (
            SELECT 1 FROM platform_periods x
            WHERE x.kind = 'corte' AND x.platform = o.platform
              AND c.date BETWEEN x.valid_from AND COALESCE(x.valid_to, DATE '9999-12-31'))
    """)

    con.execute("DELETE FROM coverage")
    platforms = sorted({p["platform"] for p in cfg["platform_periods"]})
    for kind, col, start_col in PERIODS:
        con.execute(f"""
            INSERT INTO coverage
            SELECT p.platform, '{kind}', c.year, c.{col}, min(c.{start_col}),
                   count(*)::INTEGER, count(pd.date)::INTEGER, count(pd.date) / count(*)
            FROM calendar c CROSS JOIN (SELECT unnest([{sql_in(platforms)}]) AS platform) p
            LEFT JOIN platform_days pd ON pd.platform = p.platform AND pd.date = c.date
            GROUP BY ALL
        """)

    build_series_source(cfg, con)
    con.execute("DELETE FROM support_meta")
    con.execute("INSERT INTO support_meta VALUES (?, current_timestamp)", [cfg.config_hash])
    n = con.execute("SELECT count(*) FROM calendar").fetchone()[0]
    log.info("apoyo: calendario %s → %s (%d días)", start, end, n)
    return {"calendar_days": n, "calendar_end": str(end)}


def build_series_source(cfg: Config, con) -> None:
    """Composición de la serie (§5.2): Terra sola → MODIS de referencia → una sola plataforma VIIRS."""
    aqua_start, switch = cfg.aqua_start, cfg.date("switch_date")
    ref, prio = cfg.reference_platforms, cfg["viirs_priority"]
    prio_case = " ".join(f"WHEN '{p}' THEN {i}" for i, p in enumerate(prio))
    con.execute("DELETE FROM series_source")
    con.execute(f"""
        INSERT INTO series_source
        SELECT date, 'terra', 'terra_only' FROM calendar WHERE date < DATE '{aqua_start}'
        UNION ALL
        SELECT c.date, p.platform, 'modis' FROM calendar c
        CROSS JOIN (SELECT unnest([{sql_in(ref)}]) AS platform) p
        WHERE c.date >= DATE '{aqua_start}' AND c.date < DATE '{switch}'
        UNION ALL
        SELECT c.date, COALESCE(v.platform, '{prio[0]}'), 'viirs'
        FROM calendar c
        LEFT JOIN (
            SELECT date, arg_min(platform, CASE platform {prio_case} END) AS platform
            FROM platform_days WHERE platform IN ({sql_in(prio)}) GROUP BY date
        ) v USING (date)
        WHERE c.date >= DATE '{switch}'
    """)
    con.execute("DELETE FROM series_coverage")
    for kind, col, start_col in PERIODS:
        con.execute(f"""
            INSERT INTO series_coverage
            WITH day_ok AS (
                SELECT s.date, bool_and(pd.date IS NOT NULL) AS ok
                FROM series_source s
                LEFT JOIN platform_days pd ON pd.platform = s.platform AND pd.date = s.date
                GROUP BY s.date)
            SELECT '{kind}', c.year, c.{col}, min(c.{start_col}), avg(d.ok::INTEGER::DOUBLE)
            FROM calendar c JOIN day_ok d USING (date)
            GROUP BY ALL
        """)
