"""Pruebas automáticas de PLAN_NORMALIZACION.md §8."""
from __future__ import annotations

import datetime as dt

import pytest

from pipeline import calibrate, ingest, normalize, qc, rollup
from pipeline.rollup import ConfigHashMismatch

from .conftest import make_config, special_rows, synthetic


def _row(con, lon, lat=-38.5, sensor="MODIS"):
    """Busca una fila especial en norm o excluded y devuelve (drop_reason, conf_class, ...)."""
    for table, reason in (("fires_norm", "NULL"), ("fires_excluded", "drop_reason")):
        r = con.execute(f"""SELECT {reason}, conf_class, datetime_utc, algo_epoch, is_nrt, local_date,
                                   local_solar_hour, platform
                            FROM {table} WHERE source_file LIKE 'especiales/%' AND sensor = ?
                              AND latitude = ? AND longitude = ? ORDER BY row_number""",
                        [sensor, lat, lon]).fetchall()
        if r:
            return r
    return []


# 1. Muestra fija con resultado esperado escrito a mano
@pytest.mark.parametrize("sensor,lat,lon,expected", [
    ("MODIS", -38.5, -68.0, "low_conf"),
    ("MODIS", -38.5, -68.1, None),
    ("MODIS", -38.5, -68.4, "type_2"),
    ("MODIS", -38.5, -68.5, "type_1"),
    ("MODIS", -38.5, -68.6, "type_3"),
    ("MODIS", -95.0, -68.6, "out_of_range"),
    ("MODIS", -38.5, -68.7, "out_of_range"),
    ("MODIS", -38.5, -68.8, "out_of_range"),
    ("VIIRS", -38.7, -68.0, "low_conf"),
    ("VIIRS", -38.7, -68.1, None),
    ("VIIRS", -38.7, -68.2, "out_of_range"),
    ("VIIRS", -38.7, -68.3, "type_2"),
])
def test_muestra_fija(pipeline_run, sensor, lat, lon, expected):
    _, con = pipeline_run
    rows = _row(con, lon, lat, sensor)
    assert len(rows) == 1
    assert rows[0][0] == expected


def test_duplicados_solo_dentro_de_la_plataforma(pipeline_run):
    _, con = pipeline_run
    rows = _row(con, -68.9, -38.6)
    # norm devuelve aqua + terra; excluded devuelve el duplicado de aqua
    excl = con.execute("""SELECT platform, drop_reason FROM fires_excluded WHERE source_file LIKE 'especiales/%'
                          AND latitude = -38.6 AND longitude = -68.9""").fetchall()
    norm = con.execute("""SELECT platform FROM fires_norm WHERE source_file LIKE 'especiales/%'
                          AND latitude = -38.6 AND longitude = -68.9 ORDER BY 1""").fetchall()
    assert excl == [("aqua", "duplicate")]
    assert norm == [("aqua",), ("terra",)]
    assert len(rows) == 2


def test_version_y_nrt(pipeline_run):
    _, con = pipeline_run
    assert _row(con, -69.0, -38.6)[0][3] == "c6_v2"
    assert _row(con, -68.1, -38.5)[0][3] == "c6_v3"
    nrt = _row(con, -68.4, -38.7, "VIIRS")[0]
    assert nrt[4] is True and nrt[3] == "c2"


# 2. acq_time = "0231" conserva el cero (y "231" se rellena a 4 dígitos)
def test_acq_time_conserva_el_cero(pipeline_run):
    _, con = pipeline_run
    for lon in (-68.0, -68.1):
        ts = _row(con, lon)[0][2]
        assert (ts.hour, ts.minute) == (2, 31)


# 3. Confianza MODIS: 29 → low, 30 → nominal, 79 → nominal, 80 → high
@pytest.mark.parametrize("lon,cls", [(-68.0, "low"), (-68.1, "nominal"), (-68.2, "nominal"), (-68.3, "high")])
def test_cortes_de_confianza_modis(pipeline_run, lon, cls):
    _, con = pipeline_run
    assert _row(con, lon)[0][1] == cls


# 4. CSV vacío o país sin archivo no rompe la ingesta
def test_csv_vacio_no_rompe(pipeline_run):
    _, con = pipeline_run
    detail = con.execute("SELECT detail FROM qc_report WHERE step = 'ingest_skipped'").fetchone()[0]
    assert "modis_2020_Argentina.csv: vacío" in detail
    assert "viirs-jpss1_2020_Argentina.csv: sin filas" in detail
    assert con.execute("SELECT count(*) FROM fires_raw WHERE country = 'Chile'").fetchone()[0] == 0


def test_cierre_raw_norm_excluded(pipeline_run):
    _, con = pipeline_run
    assert qc.check_closure(con) == []


# 5. Dos corridas dan conteos idénticos
def test_idempotencia(tmp_path):
    synthetic(tmp_path / "Datos", seed=3)
    special_rows(tmp_path / "Datos")
    cfg = make_config(tmp_path)
    from pipeline.db import connect
    con = connect(cfg)
    counts = []
    for _ in range(2):
        ingest.run(cfg, con)
        normalize.run(cfg, con)
        counts.append(con.execute("""SELECT (SELECT count(*) FROM fires_raw), (SELECT count(*) FROM fires_norm),
                                            (SELECT count(*) FROM fires_excluded),
                                            (SELECT sum(hash(source_file, row_number)) FROM fires_norm)""").fetchone())
    con.close()
    assert counts[0] == counts[1]


