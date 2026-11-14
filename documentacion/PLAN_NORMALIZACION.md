# Plan de normalización y armonización de datos MODIS + VIIRS

Estado: **borrador v2.1 para revisar con el equipo.**
Base: `PLAN.md` y `PLAN_MODULO_DATOS.md`. Este documento define cómo se normalizan los CSV de FIRMS, cómo quedan guardados en **DuckDB** y cómo se calibran para obtener una sola serie.

## Cambios de la v2 (debilidades corregidas)

| # | Debilidad de la v1 | Corrección | Sección |
|---|---|---|---|
| 1 | Trataba a MODIS como referencia estable hasta 2025. No lo es: Terra y Aqua dejaron de mantener su órbita y la hora de pasada deriva (Aqua de 13:30 a ~15:50 en 2026) | Calibrar solo en el período estable y pasar a VIIRS desde `switch_date` | §5.1 |
| 2 | `k = mediana(MODIS/VIIRS)` por celda: se rompe con ceros y los conteos chicos dominan el ruido | Cociente de sumas por estrato, con ventana de ±1 mes | §5.3 |
| 3 | Omitía el paso físico de `PLAN.md`: agrupar píxeles VIIRS en ~1 km por pasada | Métrica `n_clusters` guardada junto a `n_fires`; se elige con datos | §4.3 |
| 4 | Los meses sin focos no existían como filas: la mediana histórica quedaba inflada | Tabla calendario que aporta los ceros y distingue "cero" de "sin datos" | §4.5 |
| 5 | `coverage_flag` binario | `coverage_frac` por plataforma y período | §4.5 |
| 6 | El filtro `type = 0` no sirve en datos NRT (no traen `type`) ni en MODIS anterior a 2018 (clasificación peor) | Máscara de fuentes estáticas construida con el producto standard | §3, paso 3 |
| 7 | `k` mensual aplicado a períodos de 8 días que cruzan dos meses | `k` se aplica a nivel diario y después se agrega | §5.4 |
| 8 | Bandas `lo`/`hi` sumadas entre celdas: sobreestiman la incertidumbre | Réplicas bootstrap guardadas; la banda se calcula sobre el área consultada | §5.5 |
| 9 | Dos factores encadenados (VIIRS→Aqua→Terra+Aqua) acumulan error | Un solo paso directo a la referencia | §5.2 |
| 10 | Varias plataformas VIIRS a la vez duplicarían el conteo | Una sola plataforma VIIRS por fecha, con prioridad definida | §5.2 |
| 11 | Fecha en UTC: parte en dos la noche local fuera de América | `local_date` solar | §2 |
| 12 | Grilla sin decidir | H3: r8 para agrupar, r7 para agregar, r3/r2 para calibrar | §4.1 |
| 13 | Validación sin criterio de aceptación ni comparación contra alternativas | Validación dejando un año afuera, tabla de ablación y umbrales | §6 |
| 14 | `k` solo es válido para el filtro con el que se ajustó | `config_hash` en calibración y rollups | §5.3 |
| 15 | Sin prioridades para un hackatón de dos días | P0 / P1 / P2 | §9 |

## Cambios de la v2.1

| # | Debilidad de la v2 | Corrección | Sección |
|---|---|---|---|
| 16 | `n_clusters` en r8 supone que un píxel MODIS mide ~1 km², pero en el borde de la pasada llega a ~10 km² (4,8 × 2 km). Ahí un incendio que MODIS cuenta una vez ocupa varias r8 en VIIRS, y la proporción de focos en el borde cambia por fecha y zona | Tercera métrica `n_clusters_r7` en la tabla de ablación; se elige con datos | §4.3, §6 |
| 17 | El modelo de probabilidad de detección por foco (emparejamiento MODIS ↔ VIIRS por huella `scan × track`) no estaba evaluado | Queda en P2 junto con LightGBM, solo si llega S-NPP | §9 |

## 0. Resumen

**Idea central:** los dos sensores se llevan al mismo esquema y se guardan en la misma tabla, sin fusionar detecciones. Cada foco es una fila con su `sensor` y `platform`. La diferencia de conteos se corrige sobre los agregados diarios con un factor `k` por región × mes × día/noche.

