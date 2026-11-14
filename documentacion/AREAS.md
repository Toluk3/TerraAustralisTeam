# Áreas de trabajo y coordinación

## Resumen

El proyecto organiza sus tareas en áreas para separar el procesamiento de datos, la validación, la visualización y la comunicación. Esta división identifica responsabilidades de trabajo; no significa que cada componente descrito esté implementado ni que haya una persona asignada en el repositorio.

El estado de cada componente y la ruta de cierre se describen en [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md).

## 1. Áreas del proyecto

| Área | Función | Estado verificable |
|---|---|---|
| 1 · Datos | Descargar y procesar FIRMS, normalizar, calibrar, validar y publicar los datos | Pipeline implementado en `pipeline/`; la configuración final y los datos de publicación deben identificarse por corrida |
| 2 · Análisis | Contrastar la armonización y aportar evidencia para las decisiones metodológicas | Hay resúmenes versionados de los lotes L1–L3; no se encontraron scripts ni resultados finales propios en `analisis/` |
| 3 · Backend e infraestructura | Desarrollar una API y servicios de backend si fueran necesarios | No implementado. No es requisito de la ruta estática inmediata |
| 4 · Frontend | Mostrar los datos armonizados en el mapa y permitir recorrer el tiempo | Demostración local implementada en `frontend/map/` con Vite, MapLibre y deck.gl |
| 5 · Producto y documentación | Mantener claro el alcance, las limitaciones y la presentación del proyecto | Documentación e integración requieren alinearse con el estado del código |

Los nombres de carpetas describen funciones del repositorio. Los campos de responsable que aparecían en documentos anteriores no se consideran asignaciones vigentes si no se han completado expresamente.

## 2. Flujo de trabajo entre áreas

```text
Datos FIRMS
   ↓
Área 1 · Pipeline ──data/publish/──▶ Generador JSON ──▶ Área 4 · Frontend
       │                                                   │
       └── DuckDB y reportes ──▶ Área 2 · Análisis         └──▶ Área 5 · Presentación
```

El flujo activo para la demostración no requiere un backend: el pipeline produce Parquet, el frontend prepara archivos JSON estáticos y la aplicación los consume. El trabajo de análisis revisa la evidencia de calibración y comunica recomendaciones al mantenimiento del pipeline.

## 3. Acuerdos de coordinación

- Los datos de origen y los productos generados se crean mediante los procedimientos del pipeline; no se editan manualmente ni se versionan por defecto.
- El análisis abre las bases de datos del pipeline en modo de solo lectura y registra la configuración con la que obtuvo cada resultado.
- Los cambios de parámetros que afecten a los productos publicados deben ejecutarse de nuevo y verificarse antes de regenerar los datos del frontend.
- El frontend no recalcula la armonización ni debe presentar detecciones crudas como si fueran los valores armonizados.
- Las claves, credenciales y otros secretos no se guardan en el repositorio.
- Las decisiones que cambien el conjunto de datos o la interfaz se documentan en `FUNDAMENTOS_DEL_PROYECTO.md` y en la guía técnica pertinente.

## 4. Decisiones que requieren coordinación

| Decisión | Participación necesaria |
|---|---|
| Métrica de la serie que se publicará (`n_fires`, `n_clusters` o `n_clusters_r7`) | Datos y análisis |
| Plataformas que integran la corrida final, incluida la política de S-NPP | Datos y análisis |
| Identificación de la publicación y versión de los JSON estáticos | Datos y frontend |
| Hosting estático y verificación de la URL pública | Frontend y producto |
| Necesidad futura de API o backend | Producto, frontend y datos; debe aprobarse antes de ampliar el alcance |

La implementación de Django, Google Cloud Run, Google Maps y el contrato API de la arquitectura anterior no se consideran entregables vigentes. Se podrán revisar si aparece una necesidad que no cubra la publicación estática.

## 5. Documentación relacionada

- [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md): referencia ejecutiva y estado por área.
- [`PLAN.md`](PLAN.md): alcance del producto.
- [`ARQUITECTURA.md`](ARQUITECTURA.md): flujo técnico actual y alternativas posibles.
- [`PLAN_ANALISIS_LOTES.md`](PLAN_ANALISIS_LOTES.md): corridas y resultados de análisis.
