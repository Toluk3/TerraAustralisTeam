# Plan del módulo de datos

Estado: **borrador para revisar con el equipo.**
Relacionado: `PLAN.md` (plan general del hackatón).
Documentación de referencia en `Documentacion/`: *MODIS C6/C6.1 Active Fire Product User's Guide 1.0* (Giglio et al., 2021), *VIIRS C2 AF-375m User Guide 1.2* y *Active Fire Data Attributes for MODIS and VIIRS* (FIRMS).

## Objetivo

Convertir los zips crudos de FIRMS (MODIS y VIIRS) en un dataset limpio, indexado en H3 y harmonizado, que la web app pueda consultar por área y rango de fechas. El módulo está terminado cuando entrega tres cosas: series mensuales harmonizadas por celda H3, la mediana histórica por celda y mes, y la exportación a CSV de los focos crudos de un área.

## Criterios generales

- Los zips originales no se modifican. Los datos generados van en una carpeta aparte y no se versionan en git.
- Lo que todavía no está decidido (ver "Decisiones abiertas") se maneja como parámetro de configuración, para poder probar alternativas sin reescribir código.

## Datos de entrada

| Fuente | Período | Estado |
|---|---|---|
| MODIS (Terra + Aqua), `modis_YYYY_all_countries.zip` | 2000-11 → 2025 | Descargado |
| VIIRS NOAA-20, `viirs-jpss1_YYYY_all_countries.zip` | 2018-04 → 2023 | Descargado |
| VIIRS Suomi NPP | 2012-01 → ? | Pedido a FIRMS, sin llegar |

Cada zip anual tiene una carpeta `<sensor>/<año>/` con un CSV por país (`<sensor>_<año>_<País>.csv`) y un `AttributesReadme.txt`. Si un país no tuvo detecciones ese año, no hay archivo: la ausencia equivale a 0. Coordenadas en WGS84.

Ojo con S-NPP: según FIRMS, Suomi NPP ya no entrega datos nuevos, así que es probable que la serie no llegue hasta hoy. Hay que confirmar hasta qué fecha viene cuando llegue la entrega.

## Diccionario de campos

Los dos sensores tienen 15 columnas con el mismo orden. Solo cambian los nombres de los dos canales de brillo y el formato de `confidence`. Fuentes: los tres documentos de `Documentacion/` y el readme incluido en los zips. Los zips están en `Datos/`.

| Columna MODIS | Columna VIIRS | Definición | Unidad / valores | Observado en nuestros datos |
|---|---|---|---|---|
| `latitude` | `latitude` | Latitud del **centro del píxel** con fuego, no la ubicación exacta del fuego; en un píxel puede haber más de un fuego. | grados WGS84 | — |
| `longitude` | `longitude` | Longitud del centro del píxel. | grados WGS84 | — |
| `brightness` | `bright_ti4` | Temperatura de brillo del píxel en el canal de infrarrojo medio: canales 21/22 en MODIS, canal I-4 en VIIRS. Es la señal principal de la detección. | Kelvin | ~300–500 K |
| `scan` | `scan` | Tamaño real del píxel en la dirección del barrido (*along-scan*). Crece hacia los bordes de la pasada. | km (unidad no explícita en la doc) | MODIS 1–4,8 · VIIRS ~0,3–0,8 |
| `track` | `track` | Tamaño real del píxel en la dirección de la órbita (*along-track*). | km | MODIS 1–2 · VIIRS ~0,4–0,8 |
| `acq_date` | `acq_date` | Fecha de adquisición. | `YYYY-MM-DD` | — |
| `acq_time` | `acq_time` | Hora de la pasada del satélite. | `HHMM` en **UTC**, texto con ceros a la izquierda ("0231") | Hay que leerlo como texto |
| `satellite` | `satellite` | Satélite que hizo la detección. | MODIS: `Terra`/`Aqua` (la doc dice T/A). VIIRS: `N` = Suomi NPP, `N20` = NOAA-20, `N21` = NOAA-21 | MODIS: Terra solo hasta 2002; VIIRS: `N20` |
| `instrument` | `instrument` | Sensor. | `MODIS` / `VIIRS` | — |
| `confidence` | `confidence` | Calidad estimada de la detección, a partir de valores intermedios del algoritmo. | MODIS: **número 0–100** asociado a tres clases (baja, nominal, alta). VIIRS: **categoría** `l`/`n`/`h` | MODIS: mediana ~68–78; VIIRS: ~85% `n` |
| `version` | `version` | Colección y versión del producto. Si termina en `NRT`/`RT`/`URT` es casi tiempo real; sin sufijo es standard (calidad científica). | `<colección>.<versión>` | MODIS: `6.2` (2000–2017), `6.03` (2018–2022), `61.03` (2023–2025). VIIRS: `2` en todos los años. Todo es **standard**; ver "Versiones" más abajo |
| `bright_t31` | `bright_ti5` | Temperatura de brillo en el canal de infrarrojo térmico: canal 31 en MODIS, I-5 en VIIRS. Sirve como referencia del fondo. | Kelvin | — |
| `frp` | `frp` | *Fire Radiative Power*: potencia radiativa del fuego integrada en el píxel, que se usa como medida de intensidad. | MW | En VIIRS el canal I-4 satura seguido, así que el FRP a 375 m solo es confiable para fuegos chicos o de baja intensidad. Desde 2015 se calcula combinando 375 m y 750 m |
| `daynight` | `daynight` | Detección diurna o nocturna. | `D` / `N` | — |
| `type` | `type` | Tipo inferido de foco. | `0` = presunto incendio de vegetación, `1` = volcán activo, `2` = otra fuente estática en tierra (gas flares, industria), `3` = offshore | Qatar 2020: ~85% `type=2`. Según la doc, este campo solo existe en el producto standard |