```
zips FIRMS ─▶ fires_raw ─▶ fires_norm ─▶ fires_daily ─┬─▶ fires_8d      (semanal)
(Datos/)      tal cual     esquema      celda × día   └─▶ fires_monthly (mensual)
                           común        × plataforma          ▲
                           └─▶ fires_excluded                 │ k aplicado por día
                                                   calibration + calibration_boot
static_mask · platform_periods · calendar · qc_report  (tablas de apoyo)
```

**Qué cambia entre sensores** (el resto de las 15 columnas es idéntico):

| Diferencia | MODIS | VIIRS | Campo común |
|---|---|---|---|
| Infrarrojo medio | `brightness` | `bright_ti4` | `t_mir_k` |
| Térmico | `bright_t31` | `bright_ti5` | `t_tir_k` |
| Confianza | 0–100 | `l` / `n` / `h` | `conf_class` (MODIS con cortes 30 y 80) |
| Satélite | `Terra` / `Aqua` | `N` / `N20` / `N21` | `platform`: `terra`, `aqua`, `snpp`, `noaa20`, `noaa21` |
| Versión | `6.2`, `6.03`, `61.03` | `2` | `algo_epoch` |
| Fecha y hora | `acq_date` + `acq_time` | ídem | `datetime_utc`, `local_date`, `local_solar_hour` |

## 1. Almacenamiento en DuckDB

Tablas pesadas en **Parquet particionado** por `sensor/year`, expuestas como vistas; tablas chicas dentro de **`data/prehack.duckdb`**.

| Tabla | Dónde | Contenido |
|---|---|---|
| `fires_raw` | Parquet `raw/` | Una fila por fila de CSV, todo `VARCHAR`, nombres originales |
| `fires_norm` | Parquet `norm/` | Esquema canónico (§2) |
| `fires_excluded` | Parquet `excluded/` | Descartes con `drop_reason` |
| `fires_daily` | `.duckdb` | Celda × día local × plataforma × día/noche |
| `fires_8d`, `fires_monthly` | `.duckdb` | Rollups con conteo crudo y armonizado |
| `calibration`, `calibration_boot` | `.duckdb` | Factores `k` y sus réplicas bootstrap |
| `static_mask` | `.duckdb` | Celdas H3 r8 con fuentes estáticas |
| `platform_periods` | `.duckdb` | Inicio, fin y cortes de cada plataforma |
| `calendar` | `.duckdb` | Un registro por día: `year`, `month`, `period_8d` |
| `qc_report` | `.duckdb` | Auditoría por sensor × año × paso |

Detalles que evitan errores:
- **Idempotencia:** antes de escribir una partición se borra su carpeta. `OVERWRITE_OR_IGNORE` solo no alcanza, porque deja archivos viejos.
- **`row_number`:** se genera al leer el CSV con `parallel=false` (o en Python), para que sea el orden real del archivo.
- **Concurrencia:** el pipeline es el único que escribe; la app abre el archivo con `read_only=True`.
- **Trazabilidad:** `source_file` + `row_number` identifican la fila original desde cualquier tabla de focos.
- **Extensiones:** `spatial` y `h3` (community). Si `h3` no instala, se asignan las celdas con `h3` v4 de Python.

## 2. Esquema canónico (`fires_norm`)

| Campo | Tipo | Regla |
|---|---|---|
| `source_file`, `row_number` | VARCHAR, INTEGER | Trazabilidad |
| `sensor`, `platform` | VARCHAR | Valor desconocido de `satellite` = error, no se ignora |
| `latitude`, `longitude` | DOUBLE | WGS84. Centro del píxel, no del fuego |
| `datetime_utc` | TIMESTAMPTZ | `acq_time` como texto, rellenado a 4 dígitos |
| `local_solar_hour` | DOUBLE | `(hora UTC + longitude/15) mod 24` |
| `local_date` | DATE | Fecha de `datetime_utc + longitude/15 h`. **Es la fecha que usan todos los agregados**, para que la pasada de la tarde y la de la madrugada no se partan según el huso |
| `year`, `month`, `period_8d` | INTEGER | Derivados de `local_date`. `period_8d = (día_del_año − 1) // 8 + 1` |
| `is_day` | BOOLEAN | De `daynight`. Es el dato del producto, no se recalcula: los algoritmos cambian de pruebas según ese flag |
| `overpass_bucket` | BIGINT | `floor(epoch(datetime_utc) / 3000)`. Ventanas de 50 min: dos pasadas consecutivas (~101 min) nunca comparten ventana |
| `t_mir_k`, `t_tir_k`, `frp_mw` | DOUBLE | Kelvin y MW, sin modificar |
| `scan_km`, `track_km`, `pixel_area_km2` | DOUBLE | Tamaño real del píxel |
| `confidence_raw`, `conf_class` | VARCHAR | Original y clase común |
| `fire_type` | TINYINT | 0–3; `NULL` en datos NRT |
| `product_version`, `algo_epoch` | VARCHAR | Ver paso 5 |
| `is_nrt` | BOOLEAN | `true` si `version` termina en `NRT`/`RT`/`URT` |
| `country` | VARCHAR | Del nombre del CSV |
| `h3_r8`, `h3_r7` | UBIGINT | Celdas H3 (§4.1) |

