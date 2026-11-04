# Evaluación de la extracción de dolores (H8)

Mide qué tan bien encuentra la IA los dolores de un post, comparando su salida con etiquetas
hechas a mano sobre **posts reales**.

## Flujo

```bash
npm run ingest                 # trae posts reales
npm run eval:sample -- --count 40   # agrega 40 posts al azar, sin etiquetar, a dataset.jsonl
npm run dev                    # etiqueta en http://localhost:3000/labeling
npm run eval                   # corre la extracción sobre los posts etiquetados
npm run eval -- --model claude-haiku-5-5   # compara con otro modelo
```

Cada corrida guarda el detalle en `results/<fecha>-<modelo>.json`. Conviene commitear los
resultados que sirvan de referencia, para comparar cambios de prompt o de modelo.

## Medir con Claude Code (sin API)

En producción el análisis lo hace Claude Code con la suscripción (ADR-0008), no la API. Para
medir esa extracción, sin `ANTHROPIC_API_KEY`, el flujo tiene dos pasos:

```bash
# 1. Exporta los posts etiquetados, SIN etiquetas, en el formato de .agent/extract.work.json
npm run eval -- --export                       # escribe .agent/eval.work.json
npm run eval -- --export --out otro.json --limit 10

# 2. En Claude Code: extrae los dolores de .agent/eval.work.json siguiendo su campo `rules`
#    y escribe los resultados en el formato de extract.results.json del skill seedbox-analyst,
#    con signalId = id del post en el dataset (texto, p. ej. "hackernews:50328896").
#    Ejemplo: .agent/eval.results.json

# 3. Puntúa los resultados con las mismas métricas
npm run eval -- --from-results .agent/eval.results.json
```

```json
{ "results": [
  { "signalId": "hackernews:50328896", "pains": [ { "description": "…", "persona": "…",
    "quote": "…", "vertical": "devtools", "intensity": "medium", "willingness_to_pay": "none" } ] },
  { "signalId": "hackernews:50330001", "pains": [] }
] }
```

- Quien extrae **no debe ver las etiquetas**: el archivo exportado no tiene `expected` ni `notes`;
  no le pases `dataset.jsonl`.
- Se aplica la misma validación que en producción: los dolores cuya cita no aparece textual en
  el post se descartan, se cuentan y se listan en la salida (`unverifiedPains` en el JSON).
- Los posts etiquetados sin resultado cuentan como **fallidos** y se informan; los resultados con
  un id que no está entre los posts evaluados se ignoran y se listan (`unknownResultIds`).
- El resultado se guarda en `results/<fecha>-claude-code.json`, con `model: "claude-code"`,
  costo `null` (va por la suscripción) y latencia `null` (no se mide en vivo).
- `--limit N` en `--from-results` evalúa sólo los primeros N posts etiquetados; úsalo con el
  mismo N que en `--export`, si no, los demás cuentan como fallidos.

## Cómo etiquetar

- Un **dolor** es un problema concreto que alguien tiene y que el software podría resolver.
- Para cada dolor, selecciona en el post el fragmento que lo demuestra (la cita) y elige la vertical.
- Si el post no tiene dolores (anuncios, opiniones, preguntas generales), marca "No tiene dolores".
  Estos posts son igual de importantes: miden los falsos positivos.
- Ante la duda, escribe una nota.

## Formato de `dataset.jsonl`

Una línea JSON por post:

```json
{"id":"hackernews:41000002","source":"hackernews","url":"…","title":"…","body":"…",
 "expected":[{"quote":"Every tool I tried is too expensive","vertical":"freelance"}],"notes":"…"}
```

`expected: null` significa "sin etiquetar"; `expected: []`, "etiquetado, sin dolores".

## Métricas

| Métrica | Pregunta |
|---|---|
| ¿Tiene dolor? precisión | De los posts donde la IA encontró dolores, ¿cuántos realmente tenían? |
| ¿Tiene dolor? recall | De los posts con dolores, ¿en cuántos encontró al menos uno? |
| Dolores precisión | De los dolores que extrajo, ¿cuántos coinciden con uno etiquetado? |
| Dolores recall | De los dolores etiquetados, ¿cuántos encontró? |
| Vertical | De los dolores encontrados, ¿cuántos tienen la vertical correcta? |
| Costo | Costo estimado en USD de la corrida (sólo modo API) |

Un dolor extraído coincide con uno etiquetado cuando sus citas se superponen (una contiene a la
otra, o comparten la mayoría de sus palabras).
