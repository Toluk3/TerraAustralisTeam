# Plan de análisis de todos los datos por lotes

Estado: **en ejecución** (preparación hecha el 14/11/2026). **Decisión:** S-NPP queda descartado; la calibración usa solo NOAA-20 (2018-04 → 2021).
Dueño: Área 1 (procesamiento de los lotes). El Área 2 usa los resultados (§6).
Relacionado: `PLAN_NORMALIZACION.md` (reglas del pipeline), `casos de uso/CU-03` y `CU-04` (cómo correrlo), `analisis/README.md`.

## 1. Por qué por lotes

La primera corrida procesó solo Argentina: 6,3 M de filas en ~2 minutos. Los datos descargados son mucho más:

| Archivo (`Datos/`, fuera del repo) | Período | Comprimido | Descomprimido | Filas estimadas* |
|---|---|---|---|---|
| `modis_<año>_all_countries.zip` × 26 | 2000–2025 | 1,9 GB | ~9 GB | ~100 M |
| `viirs-jpss1_<año>_all_countries.zip` × 6 | 2018–2023 | 2,1 GB | ~9 GB | ~120 M |
| `pais/viirs-jpss1_<año>_<País>.csv` (bajados para los lotes) | 2024–2025 | — | 0,75 GB | ~9 M |
| ~~`DL_FIRE_SV-C2_846591.zip` (pedido S-NPP por área)~~ | Descartado, movido a `Datos_descartado/` | 0,7 GB | 3,0 GB | — |
| **Total en uso** | | **4,0 GB** | **~19 GB** | **~230 M** |

\* A ~85 bytes por fila, que es lo que da Brasil 2020 (133,7 MB, 1,6 M de filas).

Las ~230 M de filas no entran juntas en la máquina (16 GB de RAM, 12 hilos, 100 GB libres en `D:`). Además el pipeline rehace `data/raw/` entera en cada `ingest`, y normaliza cada sensor en una sola consulta con funciones de ventana. Por eso **cada lote es una corrida independiente con su propia configuración y su propia carpeta de datos**. Es el mecanismo de `CU-04 · Probar sin pisar la configuración principal`, sin cambios de código. Los lotes se comparan al final, leyendo cada base en solo lectura.

## 2. Qué queremos responder

| # | Pregunta | Para qué | Lotes |
|---|---|---|---|
| P1 | ¿El `k` VIIRS → MODIS cambia por región? ¿Cuánto? | Pendiente P2 de `PLAN_NORMALIZACION.md` y argumento del pitch: un factor global no alcanza | L1–L4 |
| P2 | ¿La métrica que gana la ablación (`n_clusters` en Argentina) gana también en otros regímenes de fuego? | Que la elección no dependa de un solo país | L1–L4 |
| P3 | ¿El `k` de un país sirve para otro (transferibilidad)? | Saber si la zona puede usar el respaldo r2/global sin perder precisión | L1 + L2 |
| P4 | ¿La deriva de Terra y Aqua (hora solar y `k` por año) se ve igual en todas partes? | Confirmar `modis_stable_until` y `switch_date` con más de un país | L1–L4 |
| P5 | ¿La máscara estática saca bien gas flares y volcanes? ¿Hay salto en 2018 o 2023? | Validar el paso 3 de la normalización | L1, L4 (Qatar, Islandia) |
| P6 | ¿Cuánto cambia el resultado según `min_conf_class` y `mask_min_months`? | Sensibilidad, para el pitch y para fijar los parámetros | L5 |

## 3. Lotes

