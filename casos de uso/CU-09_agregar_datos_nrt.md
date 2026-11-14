# CU-09 — Agregar los meses recientes (NRT)

**Actor:** equipo de datos.
**Objetivo:** extender la serie más allá del último año publicado en el archivo anual (hoy, 2025), con los datos casi en tiempo real de FIRMS (PLAN_NORMALIZACION.md §10, pendiente 1).

## Precondiciones

- Una MAP_KEY gratuita de FIRMS: https://firms.modaps.eosdis.nasa.gov/api/map_key/. Se pasa por variable de entorno y nunca se guarda en el repo.

## Flujo principal

1. Descargar desde el primer día que falta:
   ```bash
   export FIRMS_MAP_KEY=<tu clave>
   python3 scripts/descargar_firms.py --nrt --desde 2026-01-01
   ```
   El script recorre el rango de a 5 días (el máximo de la API) para `MODIS_NRT`, `VIIRS_NOAA20_NRT` y `VIIRS_NOAA21_NRT`, con la API por país (código ISO3, `ARG`), y guarda los CSV en `Datos/nrt/<fuente>/` con nombres `<fuente>-<fecha>-<días>d_<año>_<País>.csv`, así la ingesta toma el país del nombre. Antes se usaba una caja, que traía focos de los países vecinos etiquetados como Argentina.
2. Reprocesar todo, porque cambian los datos de entrada:
   ```bash
   .venv/bin/python -m pipeline all
   ```

## Qué hace el pipeline con los datos NRT

- La ingesta los reconoce por las columnas y toma el país del nombre del archivo (`default_country` es `null`: un CSV con otro nombre no se ingiere y la ingesta lo avisa). Para países fuera de la tabla del script: `--iso3 "United States=USA"`.
- `is_nrt = true` (la versión termina en `NRT`), así que la app puede marcarlos.
- Los NRT no traen `type`: los gas flares de Vaca Muerta los saca la **máscara estática**, construida con VIIRS standard (§3, paso 3).
- NOAA-21 empieza a aparecer y usa el `k` de NOAA-20 (`k_fallback_platform`), porque no tiene solape con el MODIS estable.
- El último mes queda con `coverage_frac < 1` hasta que se complete.

## Riesgos

- **Pozos nuevos de gas:** los que empezaron a quemar hace pocos meses no están en la máscara, porque el producto standard todavía no los cubre. Antes de la demo, revisarlos a mano en Neuquén (ARQUITECTURA.md §9): focos persistentes en la misma celda r8 durante varios meses.
- **Reemplazo NRT → standard:** cuando FIRMS publique el archivo anual de 2026, hay que bajarlo (CU-01) y **borrar** `Datos/nrt/` de esos meses. Si no, los focos quedan duplicados: la deduplicación compara plataforma, coordenadas y hora, pero el producto standard y el NRT pueden diferir levemente en coordenadas.
