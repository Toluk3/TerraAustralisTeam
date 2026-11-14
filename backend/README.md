# Backend e infraestructura

## Estado actual

Este directorio no contiene una implementación de backend. El diseño Django, API y Cloud Run que se había propuesto anteriormente no se construyó en el repositorio y no forma parte del cierre inmediato acordado.

La demostración actual no requiere backend: el pipeline genera productos Parquet en `data/publish/`, el frontend los convierte en JSON estáticos y la aplicación los sirve junto con sus archivos web. El estado, las decisiones pendientes y la ruta para completar esa publicación se describen en [`documentacion/FUNDAMENTOS_DEL_PROYECTO.md`](../documentacion/FUNDAMENTOS_DEL_PROYECTO.md).

## Posible evolución

Si una etapa posterior requiere consultas dinámicas, se deberá acordar e implementar un contrato entre el frontend y el servicio antes de seleccionar infraestructura. El frontend tiene un adaptador para una fuente API; esto no implica que existan endpoints ni que se haya realizado un despliegue.

La propuesta histórica consideraba endpoints de metadatos, calendario, serie temporal, celdas del mapa y focos. El esquema esperado por el cliente puede consultarse en [`frontend/map/README.md`](../frontend/map/README.md). Cualquier implementación futura deberá incluir pruebas y documentar el servicio y su publicación.

## Seguridad

Las credenciales y claves de servicios no deben guardarse en el repositorio. Si se implementa una API o infraestructura en la nube, sus secretos, permisos, configuración y restricciones de acceso deberán diseñarse y verificarse como parte de ese trabajo.
