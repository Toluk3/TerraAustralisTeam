# Análisis de datos FIRMS por lotes

## Resumen

El procesamiento por lotes permite analizar subconjuntos de los archivos FIRMS sin cargar todos los años y países en una única ejecución. Cada lote utiliza una configuración y un directorio de datos independientes; sus resúmenes pequeños se versionan para comparar resultados sin incluir las bases pesadas en Git.

Este documento describe el propósito, la estructura y el estado comprobable de esa campaña. El término “lote” identifica una ejecución analítica; no significa que todas las preguntas previstas hayan sido respondidas ni que todos los resultados estén completos.

## 1. Motivo del procesamiento por lotes

Los archivos globales de MODIS y VIIRS representan cientos de millones de filas y superan la memoria práctica de una ejecución única en una máquina de desarrollo. Los lotes limitan el volumen por país o conjunto de países, permiten controlar el uso de memoria y hacen posible comparar métricas y factores de calibración entre regímenes de fuego distintos.

Cada lote tiene su propia configuración YAML y carpeta local bajo `data/lotes/`. Las bases de DuckDB y los productos intermedios no se versionan. Los resúmenes CSV pequeños quedan en `lotes/resumen/`.

## 2. Preguntas de análisis

La campaña se diseñó para evaluar:

1. Si el factor VIIRS→MODIS cambia entre regiones y plataformas.
2. Si la métrica que resulta adecuada para Argentina funciona también en otras regiones.
3. Si los factores calibrados en una zona se transfieren a zonas vecinas.
4. Si la hora solar de las plataformas y los factores varían por año.
5. Si los filtros de tipos y la máscara estática reducen fuentes no vegetales sin introducir saltos artificiales.
6. Cómo cambian los resultados con umbrales de confianza y parámetros de la máscara.

Estas preguntas son objetivos de análisis. La presencia de resultados de un lote no basta para afirmar que todas fueron resueltas.

## 3. Organización de lotes

| Lote | Cobertura prevista | Propósito | Estado en los resúmenes versionados |
|---|---|---|---|
| L0 · Inventario | Todos los países; conteos sin ejecutar el pipeline completo | Estimar volumen y seleccionar muestras | No identificado entre los resúmenes disponibles |
| L1 · Argentina | Argentina | Línea base y comparación con corridas anteriores | Disponible |
| L2 · Cono Sur | Chile, Uruguay, Paraguay y Bolivia | Contraste regional y transferibilidad | Disponible |
| L3 · Brasil | Brasil | Evaluar un volumen y régimen distintos | Disponible |
| L4 · Contrastes | Australia, Estados Unidos, Canadá, Qatar e Islandia | Bosques, fuentes industriales y contextos diversos | Disponible |
| L5 · Sensibilidad | Argentina con variantes de configuración | Medir sensibilidad al umbral y a la máscara | Disponible (8 variantes) |
| L6 · Global | Países restantes, por continente | Ampliación exploratoria | Corrida parcial sin versionar; hay que repetirla (ver nota) |

El directorio `lotes/resumen/` contiene subdirectorios para L1–L4 y las ocho variantes de L5.

> **Nota:** esos resúmenes son anteriores a las correcciones de cobertura y de niveles de calibración (rama `fixes-juana`). Cambian `config_hash` y los resultados: hay que volver a correr los lotes antes de usarlos en una publicación. Desde la métrica `n_clusters_det`, `aggregate` guarda columnas nuevas: los lotes ya procesados tienen que repetir la fase 1. Los archivos de resultados consolidados que permitirían volver a analizar todas las corridas residen en `data/` y no se versionan.

## 4. Selección de plataformas en esta campaña

Las corridas por lote no usan Suomi NPP: la comparación de solape se hace con NOAA-20 (abril de 2018 a diciembre de 2021).

`config.yaml` tampoco lo incluye, así que la configuración principal y los lotes coinciden. El motivo está en [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md), sección 7.

## 5. Ejecución y resultados versionados

Los lotes se lanzan con el script `lotes/correr_lote.py`, que aplica la configuración del lote, ejecuta las etapas del pipeline y consolida resultados en una base local. Los procedimientos concretos están en los casos de uso del repositorio.