### Detalle de `confidence`

En **MODIS** el valor 0–100 se agrupa en tres clases. Los cortes están en la guía del usuario C6/C6.1, tabla 11: **baja 0 ≤ C < 30, nominal 30 ≤ C < 80, alta 80 ≤ C ≤ 100**. La guía recomienda descartar los de baja confianza cuando importa evitar falsas alarmas, y quedarse con las tres clases cuando importa no perder fuegos. También advierte que algunos píxeles muy dudosos siguen quedando clasificados como nominales.

En **VIIRS** las clases están definidas por el algoritmo. Alta = píxel saturado, de día o de noche. Nominal = sin reflejo solar (sun glint) y con una anomalía de temperatura en I-4 mayor a 15 K. Baja (diurna) = afectada por sun glint o con una anomalía menor a 15 K. Las detecciones nocturnas de baja confianza solo aparecían en la zona de la Anomalía Magnética del Atlántico Sur (que incluye Argentina), y FIRMS las saca de sus datos NRT.

La equivalencia entre clases MODIS y VIIRS no es directa porque los criterios son distintos. Es una de las decisiones abiertas.

### Versiones (cómo leer `version`)

El producto de localización mensual MODIS (MCD14ML) se nombra `MCD14ML.AAAAMM.<colección>.<versión>` (por ejemplo `MCD14ML.201701.006.03`). Nuestros valores se leen igual:

| Valor | Interpretación | Años |
|---|---|---|
| `6.2` | Colección 6, versión 2 | 2000–2017 |
| `6.03` | Colección 6, versión 3 | 2018–2022 |
| `61.03` | Colección 6.1, versión 3 | 2023–2025 |
| `2` (VIIRS) | Colección 2 (la versión del producto no viene en el campo) | 2018–2023 |

Esta lectura es una deducción a partir de la convención de nombres de la guía, no una tabla oficial de FIRMS. Lo importante es que ninguno tiene sufijo NRT, así que todo es standard. Pero hay dos cortes de consistencia dentro de MODIS:

- **2017 → 2018 (versión 2 → 3):** según la guía, la versión 3 trae una **clasificación de `type` bastante mejorada**. Antes de 2018 es más probable que fuentes estáticas (gas flares, industria) estén mal etiquetadas como `type=0`, así que el filtro por `type` limpia menos en los años viejos.
- **2022 → 2023 (colección 6 → 6.1):** cambio de colección del algoritmo.

En VIIRS, la guía documenta un bug en las versiones 1 y 2 del producto mensual: muchos focos `type=2` quedaban mal etiquetados como `type=0`. Se corrigió en mayo de 2025 y todo se reprocesó a la versión 3. Nuestros datos solo dicen colección `2`, sin la versión. La clasificación en Qatar 2020 (88% `type=2`) sugiere que tenemos datos corregidos, pero hay que confirmarlo comparando con un país petrolero más.

## Advertencias de la documentación

- **Series con intervalos cortos:** la guía MODIS advierte que cualquier serie temporal con intervalos menores a unos **8 días** puede tener sesgos temporales y espaciales severos. El calendario mensual está bien; un calendario diario no.
- **Ausencia de focos ≠ ausencia de fuego:** los archivos de puntos no traen información de nubes ni de datos faltantes. Un mes sin focos puede ser un mes nublado.
- **Antes de noviembre de 2000** Terra tenía problemas de hardware. Nuestros datos ya arrancan en 2000-11.
- **Corte de Aqua, 16/08 al 02/09/2020:** una falla de hardware dejó dos semanas con cobertura parcial. Cae en plena temporada de quemas de Sudamérica y va a aparecer como una caída artificial en agosto y septiembre de 2020.
- **VIIRS detecta mucho más de noche:** comparado con el producto VIIRS de 750 m, el de 375 m detecta ~3× más píxeles de día y ~17× más de noche. Los píxeles MODIS además se agrandan lejos del nadir. Esto refuerza que conviene calibrar día y noche por separado.
- **Inicio efectivo de S-NPP:** 20 de enero de 2012.

### Disponibilidad por satélite