`fires_excluded` agrega `drop_reason`: `type_1`, `type_2`, `type_3`, `static_mask`, `low_conf`, `duplicate`, `out_of_range`.

## 3. Pasos de normalización

**Paso 1 — Ingesta → `fires_raw`.** Leer cada CSV desde el zip con `all_varchar=true`; agregar `sensor`, `country`, `source_file`, `row_number`, `ingested_at`; escribir la partición. *Validación:* filas por archivo = filas del CSV.

Los pasos 2 a 8 son una sola consulta SQL por sensor y año.

**Paso 2 — Tipos y tiempo.** `TRY_CAST` de numéricos; fuera de rango físico (`t_mir_k` fuera de ~250–550 K, coordenadas inválidas, `frp_mw` < 0) → `out_of_range`. Derivar tiempo, `local_date`, `overpass_bucket` y `pixel_area_km2`. *Validación:* fecha mínima por plataforma = la documentada (Terra 2000-11, Aqua 2002-07, S-NPP 2012-01-20, N20 2018-04).

**Paso 3 — Filtro de fuentes no vegetales (dos capas).**
1. `fire_type IN (1, 2, 3)` → `fires_excluded`.
2. **Máscara estática:** `static_mask` contiene las celdas `h3_r8` donde el producto **standard de VIIRS** (el de mejor clasificación) registró focos `type ≠ 0` en al menos `mask_min_months` meses distintos (parámetro; arrancar con 3). Todo foco con `fire_type` 0 o `NULL` que caiga en una celda de la máscara → `static_mask`. Para MODIS se incluye el anillo de celdas vecinas, porque el centro de un píxel de 1 km puede caer en la celda de al lado.

La máscara resuelve dos problemas con una sola regla: los datos NRT recientes (sin `type`) y los años de MODIS anteriores a 2018, donde hay fuentes estáticas mal etiquetadas como `type=0`. *Validación:* Qatar 2020 y una zona petrolera argentina (Neuquén); revisar en `qc_report` cuántos focos saca la máscara por año y que no haya un salto en 2018.

**Paso 4 — Confianza.** MODIS: `low` < 30 ≤ `nominal` < 80 ≤ `high`. VIIRS: `l`/`n`/`h`. Por defecto se descarta `low` en ambos (`min_conf_class`). La equivalencia es operativa, no física; la calibración absorbe la diferencia **siempre que el filtro sea el mismo al ajustar y al aplicar** (§5.3).

**Paso 5 — Versión.** `6.2`→`c6_v2` (2000–2017), `6.03`→`c6_v3` (2018–2022), `61.03`→`c61_v3` (2023–2025), VIIRS `2`→`c2`. Se marca, no se corrige. `qc_report` muestra los conteos por `algo_epoch` para detectar saltos en 2018 y 2023.

**Paso 6 — Plataformas.** Se guardan todas. No se deduplica entre plataformas.

**Paso 7 — Deduplicación.** Clave `(platform, latitude, longitude, datetime_utc)`, solo dentro de la misma plataforma → `duplicate`.

**Paso 8 — Celdas.** `h3_r8` y `h3_r7` por foco.

**Criterio de cierre:** `count(fires_norm) + count(fires_excluded) = count(fires_raw)` por sensor y año.

## 4. Agregación

### 4.1 Grilla (decisión propuesta: H3)

