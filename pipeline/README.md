# `pipeline/` — Área 1 · Pipeline de datos

**Responsable:** _(completar)_
**También le pertenecen:** `scripts/`, `tests/`, `zona/`, `casos de uso/`, `config.yaml` y `requirements.txt`.

## Qué hace

Descarga los focos de FIRMS (MODIS y VIIRS), los normaliza a un esquema común, los calibra entre sensores y publica una sola serie armonizada para la zona de la demo. Es **la única área que escribe en `data/`**.

Pasos (`python -m pipeline all`):

```
ingest → normalize → support → aggregate → calibrate → rollup → validate → qc → zone → export
```

Las reglas de cada paso están en `documentacion/PLAN_NORMALIZACION.md`. Cómo correr cada cosa, en `casos de uso/` (CU-01 a CU-10).

## Qué entrega y qué recibe

| | Qué | A / de quién |
|---|---|---|
| Entrega | `data/publish/` (`zone/`, `map/`, `points/`, `series/`, `calibration/`, `meta/`) según `CONTRATO_DATOS.md` | Área 3 |
| Entrega | `data/prehack.duckdb` y `data/publish/reportes/` | Área 2 (solo lectura) |
| Recibe | Métrica recomendada, celdas a enmascarar, confirmación de `switch_date` | Área 2 |
| Recibe | Pedidos de cambio en el formato publicado | Área 3 |

## Estado

Hecho (commit `88239a4`):
- [x] Descarga de MODIS 2000–2025, VIIRS S-NPP 2012–2025 y NOAA-20 2018–2025 de Argentina (CU-01)
- [x] Contorno de Río Negro y Neuquén (CU-02)
- [x] Ingesta, normalización (pasos 2 a 8) y máscara estática
- [x] `calendar`, `platform_periods`, cobertura y `fires_daily` con las tres métricas
- [x] Calibración por región con respaldo jerárquico, bootstrap y `k` por año
- [x] Rollups mensual y de 8 días, validación dejando un año afuera y ablación
- [x] QC, serie de la zona, mediana y anomalías, y export a `data/publish/`
- [x] Pruebas automáticas (CU-10)

## Tareas pendientes

**P0**
- [ ] Escribir `documentacion/CONTRATO_DATOS.md` a partir de `export.py` y acordarlo con el Área 3
- [ ] Acordar con las Áreas 3 y 4 el formato de `points/` para la barra de tiempo (hoy se particiona por año y celda r3)
- [ ] Bajar los datos NRT de 2026 (CU-09; necesita una MAP_KEY de FIRMS) y reprocesar
- [ ] Subir `data/publish/` al bucket cuando el Área 3 lo cree (CU-08)

**P1**
- [ ] Aplicar la métrica que recomiende el Área 2 en `config.yaml` y volver a publicar
- [ ] Agregar a la máscara las celdas de pozos de gas nuevos que detecte el Área 2 en Vaca Muerta
- [ ] Ajustar `modis_stable_until` y `switch_date` si el análisis de deriva del Área 2 lo pide
- [ ] Atender los pedidos de cambio de las Áreas 2 y 3

**P2**
- [ ] Ingerir un país vecino (Chile o Brasil) si el Área 2 lo pide para validar que `k` cambia por región
- [ ] Reemplazar los NRT por el archivo standard cuando FIRMS lo publique (ver riesgos de CU-09)

## Reglas

- Cada cambio en `config.yaml` cambia el `config_hash`: hay que correr de nuevo desde `calibrate` (el pipeline falla si los hashes no coinciden).
- Antes de cambiar columnas o rutas de `data/publish/`, avisar al Área 3: es el contrato de datos.
- Las pruebas tienen que pasar antes de integrar a `main`: `python -m pytest`.
