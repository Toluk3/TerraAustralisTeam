# Terra Australis · frontend científico (`web/`)

Aplicación web estática (Vue 3 + Vite) para explorar la serie armonizada de focos de calor MODIS + VIIRS: landing, pantalla **Análisis** (mapa con comparación A | AB | B, ficha de la selección, calendario de quema, comparar años, FRP y calidad del dato), **Proyecto** (metodología) y **Equipo**. EduAustralis (la versión para escuelas, en `../frontend/`) es un enlace aparte.

No tiene backend: lee los JSON que genera `frontend/map/scripts/build_mocks.py` (contrato en [`../frontend/map/README.md`](../frontend/map/README.md)). Los números salen siempre de la serie armonizada (`n_equiv`); los focos se dibujan pero no se cuentan.

## Correrlo

Requiere Node ≥ 22.

```bash
cd web
npm install          # una vez
npm run dev          # http://localhost:5175
npm run build        # dist/ (los mock-* no se copian)
npm run preview      # sirve dist/ con los datos, en http://localhost:5175
npm test             # node --test tests/*.test.mjs
```

### Datos para desarrollar

Crear `web/.env.local` (no se versiona):

```bash
TERRA_DATA_DIR=C:/ruta/a/la/carpeta/que/contiene/mock-conosur
```

En `dev` y `preview`, Vite sirve `GET /mock-<nombre>/<ruta>.json` desde la primera carpeta que tenga el archivo entre `TERRA_DATA_DIR`, `../frontend/map/public` y `./public`; si no existe responde 404 (nunca el HTML de la app). La app usa la primera carpeta disponible en este orden: `VITE_MOCK_BASE`, `mock-s1`, `mock-conosur`, `mock-api`.

- **S1 (6 países, 2018–2025):** release [`datos-s1-2026-11-15`](https://github.com/Toluk3/TerraAustralisTeam/releases/tag/datos-s1-2026-11-15), archivo `S1_mapa_mock-s1.zip` (descomprimir en la carpeta de datos).
- **`mock-conosur` (2000–2025):** no trae `est/`, así que la ficha muestra "sin intervalo" en los meses convertidos de una selección. Es el comportamiento esperado.

## Variables

| Variable | Dónde | Para qué |
|---|---|---|
| `TERRA_DATA_DIR` | `.env.local` | Carpeta con `mock-*/` para `dev` y `preview` |
| `VITE_MOCK_BASE` | entorno al compilar | Carpeta de datos a usar primero (en producción: `mock-s1`) |

## Estructura

```
web/
  index.html            tema e idioma guardados se aplican antes de pintar
  vite.config.js        plugin que sirve los mock-* y avisa a la app qué carpetas existen
  public/               logo.webp, latam-outline.svg (npm run outline), team/ (fotos del equipo)
  scripts/make-outline.mjs   contorno de Latinoamérica desde ../zona/sudamerica_6.geojson
  docs/                 bocetos de la landing y de Análisis
  src/
    main.js router.js App.vue
    locales/            es.json, en.json
    styles/             tokens.css (claro/oscuro), base.css
    stores/             ui.js (idioma y tema), analysis.js (estado de Análisis)
    content/            team.js (integrantes), methodology.js (texto de Proyecto, ES y EN)
    features/
      dataset.js        loadDataset(), calendarRows()
      summaryLoader.js  createSummarizer(): ficha e histograma de FRP de una selección
      compareLogic.js   A − B, "diferencia no concluyente", resumen de zona
      useSummaries.js   cálculo de A y B para la ficha y los gráficos
      exportSummary.js  CSV y JSON de la ficha
      fire-map/         módulo del mapa copiado de frontend/map/src/map (con parches, ver abajo)
      timebar/          barra de tiempo original (sin uso: la app usa TimeSlider.vue)
    components/
      layout/           AppNavbar, AppFooter, MemberAvatar
      map/              FireMap, CompareMap, MapToolbar, MapLegend, FilterBar, LayerPanel, PeriodPicker, TimeSlider
      summary/          SelectionSummary
      charts/           useChart.js, BurnCalendar, YearCompare, FrpHistogram, DataQuality
    views/              HomeView, AnalysisView, ProjectView, TeamView
  tests/                summary, i18n, analysis-store, compare, summarizer
```

### Parches al módulo del mapa (`src/features/fire-map/`)

Copiado de `frontend/map/src/map/`. Cambios: opciones `ui: { legend, badges, panel }`, `labels` (textos del tooltip, del botón Lazo, de los mensajes de estado, de la atribución y del zoom) y `selectable`; API `setLabels()`, `selectCell()` y `jumpTo()` (cámara sincronizada); eventos `lasso` y `notice` (selección demasiado grande, error de carga); `bbox` en el evento `selection`; reexporta `CELLS, PUOR, FIRE, gradientCss`.

**Pendiente:** la leyenda, los carteles y el panel internos del módulo siguen en español, pero la app los oculta (`ui: false`) y dibuja los suyos traducidos.

## Pruebas

`npm test` corre, sin navegador:

- `summary.test.mjs`: cálculo del panel (copiado del módulo). Las dos pruebas con datos usan `$TERRA_DATA_DIR/mock-api` o `../frontend/map/public/mock-api` y se saltean si no existe.
- `i18n.test.mjs`: `es.json` y `en.json` con las mismas claves y parámetros; la metodología con la misma forma en los dos idiomas.
- `analysis-store.test.mjs`: `initAnalysis`, `setPeriod` (invierte rangos), `setCompare`, `setMode` (recentra la barra).
- `compare.test.mjs`: solape de intervalos, "diferencia no concluyente", límites 4–96 % de la barra.
- `summarizer.test.mjs`: `createSummarizer` contra una fuente falsa (valor, intervalo, FRP por familia, sin `est/`).

## Agregar un idioma

1. Copiar `src/locales/en.json` a `src/locales/<código>.json` y traducirlo (mismas claves y parámetros `{n}`, `{month}`…).
2. Sumarlo en `src/main.js` (`messages`) y en `LOCALES` de `src/stores/ui.js`; agregar el botón en `AppNavbar.vue` y el locale de `Intl` en `intlLocale()`.
3. Agregar la versión del texto de `src/content/methodology.js` y los `role`/`bio` de `src/content/team.js`.
4. Extender `tests/i18n.test.mjs` para comparar el nuevo archivo.

## Despliegue

`scripts/deploy_vps.sh` compila esta app con `VITE_MOCK_BASE=mock-s1`, la publica en la raíz del sitio (EduAustralis incluido, en `/#/edu`) y copia `mock-s1/` aparte. Detalle en [`../documentacion/DESPLIEGUE_VPS.md`](../documentacion/DESPLIEGUE_VPS.md).