| Resolución | Área media | Uso |
|---|---|---|
| r8 | ~0,74 km² | Agrupar píxeles en "focos equivalentes" de ~1 km y máscara estática |
| r7 | ~5,2 km² | `cell` de los agregados que consulta la app |
| r3 | ~12 400 km² | Región de calibración |
| r2 | ~86 800 km² | Región de respaldo cuando r3 tiene pocos datos |

Las resoluciones gruesas se derivan con `h3_cell_to_parent`. Esto reemplaza las celdas de 0,5° y ~1 km de `PLAN.md`.

### 4.2 `fires_daily`

| Campo | Tipo |
|---|---|
| `cell` (h3_r7), `region_r3`, `region_r2` | UBIGINT |
| `local_date` | DATE |
| `sensor`, `platform` | VARCHAR |
| `is_day` | BOOLEAN |
| `n_fires` | INTEGER, píxeles detectados |
| `n_clusters` | INTEGER, ver §4.3 |
| `n_clusters_r7` | INTEGER, ver §4.3 |
| `frp_sum_mw` | DOUBLE |

Clave: `(cell, local_date, platform, is_day)`. Ordenada por `(cell, local_date)`.

### 4.3 Tres métricas: `n_fires`, `n_clusters` y `n_clusters_r7`
`n_clusters = COUNT(DISTINCT (h3_r8, overpass_bucket))`: cuántas celdas de ~1 km tuvieron fuego en cada pasada. Es el "foco equivalente MODIS" de `PLAN.md`: varios píxeles VIIRS de 375 m del mismo incendio cuentan una vez. Se calcula igual para MODIS, donde además quita los píxeles repetidos del borde de la pasada.

`n_clusters_r7 = COUNT(DISTINCT (h3_r7, overpass_bucket))`: lo mismo con celdas de ~5 km². El píxel MODIS crece de ~1 km² en el nadir a ~10 km² en el borde de la pasada (`scan` hasta 4,8 km, `track` hasta 2 km). Cerca del borde, r8 es más chica que lo que MODIS vio como un solo píxel y la métrica VIIRS queda inflada; r7 se acerca más a ese tamaño. Como la mezcla de focos de nadir y de borde cambia según la fecha y la zona, ese desajuste es ruido que `k` no absorbe del todo. El costo es una columna más en `fires_daily`.

Se guardan las tres y la calibración se corre con cada una (`metric` en `config.yaml`). Se queda la que dé menor error en validación; lo esperable es que las métricas agrupadas necesiten un `k` más cercano a 1 y más estable entre regiones.

### 4.4 Rollups
`fires_8d` y `fires_monthly` agrupan `fires_daily` y agregan `period_start` (primer día del período), `n_fire_days`, `n_equiv`, `k_used`, `coverage_frac` y `config_hash`. Clave: `(cell, year, period_8d|month, platform, is_day)`.

### 4.5 Ceros y cobertura
- Las tablas de agregados solo tienen filas donde hubo focos. **Los ceros se reponen al consultar**: se suma el área por período y se hace `LEFT JOIN` contra `calendar`. Sin esto, la mediana histórica ignora los meses sin fuego y queda inflada.
- `platform_periods` (`platform`, `valid_from`, `valid_to`, `kind`: `operación` o `corte`) define cuándo un cero es real. Un período anterior al inicio de la plataforma, o dentro de un corte, es **sin datos**, no cero.
- `coverage_frac` = días operativos / días del período. Ejemplos: agosto de 2020 para Aqua ≈ 0,5 (corte del 16/08 al 02/09); abril de 2018 para NOAA-20; el mes en curso.
- Períodos con `coverage_frac < 1` no entran en la calibración ni en la mediana histórica, y la app los muestra marcados.
- Ausencia de focos ≠ ausencia de fuego: los archivos no traen nubes.

## 5. Calibración y serie armonizada

### 5.1 MODIS no es estable hasta el final
Terra hizo su última maniobra de inclinación en febrero de 2020 y deriva hacia más temprano (10:15 en octubre de 2022, ~9:00 a fines de 2025). Aqua dejó de mantener su órbita en marzo de 2021, empezó a derivar en julio de 2021, pasó las 13:45 en febrero de 2023 y llega a ~15:50 en agosto de 2026. Como el fuego tiene un ciclo diario marcado, los conteos MODIS de los últimos años cambian aunque el fuego no cambie.

