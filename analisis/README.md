# `analisis/` — Área 2 · Análisis y validación

**Responsable:** _(completar)_

## Qué hace

Revisa con los datos reales que la armonización funciona y lo convierte en evidencia: recomienda la métrica, confirma las fechas de deriva, detecta fuentes de calor que no son incendios y produce los gráficos y tablas del pitch. **No modifica el pipeline**: lo que haya que cambiar se lo pide al Área 1 con la evidencia.

## Qué entrega y qué recibe

| | Qué | A / de quién |
|---|---|---|
| Recibe | `data/prehack.duckdb` (abrir con `read_only=True`) y `data/publish/reportes/` | Área 1 |
| Entrega | Métrica recomendada, celdas a enmascarar, confirmación de `switch_date` | Área 1 |
| Entrega | Gráficos y tablas para el pitch, lista de picos de fuego de la zona | Área 5 |

## Estructura sugerida

```
analisis/
├── README.md
├── notebooks/       exploración (Jupyter); limpiar las salidas antes de commitear
├── scripts/         scripts que generan los resultados finales, reproducibles
├── config/          configuraciones propias para pruebas de sensibilidad
└── resultados/      PNG y CSV chicos que se versionan (los usa el Área 5)
```

Para probar otros parámetros sin tocar los datos del Área 1, copiar `config.yaml` a `analisis/config/`, cambiar `data_dir` y `publish_dir` a una carpeta propia (por ejemplo `data/analisis/`) y correr `python -m pipeline all --config analisis/config/<archivo>.yaml`.

## Tareas

**P0**
- [ ] Armar la carpeta y un script que lea la base en solo lectura
- [ ] Gráfico antes/después de la zona con datos reales (`reportes/zona_antes_despues.csv`)
- [ ] Tabla de ablación legible (`reportes/ablacion.csv`) y **recomendación de métrica** al Área 1
- [ ] Gráfico de deriva: hora solar mediana por plataforma y año, y `k` por año (`reportes/hora_solar_por_plataforma.csv`, `reportes/k_por_anio.csv`). Confirmar o corregir `switch_date`

**P1**
- [ ] Vaca Muerta: listar celdas r8 con focos persistentes recientes que no estén en la máscara y pasarlas al Área 1
- [ ] Lista de los picos de fuego de la zona posteriores a 2022, con fecha y lugar, para que el Área 5 elija el caso de la demo
- [ ] Revisar la serie de la zona: meses con mediana 0, meses con cobertura parcial y si la anomalía tiene sentido
- [ ] Sensibilidad del resultado a `min_conf_class` y `mask_min_months`

**P2**
- [ ] Validar que `k` cambia por región con un país vecino (pedir la ingesta al Área 1)
- [ ] Mapa de la incertidumbre (ancho de la banda p05–p95) por zona del mapa

## Reglas

- Abrir siempre la base del Área 1 en solo lectura; si el pipeline está corriendo, esperar a que termine.
- Los gráficos usan la paleta del proyecto (Okabe-Ito para categorías, viridis y PuOr para rampas) y aclaran cuando los datos son sintéticos.
- Cada resultado en `resultados/` tiene que poder regenerarse con un script de `scripts/`.
