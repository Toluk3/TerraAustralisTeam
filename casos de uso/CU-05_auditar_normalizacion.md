# CU-05 — Auditar la normalización y rastrear un foco

**Actor:** equipo de datos.
**Objetivo:** saber cuántos focos se descartaron, por qué y en qué años, y volver de cualquier foco a su fila en el CSV original.

## Precondiciones

- CU-03 hecho. Abrir la base en solo lectura:
  ```bash
  .venv/bin/python -c "import duckdb; c = duckdb.connect('data/prehack.duckdb', read_only=True); c.execute('LOAD h3'); print(c.sql(\"SELECT * FROM qc_report WHERE step = 'normalize' ORDER BY sensor, year\"))"
  ```
  o con la CLI de DuckDB: `duckdb -readonly data/prehack.duckdb`.

## Flujo principal

**1. Descartes por sensor, año y motivo** (`qc_report`, paso `normalize`):

```sql
SELECT sensor, year, rows_in, rows_out, drops
FROM qc_report WHERE step = 'normalize' ORDER BY sensor, year;
```

`drops` es un mapa `motivo → filas`. Los motivos (`fires_excluded.drop_reason`) se aplican en este orden y cada fila lleva el primero que le corresponde:

| Motivo | Regla | Argentina 2000–2025 |
|---|---|---|
| `out_of_range` | Coordenadas, fecha u hora inválidas; `t_mir_k` fuera de 250–550 K; FRP < 0; confianza o `daynight` ilegibles | 4.563 |
| `type_1`, `type_2`, `type_3` | Volcán, otra fuente estática, offshore | 4 / 161.774 / 14.195 |
| `static_mask` | Cae en una celda r8 con fuentes estáticas según VIIRS standard (MODIS: también el anillo vecino) | 51.085 |
| `low_conf` | Clase de confianza por debajo de `min_conf_class` | 477.595 |
| `duplicate` | Misma plataforma, coordenadas y hora | 3 |

**2. Revisar la máscara estática** (zona petrolera de Neuquén, §3 paso 3):

```sql
SELECT year, sensor, count(*) AS sacados_por_mascara
FROM fires_excluded WHERE drop_reason = 'static_mask'
GROUP BY ALL ORDER BY sensor, year;
```

En los datos reales la máscara tiene 729 celdas núcleo (3.245 contando el anillo) y en MODIS no hay un salto en 2018 (156 focos en 2018 contra 144 en 2017). Para ver dónde están las celdas: `SELECT h3_cell_to_lat(h3_r8), h3_cell_to_lng(h3_r8), n_months FROM static_mask WHERE is_core`.

**3. Saltos por versión del algoritmo** (2018 y 2023, §3 paso 5):

```sql
SELECT platform, year, algo_epoch, sum(n_fires) FROM qc_algo_epoch
WHERE sensor = 'MODIS' GROUP BY ALL ORDER BY platform, year;
```

**4. Deriva orbital de MODIS** (§5.1), con los propios datos:

```sql
SELECT platform, year, round(median_solar_hour, 2) AS hora_solar
FROM qc_solar_hour WHERE is_day AND platform IN ('terra', 'aqua') ORDER BY platform, year;
```

| | 2015 | 2020 | 2022 | 2024 | 2025 |
|---|---|---|---|---|---|
| Aqua (diurno) | 13,93 | 13,90 | 13,96 | 14,53 | 15,05 |
| Terra (diurno) | 10,25 | 10,25 | 10,02 | 9,51 | 9,10 |

La deriva queda confirmada: por eso la calibración usa el solape hasta `modis_stable_until = 2021-12-31` y la serie pasa a VIIRS en `switch_date`. También sale en `data/publish/reportes/hora_solar_por_plataforma.csv` para el gráfico del pitch.

**5. Rastrear un foco hasta el CSV original:**

```sql
SELECT source_file, row_number, drop_reason, confidence_raw, fire_type
FROM fires_excluded
WHERE latitude BETWEEN -38.95 AND -38.90 AND longitude BETWEEN -68.10 AND -68.05
LIMIT 5;
```

`source_file` es la ruta relativa a `Datos/` (o `zip!miembro`) y `row_number` es la fila del CSV contando desde 1 sin el encabezado. Por ejemplo: `sed -n "$((row_number + 1))p" Datos/<source_file>`.

## Resultado

Una explicación verificable de cada foco que entró o no a la serie, y de los cambios del sensor en el tiempo. `data/publish/reportes/qc_normalizacion.csv` tiene el resumen de los pasos 1 a 8 en formato planilla.