Consecuencias:
- **`modis_stable_until = 2021-12-31`** (parámetro). La calibración usa solo el solape hasta esa fecha.
- **`switch_date = 2022-01-01`**: desde ahí la serie armonizada usa VIIRS × k, no MODIS.
- `qc_report` grafica la mediana de `local_solar_hour` por plataforma y año. Sirve para confirmar la deriva con los propios datos y ajustar las dos fechas. Es además un resultado para el pitch.

### 5.2 Referencia y composición de la serie
Unidad de la serie: **equivalente Terra + Aqua** (`reference` en `config.yaml`; alternativa `aqua` para contrastar).

| Período | Fuente | Factor |
|---|---|---|
| 2000-11 → 2002-06 | Terra sola | `k` Terra → Terra+Aqua |
| 2002-07 → `switch_date` | Terra + Aqua observados | 1 |
| `switch_date` → hoy | Una plataforma VIIRS | `k` VIIRS → Terra+Aqua |

- Cada `k` va **directo** de la fuente a la referencia, en un solo paso.
- **Una sola plataforma VIIRS por fecha.** Prioridad: `noaa20`, después `noaa21`, después `snpp`. Sumar dos duplicaría el conteo. Cada plataforma tiene su propio `k`.
- El `k` de Terra sola se ajusta con 2002-07 → 2019, donde sobran datos.

### 5.3 Estimador
Para cada estrato **región × mes del año × día/noche × plataforma fuente**:

```
k = Σ referencia / Σ fuente      sobre las celdas-día del solape estable,
                                 con ventana de ±1 mes alrededor del mes
```

- **Cociente de sumas**, no mediana de cocientes: no se rompe cuando una celda tiene cero, y pesa cada celda por su actividad.
- **Ventana de ±1 mes:** triplica las muestras y evita escalones entre meses consecutivos.
- **Respaldo jerárquico:** si `Σ fuente` del estrato es menor que `min_source_count` (parámetro; arrancar con 500), se usa r2, y después el `k` global de ese mes y día/noche. `level` registra cuál se usó.
- **Día y noche siempre por separado.** De día el infrarrojo medio recibe radiación solar reflejada y el fondo está más caliente; de noche el contraste es mayor y VIIRS saca más ventaja.
- Se excluyen períodos con `coverage_frac < 1`.
- **`config_hash`:** el `k` solo vale para los filtros con los que se ajustó (`min_conf_class`, máscara, métrica). Si cambia la configuración, hay que reajustar; los rollups guardan el mismo hash y el pipeline falla si no coinciden.

`calibration`: `source_platform`, `reference`, `metric`, `region`, `level`, `month`, `is_day`, `k`, `sum_ref`, `sum_source`, `n_cell_days`, `fit_from`, `fit_to`, `config_hash`, `fitted_at`.

### 5.4 Aplicación
`n_equiv = métrica × k(región, mes de local_date, is_day, plataforma)` se calcula **por fila de `fires_daily`** y después se agrega a 8 días o a mes. Así un período de 8 días que cruza dos meses usa el `k` correcto en cada día. Día y noche se convierten por separado y se suman al final. Los valores armonizados son esperanzas (no enteros), no detecciones.

### 5.5 Incertidumbre
`calibration_boot` guarda `B` réplicas de cada `k` (parámetro; 200), remuestreando **años-mes completos** del solape, no celdas sueltas, porque las celdas de un mismo mes están correlacionadas. Para el área que elige el usuario, la app calcula la suma con cada réplica y toma los percentiles 5 y 95. Sumar bandas celda por celda daría un intervalo exageradamente ancho.

Versión mínima si no hay tiempo: `k_p05` y `k_p95` en `calibration`, aclarando que la banda es conservadora.

### 5.6 Resolución semanal
Períodos fijos de 8 días desde el 1 de enero (46 por año). La guía MODIS advierte sesgos severos por debajo de ~8 días. Para áreas chicas el calendario semanal es ruido: si la mediana histórica del área es menor que `min_median_count` (parámetro; 5), la app sugiere la vista mensual.

## 6. Validación

**Diseño:** dejar un año afuera dentro del solape estable (ajustar con los demás años, predecir el excluido, rotar). Con solo NOAA-20 el solape es 2018-04 → 2021-12; partirlo en un único entrenamiento y prueba dejaría muy pocos datos.

**Tabla de ablación** (es el argumento central del pitch):

