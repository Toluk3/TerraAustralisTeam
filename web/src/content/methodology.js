/**
 * Contenido de la página Proyecto (metodología), escrito una vez por idioma.
 * Fuentes: documentacion/PLAN_NORMALIZACION.md, PLAN_MODULO_DATOS.md y REGISTRO_S1.md. No agregar cifras
 * que no estén en esos documentos.
 */
export const REPO_URL = 'https://github.com/Toluk3/TerraAustralisTeam';
export const RELEASE_URL = 'https://github.com/Toluk3/TerraAustralisTeam/releases/tag/datos-s1-2026-11-15';

export const methodology = {
  es: {
    title: 'Cómo se arma la serie',
    lead: 'De los focos de NASA FIRMS a una serie mensual comparable entre los años de MODIS y los de VIIRS: qué se normaliza, cómo se calibra, cómo se valida y qué no se puede afirmar.',
    toc: 'En esta página',
    flow: ['FIRMS', 'Normalización', 'Calibración', 'Validación', 'Mapa'],
    flowLabel: 'Flujo de datos: FIRMS, normalización, calibración, validación y mapa',
    sections: [
      {
        id: 'metodologia', title: 'Metodología',
        body: [
          'El pipeline (Python, DuckDB y H3) une las observaciones de MODIS y VIIRS en un esquema común, las filtra, las agrega en una grilla de hexágonos H3 y las armoniza con factores de calibración ajustados mientras los dos sensores observaron a la vez.',
          'La serie que muestra la app es la armonizada: focos equivalentes en la escala de MODIS Terra + Aqua. Los conteos crudos por plataforma sirven para evaluar sesgos, no se muestran como métrica.',
        ],
        diagram: true,
      },
      {
        id: 'fuentes', title: 'Fuentes',
        body: ['Productos de focos activos de NASA FIRMS. Cada fila es una detección asociada al centro de un píxel, no la ubicación exacta de un fuego ni un incendio confirmado.'],
        table: {
          head: ['Sistema', 'Plataforma', 'Desde', 'Uso'],
          rows: [
            ['MODIS', 'Terra', 'noviembre de 2000', 'Parte inicial de la serie y referencia'],
            ['MODIS', 'Aqua', 'julio de 2002', 'Completa la referencia Terra + Aqua'],
            ['VIIRS', 'NOAA-20', 'abril de 2018', 'Serie estimada desde 2022'],
            ['VIIRS', 'NOAA-21', 'enero de 2024', 'Configurada; usa el k de NOAA-20'],
            ['VIIRS', 'S-NPP', 'enero de 2012', 'Fuera de la serie'],
          ],
        },
      },
      {
        id: 'metrica', title: 'Métrica y grilla',
        body: [
          'La métrica es n_clusters_det: celdas H3 r8 distintas con fuego en una pasada; de noche, cada cluster VIIRS cuenta según la probabilidad de que MODIS lo detecte por su FRP. De día, y para MODIS, es igual a n_clusters.',
          'La referencia es Terra + Aqua (cubre desde noviembre de 2000). Los agregados se guardan en celdas H3 r7 (≈ 5 km²); el mapa publica además r5 y r6 para los zooms lejanos. La región de calibración es r3.',
        ],
      },
      {
        id: 'calibracion', title: 'Calibración',
        body: [
          'El factor k es un cociente de sumas entre la métrica de referencia y la de la plataforma fuente durante el solape: k = suma(referencia) / suma(fuente). Se estratifica por región, mes, día/noche y plataforma, con respaldo r3 → r2 → r1 → global cuando un estrato tiene pocas observaciones.',
          'Hasta el 31 de diciembre de 2021 la serie toma MODIS observado; desde el 1 de enero de 2022 (switch_date) usa VIIRS multiplicado por su k. Los factores se aplican a los agregados diarios antes de formar meses o ventanas de ocho días.',
        ],
      },
      {
        id: 'validacion', title: 'Validación',
        body: [
          'Validación de NOAA-20 contra MODIS en la muestra S1 (Argentina, Chile, Uruguay, Brasil, Paraguay y Bolivia, 2018–2025), de reportes/ablacion.csv:',
        ],
        table: {
          head: ['Variante', 'Sesgo relativo', 'NMAE', 'Correlación', 'Pred/obs'],
          rows: [
            ['Sin corrección', '+262 %', '0,395', '0,966', '3,62'],
            ['k_region_mes (mejor NMAE)', '+0,6 %', '0,060', '0,978', '1,006'],
            ['k_region_mes_dianoche_clusters_det (configurada)', '+0,05 %', '0,064', '0,984', '1,000'],
          ],
        },
        after: [
          'k global de NOAA-20: 0,44 de día y 0,29 de noche. Criterio de aceptación: cociente armonizado / MODIS de cada año entre 0,9 y 1,1 (día + noche y día), y sesgo anual dentro de ±10 %.',
        ],
      },
      {
        id: 'incertidumbre', title: 'Incertidumbre',
        body: [
          'El intervalo p05–p95 sale de réplicas bootstrap de k: lo observado con la referencia queda fijo y lo convertido se multiplica por el cociente de cada réplica. Para la zona entera reproduce p05 y p95 de calendar.json.',
          'Solo refleja la incertidumbre de k, no el error de aplicar un k regional a pocas celdas. Por eso la ficha avisa cuando una selección es más chica que una región de calibración (~12.400 km²). Las bandas no se suman celda por celda ni mes por mes: se suman las réplicas.',
        ],
      },
      {
        id: 'cobertura', title: 'Cobertura y datos estimados',
        body: [
          'El pipeline distingue un período con detecciones, uno cubierto sin detecciones y uno sin cobertura suficiente. Los meses con cobertura reducida (por ejemplo, el corte de Aqua de agosto de 2020) se marcan en el mapa, el calendario y la barra de tiempo.',
          'Desde switch_date los valores son estimados (VIIRS × k). La anomalía se mide contra la mediana del período base (2003–2021 en la configuración principal) y solo en meses de cobertura completa.',
        ],
      },
      {
        id: 'limitaciones', title: 'Limitaciones',
        list: [
          'Un foco no es un incendio confirmado: puede haber varios focos por evento y más de una fuente de calor por píxel.',
          'Sin detecciones no prueba que no hubo fuego: puede haber nubes, datos faltantes o cobertura reducida.',
          'Ventanas menores a ~8 días tienen sesgo (guía de MODIS): la serie principal es mensual.',
          'Muestra S1: empieza en 2018, así que la mediana de las anomalías sale de 2018–2021 (4 años); el ajuste de Terra usa solo 2018–2019; NOAA-21 no está porque FIRMS no lo publica en el archivo por país.',
          'Un k calibrado en una región no es necesariamente válido para todas las demás.',
          'La estimación de biomasa y CO₂ a partir del FRP no está validada y queda fuera de esta app.',
        ],
      },
      {
        id: 'glosario', title: 'Glosario',
        terms: [
          ['Foco', 'Detección de FIRMS en el centro de un píxel con anomalía térmica.'],
          ['Foco equivalente', 'Unidad de la serie armonizada (n_equiv): lo que habrían contado Terra + Aqua. Puede ser fraccionario.'],
          ['FRP', 'Potencia radiativa del fuego, en MW. Describe intensidad; no se compara entre sensores.'],
          ['H3', 'Grilla global de hexágonos. r7 ≈ 5 km², r6 ≈ 36 km², r5 ≈ 250 km², r3 ≈ 12.400 km².'],
          ['k', 'Factor que lleva la métrica de VIIRS a la escala de MODIS, por región, mes y día/noche.'],
          ['switch_date', 'Fecha desde la que la serie se estima con VIIRS (2022-01-01).'],
          ['p05–p95', 'Intervalo del 90 % de las réplicas bootstrap de k.'],
          ['Cobertura', 'Fracción del mes con datos de la serie (1 = completo).'],
        ],
      },
      {
        id: 'datos', title: 'Datos y código',
        body: ['El código del pipeline y de esta app está en el repositorio. Los JSON del mapa de la muestra S1 están publicados como adjuntos del release datos-s1-2026-11-15.'],
        links: [
          { href: REPO_URL, text: 'Repositorio en GitHub' },
          { href: RELEASE_URL, text: 'Release de datos S1 (2026-11-15)' },
        ],
      },
    ],
  },
  en: {
    title: 'How the series is built',
    lead: 'From NASA FIRMS hotspots to a monthly series that compares MODIS years with VIIRS years: what is normalized, how it is calibrated, how it is validated and what cannot be claimed.',
    toc: 'On this page',
    flow: ['FIRMS', 'Normalization', 'Calibration', 'Validation', 'Map'],
    flowLabel: 'Data flow: FIRMS, normalization, calibration, validation and map',
    sections: [
      {
        id: 'metodologia', title: 'Methodology',
        body: [
          'The pipeline (Python, DuckDB and H3) brings MODIS and VIIRS observations into a common schema, filters them, aggregates them on an H3 hexagon grid and harmonizes them with calibration factors fitted while both sensors were observing at the same time.',
          'The series the app shows is the harmonized one: equivalent hotspots on the MODIS Terra + Aqua scale. Raw counts per platform are used to assess bias; they are not shown as a metric.',
        ],
        diagram: true,
      },
      {
        id: 'fuentes', title: 'Sources',
        body: ['NASA FIRMS active-fire products. Each row is a detection tied to the center of a pixel, not the exact location of a fire nor a confirmed fire.'],
        table: {
          head: ['System', 'Platform', 'Since', 'Use'],
          rows: [
            ['MODIS', 'Terra', 'November 2000', 'Start of the series and reference'],
            ['MODIS', 'Aqua', 'July 2002', 'Completes the Terra + Aqua reference'],
            ['VIIRS', 'NOAA-20', 'April 2018', 'Estimated series since 2022'],
            ['VIIRS', 'NOAA-21', 'January 2024', 'Configured; uses the NOAA-20 k'],
            ['VIIRS', 'S-NPP', 'January 2012', 'Not in the series'],
          ],
        },
      },
      {
        id: 'metrica', title: 'Metric and grid',
        body: [
          'The metric is n_clusters_det: distinct H3 r8 cells with fire in one overpass; at night, each VIIRS cluster counts by the probability that MODIS would detect it given its FRP. By day, and for MODIS, it equals n_clusters.',
          'The reference is Terra + Aqua (covers from November 2000). Aggregates are stored in H3 r7 cells (≈ 5 km²); the map also publishes r5 and r6 for distant zooms. The calibration region is r3.',
        ],
      },
      {
        id: 'calibracion', title: 'Calibration',
        body: [
          'The k factor is a ratio of sums between the reference metric and the source platform metric during the overlap: k = sum(reference) / sum(source). It is stratified by region, month, day/night and platform, falling back r3 → r2 → r1 → global when a stratum has few observations.',
          'Up to 31 December 2021 the series takes observed MODIS; from 1 January 2022 (switch_date) it uses VIIRS multiplied by its k. Factors are applied to daily aggregates before forming months or eight-day windows.',
        ],
      },
      {
        id: 'validacion', title: 'Validation',
        body: [
          'Validation of NOAA-20 against MODIS on the S1 sample (Argentina, Chile, Uruguay, Brazil, Paraguay and Bolivia, 2018–2025), from reportes/ablacion.csv:',
        ],
        table: {
          head: ['Variant', 'Relative bias', 'NMAE', 'Correlation', 'Pred/obs'],
          rows: [
            ['No correction', '+262 %', '0.395', '0.966', '3.62'],
            ['k_region_mes (best NMAE)', '+0.6 %', '0.060', '0.978', '1.006'],
            ['k_region_mes_dianoche_clusters_det (configured)', '+0.05 %', '0.064', '0.984', '1.000'],
          ],
        },
        after: [
          'Global NOAA-20 k: 0.44 by day and 0.29 by night. Acceptance criterion: harmonized / MODIS ratio for each year between 0.9 and 1.1 (day + night and day), and annual bias within ±10 %.',
        ],
      },
      {
        id: 'incertidumbre', title: 'Uncertainty',
        body: [
          'The p05–p95 interval comes from bootstrap replicates of k: what the reference observed stays fixed and the converted part is multiplied by each replicate’s ratio. For the whole area it reproduces p05 and p95 from calendar.json.',
          'It only reflects the uncertainty of k, not the error of applying a regional k to a few cells. That is why the summary warns when a selection is smaller than a calibration region (~12,400 km²). Bands are not added cell by cell or month by month: replicates are.',
        ],
      },
      {
        id: 'cobertura', title: 'Coverage and estimated data',
        body: [
          'The pipeline tells apart a period with detections, a covered period without detections and a period without enough coverage. Months with reduced coverage (for example, the Aqua outage in August 2020) are marked on the map, the calendar and the time bar.',
          'From switch_date values are estimated (VIIRS × k). The anomaly is measured against the median of the base period (2003–2021 in the main configuration) and only in months with full coverage.',
        ],
      },
      {
        id: 'limitaciones', title: 'Limitations',
        list: [
          'A hotspot is not a confirmed fire: one event can produce several hotspots, and one pixel can hold more than one heat source.',
          'No detections does not prove there was no fire: there may be clouds, missing data or reduced coverage.',
          'Windows shorter than ~8 days are biased (MODIS guide): the main series is monthly.',
          'S1 sample: it starts in 2018, so the anomaly median comes from 2018–2021 (4 years); the Terra fit uses only 2018–2019; NOAA-21 is absent because FIRMS does not publish it in the per-country archive.',
          'A k calibrated in one region is not necessarily valid for every other region.',
          'Biomass and CO₂ estimates from FRP are not validated and are outside this app.',
        ],
      },
      {
        id: 'glosario', title: 'Glossary',
        terms: [
          ['Hotspot', 'FIRMS detection at the center of a pixel with a thermal anomaly.'],
          ['Equivalent hotspot', 'Unit of the harmonized series (n_equiv): what Terra + Aqua would have counted. It can be fractional.'],
          ['FRP', 'Fire radiative power, in MW. Describes intensity; not compared across sensors.'],
          ['H3', 'Global hexagon grid. r7 ≈ 5 km², r6 ≈ 36 km², r5 ≈ 250 km², r3 ≈ 12,400 km².'],
          ['k', 'Factor that brings the VIIRS metric to the MODIS scale, per region, month and day/night.'],
          ['switch_date', 'Date from which the series is estimated with VIIRS (2022-01-01).'],
          ['p05–p95', 'Interval of 90 % of the k bootstrap replicates.'],
          ['Coverage', 'Share of the month with series data (1 = complete).'],
        ],
      },
      {
        id: 'datos', title: 'Data and code',
        body: ['The pipeline and this app live in the repository. The S1 sample map JSON files are published as assets of the datos-s1-2026-11-15 release.'],
        links: [
          { href: REPO_URL, text: 'GitHub repository' },
          { href: RELEASE_URL, text: 'S1 data release (2026-11-15)' },
        ],
      },
    ],
  },
};
