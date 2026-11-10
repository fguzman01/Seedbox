# ADR-0013: Evaluador semanal de viabilidad

- Estado: aceptada
- Fecha: 2026-11-10
- Relacionado: H19, ADR-0008 (analista Claude Code), ADR-0005 (puntaje), H12 (evidencia débil),
  `docs/VISION.md` (fase 2: deep dive por oportunidad)

## Contexto

Felipe quiere que cada semana alguien tome las mejores oportunidades del radar y le diga cuáles puede
construir solo, con IA, en menos de un mes, y si dejan un ingreso mínimo. Hoy tiene que revisarlas una a
una en el tablero.

## Decisión

- Un skill nuevo, `seedbox-evaluator`, corre una vez por semana (domingo 03:00, hora de Chile; sonnet).
  Lee `GET /api/agent/work?kind=shortlist` (sólo lectura, con el token del agente), investiga en la web y
  abre un issue `tipo:oportunidad` + `estado:propuesta` por oportunidad (3 a 5). ✅ de Felipe = explorarla
  como proyecto aparte; ❌ = descartarla.
- La lista corta se arma en el sitio (`src/lib/shortlist.ts`, con tests): oportunidades con evaluación de
  competencia y construibilidad y evidencia no débil (H12), por puntaje total (pesos por defecto) y luego
  autores distintos; máximo 5. Así la regla es una sola, la del tablero. No es un `WORK_KIND`: no hay
  nada que enviar de vuelta.
- «No fichadas antes» se resuelve en GitHub: cada ficha empieza con `Oportunidad #<id>` y el skill salta
  los ids ya presentes entre los issues `tipo:oportunidad`, abiertos y cerrados, y se los pasa al sitio con
  `exclude=<ids>`: la lista corta ya sale sin ellos, así que cada semana llega a oportunidades nuevas
  (si el sitio devolviera siempre el mismo top 5, el evaluador se atascaría desde la segunda semana).
- La ficha vive en el issue. No hay migración ni endpoint de escritura.
- El `architect`, el `developer` y el `product-owner` ignoran los issues `tipo:oportunidad`.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Guardar las fichas en una tabla del sitio | Estado duplicado, migración y endpoint de escritura; el issue ya da la tarjeta ✅/❌ |
| Ampliar `seedbox-analyst` | El analista corre a diario y no toca GitHub; el evaluador usa búsqueda web, es semanal y es la corrida más cara |
| Que el agente arme la lista corta | La regla de elegibilidad quedaría fuera del código y sin tests |

## Consecuencias

- Una lectura nueva en el API del agente; ningún cambio de datos ni de puntajes.
- Las fichas pueden traer precios o tamaños mal leídos: cada dato lleva su link y lo no encontrado se
  declara. El veredicto «construir» está prohibido sin precios reales de competidores.
- Hasta que H18 agregue el tipo de oportunidad, todas cuentan como concretas; el filtro entra con H18.
- Costo: hasta 5 fichas por semana con búsqueda web. Felipe crea la rutina y llama `POST /etiquetas`.
