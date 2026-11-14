-- Base de datos del pipeline: data/prehack.duckdb (PLAN_NORMALIZACION.md §1).
--
-- Las tablas de focos son Parquet particionados por sensor/year y se exponen como vistas
-- (pipeline/db.py → refresh_views):
--   fires_raw       data/raw/       una fila por fila de CSV, todo VARCHAR (paso 1)
--   fires_norm      data/norm/      esquema canónico (§2)
--   fires_excluded  data/excluded/  descartes con drop_reason
-- Celdas H3 como UBIGINT. La fecha de todos los agregados es local_date (fecha solar local).

-- Auditoría por sensor × año × paso (§8)
CREATE TABLE IF NOT EXISTS qc_report (
    run_at        TIMESTAMPTZ,
    config_hash   VARCHAR,
    sensor        VARCHAR,
    year          INTEGER,
    step          VARCHAR,
    rows_in       BIGINT,
    rows_out      BIGINT,
    drops         MAP(VARCHAR, BIGINT),
    date_min      DATE,
    date_max      DATE,
    stats         MAP(VARCHAR, DOUBLE),
    detail        VARCHAR
);

-- Mediana de la hora solar local por plataforma y año: deriva orbital de Terra y Aqua (§5.1)
CREATE TABLE IF NOT EXISTS qc_solar_hour (
    platform          VARCHAR,
    year              INTEGER,
    is_day            BOOLEAN,
    median_solar_hour DOUBLE,
    n_fires           BIGINT
);

-- Conteos por algo_epoch para ver saltos de colección en 2018 y 2023 (§3, paso 5)
CREATE TABLE IF NOT EXISTS qc_algo_epoch (
    sensor     VARCHAR,
    platform   VARCHAR,
    year       INTEGER,
    algo_epoch VARCHAR,
    is_nrt     BOOLEAN,
    n_fires    BIGINT
);

-- Celdas r8 con fuentes estáticas según VIIRS standard (§3, paso 3)
CREATE TABLE IF NOT EXISTS static_mask (
    h3_r8     UBIGINT,
    is_core   BOOLEAN,     -- true: tuvo focos type <> 0; false: anillo vecino (solo se aplica a MODIS)
    n_months  INTEGER      -- meses distintos con focos type <> 0 (NULL en el anillo)
);

-- Un registro por día (§4.5)
CREATE TABLE IF NOT EXISTS calendar (
    date            DATE,
    year            INTEGER,
    month           INTEGER,
    day_of_year     INTEGER,
    period_8d       INTEGER,
    period_8d_start DATE,
    month_start     DATE
);

-- Inicio, fin y cortes de cada plataforma (§4.5)
CREATE TABLE IF NOT EXISTS platform_periods (
    platform    VARCHAR,
    valid_from  DATE,
    valid_to    DATE,        -- NULL = sigue operando
    kind        VARCHAR      -- operación | corte | datos (rango presente en Datos/)
);

-- Días en que cada plataforma tiene datos: operación ∩ datos − cortes
CREATE TABLE IF NOT EXISTS platform_days (
    platform  VARCHAR,
    date      DATE
);

-- coverage_frac = días operativos / días del período, por plataforma (§4.5)
CREATE TABLE IF NOT EXISTS coverage (
    platform       VARCHAR,
    period_kind    VARCHAR,   -- month | 8d
    year           INTEGER,
    period         INTEGER,   -- mes (1–12) o period_8d (1–46)
    period_start   DATE,
    n_days         INTEGER,
    n_days_ok      INTEGER,
    coverage_frac  DOUBLE
);

-- Plataformas que componen la serie armonizada cada día (§5.2)
CREATE TABLE IF NOT EXISTS series_source (
    date      DATE,
    platform  VARCHAR,
    segment   VARCHAR    -- terra_only | modis | viirs
);

-- Cobertura de la serie armonizada: fracción de días en que operaron todas sus plataformas
CREATE TABLE IF NOT EXISTS series_coverage (
    period_kind    VARCHAR,
    year           INTEGER,
    period         INTEGER,
    period_start   DATE,
    coverage_frac  DOUBLE
);

-- Celda r7 × día local × plataforma × día/noche (§4.2)
CREATE TABLE IF NOT EXISTS fires_daily (
    cell           UBIGINT,
    region_r3      UBIGINT,
    region_r2      UBIGINT,
    local_date     DATE,
    sensor         VARCHAR,
    platform       VARCHAR,
    is_day         BOOLEAN,
    n_fires        INTEGER,   -- píxeles detectados
    n_clusters     INTEGER,   -- COUNT(DISTINCT (h3_r8, overpass_bucket))
    n_clusters_r7  INTEGER,   -- COUNT(DISTINCT (h3_r7, overpass_bucket))
    frp_sum_mw     DOUBLE
);

