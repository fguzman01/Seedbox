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
| Costo | Costo estimado en USD de la corrida |

Un dolor extraído coincide con uno etiquetado cuando sus citas se superponen (una contiene a la
otra, o comparten la mayoría de sus palabras).
