# prehack — Plan: Calendario de quemas armonizado MODIS + VIIRS

**Evento:** NASA Space Apps Challenge 2026, desafío *"Harmonization of MODIS and VIIRS Hot Spots"* (nivel Intermedio/Avanzado; Earth Science y Software).
**Fechas:** 14–15 de noviembre de 2026. **Equipo:** Toluk3, jnavrd, joacopacket, FacuGue, MyraVerz.

## 1. Qué pide el desafío

Construir una **aplicación web** con un **calendario de actividad de quema** basado en focos de calor. Debe cubrir desde principios de los 2000 hasta hoy y combinar dos fuentes: la serie histórica de MODIS y la continuidad y mayor detalle de VIIRS, de forma que el sensor de origen deje de importar.

El enunciado lo divide en dos partes:
1. **Armonización** de los focos MODIS y VIIRS, para obtener una serie temporal consistente.
2. **Web app** que tome esos datos armonizados como entrada. El usuario elige una región y un rango de fechas, ve las visualizaciones y descarga los resultados.

Lo que la app debe permitir responder:
- Qué meses del año tienen más fuego.
- Qué años tuvieron más actividad.
- Cómo se compara el mes actual con la **mediana histórica** del área.

**Usuarios:** sistemas de alerta temprana, equipos de emergencia, brigadistas, científicos y gestores del territorio.

**Sugerencias del enunciado (opcionales):**
- Mapa interactivo en el que se pueda **dibujar el área de interés** o **ingresar latitud y longitud**.
- **Rampas de color accesibles** para el calendario.
- **Descarga en CSV** de los focos de la búsqueda.
- Unos pocos indicadores clave: anomalías respecto del promedio de varios años y cantidad de focos detectados.

## 2. Producto a entregar (lo mínimo que tiene que funcionar)

1. **Mapa** de una zona fija: norte de la Patagonia (Río Negro y Neuquén).
2. **Barra de tiempo** que se recorre o se reproduce y va mostrando los focos en el mapa. Todos los números son de la serie armonizada; no hay vista por sensor. La comparación entre sensores (gráfico antes/después) va en el pitch, no en la app.
3. **Calendario de quemas:** un heatmap de años (2001–2026) por meses (1–12) con la cantidad de focos armonizados. Usa la rampa *viridis* o *cividis*, que es apta para daltonismo, con el valor visible al pasar el mouse.
4. **Anomalías:** el mes actual o el elegido comparado con la mediana histórica, más un heatmap de anomalías con rampa divergente que es apta para daltonismo (azul–naranja).
5. **Indicadores clave:** total de focos, mes pico, año récord y anomalía del mes actual (%).
6. **Series de tiempo:** totales anuales y el ciclo estacional (mediana de cada mes con sus percentiles 10–90).
7. **Descargas:** CSV con los focos del área y rango, CSV con la tabla del calendario y la imagen PNG del calendario.

Extra, si sobra tiempo: alerta del tipo "este mes está en el percentil X", un mapa de calor de los focos, comparar dos áreas e idioma ES/EN.

## 3. Datos

| Fuente | Producto | Uso |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (descarga de archivo o API con MAP_KEY) | MODIS C6.1 (Terra y Aqua, 2000–presente) | Serie histórica |
| FIRMS | VIIRS 375 m: S-NPP (2012–), NOAA-20 (2018–) y NOAA-21 | Continuidad y detalle |
| Pestaña *Resources* del desafío | Puede agregar datasets antes del evento | **Revisar el día 1** |

**Área precalculada:** Argentina completa, descargada por país desde el archivo de FIRMS, para calibrar. La app muestra una sola zona, Río Negro y Neuquén, y consulta esa base precalculada, así que no hace falta llamar a la API en vivo. El contexto es relevante para la sede, ya que la foto del desafío es de CONAE.

## 4. Armonización

**Problema:** VIIRS tiene píxeles de 375 m contra los ~1 km de MODIS y detecta focos más chicos. Además, un incendio que MODIS registra como un solo foco VIIRS lo separa en varios. El resultado son entre 3 y 4 veces más detecciones con VIIRS, y unir las series sin corregir produce un salto falso a partir de 2012.

Se plantean dos pasos complementarios:

1. **Agrupar VIIRS en "focos equivalentes MODIS" (física primero):** para cada pasada, juntar los focos VIIRS que caen dentro de una misma celda de ~1 km, porque eso es lo que MODIS habría visto como un solo píxel. Así se corrige la mayor parte de la diferencia de resolución.
2. **Calibración en el período de solape (2012–presente, con Aqua y S-NPP casi simultáneos a las ~13:30):**
   - Calcular el factor `k = MODIS / VIIRS_agrupado` por celda de 0,5° y por mes del año, estratificado por día/noche y, si da el tiempo, por tipo de cobertura.
   - Modelo base: un ratio con mediana robusta. Mejora: un modelo de gradient boosting (LightGBM) que use el conteo VIIRS, el FRP, la densidad de focos y la estación.
   - Calcular la incertidumbre por bootstrap, que da una banda de confianza en la app.