L6 agrupa por continente los países que no están en L1–L4. Los zips globales de NOAA-20 llegan hasta 2023, así que estos lotes usan `calendar_end: 2023-12-31`:

| Lote | Países | VIIRS 2018–2023 |
|---|---|---|
| `L6_europa` | 47 | 114 MB |
| `L6_oceania` (incluye Antártida) | 23 | 21 MB |
| `L6_sudamerica` (el resto de Sudamérica) | 8 | 223 MB |
| `L6_norte_centroamerica` (México, Centroamérica, Caribe, Groenlandia) | 37 | 229 MB |
| `L6_medio_oriente` (con Afganistán y Pakistán) | 19 | 238 MB |
| `L6_asia_sur` | 7 | 440 MB |
| `L6_asia_este_sudeste` | 16 | 578 MB |
| `L6_rusia_asia_central` | 7 | 685 MB |
| `L6_africa_norte_oeste_este` | 31 | 1199 MB |
| `L6_africa_congo` | 5 | 900 MB |
| `L6_africa_centro` (RCA, Chad, Sudán del Sur, Camerún) | 4 | 749 MB |
| `L6_africa_angola_zambia` | 2 | 1021 MB |
| `L6_africa_sur` | 15 | 807 MB |

Los resúmenes presentes incluyen tablas de calibración, ablación, factores por año, descartes y registro de ejecución para L1–L5. Esos artefactos documentan resultados de corridas, pero no constituyen por sí solos un análisis final interpretado para todas las preguntas del apartado 2. `analisis/` contiene actualmente su README, no un conjunto versionado de scripts y conclusiones reproducibles.

Las bases locales y los datos originales no se versionan. Si no existen en la máquina, hay que descargar o procesar los datos antes de volver a ejecutar o consolidar los resultados.

### Calibración común a todos los lotes

Los lotes L1–L4 y L6 extienden `lotes/_comun.yaml`, que lista sus carpetas de datos en `calibration_from`. Al ajustar `k` se suman los agregados diarios de todos, de modo que una región H3 que cruza dos lotes y el nivel `global` tienen el mismo `k` en todos. Las variantes L5 y la muestra S1 repiten países y calibran solas.

Eso obliga a correr en dos fases, y `lotes/correr_todos.sh` lo hace en orden:

1. **Fase 1** de todos (`--fase 1`: `ingest` → `aggregate`).
2. **Fase 2** de todos (`--fase 2`: `detect` en adelante). Los pesos de detectabilidad y `k` salen de los datos de todos los lotes. El primer lote ajusta `k`; los demás lo copian si la configuración y la ventana de ajuste coinciden.
3. Las ocho variantes L5.

```bash
bash lotes/correr_todos.sh
```

La validación (ablación) sigue siendo por lote, con los datos de cada uno. Todas las bases tienen que estar en la misma máquina.

## 6. Pendientes para cerrar el análisis

- Volver a correr los lotes con el pipeline corregido y revisar sus resúmenes con sus configuraciones y extraer conclusiones explícitas sobre la métrica y la calibración.
- Determinar si L4 y las variantes de sensibilidad L5 son necesarias para sostener las conclusiones de la entrega.
- Implementar scripts reproducibles de análisis en `analisis/scripts/` y guardar resultados interpretados en `analisis/resultados/`.
- Entregar al pipeline cualquier cambio recomendado de métrica, fechas de transición, parámetros o celdas que deban enmascararse, con la evidencia correspondiente.
- Publicar o ejecutar de nuevo los análisis sobre la configuración final si la selección de métrica o plataforma cambia.

Los valores de duración y tamaño que aparecían en estimaciones previas son dependientes del equipo y de los datos disponibles; no se consideran criterios de cierre.

## 7. Referencias

- [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md): estado general y límites de las conclusiones actuales.
- [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md): método de normalización, calibración y validación.
- [`lotes/`](../lotes/): configuraciones, script de ejecución y resúmenes versionados.
- [`analisis/README.md`](../analisis/README.md): responsabilidades del análisis y entregables esperados.
