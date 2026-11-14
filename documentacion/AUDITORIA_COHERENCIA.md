# Auditoría de cambios entre propuesta e implementación

**Repositorio:** `Toluk3/TerraAustralisTeam`  
**Rama revisada:** `main`  
**Base de revisión:** `0f35648cc5845fcae887ff4b0291edd284255b52`  
**Propósito:** comparar las propuestas del proyecto con las decisiones que realmente se implementaron en el código y los artefactos versionados. No se toma la mera ausencia de un componente no desplegado como una “incoherencia”: se distingue entre cambios de rumbo, entregables incompletos y despliegues que no pueden verificarse desde este repositorio.

## Resumen

El producto actual tomó un rumbo diferente al stack de despliegue que proponía `documentacion/ARQUITECTURA.md`: el frontend del mapa es una SPA de **Vite + MapLibre + deck.gl**, consume JSON estáticos generados desde la publicación del pipeline y tiene un adaptador opcional preparado para una API. En el repositorio no aparece implementación de Django, API, Docker/Cloud Run ni configuración de despliegue. Por eso, la arquitectura Django/Cloud Run no describe el camino que el código del frontend está siguiendo hoy.

En armonización, la propuesta inicial de `documentacion/PLAN.md` menciona LightGBM como mejora y propone una estrategia preliminar diferente. La implementación versionada usa **DuckDB + H3 y factores de calibración `k` con cociente de sumas**, además de bootstrap; LightGBM no está implementado ni figura en las dependencias. Esto no es simplemente un archivo “faltante”: `PLAN_NORMALIZACION.md` lo posterga expresamente a P2 por el solape insuficiente de NOAA-20. La decisión es razonable, pero el estado final debe quedar explícito y no mezclarse con la propuesta inicial como si ambas fueran simultáneas.

El core del pipeline sí está implementado. También existe una demo frontend real, pero el código versionado la configura por defecto para usar mocks/JSON estáticos; no hay evidencia en el repositorio que permita afirmar que una aplicación pública esté desplegada. Tampoco se versionan los datos publicados que la demo necesita para generarlos.

## 1. Cambios reales de rumbo: propuesta frente a implementación

