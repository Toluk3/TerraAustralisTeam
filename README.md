# Terra Australis

Terra Australis es una demostración de exploración temporal de focos de calor detectados por MODIS y VIIRS en el norte de la Patagonia argentina. Un pipeline armoniza los datos y un frontend permite explorar los productos en un mapa y una barra de tiempo.

**Para conocer qué está implementado, qué queda pendiente y cuál es el rumbo de cierre, consultar [`documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](documentacion/FUNDAMENTOS_DEL_PROYECTO.md).**

## Estado actual

- **Datos:** pipeline en Python, DuckDB y H3 para ingesta, normalización, calibración, control de calidad y exportación.
- **Visualización:** demostración Vite con MapLibre y deck.gl; consume JSON generados a partir de `data/publish/`.
- **Ejecución:** los datos fuente y procesados se generan localmente y no se versionan.
- **Backend y despliegue:** no hay backend Django/API ni publicación web verificable en este repositorio. La prioridad inmediata es completar el flujo estático.
- **Decisiones:** las tomadas (entre ellas, S-NPP fuera de la serie) y las que siguen abiertas (métrica final, referencia, calibración común a los lotes) están en [`documentacion/DECISIONES.md`](documentacion/DECISIONES.md).

## Comenzar

Para crear un entorno e instalar las dependencias de Python:

```bash
python3 -m venv .venv
```

En Linux o macOS:

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest
```

En Windows:

```powershell
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m pytest
```

La ejecución completa de descarga y pipeline se describe en [`pipeline/README.md`](pipeline/README.md) y en los casos de uso. Para iniciar el mapa se requiere primero una publicación del pipeline y después generar los JSON según [`frontend/map/README.md`](frontend/map/README.md).

## Componentes

| Carpeta | Función |
|---|---|
| [`documentacion/`](documentacion/) | Estado ejecutivo, método, arquitectura y decisiones abiertas |
| [`pipeline/`](pipeline/) | Procesamiento y publicación de los datos |
| [`analisis/`](analisis/) | Análisis de validación y resultados |
| [`frontend/map/`](frontend/map/) | Demostración del mapa y navegación temporal |
| [`lotes/`](lotes/) | Configuraciones y resúmenes de ejecuciones por lote |
| [`scripts/`](scripts/) | Descarga y utilidades de preparación |
| [`tests/`](tests/) | Pruebas automáticas del pipeline |

`Datos/` y `data/` contienen entradas y productos generados localmente y están excluidos de Git.
