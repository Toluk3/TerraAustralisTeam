# Pipeline de datos

## Resumen

El pipeline prepara los datos FIRMS que usa Terra Australis para el análisis y la demostración del mapa. Implementa la ingesta, normalización, controles de calidad, agregación espacial y temporal, calibración, validación y exportación. Utiliza Python, DuckDB y H3.

El estado y la relación de este componente con el frontend se describen en [`documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](../documentacion/FUNDAMENTOS_DEL_PROYECTO.md). Los datos fuente y los productos generados se almacenan localmente y no se versionan.

## Flujo de procesamiento

```text
ingest → normalize → support → aggregate → calibrate
       → rollup → validate → qc → zone → export
```

La ejecución completa es:

```bash
python -m pipeline all
```

Se puede usar `--config` para apuntar a una configuración específica, por ejemplo a una corrida por lotes. La configuración principal está en `config.yaml`; las opciones de normalización y calibración están explicadas en [`documentacion/PLAN_NORMALIZACION.md`](../documentacion/PLAN_NORMALIZACION.md).

## Productos

- `data/prehack.duckdb`: tablas de análisis y validación de la corrida.
- `data/`: Parquet de entrada transformada, datos intermedios y productos locales.
- `data/publish/`: exportación para consumo posterior, incluida la preparación del frontend.

El frontend crea sus archivos JSON estáticos desde `data/publish/` mediante `frontend/map/scripts/build_mocks.py`. El cierre actual no depende de un backend Django ni de subir los datos a un bucket.

## Estado y decisiones pendientes

Las etapas del pipeline y las pruebas automáticas están implementadas. Los datos y las publicaciones deben generarse localmente antes de construir el mapa. Los resúmenes versionados de los lotes están en `lotes/resumen/`; las bases consolidadas de ejecución no se versionan.

Antes de una publicación final hay que identificar la configuración exacta y verificar:

- La métrica elegida para la serie, con la evidencia de validación.
- Las plataformas activas, en particular la diferencia entre la prioridad de S-NPP en `config.yaml` y su exclusión en el plan de análisis por lotes.
- Los datos y el intervalo temporal efectivamente incluidos.
- El `config_hash` de los productos generados.

## Pruebas y documentación

```bash
python -m pytest
```

Las instrucciones de descarga, procesamiento, QC y publicación están en los casos de uso del repositorio. La especificación ejecutiva está en [`documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](../documentacion/FUNDAMENTOS_DEL_PROYECTO.md); los procedimientos por lote, en [`documentacion/PLAN_ANALISIS_LOTES.md`](../documentacion/PLAN_ANALISIS_LOTES.md).
