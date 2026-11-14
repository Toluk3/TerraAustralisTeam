# Proyecto Terra Australis: producto y alcance vigente

## Resumen

Terra Australis desarrolla una demostración web para explorar la actividad de fuego detectada por MODIS y VIIRS en el norte de la Patagonia argentina, con foco en Río Negro y Neuquén. El producto requiere armonizar las observaciones de ambos sistemas antes de comparar períodos, porque su resolución y sensibilidad generan cantidades diferentes de detecciones.

El estado actual y la arquitectura implementada se resumen en [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md). Este documento distingue el objetivo del producto, lo que efectivamente existe y las funciones de la propuesta inicial que no deben presentarse como entregadas.

## 1. Objetivo del producto

La demostración ayuda a recorrer temporalmente los focos de calor detectados y consultar valores de una serie armonizada sobre una zona geográfica delimitada. Está orientada a la exploración, comunicación y análisis del historial satelital; no sustituye la detección en terreno, un sistema oficial de alerta ni la confirmación de incendios.

El desafío que da origen al proyecto plantea dos componentes:

1. Preparar una serie temporal comparable a partir de las observaciones MODIS y VIIRS.
2. Presentar esa serie mediante una interfaz que permita explorar el territorio y el tiempo.

## 2. Producto implementado

El alcance comprobable en el repositorio es:

- Un pipeline de datos Python con DuckDB y H3 que ingiere, normaliza, agrega, calibra, valida y exporta productos para la zona.
- Una aplicación frontend con Vite, MapLibre y deck.gl que ofrece exploración de celdas H3 y focos, detalle científico, navegación temporal y comparación de mapas mensuales con una cortina deslizable.
- Un flujo de datos estáticos: el pipeline publica productos y `frontend/map/scripts/build_mocks.py` genera JSON que consume el frontend.
- Un adaptador para una fuente API opcional, sin backend implementado en este repositorio.

La demo se puede ejecutar localmente cuando se dispone de los datos procesados y se generan los JSON. No se encontró una configuración de despliegue público verificable ni datos publicados versionados que permitan afirmar que la aplicación esté operativa en internet.

## 3. Requisitos iniciales y alcance no acreditado

La propuesta original contemplaba, además del mapa, un calendario anual independiente, paneles de indicadores, gráficos de series históricas, anomalías detalladas y descargas CSV/PNG. Esos elementos sirven como referencia del desafío, pero el código actual no acredita que todos formen parte de la interfaz entregada.

También se propusieron funcionalidades opcionales como dibujo de áreas, comparación entre zonas, alertas e interfaz bilingüe. No deben describirse como disponibles sin una implementación y verificación correspondiente.

La versión actual del mapa está centrada en una zona definida por el proyecto. Una prueba con otros países no equivale por sí misma a una interfaz que permita al usuario seleccionar cualquier área.

## 4. Datos y armonización

La entrada proviene de NASA FIRMS e incluye focos MODIS y VIIRS. El pipeline unifica campos, aplica controles de calidad, asigna celdas H3 y genera métricas agregadas. La normalización y el método de calibración vigentes están detallados en [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md).

La configuración principal usa la métrica `n_clusters`, toma Terra + Aqua como referencia y pasa a una serie estimada con VIIRS desde el 1 de enero de 2022. Los valores armonizados no son observaciones adicionales. Los conteos de detecciones originales no deben compararse directamente como si ambos sensores fueran equivalentes.

La política de S-NPP aún requiere resolución: `config.yaml` lo incluye entre las plataformas VIIRS prioritarias, mientras el análisis documentado por lotes lo excluye de esa campaña. Hasta acordar una configuración final, el producto no debe anunciar una única política para todas las corridas.

## 5. Componentes y responsabilidades

| Componente | Responsabilidad actual | Estado |
|---|---|---|
| Pipeline de datos | Preparar y publicar los datos para análisis y visualización | Implementado en `pipeline/`; los datos de ejecución no se versionan |
| Análisis y validación | Contrastar métricas, calibración, deriva y resultados | Hay resúmenes versionados de los lotes L1–L3; la carpeta `analisis/` aún no contiene scripts ni resultados finales propios |
| Frontend | Mostrar el mapa de celdas y focos, y permitir navegar por el tiempo | Demostración local implementada en `frontend/map/` |
| Backend e infraestructura | Servir una API y desplegar servicios de producción | Django, API y Cloud Run no están implementados en este repositorio |
| Producto y documentación | Comunicar alcance, limitaciones y resultados sin confundir propuestas con entregables | Debe mantenerse alineado con la implementación vigente |

Las instrucciones y los límites de los componentes están en [`pipeline/README.md`](../pipeline/README.md), [`frontend/map/README.md`](../frontend/map/README.md) y [`backend/README.md`](../backend/README.md).

## 6. Criterios para cerrar la demostración

El cierre inmediato se orienta a la ruta estática que ya está soportada por el código:

1. Revisar resultados disponibles y acordar la métrica y la selección de plataformas del conjunto final.
2. Ejecutar el pipeline con la configuración aprobada y conservar la referencia de la publicación generada.
3. Generar los JSON desde `data/publish/`, construir el frontend y verificar los períodos, capas y valores con esa publicación.
4. Publicar el artefacto estático, comprobar que sus datos y mapas base carguen correctamente, y registrar URL, commit y configuración del dataset.
5. Describir con precisión las limitaciones de cobertura, las estimaciones armonizadas y las funcionalidades que quedaron fuera del alcance.

Estos son criterios de cierre, no afirmaciones de que el despliegue ya se haya realizado. Django, una API y Cloud Run quedan como una posible evolución posterior, no como requisitos acordados para esta entrega.

## 7. Referencias de trabajo

- [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md): fuente ejecutiva del estado actual.
- [`PLAN_MODULO_DATOS.md`](PLAN_MODULO_DATOS.md): procedencia y estructura de los datos.
- [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md): pasos y decisiones del pipeline.
- [`PLAN_ANALISIS_LOTES.md`](PLAN_ANALISIS_LOTES.md): corridas por lote y estado de sus entregables.
- [`ARQUITECTURA.md`](ARQUITECTURA.md): arquitectura implementada y alternativas futuras.
