# CU-01 — Descargar los focos de FIRMS (MODIS y VIIRS)

**Actor:** equipo de datos.
**Objetivo:** tener en `Datos/` los CSV anuales de focos de calor de Argentina para los tres productos que usa el pipeline.
**Script:** [`scripts/descargar_firms.py`](../scripts/descargar_firms.py)

## Precondiciones

- Python 3.10 o superior y conexión a internet. No hace falta clave: el archivo anual por país de FIRMS es público.
- Unos 500 MB libres para Argentina completa.

## Flujo principal

1. Desde la raíz del repo:
   ```bash
   python3 scripts/descargar_firms.py
   ```
2. Para cada sensor y año, el script consulta `https://firms.modaps.eosdis.nasa.gov/data/country/<sensor>/<año>/<sensor>_<año>_<País>.csv`:

   | Sensor del archivo | Producto | Desde |
   |---|---|---|
   | `modis` | MODIS Terra + Aqua (C6.1) | 2000 |
   | `viirs-snpp` | VIIRS Suomi NPP (C2, 375 m) | 2012 |
   | `viirs-jpss1` | VIIRS NOAA-20 (C2, 375 m) | 2018 |

3. Si el archivo ya está y tiene el mismo tamaño que en el servidor, no lo vuelve a bajar.
4. Guarda cada CSV en `Datos/<sensor>/<año>/`, con la misma estructura que los zips `<sensor>_<año>_all_countries.zip`.
5. Al final escribe `Datos/descarga_log.json` con qué se bajó, qué ya estaba y qué no está publicado.

## Resultado

```
Datos/
├── modis/2000/modis_2000_Argentina.csv … modis/2025/modis_2025_Argentina.csv
├── viirs-snpp/2012/… viirs-snpp/2025/
├── viirs-jpss1/2018/… viirs-jpss1/2025/
└── descarga_log.json
```

Corrida del 14/11/2026: 48 archivos, 488 MB. 2026 todavía no está publicado en el archivo anual (FIRMS lo publica con unos meses de demora, ver CU-09).

## Variantes

| Necesidad | Comando |
|---|---|
| Solo algunos años | `python3 scripts/descargar_firms.py --anios 2018-2021` |
| Solo un sensor | `python3 scripts/descargar_firms.py --sensores viirs-jpss1` |
| Otros países (para probar que `k` cambia por región) | `python3 scripts/descargar_firms.py --paises Argentina Chile Brasil` |
| Volver a bajar todo | `python3 scripts/descargar_firms.py --forzar` |

Si se agregan países, también hay que sumarlos en `countries` de `config.yaml`; si no, la ingesta los ignora.

## Flujos alternativos y errores

- **`no publicado (404)`:** el año todavía no está en el archivo, o el país no tuvo focos ese año. No es un error: para el pipeline, la ausencia de un archivo equivale a cero focos, y `platform_periods` marca esos días como "sin datos" si la plataforma no tiene ningún archivo para ese año.
- **Corte de red:** cada archivo se baja primero a `.part` y se renombra al terminar, con hasta 3 reintentos. Volver a correr el comando retoma desde donde quedó.
- **Zips ya bajados a mano:** se pueden dejar en `Datos/` tal cual. La ingesta lee CSV sueltos y CSV dentro de zips.

## Notas

- NOAA-21 no está en el archivo anual por país; solo llega por la API NRT (CU-09).
- FIRMS pide citar los datos y enlazar su aviso legal si se redistribuyen. La atribución queda en `data/publish/meta/version.json`.
