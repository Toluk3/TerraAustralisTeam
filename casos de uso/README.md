# Casos de uso del módulo de datos

Cómo se usan los scripts de descarga y el pipeline de normalización y armonización MODIS + VIIRS.
Las reglas de cada paso están en [`documentacion/PLAN_NORMALIZACION.md`](../documentacion/PLAN_NORMALIZACION.md)
y la estructura de salida, en [`documentacion/ARQUITECTURA.md`](../documentacion/ARQUITECTURA.md) §4.2.

| # | Caso de uso | Quién | Comando principal |
|---|---|---|---|
| [CU-01](CU-01_descargar_datos_firms.md) | Descargar los focos de FIRMS (MODIS y VIIRS) | Equipo de datos | `python scripts/descargar_firms.py` |
| [CU-02](CU-02_descargar_zona.md) | Descargar el contorno de la zona de la demo | Equipo de datos | `python scripts/descargar_zona.py` |
| [CU-03](CU-03_ejecutar_pipeline.md) | Ejecutar el pipeline completo | Equipo de datos | `scripts/ejecutar_todo.sh` |
| [CU-04](CU-04_reprocesar_paso.md) | Reprocesar un paso o cambiar un parámetro | Equipo de datos | `python -m pipeline <paso>` |
| [CU-05](CU-05_auditar_normalizacion.md) | Auditar la normalización y rastrear un foco | Equipo de datos | consultas a `qc_report` y `fires_excluded` |
| [CU-06](CU-06_validar_armonizacion.md) | Validar la armonización y elegir la métrica | Equipo de datos | `python -m pipeline calibrate rollup validate` |
| [CU-07](CU-07_consultar_serie_zona.md) | Consultar la serie, la mediana y las anomalías de la zona | Backend | consultas a `zone_series` o `data/publish/zone/` |
| [CU-08](CU-08_publicar_cloud_storage.md) | Publicar los resultados en Cloud Storage | Equipo de datos / back | `python -m pipeline export` + `gcloud storage cp` |
| [CU-09](CU-09_agregar_datos_nrt.md) | Agregar los meses recientes (NRT) | Equipo de datos | `python scripts/descargar_firms.py --nrt` |
| [CU-10](CU-10_correr_pruebas.md) | Correr las pruebas automáticas | Cualquiera | `python -m pytest` |

## Mapa rápido

```
scripts/descargar_firms.py ──▶ Datos/<sensor>/<año>/*.csv
scripts/descargar_zona.py  ──▶ zona/rio_negro_neuquen.geojson
                                   │
python -m pipeline all             ▼
  ingest → normalize → support → aggregate → detect → calibrate → rollup → validate → qc → zone → export
     │         │                       │           │                                    │
  data/raw  data/norm            fires_daily   calibration                         data/publish/
            data/excluded                      calibration_boot                    (estructura del bucket)
                      todo en data/prehack.duckdb (tablas chicas y vistas sobre los Parquet)
```

## Resultados de la primera corrida (datos reales, Argentina, 14/11/2026)

| Qué | Valor |
|---|---|
| Archivos descargados | 48 CSV (MODIS 2000–2025, S-NPP 2012–2025, NOAA-20 2018–2025), 488 MB |
| Filas leídas (`fires_raw`) | 6.330.305 |
| Focos limpios (`fires_norm`) | 5.621.086 (MODIS 1.600.040, VIIRS 4.021.046) |
| Descartados (`fires_excluded`) | 709.219: baja confianza 477.595, `type` 1/2/3 175.973, máscara estática 51.085, fuera de rango 4.563, duplicados 3 |
| `k` global NOAA-20 → Terra + Aqua (`n_clusters`) | 0,455 de día, 0,211 de noche |
| Sesgo de la serie armonizada en validación | −0,5 % a +1,2 % según la variante (sin corrección: +228 %) |
| Zona Río Negro + Neuquén | 74.098 celdas r7; 300 meses con cobertura completa, 2 parciales (corte de Aqua en 2020) |
| Tiempo total | ~2 minutos (con los datos ya descargados) |
