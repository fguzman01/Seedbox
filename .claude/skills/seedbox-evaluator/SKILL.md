---
name: seedbox-evaluator
description: Weekly viability evaluator for Seedbox (H19, ADR-0013). Use when asked to run the Seedbox evaluator, write up the best opportunities, or produce viability write-ups. Reads the short list from the agent API, researches each opportunity on the web and opens one `tipo:oportunidad` issue per opportunity.
---

# Seedbox evaluator

Once a week you take the best opportunities of the radar and hand Felipe a write-up with a verdict, so he
can approve (✅ "quiero explorarla como proyecto aparte") or discard (❌) from Telegram. Principle:
**evidence before opinion**. Every fact in a write-up has a source link; what you did not find, you say
"no encontrado". Never invent prices, market sizes or quotes.

Requirements: `npm install` done, `SEEDBOX_URL` set, GitHub tools for `fguzman01/Seedbox`, web search.
You never write to the site's database, never approve, merge or close an issue.

## Procedure

1. `npm run agent -- work shortlist` writes `.agent/shortlist.work.json`: up to 5 opportunities that are
   assessed (competition and buildability), have non-weak evidence (H12), ordered by total score.
   Each has its pains with quote, source and link. Empty list → say so and stop.
2. **Skip what was already written up:** list the issues with label `tipo:oportunidad`, open **and**
   closed. Each write-up starts with `Oportunidad #<id>` in its title or first line; skip those ids
   (also the discarded ones). Nothing eligible → say so and stop.
3. Pick **3 to 5** of the remaining ones, in the order given (fewer if fewer remain).
4. For each, research on the web (competitor pricing pages, market size reports) and open the issue:
   - Title: `Oportunidad #<id>: <title>`
   - Labels: `tipo:oportunidad`, `estado:propuesta`, `prio:P3`, `riesgo:bajo`
   - Body: the template below, in Spanish.
5. Finish with a short summary: ids written up, ids skipped and why, verdicts.

## Template of the write-up

```
Oportunidad #<id> · veredicto: <construir | investigar más | descartar> · viabilidad: <0-10>/10

## Quién sufre y quién pagaría
## Competidores y precios reales
(nombre, plan, precio, [link]. Si no hay precio público: "no encontrado")
## Tamaño aproximado del mercado
(cifra y [fuente]; si no se encontró: "no encontrado")
## Qué le falta a lo que existe
## MVP acotado
## Canal para los primeros usuarios
## Riesgos
## Evidencia del radar
(citas textuales del archivo de trabajo, con su link a la fuente)
## Puntaje de viabilidad
(tabla de abajo con la justificación de cada criterio)
## Veredicto
```

## Viability score (0–10) and verdict

Felipe's criteria (2026-11-09). Score each from 0 to 10; the viability score is their average, rounded
to one decimal:

| Criterio | 10 | 0 |
|---|---|---|
| 1. Felipe lo construye **solo, con IA, en menos de un mes** | MVP en 1–2 semanas, sin integraciones difíciles | meses, equipo o datos que no tiene |
| 2. **Ingreso mínimo esperado** (propuesta: US$1.000/mes posibles en 12 meses) | los precios reales de los competidores lo sostienen con holgura | no se sostiene |
| 3. Sirve al mercado **hispanohablante o global** | global o hispanohablante sin adaptación | sólo un mercado local sin acceso |

Verdict rules:

- **construir** only if the three criteria score ≥ 6 **and** criterion 2 is supported by real competitor
  prices **with a link** (users × price ≥ the threshold, shown in the write-up). Without real prices,
  "construir" is forbidden.
- **investigar más** when something decisive was not found.
- **descartar** when a criterion fails (≤ 3) or the market is saturated.
