# CU-04 — Reprocesar un paso o cambiar un parámetro

**Actor:** equipo de datos.
**Objetivo:** probar otra configuración (filtro de confianza, métrica, fechas de deriva…) sin reprocesar todo, y sin quedar con un `k` que no corresponde a los filtros aplicados.

## Precondiciones

- CU-03 hecho al menos una vez.

## Flujo principal

1. Cambiar el parámetro en `config.yaml`. Ejemplo, usar la métrica que ganó la validación (CU-06):
   ```yaml
   metric: n_fires
   ```
2. Correr desde el primer paso que depende de ese parámetro, siguiendo esta tabla:

   | Si cambia… | Correr desde |
   |---|---|
   | `countries`, datos nuevos en `Datos/` | `all` |
   | `min_conf_class`, `modis_conf_cuts`, `t_mir_range_k`, `use_static_mask`, `mask_min_months`, `h3` | `normalize support aggregate calibrate rollup validate qc zone export` |
   | `platform_periods`, `calendar_*`, `switch_date`, `viirs_priority`, `reference` | `support calibrate rollup validate zone export` |
   | `metric`, `modis_stable_until`, `terra_fit_to`, `month_window`, `min_source_count`, `calibration_levels`, `bootstrap_*`, `k_fallback_platform` | `calibrate rollup validate zone export` |
   | `zone` | `zone export` |

   Por ejemplo:
   ```bash
   .venv/bin/python -m pipeline calibrate rollup validate zone export
   ```

## `config_hash`: la protección contra mezclar configuraciones

Cada fila de `calibration` y de los rollups guarda el `config_hash` de los parámetros con los que se calculó (lista en `HASHED_KEYS`, `pipeline/config.py`). El `k` solo vale para los filtros con los que se ajustó (§5.3). Si se cambia un parámetro y se corre `rollup` sin recalibrar, el pipeline se detiene:

```
ConfigHashMismatch: calibration tiene config_hash ['455bbd74300e'] y la configuración actual es
'9c1e…'. Cambió algún filtro o parámetro: volver a correr `python -m pipeline calibrate rollup`.
```

El hash actual aparece en `python -m pipeline status` y en `data/publish/meta/version.json`.

## Probar sin pisar la configuración principal

```bash
cp config.yaml config_aqua.yaml        # cambiar reference: aqua y paths.data_dir: data_aqua
.venv/bin/python -m pipeline all --config config_aqua.yaml
```

Cada configuración escribe su propia base si `paths.data_dir` es distinto.
