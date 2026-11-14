# Datos FIRMS: fuentes, estructura y preparación

## Resumen

Este documento describe cómo se utilizan los datos de focos activos de NASA FIRMS en Terra Australis y cómo el pipeline los prepara para el análisis y la demostración del mapa. El pipeline procesa productos MODIS y VIIRS en un flujo común; las decisiones efectivamente implementadas se detallan en [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md).

La disponibilidad de un producto o de un archivo descargado no significa que las corridas lo incluyan. S-NPP está disponible en FIRMS pero no integra la serie ([`DECISIONES.md`](DECISIONES.md)).

## 1. Fuentes y cobertura

Los productos de entrada provienen de NASA FIRMS. La configuración actual y los planes de análisis contemplan las siguientes plataformas:

| Sistema | Plataforma | Período de referencia en el proyecto | Observación de uso |
|---|---|---|---|
| MODIS | Terra | Desde noviembre de 2000 | Parte inicial de la serie histórica |
| MODIS | Aqua | Desde julio de 2002 | Complementa la referencia MODIS |
| VIIRS | Suomi NPP (S-NPP) | Desde enero de 2012 | Fuera de la serie y de la descarga por defecto; ver `DECISIONES.md` |
| VIIRS | NOAA-20 | Desde abril de 2018 | Usado en las corridas por lote documentadas |
| VIIRS | NOAA-21 | Desde enero de 2024 | Configurado como plataforma posible; su participación en la publicación debe confirmarse |

El pipeline y el README del proyecto documentan datos estándar de Argentina hasta 2025 y dejan la incorporación de observaciones NRT de 2026 como trabajo pendiente. Las fechas anteriores describen períodos de operación, no garantizan que todas las fuentes estén disponibles en cada ejecución local. Los archivos fuente se guardan fuera del control de versiones.

## 2. Qué representa una detección

Cada fila representa una detección del producto satelital asociada al centro de un píxel. No representa necesariamente la ubicación exacta del fuego ni un incendio individual confirmado. Un mismo evento puede producir varias detecciones, y un píxel puede contener más de una fuente de calor.

MODIS tiene píxeles mayores y una serie histórica más larga. VIIRS observa con mayor detalle espacial y tiende a registrar más detecciones, incluidas fuentes pequeñas. Por ello, los conteos crudos de ambas plataformas no son directamente comparables.

## 3. Campos relevantes para el procesamiento

Los archivos de entrada presentan columnas equivalentes con nombres distintos según el producto. El pipeline conserva la procedencia y unifica los campos necesarios para filtrar, agregar y calibrar:

| Información | Campos FIRMS habituales | Uso en el pipeline |
|---|---|---|
| Posición | `latitude`, `longitude` | Ubicación del centro del píxel y asignación a H3 |
| Fecha y hora | `acq_date`, `acq_time` | Fecha UTC, fecha solar local y agregaciones temporales |
| Plataforma y producto | `satellite`, `instrument`, `version` | Identificación del sensor, plataforma y época algorítmica |
| Temperatura de brillo | `brightness` / `bright_ti4`, `bright_t31` / `bright_ti5` | Campos comunes de infrarrojo medio y térmico |
| Calidad y tipo | `confidence`, `type` | Clasificación de confianza y exclusión de tipos no vegetales cuando corresponde |
| Intensidad | `frp` | Potencia radiativa de fuego; no reemplaza el conteo armonizado |
| Tamaño del píxel | `scan`, `track` | Control de geometría y contextualización de la resolución |

La clasificación de confianza no tiene el mismo formato en ambos sistemas: MODIS entrega una escala numérica y VIIRS categorías. El pipeline aplica una regla común configurable; su equivalencia es operativa y no una igualdad física entre algoritmos.

## 4. Preparación y trazabilidad

La línea de procesamiento implementada es:

```text
Archivos FIRMS → ingesta → normalización y QC → calendario/cobertura
               → H3 y agregación → calibración → rollups
               → validación → productos de publicación
```

Los registros originales se conservan como entrada; los datos generados se escriben en `data/` y no se versionan. Las tablas y archivos del pipeline preservan identificadores de origen para facilitar la trazabilidad. El resultado `data/publish/` alimenta el generador de JSON estáticos del frontend.

El procesamiento se ejecuta con Python y DuckDB; H3 proporciona la grilla espacial. Esta solución reemplaza las propuestas iniciales basadas en otras combinaciones de librerías. No se requiere consultar FIRMS en vivo para ejecutar el análisis de archivos ya descargados.

## 5. Controles y limitaciones

- Los datos representan focos detectados, no perímetros de incendio ni verificación en terreno.
- La falta de filas puede deberse a ausencia de detecciones, datos faltantes o cobertura reducida; no debe interpretarse automáticamente como ausencia de fuego.
- La cobertura y los horarios de observación cambian por plataforma y período. Los primeros años de MODIS tienen una sola plataforma disponible y Aqua tuvo un corte en agosto de 2020.
- La calidad de algunos atributos cambia entre colecciones y épocas algorítmicas. El pipeline conserva esa información para el control de calidad.
- Los datos recientes NRT pueden carecer del atributo `type`; por eso la normalización incorpora una máscara de fuentes estáticas.
- La lista de plataformas de una corrida es la de `viirs_priority` y `platform_periods` en su configuración. La principal y los lotes usan las mismas.
- El conjunto de datos y la salida publicada son locales y están excluidos de Git; su generación debe realizarse antes de construir el frontend.

## 6. Estado y documentación relacionada

La ingesta, normalización, agregación, calibración, controles de calidad y exportación están implementados en `pipeline/`. Las pruebas del pipeline se ejecutan con `python -m pytest`; sus instrucciones detalladas están en [`pipeline/README.md`](../pipeline/README.md).

- [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md) presenta el propósito y estado general.
- [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md) documenta las reglas metodológicas y la serie armonizada.
- [`PLAN_ANALISIS_LOTES.md`](PLAN_ANALISIS_LOTES.md) describe la organización de las corridas y la evidencia versionada.
- [`casos de uso/`](../casos%20de%20uso/) contiene procedimientos operativos para descargar, procesar y publicar.

Los manuales técnicos de FIRMS y los archivos descargados deben consultarse para validar la versión y los atributos de cada producto; no se incluyen en el repositorio.
