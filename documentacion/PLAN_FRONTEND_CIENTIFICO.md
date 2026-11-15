# Plan: frontend científico de Terra Australis

> **Cambios respecto de este plan original (implementados en `web/`, rama `feature/frontend-cientifico`).** Este documento es la especificación de producto acordada. Lo que cambió al construirlo:
>
> - **La app vive en `web/`**, nueva y separada. No se movió ni se reutilizó `frontend/`: esa carpeta sigue siendo **EduAustralis** y la app científica la enlaza aparte (`VITE_EDU_URL` o `/edu/`), no como ruta propia.
> - **Navbar de 5 ítems:** Inicio, Análisis, Proyecto, Equipo, EduAustralis (en lugar de "Mapa y análisis" y "Metodología"). Rutas con `#`: `/`, `/analisis`, `/proyecto` (metodología), `/equipo`.
> - **La landing sigue el boceto del equipo** (`web/docs/boceto-landing.webp`) y la pantalla Análisis, `web/docs/boceto-analisis.html`.
> - **Equipo** tiene pantalla propia; nombres, roles y fotos quedan como `TODO(equipo)` en `web/src/content/team.js`.
> - **Mapa base:** siempre `claro`; no se ofrece selector (tampoco `satelite`).
> - **Comparar y A | AB | B** van en la línea de controles sobre el mapa (como en el boceto), no en la barra de filtros.
> - **Barra de tiempo:** componente propio traducible (`TimeSlider.vue`); la de `frontend/map/src/timebar` se copió pero no se usa.
> - **Selección:** el módulo del mapa se copió a `web/src/features/fire-map/` con parches (`ui`, `labels`, `selectable`, `selectCell`, `setLabels`, `jumpTo`, eventos `lasso` y `notice`); no se separó `selection.js`, el panel interno queda oculto y la ficha se dibuja en Vue.
> - **Despliegue:** `scripts/deploy_vps.sh` todavía publica `frontend/`; el cambio a `web/` está descripto como pendiente en [`DESPLIEGUE_VPS.md`](DESPLIEGUE_VPS.md).
> - Las fases de la sección 6 y la estructura de la sección 7 quedaron reemplazadas por las tareas T0–T13 de `web/PLAN_IMPLEMENTACION.md`.

Documento de trabajo para quien implemente el nuevo frontend (con Claude Code o a mano). Todo lo que figura como decisión ya fue acordado con el equipo. Lo que figura como *propuesta* se puede ajustar, pero conviene avisar antes de cambiarlo.

Leer antes de empezar: [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md), [`../frontend/map/README.md`](../frontend/map/README.md) (contrato de datos y API del módulo del mapa) y [`REGISTRO_S1.md`](REGISTRO_S1.md) (datos S1).

---

## 1. Objetivo

Reemplazar el frontend actual (versión infantil en `frontend/`, más la demo técnica en `frontend/map/`) por una aplicación web única con:

- una versión **científica** centrada en el mapa, con gráficos tipo dashboard, calendario de quema y comparación entre meses y años;
- páginas de **inicio**, **metodología** y **equipo**;
- la versión infantil actual conservada como sección **EduAustralis**;
- selector de idioma ES/EN y de tema claro/oscuro.

El backend no cambia: la app sigue siendo **estática** y lee los JSON que genera `frontend/map/scripts/build_mocks.py`. No se toca el pipeline.

## 2. Decisiones tomadas

| # | Decisión |
|---|---|
| 1 | Navbar con 5 secciones: **Inicio**, **Mapa y análisis**, **Metodología**, **Equipo**, **EduAustralis**. |
| 2 | Pantalla de mapa: el mapa es el protagonista. La **ficha de selección va debajo del mapa, a todo el ancho**, no al costado. |
| 3 | **Comparar** es un botón que arranca **apagado**. Al activarlo aparece el control triple **A \| AB \| B**. Se puede cambiar libremente entre los tres. |
| 4 | **AB** muestra una **barra vertical arrastrable** (izquierda–derecha): A a un lado y B al otro. Arranca en el 50 %. |
| 5 | **A** muestra solo el mapa A. **B** muestra solo el mapa B. Sin barra. |
| 6 | En comparación, A y B comparten **siempre la misma posición, zoom y escala de color**. |
| 7 | El **mapa base es siempre claro** (`claro`), aunque la interfaz esté en modo oscuro. |
| 8 | Se quita el gráfico **día vs noche**. |
| 9 | **ES/EN** y **tema claro/oscuro** en la navbar. EduAustralis **conserva** el idioma y el tema elegidos. |
| 10 | Los números del producto salen siempre de la **serie armonizada** (`n_equiv`). Los focos se dibujan pero **no se cuentan** como métrica. |

