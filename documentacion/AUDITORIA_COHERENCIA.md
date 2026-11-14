# Auditoría de coherencia documental y estado de implementación

**Repositorio:** `Toluk3/TerraAustralisTeam`  
**Revisión:** rama `main`, commit `671ed29e7aeb49ed012c089ce777ace7db31b242`  
**Objetivo:** consolidar qué propuesta quedó vigente, detectar contradicciones entre documentos y contrastarlas con el código que sí está en el repositorio.

## Resumen ejecutivo

La documentación mezcla al menos tres etapas del proyecto: el plan inicial para una app Streamlit con un método de armonización todavía hipotético; una arquitectura posterior acordada alrededor de Django, Google Cloud, DuckDB y H3; y una implementación de pipeline mucho más avanzada que el backend/frontend, que siguen siendo principalmente carpetas con README y tareas pendientes.

**La referencia más consistente para la implementación de datos actual es `config.yaml` + `pipeline/` + `documentacion/PLAN_NORMALIZACION.md` + los casos de uso CU-01 a CU-10**, contrastados contra el código. `documentacion/ARQUITECTURA.md` sirve como intención de producto/plataforma, pero no como prueba de que la app ya exista. `documentacion/PLAN.md` y partes de `PLAN_MODULO_DATOS.md` son propuestas antiguas que deben marcarse como supersedidas o actualizarse.

**Conclusión de PM:** hay una implementación de pipeline local para datos históricos y una zona fija, pero el repositorio no acredita todavía un producto web end-to-end desplegado. Además, el flujo de cobertura tiene una discrepancia de lógica que conviene resolver antes de presentar la serie histórica como final.

## Qué se revisó y límites

Se revisaron los documentos Markdown del repositorio (README de raíz y carpetas, arquitectura, planes, áreas y CU-01 a CU-10) y se contrastaron las afirmaciones relevantes con `config.yaml`, `pipeline/`, `requirements.txt` y `scripts/ejecutar_todo.sh`.

`documentacion/Documentacion_Proyecto.pdf` está listado como resumen, pero no se pudo inspeccionar su contenido en esta revisión de archivos de texto. Debe compararse con este informe antes de tratarlo como actualizado. Los CSV/parquet locales de `data/` y los datos de `Datos/` no están versionados, por lo que las cifras de corridas se tomaron como afirmaciones documentales, no se reprodujeron aquí.

## Incoherencias y decisiones por cerrar

### 1. Producto y arquitectura: plan inicial versus arquitectura posterior

- `documentacion/PLAN.md:67-82` propone `pandas`, `geopandas/shapely`, Streamlit, Folium, Plotly, archivos `data/harmonized.parquet` y un modelo LightGBM como mejora. No coincide con `documentacion/ARQUITECTURA.md:20-31, 42-64`, que define DuckDB/H3, Parquet en Cloud Storage, API Django en Cloud Run y Google Maps; ni con el pipeline actual (`pipeline/__main__.py:8-32`).
- `PLAN.md:55-63` plantea agrupamiento VIIRS en celdas aproximadas de 1 km y calibración inicial sobre celdas de 0,5°, con posible promedio MODIS/VIIRS durante el solape. El diseño vigente está en `documentacion/PLAN_NORMALIZACION.md:133-164, 176-217`: H3 r8/r7/r3/r2, factores por región/mes/día-noche y aplicación diaria; una plataforma VIIRS por fecha.
- `PLAN.md:29-37` pone el calendario 2001–2026 como entregable; `README.md:21-29` describe una serie 2000–2025. El pipeline define inicio 2000-11 y fin dinámico según calendario/datos (`config.yaml:61-63`, `pipeline/support.py:15-20`). No hay evidencia en el repositorio de datos anuales 2026 ni de una app con cobertura “hasta hoy”.
- La propuesta inicial deja abierto dibujar una región/ingresar coordenadas (`PLAN.md:21-25`), mientras la arquitectura vigente y los README de backend/frontend especifican zona fija Río Negro–Neuquén y endpoints sin geometrías (`documentacion/ARQUITECTURA.md:26-29, 110-120, 143-157`; `backend/README.md:32-35`).

**Resolución:** declarar `PLAN.md` como histórico/propuesta inicial o reescribirlo para reflejar la arquitectura y alcance vigente. No dejar ambos planes con el mismo estatus.

