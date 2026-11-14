# `backend/` — Área 3 · Backend e infraestructura

**Responsable:** _(completar)_

## Qué hace

Sirve la API de la app con Django, consultando con DuckDB los Parquet que publica el pipeline. También se encarga de la infraestructura en Google Cloud: el bucket, el deploy en Cloud Run, la clave de Google Maps y el dominio. Todo lo que tenga que ver con el deploy (Dockerfile, configuración de Cloud Run) vive dentro de esta carpeta.

## Qué entrega y qué recibe

| | Qué | A / de quién |
|---|---|---|
| Recibe | `data/publish/` según `CONTRATO_DATOS.md` (en local, y en el bucket) | Área 1 |
| Entrega | API según `CONTRATO_API.md` | Área 4 |
| Entrega | Clave de Google Maps restringida, como variable de entorno | Área 4 |
| Entrega | URL del deploy | Áreas 4 y 5 |

## Estructura sugerida

```
backend/
├── README.md
├── manage.py
├── prehack/         proyecto Django (settings, urls)
├── api/             vistas y consultas DuckDB
├── fixtures/        Parquet chicos para pruebas, armados según CONTRATO_DATOS.md
├── tests/
├── requirements.txt
└── Dockerfile
```

## Endpoints (ARQUITECTURA.md §5)

`GET /api/meta`, `GET /api/calendar`, `GET /api/timeline`, `GET /api/map`, `GET /api/points`. Ninguno recibe geometrías: la zona es fija. Todos los números son de la serie armonizada.

## Tareas

**P0**
- [ ] Escribir `documentacion/CONTRATO_API.md` y acordarlo con el Área 4
- [ ] Revisar las Global Offers de Space Apps: créditos de Google Cloud, si piden tarjeta y cuotas de la Maps API
- [ ] Proyecto Django y fixtures armados según `CONTRATO_DATOS.md`
- [ ] Endpoints `meta`, `calendar`, `timeline`, `map` y `points` con DuckDB en solo lectura, primero contra una copia local de `data/publish/`
- [ ] Bucket de Cloud Storage y cuenta de servicio; avisar al Área 1 para que suba los datos
- [ ] Clave de Google Maps restringida por dominio (HTTP referrer), limitada a la Maps JavaScript API y con tope de cuota
- [ ] Dockerfile y primer deploy en Cloud Run

**P1**
- [ ] Copiar los Parquet chicos al contenedor al arrancar (evita demoras en los arranques en frío)
- [ ] Anomalía cuando la mediana es 0: diferencia absoluta y percentil, no porcentaje
- [ ] CORS, dominio de GoDaddy apuntado al servicio y pruebas de los endpoints

**P2**
- [ ] Alternativa con archivos estáticos en Cloud Storage si el backend se complica

## Reglas

- La base y los Parquet se abren solo en lectura; el backend nunca escribe datos.
- Ningún secreto en el repo: `SECRET_KEY`, credenciales y la clave de Maps van en variables de entorno o Secret Manager.
- Si un endpoint necesita un dato que no está en `data/publish/`, se le pide al Área 1; no se calcula por fuera del pipeline.