Referencia visual: boceto v3 acordado (navbar con selectores, barra de filtros, capas a la izquierda, mapa grande, ficha a todo el ancho, calendario y comparador de años, FRP y calidad del dato, pie fijo). Ver §4.

## 3. Estado de partida

| Pieza | Dónde está | Qué es |
|---|---|---|
| App Vue (infantil) | `frontend/` (Vue 3.5, Vite 8, Node ≥ 22.18) | Landing con cohete y páginas por animación. No usa vue-router: las páginas están en un arreglo `pages` dentro de `App.vue` (721 líneas). `MapView.vue` es un placeholder. Estilos globales en `src/style.css` (832 líneas). |
| Módulo del mapa | `frontend/map/src/map/` (MapLibre 5.24, deck.gl **9.4.0**, h3-js 4.5.0, Vite 6.3.5) | `createFireMap(el, opts)`. Capas, selección con lazo, resumen. JS puro, sin framework. |
| Barra de tiempo | `frontend/map/src/timebar/` | `createTimebar(el, opts)`. |
| Cálculo del resumen | `frontend/map/src/map/summary.js` | `summarize(...)`. **Sin DOM**: reutilizable tal cual. Pruebas en `frontend/map/tests/`. |
| Panel de selección | `frontend/map/src/map/selection.js` (701 líneas) | Mezcla la geometría (lazo, clic, Mayús) con el panel HTML. Hay que separarlas (§6, fase 2). |
| Datos | `frontend/map/public/mock-api` y `mock-api-local` (12–13 MB), `mock-conosur` (1,8 GB), `mock-s1` (2,2 GB, release `datos-s1-2026-11-15`) | JSON estático por mes. Ver contrato en `frontend/map/README.md`. |
| Despliegue | `scripts/deploy_vps.sh` | Hoy compila **`frontend/map`** con `VITE_MOCK_BASE=mock-s1` y sirve con Nginx (`try_files $uri $uri/ =404`). |

Restricciones técnicas conocidas:
- **No actualizar deck.gl a 9.1**: falla en Vite con `Cannot set properties of undefined (setting 'adapter')`. Mantener `9.4.0` exacto.
- Los índices H3 viajan como **string hex**. No convertirlos a número (superan 2^53).
- Los `mock-*` no se versionan. Para probar con 6 países hay que bajar el release de GitHub y descomprimirlo en `public/`.

