# Registro: corrida S1 con el pipeline corregido y mapa de 6 países

Fecha: 2026-11-15 · Base: `main` en `6748b12` (incluye las correcciones de la auditoría y los pesos `n_clusters_det`).

Este registro explica qué se corrió, qué se corrigió y dónde están los datos ya procesados, para que cualquier persona (o agente) pueda seguir desde acá sin repetir el trabajo.

## Resumen

1. Se volvió a correr la muestra **S1** (Argentina, Chile, Uruguay, Brasil, Paraguay y Bolivia, 2018–2025) con el pipeline corregido.
2. Se corrigió un error de memoria en `pipeline/export.py` que impedía terminar `export` en zonas grandes.
3. Se corrigió la máscara del mapa, que tapaba países enteros cuando la zona tiene varios países.
4. Los datos procesados se publicaron como adjuntos de un release de GitHub, para usar el mapa sin correr el pipeline.

## 1. Corrida S1

```bash
python -m pipeline all --config lotes/S1_sudamerica.yaml
python frontend/map/scripts/build_mocks.py --publish data/lotes/S1/publish --out frontend/map/public/mock-s1
```

- **Datos de entrada:** CSV anuales por país de FIRMS (`scripts/descargar_firms.py`): MODIS y VIIRS NOAA-20, 2018–2025. Zona: `zona/sudamerica_6.geojson` (versionada en este cambio).
- **NOAA-21 no está:** FIRMS no publica `viirs-jpss2` en el archivo por país (devuelve 404 para 2024 y 2025). El pipeline lo tolera: NOAA-21 usa el `k` de NOAA-20 (`k_fallback_platform`) y en S1 simplemente no aparece.
- **`config_hash`:** `e2d62e56e310` · métrica `n_clusters_det` · referencia Terra + Aqua · `switch_date` 2022-01-01.
- **Tiempos (PC local, 12,5 GB de RAM para DuckDB):** ingest 4 min, normalize 16 min, zone 8 min, export 1,5 min; el resto, menos de 3 min por paso. Unos 35 min en total.

| Paso | Resultado |
|---|---|
| ingest | 144 archivos, 38,2 M filas |
| normalize | MODIS 4,48 M → 4,16 M · VIIRS 33,75 M → 30,38 M |
| aggregate | 16,9 M filas diarias, 34,5 M focos |
| detect | pesos de detectabilidad globales + 39 regiones |
| calibrate | ventanas: NOAA-20 2018-04-01 a 2021-12-31, Terra 2018–2019 |
| zone | 2,69 M celdas r7 |
| export | publicación de 714 MB |

**Validación (NOAA-20 contra MODIS, `reportes/ablacion.csv`):**

| Variante | Sesgo relativo | NMAE | Correlación | Pred/obs |
|---|---|---|---|---|
| sin corrección | +262 % | 0,395 | 0,966 | 3,62 |
| `k_region_mes` (mejor NMAE) | +0,6 % | 0,060 | 0,978 | 1,006 |
| `k_region_mes_dianoche_clusters_det` (configurada) | +0,05 % | 0,064 | 0,984 | 1,000 |

`k` global de NOAA-20: 0,44 de día y 0,29 de noche. Pasa los criterios de `validate` (día y día/noche entre 0,9 y 1,1, sesgo < 10 %, ningún estrato nocturno fuera de 0,85–1,15).

**Límites de S1 (no usar como resultado final):**
- Empieza en 2018: el período base de la mediana (`baseline_years: [2003, 2021]`) queda reducido a 2018–2021, así que las anomalías salen de 4 años.
- El ajuste Terra → referencia usa solo 2018–2019 (`terra_fit_to`).
- `points/` tiene una carpeta `year=2017` con 27 focos (probablemente del 31/12/2017 en UTC que caen en 2018 por fecha local, o al revés). No se revisó.
- Los lotes L1–L6 **no** se volvieron a correr: necesitan datos de todo el mundo desde 2000. Los resúmenes de `lotes/resumen/` siguen siendo de antes de las correcciones.

## 2. Corrección: `export` se quedaba sin memoria (`pipeline/export.py`)

**Síntoma:** en S1, `export` llenaba el directorio temporal de DuckDB (110 GB) y terminaba con `OutOfMemoryException`. La corrida anterior de S1 había quedado en el mismo punto, con 97 GB de temporal colgado.

