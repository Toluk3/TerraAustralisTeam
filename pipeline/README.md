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

## Configuración

- **`extends`:** un YAML puede partir de otro y declarar solo lo que cambia (así están los de `lotes/`). Las rutas siempre son relativas al archivo que se pasa en `--config`.
- **`TERRA_INPUT_DIR`:** variable de entorno que reemplaza `paths.input_dir`, para no tocar los YAML en cada máquina.
- **`calibration_levels`:** `r<resolución H3>` de más fina a más gruesa y `global` al final.
- **`calibration_from`:** bases de otros lotes que se suman al ajustar `k`. Con la misma lista en todos los lotes, el `k` de las regiones de frontera y el nivel global coinciden. Los lotes L1–L4 y L6 la declaran en `lotes/_comun.yaml` y se corren con `bash lotes/correr_todos.sh` (fase 1 de todos, después fase 2): el primero ajusta `k` y el resto lo copia.
- **`baseline_years`:** período base de la mediana y la anomalía.
- **Extensión `h3` de DuckDB:** es obligatoria y se instala sola la primera vez (hace falta red). `PIPELINE_H3_PYTHON=1` habilita un respaldo lento con h3 de Python, sin el paso `zone`, solo para pruebas chicas.

Las vistas `fires_raw`, `fires_norm` y `fires_excluded` son temporales: existen en las conexiones abiertas con `pipeline.db.connect`, no dentro del `.duckdb`.

Si cambia la configuración hay que volver a correr desde `support`: `rollup` y `zone` se niegan a usar tablas de apoyo o un `k` armados con otra configuración u otros datos.

## Productos

- `data/prehack.duckdb`: tablas de análisis y validación de la corrida.
- `data/`: Parquet de entrada transformada, datos intermedios y productos locales.
- `data/publish/`: exportación para consumo posterior, incluida la preparación del frontend.

El frontend crea sus archivos JSON estáticos desde `data/publish/` mediante `frontend/map/scripts/build_mocks.py`. El cierre actual no depende de un backend Django ni de subir los datos a un bucket.

## Estado y decisiones pendientes

Las etapas del pipeline y las pruebas automáticas están implementadas. Los datos y las publicaciones deben generarse localmente antes de construir el mapa. Los resúmenes versionados de los lotes están en `lotes/resumen/`; las bases consolidadas de ejecución no se versionan.

Antes de una publicación final hay que identificar la configuración exacta y verificar:

- La métrica elegida para la serie, con la evidencia de validación.
- Las plataformas activas: Terra, Aqua, NOAA-20 y NOAA-21. S-NPP quedó fuera ([`PLAN_NORMALIZACION.md`](../documentacion/PLAN_NORMALIZACION.md), sección 7).
- Los datos y el intervalo temporal efectivamente incluidos.
- El `config_hash` de los productos generados.

## Pruebas y documentación

```bash
python -m pytest
```

Las instrucciones de descarga, procesamiento, QC y publicación están en los casos de uso del repositorio. La especificación ejecutiva está en [`documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](../documentacion/FUNDAMENTOS_DEL_PROYECTO.md); los procedimientos por lote, en [`documentacion/PLAN_ANALISIS_LOTES.md`](../documentacion/PLAN_ANALISIS_LOTES.md).