### 2. Qué está implementado de verdad: pipeline sí, producto web no acreditado

- `pipeline/README.md:27-37` marca como terminado el procesamiento, la validación, QC, exportación y pruebas. CU-03 también describe una corrida y un `data/publish/` generado (`casos de uso/CU-03_ejecutar_pipeline.md:31-63`).
- En cambio, `backend/README.md:20-45` y `frontend/README.md:19-58` describen estructuras **sugeridas** y mantienen sus tareas P0 sin completar. En el árbol del repositorio solo figuran esos README; no están `manage.py`, proyecto Django, código frontend, Dockerfile, contrato API, ni `documentacion/CONTRATO_DATOS.md` o `CONTRATO_API.md`.
- `documentacion/ARQUITECTURA.md:5` dice “acordado por el equipo”, pero en `:29` el framework frontend está abierto y en `:143-155` el contrato de API sigue siendo borrador. `documentacion/README.md:13-15` confirma que ambos contratos y los textos de app están por escribir.
- `pipeline/README.md:42-45` deja contrato de datos, formato de puntos, NRT y subida al bucket pendientes. Por lo tanto, “exporta estructura de bucket local” no equivale a “API desplegada / app lista”.

**Resolución:** separar el estado en tres etiquetas verificables: `pipeline local`, `integración API/frontend`, `deploy/demo`. No presentar arquitectura planeada como funcionalidad entregada hasta que existan código, pruebas de integración y URL.

### 3. Serie temporal y sensores: reglas antiguas que ya fueron reemplazadas

- `PLAN.md:61` dice que la serie usa MODIS hasta su fin y VIIRS después; en el solape se podría promediar. El criterio vigente es `modis_stable_until: 2021-12-31`, `switch_date: 2022-01-01` y referencia `terra_aqua` (`config.yaml:34-42`; `documentacion/PLAN_NORMALIZACION.md:178-197`). Desde el cambio se toma una plataforma VIIRS priorizada, convertida a equivalente Terra+Aqua; no se promedian detecciones de dos sensores.
- `PLAN.md:56-59` recomienda LightGBM y bootstrap como partes del método inicial. El plan de normalización posterga LightGBM a P2 por falta de solape suficiente con NOAA-20 (`documentacion/PLAN_NORMALIZACION.md:313-318`). El pipeline implementa factores `k` y bootstrap, no LightGBM (`pipeline/calibrate.py:1-8, 134-172`).
- Los documentos presentan una decisión de métrica todavía ambigua. `config.yaml:35` ya fija `n_clusters`; CU-06 dice que `n_clusters` tiene el menor sesgo y mayor correlación, pero que `n_fires` tiene el NMAE más bajo (`casos de uso/CU-06_validar_armonizacion.md:27-46`). A la vez `pipeline/README.md:47-50` mantiene pendiente aplicar la recomendación de Área 2 y `documentacion/AREAS.md:64-69` dice que Área 1 decide con recomendación de Área 2.

**Resolución:** registrar una decisión con fecha/autor/evidencia: métrica elegida, criterio que prioriza (NMAE, sesgo o correlación) y si `n_clusters` es decisión final o solo el valor actual de configuración. Actualizar config, CU-06 y checklist de Área 1 en conjunto.

### 4. Datos recientes y promesa “hasta hoy”

- `README.md:21-29` limita el resultado descrito a 2000–2025. CU-01 registra 48 archivos históricos hasta 2025 y dice que 2026 no está publicado (`casos de uso/CU-01_descargar_datos_firms.md:30-40`).
- CU-09 define cómo pedir NRT de 2026, pero `pipeline/README.md:41-45` lo marca pendiente y dice que requiere MAP_KEY; tampoco consta que se haya ejecutado ni publicado. La descarga anual estándar y la ingestión NRT son flujos distintos.
- `casos de uso/CU-01_descargar_datos_firms.md:61` indica que NOAA-21 no está en el archivo anual y solo llega por NRT; CU-09 especifica que NOAA-21 reutiliza el `k` de NOAA-20 (`:17-29`). Debe advertirse en la interfaz/metadata que los meses NRT son preliminares y qué plataforma/fallback se usó.