**Causa:** la consulta de `map/res=<r>` calculaba la mediana por celda y mes armando una grilla completa celda × mes base (`CROSS JOIN`). Con 2,69 M celdas × 48 meses son ~130 M filas y ~32 M grupos de `median`, que no entran en memoria.

**Arreglo:** misma mediana, sin la grilla. Para cada celda y mes se juntan solo los valores > 0 de los meses base y se completan con tantos ceros como meses base falten (`list_resize`), y la mediana se calcula sobre esa lista (`list_aggregate(..., 'median')`). Da exactamente el mismo valor (se comprobó contra `median()`), y las celdas sin focos en el período base siguen sin anomalía, igual que antes (la mediana era 0 y la anomalía se omite cuando la mediana no es > 0).

Resultado: `export` de S1 pasa de no terminar a 96 s. Los 46 tests pasan.

## 3. Corrección: el mapa tapaba países (`frontend/map/src/map/layers.js`)

**Síntoma:** con la zona de 6 países, Uruguay y parte de Paraguay quedaban oscurecidos por la máscara, como si estuvieran fuera de la zona.

**Causa:** la máscara era un polígono (una caja) con cada país como agujero. Los países comparten fronteras, y la triangulación (earcut) no admite agujeros que se tocan: genera triángulos que tapan países enteros.

**Arreglo:** la máscara usa ahora la `MaskExtension` de deck.gl con `maskInverted: true`. La caja se pinta en todas partes salvo donde está la zona, que se dibuja como capa de máscara (`operation: 'mask'`). `maskLayer()` devuelve **dos capas** y se usa con `...maskLayer(...)` (`src/map/index.js` y `capas-sin-mapa.html`).

Detalle importante: la capa de máscara tiene que tener el **mismo `beforeId`** que la caja. En el modo intercalado de MapLibre (`MapboxOverlay` con `interleaved: true`), deck.gl dibuja las capas agrupadas por `beforeId`; si la máscara queda en otro grupo, la caja oscurece todo.

Se verificó en el navegador: los 6 países se ven sin máscara, las fronteras se ven con el mapa oscuro, y al acercar se cargan los focos (septiembre de 2024 sobre Bolivia: 390 mil focos, celdas r6).

## 4. Datos ya procesados (sin correr el pipeline)

Están en el release [`datos-s1-2026-11-15`](https://github.com/Toluk3/TerraAustralisTeam/releases/tag/datos-s1-2026-11-15):

| Archivo | Contenido | Para qué |
|---|---|---|
| `S1_mapa_mock-s1.zip` | JSON del mapa (`frontend/map/public/mock-s1/`, 2,2 GB descomprimido) | Ver el mapa directamente |
| `S1_publish.zip` | Publicación del pipeline (`data/lotes/S1/publish/`, Parquet, 714 MB): serie por celda, `k`, mapa, focos, calendario de la zona, reportes y `meta/version.json` | Análisis, o regenerar los JSON con `build_mocks.py` |

El repo es privado: se descarga desde el navegador con una sesión de GitHub que tenga acceso, o con GitHub CLI:

```bash
gh release download datos-s1-2026-11-15 --repo Toluk3/TerraAustralisTeam --pattern "S1_mapa_mock-s1.zip"
```

Ver el mapa:

```bash
cd frontend/map
npm install
# descomprimir S1_mapa_mock-s1.zip dentro de frontend/map/public/ (queda public/mock-s1/)
npm run dev
# http://localhost:5173/?datos=mock-s1
```

Regenerar los JSON desde la publicación (necesita el venv del pipeline):

```bash
# descomprimir S1_publish.zip dentro de data/lotes/S1/ (queda data/lotes/S1/publish/)
python frontend/map/scripts/build_mocks.py --publish data/lotes/S1/publish --out frontend/map/public/mock-s1
```

`public/mock-s1/` y `data/` no se versionan (`.gitignore`).

## Pendiente

- Correr el pipeline desde 2000 (o al menos 2003) para tener una mediana robusta y el ajuste completo de Terra.
- Volver a correr L1–L6 con el pipeline corregido (requiere los datos globales de FIRMS).
- Revisar la carpeta `year=2017` de `points/`.
- Decidir si el mapa debe abrir con S1 por defecto (hoy hace falta `?datos=mock-s1`).
