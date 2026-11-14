# Documentación de Terra Australis

## Fuente ejecutiva

Comenzar por [`FUNDAMENTOS_DEL_PROYECTO.md`](FUNDAMENTOS_DEL_PROYECTO.md). Resume el objetivo, los componentes que están implementados, las limitaciones y el rumbo inmediato. Es la referencia para entender el estado presente sin confundirlo con propuestas anteriores.

## Guías técnicas vigentes

| Documento | Contenido |
|---|---|
| [`PLAN.md`](PLAN.md) | Propósito del producto, alcance que acredita el código y criterios para cerrar la demostración |
| [`PLAN_MODULO_DATOS.md`](PLAN_MODULO_DATOS.md) | Fuentes FIRMS, atributos y preparación de los datos |
| [`PLAN_NORMALIZACION.md`](PLAN_NORMALIZACION.md) | Método vigente de normalización, agregación, calibración y validación |
| [`PLAN_ANALISIS_LOTES.md`](PLAN_ANALISIS_LOTES.md) | Diseño de la campaña por lotes y evidencia disponible |
| [`ARQUITECTURA.md`](ARQUITECTURA.md) | Flujo implementado y alternativas de integración aún no comprometidas |
| [`DECISIONES.md`](DECISIONES.md) | Registro de decisiones tomadas, con su motivo y cómo revertirlas, y decisiones abiertas |
| [`AREAS.md`](AREAS.md) | Responsabilidades y coordinación de trabajo entre áreas |

Estos documentos describen el sistema actual y las tareas que todavía están abiertas. Las propuestas técnicas previas solo se conservan cuando ayudan a explicar una decisión o una limitación.

## Registros de auditoría y antecedentes

- [`AUDITORIA_2`](AUDITORIA_2) y [`AUDITORIA_COHERENCIA.md`](AUDITORIA_COHERENCIA.md) documentan la comparación entre las propuestas iniciales y la implementación observada.
- [`Documentacion_Proyecto.pdf`](Documentacion_Proyecto.pdf) es un resumen previo. Consultar este índice y `FUNDAMENTOS_DEL_PROYECTO.md` para el estado actualizado.

## Repositorios de implementación

- [`pipeline/`](../pipeline/): etapas de procesamiento y su guía operativa.
- [`analisis/`](../analisis/): análisis y validación.
- [`frontend/map/`](../frontend/map/): mapa, barra de tiempo y datos estáticos.
- [`lotes/`](../lotes/): configuraciones de procesamiento por lotes y resúmenes versionados.