**Resolución:** describir la entrega actual como serie histórica disponible hasta el último dato estándar efectivamente procesado; marcar NRT como pendiente/no publicado hasta que exista una corrida verificable y una versión en el bucket.

### 5. Cobertura: contrato documental no coincide con cómo se construyen los días cubiertos

La documentación promete que un archivo anual ausente equivale a cero focos (`casos de uso/CU-01_descargar_datos_firms.md:53-56`) y que el calendario distingue cero real de “sin datos” (`documentacion/PLAN_NORMALIZACION.md:169-174`). Sin embargo, `pipeline/support.py:43-52` construye rangos `kind='datos'` solo a partir de años presentes en `fires_norm`; para años intermedios marca del 1 de enero al 31 de diciembre si la plataforma tuvo alguna fila ese año, y para el último año termina en la última fecha con foco (`:55-68`).

Esto puede hacer que un año sin archivo/detecciones quede como falta de cobertura en vez de cero observado, y que el final del último año se trate como cubierto solo hasta el último foco. Un dataset de detecciones no permite inferir por sí solo el rango real de completitud del archivo. Esa diferencia afecta `coverage_frac`, meses incluidos en la calibración/baseline y estados `ok/parcial/sin_datos`.

**Resolución P0:** definir la fuente de verdad de cobertura (rango de disponibilidad del producto/archivo, no primera y última detección), y distinguir explícitamente `archivo completo sin focos` de `archivo ausente/no descargado`. Agregar pruebas para año operativo completo sin focos y año con datos incompletos; recalcular reportes/publicación tras corregirlo.

### 6. Dependencias y stack declarado

- `PLAN.md:80` lista pandas, geopandas/shapely, scikit-learn y LightGBM; `PLAN_MODULO_DATOS.md:103-105` menciona Python ≥3.10, polars/pyarrow y H3; la arquitectura menciona Python con DuckDB/polars (`ARQUITECTURA.md:20`).
- Las dependencias instaladas por el flujo real son solo DuckDB, h3, PyYAML, pytest y pytz (`requirements.txt:1-5`). No figuran Streamlit, Django, Google Maps/deck.gl, pandas, polars, pyarrow ni LightGBM.

**Resolución:** distinguir dependencias del pipeline de las que requerirán backend/frontend/experimentos. Actualizar los stacks de cada documento cuando el framework de app se decida; no describir paquetes como parte de la implementación si no están instalados ni usados.

### 7. Publicación a Cloud Storage: instrucciones incompatibles y una operación destructiva

- `pipeline/export.py:1-13` recomienda `gcloud storage cp -r`.
- El índice de CU indica `gcloud storage cp` (`casos de uso/README.md:16`), mientras CU-08 usa `gcloud storage rsync -r --delete-unmatched-destination-objects` (`casos de uso/CU-08_publicar_cloud_storage.md:18-22`).
- CU-08 advierte que `rsync --delete` borra objetos que no estén en la carpeta local y luego propone excluir reportes (`:37`). La elección cambia si el bucket puede contener otros objetos y qué archivos se publican.

**Resolución:** acordar un único comando y un prefijo exclusivo del dataset. Documentar explícitamente si se publica `reportes/`, hacer primero una prueba/dry-run y evitar borrar contenido fuera del prefijo de publicación.

### 8. Roles y coordinación: organización propuesta, no asignada

`documentacion/AREAS.md:10-18` define cinco áreas, pero los responsables de las áreas 2–5 están vacíos y el propio texto deja al Área 1 como “natural” para Toluk3. Lo mismo ocurre en `analisis/README.md`, `backend/README.md`, `frontend/README.md` y `pitch/README.md` (responsable sin completar). Esto contrasta con `AREAS.md:22-29` y sus hitos (`:50-60`), que presuponen dueños, ramas y aprobaciones asignados.

**Resolución:** completar responsable titular y suplente, confirmarlo en el README de cada área y retirar hitos/roles que ya no correspondan al evento o al estado real.

### 9. Documentos declarados como contrato pero todavía ausentes

`documentacion/README.md:13-15` lista `CONTRATO_DATOS.md`, `CONTRATO_API.md` y `TEXTOS_APP.md` como “a escribir”. Aun así, los README de pipeline/backend/frontend y varios CU dicen que sus salidas se consumen “según” esos contratos. Esto deja ambiguos el esquema de `points/`, las respuestas API, errores, filtros temporales, formato de descarga y metadatos.

