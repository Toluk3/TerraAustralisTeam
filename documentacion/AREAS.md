# Áreas del proyecto

Cómo se divide el trabajo entre las 5 personas del equipo para avanzar en paralelo sin pisarnos.
Cada área tiene **una carpeta propia y un único responsable**. Las áreas se comunican solo a través de **dos contratos** y de pedidos explícitos al dueño de cada carpeta.

Documentos relacionados: `PLAN.md`, `ARQUITECTURA.md`, `PLAN_NORMALIZACION.md` y el `README.md` de cada carpeta.

## Resumen

| # | Área | Carpetas que le pertenecen | Qué hace | Responsable |
|---|---|---|---|---|
| 1 | Pipeline de datos | `pipeline/`, `scripts/`, `tests/`, `zona/`, `casos de uso/`, `config.yaml`, `requirements.txt` | Descarga, normaliza, armoniza y publica los datos. Es el único que escribe en `data/publish/` | _(completar)_ |
| 2 | Análisis y validación | `analisis/` | Revisa con los datos reales que la armonización funciona, recomienda la métrica y produce los gráficos y tablas del pitch | _(completar)_ |
| 3 | Backend e infraestructura | `backend/` | API en Django sobre los Parquet publicados, bucket de Cloud Storage, deploy en Cloud Run, clave de Google Maps y dominio | _(completar)_ |
| 4 | Frontend y visualización | `frontend/` | La app: mapa de Google Maps, barra de tiempo, focos, calendario, panel del mes y descarga del CSV | _(completar)_ |
| 5 | Producto, integración y pitch | `pitch/`, `documentacion/` (salvo los contratos), `README.md`, `.gitignore` | Coordina, escribe los textos de la app, prueba todo de punta a punta y arma la presentación y la entrega | _(completar)_ |

El pipeline lo implementó Toluk3, así que lo natural es que siga a cargo del Área 1.

## Reglas para no pisarse

1. **Cada carpeta tiene un único dueño.** Si necesitás un cambio en una carpeta ajena, se lo pedís al dueño (issue o mensaje); no lo editás vos.
2. **Una rama por área:** `area/pipeline`, `area/analisis`, `area/backend`, `area/frontend`, `area/producto`. Se integra a `main` con PR, y lo revisa el dueño de lo que se toca.
3. **Dos contratos.** Cambiarlos requiere el OK de las dos áreas que los usan:
   - `documentacion/CONTRATO_DATOS.md`: estructura y columnas de `data/publish/` (lo que el pipeline entrega al backend). **Dueño: Área 1. Lo revisa: Área 3.**
   - `documentacion/CONTRATO_API.md`: endpoints y JSON que el backend entrega al front. **Dueño: Área 3. Lo revisa: Área 4.**
4. **Nadie espera a nadie.** El backend arranca con una copia local de `data/publish/` o con fixtures armados según el contrato de datos. El front arranca con JSON de prueba armados según el contrato de API.
5. **Los datos no se editan a mano.** `data/` lo genera el pipeline y no se versiona. El Área 2 lo lee en solo lectura; si necesita otra corrida, usa su propia configuración y su propia carpeta de datos (ver `analisis/README.md`).
6. **Nada de secretos en el repo:** MAP_KEY de FIRMS, clave de Google Maps, credenciales de Google Cloud y `SECRET_KEY` de Django van en variables de entorno.

## Cómo fluye el trabajo entre áreas

```
Área 1 (pipeline) ──data/publish/──▶ Área 3 (backend) ──API──▶ Área 4 (frontend) ──app──▶ Área 5 (demo)
      ▲                  │                                                                   ▲
      │ pedidos          └──reportes/──▶ Área 2 (análisis) ──gráficos y recomendaciones─────┘
      └──────────── métrica, celdas a enmascarar, fechas ──┘
```

| De | A | Qué se entrega | Por dónde |
|---|---|---|---|
| 1 | 3 | Tablas publicadas para la app | `data/publish/` según `CONTRATO_DATOS.md`, y el bucket |
| 1 | 2 | Base y reportes | `data/prehack.duckdb` (solo lectura) y `data/publish/reportes/` |
| 2 | 1 | Métrica recomendada, celdas a enmascarar, confirmación de `switch_date` | Issue o mensaje con el dato y la evidencia |
| 2 | 5 | Gráficos y tablas del pitch, lista de picos para el caso de la demo | `analisis/resultados/` |
| 3 | 4 | API y clave de Google Maps | `CONTRATO_API.md` y variable de entorno |
| 5 | 4 | Textos de la app (aclaraciones, atribución de FIRMS, ayudas) | `documentacion/TEXTOS_APP.md` |
| 4 | 5 | App desplegada para la demo | URL del deploy |

## Hitos en común

| Momento | Qué tiene que estar | Quién |
|---|---|---|
| Primera hora | Responsables asignados, ramas creadas, los dos contratos acordados | Todos; 1 + 3; 3 + 4 |
| Tarde del día 1 | Backend respondiendo con los datos reales de `data/publish/` en local | 3 |
| Tarde del día 1 | Métrica recomendada y `switch_date` confirmado con datos | 2 → 1 |
| Noche del día 1 | App funcionando de punta a punta en Cloud Run | 3 + 4, lo verifica 5 |
| Mañana del día 2 | Gráficos y tablas del pitch con datos reales; caso de la demo elegido | 2 → 5 |
| Mediodía del día 2 | Código congelado y deploy final | Todos |
| Día 2, al menos 2 h antes del cierre | Entrega enviada | 5 |

## Decisiones que cruzan áreas

| Decisión | Quién decide | Con quién |
|---|---|---|
| Métrica final (`n_fires`, `n_clusters`, `n_clusters_r7`) | Área 1 | Recomendación del Área 2 |
| Framework del front y si lo sirve Django o va aparte | Área 4 | Área 3 |
| Formato de `points/` para la barra de tiempo | Área 1 y Área 3 | Área 4 |
| Caso de la demo | Área 5 | Lista de picos del Área 2 |
| Contorno de la zona: hoy `zona/` tiene las dos provincias completas; si se prefiere un sector, se cambia ahí | Todo el equipo | Lo aplica el Área 1 |
