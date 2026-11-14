# Análisis y validación

## Propósito

Esta área contrasta la calibración y los productos del pipeline con resultados reproducibles. Su función es aportar evidencia sobre la métrica, las fechas de transición, las plataformas y los límites de interpretación; no modifica directamente el pipeline ni convierte detecciones satelitales en confirmaciones de incendios.

El estado general y las decisiones pendientes se resumen en [`documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](../documentacion/FUNDAMENTOS_DEL_PROYECTO.md).

## Estado actual

Los resúmenes versionados de los lotes L1 (Argentina), L2 (Cono Sur) y L3 (Brasil) se encuentran en `lotes/resumen/`. En este directorio solo está versionado este README: no se encontraron scripts de análisis propios ni resultados finales interpretados en `analisis/scripts/` o `analisis/resultados/`.

Por lo tanto, los resúmenes de los lotes constituyen evidencia de ejecuciones, pero no significan que todas las preguntas del análisis estén contestadas ni que la recomendación de métrica y plataformas para la publicación haya quedado cerrada.

## Tareas de cierre

1. Revisar los resultados por lote junto con la configuración que los produjo.
2. Elaborar scripts reproducibles para comparar métricas, sesgos y estabilidad de la calibración.
3. Registrar conclusiones y visualizaciones en `analisis/resultados/`.
4. Recomendar la métrica y plataforma para la corrida a publicar, documentando la evidencia.
5. Solicitar cambios al Área de datos y volver a procesar cuando una conclusión requiera modificar parámetros.

No presentar conclusiones regionales generales si el análisis disponible no cubre esas regiones ni esos sensores.

## Reglas de trabajo

- Abrir `data/prehack.duckdb` y demás bases del pipeline en modo de solo lectura.
- Registrar la configuración y `config_hash` asociados a cada resultado.
- Mantener los resultados regenerables desde scripts versionados; separar las exploraciones temporales de los entregables finales.
- Distinguir resultados sintéticos de los obtenidos con datos FIRMS.

## Referencias

- [`documentacion/PLAN_ANALISIS_LOTES.md`](../documentacion/PLAN_ANALISIS_LOTES.md): alcance de la campaña por lotes y su estado.
- [`documentacion/PLAN_NORMALIZACION.md`](../documentacion/PLAN_NORMALIZACION.md): método de normalización y validación.
- [`pipeline/README.md`](../pipeline/README.md): ejecución y productos del pipeline.
