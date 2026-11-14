# FUNDAMENTOS DEL PROYECTO — TERRA AUSTRALIS

## Resumen ejecutivo

Terra Australis desarrolla una herramienta para explorar la actividad de fuego detectada por satélite en el norte de la Patagonia argentina, con foco en Río Negro y Neuquén. El proyecto combina observaciones históricas de MODIS con observaciones de mayor detalle espacial de VIIRS y las transforma en una serie temporal armonizada, apta para comparar períodos sin confundir diferencias entre sensores con cambios reales en la actividad observada.

La solución que existe en el repositorio tiene dos componentes principales: un pipeline de datos en Python, DuckDB y H3, y una demostración web de mapa y navegación temporal construida con Vite, MapLibre y deck.gl. El frontend consume productos JSON estáticos generados a partir de la publicación del pipeline. No se encontró una implementación de Django/API ni evidencia verificable de que la aplicación esté desplegada públicamente.

La prioridad inmediata es cerrar y publicar esa demostración estática con un conjunto de datos identificado y reproducible. Una API o un backend son posibles evoluciones, no compromisos del cierre actual.

## 1. Propósito y problema

MODIS y VIIRS observan focos de calor con características distintas. MODIS ofrece una serie histórica más larga; VIIRS observa con mayor resolución espacial y, en general, registra más detecciones. Unir sus conteos directamente puede producir un salto artificial en el momento en que cambia el sensor utilizado.

El proyecto procesa los datos de NASA FIRMS para construir una serie comparable, presentarla en un mapa interactivo y facilitar la exploración temporal de la zona de estudio. Los resultados son estimaciones derivadas de observaciones satelitales: un foco detectado no equivale por sí solo a un incendio confirmado y la ausencia de detecciones no demuestra que no haya habido fuego.

## 2. Alcance del producto

El área principal de la demostración es el norte de la Patagonia, representado por las provincias de Río Negro y Neuquén. La interfaz implementada permite explorar focos y valores armonizados en el mapa mediante una barra temporal, con vistas mensuales y ventanas de ocho días.

El alcance visible en el código es una demostración del mapa y su navegación temporal, no la aplicación completa de la propuesta inicial. No debe suponerse que ya están disponibles todas las vistas originalmente sugeridas, como un tablero independiente de calendario anual, indicadores generales, exportaciones de calendario o una aplicación de producción.

## 3. Datos y método de armonización

Las fuentes son los productos de focos activos de NASA FIRMS para MODIS y VIIRS. El pipeline organiza los registros en un esquema común, conserva su procedencia y aplica filtros de calidad antes de calcular agregados espaciales y temporales.

La metodología implementada utiliza celdas H3, agregaciones diarias y mensuales, calibración mediante factores `k` y validación del cambio entre fuentes. La configuración principal usa `n_clusters` como métrica, una referencia Terra + Aqua, datos MODIS hasta el 31 de diciembre de 2021 y una transición a VIIRS a partir del 1 de enero de 2022. Los resultados armonizados son estimaciones —pueden ser valores fraccionarios—, no detecciones adicionales.

S-NPP no integra la serie: se quitó de `config.yaml`, con lo que la configuración principal y los lotes usan las mismas plataformas (Terra, Aqua, NOAA-20 y NOAA-21). El costo es un solape VIIRS–MODIS de 3,75 años en lugar de unos diez. Las decisiones vigentes están en [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md), sección 7.

## 4. Solución implementada

### 4.1 Pipeline de datos

El pipeline ejecuta las etapas de ingesta, normalización, soporte y calendario, agregación, calibración, rollups, validación, control de calidad, preparación de la zona y exportación. Usa Python con DuckDB y H3; los datos pesados y la publicación local se generan bajo `data/`, que no se versiona.

La secuencia puede ejecutarse como `python -m pipeline all`. El producto exportado queda en `data/publish/` y es la entrada para las herramientas de preparación de datos del frontend. La implementación, las pruebas y las instrucciones operativas se describen en [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md) y en [`pipeline/README.md`](../pipeline/README.md).

### 4.2 Análisis y validación

La calibración compara métricas entre sensores durante períodos de solape y genera resultados de validación y control de calidad. En el repositorio están versionados resúmenes de los lotes L1, L2 y L3. La carpeta `analisis/` no contiene todavía scripts ni resultados finales de análisis propios; por tanto, no se presenta la campaña analítica completa como cerrada ni se afirma que la métrica configurada ya haya sido ratificada por todas las comparaciones previstas.

### 4.3 Mapa y navegación temporal

