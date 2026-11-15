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


def test_pasadas_por_huecos_de_tiempo(pipeline_run):
    """Focos a 2 min de distancia son la misma pasada aunque crucen un borde de ventana; a 2 h, no."""
    _, con = pipeline_run
    b = [r[0] for r in con.execute("""SELECT overpass_bucket FROM fires_norm WHERE source_file LIKE 'especiales/%'
                                      AND longitude BETWEEN -67.5003 AND -67.4999 ORDER BY datetime_utc""").fetchall()]
    assert len(b) == 3 and b[0] == b[1] != b[2]


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
    assert levels == {"r3", "r2", "r1", "global"}


def test_banda_bootstrap_contiene_el_valor(pipeline_run):
    _, con = pipeline_run
    bad = con.execute("""SELECT count(*) FROM zone_series WHERE year >= 2022 AND status = 'ok' AND n_equiv > 0
                         AND NOT (p05 <= n_equiv * 1.0001 AND n_equiv <= p95 * 1.0001)""").fetchone()[0]
    assert bad == 0


def test_zona_multipoligono(tmp_path):
    """Una zona de varios polígonos separados (islas, varios países) cubre celdas en todos ellos.

    h3_polygon_wkt_to_cells devuelve una lista vacía para un MULTIPOLYGON; antes la zona quedaba
    con 0 celdas sin ningún error.
    """
    import json

    import h3

    from pipeline import zone
    from pipeline.db import connect

    rect = lambda w, s, e, n: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]  # noqa: E731
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": rect(-70, -41, -68, -39)}},
        {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": rect(-60, -31, -58, -29)}},
    ]}
    cfg = make_config(tmp_path, zone={"outline": "zona/multi.geojson", "map_resolutions": [7]})
    (tmp_path / "zona" / "multi.geojson").write_text(json.dumps(gj))
    con = connect(cfg)
    n = zone.build_cells(cfg, con)
    cells = [h3.int_to_str(c) for (c,) in con.execute("SELECT cell FROM zone_cells").fetchall()]
    lats = [h3.cell_to_latlng(c)[0] for c in cells]
    assert n > 0
    assert any(lat < -38 for lat in lats) and any(lat > -32 for lat in lats)


# --- Cobertura: ausencia de archivo = 0 focos; un sensor que termina antes no tiene cobertura después ---
def _hasta_support(tmp_path, preparar):
    from pipeline import ingest, normalize, support
    from pipeline.db import connect
    from .conftest import synthetic

    tmp_path.mkdir(parents=True, exist_ok=True)
    synthetic(tmp_path / "Datos")
    preparar(tmp_path / "Datos")
    cfg = make_config(tmp_path)
    con = connect(cfg)
    for step in (ingest, normalize, support):
        step.run(cfg, con)
    return cfg, con


def _cov(con, platform, year):
    return con.execute("""SELECT min(coverage_frac), max(coverage_frac) FROM coverage
                          WHERE period_kind = 'month' AND platform = ? AND year = ?""", [platform, year]).fetchone()


def test_anio_sin_archivo_entre_dos_con_datos_es_cero(tmp_path):
    """Si el país no tuvo detecciones un año, FIRMS no publica su archivo: es 0, no "sin datos"."""
    from pipeline import aggregate, calibrate, detect, rollup, zone

    cfg, con = _hasta_support(tmp_path, lambda d: (d / "modis/2021/modis_2021_Argentina.csv").unlink())
    assert _cov(con, "terra", 2021) == (1.0, 1.0)
    for step in (aggregate, detect, calibrate, rollup, zone):
        step.run(cfg, con)
    v, st = con.execute("""SELECT n_equiv, status FROM zone_series
                           WHERE period_kind = 'month' AND year = 2021 AND period = 3""").fetchone()
    assert (v, st) == (0, "ok")
    con.close()


def test_sensor_que_termina_antes_no_tiene_cobertura_despues(tmp_path):
    """MODIS llega hasta 2021 y VIIRS hasta 2022: 2022 no puede figurar con cobertura de MODIS."""
    cfg, con = _hasta_support(tmp_path, lambda d: (d / "modis/2022/modis_2022_Argentina.csv").unlink())
    assert _cov(con, "terra", 2022) == (0.0, 0.0)
    assert _cov(con, "noaa20", 2022) == (1.0, 1.0)
    con.close()


