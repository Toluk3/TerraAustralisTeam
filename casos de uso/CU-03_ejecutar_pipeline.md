# CU-03 — Ejecutar el pipeline completo

**Actor:** equipo de datos.
**Objetivo:** pasar de los CSV de FIRMS a la base `data/prehack.duckdb` normalizada y armonizada, y a los archivos listos para la app en `data/publish/`.
**Código:** [`pipeline/`](../pipeline) · configuración en [`config.yaml`](../config.yaml)

## Precondiciones

- CU-01 hecho (datos en `Datos/`) y el contorno de la zona (CU-02, ya versionado).
- Entorno de Python:
  ```bash
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
  ```
  En Windows, `.venv\Scripts\` en lugar de `.venv/bin/` en todos los comandos de los casos de uso.
  DuckDB baja la primera vez las extensiones `h3` (community) y `spatial`. Si `h3` no instala, el pipeline usa `h3` de Python.

## Flujo principal

Todo de una vez (descarga lo que falte, arma la zona y procesa):

```bash
scripts/ejecutar_todo.sh
```

o solo el procesamiento:

```bash
.venv/bin/python -m pipeline all
```

| # | Paso | Qué hace (PLAN_NORMALIZACION.md) | Escribe | Tiempo* |
|---|---|---|---|---|
| 1 | `ingest` | Lee cada CSV todo como texto y agrega `sensor`, `country`, `source_file`, `row_number` (§3, paso 1) | `data/raw/sensor=*/year=*` | 13 s |
| 2 | `normalize` | Tipos, fecha solar local, filtros `type` y máscara estática, confianza, versión, duplicados, celdas H3 (pasos 2–8) | `data/norm/`, `data/excluded/`, `static_mask` | 4 s |
| 3 | `support` | Calendario, períodos de cada plataforma, `coverage_frac`, qué plataforma compone la serie cada día (§4.5, §5.2) | `calendar`, `platform_periods`, `platform_days`, `coverage`, `series_source`, `series_coverage` | 0,1 s |
| 4 | `aggregate` | Celda r7 × día local × plataforma × día/noche con `n_fires`, `n_clusters`, `n_clusters_r7` y los clusters VIIRS nocturnos por tramo de FRP (§4.2–4.3) | `fires_daily` | 1 s |
| 4b | `detect` | Pesos de detectabilidad MODIS por tramo de FRP (región r1, con respaldo global) y `n_clusters_det` | `detect_weights`, `fires_daily` | — |
| 5 | `calibrate` | `k` por región × mes × día/noche en el solape estable, con respaldo r3 → r2 → r1 → global (`calibration_levels`), y 200 réplicas bootstrap (§5.3, §5.5) | `calibration`, `calibration_boot`, `k_by_year` | 49 s |
| 6 | `rollup` | Aplica `k` por día y agrega a mes y a 8 días (§4.4, §5.4) | `fires_monthly`, `fires_8d` | 1,5 s |
| 7 | `validate` | Validación dejando un año afuera y tabla de ablación (§6) | `validation` | 7 s |
| 8 | `qc` | Deriva de la hora de pasada, conteos por versión del algoritmo, cierre de conteos (§8) | `qc_solar_hour`, `qc_algo_epoch`, `qc_report` | 0,2 s |
| 9 | `zone` | Celdas de la zona, serie con bandas p05–p95, mediana y percentiles históricos | `zone_cells`, `zone_series`, `zone_baseline`, `zone_before_after` | 0,4 s |
| 10 | `export` | Escribe la estructura del bucket (CU-08) | `data/publish/` | 1 s |

\* Argentina 2000–2025, 6,3 M de filas, en una laptop.

Para ver qué hay en la base:

```bash
.venv/bin/python -m pipeline status
```

## Resultado

- `data/prehack.duckdb` con las tablas chicas y las vistas `fires_raw`, `fires_norm` y `fires_excluded` sobre los Parquet. El esquema completo, comentado, está en [`pipeline/schema.sql`](../pipeline/schema.sql).
- `data/publish/` (45 MB) con `series/`, `calibration/`, `map/`, `points/`, `zone/`, `reportes/` y `meta/version.json`.
- Corrida de referencia: 6.330.305 filas leídas → 5.621.086 focos limpios + 709.219 descartados. Cierra exacto por sensor y año.

## Garantías

- **Idempotente:** cada paso borra su salida antes de escribirla. Dos corridas dan los mismos conteos (prueba 5).
- **Cierre de conteos:** `qc` falla si `fires_norm + fires_excluded ≠ fires_raw` en algún sensor y año.
- **Trazabilidad:** `source_file` + `row_number` llevan de cualquier foco a su fila en el CSV original (CU-05).
- **Un solo escritor:** el pipeline abre la base para escribir; la app tiene que abrirla con `read_only=True`.

## Errores

| Mensaje | Causa | Solución |
|---|---|---|
| `No existe .../Datos` | Falta la descarga | CU-01 |
| `valores de satellite desconocidos` | Un CSV trae un satélite que el pipeline no conoce | Agregarlo en `PLATFORMS` de `pipeline/normalize.py` |
| `config_hash ... volver a correr` | Cambió un parámetro después de calibrar | CU-04 |
| `No cierra norm + excluded = raw` | Error de normalización | Revisar `qc_report` (CU-05) y reportarlo |
| `Could not set lock on file` | Otro proceso tiene la base abierta | Cerrar el otro proceso (por ejemplo, un notebook) |
