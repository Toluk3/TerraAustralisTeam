# Frontend y visualización

## Resumen

La aplicación ofrece dos modos sobre los productos estáticos del pipeline: explorar el mapa y comparar dos períodos con una cortina deslizable. Se encuentra en [`map/`](map/), y usa Vite, MapLibre GL, deck.gl y H3. El estado general y las limitaciones del producto se describen en [`documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](../documentacion/FUNDAMENTOS_DEL_PROYECTO.md).

La interfaz muestra focos detectados y valores armonizados en celdas espaciales. Al seleccionar una celda se puede consultar su serie mensual; al seleccionar un foco, se muestran atributos disponibles como FRP, temperatura de brillo, plataforma, confianza y huella nominal del píxel. FRP es una potencia radiativa observada, no energía total ni área quemada. Los focos son observaciones satelitales; no equivalen a los valores calibrados de la serie.

## Flujo de datos

```text
pipeline → data/publish/ → scripts/build_mocks.py → JSON estáticos → frontend/map
```

Los JSON se generan localmente a partir de una publicación del pipeline y no se versionan por defecto. El flujo principal del frontend consume archivos estáticos. También existe un adaptador de fuente API, pero el repositorio no incluye el backend ni endpoints desplegados.

## Ejecución local

Desde la carpeta del mapa:

```bash
cd frontend/map
npm install
python scripts/build_mocks.py
npm run dev
```

El generador necesita los productos de `data/publish/` y las dependencias Python del pipeline. Las instrucciones para seleccionar una publicación concreta, generar otras muestras, construir el frontend y conocer el formato de los JSON están en [`map/README.md`](map/README.md).

## Alcance y límites

- Implementado: selección entre modo de exploración y comparador; mapa de la zona, celdas H3, capa de focos, selección de mapas base, navegación mensual o por ventanas de ocho días, y cortina para comparar mapas mensuales.
- En el comparador, las celdas H3 muestran el valor armonizado mensual; los focos se filtran en ventanas de hasta ocho días.
- Los mapas base de OpenFreeMap/OSM y Esri dependen de servicios de teselas externos y requieren conectividad.
- El repositorio no acredita una publicación pública del frontend.
- La propuesta inicial incluía vistas y entregables adicionales —como un calendario independiente, panel completo de indicadores y descargas— que no deben darse por implementados sin verificación en el código.
- La prioridad inmediata es generar los datos estáticos de la configuración acordada, construir la aplicación y verificar su publicación.

## Evolución posible

Una interfaz conectada a API, un backend o nuevas vistas pueden evaluarse en una etapa posterior. No son requisitos de la ruta estática inmediata; cualquier extensión debe acordar el alcance con las áreas de datos y producto.