- MODIS Terra: desde noviembre de 2000. MODIS Aqua: desde julio de 2002. Antes de 2002-07 la cobertura es menor, porque hay una sola pasada diaria en lugar de dos.
- VIIRS 375 m (S-NPP): desde el 20 de enero de 2012.
- Horarios aproximados de pasada: Terra ~10:30 y ~22:30 hora local; Aqua, S-NPP y NOAA-20 ~13:30 y ~01:30.

## Hallazgos de la exploración (14/11/2026)

Se revisaron 10 CSV por sensor (Argentina en varios años, y Brasil, Australia, Qatar e Islandia en 2020).

- La relación cruda VIIRS/MODIS en 2020 varía por región: Argentina ≈ 3,5x, Brasil ≈ 4,0x, Australia ≈ 5,3x. Un factor global de corrección no alcanza.
- El filtro `type = 0` es imprescindible en zonas petroleras y volcánicas.
- Volumen: VIIRS Brasil 2020 son 1,6 M de filas. Hace falta un formato columnar (Parquet) y herramientas que trabajen fuera de memoria (DuckDB o polars).

---

## Sprints

### Sprint 0 — Setup
Estructura del repo, entorno (Python ≥ 3.10, `duckdb`, `polars`/`pyarrow`, `h3` v4), `.gitignore` para datos y archivos personales, archivo de configuración con rutas, sensores y parámetros abiertos.
**Listo cuando:** el entorno se instala limpio en cualquier máquina del equipo.

### Sprint 1 — Ingesta
Leer los zips sin descomprimir, unificar el esquema (nombres comunes para los canales de brillo, `confidence` como texto, columnas `sensor` y `country`) y guardar en Parquet particionado por sensor y año. Sin filtros.
**Listo cuando:** los conteos de filas coinciden con los CSV originales, `acq_time` conserva los ceros y correrlo dos veces da el mismo resultado.

### Sprint 2 — Limpieza y normalización
`datetime_utc`, filtro `type = 0`, clase de confianza común, marca de colección y versión según `version`, filtro por satélite, y deduplicación si aparecen focos repetidos entre países limítrofes (está por verificar si existen).
**Listo cuando:** hay un reporte por sensor y año con cuántas filas se descartan en cada paso.

### Sprint 3 — Indexación H3
Asignar la celda H3 de forma vectorizada a una resolución base fina y derivar las más gruesas con `cell_to_parent`.
**Listo cuando:** el 100% de los puntos tiene celda, el chequeo de una muestra contra `h3.latlng_to_cell` da bien y está medido el tiempo de procesamiento para un año de VIIRS.

### Sprint 4 — Agregación
Conteos por sensor × satélite × celda × día y su rollup mensual, con dos métricas: focos crudos y celdas/días con fuego.
**Listo cuando:** los totales cierran contra la capa limpia y una consulta del tamaño de una provincia tarda menos de 1 s.

### Sprint 5 — Harmonización
Comparar sensores en el período de solapamiento (N20 desde 2018-04; S-NPP desde 2012 si llega), elegir la resolución H3 y la métrica, calibrar una conversión por región y construir la serie 2000–hoy.
**Listo cuando:** hay gráficos de validación antes y después en al menos 3 regiones, una métrica de error en años no usados para calibrar y la serie no muestra un salto en el cambio de sensor.

### Sprint 6 — Contrato de salida
Tablas finales (serie harmonizada por celda y mes; mediana y percentiles históricos) y una consulta por polígono o punto con radio que devuelve el calendario, las anomalías y el CSV de focos. El contrato se documenta y se acuerda con frontend.
**Listo cuando:** funciona un ejemplo completo para un área de Argentina y frontend aprobó el contrato.

---

## Decisiones abiertas

| # | Decisión | Cuándo se resuelve |
|---|---|---|
| 1 | Resolución H3 final (candidatas 5 y 6) | Sprint 5 |
| 2 | Métrica: focos crudos vs. celdas/días con fuego | Sprint 5 |
| 3 | Terra + Aqua, o solo Aqua (mismo horario que VIIRS) | Sprint 5 |
| 4 | Umbral de confianza y equivalencia MODIS ↔ VIIRS (cortes MODIS ya confirmados: 30/80) | Sprint 2 |
| 5 | Cómo tratar el salto de calidad de `type` en MODIS 2017→2018 y el cambio de colección 2022→2023 | Sprint 2 |
| 8 | Separar día y noche en la calibración | Sprint 5 |
| 9 | Cómo marcar en la app los períodos con cobertura reducida (2000–2002, agosto 2020) | Sprint 6 |
| 6 | Unidad de calibración regional (celda gruesa, bioma, país) | Sprint 5 |
| 7 | Plan B si S-NPP no llega o viene incompleto (calibrar solo con N20, 2018+) | Sprint 5 |

## Riesgos

- **S-NPP sin fecha de llegada** y probablemente sin datos recientes.
- **Volumen** de VIIRS: millones de filas por año.
- **Cobertura 2000–2002** con un solo satélite MODIS, y **agosto-septiembre 2020** por el corte de Aqua.
- **Calidad de `type` desigual** en MODIS antes de 2018.
