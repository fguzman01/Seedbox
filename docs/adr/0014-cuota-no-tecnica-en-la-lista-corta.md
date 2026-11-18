# ADR-0014: Cuota no técnica en la lista corta

- Estado: aceptada
- Fecha: 2026-11-18
- Relacionado: H27 (#36), ADR-0013 (evaluador), ADR-0005 (puntaje), H25 (cifras por vertical), H24

## Contexto

Las fuentes técnicas generan más dolores frecuentes, así que la lista corta del evaluador (ADR-0013) se
llena de herramientas para desarrolladores. Felipe quiere fichas de público masivo (pedido #23).

## Decisión

- La lista corta reserva un mínimo de cupos (`minNonTech`, por defecto 2 de 5, acotado a `limit`) para
  oportunidades cuya vertical principal (moda de `pains.vertical`) no es `devtools`.
- Algoritmo: se ordena como siempre (puntaje, autores, id); se toman los mejores no técnicos hasta
  `minNonTech`, se completan los cupos con los mejores del resto y se reordena por puntaje.
- Si no hay suficientes no técnicos, **no se rellena con un cupo ficticio**: la respuesta trae
  `quota = { minNonTech, nonTechCount, shortfall }` y el evaluador informa cuántos faltaron.
- Los filtros `exclude`, evidencia débil y sin evaluar se aplican antes (sin regresión de H19/H20).
- `GET /api/agent/work?kind=shortlist` acepta `minNonTech` (0..5); `quota` es aditivo.

## Alternativas

- **Reponderar el puntaje** (penalizar devtools): altera los pesos de `scoring.ts` que usa todo el
  sitio y es difícil de explicar. Descartada.

## Consecuencias

- Una oportunidad no técnica de menor puntaje puede desplazar a una devtools de mayor puntaje.
- `shortfall > 0` sostenido es la señal de que la entrada sigue sesgada hacia fuentes técnicas.