| Lote | Países (nombre del CSV de FIRMS) | VIIRS NOAA-20 2020 | Qué aporta | Tiempo estimado** |
|---|---|---|---|---|
| L0 · Inventario (opcional) | Todos (solo conteos, sin pipeline) | — | Filas por sensor × año × país, para elegir los países de L6 | ~15 min |
| **L1 · Argentina** | `Argentina` | 35,8 MB | Línea base; se compara con la primera corrida (6.330.305 filas, que incluían S-NPP) | ~3 min |
| **L2 · Cono Sur** | `Chile`, `Uruguay`, `Paraguay`, `Bolivia` | 47,9 MB | Vecinos con otros regímenes (Chaco, Andes); P3 contra L1 | ~4 min |
| **L3 · Brasil** | `Brazil` | 133,7 MB | El volumen más grande de Sudamérica; cociente crudo ≈ 4,0× | ~12 min |
| **L4 · Contrastes** | `Australia`, `United_States`, `Canada`, `Qatar`, `Iceland` | ~128 MB | Cociente ≈ 5,3× en Australia, bosque boreal, gas flares (Qatar) y volcanes (Islandia) | ~12 min |
| **L5 · Sensibilidad** | `Argentina`, 6 configuraciones | — | P6: `min_conf_class` low/nominal/high × `mask_min_months` 2/3/6 | ~6 × 3 min |
| L6 · Global (opcional) | El resto, por continente | — | Mapa mundial de `k`; solo si sobra tiempo | horas |

\*\* Escalando los ~2 minutos de Argentina por volumen. Se mide en L1 y se corrige el resto.

Los lotes van en orden de prioridad. **L1 es P0**, porque sin él no se puede comparar nada. L2 a L4 son P1 y L5 es P1 si el Área 2 lo pide. L6 es P2.

## 4. Preparación (hecha)

1. **Datos:** los lotes leen los zips directo de la carpeta de arriba del repo (`input_dir: ../../Datos` en cada `lotes/<L>.yaml`), sin copiarlos.
2. **NOAA-20 2024–2025:** los zips globales llegan hasta 2023. Se bajaron los 22 archivos por país de los lotes a `../Datos/pais/` (752 MB):
   ```bash
   python scripts/descargar_firms.py --destino ../Datos/pais --sensores viirs-jpss1 --anios 2024-2025 --paises Argentina Chile Uruguay Paraguay Bolivia Brazil Australia "United States" Canada Qatar Iceland
   ```
3. **S-NPP descartado.** `DL_FIRE_SV-C2_846591.zip` pasó a `../Datos_descartado/` para que `ingest` no lo levante. Tiene otro formato (nombres de columna de MODIS, `satellite = SNPP`, sin país en el nombre, NRT sin `type`) y el pipeline lo habría tomado como MODIS.
4. **Configuraciones** en `lotes/`: `L1`–`L4` y las 8 variantes de `L5_<min_conf_class>_<mask_min_months>` (la combinación `nominal_3` es L1). Son copias de `config.yaml` que cambian `paths`, `countries` y `default_country: null`. Los nombres de país son los del CSV en inglés; la ingesta cambia `_` por espacio (`United States`).

## 5. Ejecución y base consolidada

Cada lote se corre con:
```bash
.venv\Scripts\python lotes/correr_lote.py L2
```
El script:
1. Corre los pasos del pipeline sobre `data/lotes/<L>/` con `memory_limit = 10GB` y carpeta temporal en el mismo disco. Los pasos son `ingest` → `qc` en L2–L4, más `zone` en L5 y `zone export` en L1 (la zona de la demo solo tiene sentido con Argentina).
2. **Vuelca los resultados en la base consolidada `data/lotes/lotes.duckdb`**, con una columna `lote`. Si el lote ya estaba, reemplaza sus filas. Tablas:
   - `calibration`, `k_by_year`, `validation`;
   - `qc_report`, `qc_solar_hour`, `qc_algo_epoch`, `static_mask`, `coverage`;
   - `monthly_r3`: serie mensual por región r3;
   - `daily_r2`: sumas diarias por región r2, para reajustar `k` en P3;
   - `zone_series` y `zone_baseline`, si el lote tiene zona;
   - `registro`: lote, `config_hash`, filas, segundos por paso y MB en disco.
