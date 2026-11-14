# TerraAustralisTeam

Inicio de hackaton

testv1

Calendario de actividad de quemas armonizado MODIS + VIIRS: NASA Space Apps Challenge 2026, challenge *Harmonization of MODIS and VIIRS Hot Spots*.

## Módulo de datos

Descarga los focos de FIRMS, los normaliza a un esquema común, los calibra entre sensores y deja una sola serie 2000–2025 para la zona de la demo (Río Negro y Neuquén).

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
scripts/ejecutar_todo.sh          # descarga (~500 MB) + pipeline completo (~2 min)
.venv/bin/python -m pytest        # 32 pruebas
```

| Carpeta | Contenido |
|---|---|
| [`documentacion/`](documentacion) | Plan general, arquitectura, plan del módulo de datos y plan de normalización |
| [`casos de uso/`](casos%20de%20uso) | Cómo descargar, procesar, auditar, validar, consultar y publicar (CU-01 a CU-10) |
| [`scripts/`](scripts) | `descargar_firms.py` (MODIS, VIIRS S-NPP y NOAA-20; NRT con la API), `descargar_zona.py`, `ejecutar_todo.sh` |
| [`pipeline/`](pipeline) | Pipeline en Python + DuckDB + H3. Esquema de la base en [`pipeline/schema.sql`](pipeline/schema.sql) |
| [`config.yaml`](config.yaml) | Parámetros: filtros, grilla H3, calibración, fechas de deriva, plataformas |
| [`zona/`](zona) | Contorno de Río Negro y Neuquén (geoBoundaries, CC BY 2.5) |
| [`tests/`](tests) | Pruebas de §8 de `PLAN_NORMALIZACION.md` con datos sintéticos |

`Datos/` (CSV de FIRMS) y `data/` (base DuckDB, Parquet y `data/publish/`) se generan localmente y no se versionan.

Datos: NASA FIRMS, MODIS C6.1 y VIIRS C2 375 m.