| Variante | Qué prueba |
|---|---|
| Sin corrección | Tamaño del salto original |
| `k` global único | Línea base |
| `k` por región × mes | Aporte de la región y la estación |
| `k` por región × mes × día/noche | Aporte de separar día y noche |
| Lo mismo con `n_clusters` | Aporte del agrupamiento a ~1 km |
| Lo mismo con `n_clusters_r7` | Si agrupar a ~5 km compensa el tamaño del píxel MODIS en el borde de la pasada |

**Métricas**, sobre región r3 × mes: sesgo relativo, error absoluto mediano y correlación entre calendarios.

**Criterios de aceptación** (objetivos iniciales, a ajustar con los primeros resultados):
- Sesgo relativo anual por país dentro de ±10 %.
- Cociente serie armonizada / MODIS observado entre 0,9 y 1,1 en cada año del solape, por separado para día y noche.
- Sin escalón visible en `switch_date` en al menos 3 regiones.

**Diagnóstico de deriva:** calcular `k` año por año, incluidos 2022–2023. Si se mueve después de 2021, confirma §5.1.

## 7. Consultas de la app

```sql
-- calendario mensual armonizado de un área, con ceros
WITH area AS (
  SELECT year, month, SUM(n_equiv) AS focos
  FROM fires_monthly
  WHERE cell IN (SELECT cell FROM area_cells)
    AND coverage_frac = 1
    AND (   (platform = 'terra' AND period_start <  DATE '2002-07-01')
         OR (sensor   = 'MODIS' AND period_start >= DATE '2002-07-01' AND period_start < :switch_date)
         OR (platform = :viirs_platform AND period_start >= :switch_date))
  GROUP BY year, month)
SELECT c.year, c.month, COALESCE(a.focos, 0) AS focos
FROM (SELECT DISTINCT year, month FROM calendar) c
LEFT JOIN area a USING (year, month);
```

- La mediana histórica y los percentiles salen de este resultado, agrupando por `month`.
- **La app muestra solo la serie armonizada.** Las series por sensor (`n_fires` sin `k`) se usan en la calibración, la validación y el gráfico antes/después del pitch, pero no se publican.
- Zona de la demo: Río Negro y Neuquén (ver `ARQUITECTURA.md`). La serie de la zona, la mediana y los percentiles se precalculan con esta consulta.
- Si la mediana del mes es 0 (frecuente en la Patagonia), la anomalía se informa como diferencia absoluta y percentil histórico, no como porcentaje.
- CSV de focos: `ST_Within` sobre `fires_norm`, filtrando antes por `h3_r7` y fecha.
- Contorno de la zona → celdas por centroide, una sola vez en el pipeline. Para un área del tamaño de Río Negro y Neuquén (~300.000 km²) el error de borde contra celdas r7 (~5 km²) es despreciable.

## 8. Calidad y pruebas

`qc_report`: `run_at`, `config_hash`, `sensor`, `year`, `step`, `rows_in`, `rows_out`, `drops` (MAP), fechas mín/máx, estadísticas por columna, mediana de `local_solar_hour` por plataforma.

Pruebas automáticas:
1. Muestra fija de ~20 filas por sensor con resultado esperado escrito a mano.
2. `acq_time = "0231"` conserva el cero.
3. Confianza MODIS: 29→`low`, 30→`nominal`, 79→`nominal`, 80→`high`.
4. CSV vacío o país sin archivo no rompe la ingesta.
5. Dos corridas dan conteos idénticos.
6. `SUM(fires_daily.n_fires)` = filas de `fires_norm`.
7. `n_clusters_r7 ≤ n_clusters ≤ n_fires` en todas las filas.
8. Un foco a las 03:30 UTC en longitud +150° cae en el `local_date` del mismo día a las 13:30 solares.
9. Un área sin focos en un mes devuelve 0, y antes del inicio de la plataforma devuelve "sin datos".
10. `config_hash` distinto entre `calibration` y rollups hace fallar el pipeline.

## 9. Prioridades y orden de trabajo

