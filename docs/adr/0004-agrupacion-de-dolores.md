# ADR-0004: Agrupación de dolores en oportunidades con Claude

- Estado: aceptada
- Fecha: 2026-10-28
- Modifica: ADR-0001 (pgvector queda pospuesto)

## Contexto

La historia H3 agrupa dolores que describen el mismo problema en una **oportunidad**. La
frecuencia (cuánta gente distinta comparte el problema) es el eje con más peso del scoring, así
que el agrupamiento define buena parte del valor del producto.

El ADR-0001 suponía usar `pgvector` con embeddings. Al llegar a esta historia:

- La API de Claude no ofrece embeddings. Usarlos implica sumar otro proveedor (por ejemplo
  Voyage AI) con su propia API key, o correr un modelo local.
- La similitud de embeddings agrupa por *tema* ("facturación"), no necesariamente por *problema*
  ("las herramientas de facturación son caras" vs. "no sé cobrar a clientes morosos"). Separar
  esos casos requiere juicio.
- El volumen esperado en la fase 1 es de cientos de oportunidades, no millones.

## Decisión

1. **Agrupación incremental con Claude.** Los dolores sin agrupar se procesan en lotes
   (por defecto 20). Para cada lote, Claude recibe el catálogo de oportunidades existentes
   (título y resumen) y decide, por cada dolor, si pertenece a una existente o si hay que crear
   una nueva. La respuesta usa salida estructurada (Zod), igual que la extracción.
2. **Referencias simples.** Las oportunidades existentes se identifican como `o<id>` y las
   nuevas como `n<n>`. El código valida la respuesta: un dolor con una referencia inválida o
   sin asignar queda pendiente para la siguiente corrida; el resto del lote se guarda.
3. **Modelo configurable.** Por defecto `claude-opus-5-5` con esfuerzo `medium` (agrupar exige
   más juicio que extraer). Se cambia con `SEEDBOX_CLUSTERING_MODEL`.
4. **Por dominio.** Sólo se agrupan dolores del mismo dominio (ADR-0002); cada oportunidad
   guarda su dominio.
5. **Las métricas se calculan, no se guardan.** Cantidad de dolores, posts y autores distintos
   y vertical principal se calculan al consultar, para que nunca queden desactualizadas.

## Alternativas consideradas

- **Embeddings + pgvector + clustering:** más barato por dolor y escala mejor, pero suma un
  proveedor y agrupa por tema. Se retoma como **prefiltro** si el catálogo supera ~500
  oportunidades: buscar las 50 más parecidas y darle sólo esas a Claude.
- **Reagrupar todo desde cero en cada corrida:** resultados más consistentes, pero el costo crece
  con el total de dolores y las oportunidades cambiarían de identidad entre corridas, rompiendo
  notas y favoritos (H7).

## Consecuencias

- `npm run cluster` agrupa los dolores pendientes. El flujo diario queda:
  `ingest` → `extract` → `cluster`.
- El costo por lote crece con el tamaño del catálogo; el prefiltro con embeddings es la salida
  cuando eso pese.
- Una mala decisión de agrupamiento persiste: no hay fusión ni división de oportunidades todavía.
  Si hace falta, será una historia aparte (por ejemplo, "fusionar oportunidades duplicadas").