| Tema | Propuesta documentada | Implementación versionada en `main` | Lectura correcta |
|---|---|---|---|
| **Backend y despliegue** | `ARQUITECTURA.md` propone Django + DuckDB en Cloud Run, Parquet en Cloud Storage y frontend servido por Django o Firebase Hosting. | No hay código Django, `manage.py`, Dockerfile, configuración de Cloud Run ni workflow/config de deploy. `frontend/map` incluye `createStaticSource()` para JSON y `createApiSource()` como adaptador. | El backend Django/Cloud Run es una arquitectura propuesta, no una parte implementada que se pueda auditar como desplegada. El flujo que sí está codificado en el mapa es compatible con publicación estática; la API es solo una opción de integración futura. |
| **Frontend y mapa** | `PLAN.md` describe Streamlit + Folium/Plotly; `ARQUITECTURA.md` propone Google Maps + deck.gl y deja framework del front abierto. | `frontend/map/package.json` usa Vite, MapLibre GL, deck.gl y `h3-js`; el README declara mapas base OpenFreeMap/OSM y Esri. No se usa Google Maps. | Hay dos propuestas sucesivas y una implementación tercera. La decisión efectiva es MapLibre + deck.gl; actualizar `ARQUITECTURA.md` para no presentar Google Maps como stack acordado/actual. |
| **Transporte de datos al front** | `ARQUITECTURA.md` plantea endpoints `/api/meta`, `/api/calendar`, `/api/timeline`, `/api/map`, `/api/points`; Cloud Storage guarda Parquet y Django los consulta. | `frontend/map/scripts/build_mocks.py` transforma un `publish/` del pipeline en JSON columnar estático por mes/tesela. `.env.example` tiene `VITE_DATA_SOURCE=mock` como valor inicial; la página de demo usa esa fuente por defecto. | La ruta funcional prevista por el frontend es generar artefactos JSON y servirlos como estáticos. No hay un backend en el repo que implemente los endpoints de arquitectura. |
| **Armonización / LightGBM** | `PLAN.md` incluye ratio base y menciona LightGBM como mejora para usar FRP, densidad y estación. | `pipeline/calibrate.py` ajusta factores `k` por estratos con cociente de sumas; usa bootstrap. `requirements.txt` no incluye LightGBM ni scikit-learn. | LightGBM no se implementó. `PLAN_NORMALIZACION.md` lo posterga a P2, y `PLAN_ANALISIS_LOTES.md` dice que se descarta S-NPP y se calibra solo con NOAA-20 por la longitud del solape. Es un cambio metodológico documentado, pero falta alinear el plan general y la narrativa final con la decisión. |
| **Métrica y espacio** | `PLAN.md` propone celdas aproximadas de 1 km y calibración por celdas de 0,5°; `PLAN_MODULO_DATOS.md` inicialmente deja resolución y métrica abiertas. | Se implementan H3 r8/r7/r3/r2 y métricas `n_fires`, `n_clusters`, `n_clusters_r7`; la configuración de los lotes usa `n_clusters`. | El diseño H3 y la comparación de métricas reemplazan la propuesta inicial; `PLAN_NORMALIZACION.md` documenta el cambio. Falta que la elección final de `n_clusters` quede aprobada una sola vez y reflejada en el estado de todos los documentos. |
| **Sensores usados para calibrar** | `PLAN.md` pone énfasis en MODIS + VIIRS, particularmente S-NPP desde 2012; `PLAN_MODULO_DATOS.md` registra S-NPP como descargado. | `PLAN_ANALISIS_LOTES.md` toma la decisión de descartar S-NPP para el análisis por lotes y usar NOAA-20 (2018–2021). Las configuraciones versionadas mantienen S-NPP en `platform_periods`/`viirs_priority`; la documentación de descargas también lo incluye. | La decisión sobre S-NPP no está propagada de forma inequívoca a todas las configuraciones y documentos. Aclarar si se excluye solo el ZIP de formato problemático o toda plataforma S-NPP de la calibración y de la serie final. |
| **Cobertura geográfica** | `PLAN.md` menciona como sugerencias AOI dibujada o coordenadas; propone Argentina completa como base de calibración y zona fija para el mínimo. | La demo principal usa Río Negro y Neuquén. El frontend/documentación de lotes incluye además una muestra S1 de seis países. | El alcance de la demo fija es coherente con la arquitectura final. S1 es una prueba de escala/alcance experimental, no prueba de que la aplicación principal permita elegir cualquier AOI. |

## 2. Qué está implementado y qué estado puede afirmarse

### Implementado según código y artefactos versionados

- Pipeline Python con pasos ingestión, normalización, soporte/calendario, agregación, calibración, rollups, validación, QC, zona y export (`pipeline/__main__.py`).
- Normalización, H3, tres métricas, calibración `k`, bootstrap, cambio de referencia a VIIRS en `switch_date`, series mensual/8 días y export de Parquet (`pipeline/`, `config.yaml`).
- Pruebas automáticas del pipeline; el README actualizado declara 33 pruebas.
- Frontend de mapa y barra temporal en `frontend/map`: MapLibre + deck.gl, capas H3/puntos, selector de período, modo mensual/diario, reproducción y controles de capas.
- Generador de JSON estáticos desde la publicación del pipeline (`frontend/map/scripts/build_mocks.py`).
- Evidencia versionada de ejecuciones de lotes L1, L2 y L3 en `lotes/resumen/`; no demuestra por sí sola que todos los análisis previstos o un despliegue estén terminados.

### No verificable como desplegado desde el repositorio

No se encontró URL pública, configuración de hosting/build de producción, pipeline de deploy, backend desplegable ni artefactos `public/mock-api`/datos de producción versionados. La configuración de front parte de `mock`, pero la carpeta generada de mocks y los datos están fuera del árbol versionado/ignorados. Por eso, lo preciso es decir **“el repo contiene una demo frontend ejecutable localmente si se generan los datos/mocks”**. No puedo confirmar ni negar un deploy externo que no esté referenciado aquí.

## 3. Alcance inicial del producto que todavía no está cubierto por la demo del mapa

`PLAN.md` pide calendario año × mes, anomalías, indicadores, series temporales y descargas CSV/PNG además del mapa. En el frontend versionado se observan el mapa y la barra temporal con lectura de valor/anomalía; no se ve una pantalla completa con todos esos entregables. En particular, no aparecen implementados en `frontend/map`:

- heatmap/calendario anual por mes como componente independiente;
- tablero de indicadores de total, mes pico y año récord;
- gráficos de totales anuales y ciclo estacional con percentiles;
- descarga de focos/calendario en CSV y calendario PNG;
- interfaz bilingüe.

