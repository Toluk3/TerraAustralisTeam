# CU-02 — Descargar el contorno de la zona de la demo

**Actor:** equipo de datos.
**Objetivo:** tener el polígono de Río Negro y Neuquén para calcular las celdas H3 de la zona (ARQUITECTURA.md §2).
**Script:** [`scripts/descargar_zona.py`](../scripts/descargar_zona.py)

## Precondiciones

- Conexión a internet.

## Flujo principal

1. ```bash
   python3 scripts/descargar_zona.py
   ```
2. El script pide a la API de geoBoundaries el límite de provincias de Argentina (gbOpen ARG ADM1, versión simplificada) y se queda con Río Negro y Neuquén.
3. Escribe `zona/rio_negro_neuquen.geojson` (17 KB) con la atribución de la fuente (CC BY 2.5).

El archivo está versionado en el repo, así que este paso solo hace falta para cambiar la zona.

## Resultado

- `zona/rio_negro_neuquen.geojson`: dos polígonos, ~300.000 km² en total (Neuquén ~97.000 km², Río Negro ~203.000 km²).
- El paso `zone` del pipeline lo convierte en 74.098 celdas H3 r7 por centroide (tabla `zone_cells`).

## Variantes

| Necesidad | Comando |
|---|---|
| Otra zona | `python3 scripts/descargar_zona.py --provincias Chubut "Santa Cruz" --salida zona/sur.geojson` y cambiar `zone.outline` en `config.yaml` |
| Un sector a mano | Dibujar el polígono (por ejemplo en geojson.io), guardarlo en `zona/` y apuntar `zone.outline` a ese archivo |

## Errores

- **`No se encontraron [...]`:** el nombre no coincide. El mensaje lista las provincias disponibles; los acentos y las mayúsculas no importan.
- **Falta el contorno al correr el pipeline:** el paso `zone` falla con `No está el contorno de la zona`. Correr este script o revisar `zone.outline`.