# 6. SUM(fires_daily.n_fires) = filas de fires_norm
def test_daily_cierra_contra_norm(pipeline_run):
    _, con = pipeline_run
    a, b = con.execute("SELECT (SELECT sum(n_fires) FROM fires_daily), (SELECT count(*) FROM fires_norm)").fetchone()
    assert a == b


# 7. n_clusters_r7 ≤ n_clusters ≤ n_fires
def test_orden_de_metricas(pipeline_run):
    _, con = pipeline_run
    bad = con.execute("""SELECT count(*) FROM fires_daily
                         WHERE NOT (n_clusters_r7 <= n_clusters AND n_clusters <= n_fires)""").fetchone()[0]
    assert bad == 0
    # y el agrupamiento efectivamente junta píxeles VIIRS
    assert con.execute("SELECT sum(n_clusters) < sum(n_fires) FROM fires_daily WHERE sensor = 'VIIRS'").fetchone()[0]


# 8. 03:30 UTC en longitud +150° → mismo día, 13:30 solar
def test_fecha_solar_local(pipeline_run):
    _, con = pipeline_run
    r = _row(con, 150.0, 25.0, "VIIRS")[0]
    assert r[5] == dt.date(2019, 6, 3)
    assert r[6] == pytest.approx(13.5)


# 9. Sin focos en un mes → 0; antes del inicio de los datos → sin datos
def test_ceros_y_sin_datos(pipeline_run):
    _, con = pipeline_run
    s = {(y, p): (v, st) for y, p, v, st in con.execute(
        "SELECT year, period, n_equiv, status FROM zone_series WHERE period_kind = 'month'").fetchall()}
    assert s[(2018, 6)] == (None, "sin_datos")      # calendario empieza en 2018, los datos en 2019
    assert s[(2019, 6)][1] == "ok" and s[(2019, 6)][0] > 0
    # Un mes sin focos en la zona da 0, no NULL: se borran los focos de un mes y se recalcula
    con.execute("CREATE TEMP TABLE _bak AS SELECT * FROM fires_daily WHERE local_date BETWEEN '2020-03-01' AND '2020-03-31'")
    con.execute("DELETE FROM fires_daily WHERE local_date BETWEEN '2020-03-01' AND '2020-03-31'")
    from pipeline import zone
    zone.run(pipeline_run[0], con)
    v, st = con.execute("""SELECT n_equiv, status FROM zone_series
                           WHERE period_kind = 'month' AND year = 2020 AND period = 3""").fetchone()
    con.execute("INSERT INTO fires_daily SELECT * FROM _bak")
    zone.run(pipeline_run[0], con)
    assert (v, st) == (0, "ok")


def test_corte_de_aqua_es_cobertura_parcial(pipeline_run):
    _, con = pipeline_run
    cf = con.execute("""SELECT coverage_frac FROM coverage WHERE platform = 'aqua' AND period_kind = 'month'
                        AND year = 2020 AND period = 8""").fetchone()[0]
    assert cf == pytest.approx(15 / 31)   # corte del 16/08 al 02/09: 15 días con datos
    assert con.execute("""SELECT status FROM zone_series WHERE period_kind = 'month'
                          AND year = 2020 AND period = 8""").fetchone()[0] == "parcial"


# 10. config_hash distinto entre calibration y rollups hace fallar el pipeline
def test_config_hash_distinto_falla(pipeline_run):
    cfg, con = pipeline_run
    other = make_config(cfg.base_dir, min_conf_class="high")
    assert other.config_hash != cfg.config_hash
    with pytest.raises(ConfigHashMismatch):
        rollup.run(other, con)


def test_calibracion_recupera_el_cociente(pipeline_run):
    """Datos sintéticos: por incendio 1 píxel Terra + 1–2 Aqua (≈ 2,5 MODIS) y 3–4 píxeles NOAA-20 de día,
    3–6 de noche. En n_fires, k ≈ 2,5 / 3,5 ≈ 0,71 de día y ≈ 2,5 / 4,5 ≈ 0,56 de noche."""
    _, con = pipeline_run
    k = con.execute("""SELECT sum(sum_ref) / sum(sum_source) FROM calibration
                       WHERE level = 'global' AND source_platform = 'noaa20' AND metric = 'n_fires'
                         AND is_day = ?""", [True]).fetchone()[0]
    assert 0.64 < k < 0.78
    k_n = con.execute("""SELECT sum(sum_ref) / sum(sum_source) FROM calibration
                         WHERE level = 'global' AND source_platform = 'noaa20' AND metric = 'n_fires'
                           AND NOT is_day""").fetchone()[0]
    assert 0.50 < k_n < 0.62


def test_serie_sin_escalon_en_switch_date(pipeline_run):
    """La serie armonizada de 2022 (VIIRS × k) queda en el mismo nivel que la de 2021 (MODIS)."""
    _, con = pipeline_run
    y21, y22 = (con.execute(f"SELECT sum(n_equiv_series) FROM fires_monthly WHERE year = {y}").fetchone()[0]
                for y in (2021, 2022))
    assert 0.8 < y22 / y21 < 1.25


def test_k_por_region_usa_respaldo(pipeline_run):
    _, con = pipeline_run
    levels = {r[0] for r in con.execute("SELECT DISTINCT level FROM calibration").fetchall()}
    assert levels == {"r3", "r2", "global"}


def test_banda_bootstrap_contiene_el_valor(pipeline_run):
    _, con = pipeline_run
    bad = con.execute("""SELECT count(*) FROM zone_series WHERE year >= 2022 AND status = 'ok' AND n_equiv > 0
                         AND NOT (p05 <= n_equiv * 1.0001 AND n_equiv <= p95 * 1.0001)""").fetchone()[0]
    assert bad == 0