La comparación/anomalía por celda está contemplada en la capa del mapa. La descarga PNG e idioma ya aparecían como extras en la propuesta, no deben confundirse con requisitos centrales si el equipo recortó alcance.

La barra tiene controles de teclado documentados y existe un modo de 8 días, alineados con parte de la intención de accesibilidad y resolución temporal. El paso “diario” visualiza una ventana de 8 días, no observaciones diarias comparables; la interfaz debe mantener esa explicación.

## 4. Falencias de coherencia/ejecución que sí conviene resolver

### 4.1 Documentación de stack desactualizada

- `PLAN.md` aún contiene propuestas Streamlit/Folium y stack inicial, aunque ahora advierte que su sección de arquitectura está desactualizada.
- `ARQUITECTURA.md` sigue marcando Django, Cloud Run, Cloud Storage y Google Maps como decisiones acordadas, aunque el código de front cambió a MapLibre/JSON estático y no hay implementación del backend.
- La sección 5 de arquitectura se describe como borrador; `backend/README.md` y `documentacion/README.md` todavía anuncian contratos por escribir.

**Acción:** actualizar `ARQUITECTURA.md` con dos diagramas/estados explícitos: flujo implementado actual (pipeline → export → generador JSON → hosting estático) y arquitectura API/Django solo si realmente se decide construirla.

### 4.2 Método y datos de S-NPP con fuentes de verdad en conflicto

`PLAN_ANALISIS_LOTES.md` decide que la calibración de esos lotes usa NOAA-20 y que S-NPP se descarta; `PLAN_MODULO_DATOS.md`, `PLAN.md`, CU-01 y algunas configuraciones aún cuentan con S-NPP disponible o lo incluyen en la prioridad de plataformas. Esto puede cambiar qué sensores se usan en la serie y en la validación.

**Acción:** establecer en `config.yaml`/configs de lote una selección explícita de plataformas habilitadas; documentar qué archivos S-NPP se excluyen y por qué; regenerar los resultados después de fijar esa decisión. No afirmar que la calibración usa “MODIS + todos los VIIRS” si las corridas finales se restringen a NOAA-20.

### 4.3 Requisitos de la propuesta inicial fuera de la demo actual

El alcance de app descrito por `PLAN.md` es mayor que los componentes visibles en `frontend/map`. El mapa y la barra no equivalen al tablero/calendario completo ni a las descargas prometidas.

**Acción:** cerrar un checklist de aceptación producto por producto: implementado en la demo, postergado por decisión o faltante. Actualizar pitch/README para no vender pantallas o exportaciones que no estén disponibles.

### 4.4 Cobertura inferida a partir de detecciones

El plan de datos promete distinguir cero de falta de datos. En `pipeline/support.py`, los rangos de datos disponibles se derivan de años/fechas que aparecen en `fires_norm`; un año sin filas puede quedar sin rango de datos y el fin del último período queda ligado a la última detección. La ausencia de focos no necesariamente prueba ausencia de cobertura.

**Acción:** usar metadatos de disponibilidad/completitud de archivos por plataforma y período, y distinguir archivo completo con cero detecciones de archivo ausente/incompleto. Añadir pruebas para esos tres casos antes de tratar la cobertura como definitiva.

### 4.5 Contrato de JSON/API no cerrado

El frontend ya necesita un esquema concreto de JSON columnar y una estructura por mes/tesela (`frontend/map/README.md`), mientras `CONTRATO_API.md` no existe y el contrato API de arquitectura propone rutas/parámetros distintos. El generador de mocks es hoy una interfaz de hecho, pero no está declarado como contrato versionado.

**Acción:** elegir una sola interfaz para el despliegue actual: archivos JSON estáticos o API. Documentar campos, formatos H3, particionado, 404/vacío, versionado y compatibilidad; probar mocks y fuente API contra el mismo conjunto de fixtures.

### 4.6 No hay tests de integración frontend ni deploy reproducible

`frontend/map/package.json` ofrece `dev`, `build`, `preview` y `mocks`, sin script de pruebas. El repositorio tampoco muestra un workflow o instrucciones de hosting de producción verificables.

**Acción:** agregar al menos build/test automatizado y un despliegue repetible que genere mocks a partir del `publish/` identificado por versión/hash; registrar URL y commit desplegado.

