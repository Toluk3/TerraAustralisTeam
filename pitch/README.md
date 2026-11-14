# `pitch/` — Área 5 · Producto, integración y pitch

**Responsable:** _(completar)_
**También le pertenecen:** `documentacion/` (salvo `CONTRATO_DATOS.md` y `CONTRATO_API.md`), el `README.md` de la raíz y `.gitignore`.

## Qué hace

Coordina al equipo, escribe los textos de la app, prueba todo de punta a punta y arma lo que ve el jurado: el guion, las slides, el video y la página de entrega. No programa partes de la app: si algo falla en la prueba, se lo reporta al área dueña.

## Qué entrega y qué recibe

| | Qué | A / de quién |
|---|---|---|
| Recibe | Gráficos y tablas del pitch, lista de picos de fuego de la zona | Área 2 |
| Recibe | App desplegada | Áreas 3 y 4 |
| Entrega | `documentacion/TEXTOS_APP.md` | Área 4 |
| Entrega | Presentación, video y página de entrega | Jurado |

## Estructura sugerida

```
pitch/
├── README.md
├── guion.md          guion del pitch y del video
├── checklist_demo.md lo que tiene que funcionar el día de la demo
├── slides/           presentación (o el link, si está en otra herramienta)
└── video/            guion visual y link al video final (el archivo no se versiona si es pesado)
```

## Tareas

**P0**
- [ ] Asignar los responsables de cada área en `documentacion/AREAS.md` y crear las ramas
- [ ] Leer la pestaña Resources del desafío y las reglas de entrega de Space Apps (duración del video, formato, horario límite)
- [ ] `documentacion/TEXTOS_APP.md`: "los valores son estimaciones armonizadas", "ausencia de focos no es ausencia de fuego", atribución y disclaimer de FIRMS, y textos de ayuda de la barra de tiempo y el calendario
- [ ] Actualizar el `README.md` de la raíz con cómo correr cada parte

**P1**
- [ ] Elegir el caso de la demo a partir de la lista de picos del Área 2
- [ ] Guion del pitch: impacto (cuándo esperar fuego y si este mes es anómalo), rigor (antes/después y ablación) y continuidad sin MODIS
- [ ] `checklist_demo.md` y prueba de punta a punta en el deploy; reportar fallas al área dueña
- [ ] Slides

**P2**
- [ ] Video y página de entrega
- [ ] Actualizar la documentación y el PDF con lo que haya cambiado
- [ ] Control de tiempo: congelar el código al mediodía del día 2 y entregar con al menos 2 h de margen
