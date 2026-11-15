# Normalización y armonización de datos MODIS y VIIRS

## Resumen

Este documento describe el método implementado por el pipeline para transformar las observaciones de NASA FIRMS en productos comparables. Los datos se unifican en un esquema común, se filtran y agregan con una grilla H3, y se armonizan mediante factores de calibración ajustados durante períodos de observación simultánea.

La configuración principal es la fuente de verdad para una ejecución: actualmente especifica la métrica `n_clusters_det`, la referencia Terra + Aqua, el uso de MODIS hasta el 31 de diciembre de 2021 y el cambio a VIIRS desde el 1 de enero de 2022. La serie usa Terra, Aqua, NOAA-20 y NOAA-21; S-NPP quedó fuera. Las decisiones vigentes están en la sección 7.

## 1. Flujo de datos

```text
Archivos FIRMS
   ↓
Ingesta y trazabilidad
   ↓
Normalización, filtros y control de calidad
   ↓
Calendario, cobertura y celdas H3
   ↓
Agregación diaria y comparación de métricas
   ↓
Calibración y validación
   ↓
Series mensuales y de ocho días
   ↓
Productos Parquet para publicación y visualización
```

El pipeline se ejecuta mediante `python -m pipeline all`. Sus etapas están implementadas en `pipeline/`; los datos de trabajo y publicación se generan localmente bajo `data/` y no se versionan.

## 2. Esquema y normalización

La ingesta conserva los registros fuente y agrega información de procedencia. La normalización construye campos comunes para los dos productos:

| Grupo | Campos y tratamiento |
|---|---|
| Procedencia | Archivo, fila fuente, sensor, plataforma y país |
| Tiempo | Instante UTC, fecha solar local, mes y período de ocho días |
| Posición | Coordenadas WGS84 y celdas H3 |
| Medición | Temperatura de brillo, FRP y dimensiones del píxel |
| Calidad | Confianza normalizada, tipo de foco, versión del producto y motivo de exclusión |

El pipeline valida tipos y rangos, deriva el tiempo solar local y mantiene un registro de filas excluidas. Aplica la clasificación de tipo disponible, el umbral común de confianza configurado y una máscara estática para reducir fuentes persistentes que no corresponden a incendios de vegetación. La máscara es relevante porque algunos datos NRT no contienen `type` y la clasificación de productos históricos puede diferir.

La calibración es válida para los filtros, el calendario y los datos con que se generó. Los artefactos conservan `config_hash` y `calibration_meta` guarda una huella de los archivos ingeridos: si cambia cualquiera de los dos, `rollup` se niega a usar ese `k`. `min_conf_class: high` queda solo para pruebas de sensibilidad, porque las clases de confianza de MODIS y VIIRS no son equivalentes en ese corte. Los artefactos conservan `config_hash`; una modificación de configuración requiere regenerar las etapas dependientes y no reutilizar factores incompatibles.

## 3. Grilla espacial y métricas

El pipeline utiliza H3, en lugar de las grillas de aproximadamente un kilómetro y 0,5 grados que aparecían en propuestas tempranas:

| Resolución | Función |
|---|---|
| r8 | Agrupación fina de focos y máscara estática |
| r7 | Celdas de agregación usadas por los productos del mapa |
| r3 | Región principal para calibración |
| r2 | Nivel regional de respaldo cuando r3 tiene pocas observaciones |

Se conservan cuatro métricas para evaluar la sensibilidad a la resolución y a la detectabilidad:

- `n_fires`: número de detecciones de píxel.
- `n_clusters`: número de celdas r8 distintas con fuego en una pasada.
- `n_clusters_r7`: número de celdas r7 distintas con fuego en una pasada.
- `n_clusters_det`: igual que `n_clusters`, pero de noche cada cluster VIIRS cuenta según la probabilidad de que MODIS lo detecte por su FRP (paso `detect`, explicado abajo). De día, y para MODIS, es igual a `n_clusters`.

### Detectabilidad nocturna (`n_clusters_det`)

De noche MODIS no ve la mayoría de los fuegos débiles que ve VIIRS, y la proporción de fuegos débiles cambia de un año y de una región a otra. Contando todos los clusters, `k` nocturno cambia con esa proporción: en Argentina, 2018 tuvo más fuegos débiles (40 % de los clusters bajo 1,5 MW contra 29–36 % los otros años) y su cociente de validación nocturno da 1,18. NOAA-20 y S-NPP coinciden en eso, así que no es un problema del instrumento.

Un umbral fijo de FRP no alcanza: la detección de MODIS crece de forma gradual (Aqua ve ~2 % de los clusters de menos de 1 MW, ~6 % de los de 1,5–2 MW y ~50 % de los de más de 10 MW) y el umbral que mejor anda cambia con la región. Por eso:

