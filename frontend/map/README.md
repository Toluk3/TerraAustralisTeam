# Mapa y barra de tiempo

La aplicación ofrece dos modos sobre los productos estáticos del pipeline: explorar el mapa y comparar dos períodos con una cortina deslizable. Usa Vite, MapLibre GL, deck.gl y H3, sin backend. Los módulos de mapa y barra temporal se conectan en una línea:

```js
timebar.on('input', (periodo) => map.setPeriod(periodo));
```

- **Mapa** (`src/map/`): mapa open source con [MapLibre GL JS](https://maplibre.org) y mapas base de OpenStreetMap ([OpenFreeMap](https://openfreemap.org), sin clave). Encima, una capa de [deck.gl](https://deck.gl) intercalada en el mismo contexto WebGL (`MapboxOverlay`), alineada con el mapa al mover y hacer zoom.
- **Barra de tiempo** (`src/timebar/`): franja con el valor armonizado de la zona mes a mes y un cursor que se arrastra.

**Regla de producto:** los números salen siempre de la serie armonizada. Los puntos muestran dónde y cuándo hubo fuego, pero no se cuentan: VIIRS detecta ~4 veces más puntos que MODIS.

Al seleccionar una celda se puede consultar su serie mensual; al seleccionar un foco, se muestran FRP, temperatura de brillo, plataforma, confianza y huella nominal del píxel cuando estén disponibles. FRP es una potencia radiativa observada, no energía total ni área quemada. Los focos son observaciones satelitales; no equivalen a los valores calibrados de la serie.

## Mapa

| Capa | Qué es | Datos |
|---|---|---|
| Máscara | Oscurece todo lo que queda fuera de la zona analizada | `meta.outline` |
| Contorno | Límite de la zona | `meta.outline` |
| Celdas H3 | Valor **armonizado** (`n_equiv`, focos equivalentes Terra + Aqua) por celda. Color viridis en escala log, fija por resolución (`meta.map.domain`) para comparar meses y años | `map/res=<r>/<mes>` |
| Focos | Cada detección de FIRMS, con color y tamaño según FRP. Se filtran por fecha en la GPU y los más viejos de la ventana se desvanecen | `points/<mes>/<tesela>` |

- La resolución de las celdas cambia con el zoom de MapLibre: menos de 6 → r5 (≈ 250 km²), 6 a 8 → r6 (≈ 36 km²), 8 o más → r7 (≈ 5 km²). Equivale a la tabla de `ARQUITECTURA.md`, pensada para Google Maps, cuyo zoom es uno más para la misma escala.
- Las etiquetas del mapa base quedan encima de las celdas, y los focos encima de todo.

**Zonas grandes.** Las celdas se bajan por mes, y los focos en teselas H3 r2 (~86.000 km²) por mes, solo las que se ven en pantalla:
- Las teselas se cargan de la más cercana al centro a la más lejana, hasta `pointBudget` (400.000 focos por defecto). Si no entran todas, el mapa lo avisa.
- Si algún mes de la zona tiene más de 150.000 focos, `meta.points.min_zoom` vale 6 y los focos aparecen recién al acercar. Las celdas se ven siempre.
- Así funciona igual con Río Negro y Neuquén que con seis países (ver *Prueba con 6 países*).

### Comparar períodos

- Se eligen dos meses de la serie publicada. La cortina superpone mapas con cámara sincronizada; se puede arrastrar su divisor o enfocarlo y usar las flechas del teclado.
- Cada lado permite elegir una fecha dentro del mes. Los focos se filtran desde esa fecha hacia atrás hasta ocho días (menos al comienzo del mes); las celdas H3 siguen mostrando el valor armonizado mensual.
- El mapa conserva sus avisos de cobertura, períodos estimados y ausencia de focos. La ausencia de una detección no demuestra que no haya habido fuego.

### Detalle científico

- El clic en una celda abre su serie de valores mensuales armonizados (últimos 24 meses disponibles hasta el período elegido); los meses sin fila publicada se muestran como huecos, nunca como ceros implícitos.
- El clic en una detección muestra FRP (MW), temperatura de brillo media/térmica (K), sensor, plataforma, hora, confianza y dimensiones `scan × track` cuando esos valores existan. También grafica la FRP media observada por mes en la celda H3 (hasta 12 meses), sin armonizar sensores.
- `scan × track` describe la huella nominal del píxel FIRMS, no superficie quemada. FRP no es energía acumulada y una detección no confirma por sí sola un incendio.

### Mapas base

| Clave | Fuente | Nota |
|---|---|---|
| `claro` (por defecto) | OpenFreeMap Positron | El que mejor contrasta con viridis |
| `calles` | OpenFreeMap Liberty | Rutas y localidades con más detalle |
| `oscuro` | OpenFreeMap Dark | |
| `satelite` | Esri World Imagery | Muestra las cicatrices de los incendios. Uso libre con atribución en proyectos no comerciales |

También acepta la URL o el objeto de cualquier estilo de MapLibre.

## Barra de tiempo

- **Modo Mes:** todos los meses de la serie. Al arrastrar, el cursor se ajusta al mes más cercano y el período es ese mes.
- **Modo Día:** los días de un año (‹ › cambian de año). El período es la ventana de 8 días que termina en el cursor y el valor que se muestra es el de la ventana de 8 días de la serie, no el de un día suelto, porque la guía MODIS advierte sesgos en series de menos de ~8 días. En el mapa, los focos más viejos de la ventana se desvanecen.
- **Franja:** pintada con la misma rampa que las celdas. Las marcas naranjas arriba son meses con cobertura reducida, y la línea punteada abajo indica que desde `switch_date` el valor es estimado.
- **Lectura junto al cursor:** valor armonizado, banda p05–p95 (si es mayor que medio foco), anomalía contra la mediana del mes (si la mediana es 0, la diferencia absoluta) y las marcas *estimado* y *cobertura reducida*.
- **Teclado:** el cursor es un `role="slider"`. ← → mueven un paso, Re Pág / Av Pág 12 meses u 8 días, Inicio / Fin van a los extremos y la barra espaciadora reproduce o pausa.
- **Eventos:** `input` sale mientras se arrastra (una vez por cuadro y solo si cambió el período); `change` sale al soltar, con teclado o al reproducir.

```js
const tb = await createTimebar(el, { source, value: { from: '2025-02' }, mode: 'month', windowDays: 8 });
tb.on('input', (p) => map.setPeriod(p));   // p = { from: '2025-02', to: '2025-02' } o con días
tb.setValue({ from: '2016-12' });          // mover el cursor desde afuera (no emite eventos)
tb.setMode('day');  tb.play();  tb.pause();  tb.getValue();  tb.destroy();
```

## Correrlo

```bash
cd frontend/map
npm install
python scripts/build_mocks.py      # con el venv del pipeline (necesita duckdb y numpy); lee data/publish/
npm run dev                        # http://localhost:5173
```

- `index.html`: la aplicación con selección de modo, mapa exploratorio, cortina de comparación y detalle científico. Desde la consola se pueden usar `window.fireMap`, `window.timebar` y `window.fireMapCompare`. Con `?datos=mock-s1` usa otra carpeta de `public/` (otra salida de `build_mocks.py`).
- `capas-sin-mapa.html`: las mismas capas con deck.gl solo, sin mapa base. Muestra los datos "en plano" y no depende de las teselas de internet.

## Uso del mapa desde la app

```js
import { createFireMap, createStaticSource, createApiSource, basemapOptions } from './map/index.js';

const map = await createFireMap(document.getElementById('mapa'), {
  source: createApiSource('/api'),                   // o createStaticSource('/mock-api')
  basemap: 'claro',                                  // claro | calles | oscuro | satelite | URL de estilo
  period: { from: '2025-02' },
  pointBudget: 400000,                               // opcional
});

map.setPeriod({ from: '2025-01', to: '2025-02' });        // meses enteros
map.setPeriod({ from: '2025-01-28', to: '2025-02-04' });  // ventana de días
map.setMetric('anomaly');        // 'value' | 'anomaly' (solo con un mes)
map.setHexOpacity(0.5);
map.setLayerVisible('points', false);   // 'cells' | 'points' | 'outline' | 'mask'
map.setBasemap('satelite');
map.setFadeOldPoints(true);
map.fitZone();
map.getState();                  // { period, res, metric, estimated, cells, points: {tiles, loaded, periodVisible, zoomedOut, truncated} }

map.on('click', (info) => …);    // { kind: 'cell', cell, res, total, monthlyMean, anomaly } o { kind: 'point', lat, lon, frp, sensor, … }
map.on('hover' | 'change' | 'resolution' | 'error', …);
map.destroy();
```

`map.map` es el `maplibregl.Map` y `map.overlay`, el `MapboxOverlay`.

## Datos que esperan (propuesta para `CONTRATO_API.md`)

Todo en JSON **columnar** (un arreglo por columna más `length`): deck.gl lo lee por índice sin armar objetos, y pesa la mitad. `mes` es siempre `YYYY-MM`.

| Endpoint | Archivo mock | Respuesta |
|---|---|---|
| `GET /api/meta` | `meta.json` | `{ zone, outline (GeoJSON), switch_date, coverage: {from, to}, reduced_coverage_months, dataset_version, config_hash, attribution, map: {resolutions, domain: {5, 6, 7}, months[]}, points: {tile_res, min_zoom, max_month, months[]} }` |
| `GET /api/calendar` | `calendar.json` | `{ length, year[], month[], n_equiv[], p05[], p95[], coverage_frac[], status[], median[], anomaly_abs[], anomaly_pct[], pct_rank[] }`: una fila por mes, sin huecos (`zone/calendar.parquet`) |
| `GET /api/timeline?step=8d` | `timeline_8d.json` | `{ length, year[], period_8d[], period_start[], n_equiv[], p05[], p95[], coverage_frac[], status[], median[], anomaly_pct[] }` (`zone/timeline_8d.parquet`) |
| `GET /api/map?res=5\|6\|7&month=` | `map/res=<r>/<mes>.json` | `{ res, month, length, cell[], n_equiv[], anomaly_pct[] }`: solo las celdas con valor mayor a 0 |
| `GET /api/map/series?res=&tile=` | `series/res=<r>/<tesela-r2>.json` | `{ res, tile, length, cell[], month[], n_equiv[] }`: historial mensual compacto de las celdas de una tesela H3 r2 |
| `GET /api/points/index?month=` | `points/<mes>/index.json` | `{ month, tile_res: 2, tiles: { <h3 r2>: cantidad } }` |
| `GET /api/points?month=&tile=` | `points/<mes>/<tesela>.json` | `{ month, tile, length, lat[], lon[], t[], d[], frp[], t_mir[], t_tir[], scan[], track[], day[], platform[], conf[] }` |

- **`cell` y `tile`** van como **string hex** de H3 (`"87c365c72ffffff"`). Como número no entran en un `Number` de JavaScript (superan 2^53). En DuckDB: `lower(hex(cell))`, y para la tesela, `lower(hex(h3_latlng_to_cell(latitude, longitude, 2)))`.
- **`meta.map.domain`** es el percentil 99 de los valores mensuales de cada resolución, para que la escala de color sea la misma en todos los meses.
- La serie histórica por celda se agrupa en teselas H3 r2; al abrir un detalle se descarga solo la tesela de esa celda, no todos los JSON mensuales del mapa.
- La FRP media mensual del detalle se calcula solo con las detecciones FIRMS dentro de la celda elegida. No es una métrica armonizada ni una energía acumulada; cambios de sensor o cobertura pueden afectar la comparación.
- **Los focos van por mes de la fecha local solar (`local_date`).**
  - `t` son los segundos UTC desde 1970.
  - `d` es `local_date` en días desde 1970-01-01, y es lo que usa el filtro de fecha.
  - `t_mir` y `t_tir` son temperaturas de brillo en kelvin; `scan` y `track` son dimensiones nominales del píxel en kilómetros. Los campos pueden ser nulos según el producto.
  - `day` vale 1 o 0.
  - El sensor se deduce de `platform` (terra/aqua = MODIS, el resto = VIIRS).
- Un mes o tesela sin datos puede devolver 404: el módulo lo toma como vacío.

`scripts/build_mocks.py` genera todo esto desde una carpeta `publish/` del pipeline, con las mismas consultas que tendría que hacer el backend:

```bash
python frontend/map/scripts/build_mocks.py --publish data/lotes/S1/publish --out frontend/map/public/mock-s1
```

## Prueba con 6 países

Muestra **S1**: Argentina, Chile, Uruguay, Brasil, Paraguay y Bolivia, de 2018 a 2025 (tiene el solape MODIS + VIIRS 2018–2021 que necesita la calibración y los años estimados 2022–2025).

```bash
for p in Argentina Chile Uruguay Brazil Paraguay Bolivia; do python scripts/descargar_firms.py --paises $p --anios 2018-2025; done   # ~3,1 GB
python scripts/descargar_paises.py ARG CHL URY BRA PRY BOL --salida zona/sudamerica_6.geojson
python -m pipeline all --config lotes/S1_sudamerica.yaml
python frontend/map/scripts/build_mocks.py --publish data/lotes/S1/publish --out frontend/map/public/mock-s1
# http://localhost:5173/?datos=mock-s1
```

## Limitaciones conocidas

- **`anomaly_pct` por celda casi siempre es `null`:** en r6 y r7 la mediana mensual de una celda suele ser 0, y esas celdas se pintan en gris. La anomalía útil es la de la zona entera, que es la que muestra la barra de tiempo.
- **Focos sin celda:** algún foco puede aparecer sin hexágono debajo. Pasa cuando lo detectó una plataforma que no es la de la serie en ese período (por ejemplo, S-NPP cuando la serie usa NOAA-20). Es correcto: la celda es la serie armonizada.
- **Mapa base externo:** las teselas vienen de OpenFreeMap y Esri. Sin internet, el mapa base queda vacío, pero las capas se siguen dibujando.
- **Períodos largos:** las celdas de un período de más de 36 meses se calculan con los últimos 36 (`maxCellMonths`), y el mapa lo avisa.
- **Campos científicos adicionales:** volver a ejecutar la exportación del pipeline y `scripts/build_mocks.py` para que la publicación de puntos incluya `t_mir_k`, `t_tir_k`, `scan_km` y `track_km`. Las publicaciones anteriores pueden seguir mostrando FRP, pero esos atributos nuevos no estarán disponibles hasta regenerarlas.
- **deck.gl 9.4.0:** se usa esa versión porque la 9.1 (luma.gl 9.1.10) falla en Vite con `Cannot set properties of undefined (setting 'adapter')`.
