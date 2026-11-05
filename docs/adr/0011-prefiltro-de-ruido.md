# ADR-0011: Prefiltro de ruido por forma al repartir el trabajo de extracción

- Estado: aceptada
- Fecha: 2026-11-05
- Relacionado: H13 (prefiltro), H17 (criterio y dataset v1), H10 y H14 (balance y fuentes), H11 y
  ADR-0009 (reparto), ADR-0003 (los descartados no se reprocesan), ADR-0008 (modo analista)

## Contexto

H13 pide descartar sin IA los posts que claramente no cuentan un problema, para que la capacidad
diaria del analista alcance para los que sí. Las reglas tienen que ser explícitas, por **forma**
(nunca por tema u opinión), revisables en `/activity` con su motivo y link, y no pueden perder
ningún post con dolor del dataset v1 de H17. Si una regla es discutible, queda fuera.

Lo que hay hoy en el código:

- `ingest` (`src/lib/ingest.ts`) guarda las señales `pending`; los adaptadores ya filtran lo que
  no tiene texto escrito por alguien: Reddit descarta links, fijados, borrados, NSFW y
  AutoModerator (`isUsefulPost`, ADR-0006); Stack Exchange descarta puntaje negativo (ADR-0010).
  Lo descartado ahí no se guarda y no se ve en ningún lado, sólo en el log.
- `getPendingSignals` (`src/lib/process.ts`) es el único punto por el que pasa el trabajo de
  extracción en los dos modos: el analista (`getExtractWork`, ADR-0008) y el pipeline con la API
  (`processPendingSignals`). Reparte con `planExtraction` (ADR-0009).
- `signals.status` es `pending | processed | discarded`; `discarded` hoy significa "el analista
  no encontró dolores". `processed_at` marca cuándo salió de la cola. H10 (balance) y H14 (por
  fuente) cuentan "procesados" como `status <> 'pending'` por `processed_at`, y "descartados" como
  `status = 'discarded'`.
- `metadata` (jsonb) ya recibe claves escritas por el sistema y no por el adaptador:
  `missingSince` (revisión de borrados, ADR-0010).

### Qué muestra el dataset v1 (40 posts de Hacker News, 12 con dolor)

Revisado post por post:

- **Hilos mensuales:** "Ask HN: Who is hiring? (November 2026)", "Ask HN: Who wants to be hired?
  (November 2026)" y "Ask HN: What are you working on? (November 2026)". Los tres sin dolor. Son
  hilos que se publican todos los meses con el mismo título y el mes entre paréntesis; los dos
  primeros (y "Freelancer? Seeking freelancer?") los publica la cuenta `whoishiring`.