def test_zip_de_todos_los_paises_prueba_que_el_anio_esta_publicado(tmp_path):
    """Un zip all_countries sin el país pedido significa 0 focos; un CSV suelto de otro país no prueba nada."""
    import zipfile

    def suelto(d):
        f = d / "modis/2022/modis_2022_Argentina.csv"
        f.rename(f.with_name("modis_2022_Chile.csv"))
    cfg, con = _hasta_support(tmp_path / "suelto", suelto)
    assert _cov(con, "terra", 2022) == (0.0, 0.0)
    con.close()

    def en_zip(d):
        f = d / "modis/2022/modis_2022_Argentina.csv"
        with zipfile.ZipFile(d / "modis_2022_all_countries.zip", "w") as zf:
            zf.write(f, "modis/2022/modis_2022_Chile.csv")
        f.unlink()
    cfg, con = _hasta_support(tmp_path / "zip", en_zip)
    assert _cov(con, "terra", 2022) == (1.0, 1.0)
    assert con.execute("SELECT count(*) FROM fires_norm WHERE sensor = 'MODIS' AND year = 2022").fetchone()[0] == 0
    con.close()


def test_extends_aplica_solo_las_diferencias(tmp_path):
    from pipeline.config import load_config

    base = make_config(tmp_path)
    (tmp_path / "lote").mkdir()
    (tmp_path / "lote" / "x.yaml").write_text(
        "extends: ../config.yaml\npaths: {input_dir: ../Datos, data_dir: ../data/x, publish_dir: ../data/x/publish}\n"
        "countries: [Chile]\nh3: {cell_res: 6}\n", encoding="utf-8")
    cfg = load_config(tmp_path / "lote" / "x.yaml")
    assert cfg["countries"] == ["Chile"] and cfg["h3"] == {**base["h3"], "cell_res": 6}
    assert cfg["metric"] == base["metric"] and cfg.data_dir == (tmp_path / "data" / "x").resolve()
    assert cfg.config_hash != base.config_hash


def test_datos_distintos_a_los_de_la_calibracion_fallan(pipeline_run):
    cfg, con = pipeline_run
    real = con.execute("SELECT data_fingerprint FROM calibration_meta").fetchone()[0]
    assert real
    con.execute("UPDATE calibration_meta SET data_fingerprint = 'otra descarga'")
    try:
        with pytest.raises(ConfigHashMismatch):
            rollup.run(cfg, con)
    finally:
        con.execute("UPDATE calibration_meta SET data_fingerprint = ?", [real])


def test_mes_parcial_no_tiene_anomalia_y_la_base_respeta_baseline_years(pipeline_run):
    from pipeline.zone import anomaly_sql

    cfg, con = pipeline_run
    rows = {(y, p): (st, a) for y, p, st, a in con.execute(
        f"SELECT year, period, status, anomaly_pct FROM ({anomaly_sql(cfg, 'month')})").fetchall()}
    assert rows[(2020, 8)] == ("parcial", None)
    assert rows[(2022, 6)][0] == "ok"
    # baseline_years = [2003, 2021] y los datos son 2019–2022: la mediana usa a lo sumo 2019–2021
    assert con.execute("SELECT max(n_years) FROM zone_baseline WHERE period_kind = 'month'").fetchone()[0] == 3


def test_calibracion_comun_a_varios_lotes(tmp_path):
    """Con calibration_from las sumas del ajuste incluyen los fires_daily de la otra base."""
    from pipeline import aggregate, calibrate, detect, ingest, normalize, support
    from pipeline.db import connect
    from .conftest import synthetic

    q = """SELECT sum(sum_source) FROM calibration WHERE level = 'global'
           AND metric = 'n_fires' AND source_platform = 'noaa20'"""

    def lote(name, seed, **over):
        d = tmp_path / name
        d.mkdir()
        synthetic(d / "Datos", seed=seed)
        cfg = make_config(d, **over)
        con = connect(cfg)
        for step in (ingest, normalize, support, aggregate, detect, calibrate):
            step.run(cfg, con)
        return cfg, con

    cfg_a, con_a = lote("a", 7)
    solo_a = con_a.execute(q).fetchone()[0]
    con_a.close()                      # en una corrida real es el .duckdb de otro lote, que no está abierto
    cfg_b, con_b = lote("b", 11)
    solo_b = con_b.execute(q).fetchone()[0]
    comun = make_config(tmp_path / "b", calibration_from=["../a/data", "data"])   # la propia se saltea
    assert comun.config_hash != cfg_b.config_hash
    calibrate.run(comun, con_b)
    assert con_b.execute(q).fetchone()[0] == pytest.approx(solo_a + solo_b)
    k_b = con_b.execute("SELECT k FROM calibration WHERE level = 'global' ORDER BY ALL").fetchall()
    con_b.close()

    # El otro lote, con la misma lista, no vuelve a ajustar: copia el k común y queda con su config_hash
    comun_a = make_config(tmp_path / "a", calibration_from=["data", "../b/data"])
    assert comun_a.calibration_key == comun.calibration_key
    con_a = connect(comun_a)
    support.run(comun_a, con_a)         # cambió la configuración: las tablas de apoyo se rehacen
    res = calibrate.run(comun_a, con_a)
    assert "copiada_de" in res
    assert con_a.execute("SELECT k FROM calibration WHERE level = 'global' ORDER BY ALL").fetchall() == k_b
    assert {r[0] for r in con_a.execute("SELECT DISTINCT config_hash FROM calibration").fetchall()} == {comun_a.config_hash}
    rollup.run(comun_a, con_a)          # el k copiado sirve para los rollups del lote
    con_a.close()