-- Factores k (§5.3): nivel × región × mes × día/noche × plataforma fuente × métrica
CREATE TABLE IF NOT EXISTS calibration (
    source_platform VARCHAR,
    reference       VARCHAR,
    metric          VARCHAR,
    level           VARCHAR,    -- r3 | r2 | global
    region          UBIGINT,    -- celda H3 del nivel; 0 en global
    month           INTEGER,
    is_day          BOOLEAN,
    k               DOUBLE,
    sum_ref         DOUBLE,
    sum_source      DOUBLE,
    n_cell_days     BIGINT,
    usable          BOOLEAN,    -- sum_source >= min_source_count (global: sum_source > 0)
    k_p05           DOUBLE,
    k_p95           DOUBLE,
    fit_from        DATE,
    fit_to          DATE,
    config_hash     VARCHAR,
    fitted_at       TIMESTAMPTZ
);

-- Réplicas bootstrap de k, remuestreando años-mes completos del solape (§5.5)
CREATE TABLE IF NOT EXISTS calibration_boot (
    source_platform VARCHAR,
    metric          VARCHAR,
    level           VARCHAR,
    region          UBIGINT,
    month           INTEGER,
    is_day          BOOLEAN,
    rep             INTEGER,
    k               DOUBLE,
    config_hash     VARCHAR
);

-- Rollups (§4.4). Solo filas con focos: los ceros se reponen al consultar contra calendar.
CREATE TABLE IF NOT EXISTS fires_monthly (
    cell            UBIGINT,
    region_r3       UBIGINT,
    year            INTEGER,
    month           INTEGER,
    period_start    DATE,
    sensor          VARCHAR,
    platform        VARCHAR,
    is_day          BOOLEAN,
    n_fires         INTEGER,
    n_clusters      INTEGER,
    n_clusters_r7   INTEGER,
    frp_sum_mw      DOUBLE,
    n_fire_days     INTEGER,
    n_equiv         DOUBLE,     -- métrica × k, aplicado por día (§5.4)
    n_equiv_series  DOUBLE,     -- parte de n_equiv que entra en la serie armonizada (§5.2)
    k_used          DOUBLE,     -- n_equiv / métrica
    coverage_frac   DOUBLE,
    config_hash     VARCHAR
);

CREATE TABLE IF NOT EXISTS fires_8d (
    cell            UBIGINT,
    region_r3       UBIGINT,
    year            INTEGER,
    period_8d       INTEGER,
    period_start    DATE,
    sensor          VARCHAR,
    platform        VARCHAR,
    is_day          BOOLEAN,
    n_fires         INTEGER,
    n_clusters      INTEGER,
    n_clusters_r7   INTEGER,
    frp_sum_mw      DOUBLE,
    n_fire_days     INTEGER,
    n_equiv         DOUBLE,
    n_equiv_series  DOUBLE,
    k_used          DOUBLE,
    coverage_frac   DOUBLE,
    config_hash     VARCHAR
);

-- Validación dejando un año afuera y tabla de ablación (§6)
CREATE TABLE IF NOT EXISTS validation (
    variant         VARCHAR,
    source_platform VARCHAR,
    held_out_year   INTEGER,    -- NULL = todos los años juntos
    is_day          BOOLEAN,    -- NULL = día + noche
    rel_bias        DOUBLE,
    median_abs_err  DOUBLE,     -- en unidades de la métrica
    nmae            DOUBLE,     -- median_abs_err / media observada: comparable entre métricas
    corr            DOUBLE,
    ratio_pred_obs  DOUBLE,
    n_region_months BIGINT,
    config_hash     VARCHAR
);

-- k global año por año, también después de modis_stable_until: diagnóstico de deriva (§6)
CREATE TABLE IF NOT EXISTS k_by_year (
    source_platform VARCHAR,
    metric          VARCHAR,
    year            INTEGER,
    is_day          BOOLEAN,
    k               DOUBLE,
    sum_ref         DOUBLE,
    sum_source      DOUBLE
);

-- Celdas r7 de la zona de la demo, por centroide (§7)
CREATE TABLE IF NOT EXISTS zone_cells (
    cell UBIGINT
);