**P0 — imprescindible para tener producto (hoy)**
- [ ] `config.yaml`, entorno, `data/` fuera de git
- [ ] Ingesta → `fires_raw` (Argentina primero)
- [ ] Consulta de normalización → `fires_norm` / `fires_excluded` (pasos 2–8, sin máscara)
- [ ] `fires_daily` con `n_fires`, `n_clusters` y `n_clusters_r7`; `calendar` y `platform_periods`
- [ ] `k` por mes × día/noche a nivel país (un solo nivel de región)
- [ ] `fires_monthly` con `n_equiv`; consulta del calendario con ceros
- [ ] Gráfico antes/después del cambio de sensor
- [ ] **Bajar NOAA-20 2024–2026 de Argentina** desde el archivo de FIRMS: sin eso la serie termina en 2023

**P1 — lo que la hace precisa (mañana a la mañana)**
- [ ] `k` por región r3 con respaldo r2 y ventana de ±1 mes
- [ ] Validación dejando un año afuera y tabla de ablación
- [ ] `static_mask`
- [ ] `coverage_frac` en los rollups
- [ ] `fires_8d` y vista semanal
- [ ] Gráfico de deriva de `local_solar_hour`
- [ ] `qc_report` y pruebas

**P2 — si sobra tiempo**
- [ ] `calibration_boot` y bandas sobre el área
- [ ] Factor Terra → Terra+Aqua para 2000–2002
- [ ] Otros países para probar que `k` cambia por región
- [ ] S-NPP (2012–2021): triplica el solape estable. Recién con eso tiene sentido el modelo LightGBM de `PLAN.md`; con el solape de NOAA-20 solo, sobreajustaría
- [ ] Con S-NPP, modelo de probabilidad de detección por foco: emparejar Aqua ↔ S-NPP por huella (`scan × track` + 0,4 km, misma pasada) y ajustar una regresión logística `P(MODIS detecta | n píxeles VIIRS, FRP, t_mir_k, is_day, tamaño del píxel)`. Entra a la tabla de ablación como una variante más; reemplaza a `k` solo si le gana

## 10. Pendientes

1. **Datos recientes:** el archivo de FIRMS reemplaza NRT por standard con unos 5 meses de demora, así que los últimos meses vendrán como NRT, sin `type`. La máscara estática lo cubre; `is_nrt` permite marcarlos en la app.
2. **S-NPP:** FIRMS lo lista desde el 20/01/2012. Pedir solo Argentina y países vecinos es más rápido que el global.
3. **Alcance geográfico:** la app muestra una sola zona, Río Negro y Neuquén. La relación VIIRS/MODIS cambia por región (≈3,5× Argentina, ≈4,0× Brasil, ≈5,3× Australia). Por otro lado, la zona tiene pocos focos, y muchos estratos región × mes × día/noche no van a llegar a `min_source_count`. Propuesta: procesar toda Argentina, ajustar `k` con el respaldo jerárquico de §5.3 (que en la zona va a caer seguido en r2 o en el nivel país) y validar el resultado sobre la zona. El `k` regional solo se puede validar con más de un país.
3b. **Gas flares en Neuquén (Vaca Muerta):** es la zona de prueba de la máscara estática (paso 3). Los pozos que empezaron a quemar gas hace pocos meses vienen como NRT sin `type` y pueden no estar en la máscara: revisarlos antes de la demo.
4. **Fechas de deriva:** `modis_stable_until` y `switch_date` salen de documentación de NASA; confirmarlas con el gráfico de `local_solar_hour`.
5. **`referencias/` (PDFs técnicos) y `Datos/`** no están en el repo: los cortes de confianza y versiones se tomaron de `PLAN_MODULO_DATOS.md` sin contrastarlos con los PDF.
6. **Actualizar `PLAN.md` y `PLAN_MODULO_DATOS.md`:** grilla H3, serie que pasa a VIIRS en `switch_date` (no "MODIS hasta su fin"), y decisiones abiertas #1, #2, #3, #6 y #8 resueltas acá.

## Referencias

- [Deriva orbital de Terra y Aqua — NSIDC](https://nsidc.org/data/modis)
- [Fechas de las últimas maniobras de Terra y Aqua — NASA NTRS](https://ntrs.nasa.gov/api/citations/20240001409/downloads/2023_SPIE_Twedt_MODIS_EV_orbit_drift_manuscript_v4.pdf)
- [FIRMS Archive Download: cobertura y reemplazo de NRT](https://firms2.modaps.eosdis.nasa.gov/download/)
- [Atributos de focos MODIS y VIIRS — NASA Earthdata](https://earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs)