**Resolución P0 para integrar áreas:** crear primero los contratos mínimos desde el export real y validarlos con fixtures. Hasta entonces, referirse a “esquema actual de `pipeline/export.py`”, no a un contrato aprobado.

### 10. Cifras de salida: coherentes entre sí, pero no reproducidas en esta revisión

CU-01 reporta 48 archivos/488 MB; CU-03 reporta 6.330.305 filas, 5.621.086 limpias y 709.219 descartadas; el índice de casos de uso repite esas cifras y CU-06 aporta resultados de validación. Aritméticamente los conteos de filas cierran, y 26 años MODIS + 14 S-NPP + 8 NOAA-20 explican 48 archivos. No obstante, las cifras son snapshots de corrida y no se acompañan de artefactos versionados en el repo.

**Resolución:** agregar a `meta/version.json`/reporte el commit, hash de configuración, fechas de datos y resumen reproducible. Fechar explícitamente resultados del README/CU y no presentarlos como garantía de la corrida actual.

## Línea base recomendada para la implementación final

Usar esta definición como fuente única hasta que el equipo apruebe un cambio:

1. **Producto:** calendario/visualización para una zona fija, Río Negro y Neuquén; no dibujo de AOI en la primera entrega.
2. **Datos en repositorio:** pipeline Python + DuckDB + H3; entrada FIRMS en `Datos/`; outputs locales Parquet/DuckDB; publicación estructurada en `data/publish/`.
3. **Serie armonizada:** referencia equivalente Terra+Aqua; MODIS hasta `2021-12-31`; desde `2022-01-01`, una plataforma VIIRS priorizada convertida por `k`. La configuración actual elige `n_clusters`, pendiente de ratificación formal.
4. **Cobertura temporal:** no afirmar 2026/hasta hoy en producción hasta completar y verificar CU-09 y publicar el resultado. Publicar fechas efectivas, cobertura parcial y procedencia.
5. **App/API/deploy:** arquitectura deseada, pero estado no verificado/pendiente en este checkout. Backend y frontend requieren implementación, contratos, pruebas integradas y URL pública antes de considerarse entregados.
6. **Mejoras fuera del mínimo actual:** LightGBM, AOI libre, comparador de zonas, y otros sensores/modelos; mantenerlas como futuras salvo evidencia de implementación.

## Plan de saneamiento documental

### P0 — antes de comunicar alcance o publicar datos

- Resolver y probar el cálculo de cobertura de `pipeline/support.py` (hallazgo 5).
- Declarar `PLAN.md` y secciones antiguas de `PLAN_MODULO_DATOS.md` como obsoletas o alinearlas al método vigente.
- Cerrar por escrito la métrica final y su criterio de selección.
- Corregir el resumen del producto para no afirmar que existe app desplegada ni cobertura 2026 si no hay evidencia.
- Crear contratos mínimos de datos y API, o retirar referencias a contratos todavía inexistentes.
- Elegir un solo procedimiento seguro de publicación a bucket.

### P1 — para dejar una fuente clara de verdad

- Actualizar el PDF a partir de los documentos vigentes y marcar versión/fecha.
- Completar responsables, estado real, dependencias y checklist de deploy.
- Registrar resultados de validación junto con commit, `config_hash`, fechas de entrada y archivos fuente.
- Añadir pruebas que cubran archivos anuales ausentes, cero focos con cobertura completa y fin de cobertura distinto de última detección.

## Inventario documental considerado

- Raíz: `README.md`.
- Planes y arquitectura: `documentacion/README.md`, `AREAS.md`, `ARQUITECTURA.md`, `PLAN.md`, `PLAN_MODULO_DATOS.md`, `PLAN_NORMALIZACION.md`.
- Áreas: `analisis/README.md`, `backend/README.md`, `frontend/README.md`, `pipeline/README.md`, `pitch/README.md`.
- Casos de uso: `casos de uso/README.md` y CU-01 a CU-10.
- Código contrastado: `config.yaml`, `requirements.txt`, `pipeline/` y `scripts/ejecutar_todo.sh`.
- Pendiente de contraste: `documentacion/Documentacion_Proyecto.pdf` y los datos/artefactos locales no versionados.
