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
| L4 · Contrastes | Australia, Estados Unidos, Canadá, Qatar e Islandia | Bosques, fuentes industriales y contextos diversos | No identificado entre los resúmenes disponibles |
| L5 · Sensibilidad | Argentina con variantes de configuración | Medir sensibilidad al umbral y a la máscara | No identificado como campaña completa |
| L6 · Global | Países restantes, por continente | Ampliación exploratoria | Opcional; no identificado entre los resúmenes disponibles |

El directorio `lotes/resumen/` contiene actualmente subdirectorios para L1, L2 y L3. Los archivos de resultados consolidados que permitirían volver a analizar todas las corridas residen en `data/` y no se versionan.

## 4. Selección de plataformas en esta campaña

Las corridas por lote descritas aquí excluyen Suomi NPP y utilizan NOAA-20 para la comparación de solape de esa campaña. La decisión responde al alcance y formato de los archivos que se prepararon para los lotes; no debe interpretarse automáticamente como la política definitiva del pipeline general.

`config.yaml` incluye S-NPP en la prioridad de plataformas VIIRS. Por tanto, cualquier publicación debe identificar la configuración exacta y confirmar qué plataformas se usaron. El resumen ejecutivo documenta esta diferencia en [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md).

## 5. Ejecución y resultados versionados

Los lotes se lanzan con el script `lotes/correr_lote.py`, que aplica la configuración del lote, ejecuta las etapas del pipeline y consolida resultados en una base local. Los procedimientos concretos están en los casos de uso del repositorio.

Los resúmenes presentes incluyen tablas de calibración, ablación, factores por año, descartes y registro de ejecución para L1–L3. Esos artefactos documentan resultados de corridas, pero no constituyen por sí solos un análisis final interpretado para todas las preguntas del apartado 2. `analisis/` contiene actualmente su README, no un conjunto versionado de scripts y conclusiones reproducibles.

Las bases locales y los datos originales no se versionan. Si no existen en la máquina, hay que descargar o procesar los datos antes de volver a ejecutar o consolidar los resultados.

## 6. Pendientes para cerrar el análisis

- Revisar los resúmenes L1–L3 con sus configuraciones y extraer conclusiones explícitas sobre la métrica y la calibración.
- Determinar si L4 y las variantes de sensibilidad L5 son necesarias para sostener las conclusiones de la entrega.
- Implementar scripts reproducibles de análisis en `analisis/scripts/` y guardar resultados interpretados en `analisis/resultados/`.
- Entregar al pipeline cualquier cambio recomendado de métrica, fechas de transición, parámetros o celdas que deban enmascararse, con la evidencia correspondiente.
- Confirmar qué plataformas participan en la serie que se publicará; no mezclar los resultados de esta campaña, restringida a NOAA-20, con la configuración general que contempla S-NPP.
- Publicar o ejecutar de nuevo los análisis sobre la configuración final si la selección de métrica o plataforma cambia.

Los valores de duración y tamaño que aparecían en estimaciones previas son dependientes del equipo y de los datos disponibles; no se consideran criterios de cierre.

## 7. Referencias

- [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md): estado general y límites de las conclusiones actuales.
- [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md): método de normalización, calibración y validación.
- [`lotes/`](../lotes/): configuraciones, script de ejecución y resúmenes versionados.
- [`analisis/README.md`](../analisis/README.md): responsabilidades del análisis y entregables esperados.