- `aggregate` guarda, por celda y día, los clusters VIIRS nocturnos en seis tramos de FRP (< 1, 1–1,5, 1,5–2, 2–5, 5–10 y ≥ 10 MW) y cuántos tienen una detección de Aqua en la misma celda r7 y noche. Aqua cruza a la misma hora que NOAA-20 (~01:30).
- `detect` estima la probabilidad por tramo en cada región r1 (`detect_level`), con respaldo al total si la región tiene menos de `detect_min_count` clusters en el tramo, y la normaliza para que la suma total no cambie. Con `calibration_from` usa todos los lotes.
- `validate` vuelve a estimar los pesos sin el año que deja afuera.

La configuración principal selecciona `n_clusters_det`. La ablación la sigue comparando con `n_clusters` y las demás métricas.

## 4. Calibración y composición de la serie

El estimador implementado es un factor `k` calculado como cociente de sumas entre la métrica de referencia y la métrica fuente durante el solape seleccionado:

```text
k = suma(métrica de referencia) / suma(métrica de la plataforma fuente)
```

La calibración se estratifica por región, mes, condición diurna/nocturna y plataforma, con niveles de respaldo regional configurados. La incertidumbre se estima mediante réplicas bootstrap. Estos productos permiten evaluar sesgos entre sensores; la serie mostrada por el frontend es la serie armonizada, no los conteos crudos por plataforma.

La configuración actual establece:

| Parámetro | Valor configurado | Interpretación |
|---|---|---|
| `reference` | `terra_aqua` | Escala de referencia de la serie |
| `metric` | `n_clusters_det` | Métrica base de la ejecución principal |
| `modis_stable_until` | `2021-12-31` | Fin del intervalo MODIS considerado estable para el ajuste |
| `switch_date` | `2022-01-01` | Inicio de la serie estimada con VIIRS |
| `calibration_levels` | `r3`, `r2`, `r1`, `global` | Respaldo jerárquico para estratos con pocas observaciones; `r1` evita caer en `global`, que mezcla todo lo que haya en la corrida |
| `calibration_from` | vacío en `config.yaml`; L1–L4 y L6 en `lotes/_comun.yaml` | Bases de otros lotes que se suman al ajuste, para que `k` no dependa de cómo se partieron los lotes |
| `baseline_years` | `[2003, 2021]` | Período base de la mediana y la anomalía (MODIS Terra + Aqua observado) |
| `month_window` | `1` | Ventana de ajuste alrededor del mes de referencia |

Hasta la fecha de cambio, la configuración toma la referencia MODIS observada; a partir de ella usa una plataforma VIIRS priorizada y su factor `k`. Los factores se aplican a agregados diarios antes de formar períodos mensuales o de ocho días, de modo que un período que atraviesa dos meses pueda usar los factores correspondientes.

## 5. Calendario, cobertura e incertidumbre

Los agregados se complementan con un calendario y períodos operativos por plataforma. Al consultar una serie, el pipeline puede distinguir entre un período con detecciones, un período cubierto sin detecciones y un período sin cobertura suficiente. Un cero no debe asignarse a fechas anteriores al inicio operativo de la plataforma ni a cortes de datos.

La agregación principal es mensual. El producto de ocho días ofrece una ventana temporal más detallada, pero no representa una medición diaria independiente. La guía de MODIS advierte que los intervalos menores a aproximadamente ocho días pueden presentar sesgos.

La incertidumbre de la suma de un área debe calcularse sobre las réplicas de calibración para dicha área. No corresponde sumar bandas de error celda por celda como si las observaciones fueran independientes.

### Cómo se decide la cobertura

- **Año publicado:** una plataforma tiene datos entre el primer y el último año para los que hay focos o un archivo suyo en la carpeta de entrada: un zip de todos los países, o un CSV de un país pedido. Un CSV suelto de otro país no cuenta. FIRMS no publica el archivo de un país en un año sin detecciones, así que un año intermedio sin archivo cuenta como cubierto con 0 focos.
- **Fin de los datos:** se calcula por plataforma. Si el último año viene de un archivo anual, llega al 31/12; si viene de descargas NRT, llega al último foco. Un sensor cuyos archivos terminan antes que los de otro no figura con cobertura después.
- **Límite conocido:** el primer y el último año no se pueden distinguir de "sin datos" si no hay ningún archivo de esa plataforma para ese año en la carpeta.
- **Anomalía:** solo se informa en períodos de cobertura completa y se mide contra la mediana de `baseline_years`.

## 6. Validación y control de calidad

El pipeline implementa reportes de control de calidad, validación de la calibración y comparaciones entre métricas. Entre los controles automatizados descritos por el proyecto se incluyen:

