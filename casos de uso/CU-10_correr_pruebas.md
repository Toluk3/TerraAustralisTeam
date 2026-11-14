# CU-10 — Correr las pruebas automáticas

**Actor:** cualquiera que cambie el pipeline.
**Objetivo:** comprobar que las reglas de PLAN_NORMALIZACION.md §8 se siguen cumpliendo después de un cambio.

## Precondiciones

- Entorno instalado (`.venv/bin/pip install -r requirements.txt`). No hacen falta los datos reales: las pruebas generan sus propios CSV sintéticos en formato FIRMS en una carpeta temporal.

## Flujo principal

```bash
.venv/bin/python -m pytest
```

Tarda unos 3 segundos. Resultado esperado: `32 passed`.

## Qué cubre

| # (§8) | Prueba | Archivo |
|---|---|---|
| 1 | Muestra fija con resultado esperado escrito a mano: cada motivo de descarte, confianza alta, versión `c6_v2`, NRT | `test_muestra_fija`, `test_version_y_nrt` |
| 2 | `acq_time = "0231"` conserva el cero; `"231"` se rellena a 4 dígitos | `test_acq_time_conserva_el_cero` |
| 3 | Confianza MODIS: 29 → low, 30 → nominal, 79 → nominal, 80 → high | `test_cortes_de_confianza_modis` |
| 4 | CSV vacío, CSV con solo el encabezado y país fuera de la configuración no rompen la ingesta | `test_csv_vacio_no_rompe` |
| 5 | Dos corridas dan exactamente los mismos focos | `test_idempotencia` |
| 6 | `SUM(fires_daily.n_fires)` = filas de `fires_norm` | `test_daily_cierra_contra_norm` |
| 7 | `n_clusters_r7 ≤ n_clusters ≤ n_fires` | `test_orden_de_metricas` |
| 8 | 03:30 UTC en longitud +150° → mismo `local_date`, 13:30 solar | `test_fecha_solar_local` |
| 9 | Mes sin focos → 0; antes de los datos → `sin_datos` | `test_ceros_y_sin_datos` |
| 10 | `config_hash` distinto entre calibración y rollups hace fallar el pipeline | `test_config_hash_distinto_falla` |
| — | `fires_norm + fires_excluded = fires_raw` | `test_cierre_raw_norm_excluded` |
| — | Duplicados solo dentro de la misma plataforma | `test_duplicados_solo_dentro_de_la_plataforma` |
| — | Corte de Aqua de 2020 → `coverage_frac` 15/31 y mes `parcial` | `test_corte_de_aqua_es_cobertura_parcial` |
| — | La calibración recupera el cociente con que se generaron los datos | `test_calibracion_recupera_el_cociente` |
| — | Sin escalón en `switch_date`; respaldo r3 → r2 → global; banda p05–p95 contiene el valor | `test_serie_sin_escalon_en_switch_date`, `test_k_por_region_usa_respaldo`, `test_banda_bootstrap_contiene_el_valor` |

Las pruebas están en [`tests/test_pipeline.py`](../tests/test_pipeline.py) y los datos sintéticos en [`tests/conftest.py`](../tests/conftest.py).

## Si falla una prueba

`pytest -x -q` frena en la primera falla y muestra la consulta y los valores. Si el cambio era a propósito (por ejemplo, un nuevo motivo de descarte), actualizar el resultado esperado en `tests/conftest.py` → `special_rows` y en la tabla de esta página.