- **Todo el resto del ruido es de contenido, no de forma:** avisos de incidentes ("Tell HN:
  Scribd Breached", "Gitbook Breached"), llamados a la acción ("Tell HN: Please Vote", "I'm going
  on strike"), opiniones sobre el mercado ("Is the Microsoft buyout…", "In LLM era, can software
  startup survive?") y preguntas generales ("Which TV do you recommend for privacy?"). Para
  descartarlos hay que leerlos y juzgarlos: es justo lo que H13 prohíbe.
- **Formas que parecen ruido pero no lo son:** el prefijo "Tell HN:" junta avisos con relatos
  personales; los posts más cortos del dataset sin dolor tienen 33–78 caracteres, pero un dolor
  cabe en una frase; un "Ask HN" sólo con título puede ser un dolor latente ("¿alguien más no
  consigue trabajo después de los 50?"). Los 12 posts con dolor tienen todos texto propio y
  ninguno es un hilo mensual. Ninguno trae prefijo "Launch HN" o "Show HN".
- El dataset no guarda `author` ni `metadata`, así que una regla que sólo mire el autor no se
  puede probar contra él.
- **No hay preguntas de Stack Exchange en el dataset**, a propósito: su política prohíbe usar su
  contenido para probar herramientas de IA (ADR-0010). El prefiltro no usa IA, pero igual no hay
  con qué medirlo en esa fuente.

**Conclusión incómoda:** en el dataset, las reglas por forma seguras ahorran 3 de 28 posts sin
dolor (11 %). En operación es todavía menos: son unos 4 hilos al mes contra cientos de posts
de Hacker News por semana. Eso sí, esos hilos tienen cientos de comentarios, así que con el
orden de H11 (más comentarios primero) **entran en el primer lote de Hacker News** cada mes. El
prefiltro por forma no "libera la mayor parte de la capacidad", como esperaba la fase 1c: el
70 % de ruido de la primera corrida es casi todo de contenido.

## Decisión

### 1. Dónde se aplica: al repartir, dentro de `getPendingSignals`

- Módulo nuevo `src/lib/prefilter.ts`, con funciones puras:
  - `NOISE_RULES`: la lista de reglas (`id`, `label` en español, `source` o todas, `matches`).
  - `matchNoiseRule(signal): NoiseRule | null`, que recibe
    `{ source, title, body, author, metadata }`.
- `prefilterPending(db, now)`: lee los `pending` (sólo `id, source, title, body, author,
  metadata`), aplica `matchNoiseRule` y marca los que coinciden en una sola transacción:
  `status = 'discarded'`, `processed_at = now`, `metadata.prefilter = '<rule id>'`. Devuelve
  los conteos por regla.
- **`getPendingSignals` llama a `prefilterPending` antes de planificar el lote.** Así:
  - El analista y el pipeline con la API usan exactamente lo mismo, porque los dos pasan por ahí
    (igual que el reparto de ADR-0009).
  - Un post que cumple una regla nunca se entrega: cumple H13 tal como está escrito ("cuando se
    reparte el trabajo… no se entrega al analista").
  - Las reglas se aplican a **toda** la cola en cada reparto, no sólo a lo que entra nuevo
    (punto 5).
- `GET /api/agent/work?kind=extract` pasa a escribir en la base. Lo aceptamos: el endpoint ya
  está detrás del token del analista, el efecto es idempotente (repetir el pedido no cambia nada)
  y sólo toca posts `pending` que cumplen una regla. `kind=status` no aplica el prefiltro: el
  conteo de pendientes puede incluir hasta el próximo reparto posts que el prefiltro va a
  descartar. Es una diferencia de unos pocos posts y desaparece en la primera entrega del día.
- **Nada cambia en `ingest` ni en los adaptadores.** Los filtros de calidad propios de cada
  fuente (Reddit, Stack Exchange) siguen ahí, porque descartan lo que no es un post de texto de
  una persona; el prefiltro es para posts que sí son eso pero tienen una forma que nunca trae
  dolor.

### 2. Cómo se registra el motivo: `metadata.prefilter`, sin migración

- `metadata.prefilter` = id de la regla (texto). Un descarte del analista no tiene esa clave.
- En la interfaz el motivo se muestra como **"prefiltro: <label>"**, con el `label` de la regla en
  `NOISE_RULES`; si la regla ya no existe en el código, se muestra el id.
- **H10 (balance):** "procesados" sigue siendo "salió de la cola" (`status <> 'pending'` por
  `processed_at`), así que los descartados por el prefiltro cuentan como salida y el balance de
  la cola sigue siendo cierto. Se agrega una línea "de ellos, descartados por prefiltro: N" (los
  que tienen `metadata ? 'prefilter'` en la ventana de 7 días).
- **H14 (por fuente):** "descartados" se separa en "sin dolores (analista)" y "prefiltro",
  cada uno con su link a la lista. "Procesados" incluye los dos, igual que en H10. Para la lista
  se agrega la etapa `prefiltered` a `POST_STAGES`
  (`/activity?ver=posts&estado=prefiltered&source=…`), que muestra cada post con su motivo y su
  link a la fuente. La etapa `discarded` se queda con los descartados por el analista.
- El filtro en SQL es `metadata ? 'prefilter'` (y `->> 'prefilter'` para agrupar por regla). Con
  miles de filas no hace falta índice.

### 3. Reglas iniciales

Principios:

- Explícitas, sin IA, en código (`NOISE_RULES`) y documentadas en `docs/deploy.md` con un
  ejemplo de título por regla.
- Por **forma**: quién publica, un título fijo que se repite, ausencia total de texto. Nunca por
  palabras del tema, tono ni largo.
- **Patrones anclados y exactos** (de principio a fin del título, con el mes y el año), para que
  un post propio con un título parecido no caiga. Ante la duda, la regla no coincide.
- Si una regla es discutible, queda fuera: preferimos analizar ruido a perder evidencia.

| Id | Fuente | Coincide si | Motivo en la interfaz | Por qué es seguro |
|---|---|---|---|---|
| `hn-monthly-thread` | hackernews | `author = 'whoishiring'`, **o** el título es exactamente uno de: `Ask HN: Who is hiring? (<Mes> <Año>)`, `Ask HN: Who wants to be hired? (<Mes> <Año>)`, `Ask HN: Freelancer? Seeking freelancer? (<Mes> <Año>)`, `Ask HN: What are you working on? (<Mes> <Año>)` (sin distinguir mayúsculas; `<Mes>` es un mes en inglés y `<Año>` cuatro dígitos) | prefiltro: hilo mensual de Hacker News | El texto del post es una plantilla fija (formato del aviso de empleo o la pregunta de siempre); lo que cuenta la gente está en los comentarios, que no ingerimos. La cuenta `whoishiring` sólo publica estos hilos. El título se mira además del autor porque el dataset no guarda el autor. |
| `empty` | todas | título y cuerpo vacíos después de quitar espacios | prefiltro: post sin texto | No hay nada que leer ni cita posible. Hoy casi no pasa (los adaptadores ponen el título como cuerpo), pero protege de un cambio en una API. |

**Stack Exchange: ninguna regla.** Cada pregunta tiene texto propio de una persona que necesita
algo; las cerradas y las respondidas se guardan a propósito (ADR-0010 §5) y Software
Recommendations es, por forma, un pedido de herramienta: la mejor señal que tenemos. No hay
hilos recurrentes ni anuncios.

**Reddit: ninguna regla nueva.** Los posts sin texto propio (links), fijados, borrados y de
AutoModerator ya no se guardan (ADR-0006). Si al activar H15 aparecen hilos semanales
recurrentes de un subreddit, se evalúan entonces con datos.

**Quedan fuera, por discutibles** (con el ejemplo que lo muestra):

- **"Ask HN" sin texto propio** (el cuerpo es el título): un título solo puede ser un dolor
  latente o un pedido de herramienta, y la verificación de citas lo acepta como cita. H13 lo
  nombraba como ejemplo; no se aplica.
- **"Tell HN:"**: junta avisos ("Scribd Breached") con relatos personales que pueden tener dolor.
- **Largo mínimo del texto**: los posts cortos sin dolor del dataset (33–78 caracteres) se
  podrían cortar, pero un dolor cabe en una frase.
- **Avisos de incidentes, llamados a la acción, opiniones**: son ruido según H17, pero
  reconocerlos exige leer el contenido.
- **"Launch HN:" / "Show HN:"**: no aparecen en el dataset y no está verificado que el tag
  `ask_hn` los traiga. El desarrollador cuenta en la cola actual cuántos títulos empiezan con
  `Tell HN:`, `Launch HN:` y `Show HN:` y cuántos tienen el cuerpo igual al título, y lo deja en
  el PR como dato para el PO. No se aplican en esta historia.

Agregar una regla después exige lo mismo que estas: un id, una justificación por forma en
`docs/deploy.md`, tests de casos cercanos que no deben coincidir y pasar la prueba del dataset
(punto 4).

### 4. Cómo se prueba y cómo se informa el ahorro

- **Tests unitarios** (`src/lib/prefilter.test.ts`): por regla, casos que coinciden y casos
  cercanos que no, por ejemplo "Ask HN: What are you working on?" sin mes, "Ask HN: Who is hiring
  remote juniors in Europe?", un "Ask HN" con el título de la plantilla pero de otra fuente, y el
  autor `whoishiring` en Reddit. Más un test de base de datos (`test-db`) de `prefilterPending`:
  marca sólo `pending`, no toca `processed`/`discarded`, guarda `metadata.prefilter` y
  `processed_at`, y conserva las demás claves de `metadata`.
- **Test del dataset en `npm test`** (el criterio de H13): lee `evals/extraction/dataset.jsonl`,
  arma cada fila como señal (`author: null`, `metadata: {}`) y comprueba que **ningún post con
  `expected` no vacío** (concreto o latente) coincide con una regla. Si alguien agrega una regla
  que se come un dolor etiquetado, CI falla. No fija cuántos sin dolor se ahorran, porque el
  número cambia cuando crece el dataset.
- **Informe:** `npm run eval:prefilter` (`scripts/eval-prefilter.ts`, sin base de datos ni API)
  imprime posts totales, con dolor y sin dolor; cuántos descarta el prefiltro, por regla; cuántos
  con dolor perdería (debe ser 0, y si no lo es sale con código 1 listándolos), y el ahorro como
  "N de M sin dolor (P %)", con la lista de títulos descartados. Con las reglas iniciales y el
  dataset v1 debe dar 3 de 28 (11 %) y 0 con dolor perdidos. El resultado se registra en el PR
  y en el resultado de H13 en el backlog.
- En operación, el ahorro real se ve en H10 (descartados por prefiltro en 7 días) y en H14 (por
  fuente en 30 días).

### 5. Posts ya pendientes: sí, toda la cola

- Como el prefiltro corre sobre todos los `pending` en cada reparto, los ~400 pendientes de hoy
  se filtran en el primer reparto después del despliegue. No hace falta un script de migración de
  datos.
- **No se tocan los ya procesados ni los ya descartados por el analista**: salieron de la cola,
  su historia en H10/H14 queda como fue y ADR-0003 dice que no se reprocesan. Los hilos mensuales
  que el analista ya descartó siguen como descarte del analista.
- Esto también vale a futuro: una regla nueva se aplica a la cola entera en el reparto siguiente.

### 6. Reversibilidad

Un descarte del prefiltro nunca tiene dolores (el post no se analizó), así que volverlo a la cola
no rompe nada. Si una regla resulta mala, se quita de `NOISE_RULES` y se devuelven sus posts:

```sql
UPDATE signals
SET status = 'pending', processed_at = NULL, metadata = metadata - 'prefilter'
WHERE status = 'discarded' AND metadata->>'prefilter' = '<rule id>';
```

El comando queda documentado en `docs/deploy.md`. Los posts vuelven a entrar al reparto con su
`fetched_at` original, así que, si llevan más de 14 días, entran por la cuota de antigüedad de
ADR-0009.

## Alternativas consideradas

- **Al ingerir, sin guardar** (como los filtros de Reddit y Stack Exchange): lo más barato, pero
  no deja nada que revisar en `/activity` (H13 lo exige) y una regla mala pierde los posts para
  siempre, porque la fecha de corte de `ingest` no vuelve a pedirlos.
- **Al ingerir, guardando como descartado:** trazable y reversible, y también común a los dos
  modos (los dos dependen de `ingest`). Pero sólo ve lo nuevo: los ~400 pendientes necesitarían
  un script aparte, y cada regla nueva otro. Al repartir, la misma función cubre las dos cosas.
- **Un paso propio (`npm run prefilter` en el cron de `ingest`):** más explícito, pero es una
  pieza más que programar y que puede no correr; si no corre, el analista recibe los hilos
  mensuales igual. Dentro de `getPendingSignals` no se puede olvidar.
- **Filtrar al repartir sin marcar** (sólo excluirlos del lote): no escribe en el `GET`, pero
  los posts se quedan `pending` para siempre, inflan la cola de H10 y el balance diría que nunca
  baja.
- **Columna nueva `discard_reason` (migración):** más explícita y tipada, y podría guardar
  también motivos del analista. Hoy no hay motivos del analista que guardar, el volumen no pide
  índice y `metadata` ya tiene precedente de claves del sistema (`missingSince`). Si H18 u otra
  historia necesita motivos de descarte del analista, se migra entonces y se copia
  `metadata.prefilter` a la columna.
- **Estado nuevo `prefiltered`:** obliga a cambiar el `enum` y todas las consultas que hoy
  distinguen `pending` de "salió de la cola" (H10, H14, el analista). La clave en `metadata`
  llega a lo mismo sin tocar esas consultas.
- **Clasificador con un modelo chico (Haiku):** descartaría también el ruido de contenido, que
  es la mayor parte. Pero H13 pide reglas sin IA, el modo en producción no paga API (ADR-0008) y
  juzgar contenido es justo lo que puede perder dolores latentes. Si hace falta, es otra
  historia, con su propia medición contra el dataset.
- **Más reglas por forma (títulos sin texto, "Tell HN", largo mínimo):** ahorrarían más, pero
  cada una tiene un contraejemplo plausible (punto 3).

## Consecuencias

- Código nuevo: `src/lib/prefilter.ts` (+ tests), la llamada en `getPendingSignals`, la línea de
  prefiltro en H10, la separación en H14 y la etapa `prefiltered` en `/activity`,
  `scripts/eval-prefilter.ts` y `npm run eval:prefilter`. Documentación de las reglas y del
  comando para revertir en `docs/deploy.md`, y una línea en el skill `seedbox-analyst` de que el
  lote ya viene prefiltrado. Sin migración.
- `GET /api/agent/work?kind=extract` escribe en la base (idempotente, detrás del token).
- El significado de `discarded` se amplía: "sin dolores según el analista" **o** "prefiltro",
  distinguibles por `metadata.prefilter`. Toda consulta nueva sobre descartados debe decidir cuál
  quiere.
- **El ahorro es chico:** unos 4 posts al mes en Hacker News, aunque son de los primeros que el
  reparto de H11 entrega (tienen cientos de comentarios). Con las reglas por forma no se libera
  la mayor parte de la capacidad; el ruido de contenido lo sigue descartando el analista. Si el
  balance de H10 sigue mostrando que la cola crece, las palancas son otras: bajar el volumen de
  ingesta (`maxPages` de Hacker News, `SEEDBOX_MAX_NEW_PER_FEED`), subir las rondas del analista
  o una historia nueva de clasificación barata con su propia medición.
- El dataset no tiene autor ni `metadata`, así que las reglas por autor no se prueban contra él.
  Conviene que `eval:sample` guarde `author` en las filas nuevas (compatible hacia atrás).
- Stack Exchange no tiene reglas ni dataset con el que medirlas; si aparecen formas de ruido en
  H14, se decide con los conteos, no con su contenido en una evaluación.