La demostración del frontend está implementada como una aplicación Vite que usa MapLibre GL, deck.gl y H3. Representa las celdas armonizadas, los focos de FIRMS y la zona de estudio; permite navegar por meses o días con una ventana de ocho días. El generador `frontend/map/scripts/build_mocks.py` convierte los productos publicados por el pipeline en JSON estáticos que el frontend puede servir localmente.

El código también incluye un adaptador de fuente API, pero el flujo disponible por defecto utiliza archivos estáticos. La presencia del adaptador no implica que haya una API desplegada.

## 5. Arquitectura y estado de los componentes

```text
Datos FIRMS
    ↓
Pipeline Python + DuckDB + H3
    ↓
data/publish/ (productos Parquet)
    ↓
Generador de datos estáticos del frontend
    ↓
JSON + Vite + MapLibre + deck.gl
    ↓
Demostración local del mapa y la barra de tiempo
```

| Componente | Estado comprobable en el repositorio |
|---|---|
| Ingesta, normalización, calibración, validación y exportación | Implementados en `pipeline/`; los datos de ejecución no se versionan. |
| Resúmenes de análisis por lotes | Hay resúmenes versionados para L1, L2 y L3. |
| Frontend del mapa y la barra temporal | Implementado; preparado para datos JSON generados a partir de `data/publish/`. |
| Adaptador frontend para una API | Presente como opción de integración; no demuestra la existencia de un backend. |
| Backend Django, API y despliegue en Cloud Run | No implementados en este repositorio. |
| Publicación web pública | No verificable con la evidencia versionada disponible. |

`ARQUITECTURA.md` conserva la descripción técnica ampliada del flujo actual y separa las alternativas futuras de la solución implementada.

## 6. Límites y decisiones pendientes

- **Decisiones vigentes:** métrica `n_clusters`, referencia Terra + Aqua, celdas H3 r7, serie sin S-NPP y calibración común a los lotes. Sus motivos están en [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md), sección 7. Los lotes tienen que volver a correrse con el pipeline corregido antes de publicar.
- **Datos recientes:** la incorporación de datos NRT de 2026 y su posterior reemplazo por datos estándar requiere ejecutar y validar el pipeline nuevamente.
- **Cobertura:** disponibilidad parcial, cambios de sensor y ausencia de detecciones deben distinguirse de un cero observado. La serie armonizada no representa por sí sola la cobertura nubosa ni la ausencia de fuego.
- **Alcance de la interfaz:** el código actual no acredita la entrega de todas las pantallas, indicadores y descargas imaginados en la propuesta inicial.
- **Despliegue:** falta generar y verificar una publicación estática reproducible y registrar su URL, revisión de código y versión/configuración del dataset. No se afirma que esto ya haya ocurrido.

## 7. Dirección inmediata

El camino de menor cambio para completar la demostración es:

1. Revisar los resultados disponibles y acordar la métrica y la selección de plataformas para el conjunto que se presentará.
2. Ejecutar el pipeline con esa configuración y conservar la identificación de la publicación resultante.
3. Generar los JSON estáticos desde `data/publish/`, construir el frontend y verificar el mapa y la barra temporal con esos mismos datos.
4. Publicar el artefacto estático en un hosting adecuado y registrar la URL, el commit y la configuración del dataset.

La construcción de Django, una API, Cloud Run u otra infraestructura de backend queda fuera de este cierre inmediato. Se podrá reconsiderar si una etapa posterior necesita procesamiento dinámico o servicios que la demostración estática no ofrece.

## 8. Cómo leer la documentación del proyecto

- [`PLAN.md`](PLAN.md): propósito y alcance actual del producto, junto con los requisitos originales que no forman parte de la demostración entregada.
- [`PLAN_MODULO_DATOS.md`](PLAN_MODULO_DATOS.md): fuentes, campos y preparación de los datos FIRMS.
- [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md): pasos y decisiones metodológicas vigentes del pipeline.
- [`PLAN_ANALISIS_LOTES.md`](PLAN_ANALISIS_LOTES.md): evidencia disponible y estado de los análisis por lotes.
- [`ARQUITECTURA.md`](ARQUITECTURA.md): componentes implementados y alternativas de integración o despliegue.
- [`AUDITORIA_2`](AUDITORIA_2) y [`AUDITORIA_COHERENCIA.md`](AUDITORIA_COHERENCIA.md): registros de auditoría que sustentan la separación entre propuesta e implementación.

Este documento es la referencia ejecutiva para entender el estado presente. Los detalles reproducibles de operación siguen en los documentos técnicos y README de cada componente.