La **serie armonizada** usa el conteo de MODIS hasta su fin y, después, el de VIIRS convertido a equivalente MODIS. En el solape se puede usar el promedio de ambas o MODIS; se documenta la decisión. Así la serie sigue más allá del apagado de MODIS (2026–27), que es justamente el punto del desafío.

**Validación:** separar por años (entrenar con 2012–2019 y probar con 2020–2025) y medir el sesgo y el RMSE de los conteos mensuales y la correlación entre los calendarios. La métrica para el pitch es un **gráfico antes/después** que muestre que el salto de 2012 desaparece.

**Aclaración en la app:** los valores armonizados son estimaciones, no observaciones. No detectar un foco no significa que no haya fuego, porque pueden haber interferido nubes o la hora de pasada del satélite.

## 5. Arquitectura

> **Desactualizado.** El stack de esta sección (pandas, Streamlit, folium, LightGBM) se reemplazó por el de `ARQUITECTURA.md`: pipeline en DuckDB + H3, backend Django en Cloud Run y frontend con Google Maps + deck.gl. Se deja como registro del plan inicial.

```
FIRMS CSV ──▶ pipeline/ (pandas) ──▶ data/harmonized.parquet
                                          │
                                  DuckDB (filtro espacial + fechas)
                                          │
                       app/ (Streamlit + folium/streamlit-folium con Draw)
                         ├─ calendario heatmap (Plotly)
                         ├─ anomalías / indicadores / series
                         └─ descargas CSV / PNG
```

- **Stack:** Python 3.11, pandas, geopandas/shapely, DuckDB, scikit-learn y lightgbm, Streamlit, streamlit-folium y Plotly.
- **Deploy:** Streamlit Community Cloud o Hugging Face Spaces, con el parquet incluido en el repo o en Git LFS si pesa más de 100 MB. Tiene que quedar un **link público** para la entrega.
- **Plan B:** si la armonización con modelo no llega a tiempo, la app sale con el ratio base. La app no depende del modelo, solo del parquet.

## 6. Roles, a confirmar

| Rol | Responsable | Tareas |
|---|---|---|
| Datos / ingesta | ? | Descarga del archivo de FIRMS para Argentina, limpieza, diccionario de datos y parquet base |
| Armonización | ? | Agrupamiento de VIIRS, factor k, modelo, incertidumbre y validación |
| Backend de la app | ? | Consultas en DuckDB, filtro por polígono, agregaciones y exportaciones CSV/PNG |
| Frontend / UX | ? | Mapa con Draw, calendario, rampas accesibles, indicadores y textos |
| Pitch y entrega | ? | Narrativa, video, página del proyecto, README y control del tiempo |

## 7. Cronograma

**Hoy (13/11):**
- [ ] Bajar el archivo de FIRMS de Argentina para MODIS y VIIRS (S-NPP y NOAA-20). El archivo por país no necesita API.
- [ ] Armar el esqueleto del repo: `pipeline/`, `app/`, `notebooks/`, `data/` (excluido del repo salvo el parquet final) y `requirements.txt`.
- [ ] Probar una demo mínima: mapa con Draw y un heatmap de ejemplo en Streamlit.

**Día 1:**
- 0–1 h: leer la pestaña Resources, cerrar el alcance y repartir roles.
- 1–5 h: parquet base listo. En paralelo, la app funcionando con datos crudos de MODIS.
- 5–10 h: agrupamiento de VIIRS y ratio k; primera serie armonizada conectada a la app.
- Noche: anomalías, indicadores, descargas y primer deploy.

**Día 2:**
- Mañana: LightGBM, incertidumbre, validación y gráfico antes/después.
- Mediodía: congelar el código y hacer el deploy final.
- Tarde: video (máximo 30 s según la regla de Space Apps; verificarlo), slides, página de entrega y README. **Entregar con al menos 2 h de margen.**

## 8. Criterios a cubrir en el pitch

- **Impacto:** cuándo esperar fuego y si este mes es anómalo, contado desde la utilidad para un brigadista.
- **Rigor:** gráfico antes/después de la armonización, métricas de validación y bandas de incertidumbre.
- **Usabilidad y accesibilidad:** recorrer 26 años de fuego en la barra de tiempo, ver la anomalía y descargar el CSV en pocos clics; rampas aptas para daltonismo.
- **Continuidad:** la herramienta sigue funcionando después del apagado de MODIS.

## Referencias

- [Transición de MODIS a VIIRS — NASA Earthdata](https://www.earthdata.nasa.gov/data/alerts-outages/transition-from-modis-viirs)
- [FIRMS — descarga de archivos](https://firms.modaps.eosdis.nasa.gov/download/)
- [Discusión de enfoques — nasa/spaceapps #1786](https://github.com/nasa/spaceapps/discussions/1786)