## 4. Pantalla "Mapa y análisis": componentes

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1 Navbar: Terra Australis · Inicio · [Mapa y análisis] · Metodología │
│           · Equipo · EduAustralis ──────────── 2 ES|EN  ☀|☾          │
├──────────────────────────────────────────────────────────────────────┤
│ 3 Barra de filtros: Zona · Período A · Período B* · Métrica · Exportar│
├────────────┬─────────────────────────────────────────────────────────┤
│ 4 Capas    │ 5 Mapa  [Comparar] [A | AB | B]*   (* solo al comparar)│
│  mapa base │                                                         │
│  mostrar   │          mapa grande, barra vertical en AB              │
│  vista     │                                                         │
│  opacidad  │ ▶ línea de tiempo (mes · día)                           │
│  lazo      │                                                         │
├────────────┴─────────────────────────────────────────────────────────┤
│ 6 Ficha de la selección (a todo el ancho): A · B* · A−B* · anomalía  │
│   · origen del valor                                                 │
├───────────────────────────────────┬──────────────────────────────────┤
│ 7 Calendario de quema (año × mes) │ 8 Comparar años (serie mensual)  │
├───────────────────────────────────┼──────────────────────────────────┤
│ 9 Intensidad (FRP)                │ 10 Calidad del dato              │
├───────────────────────────────────┴──────────────────────────────────┤
│ 11 Pie fijo: advertencias, versión de datos, config_hash, atribución │
└──────────────────────────────────────────────────────────────────────┘
```

Responsive: en pantallas angostas (< 900 px) la columna de capas pasa a un cajón colapsable sobre el mapa, y los pares de gráficos se apilan.

### 4.1 Estado compartido (store)

Un único store (Pinia o `reactive` en un composable) es la fuente de verdad. Todo componente lo lee y lo modifica; nada se comunica "de a pares".

```js
state = {
  zone: <de meta.zone>,
  periodA: { from: '2024-02', to: '2024-02' },   // meses o ventana de días
  periodB: { from: '2023-02', to: '2023-02' },   // solo se usa si compare = true
  compare: false,                                 // botón Comparar
  compareMode: 'AB',                              // 'A' | 'AB' | 'B'
  splitPos: 0.5,                                  // posición de la barra (0..1)
  view: 'value',                                  // 'value' | 'anomaly' | 'diff'
  layers: { cells, points, outline, mask },
  hexOpacity: 0.75,
  selection: null,                                // resultado de map.getSelection()
  locale: 'es',                                   // 'es' | 'en'
  theme: 'system',                                // 'system' | 'light' | 'dark'
}
```

`locale` y `theme` se guardan en `localStorage` (con `try/catch`) y se aplican también a EduAustralis.

### 4.2 Comparar (A | AB | B)

- El botón **Comparar** conmuta `compare`. Apagado: se ve un solo mapa (período A), sin control triple, y la ficha y la barra de filtros no muestran B ni A−B.
- Al activarlo: aparece **A | AB | B**, con **AB** seleccionado y la barra al 50 %. Cambiar entre los tres es libre. Volver a AB recentra la barra.
- **AB**: dos mapas apilados en el mismo contenedor. El de B va arriba con `clip-path: inset(0 0 0 X%)`, donde X es la posición de la barra. La barra es un elemento con `pointer-events` propio, arrastrable con el mouse y con el dedo (`pointerdown` / `pointermove` / `pointerup`), con área de agarre ancha (≈ 20 px) y manija central. Teclado: la barra es un `role="slider"` (← → mueven 2 %, Inicio/Fin la llevan a los extremos).
- **A** / **B**: se oculta el otro mapa; no hay barra.
- Etiquetas flotantes "A · feb 2024" y "B · feb 2023" sobre cada mitad (en modo A o B, solo la que corresponde).
- **Cámara sincronizada**: dos instancias de `createFireMap`; el movimiento de una se replica en la otra con `jumpTo` (evitar bucles con un indicador de "movimiento programático"). Mismas resoluciones H3 y mismo `meta.map.domain` para la escala, así que los colores son comparables.
- **Recorte e interacción**: las zonas recortadas por `clip-path` no reciben eventos, así que un clic a la izquierda de la barra va a A y a la derecha a B. Los gestos de pan y zoom deben mover **ambos**.
- **Segunda instancia ligera**: agregar opciones a `createFireMap` para la instancia B (`ui: false` para ocultar leyenda, herramienta de lazo y panel; `interactive: true`). La selección con lazo vive solo en la instancia A y la geometría se aplica a los dos períodos al calcular la ficha.
- **Vista "Diferencia" (`view = 'diff'`)**: un solo mapa con `A − B` por celda, rampa divergente (`PUOR`, ya existe en `colors.js`) y dominio simétrico. En ese modo el control A | AB | B se oculta. Se calcula restando las tablas `map/res=<r>/<mes>` de A y de B, sumadas por período. En todo el producto se usa la notación **A − B** (el boceto mostraba "B−A" en el selector de vista; unificar a A − B).
- **Rendimiento**: dos mapas son dos contextos WebGL. Con S1 (2,69 M de celdas r7, 390 mil focos en un mes) medir antes de dar por buena la comparación. Plan B: en AB, limitar `pointBudget` de cada instancia a la mitad y mostrar los focos solo en la instancia activa.

### 4.3 Ficha de la selección (a todo el ancho)

Fila de tarjetas bajo el mapa. Se actualiza al dibujar, mover o borrar la selección, y al cambiar A o B.

| Tarjeta | Contenido | Origen |
|---|---|---|
| Encabezado | Cantidad de celdas y km² de la selección ("Lazo: 4.820 celdas · 24.100 km²"), botón borrar | `map.getSelection()` |
| A | Focos equivalentes del período A con intervalo p05–p95 | `summarize(...)` |
| B *(solo comparando)* | Igual, para B | `summarize(...)` |
| A − B *(solo comparando)* | Diferencia relativa. Si los intervalos de A y B se solapan, mostrar **"Diferencia no concluyente"** en lugar de un porcentaje destacado | cálculo propio sobre los dos resultados |
| Anomalía | Contra la mediana del mes (si la mediana es 0, diferencia absoluta), con el ranking ("3.er mes más activo desde 2018") | `calendar.json` (`anomaly_pct`, `pct_rank`) |
| Origen del valor | `MODIS (directo)` / `VIIRS convertido a escala MODIS` / `Terra sola, convertida`, marca de *estimado* y cobertura | `seriesInfo(meta)` y `summary.js` |

- Sin selección, la ficha muestra los valores de **toda la zona** (`calendar.json`).
- Si la selección es menor que ~12.400 km², avisar "por debajo de la escala validada".
- Botones **CSV** y **JSON** (ya existen en el panel actual): llevan la serie por mes con intervalo, origen y cobertura, más `dataset_version` y `config_hash`.
- Con comparación activa, el export incluye ambos períodos.
- El bloque exploratorio de biomasa y CO₂ del panel actual **no está en el boceto**. Pasa a una fase opcional (§6, fase 7) dentro de un acordeón cerrado con su advertencia.

### 4.4 Calendario de quema (7)

- Heatmap **año × mes** con `calendar.json`. Mismo color que las celdas del mapa (YlOrRd, escala log fija). Selector **Valor / Anomalía** (anomalía en divergente, usando `anomaly_pct`).
- Marcas obligatorias: **cobertura reducida** (`meta.reduced_coverage_months`, con trama), **estimado desde `switch_date`** (línea punteada) y la celda de **A** y de **B** resaltadas.
- Interacción: clic = fija el **período A**; Mayús + clic = fija el **período B** y activa Comparar si estaba apagado. Hover: valor, p05–p95 y estado.
- Accesible: es una tabla con `role="grid"` y navegación por flechas, no solo un `<svg>`.
- Opción posterior: vista **año × ventana de 8 días** con `timeline_8d.json`.

### 4.5 Comparar años (8)

- Eje X: meses 1–12. Una línea por año; por defecto, los años de A y de B (en el color de cada uno), más la **mediana histórica** punteada.
- Banda p05–p95 del período en foco; el usuario puede sumar más años con chips (máximo 6).
- Clic en un punto lleva A (o B, con Mayús) a ese mes.
- Si no está comparando, muestra el año de A contra la mediana.

### 4.6 Intensidad FRP (9)

- Histograma de FRP de los focos de la selección, con ejes log y barras de A y B.
- **Regla de producto**: los focos no se cuentan ni se comparan entre sensores. Mostrar el eje Y como **porcentaje de detecciones** del período (no como cantidad) y rotular "Descriptivo: no comparable entre sensores ni entre años". Agrupar por familia de sensor (MODIS / VIIRS) si el período las mezcla.
- Datos: `points/<mes>/<tesela>.json` (`frp`, `platform`). Solo se cargan las teselas que tocan la selección.

### 4.7 Calidad del dato (10)

- **Cobertura** del período (`coverage_frac`, `reduced_coverage_months`).
- **Origen del valor** como barra apilada (MODIS directo, VIIRS convertido, Terra sola) con la lógica de `seriesInfo(meta)`.
- **Proporción estimada** (meses posteriores a `switch_date`).
- Enlace a la página de Metodología.

### 4.8 Pie fijo (11)

Texto fijo en ES/EN: un foco no es un incendio confirmado; los valores son armonizados, no conteos crudos; ventanas menores a ~8 días tienen sesgo; versión de datos y `config_hash` (de `meta`); atribución NASA FIRMS y de los mapas base (OpenFreeMap/OSM).

### 4.9 Barra de filtros (3) y capas (4)

- Filtros: zona (solo lectura por ahora), selectores de **período A** y **B** (mes y año, o ventana de 8 días), métrica, **Exportar**.
- Capas: mapa base (solo se ofrece `claro` y `satelite`; ver §5), mostrar H3 / focos / máscara, vista (Valor / Anomalía / Diferencia), opacidad, botón **Lazo** (equivale a la tecla `L`).

## 5. Tema, idioma y mapa base

**Tema.** Variables CSS en `:root` y `[data-theme="dark"]`. Arranca con `prefers-color-scheme` y se puede forzar con el botón de la navbar. Los colores de gráficos (A, B, mediana, bandas) son tokens que cambian de tono entre temas. Las rampas del mapa (YlOrRd, PuOr) **no cambian**.

**Mapa base siempre claro.** Aunque la interfaz esté en oscuro, el mapa usa `claro` (OpenFreeMap Positron). Se envuelve en un marco con borde para que no "choque" con el fondo oscuro. No ofrecer `oscuro` ni `calles` en el selector; `satelite` queda disponible porque muestra las cicatrices de los incendios (confirmarlo con el equipo; si no, quitarlo también).

**Idioma.** `vue-i18n` con `src/locales/es.json` y `en.json`. Claves por componente (`nav.map`, `compare.button`, etc.). Reglas:
- Formato de números y fechas con `Intl` según `locale` (`es-AR` / `en-US`).
- El módulo del mapa tiene textos en español dentro de `index.js`, `selection.js` y `timebar/index.js` (meses `ene`…`dic`, mensajes de estado, etiquetas del lazo). Hay que **parametrizarlos** (§6, fase 2): el módulo recibe `locale` y un diccionario, o emite datos y la UI de Vue los traduce.
- Los contenidos largos (Inicio, Metodología, Equipo) se escriben una vez por idioma; no traducir en el código.
- Dejar un script o prueba que detecte claves faltantes entre `es.json` y `en.json`.

## 6. Plan de trabajo por fases

Cada fase termina en algo que se puede ver y probar. Hacer un PR por fase.

### Fase 0 · Preparación (½ día)
- Crear rama `feature/frontend-cientifico`.
- Bajar el release `datos-s1-2026-11-15` y descomprimir `S1_mapa_mock-s1.zip` en `frontend/map/public/` para probar con datos grandes. Verificar con `?datos=mock-s1`.
- Confirmar que `npm run dev` funciona en `frontend/` y en `frontend/map/`, y que `npm test` pasa en `frontend/map`.
- **Criterio de salida**: ambas apps corren y las pruebas pasan.

### Fase 1 · Estructura de la app y navegación (1–2 días)
- Instalar `vue-router`. Rutas: `/` (Inicio), `/mapa`, `/metodologia`, `/equipo`, `/edu`. **Propuesta**: `createWebHashHistory`, porque Nginx hoy sirve con `try_files … =404` y así no hay que tocar el servidor. Si se prefiere URL limpia, cambiar `try_files` a `/index.html` en `scripts/deploy_vps.sh`.
- Crear `src/views/` (una vista por ruta), `src/components/layout/AppNavbar.vue`, `AppFooter.vue`, y `src/stores/` (estado compartido, §4.1).
- **Mover el contenido infantil actual a `src/views/EduAustralis.vue`** con su arreglo `pages`, el cohete y las animaciones. **Los estilos de `style.css` son globales**: encapsularlos bajo una clase raíz (`.edu-root`) o en el componente, para que no afecten a la parte científica. Quitar `HelloWorld.vue`, `TheWelcome.vue`, `WelcomeItem.vue` e `icons/` si siguen sin usarse.
- Navbar con las 5 secciones, selector ES/EN y tema (todavía sin textos reales). Instalar `vue-i18n` y cargar `es`/`en` mínimos.
- **Criterio de salida**: se navega entre las 5 rutas; EduAustralis se ve igual que hoy; cambiar idioma y tema persiste al recargar.

### Fase 2 · Integrar el mapa en Vue (2–3 días)
- Mover `frontend/map/src/map/` y `frontend/map/src/timebar/` a `frontend/src/features/fire-map/` (conservar `git mv` para no perder historial). Mover `tests/` y `scripts/build_mocks.py` y agregar `"test": "node --test tests/*.test.mjs"` al `package.json` del frontend. Alinear dependencias: `maplibre-gl 5.24.0`, `@deck.gl/* 9.4.0` (exacto), `h3-js 4.5.0`, y verificar con la versión de Vite de la app Vue.
- Mover los datos `mock-*` a `frontend/public/` (siguen sin versionarse; revisar `.gitignore`, hoy `frontend/map/public/` aparece como no versionado).
- Crear `src/components/map/FireMap.vue`: monta `createFireMap` en `onMounted`, lo destruye en `onBeforeUnmount`, y sincroniza `periodA`, `view`, `layers` y `hexOpacity` desde el store. Reemplazar el placeholder `MapView.vue`.
- **Separar `selection.js`** en (a) geometría de selección (lazo, clic, Mayús+clic, `selectPolygon`, outline) y (b) panel HTML. El módulo emite `selection` con los datos y **no dibuja el panel** (`ui.panel: false`). La ficha se dibuja en Vue (fase 4).
- Parametrizar textos y formato por `locale` (§5).
- Añadir opciones a `createFireMap`: `ui` (leyenda, herramienta de lazo, panel), `interactive`, y un evento `move` para sincronizar cámaras.
- Montar `createTimebar` en un componente `TimeBar.vue` (`input` → `setPeriod`).
- **Criterio de salida**: la ruta `/mapa` muestra el mapa con la barra de tiempo, el lazo funciona y emite la selección, con datos `mock-api` y `mock-s1`. Pruebas existentes pasan.

### Fase 3 · Pantalla del mapa: layout, filtros y capas (1–2 días)
- Layout de §4 con CSS grid: capas (izquierda) + mapa (derecha); la ficha y los gráficos ocupan filas completas debajo.
- Barra de filtros (3) con selectores de período A y B. Panel de capas (4). Barra de tiempo ligada al período A.
- Marco claro para el mapa en modo oscuro. Mapa base fijo en `claro`.
- **Criterio de salida**: el layout coincide con el boceto en escritorio y se apila bien en móvil.

### Fase 4 · Ficha de la selección (1–2 días)
- `SelectionSummary.vue`: tarjetas de §4.3, usando `summarize(...)`, `seriesInfo(meta)` y `calendar.json`.
- Con zona completa (sin selección) usar `calendar.json`; con selección, `summarize`.
- Exportar CSV/JSON con `dataset_version` y `config_hash`.
- Textos en ES/EN, números con `Intl`.
- **Criterio de salida**: los valores de la ficha coinciden con los del panel actual de `frontend/map` para la misma selección y el mismo mes (comparar a mano en 3 casos y dejar una prueba automática sobre `summarize`).

### Fase 5 · Comparar A | AB | B (3–4 días)
- Botón **Comparar**, control triple y barra (§4.2).
- Segunda instancia de `createFireMap` con cámara sincronizada y `clip-path`.
- Tarjetas B y A − B en la ficha, incluyendo la regla de "diferencia no concluyente".
- Vista **Diferencia** (`view = 'diff'`).
- Medir rendimiento con S1 (FPS al arrastrar la barra, memoria, cantidad de contextos WebGL). Aplicar el plan B de §4.2 si hace falta.
- **Criterio de salida**: cambiar entre A, AB y B es inmediato; la barra se arrastra con mouse, dedo y teclado; las cámaras no se desfasan al hacer pan y zoom; B y A − B aparecen solo al comparar.

### Fase 6 · Gráficos (3–4 días)
- Instalar ECharts (o Observable Plot; **propuesta**: ECharts, por la integración con Vue, heatmaps y bandas). Importar solo los módulos usados (`echarts/core`) para cuidar el tamaño.
- Un componente por gráfico: `BurnCalendar.vue` (§4.4), `YearCompare.vue` (§4.5), `FrpHistogram.vue` (§4.6), `DataQuality.vue` (§4.7).
- Los gráficos leen `calendar.json`, `timeline_8d.json` y, para FRP, solo las teselas de la selección. No recorrer todos los focos.
- Todos responden al tema y al idioma, con descripciones accesibles (`aria-label`) y una tabla alternativa colapsable.
- **Criterio de salida**: clic en el calendario mueve el mapa; Mayús + clic fija B; las marcas de cobertura reducida y de estimado se ven en los gráficos.

### Fase 7 · Páginas de contenido (2–3 días)
- **Inicio**: objetivo del proyecto, problema (MODIS vs VIIRS), cifras clave, a quién sirve, botón "Abrir el mapa". Contenido base en `FUNDAMENTOS_DEL_PROYECTO.md`, §§1–3.
- **Metodología**: esquema FIRMS → normalización → calibración → validación → mapa, con índice lateral (fuentes, normalización, calibración `k`, validación, incertidumbre, limitaciones, glosario, descargas). Contenido en `PLAN_NORMALIZACION.md`, `PLAN_MODULO_DATOS.md` y `REGISTRO_S1.md` (tabla de validación: sesgo +262 % → +0,05 %). Citar los límites (S1 empieza en 2018, no se usa NOAA-21, etc.).
- **Equipo**: fotos, nombres, roles, enlaces; el desafío NASA Space Apps; agradecimientos y fuentes (NASA FIRMS). Los datos del equipo los completa el equipo.
- Cada página existe en ES y EN.
- Opcional dentro de esta fase: acordeón "Exploratorio: biomasa y CO₂" en la ficha, con su advertencia ("no validada").

### Fase 8 · Calidad, accesibilidad y despliegue (2 días)
- **Despliegue**: actualizar `scripts/deploy_vps.sh` (`MAP_DIR` pasa de `frontend/map` a `frontend`), mantener `VITE_MOCK_BASE=mock-s1` y la copia de `mock-s1/` a la raíz web. Actualizar `documentacion/DESPLIEGUE_VPS.md`.
- Documentación: reescribir `frontend/README.md` (hoy es la plantilla de Vue), actualizar `README.md` raíz, `frontend/map/README.md` (movido) y `ARQUITECTURA.md`. Retirar la app demo `frontend/map/` una vez que haya paridad.
- Accesibilidad: foco visible, contraste en ambos temas, navegación por teclado en barra, calendario y navbar, `prefers-reduced-motion` para la animación del cohete y la reproducción.
- Pruebas: unitarias de `summarize`, del store y de la posición de la barra; prueba de claves i18n; verificación manual en Chrome y Firefox, escritorio y móvil.
- **Criterio de salida**: `npm run build` sin errores; sitio funcionando con S1 en una VPS de prueba o con `npm run preview`.

Estimación total: ~3 a 4 semanas de una persona, con las fases 5 y 6 como las de mayor riesgo.

## 7. Estructura de carpetas propuesta

```
frontend/
  public/                 # favicon, imágenes de EduAustralis, mock-*/ (no versionados)
  src/
    main.js
    App.vue               # <AppNavbar/> + <RouterView/> + <AppFooter/>
    router.js
    stores/               # estado compartido, tema, idioma
    locales/              # es.json, en.json
    styles/               # tokens.css (tema), base.css
    components/
      layout/             # AppNavbar, AppFooter, ThemeToggle, LangToggle
      map/                # FireMap, CompareMap, CompareControl, TimeBar, LayerPanel, FilterBar
      summary/            # SelectionSummary
      charts/             # BurnCalendar, YearCompare, FrpHistogram, DataQuality
    features/
      fire-map/           # ex frontend/map/src/map  (+ timebar/)
    views/
      HomeView, MapView, MethodView, TeamView, EduAustralis
  scripts/build_mocks.py  # ex frontend/map/scripts
  tests/                  # ex frontend/map/tests
