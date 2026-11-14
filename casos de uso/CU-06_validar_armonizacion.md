# CU-06 — Validar la armonización y elegir la métrica

**Actor:** equipo de datos.
**Objetivo:** comprobar que la serie armonizada reproduce a MODIS en los años que no se usaron para calibrar, y decidir la métrica (`n_fires`, `n_clusters` o `n_clusters_r7`) con datos (PLAN_NORMALIZACION.md §4.3 y §6).

## Precondiciones

- CU-03 hecho (el paso `validate` corre dentro de `all`).

## Flujo principal

1. Correr la validación (si cambió algo, desde `calibrate`):
   ```bash
   .venv/bin/python -m pipeline calibrate rollup validate
   ```
2. Para cada plataforma VIIRS con solape estable (hoy solo NOAA-20, 2018-04 → 2021; S-NPP quedó fuera de la serie), el paso:
   - deja afuera un año, ajusta `k` con los demás y predice el año excluido como `Σ VIIRS × k`;
   - compara contra Terra + Aqua observado, en región r3 × mes;
   - repite con las 6 variantes de la tabla de ablación.
3. Leer la tabla de ablación (`data/publish/reportes/ablacion.csv`):
   ```sql
   SELECT variant, source_platform, round(rel_bias, 3) AS sesgo, round(nmae, 3) AS nmae, round(corr, 3) AS corr
   FROM validation WHERE held_out_year IS NULL AND is_day IS NULL
   ORDER BY source_platform, nmae;
   ```

## Resultado con los datos reales (Argentina, NOAA-20)

| Variante | Sesgo relativo | NMAE* | Correlación |
|---|---|---|---|
| Sin corrección | +228 % | 0,346 | 0,956 |
| `k` global único | +0,8 % | 0,079 | 0,952 |
| `k` región × mes | +1,2 % | **0,078** | 0,968 |
| `k` región × mes × día/noche | +0,8 % | 0,079 | 0,970 |
| ídem con `n_clusters` (la configurada) | **+0,2 %** | 0,083 | **0,974** |
| ídem con `n_clusters_r7` | −0,5 % | 0,094 | 0,972 |

\* Error absoluto mediano dividido por la media observada, para poder comparar métricas distintas.

En una corrida anterior que incluía S-NPP el orden era parecido (sesgo entre +0,1 % y +1,0 %, correlación de 0,949 a 0,977).

**Lectura:**
- La corrección es imprescindible: sin `k`, VIIRS triplica a MODIS.
- Todas las variantes con `k` quedan dentro del ±10 % de sesgo.
- `n_clusters` con día/noche separados tiene el menor sesgo y la mejor correlación. `k` región × mes con `n_fires` tiene el menor NMAE por muy poco. La diferencia es chica; **la decisión queda para el equipo**. Para cambiarla, ver CU-04.
- `n_clusters_r7` no mejora: agrupar a ~5 km no compensa el tamaño del píxel MODIS en Argentina.

## Criterios de aceptación (§6)

El paso los evalúa sobre la variante de la métrica configurada y los deja en `qc_report` (`step = 'validation'`):

| Criterio | NOAA-20 | S-NPP |
|---|---|---|
| Sesgo anual dentro de ±10 % | Cumple | Cumple |
| Cociente armonizado / MODIS entre 0,9 y 1,1 por año, día y noche | No: 2018 de noche da 1,20 | No: 2013 de noche da 1,12 |

En NOAA-20, 2018 solo tiene datos desde abril y es el año con menos meses en el solape. Los demás años quedan entre 0,98 y 1,05, y los totales día + noche entre 0,99 y 1,01.

## Diagnóstico de deriva

`k_by_year` (y `reportes/k_por_anio.csv`) calcula `k` año por año, incluidos 2022–2025:

```sql
SELECT year, is_day, round(k, 3) FROM k_by_year
WHERE source_platform = 'noaa20' AND metric = 'n_clusters' ORDER BY is_day, year;
```

El `k` diurno sube de 0,438 en 2022 a 0,512 en 2023: es lo esperable si Aqua, que pasa cada vez más tarde, detecta menos fuego, y confirma que no conviene seguir usando MODIS como referencia después de 2021.

## Gráfico antes/después

`data/publish/reportes/zona_antes_despues.csv` tiene, por mes, MODIS sin corregir, VIIRS sin corregir y la serie armonizada de la zona. En la zona, VIIRS cuenta entre 3,6 y 6 veces más focos que MODIS. La serie armonizada no tiene escalón en 2022: queda en 1.063 en 2022 contra 1.211 en 2021.