3. Deja un resumen versionable en `lotes/resumen/<L>/`: `k_global.csv`, `ablacion.csv`, `k_por_anio.csv`, `descartes.csv` y `registro.csv`.

Con `--solo-consolidar` se vuelve a volcar un lote ya corrido sin reprocesarlo. Las bases de cada lote y la consolidada no se versionan (`data/` está en `.gitignore`); el resumen sí.

Controles de cada lote antes de usarlo: `qc` no falla (cierra `fires_norm + fires_excluded = fires_raw`), y se revisan el tiempo y el disco en `registro`. Si un paso se queda sin memoria, se parte el lote por país.

## 6. Análisis (Área 2) y entregables

Un script por pregunta en `analisis/scripts/`, que abre `data/lotes/lotes.duckdb` con `read_only=True` y filtra o agrupa por `lote`. Los resultados van a `analisis/resultados/`.

| Pregunta | Tabla de origen | Resultado |
|---|---|---|
| P1 | `calibration` (nivel `global` y `r3`), `k_by_year` | `k_por_pais.csv`: `k` día y noche por país, plataforma y métrica, con p05–p95. Mapa de `k` por región r3 |
| P2 | `validation` (ablación) | `ablacion_por_pais.csv`: variante ganadora y sesgo por país |
| P3 | `fires_daily` de L1 y L2 | `transferibilidad.csv`: error al predecir cada país del L2 con el `k` de Argentina, contra su propio `k` |
| P4 | `qc_solar_hour`, `k_by_year` | Gráfico de la hora solar por plataforma y año para todos los lotes juntos; `k` por año desde 2022 |
| P5 | `qc_report` (normalize), `static_mask`, `qc_algo_epoch` | Descartes por motivo × país × año; focos que saca la máscara en 2017 contra 2018 |
| P6 | `validation` + `zone_series` de L5 | Sesgo y serie de la zona según cada configuración |

**Criterio para cerrar:** las 6 preguntas tienen una respuesta con su evidencia en `analisis/resultados/`. Las que cambien parámetros (métrica, fechas de deriva, máscara) se le pasan al Área 1 como pedido, según `AREAS.md`.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Memoria en `normalize` (ventanas sobre millones de filas) para Brasil | Límite de memoria con carpeta temporal en `D:`; si no alcanza, partir el lote por años con `calendar_start`/`calendar_end` (la calibración se hace igual, con el lote completo de solape) |
| Disco: ~21 GB descomprimidos, más los Parquet de cada lote | Parquet zstd ocupa ~¼ del CSV. Borrar `data/lotes/<L>/raw/` después de `normalize` si hace falta lugar |
| Sin S-NPP, el solape estable es solo 2018-04 → 2021 (unos 3,7 años) | La validación deja un año afuera de 4; se informa la banda bootstrap y se avisa en el pitch |
| Países con pocos focos (Uruguay, Islandia, Qatar) | `k` cae al nivel `global` del lote; se informa con `level` y `sum_source`, no se compara su `k` r3 |
| Nombres de país que no coinciden con el CSV | `ingest` con 0 archivos o `registro.rows_raw` muy bajo es señal de un nombre mal escrito |
| Tiempo del hackatón | Orden fijo de prioridad: L1 → L2 → L3/L4 → L5. L1 y L2 alcanzan para P1 y P3 |

## 8. Orden de trabajo

1. [x] Preparación (§4)
2. [ ] L1 Argentina; comparar contra la primera corrida (`k` global con `n_clusters`: 0,455 de día / 0,211 de noche)
3. [ ] L2 Cono Sur → P1 y P3 con dos lotes
4. [ ] L3 Brasil y L4 Contrastes → P1, P2, P4 y P5 completos
5. [ ] L5 sensibilidad, si el Área 2 lo pide
6. [ ] Resultados al Área 2 y pedidos de cambio de parámetros al Área 1