## 5. Qué debería decir hoy la fuente de verdad

Hasta una decisión técnica posterior, describir el estado así:

> El pipeline de datos MODIS/VIIRS está implementado en Python + DuckDB + H3 y genera productos Parquet. La demo frontend del mapa está implementada como SPA Vite con MapLibre/deck.gl y puede consumir JSON estáticos generados desde esos productos; también tiene un adaptador de cliente para una API futura. No hay backend Django/Cloud Run implementado en este repositorio. La calibración en uso es el método de factores `k` y bootstrap; LightGBM quedó postergado, no forma parte del método entregado. El repositorio no contiene evidencia suficiente para confirmar una URL de producción.

## 6. Si se despliega la versión implementada hoy

La línea de menor cambio es **hosting estático**, no desplegar Django que todavía no existe:

1. Ejecutar pipeline con la configuración aprobada y guardar `data/publish/meta/version.json` como referencia de versión.
2. Generar los mocks del front desde ese `publish/` hacia `frontend/map/public/mock-api` con `frontend/map/scripts/build_mocks.py`.
3. Ejecutar `npm ci` y `npm run build` en `frontend/map`; publicar el contenido generado de `dist/` en un hosting estático (Firebase Hosting es compatible con la opción ya mencionada en la arquitectura, o equivalente).
4. Configurar fallback SPA solo si se agregan rutas; comprobar que `mock-api/` se sirve como assets estáticos y que funciona el mapa base externo.
5. Registrar la URL, el commit y el `config_hash` del dataset publicado. Probar una ruta de cada tipo: meta, calendario, celdas y teselas de focos.

Esto despliega la demo MapLibre basada en JSON; **no** satisface el plan API Django/Cloud Run. Para seguir ese otro plan se debe construir primero Django/endpoints, acordar el contrato, dar acceso del servicio a los datos del bucket y conectar `VITE_DATA_SOURCE=api` con la URL correcta (CORS o mismo dominio/proxy), después desplegar API y front y correr una prueba end-to-end.

## 7. Propuestas encontradas en el repositorio

La auditoría consideró todas las propuestas identificadas en el árbol de `main`, no solo los archivos con nombre `PLAN`:

- `documentacion/PLAN.md`: producto, experiencia y enfoque inicial, incluidos Streamlit/LightGBM.
- `documentacion/ARQUITECTURA.md`: propuesta de arquitectura y despliegue Django/Cloud Run/Google Maps/GCS.
- `documentacion/PLAN_MODULO_DATOS.md`: sprints/decisiones tempranas de ingesta, limpieza, H3, agregación y armonización.
- `documentacion/PLAN_NORMALIZACION.md`: metodología refinada y prioridades; pospone LightGBM.
- `documentacion/PLAN_ANALISIS_LOTES.md`: análisis regional por lotes y decisión de no usar S-NPP para esa campaña de análisis.
- `frontend/README.md`, `frontend/map/README.md`: especificación funcional concreta del mapa, la barra y el formato de datos estático/API.
- `backend/README.md`, `analisis/README.md`, `pipeline/README.md`, `pitch/README.md`, `documentacion/AREAS.md` y casos de uso: entregables por área, flujos y tareas; varios siguen siendo checklist/propuesta, no evidencia de despliegue.

El PDF `documentacion/Documentacion_Proyecto.pdf` también está en el árbol, pero no se comparó visualmente en esta auditoría. Debe actualizarse contra la fuente de verdad anterior si contiene diagramas o stack antiguos.

## Acciones recomendadas, en orden

1. **Hoy:** corregir `ARQUITECTURA.md` para que describa el camino real MapLibre + JSON estático y marque Django/API como no implementados o futuro.
2. **Hoy:** resolver S-NPP para el pipeline principal y los lotes, y congelar `metric`/referencia de la corrida que se presentará.
3. **Antes de publicar:** arreglar/validar el cálculo de cobertura con fuentes de completitud, no solo presencia de focos.
4. **Antes de decir “deployado”:** generar mocks de la versión elegida, construir y publicar el frontend; registrar URL, commit y `config_hash`.
5. **Para cerrar el alcance inicial:** implementar las vistas/descargas del plan que se mantengan en alcance, o declararlas explícitamente postergadas y ajustar la presentación.
6. **Después:** construir la API Django/Cloud Run solo si el equipo todavía la necesita; no es requisito para publicar una demo estática que use el flujo actual.
