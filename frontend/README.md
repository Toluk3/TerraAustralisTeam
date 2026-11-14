# `frontend/` — Área 4 · Frontend y visualización

**Responsable:** _(completar)_

## Qué hace

La app que ve el usuario: un mapa de Google Maps con la zona fija (Río Negro y Neuquén), una **barra de tiempo** que se recorre o se reproduce y va mostrando los focos, el calendario de quemas año × mes, el panel con los números del período y la descarga del CSV. Diseño y detalles en `documentacion/ARQUITECTURA.md` §4.4 y en el PDF de documentación (§2 y §8).

**Regla de producto:** todos los números que se muestran son de la serie armonizada. Nunca se muestran conteos por sensor, ni se cuentan los puntos del mapa.

## Qué entrega y qué recibe

| | Qué | A / de quién |
|---|---|---|
| Recibe | API según `CONTRATO_API.md` y la clave de Google Maps (variable de entorno) | Área 3 |
| Recibe | Textos de la app (aclaraciones, atribución de FIRMS, ayudas) en `documentacion/TEXTOS_APP.md` | Área 5 |
| Entrega | App desplegada para la demo | Área 5 |

## Estructura sugerida

Depende del framework que se elija. Como mínimo:

```
frontend/
├── README.md
├── mocks/           JSON de prueba armados según CONTRATO_API.md
├── src/
│   ├── map/         Google Maps + deck.gl (hexágonos y focos)
│   ├── timebar/     barra de tiempo
│   ├── calendar/    calendario año × mes
│   └── panel/       números del período y descarga del CSV
└── .env.example     nombres de las variables (sin valores)
```

## Tareas

**P0**
- [ ] Elegir el framework y acordar con el Área 3 si lo sirve Django o va aparte (Firebase Hosting)
- [ ] JSON de prueba en `mocks/` según `CONTRATO_API.md`
- [ ] Google Maps + deck.gl (`GoogleMapsOverlay`) con el contorno de la zona
- [ ] Capa de hexágonos que cambia de resolución según el zoom (r5, r6, r7)
- [ ] Barra de tiempo con paso mensual y play/pausa
- [ ] Focos con `ScatterplotLayer` + `DataFilterExtension`, cargados por año
- [ ] Panel del período: valor armonizado con banda, mediana histórica y anomalía
- [ ] Calendario año × mes con rampa viridis
- [ ] Descarga del CSV generada en el navegador con los focos ya cargados

**P1**
- [ ] Paso diario con ventana de 8 días; los focos viejos se desvanecen
- [ ] Marcas de "estimado" (desde `switch_date`) y de cobertura reducida
- [ ] Mapa de anomalías con rampa PuOr
- [ ] Accesibilidad: barra de tiempo manejable con teclado, contraste y textos de ayuda
- [ ] Atribución de FIRMS y aclaraciones con los textos del Área 5

**P2**
- [ ] Huellas MODIS (`scan × track`) con zoom ≥ 12
- [ ] Exportar el calendario como PNG
- [ ] Interfaz en español e inglés

## Reglas

- La clave de Google Maps nunca se commitea; va en `.env` (que está en `.gitignore`).
- Los focos se pintan todos iguales (color y tamaño según FRP); el sensor solo aparece al pasar el mouse.
- Si falta un dato en la API, se le pide al Área 3; no se calcula en el navegador.
