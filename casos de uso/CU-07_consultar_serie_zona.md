# CU-07 — Consultar la serie, la mediana y las anomalías de la zona

**Actor:** backend (Django) o quien prepare los gráficos.
**Objetivo:** obtener los números que muestra la app: el calendario año × mes armonizado, la mediana histórica, la banda de incertidumbre y la anomalía (ARQUITECTURA.md §5).

## Precondiciones

- CU-03 hecho. La app **solo** muestra la serie armonizada, nunca conteos por sensor.

## Opción A — Archivos publicados (lo que usa la app)

```python
import duckdb
con = duckdb.connect()
cal = con.sql("SELECT * FROM 'data/publish/zone/calendar.parquet' ORDER BY year, month").df()
```

| Archivo | Columnas | Endpoint |
|---|---|---|
| `zone/calendar.parquet` | `year, month, n_equiv, p05, p95, coverage_frac, status, median, p10, p25, p75, p90, anomaly_abs, anomaly_pct, pct_rank` | `/api/calendar` |
| `zone/baseline.parquet` | `month, median, p10, p25, p75, p90, n_years` | `/api/calendar` |
| `zone/timeline_8d.parquet` | `year, period_8d, period_start, n_equiv, p05, p95, coverage_frac, status, median, anomaly_abs, anomaly_pct, pct_rank` | `/api/timeline?step=8d` |
| `map/res=<5,6,7>/part-0.parquet` | `cell, year, month, n_equiv, anomaly_pct` | `/api/map` (la resolución según el zoom) |
| `points/year=<YYYY>/h3_r3=<c>/` | `latitude, longitude, datetime_utc, local_date, frp_mw, is_day, sensor, platform, …` | `/api/points?year=` |
| `zone/outline.geojson`, `meta/version.json` | contorno, versión, `config_hash`, meses con cobertura reducida | `/api/meta` |

## Opción B — Directo sobre la base

```python
import duckdb
con = duckdb.connect("data/prehack.duckdb", read_only=True)
```

Calendario mensual con ceros y "sin datos":

```sql
SELECT year, period AS month, round(n_equiv, 1) AS focos, round(p05, 1) AS p05, round(p95, 1) AS p95, status
FROM zone_series WHERE period_kind = 'month' ORDER BY year, period;
```

Para un área que no sea la zona, se suma `fires_monthly.n_equiv_series` de sus celdas y se reponen los ceros contra `calendar`, como en §7 de PLAN_NORMALIZACION.md:

```sql
WITH area_cells AS (SELECT unnest(h3_polygon_wkt_to_cells('POLYGON((-71.6 -41.3, -71.2 -41.3, -71.2 -40.9, -71.6 -40.9, -71.6 -41.3))', 7)) AS cell),
area AS (SELECT year, month, sum(n_equiv_series) AS v FROM fires_monthly
         WHERE cell IN (SELECT cell FROM area_cells) GROUP BY ALL)
SELECT s.year, s.period AS month,
       CASE WHEN s.coverage_frac = 0 THEN NULL ELSE coalesce(a.v, 0) END AS focos, s.coverage_frac
FROM series_coverage s LEFT JOIN area a ON a.year = s.year AND a.month = s.period
WHERE s.period_kind = 'month' ORDER BY 1, 2;
```

## Cómo leer los valores

- **`n_equiv`** está en "focos equivalentes Terra + Aqua" y no es entero: es una esperanza, no un conteo de detecciones (§5.4).
- **`status`:** `ok` = cobertura completa; `parcial` = alguna plataforma de la serie no operó todo el período (agosto y septiembre de 2020, por el corte de Aqua), así que se muestra marcado y no entra en la mediana; `sin_datos` = ninguna plataforma de la serie operaba. `sin_datos` no es lo mismo que 0: un 0 es un mes sin focos.
- **Anomalía:** en la Patagonia muchos meses tienen mediana muy baja. Si la mediana es 0, `anomaly_pct` queda en NULL y se usan `anomaly_abs` y `pct_rank` (proporción de años con un valor menor o igual), como pide ARQUITECTURA.md §9.
- **Banda p05–p95:** sale de las 200 réplicas bootstrap de `k`, sumadas sobre la zona entera, no celda por celda (§5.5). Antes de `switch_date` la banda es casi nula, porque la serie es MODIS observado.
- **Paso semanal:** si la mediana del área es menor que `min_median_count` (5), conviene sugerir la vista mensual (§5.6).

## Ejemplo real: incendios de enero y febrero de 2025

| Mes | Focos equivalentes | p05–p95 | Mediana histórica | Anomalía | Percentil |
|---|---|---|---|---|---|
| 2025-01 | 505 | 471–634 | 170 | +335 | 0,88 |
| 2025-02 | 821 | 775–896 | 99 | +722 | 0,92 |
| 2025-12 | 117 | 93–151 | 111 | +5 | 0,54 |

Febrero de 2025 tuvo más de 8 veces la mediana de febrero (los incendios de la Comarca Andina y del Parque Nacional Nahuel Huapi). La serie lo muestra sin el salto artificial que habría al contar puntos VIIRS.
