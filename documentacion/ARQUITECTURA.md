# Arquitectura actual y evolución posible

## Resumen

La arquitectura implementada de Terra Australis se organiza alrededor de un pipeline de datos offline y una demostración web estática. El pipeline procesa los productos FIRMS y genera productos Parquet; un generador transforma esos productos a JSON que el frontend consume. El mapa está implementado con Vite, MapLibre, deck.gl y H3.

La arquitectura Django, API, Google Cloud Run y Google Maps descrita en versiones anteriores fue una propuesta de despliegue. No corresponde al flujo presente en el código y no debe presentarse como implementada ni como requisito aprobado para el cierre inmediato.

## 1. Flujo implementado

```text
FIRMS (MODIS y VIIRS)
        ↓
Pipeline Python + DuckDB + H3
        ↓
data/publish/ (Parquet y metadatos)
        ↓
frontend/map/scripts/build_mocks.py
        ↓
JSON estáticos
        ↓
Vite + MapLibre + deck.gl
        ↓
Mapa de la zona y barra de tiempo
```

Los datos fuente, bases y productos del pipeline se generan localmente y están excluidos de Git. Para ejecutar la demostración se necesita una publicación disponible y generar los JSON estáticos que el frontend sirve.

## 2. Componentes

### 2.1 Pipeline de datos

El pipeline está implementado en Python, con DuckDB para procesar las tablas y H3 para las agregaciones espaciales. La secuencia incluye ingesta, normalización, soporte y calendario, agregación, calibración, rollups, validación, control de calidad, preparación de la zona y exportación.

El resultado de publicación se genera en `data/publish/`. La configuración principal vive en `config.yaml`. Las reglas metodológicas y los formatos se detallan en [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md) y [`PLAN_MODULO_DATOS.md`](PLAN_MODULO_DATOS.md).

### 2.2 Preparación de datos para el frontend

`frontend/map/scripts/build_mocks.py` lee una carpeta de productos `publish/` y genera la estructura JSON estática que consume la demostración. Aunque el script se denomina generador de mocks, estos archivos pueden representar los datos reales publicados por el pipeline; el término no significa necesariamente que los valores sean ficticios.

### 2.3 Frontend del mapa

El frontend de demostración utiliza Vite, MapLibre GL, deck.gl y `h3-js`. Muestra el contorno de la zona, celdas H3 con valores armonizados, focos detectados y controles de navegación temporal. Los mapas base disponibles dependen de servicios de teselas externos, por lo que requieren conectividad.

La interfaz muestra una serie armonizada y distingue los focos de la métrica agregada: los puntos son detecciones satelitales; no equivalen a los valores calibrados de la serie.

### 2.4 API y backend

El frontend incluye una opción/adaptador para consumir una fuente API. Sin embargo, este repositorio no contiene el backend Django, endpoints ejecutables ni configuración de Cloud Run. La API de la arquitectura anterior no forma parte del flujo actual.

## 3. Datos, contratos y operación

La publicación Parquet `data/publish/` constituye la interfaz entre el pipeline y el generador de JSON. El esquema concreto de los archivos y las respuestas esperadas por el frontend están documentados en [`frontend/map/README.md`](../frontend/map/README.md) y en el código de exportación y generación.

El procedimiento general de cierre es:

1. Ejecutar el pipeline con la configuración aprobada.
2. Revisar la publicación generada e identificar su versión, commit y `config_hash`.
3. Generar los JSON del frontend desde esa publicación.
4. Construir y comprobar la aplicación estática utilizando los mismos datos.
5. Publicar los archivos generados en un hosting estático y registrar la URL y la versión de datos.

Esta secuencia describe el camino propuesto para completar la demostración; el repositorio no ofrece evidencia suficiente para afirmar que haya una instancia pública desplegada.

## 4. Decisiones metodológicas que afectan la arquitectura

- Los datos pesados se procesan offline; el navegador no ejecuta la normalización ni la calibración.
- H3 organiza los datos espaciales en niveles de resolución adecuados para el mapa y la comparación regional.
- El mapa presenta valores armonizados y no utiliza conteos crudos por sensor como sustituto de la serie.
- El cambio configurado a VIIRS comienza el 1 de enero de 2022; los valores posteriores son estimaciones derivadas de la calibración.
- La configuración principal contempla S-NPP, mientras que los lotes de análisis documentan una campaña basada en NOAA-20. La publicación debe identificar su configuración y resolver esta diferencia.

Para una explicación ejecutiva del producto y sus límites, consultar [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md).

## 5. Alternativas futuras, no comprometidas

Si una etapa posterior requiere datos dinámicos o servicios de backend, se puede evaluar:

- Una API que implemente un contrato común con el cliente de mapa.
- Django y DuckDB para servir consultas sobre los productos publicados.
- Un almacenamiento remoto y un despliegue en una plataforma como Cloud Run.

Estas alternativas necesitarían implementar, probar y desplegar los componentes correspondientes; no se deben confundir con la solución actual ni agregarse al alcance inmediato sin una decisión del equipo.

## 6. Seguridad y atribución

- Los archivos de datos pesados y credenciales no deben incluirse en Git.
- Las claves de FIRMS y credenciales de servicios, si se utilizan, deben guardarse fuera del repositorio.
- Las dependencias externas del mapa deben mantener su atribución y condiciones de uso.
- Los datos redistribuidos deben conservar la atribución y el aviso de NASA FIRMS aplicable.

## 7. Documentación relacionada

- [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md): fuente ejecutiva del estado actual.
- [`PLAN.md`](PLAN.md): propósito y alcance vigente del producto.
- [`PLAN_MODULO_DATOS.md`](PLAN_MODULO_DATOS.md): fuentes y preparación de datos.
- [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md): método del pipeline.
- [`PLAN_ANALISIS_LOTES.md`](PLAN_ANALISIS_LOTES.md): corridas por lote y estado de los análisis.
- [`frontend/map/README.md`](../frontend/map/README.md): ejecución, datos esperados e interfaz del mapa.