- Conservación del conteo de filas entre registros normalizados y excluidos.
- Conversión correcta de formatos de hora y clases de confianza.
- Reproducibilidad de la ingesta y agregación.
- Coherencia entre conteos de detecciones y métricas agrupadas.
- Clasificación de ceros y períodos sin cobertura.
- Compatibilidad entre el hash de configuración usado en calibración y el de los productos derivados.

**Criterio de aceptación de la validación** (dejando un año afuera, en `validate.acceptance`):

- Principal: el cociente armonizado / MODIS de día + noche de cada año entre 0,9 y 1,1, y el de día también; sesgo anual dentro de ±10 %. Día + noche es lo que muestra la serie.
- Aviso: el cociente nocturno de cada año fuera de 0,85–1,15. MODIS detecta pocos fuegos de noche (en Argentina, alrededor del 10 % de sus clusters) y su cociente varía más de un año a otro.

Con `n_clusters_det`, L1–L4 cumplen el criterio principal. Queda un aviso en Argentina: la noche de 2020 da 1,155, casi toda por octubre de 2020 (incendios de Córdoba, fuegos más intensos que el resto del solape). No está explicado del todo.

Los lotes L1–L3 cuentan con resúmenes versionados en `lotes/resumen/`. La carpeta `analisis/` todavía no incluye scripts ni resultados finales propios. Por lo tanto, esta evidencia no permite afirmar que las preguntas de análisis regional, sensibilidad y transferibilidad estén todas respondidas.

## 7. Decisiones y límites vigentes

### Decisiones

| Decisión | Valor | Motivo |
|---|---|---|
| Métrica | `n_clusters_det` | Con datos reales de L1–L4 y calibración común, frente a `n_clusters`: el peor año de noche baja de 18,4 a 15,5 % (Argentina), de 15,2 a 10,6 % (Cono Sur), de 10,3 a 6,8 % (Brasil) y de 11,6 a 8,7 % (L4); el error mediano nocturno baja entre 29 y 45 %, y el de día + noche también baja en los cuatro. El día no cambia. |
| Referencia | Terra + Aqua | Cubre desde noviembre de 2000. Con solo Aqua la validación de Argentina empeora (error mediano 0,091 contra 0,084) y se pierde 2000–2002. |
| Plataformas VIIRS | NOAA-20 y NOAA-21; S-NPP fuera | No hay archivos de S-NPP en los datos del proyecto y la configuración principal y los lotes quedan iguales. Costo: el solape VIIRS–MODIS es de 3,75 años (NOAA-20, 2018-04 → 2021-12) en lugar de unos diez; `calibrate` lo avisa. |
| Celda de los agregados | H3 r7 | El mapa ya publica r5 y r6 agregadas para zooms lejanos; r7 conserva el detalle de cerca. |
| Niveles de `k` | r3 → r2 → r1 → global | Sin `r1`, entre 12 % y 28 % de la serie VIIRS usaba el nivel global, que mezcla continentes. |
| Calibración de los lotes | Común (`lotes/_comun.yaml`) | El `k` de una región que cruza dos lotes y el nivel global son los mismos en todos. Las variantes L5 y la muestra S1 repiten países y calibran solas. |
| Período base de la mediana | 2003–2021 | Es el tramo de Terra + Aqua observado: sin Terra sola, sin el tramo estimado con VIIRS y sin que el año evaluado entre en su propia mediana. |
| Confianza mínima | `nominal` | Con `high` las clases de MODIS y VIIRS dejan de ser equivalentes (de noche VIIRS casi no marca `high`) y `k` queda inestable. |
| Entrega | JSON estáticos, sin backend | Alcanza para la demostración de una zona fija. |

### Límites

1. **Datos de 2026:** la incorporación de NRT está pendiente y exige una corrida con su configuración y controles correspondientes.
2. **Transferibilidad:** resúmenes de Argentina y otros lotes no implican que un factor calibrado en una región sea válido para todas las demás.
3. **Interpretación:** el producto describe detecciones satelitales armonizadas; no identifica perímetros, causas ni confirma incendios.
4. **Evidencia:** la métrica se eligió con la validación de L1–L4; los lotes de África no tienen todavía validación real. La referencia se eligió con Argentina.

## 8. Referencias de operación

- [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md): resumen ejecutivo de alcance y estado.
- [`PLAN_MODULO_DATOS.md`](PLAN_MODULO_DATOS.md): fuentes, atributos y preparación de FIRMS.
- [`PLAN_ANALISIS_LOTES.md`](PLAN_ANALISIS_LOTES.md): corridas por lote, resultados disponibles y trabajo pendiente.
- [`pipeline/README.md`](../pipeline/README.md): comandos, etapas y estado operativo del pipeline.
- [`config.yaml`](../config.yaml): parámetros efectivos para la ejecución principal.