```

## 8. Datos que consume cada componente

| Componente | Archivos | Notas |
|---|---|---|
| Mapa y capas | `meta.json`, `map/res=<r>/<mes>.json`, `points/<mes>/…` | Resolución según zoom (r5 < 6, r6 6–8, r7 ≥ 8). Celdas por mes, focos por tesela. |
| Barra de tiempo | `calendar.json`, `timeline_8d.json` | Sin cambios. |
| Ficha | `calendar.json`, `est/<mes>.json`, `est/ratios.json`, `map/res=7/…`, `points/…` | La selección y los números se calculan **siempre en r7**. El intervalo reproduce `p05/p95` de la zona. |
| Calendario y comparar años | `calendar.json` (`n_equiv`, `p05`, `p95`, `median`, `anomaly_pct`, `pct_rank`, `coverage_frac`, `status`) | Una fila por mes, sin huecos. |
| FRP | `points/<mes>/<tesela>.json` (`frp`, `platform`) | La tesela de un foco es la **madre de su celda r7**. Ver la nota en `frontend/map/README.md`. |
| Calidad | `meta.json` (`reduced_coverage_months`, `platform_periods`, `switch_date`, `dataset_version`, `config_hash`) | |

No se agregan endpoints ni archivos nuevos. Si hiciera falta un agregado que hoy no existe (por ejemplo, totales por año), agregarlo en `build_mocks.py` y documentarlo en el contrato.

## 9. Riesgos y cómo manejarlos

| Riesgo | Mitigación |
|---|---|
| Dos mapas con S1 son pesados | Medir en la fase 5; plan B de §4.2; el selector de período no ofrece más de 36 meses (`maxCellMonths`). |
| Cámaras desfasadas entre A y B | Un solo origen de verdad de la cámara; indicador de movimiento programático para evitar bucles. |
| `style.css` global rompe la parte científica | Encapsular EduAustralis en la fase 1, antes de crear nuevas vistas. |
| Textos fijos en español dentro del módulo del mapa | Parametrizar por `locale` en la fase 2; test de claves faltantes. |
| Interpretación errónea de los gráficos | Pie fijo, avisos de "estimado", "cobertura reducida", "no concluyente" y "descriptivo". |
| Anomalía por celda casi siempre `null` | No ofrecer anomalía por celda como dato principal; la anomalía útil es la de zona o selección. |
| Dependencias externas de teselas | El mapa base necesita internet. Las capas se dibujan igual sin él; mostrar un aviso si falla. |
| Cambios de versión (Vite 6 vs 8, deck.gl) | Fijar versiones exactas y probar el build antes de seguir. |

## 10. Criterios de cierre

- Las cinco secciones existen, en ES y EN, en tema claro y oscuro.
- `/mapa` cumple las decisiones de §2: ficha bajo el mapa, Comparar con A | AB | B, barra arrastrable, cámara y escala compartidas, mapa base claro.
- Los números de la ficha coinciden con el panel anterior para los mismos datos.
- Los gráficos respetan las reglas de §4 (focos no contados, estimado y cobertura marcados).
- `npm run build` y `npm test` pasan; se desplegó con S1 y la URL quedó registrada en `FUNDAMENTOS_DEL_PROYECTO.md`.
- No hay credenciales ni datos pesados en Git.

## 11. Cómo trabajar con Claude Code

- Pedir **una fase por vez** y revisar el PR antes de pasar a la siguiente.
- Darle como contexto este archivo, `frontend/map/README.md` y el boceto. Ejemplo de primer pedido: *"Leé `documentacion/PLAN_FRONTEND_CIENTIFICO.md` y hacé la Fase 1. No toques el pipeline ni los datos."*
- Para la fase 5, pedir primero una **prueba de concepto** de dos mapas sincronizados con la barra, y medir el rendimiento con S1 antes de integrarla.
- Después de cada fase, que verifique en el navegador (`npm run dev`) en escritorio y en móvil, claro y oscuro, ES y EN.
- Cualquier cambio de método o de lo que significa un número se consulta con el equipo de datos; es decisión de ellos, no del frontend.

