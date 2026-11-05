# Evaluación de la extracción de dolores (H8, H17)

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

## Criterio (H17)

Cada dolor etiquetado es **concreto** o **latente**; lo que no cumple ninguna de las dos
definiciones es **sin dolor**. La recurrencia no se juzga al etiquetar (la mide el
agrupamiento), y las notas son ideas, no evidencia.

- **Dolor concreto:** una tarea o situación que falla (lenta, cara, propensa a errores,
  frustrante o sin herramienta), que el autor podría describir como "si existiera X, se
  resolvería".
  - Ejemplo: `hackernews:50352757`, "we've all been diligent about disabling data sharing" en un
    post sobre Codex que vuelve a activar el entrenamiento sin avisar: mantener desactivado el
    uso de datos es una tarea que falla.
- **Dolor latente:** cumple las tres condiciones, con una cita que lo pruebe:
  1. hay alguien afectado identificable (el autor o un grupo concreto);
  2. expresa un estado o necesidad sostenida sin una tarea concreta que falle (incertidumbre,
     desorientación, pérdida de motivación o de práctica, ansiedad por un cambio);
  3. lo que falta podría aportarlo el software (información, aprendizaje, orientación,
     acompañamiento, comunidad, planificación).

  La cita muestra el estado, no sólo el tema.
  - Ejemplos: `hackernews:50285134`, "I was laid off six months ago […] Since then, I have been
    rotting" (desorientación tras un despido); `hackernews:50344065`, "I'm struggling to actually
    enjoy work anymore" (pérdida de motivación y de práctica al programar con IA).
  - Contraejemplo: una pregunta sobre el futuro de la IA y el trabajo sin que nadie diga cómo le
    afecta (`hackernews:50271004`) es el tema, no el estado.
- **Sin dolor:** opiniones sobre el mercado o empresas, llamados a la acción, avisos de
  incidentes de terceros, preguntas generales sin interés personal, hilos recurrentes y miedos
  cuyo objeto no es abordable con software.
  - Ejemplos: los hilos mensuales "Who is hiring?" y "Who wants to be hired?"
    (`hackernews:50338728`, `hackernews:50338726`), cuya cita son las reglas del hilo; el aviso
    "Scribd Breached" (`hackernews:50312756`); el llamado a la huelga (`hackernews:50271808`).

Los ejemplos ilustran la definición; la clasificación de cada post la fija la revisión v1.

La vertical **Trabajo y carrera** (`career`) es para empleo, búsqueda de trabajo y carrera
profesional; **Recursos humanos** (`hr`), para la gestión de personas en las empresas.

## Cómo etiquetar

- Para cada dolor, selecciona en el post el fragmento que lo demuestra (la cita), elige la
  vertical y agrégalo; después indica si es concreto (por defecto) o latente. La página muestra
  un resumen del criterio.
- Si el post no tiene dolores según el criterio, marca "No tiene dolores". Estos posts son igual
  de importantes: miden los falsos positivos.
- Ante la duda, escribe una nota.
- Al guardar, el post queda con `labels: "v1"` y cada dolor con su `type` explícito.

## Formato de `dataset.jsonl`

Una línea JSON por post:

```json
{"id":"hackernews:41000002","source":"hackernews","url":"…","title":"…","body":"…",
 "expected":[{"quote":"Every tool I tried is too expensive","vertical":"freelance","type":"concrete"},
             {"quote":"I have been rotting","vertical":"career","type":"latent"}],
 "notes":"…","labels":"v1"}
```

- `expected: null` significa "sin etiquetar"; `expected: []`, "etiquetado, sin dolores".
- `type`: `"concrete"` o `"latent"`. Si falta, el dolor se lee como concreto.
- `labels`: versión del criterio con que se etiquetó el post. `"v0"` son las etiquetas
  originales (mezclan criterios); `"v1"`, las revisadas con el criterio de arriba. Si falta, se
  lee como `"v0"`. Así el formato anterior sigue siendo válido.

## Métricas

| Métrica | Pregunta |
|---|---|
| ¿Tiene dolor? precisión | De los posts donde la IA encontró dolores concretos, ¿cuántos realmente tenían? |
| ¿Tiene dolor? recall | De los posts con dolores concretos, ¿en cuántos encontró al menos uno? |
| Concretos precisión | De los dolores extraídos que cuentan como concretos, ¿cuántos coinciden con uno concreto etiquetado? |
| Concretos recall | De los dolores concretos etiquetados, ¿cuántos encontró? |
| Latentes precisión / recall | Lo mismo, para dolores latentes |
| Todos precisión / recall | Las métricas de dolores anteriores a H17, sin distinguir tipo |
| Vertical | De los dolores encontrados, ¿cuántos tienen la vertical correcta? |
| Tipo | De los dolores encontrados que la extracción tipificó, ¿cuántos tienen el tipo correcto? (`—` hasta H18) |
| Costo | Costo estimado en USD de la corrida (sólo modo API) |

Un dolor extraído coincide con uno etiquetado cuando sus citas se superponen (una contiene a la
otra, o comparten la mayoría de sus palabras). La asignación es uno a uno.

Cómo se cuenta cada tipo:

- Una coincidencia cuenta para el **tipo de la etiqueta**: un dolor extraído que coincide con un
  latente etiquetado es un acierto de latente, no un falso positivo de concreto.
- Un dolor extraído que no coincide con ninguno cuenta para su propio tipo. La extracción de hoy
  no produce tipo, así que esos dolores cuentan como **concretos** (falsos positivos de
  concretos). Cuando la extracción traiga `type` (H18), se usa ese.
- Los latentes etiquetados que no se encontraron bajan el recall de latentes, **no** son falsos
  negativos de concretos.
- "¿Tiene dolor?" se calcula sobre concretos: un post tiene dolor si tiene al menos un concreto
  etiquetado, y la IA lo encontró si al menos un dolor extraído cuenta como concreto. Un post con
  sólo latentes etiquetados y sin extracciones es un verdadero negativo.
- Mientras la extracción no tipifique, la precisión de latentes sólo cuenta coincidencias (es
  100 % si hay alguna); el dato útil es el recall de latentes.
- Con etiquetas v0 (sin tipos) concretos y "Todos" dan lo mismo, y "¿Tiene dolor?" coincide con
  la métrica anterior.

La salida de `npm run eval` (modo API y `--from-results`) muestra la línea `Labels` con cuántos
posts de cada versión se evaluaron, y el JSON de resultados la guarda en `labelVersions`
(p. ej. `{ "v1": 40 }`). No compares corridas con versiones de etiquetas distintas. En el JSON,
`summary.byType.concrete` y `summary.byType.latent` traen precisión, recall y los conteos
(`expected`, `extracted`, `matched`); `summary.post` es "¿Tiene dolor?" sobre concretos y
`summary.pain`, la métrica sin tipo.