# --- n_clusters_det (pesos de detectabilidad) ---
def test_pesos_de_detectabilidad_normalizados_y_con_respaldo():
    from pipeline.detect import NB, fit_weights

    vn = [100, 100, 100, 100, 100, 100]
    va = [2, 4, 6, 13, 28, 49]
    glob, reg = fit_weights([("a", vn, va), ("b", [10] * NB, [5] * NB)], min_count=50)
    tot = [vn[i] + 10 for i in range(NB)]
    assert sum(glob[i] * tot[i] for i in range(NB)) == pytest.approx(sum(tot))   # la suma total no cambia
    assert glob == sorted(glob)                       # más FRP, más peso
    assert reg["b"] == [None] * NB                    # sin muestra: respaldo al peso global
    assert reg["a"][0] < reg["a"][5]
    assert fit_weights([], 10) == ([1.0] * NB, {})    # sin datos, n_clusters_det = n_clusters


def test_n_clusters_det_solo_cambia_viirs_de_noche(pipeline_run):
    _, con = pipeline_run
    assert con.execute("SELECT count(*) FROM fires_daily WHERE n_clusters_det IS NULL").fetchone()[0] == 0
    assert con.execute("""SELECT count(*) FROM fires_daily WHERE NOT (sensor = 'VIIRS' AND NOT is_day)
                          AND n_clusters_det <> n_clusters""").fetchone()[0] == 0
    vn, cl = con.execute("""SELECT sum(vn_b0 + vn_b1 + vn_b2 + vn_b3 + vn_b4 + vn_b5), sum(n_clusters)
                            FROM fires_daily WHERE sensor = 'VIIRS' AND NOT is_day""").fetchone()
    assert vn == cl                                   # los tramos reparten todos los clusters nocturnos
    assert "k_region_mes_dianoche_clusters_det" in {
        r[0] for r in con.execute("SELECT DISTINCT variant FROM validation").fetchall()}


def test_calibrate_exige_detect(tmp_path):
    from pipeline import aggregate, ingest, normalize, support
    from pipeline.db import connect
    from .conftest import synthetic

    synthetic(tmp_path / "Datos")
    cfg = make_config(tmp_path)
    con = connect(cfg)
    for step in (ingest, normalize, support, aggregate):
        step.run(cfg, con)
    with pytest.raises(RuntimeError, match="detect"):
        calibrate.run(cfg, con)
    con.close()


def test_criterio_de_aceptacion_dia_noche(pipeline_run):
    cfg, con = pipeline_run
    from pipeline.validate import acceptance

    res = acceptance(cfg, con, "noaa20")
    assert {"dia_noche_0.9_1.1", "dia_0.9_1.1", "sesgo_10pct", "noche_fuera_0.85_1.15"} <= set(res)


def test_foco_del_31_12_al_este_no_abre_un_mes_en_el_anio_siguiente(tmp_path):
    """31/12 a las 23:00 UTC en longitud +150 es el 1/1 a las 09:00 locales: no tiene que existir enero."""
    from .conftest import VIIRS_COLS, viirs_row, write_csv

    def preparar(d):
        write_csv(d / "extra" / "viirs-jpss1_2022_Argentina.csv", VIIRS_COLS,
                  [viirs_row(-30.0, 150.0, "2022-12-31", "2300")])
    cfg, con = _hasta_support(tmp_path, preparar)
    assert con.execute("SELECT max(date) FROM calendar").fetchone()[0] == dt.date(2022, 12, 31)
    assert con.execute("SELECT count(*) FROM coverage WHERE year = 2023").fetchone()[0] == 0
    con.close()
