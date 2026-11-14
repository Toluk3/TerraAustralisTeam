# Registro de decisiones

Decisiones que cambian los resultados o la forma de trabajar, con su motivo y cómo revertirlas. Las del 14/11/2026 salen de la auditoría del repo y de la rama `fixes-juana`.

**Consecuencia común:** cambian `config_hash` y los resultados. Los resúmenes de `lotes/resumen/` (L1–L5) son anteriores y hay que volver a correr todos los lotes, L6 incluido, antes de usarlos.

## Decisiones tomadas

### Datos y plataformas

| Decisión | Motivo | Cómo revertir |
|---|---|---|
| **S-NPP fuera de la serie.** Se quitó de `viirs_priority` y de `platform_periods`, y de la descarga por defecto. | No hay archivos de S-NPP en la carpeta de datos y los lotes ya se corrieron sin él. La configuración principal y los lotes pasan a usar las mismas plataformas. | Agregar `snpp` en `viirs_priority` y su fila en `platform_periods`, bajar `viirs-snpp` con `--sensores` y volver a correr todo. |
| **`default_country: null`.** Un CSV sin país en el nombre no se ingiere y la ingesta lo avisa. | Antes se etiquetaba como Argentina cualquier archivo con otro nombre. | Poner el país en `default_country`. |

**Costo de dejar S-NPP afuera:** el solape VIIRS–MODIS queda en 3,75 años (NOAA-20, abril de 2018 a diciembre de 2021) en lugar de unos diez. `k` tiene menos muestra y más estratos caen en niveles de respaldo; `calibrate` lo avisa en cada corrida.

### Cobertura

| Decisión | Motivo | Cómo revertir |
|---|---|---|
| **Un año sin archivo entre dos con datos cuenta como 0 focos.** Una plataforma tiene datos entre su primer y su último año publicado. | FIRMS no publica el archivo de un país en un año sin detecciones. Antes ese año salía como "sin datos". | No es configurable; está en `pipeline/support.py`. |
| **El año se considera publicado si hay un archivo de cualquier país.** | Permite saber que el año existe aunque los países pedidos no tengan focos. | Ídem. |
| **Un archivo anual se toma como año completo; una descarga NRT, hasta su último foco.** El fin se calcula por plataforma. | Antes se usaba el último día de cualquier sensor, y uno que terminaba antes figuraba con cobertura y ceros falsos. | Ídem. |

Límite conocido: el primer y el último año de una plataforma no se pueden distinguir de "sin datos" si no hay ningún archivo suyo para ese año.

### Calibración

| Decisión | Motivo | Cómo revertir |
|---|---|---|
| **Se agrega el nivel `r1`** (`calibration_levels: [r3, r2, r1, global]`). | El nivel `global` mezcla todo lo que haya en la corrida; en L4 eran Australia, Estados Unidos, Canadá, Qatar e Islandia. Entre 12 % y 28 % de la serie VIIRS lo usaba. | Quitar `r1` de la lista. |
| **`calibration_from` queda vacío** (cada lote calibra con sus datos). | Activarlo obliga a correr los lotes en dos pasadas y triplica el tiempo de `calibrate`. Queda como decisión abierta. | Ver "Decisiones abiertas". |
| **El hash de configuración incluye el calendario** y se guarda una huella de los datos ingeridos. | Cambiar `calendar_end` o volver a bajar datos dejaba un `k` viejo como válido. | No es configurable. |
| **`min_conf_class: high` se avisa pero no se bloquea.** | Las clases de confianza no son equivalentes entre sensores en ese corte, pero los lotes L5_high lo usan como prueba de sensibilidad. | — |
| **Las pasadas se arman con marco `RANGE`.** | `n_clusters` cambiaba entre dos corridas idénticas (2.673.036 y 2.672.899 en Argentina) por el orden entre focos con la misma hora. | No revertir: era un bug. |

### Mediana y anomalía

| Decisión | Motivo | Cómo revertir |
|---|---|---|
| **Período base 2003–2021** (`baseline_years`). | Es el tramo de MODIS Terra + Aqua observado: sin Terra sola, sin el tramo estimado con VIIRS y sin que el año evaluado entre en su propia mediana. | `baseline_years: null` usa todos los años completos. |
| **Sin anomalía en períodos de cobertura parcial.** | El valor está subestimado y daba una anomalía negativa falsa (agosto de 2020, con Aqua caído). | No es configurable. |

### Entorno y organización

| Decisión | Motivo | Cómo revertir |
|---|---|---|
| **La extensión `h3` de DuckDB es obligatoria.** | El respaldo con h3 de Python indexaba fila por fila y no podía correr el paso `zone`. | `PIPELINE_H3_PYTHON=1` habilita el respaldo para pruebas chicas. |
| **Los YAML de `lotes/` usan `extends`** y declaran solo sus diferencias. | Eran 27 copias completas de la configuración. | — |
| **Las vistas de focos son temporales.** | El `.duckdb` guardaba la ruta absoluta de la máquina que lo creó. | Abrir la base con `pipeline.db.connect`, que las crea. |
| **`requirements.txt` con rangos** y `numpy` declarado. | Había un salto de versión mayor de DuckDB sin techo y una dependencia sin declarar. | — |
| **Los resúmenes de L6 no se versionaron.** | La corrida estaba incompleta y es anterior a estas correcciones. | Volver a correr L6 y versionar sus resúmenes. |

## Decisiones abiertas

| Decisión | Opciones | Qué falta para decidir |
|---|---|---|
| **Calibración común a los lotes** (`calibration_from`) | Activarla: `k` coherente en las fronteras y un `global` de verdad. No activarla: una sola pasada, pero `k` depende de cómo se partieron los lotes. | Medir cuánto cambia `k` en regiones de frontera con los lotes ya corregidos. |
| **Métrica** | `n_clusters` (menor sesgo) o `n_fires` (menor error mediano y más fácil de explicar). | Revisar la ablación de todos los lotes vueltos a correr. |
| **Referencia** | Terra + Aqua (cubre desde 2000) o solo Aqua (misma hora de pasada que VIIRS, pierde 2000–2002). | Correr un lote con `reference: aqua` y comparar la validación. |
| **Resolución H3 de las celdas** | r7 (más detalle, muchas celdas con mediana 0) o r6 (medianas estables). | Ver cuántas celdas de la zona quedan sin anomalía en cada una. |
| **Backend** | Seguir con JSON estáticos o construir la API. | Depende de si la demo necesita zonas elegidas por el usuario. |
