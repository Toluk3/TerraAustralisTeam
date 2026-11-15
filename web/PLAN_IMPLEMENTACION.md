# Plan de implementación: frontend científico de Terra Australis (`web/`)

Este documento está escrito para que **una IA (Claude Code u otra) lo ejecute de punta a punta**. Cada tarea indica archivos, comportamiento esperado y cómo comprobarlo. Hacerlas **en orden**; no pasar a la siguiente sin cumplir el criterio de aceptación de la anterior. Si algo no se puede cumplir, decirlo en el informe final en lugar de ocultarlo.

Documentos de contexto (leer antes de empezar):
- `docs/boceto-analisis.html` y `docs/boceto-landing.webp`: bocetos visuales (ver §3 y §3b).
- [`../documentacion/PLAN_FRONTEND_CIENTIFICO.md`](../documentacion/PLAN_FRONTEND_CIENTIFICO.md): decisiones de producto y diseño del dashboard (ficha, comparación A | AB | B, gráficos).
- [`../frontend/map/README.md`](../frontend/map/README.md): contrato de datos JSON y API del módulo del mapa.
- [`../documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](../documentacion/FUNDAMENTOS_DEL_PROYECTO.md) y [`../documentacion/REGISTRO_S1.md`](../documentacion/REGISTRO_S1.md): qué es el producto y las cifras de validación.

---

## 0. Reglas que no se discuten

1. **Esta app es nueva y vive en `web/`.** No toca `frontend/` (esa es la versión infantil, EduAustralis, que mantienen otras personas) ni `pipeline/`, `scripts/` o los datos. **No usar nada de `frontend/src` como referencia de diseño ni de código.** Lo único que se reutiliza de `frontend/map/src/` es el módulo del mapa y la barra de tiempo, que se **copian** a `web/src/features/` (T0.8) para que la app no dependa de esa carpeta.
2. **Es una app estática** (Vue 3 + Vite). Lee los JSON que genera `frontend/map/scripts/build_mocks.py`. No hay backend ni se agregan endpoints.
3. **Los números salen siempre de la serie armonizada** (`n_equiv`). Los focos individuales se dibujan pero **nunca se cuentan** como métrica ni se comparan entre sensores.
4. **El mapa base es siempre claro** (`claro`), también con la interfaz en modo oscuro. Las rampas de color del mapa no cambian con el tema.
5. **Idioma ES/EN y tema claro/oscuro** en toda la app. Nada de texto fijo en un solo idioma.
6. **deck.gl se queda en `9.4.0` exacto** (9.1 falla en Vite). Los índices H3 viajan como string hex.
7. Antes de dar una tarea por terminada: `npm run build` sin errores y verificación visual en el navegador (§8).
8. No commitear datos (`mock-*`), `.env.local` ni `node_modules`. Un commit por tarea, mensaje en español.

## 1. Estado de partida

**Se parte del repositorio sin `web/`.** Existió un borrador en la máquina de la autora, pero no está en el repo: **no depender de él, construir todo desde cero** siguiendo este plan (la tarea T0 especifica la infraestructura). Lo que el repo sí tiene y se reutiliza:
- `frontend/map/src/map/` y `frontend/map/src/timebar/`: módulo del mapa (MapLibre + deck.gl + H3) y barra de tiempo, JS puro. Se **copian** a `web/src/features/` y se parchean (T0.8). `frontend/map/src/game/` **no** se copia.
- `frontend/map/tests/summary.test.mjs` y `frontend/map/scripts/build_mocks.py` (los datos que consume la app).
- `zona/sudamerica_6.geojson`: contornos de países, para dibujar el fondo del hero (T0.9).

**Archivos que el equipo entrega aparte** (se adjuntan a esta tarea; si falta alguno, pedirlo antes de seguir): el logo del equipo (`logo.webp`, 1024×1024, fondo transparente), el boceto de la landing (`docs/boceto-landing.webp`) y el boceto de la pantalla Análisis (`docs/boceto-analisis.html` y `.png`). Las **fotos de los 5 integrantes** (`public/team/member-1.jpg` … `member-5.jpg`, cuadradas, ≥ 400 px) también las pasa el equipo: hasta entonces usar un placeholder neutro (círculo gris con iniciales) y avisarlo en el informe. **No recortar caras del boceto.**

## 2. Decisiones de producto de esta app

| Tema | Decisión |
|---|---|
| Navegación | Navbar con **Inicio · Análisis · Proyecto · Equipo · EduAustralis**, más selector ES/EN, tema, y botón **Repositorio**. El boceto de la landing traía 4 ítems; **Equipo** se agregó después como pantalla propia. |
| Proyecto | Página de **metodología** (`/proyecto`): cómo se normalizaron y calibraron los datos, validación y limitaciones. |
| Equipo | Pantalla propia (`/equipo`) con la **descripción de cada integrante** (foto, nombre, rol, descripción, enlaces). |
| EduAustralis | **Enlace externo/aparte**: `import.meta.env.VITE_EDU_URL` o `/edu/`. Esta app no contiene esa versión. |
| Landing | Según el boceto (ver §3). El botón secundario "Ver una comparación" abre `/#/analisis?demo=compare`. |
| Análisis | Mapa grande, ficha a todo el ancho **debajo del mapa**, calendario, comparar años, FRP, calidad del dato, pie fijo. **Sin gráfico día/noche.** |
| Comparar | Botón **Comparar** apagado al inicio. Al activarlo aparece **A \| AB \| B** (con AB elegido y la barra al 50 %). Cámara siempre compartida. |
| Datos | `loadDataset()` busca `mock-s1`, `mock-conosur`, `mock-api` (o `VITE_MOCK_BASE`). |

## 3. Boceto de la landing (fuente de verdad visual)

Referencia: `web/docs/boceto-landing.webp` (captura del boceto, 2000×1125) y `web/public/logo.webp`. Todo lo siguiente sale de ella:

- **Fuentes:** `TERRA AUSTRALIS` en **Montserrat ExtraBold (800)**; títulos H2 en **Poppins Light (300)**; H3 en **Poppins Regular (400)**. Cuerpo en Poppins Light/Regular. Se cargan con `@fontsource/*` (autoalojadas).
- **Fondo:** casi blanco (`#fdfdfb`) con el contorno de Latinoamérica muy tenue detrás del hero (`latam-outline.svg` como máscara CSS).
- **Barra superior (3 zonas):** izquierda, el logo circular del equipo (`logo.webp`) + "TERRA / AUSTRALIS" en dos líneas; centro, **píldora gris clara** con los enlaces (en el boceto: Inicio, Análisis, Proyecto, EduAustralis; **la app agrega Equipo entre Proyecto y EduAustralis**: misma píldora, 5 ítems); derecha, **píldora negra** "Repositorio" con punto verde.
- **Hero centrado:** fila de **6 círculos superpuestos** (5 integrantes + el logo en el medio, más grande y por delante), el título grande en dos líneas, un párrafo de 3 líneas, botón negro redondeado grande y un enlace de texto al lado, y debajo del botón un punto verde con el dato vivo ("n focos activos").
- **Título:** EN "MODIS and VIIRS Harmonization · Latam focused system". ES: "Armonización MODIS y VIIRS, un sistema enfocado en Latam".
- **Botones del boceto:** "Free map" (primario) y "Live demo" (secundario). En la app: "Abrir el mapa" / "Open the map" y "Ver una comparación" / "See a comparison".
- El párrafo del boceto es Lorem ipsum: se reemplaza por texto real (ya escrito en las claves `home.*`, ver T1).
- **Dato vivo** ("n focos activos"): focos equivalentes del **último mes** de `calendar.json`, con su mes. Es una cifra armonizada, no un conteo de puntos.

El resto de las secciones de la landing (problema, pasos, cifras, cierre) y todas las demás pantallas **se arman con ese mismo lenguaje visual**: mucho blanco, tipografía ligera, píldoras, negro como único acento, un solo estilo de botón.

## 3b. Boceto de la pantalla Análisis (fuente de verdad visual de la ventana científica)

Archivos: **`web/docs/boceto-analisis.html`** (interactivo: se abre en el navegador; Comparar, A | AB | B, la barra arrastrable, ES/EN y claro/oscuro funcionan) y **`web/docs/boceto-analisis.png`** (captura). Los datos del boceto son inventados: se copian la **estructura, el orden, las proporciones y la mecánica**, no los números. Los círculos numerados del boceto son los de esta lista:

| Nº | Zona | Tarea que la implementa |
|---|---|---|
| 1 | Navbar (Inicio · Análisis · Proyecto · Equipo · EduAustralis) | T1/T2 |
| 2 | Selector ES/EN y tema claro/oscuro | T1 |
| 3 | Barra de filtros: zona, período A, período B (solo comparando), métrica, Exportar | T5 |
| 4 | Capas (columna izquierda) | T5 |
| 5 | Mapa grande + botón Comparar + triple A \| AB \| B + barra vertical + línea de tiempo | T3, T4 |
| 6 | Ficha de la selección, **a todo el ancho bajo el mapa** | T6 |
| 7 | Calendario de quema (año × mes) | T7 |
| 8 | Comparar años (líneas por año con banda y mediana) | T7 |
| 9 | Intensidad (FRP) | T7 |
| 10 | Calidad del dato | T7 |
| 11 | Pie fijo de advertencias | T8 |

Proporciones de referencia (en el boceto el contenedor mide 980 px; en la app, `.wrap` ancho de hasta ~1500 px, con separaciones de 16–20 px en lugar de 8 px):
- **Fila del mapa:** columna de capas de ~112 px (≈ 11 % del ancho) + el mapa ocupando el resto. El mapa mantiene una relación de aspecto de ~16:10 (540 × 330) y es **el elemento más grande de la página**.
- **Controles del mapa** en una sola línea sobre él: etiqueta "Mapa", botón **Comparar** (resaltado cuando está activo), triple **A | AB | B** (solo comparando) y la frase de ayuda "Arrastrá la barra para repartir el mapa" (solo en AB). Debajo del mapa, la línea de tiempo con ▶, el mes y el control deslizante.
- **Sobre el mapa:** etiqueta "A · mes" arriba a la izquierda (color de A), "B · mes" arriba a la derecha pero **antes** de los controles de zoom (color de B), leyenda abajo a la izquierda, zoom arriba a la derecha. Barra vertical de 2 px con manija circular de 30 px y flechas ⇄.
- **Ficha:** una fila de tarjetas iguales que se acomodan (`auto-fit`, mínimo ~130 px): A, B, A − B (resaltada en color de advertencia cuando hay diferencia), Anomalía, Origen del valor. El encabezado lleva a la derecha "Lazo: N celdas · X km²".
- **Calendario + Comparar años:** dos columnas con proporción 1,15 : 1. **FRP + Calidad del dato:** dos columnas iguales. En < 900 px todo se apila.
- **Color:** período A azul, período B naranja, rampa amarillo→rojo de las celdas, texto secundario gris. Tarjetas con borde fino de 0,5–1 px y radio de ~8 px (en la app, los radios de `tokens.css`).
- Si el boceto y el texto del plan difieren, **manda el boceto** en lo visual y **manda el plan** en el comportamiento.

## 4. Uso de `taste-skill` (skill `design-taste-frontend`)

Está instalado en `~/.claude/skills/design-taste-frontend/`. Es un skill pensado para sitios de empresa con un proceso propio (reparto de paletas, búsqueda de fotos, un "gate" que corre en un Chrome headless). **Acá no se usa el proceso completo**, porque el equipo ya definió paleta, fuentes y boceto. Se aplican sus reglas de oficio, que están en `references/`:

- **Copy** (`copy.md`, `copy-voice.md`): el h1 dice qué es y para quién; un dato concreto en la primera pantalla; los títulos nombran cosas; los botones son verbo + objeto; **máximo dos acciones en el hero**; sin palabras de relleno.
- **Una sección por pantalla** (`layout-v4.md`): cada sección de la landing mide 1 o 2 pantallas; su h2 va primero; bordes izquierdo y derecho iguales (`.wrap`).
- **Movimiento** (`motion.md`): entrada del hero una sola vez al cargar (`[data-enter]`); **un momento destacado** por página larga (en la landing: la frase del problema que se ilumina palabra por palabra al recorrer su sección, T2); hover: el botón sube 1 px, el enlace dibuja su subrayado, la tarjeta enlazada sube 2 px; **nada se mueve por hacer scroll** salvo ese momento; `prefers-reduced-motion` lo apaga todo y el contenido se lee igual.
- **Sin leyendas bajo las imágenes**; un solo estilo de botón y de tarjeta; contraste de texto suficiente en ambos temas; objetivos táctiles ≥ 44 px.
- No instalar efectos de shader, fondos animados ni fotos de stock: el producto es un instrumento científico.
- **No crear `.taste-skill/`** en el proyecto: eso activaría el hook `Stop` del skill, que corre su verificación sobre sitios estáticos y no aplica a esta app Vue.

Al final, en el informe, decir qué reglas se aplicaron y cuáles no.

## 5. Comandos

```bash
cd web
npm install              # una vez
npm run dev              # http://localhost:5175
npm run build            # debe terminar sin errores
npm test                 # node --test tests/*.test.mjs
```

Datos para desarrollar: crear `web/.env.local` con `TERRA_DATA_DIR=<ruta absoluta>` a la carpeta que contiene `mock-conosur/` o `mock-s1/`. Un conjunto de desarrollo como `mock-conosur` (2000–2025) puede **no traer `est/`**, es decir, sin intervalos para los meses convertidos: la ficha debe tolerarlo. Los datos S1 completos están en el release `datos-s1-2026-11-15` (descomprimir `S1_mapa_mock-s1.zip` en la carpeta de datos).

Para la verificación en el navegador de Claude Code, agregar a `.claude/launch.json` del espacio de trabajo una configuración `web`: `runtimeExecutable: npm`, `runtimeArgs: ["--prefix", "terra-frontend/web", "run", "dev"]`, `port: 5175`.

---

## 6. Tareas

### T0 · Infraestructura del proyecto `web/` (se crea todo; sin diseño final)

Crear, en este orden. Versiones **exactas** (probadas juntas): `vue 3.5.13`, `vue-router 4.5.0`, `vue-i18n 11.1.3`, `echarts 5.6.0`, `maplibre-gl 5.24.0`, `@deck.gl/{core,extensions,geo-layers,layers,mapbox,mesh-layers} 9.4.0`, `h3-js 4.5.0`, `@fontsource/poppins 5.2.7`, `@fontsource/montserrat 5.2.8`; dev: `vite 6.3.5`, `@vitejs/plugin-vue 5.2.4`. Node ≥ 22.

1. **`package.json`** (`type: module`; scripts `dev`, `build`, `preview`, `test: node --test tests/*.test.mjs`), `index.html` (con un script en `<head>` que aplica antes de pintar el tema y el idioma guardados en `localStorage`, claves `terra-theme` y `terra-locale`), `.gitignore` (`node_modules`, `dist`, `.env.local`, `public/mock-*`).
2. **`vite.config.js`**: plugin `vue()`; alias `@` → `src`; `build.target: 'es2022'`; puerto **5175**; plugin propio `mapData` que, en `dev` y `preview`, sirve `GET /mock-<nombre>/<ruta>.json` leyendo de la primera carpeta que tenga el archivo entre `process.env.TERRA_DATA_DIR` (se lee con `loadEnv` de `.env.local`), `../frontend/map/public` y `./public` (con `Content-Type: application/json`, protegiendo contra salir de la carpeta); si no existe responde **404** (no el HTML de la app). Los datos **no** se copian al build.
3. **Estilos** `src/styles/tokens.css` y `base.css`: variables CSS en `:root` (claro por defecto), `[data-theme='dark']` y `@media (prefers-color-scheme: dark)` para `:root:not([data-theme])`. Tokens: `--bg --surface --surface-2 --pill --ink --ink-2 --muted --line --line-strong --btn-bg --btn-ink --btn-bg-hover --ok --warn --warn-bg --period-a --period-b --period-a-bg --period-b-bg --outline-ink --focus`, radios (`--radius-s 8px`, `-m 14px`, `-l 22px`, `-pill 999px`), `--wrap 1240px`, `--gutter`, easings `--ease cubic-bezier(.2,.8,.2,1)` y `--ease-enter cubic-bezier(.22,1,.36,1)`, tiempos `--t-in 150ms` / `--t-out 120ms`. Valores claros de partida: fondo `#fdfdfb`, tinta `#0b0b0c`, píldora `#ececea`, botón `#111214`, período A `#1d5fd1`, período B `#d9780a`; oscuros: fondo `#0d0e10`, tinta `#f3f3ef`, botón invertido (claro), A `#6ea0ff`, B `#f2a24a`. `base.css` importa las fuentes de `@fontsource` (Poppins 300/400/500, Montserrat 800), reset, `h1/h2` en Poppins 300, `h3` en 400, `.wrap`, `.skip-link`, **`.btn`** (píldora; sube 1 px al pasar el mouse, se hunde y escala .985 al apretar; `.btn--xl` de 60 px de alto; `.btn--ghost`; `.btn--sm`), **`.link`** (subrayado que se dibuja de izquierda a derecha al pasar), `.dot` (punto verde), animación de entrada del hero `[data-enter]` con `--i` para escalonar, y un bloque `prefers-reduced-motion` que apaga animaciones y transiciones.
4. **`src/stores/ui.js`**: objeto reactivo `{ locale: 'es'|'en', theme: 'system'|'light'|'dark' }` con valores iniciales de `localStorage` (con `try/catch`; sin elección, idioma del navegador y tema `system`); `initUi(i18n)` observa los cambios, los aplica a `<html lang>` y `<html data-theme>` (con `system` se quita el atributo), actualiza `<meta name="theme-color">` y los guarda; `setLocale`, `setTheme`, `effectiveTheme()`.
5. **`src/main.js`**: `createI18n({ legacy: false, locale, fallbackLocale: 'es', messages: { es, en } })` con `locales/es.json` y `en.json`; `initUi`; monta con router e i18n e importa `styles/base.css`. **`src/router.js`**: `createWebHashHistory` (el servidor estático no necesita reescrituras); rutas `/` (Inicio), `/analisis`, `/proyecto`, `/equipo`, con vistas cargadas bajo demanda; cualquier otra ruta redirige a `/`; `scrollBehavior` con anclas (`#metodologia`) y `top: 0` por defecto. **`src/App.vue`**: enlace "saltar al contenido", `AppNavbar`, `<main id="main">` con `RouterView`, `AppFooter`.
6. **`AppNavbar.vue`** (sticky, fondo translúcido con desenfoque; grilla de 3 columnas): izquierda, el logo (`/logo.webp`, 56 px) + "TERRA / AUSTRALIS" en dos líneas, Montserrat 800, mayúsculas, interlineado ajustado; centro, **píldora** con 5 ítems (Inicio, Análisis, Proyecto, Equipo, EduAustralis; el activo con una barra de 2 px debajo y `aria-current`; el subrayado aparece al pasar el mouse); derecha, selector **ES|EN** (`aria-pressed`), botón de tema (ícono sol/luna; `aria-label` según el estado) y píldora negra **Repositorio** con punto verde que abre `https://github.com/Toluk3/TerraAustralisTeam` en otra pestaña. **EduAustralis** es un `<a>` normal a `import.meta.env.VITE_EDU_URL || '/edu/'` (no una ruta). Bajo 1100 px la píldora pasa a una segunda fila centrada y desplazable, y "Repositorio" se oculta. **`AppFooter.vue`**: nombre + "NASA Space Apps Challenge", aviso metodológico corto y crédito de datos (claves `footer.*`).
7. **`src/features/dataset.js`**: `loadDataset()` (una sola vez, compartido) prueba `GET /<base>/meta.json` en este orden: `VITE_MOCK_BASE`, `mock-s1`, `mock-conosur`, `mock-api` (acepta la primera que responda JSON), crea `createStaticSource('/<base>')` y devuelve `{ base, source, meta, calendar }`; si ninguna sirve, lanza un error claro. `calendarRows(cal)` convierte `calendar.json` (columnar) en filas `{ key: 'YYYY-MM', year, month, value (n_equiv), p05, p95, coverage (coverage_frac), status, median, anomalyPct, anomalyAbs, rank (pct_rank) }`.
8. **Copiar y parchar el módulo del mapa.** Copiar `frontend/map/src/map/*` → `web/src/features/fire-map/` y `frontend/map/src/timebar/*` → `web/src/features/timebar/` (sin usar este último: ver T3), y `frontend/map/tests/summary.test.mjs` → `web/tests/` (ajustando las rutas de import; el test del juego no se copia). Aplicar estos parches (no se modifica nada más del módulo):
   - `createFireMap` acepta `ui: { legend, badges, panel }` (cada uno en `false` agrega la clase `tam-map--no-<parte>` al raíz; en `map.css`, `display: none !important` para `.tam-map__legend`, `.tam-map__badges` y `.tam-sel`), `labels` (objeto con `lasso, lassoTitle, equivalentHotspots, perMonth, anomalyVs, hotspotOf, day, night, confidence`, con valores por defecto en español que se usan en el tooltip y el botón Lazo) y `selectable` (en `false`: clase `tam-map--no-lasso` que oculta el botón Lazo, ignora la tecla `L` y el clic que selecciona celdas; sirve para la segunda instancia de una comparación).
   - API nueva: `setLabels(obj)` (mezcla los textos y actualiza el botón Lazo sin recrear el mapa) y `selectCell(cell, res, shift)` (llama `selection.clickCell`).
   - Evento nuevo `lasso` (booleano), emitido al entrar y salir del modo lazo.
   - El evento `selection` debe incluir también `bbox` (`sel.bbox`): lo necesita `summarize`.
   - `index.js` reexporta `CELLS, PUOR, FIRE, gradientCss` (los de `colors.js`); `ramp`, `logScale` y `anomalyT` se importan directo de `colors.js`.
   - El panel de selección del módulo (en español) queda **oculto** y no se usa; la ficha se dibuja en Vue (T6).
9. **Fondo del hero.** Script `web/scripts/make-outline.mjs` (o `.py`) que lee `../zona/sudamerica_6.geojson`, descarta islas lejanas (quedarse con lon −82…−34, lat −56…6), simplifica cada anillo (Douglas-Peucker, tolerancia ~0,08°, cortando el anillo en dos mitades para que el simplificador no colapse anillos cerrados) y escribe `public/latam-outline.svg` (proyección equirectangular, `viewBox` de 1000 de ancho, `stroke="currentColor"`, sin relleno; debe pesar < 60 KB). Se usa como máscara CSS en el hero (T2).
10. **`src/features/summaryLoader.js`**: `createSummarizer(source, meta)` devuelve `{ run, info, CALC }`; `info = seriesInfo(meta)`; `CALC` = `meta.cell_res` si está en `meta.map.resolutions`, si no la resolución más fina. `run(selection, months)` arma `sel = { res, cells: Set, bbox }`, baja para cada mes las tablas de celdas (`source.getCells(CALC, mes)`), de estimación (`getEst(mes)`, solo si hay `ratios` y el mes está en `meta.uncertainty.months`) y de focos (índice de teselas + las teselas madre `cellToParent(celda, meta.points.tile_res)` de las celdas), llama `summarize(sel, months, cellTables, pointTables, { info, estTables, ratios })` y además calcula un histograma de FRP de los focos dentro de la selección en 10 intervalos (`[0,1,2,5,10,20,50,100,200,500,∞)`), **por familia de sensor** (terra/aqua = MODIS; el resto VIIRS), devolviendo `{ summary, frp: { MODIS: number[], VIIRS: number[] } }`. Cada paso tolera tablas vacías y la ausencia de `est/` (datos sin intervalos).
11. **`src/stores/analysis.js`**: objeto reactivo con `ready`, `periodA`, `periodB` (`{from,to}` en `'YYYY-MM'`), `compare` (false), `mode` (`'A'|'AB'|'B'`, 'AB'), `split` (0.5), `view` (`'value'|'anomaly'|'diff'`), `layers` (`cells, points, outline, mask` en true), `opacity` (0.75) y `selection` (payload del evento `selection` o null). Utilidades `monthIndex`, `monthKey`, `addMonths`, `monthsBetween`. `initAnalysis(rows, { demo })`: A = último mes con valor > 0, B = el mismo mes del año anterior (si hay datos), `compare = demo`. `setPeriod(which, from, to)` (invierte si queda al revés), `setCompare(on)` (al encender: `mode = 'AB'`, `split = .5`; al apagar con vista `diff`, vuelve a `value`), `setMode(m)` (AB recentra la barra).
12. **`src/components/map/FireMap.vue`**: envuelve **una** instancia de `createFireMap` (import dinámico, para que MapLibre y deck.gl no carguen fuera de `/analisis`). Props: `dataset`, `period`, `view`, `layers`, `opacity`, `selectable`, `diff` (`{ a, b }` períodos, o null). Crea el mapa con `basemap: 'claro'`, `ui: { legend: false, badges: false, panel: false }`, `labels` traducidos con vue-i18n, `pointBudget: 250000`; observa las props y llama `setPeriod`, `setMetric` (anomaly/value), `setLayerVisible`, `setHexOpacity`; re-emite `selection`, `lasso`, `cell-click` (clic en una celda) y `move` (movimiento del mapa); al cambiar de idioma llama `setLabels`; destruye el mapa al desmontarse; si falla, muestra un mensaje traducido. **Capa de diferencia (`diff`)**: oculta las celdas del módulo (`setLayerVisible('cells', false)`), baja las tablas de celdas de los meses de cada período a la resolución actual (`api.getState().res`), calcula por celda el **promedio mensual de A menos el de B** y la dibuja con `H3HexagonLayer` (`@deck.gl/geo-layers`) vía `api.setExtraLayers([...])`, con color de la rampa `PUOR` según `sign(d)·log1p(|d|)/log1p(dominio)` (dominio = `meta.map.domain[res]`); se recalcula al cambiar la resolución, los períodos o la opacidad. Expone `api`. Estilos: el mapa es **siempre claro** (no hereda el tema de la app).

**Aceptación T0:** `npm install` y `npm run build` terminan sin errores (con vistas y locales mínimos); `npm test` corre `summary.test.mjs` en verde; con `TERRA_DATA_DIR` apuntando a una carpeta con `mock-*`, `GET /mock-<x>/meta.json` devuelve JSON y un archivo inexistente devuelve 404.

### T1 · Poner la base en pie (locales, limpieza, primer arranque)

1. Partiendo de T0, crear los archivos mínimos que faltan (vistas y locales, pasos siguientes).
2. Crear `web/src/locales/es.json` y `en.json` con **todas las claves usadas** por los componentes existentes: `nav.*` (`skip, label, homeLabel, home, analysis, project, language, themeToLight, themeToDark, repo`), `footer.*` (`notice, credit`), `home.*` (`teamLabel, logoAlt, title, lead` con `{years}`, `cta, demo, live` con `{n}` y `{month}`, `liveWait`, `problem.title`, `problem.statement`, `steps.title`, `steps.{gather,calibrate,explore}.{title,body}`, `facts.{title,yearsLabel,cellLabel,biasLabel,intervalLabel,note}`, `close.{title,edu}`) y `map.*` (`lasso, lassoTitle, failed, tip.{equivalent,perMonth,anomaly,hotspot,day,night,confidence}`). Ir sumando las de cada tarea siguiente.
3. Textos de la landing (ES; traducir fielmente a EN): título "Armonización MODIS y VIIRS, un sistema enfocado en Latam"; lead que diga que un pipeline calibra los focos de NASA FIRMS para comparar los años MODIS con los VIIRS y que se explora en mapa, calendario y comparaciones, con la cifra de años de serie; problema: "VIIRS detecta cerca de cuatro veces más focos que MODIS. Si se suman sin calibrar, el cambio de sensor parece un aumento del fuego."; pasos Reunir (FIRMS: Terra, Aqua, NOAA-20, NOAA-21) / Calibrar (factor k por región y mes; sesgo de +262 % a +0,05 % en la validación de NOAA-20 contra MODIS) / Explorar (celdas H3, intervalo p05–p95, cobertura); cifras: años de serie, ≈ 5 km² por celda r7, sesgo tras calibrar, intervalo p05–p95; nota: "Los valores son estimaciones derivadas de observaciones satelitales: un foco no es un incendio confirmado."; cierre: "Mirá el fuego a través del tiempo" + enlace "Versión para escuelas: EduAustralis".
4. Crear vistas mínimas temporales `AnalysisView.vue`, `ProjectView.vue` y `TeamView.vue` (solo un `<h1>`) para que el router compile. Agregar `nav.team` ("Equipo" / "Team") a los locales.
5. `npm run dev` y `npm run build`.

**Aceptación:** la landing (una vez creada en T2; en T1 basta una vista mínima) se ve en `http://localhost:5175` sin errores de consola; el dato vivo muestra una cifra y un mes reales; cambiar ES/EN y claro/oscuro funciona y persiste al recargar; `npm run build` pasa.

### T2 · Landing fiel al boceto (se crea `views/HomeView.vue`)

Crear la landing con el contenido y la estructura del boceto (§3). Secciones, en este orden: **(1) Hero** de una pantalla (fila de 6 círculos con el logo en el centro y 5 integrantes; h1; párrafo; botón primario grande + enlace de texto; dato vivo con punto verde y `aria-live="polite"`, calculado del último mes de `calendar.json` con `loadDataset()`); **(2) Problema**: una frase grande que se ilumina palabra por palabra al recorrer la sección (el momento destacado de la página; con `prefers-reduced-motion` aparece completa); **(3) Del dato al mapa**: 3 tarjetas numeradas; **(4) Cifras**: 4 datos en una fila (años de serie sacados de `meta.coverage`, ≈ 5 km² por celda, sesgo antes y después de calibrar, intervalo p05–p95) con una nota de que son estimaciones; **(5) Cierre**: titular, botón "Abrir el mapa" y enlace a EduAustralis. El fondo del hero usa `latam-outline.svg` como máscara CSS (`mask`) pintada con `--outline-ink`, muy tenue. La entrada del hero se escalona con `data-enter` y `--i`.

Después, verificar contra el boceto:

Comparar capturas a 1440×900 contra el boceto y corregir `HomeView.vue`/`AppNavbar.vue`:
- Medidas y proporciones del hero (tamaño de círculos, solapamiento, tamaño del título, anchos de párrafo), píldora de la navbar, botón "Repositorio".
- Fuentes realmente cargadas (comprobar en DevTools: Montserrat 800, Poppins 300/400).
- El contorno de Latinoamérica se ve tenue pero se ve (en claro y en oscuro).
- El hero ocupa **una pantalla** a 1440, 1024, 768 y 390 (en móvil puede crecer).
- Cada sección siguiente ocupa 1 o 2 pantallas; sin leyendas bajo imágenes.
- Usar `public/team/member-N.jpg` si el equipo ya las pasó; si no, el placeholder neutro de §1.

**Aceptación:** capturas a 1440, 1024, 768 y 390 revisadas una por una; sin scroll horizontal; foco visible al navegar con Tab; con `prefers-reduced-motion` todo se ve sin animar.

### T3 · `TimeSlider.vue` (barra de tiempo propia, traducible)

No usar `features/timebar` (sus textos están en español y estilos propios). Crear `components/map/TimeSlider.vue`:
- Props: `rows` (de `calendarRows`), `modelValue` (`'YYYY-MM'`), `markers` (B opcional).
- Un `<input type="range">` sobre los meses de la serie; encima, una **línea de sparkline** del valor mensual (SVG, escala log suave) con el relleno de `--ink` al 10 %; marcas de año; botón reproducir/pausar (700 ms por mes; se detiene al final; **no se reproduce solo**); etiqueta del mes elegido formateada con `Intl` según el idioma.
- Marcas: meses con cobertura reducida (punto naranja) y la línea punteada desde `switch_date` (rotulada "estimado" / "estimated").
- Accesible: `aria-valuetext` con el mes y el valor; flechas ← → mueven un mes, PgUp/PgDn 12 meses.
- Emite `update:modelValue` (una vez por cuadro mientras se arrastra).

**Aceptación:** arrastrar cambia el mes sin trabar; reproducir avanza mes a mes; el teclado funciona; se ve bien en oscuro.

### T4 · `CompareMap.vue` (el corazón de la pantalla)

Referencia visual y mecánica: `docs/boceto-analisis.html` (probar ahí cómo se comportan Comparar, A | AB | B y la barra).

Contenedor relativo con relación de aspecto ~ 16:9 (mín. 420 px de alto; en móvil 4:5). Contiene:
- **Instancia A** (`FireMap`, `selectable: true`, período A) siempre montada.
- **Instancia B** (`FireMap`, `selectable: false`, período B) **montada solo cuando `analysis.compare` es true**; al apagar Comparar se destruye (libera un contexto WebGL).
- Modo **A**: solo A visible (B `display: none`, sin barra). Modo **B**: solo B visible. Modo **AB**: B encima de A con `clip-path: inset(0 0 0 X%)` (X = `split*100`) y la barra.
- **Barra vertical** (`role="slider"`, `aria-valuenow`): zona de agarre de ~20 px, línea de 2 px, manija circular con flechas; arrastre con `pointerdown/move/up` + `setPointerCapture`; teclado ← → (2 %), Inicio/Fin; límites 4 %–96 %. Tocar/arrastrar la barra **no** mueve el mapa.
- **Etiquetas** flotantes "A · feb 2024" y "B · feb 2023" (formateadas con `Intl`, colores `--period-a` / `--period-b`); en modo A o B solo la que corresponde.
- **Cámara sincronizada:** al emitir `move` una instancia, la otra hace `jumpTo` de centro, zoom, rumbo e inclinación con un indicador de "movimiento programático" para evitar bucles. Al activar Comparar, B arranca con la cámara de A.
- **Interacción con el recorte:** el lado derecho (B) recibe los eventos del puntero; un clic en una celda de B llama `A.api.selectCell(cell, res)`. Mientras el lazo está activo (evento `lasso`), poner `pointer-events: none` en la capa B para que el dibujo lo reciba A en toda la superficie.
- **Vista Diferencia** (`analysis.view === 'diff'`): un solo mapa (A) con `diff = { a: periodA, b: periodB }`; se oculta el control A | AB | B y la barra.
- **Leyenda propia** (esquina inferior izquierda, plegable): rampa `CELLS` (valor) con ticks `0 … dominio+` (`meta.map.domain[res]`), `PUOR` para anomalía y para diferencia (con los rótulos "A menos B"), y la de FRP (`FIRE`) cuando los focos están visibles; resolución H3 y área de celda. Textos traducibles. Cartel "Acercá el mapa para ver los focos" cuando `getState().points.zoomedOut`.
- **Avisos del período** como chips sobre el mapa: "Estimado (VIIRS × k) desde {fecha}" y "Cobertura reducida: {mes} ({pct} %)" según `meta`.
- El **control Comparar** y el **triple A | AB | B** van arriba del mapa (ver T5); aquí solo se consume `analysis`.

**Aceptación (probar a mano en el navegador):** Comparar apagado → un mapa. Encender → aparece A | AB | B con AB, la barra al 50 %, dos períodos distintos a cada lado. Arrastrar la barra con el mouse recorta B sin retraso notable. A y B muestran solo su mapa. Pan y zoom mueven ambos igual (sin desfase ni bucle). El lazo dibuja sobre toda la superficie. Con S1: medir FPS al arrastrar; si baja de ~30, aplicar el plan B (reducir `pointBudget` de B y ocultar los focos en B).

### T5 · `FilterBar.vue` y `LayerPanel.vue`

- **FilterBar** (sobre el mapa): zona (texto de `meta.zone`, solo lectura), selector de **Período A** (mes + año, `<select>` accesibles, limitados a `meta.coverage`), **Período B** (visible solo comparando), botón **Comparar** (`aria-pressed`), triple **A | AB | B** (visible solo comparando; `role="group"`), y botón **Exportar** (abre un menú CSV/JSON de la ficha, ver T6).
- **LayerPanel** (columna izquierda del mapa; en móvil, cajón plegable): interruptores Celdas H3 / Focos / Máscara / Contorno; vista **Valor / Anomalía / Diferencia** (Anomalía solo con un mes; Diferencia solo comparando; si se apaga Comparar con Diferencia activa, vuelve a Valor); control de opacidad; recordatorio de "Lazo: botón del mapa o tecla L". **No ofrecer selector de mapa base** (siempre claro).
- Colores: período A en `--period-a`, B en `--period-b`.

**Aceptación:** cada control cambia el estado compartido y el mapa responde; en móvil no hay desbordes.

### T6 · `SelectionSummary.vue` (la ficha, a todo el ancho bajo el mapa)

Se alimenta de `analysis.selection` (payload del evento `selection` de la instancia A: `cells`, `res`, `bbox`, `area`) y de `createSummarizer(...).run(selection, months)` para el período A y, comparando, el B. Cancelar cálculos viejos con un contador (token). Mostrar un esqueleto de carga.

Tarjetas en una fila (envuelve en pantallas angostas):
1. **Encabezado:** "Lazo/Selección: N celdas · X km²" y botón **Borrar** (llama `api.clearSelection()`). Sin selección: "Zona completa" con `meta.zone`.
2. **A:** focos equivalentes del período con intervalo **p05–p95** (`summary.total.lo/hi`; sin intervalo cuando `lo == null`: mostrar "sin intervalo" y la razón), origen del valor (`ORIGIN` de `summary.js`, traducido) y cobertura.
3. **B** (solo comparando): igual.
4. **A − B** (solo comparando): diferencia relativa `(A − B) / B`. **Si los intervalos de A y B se solapan, mostrar "Diferencia no concluyente"** en vez de un porcentaje destacado. Si B = 0, mostrar la diferencia absoluta.
5. **Anomalía vs mediana** y ranking ("{n}.º mes más activo de la serie") tomados de `calendar.json` (`anomaly_pct`, `pct_rank`) para la **zona completa** (rotularlo así cuando hay una selección: la anomalía por selección no está en los datos).
6. **Escala:** si el área de la selección es < ~12.400 km², aviso "por debajo de la escala validada".
- Sin selección, A y B salen directamente de `calendar.json` (`value`, `p05`, `p95`, `coverage`, `status`) para el período; si el período tiene más de un mes, sumar valores y **omitir el intervalo** (no se pueden sumar percentiles).
- **Exportar CSV y JSON** (serie por mes: valor, p05, p95, origen, cobertura, métrica `meta.metric`, `meta.dataset_version`, `meta.config_hash`); con comparación, ambos períodos. Nombres de columnas en inglés estable.
- Números con `Intl.NumberFormat` según el idioma; nunca `toFixed` suelto.

**Aceptación:** para 3 selecciones y meses distintos, los valores de A coinciden (±0) con los que mostraba el panel original del módulo (habilitarlo temporalmente quitando `ui.panel:false`, o con `tests/summary.test.mjs` como base de una prueba automática de `createSummarizer`). Con `mock-conosur` (sin `est/`) la ficha no se rompe.

### T7 · Gráficos

Instalar nada nuevo: `echarts` ya está en `package.json`. Importar **solo módulos usados** (`echarts/core` + `LineChart`, `BarChart`, `GridComponent`, `TooltipComponent`, `MarkLineComponent`, `CanvasRenderer`). Crear `components/charts/useChart.js` (inicializa, `ResizeObserver`, destruye, **recalcula al cambiar idioma o tema**, lee los colores de las variables CSS con `getComputedStyle`).

1. **`BurnCalendar.vue`** (sin ECharts, una grilla HTML con `role="grid"`): filas = años, columnas = 12 meses; color por valor con `ramp(CELLS, logScale(v, p98))` (mismo color que las celdas del mapa); selector **Valor / Anomalía** (anomalía con `PUOR` y `anomalyT`). Marcas: **cobertura reducida** (trama diagonal), **estimado desde `switch_date`** (línea punteada entre años), celda de **A** (borde `--period-a`) y de **B** (borde `--period-b`). Clic = fija A; **Mayús + clic** = fija B y activa Comparar. Hover/foco: valor, p05–p95 y estado. Navegación con flechas.
2. **`YearCompare.vue`** (ECharts línea): eje X meses 1–12; una línea por año (por defecto los años de A y de B, con sus colores) + **mediana histórica** punteada (`median` de `calendar.json`) + banda p05–p95 del año de A; chips para sumar hasta 6 años más; clic en un punto fija A (o B con Mayús). Sin comparar: año de A contra la mediana.
3. **`FrpHistogram.vue`** (ECharts barras): usa `frp` de `createSummarizer` (bins de `FRP_EDGES`, eje X log). **Eje Y = porcentaje de las detecciones de cada familia (MODIS/VIIRS), nunca cantidad.** Rótulo fijo: "Descriptivo: no comparable entre sensores ni entre años". Con comparación: barras de A y B. Sin selección: invitación a dibujar un lazo.
4. **`DataQuality.vue`** (HTML): barra de **cobertura** del período; barra apilada de **origen del valor** (MODIS directo / VIIRS convertido / Terra sola, según `seriesInfo(meta).origin` de cada mes); **proporción estimada**; enlace a `/proyecto#metodologia`. Sale de las filas del resumen (o del calendario sin selección).

Todos con `aria-label`, una **tabla alternativa** plegable con los mismos datos, y colores que respetan el tema (A azul, B naranja).

**Aceptación:** clic en el calendario mueve el mapa; Mayús + clic fija B; los gráficos cambian al cambiar de idioma y de tema sin recargar; ninguno dibuja conteos de focos como métrica.

### T8 · `AnalysisView.vue` (ensamblar la pantalla)

Orden vertical (`.wrap` ancho, máx. 1500 px): título corto + `FilterBar` → fila [`LayerPanel` | `CompareMap` con `TimeSlider` debajo] → `SelectionSummary` (ancho completo) → fila [`BurnCalendar` | `YearCompare`] → fila [`FrpHistogram` | `DataQuality`] → **pie fijo de advertencias** (ES/EN): un foco no es un incendio confirmado; valores armonizados, no conteos crudos; ventanas menores a ~8 días tienen sesgo; versión de datos y `config_hash` de `meta`; atribución de NASA FIRMS y de los mapas base.
- Al montar: `loadDataset()` → `initAnalysis(calendarRows(calendar), { demo: route.query.demo === 'compare' })`. Estados de carga y de error (sin datos: mensaje claro con la carpeta esperada).
- El mapa **no** se crea hasta que el contenedor es visible (`IntersectionObserver`) para no gastar WebGL en vano.
- Responsive: < 900 px, `LayerPanel` pasa a cajón colapsable y los pares de gráficos se apilan; mapa 4:5.

**Aceptación:** `/#/analisis` carga con datos reales; `/#/analisis?demo=compare` abre con Comparar activado; la ficha, el calendario y el mapa se mantienen sincronizados.

### T9 · `ProjectView.vue` (Proyecto: metodología)

Misma estética que la landing. Una página con índice lateral fijo en escritorio y ancla `#metodologia` en su primer bloque.
- **Metodología** (ES/EN, contenido de `documentacion/PLAN_NORMALIZACION.md`, `PLAN_MODULO_DATOS.md`, `REGISTRO_S1.md`; **no inventar cifras**): esquema FIRMS → normalización → calibración → validación → mapa (diagrama SVG simple y estático, sin leyendas bajo la figura); fuentes (MODIS Terra/Aqua, VIIRS NOAA-20/NOAA-21; S-NPP fuera); métrica `n_clusters_det`; referencia Terra + Aqua; celdas H3 r7; factor k por región y mes y su validación (tabla de `REGISTRO_S1.md`: sin corrección +262 %, configurada +0,05 %); incertidumbre (bootstrap de k, p05–p95); cobertura y datos estimados desde `switch_date`; **limitaciones** (un foco no es un incendio; sin detecciones no prueba ausencia de fuego; los límites de S1; biomasa/CO₂ no validada y fuera de esta app); glosario; enlace a los datos y al repositorio.
**Aceptación:** ES y EN; el índice lleva a cada ancla; sin cifras sin fuente.

### T9b · `TeamView.vue` (Equipo: descripción de los integrantes)

Pantalla `/equipo`, misma estética que la landing:
- Encabezado: título ("El equipo" / "The team") y una frase sobre el desafío NASA Space Apps (qué problema se resolvió y para quién).
- **Una tarjeta por integrante** (5 en total, en una grilla de 3 + 2 que se centra; 1 columna en móvil): foto circular (`/team/member-N.jpg`), **nombre, rol y descripción corta** (2–3 líneas: qué aportó al proyecto) y enlaces (GitHub/LinkedIn si los hay). Sin leyendas bajo las fotos; texto alternativo = el nombre.
- Los datos de cada integrante en un único archivo `src/content/team.js` (`id`, `photo`, `name`, `role: { es, en }`, `bio: { es, en }`, `links`), no repartidos por el componente.
- **Los nombres, roles y descripciones no están en el repo.** Dejar valores genéricos ("Integrante 1", "Rol por definir") con un comentario `TODO(equipo)` visible en `team.js`, y avisar en el informe qué datos faltan. **No inventar nombres, roles ni biografías.**
- Cierre de la página: logo del equipo, agradecimientos (NASA FIRMS y las fuentes de datos) y enlace al repositorio.

**Aceptación:** la tarjeta de cada integrante se ve igual en claro y oscuro; ES y EN; foco visible en los enlaces; a 390 px las tarjetas no se cortan.

### T10 · Idiomas

- Script `tests/i18n.test.mjs`: carga `es.json` y `en.json` y falla si alguna clave de una no está en la otra.
- Revisión manual: recorrer las tres pantallas en EN y ES buscando textos fijos en un solo idioma (incluye `aria-label`, `title`, `<title>` del documento — actualizar con el idioma — y fechas/números).

### T11 · Pruebas

`npm test` debe correr: `summary.test.mjs` (existente), `i18n.test.mjs`, y nuevas pruebas sin DOM para: `stores/analysis.js` (`initAnalysis`, `setPeriod` invierte rangos, `setCompare`, `setMode` recentra), la lógica "diferencia no concluyente" (extraerla a una función pura), el cálculo de la posición de la barra (límites), y `createSummarizer` contra una fuente falsa. Documentar cómo correrlas.

(La navbar tiene 5 ítems: comprobar que cabe a 1100 px y que en móvil la píldora se desplaza sin romper el layout.)

### T12 · Calidad final

- **Accesibilidad:** foco visible en todo; orden de Tab lógico; nombres accesibles en controles solo con ícono; contraste AA en ambos temas; `prefers-reduced-motion` respetado (también en la reproducción de la barra de tiempo, que no se inicia sola); objetivos táctiles ≥ 44 px (excepto dentro de texto corrido).
- **Responsive:** capturas a 1440, 1024, 768 y 390 de las tres pantallas, en claro y oscuro; sin scroll horizontal.
- **Rendimiento:** `echarts`, MapLibre y deck.gl se cargan solo en `/analisis` (imports dinámicos ya en `router.js` y `FireMap.vue`); la landing no debe descargar el mapa. Revisar el tamaño del chunk principal.
- **Textos del módulo del mapa en español** (mensajes `status(...)` y errores): parametrizarlos por `labels` o, si no alcanza, documentarlo en el README como pendiente.
- Consola sin errores ni advertencias de Vue/i18n en las tres pantallas.

### T13 · Documentación y despliegue

- `web/README.md`: qué es, cómo correrlo, variables (`TERRA_DATA_DIR`, `VITE_MOCK_BASE`, `VITE_EDU_URL`), estructura de carpetas, cómo agregar un idioma.
- Actualizar `scripts/deploy_vps.sh` para compilar **`web/`** en lugar de `frontend/map` (`MAP_DIR`), manteniendo `VITE_MOCK_BASE=mock-s1` y la copia de `mock-s1/` a la raíz web; y **servir `EduAustralis` en `/edu/`** si sigue existiendo `frontend/` (compilarlo con `base: '/edu/'`). **No ejecutar el despliegue**: solo dejar el script listo y probado con `bash -n`.
- Actualizar `documentacion/DESPLIEGUE_VPS.md` y la tabla de componentes del `README.md` raíz.
- Marcar en `documentacion/PLAN_FRONTEND_CIENTIFICO.md` lo que cambió respecto al plan original (nav de 4 ítems, app en `web/`, EduAustralis aparte, landing según boceto).

---

## 7. Estructura final esperada

```
web/
  PLAN_IMPLEMENTACION.md   README.md   package.json   vite.config.js   index.html
  public/                  logo.webp, team/, latam-outline.svg
  src/
    main.js  router.js  App.vue
    locales/               es.json, en.json
    styles/                tokens.css, base.css
    stores/                ui.js, analysis.js
    features/              dataset.js, summaryLoader.js, fire-map/, timebar/ (sin uso)
    components/
      layout/              AppNavbar, AppFooter
      map/                 FireMap, CompareMap, FilterBar, LayerPanel, TimeSlider
      summary/             SelectionSummary
      charts/              useChart.js, BurnCalendar, YearCompare, FrpHistogram, DataQuality
    content/               team.js (datos de los integrantes)
    views/                 HomeView, AnalysisView, ProjectView, TeamView
  tests/                   summary, i18n, analysis-store, compare, summarizer
```

## 8. Protocolo de verificación en el navegador

Para cada tarea visual, con el servidor de desarrollo corriendo:
1. Cargar la ruta; revisar la consola (cero errores).
2. Capturar a 1440×900, 1024×768, 768×1024 y 390×844; claro y oscuro; ES y EN.
3. Probar la interacción descrita en la aceptación (clics, arrastre, teclado).
4. Para el mapa: confirmar que cargan las celdas, dibujar un lazo y ver la ficha, y activar Comparar.
5. Pegar en el informe qué se vio y qué **no** se pudo comprobar (por ejemplo, sin acceso a internet las teselas del mapa base no cargan: las capas se dibujan igual).

## 9. Informe final (obligatorio)

Al terminar, entregar: lista de tareas cumplidas con su criterio de aceptación, lo que quedó pendiente o falló (con el motivo), capturas de las tres pantallas, resultado de `npm run build` y `npm test`, las reglas de `taste-skill` aplicadas y no aplicadas, los textos placeholder que el equipo debe completar (nombres y roles, fotos originales, `TODO(equipo)`), y cualquier decisión que se tomó sin consultar.
