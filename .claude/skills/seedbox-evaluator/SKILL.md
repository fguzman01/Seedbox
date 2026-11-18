---
name: seedbox-evaluator
description: Weekly viability evaluator for Seedbox (H19, ADR-0013). Use when asked to run the Seedbox evaluator, write up the best opportunities, or produce viability write-ups. Reads the short list from the agent API, researches each opportunity on the web and opens one `tipo:oportunidad` issue per opportunity.
---

# Seedbox evaluator

Once a week you take the best opportunities of the radar and hand Felipe a write-up with a stage
(🔎 Explorar / 🧪 Validar / 🚀 Construir, or a proposal to discard), so he can choose 🔎 Explorar or
discard (❌) from Telegram. The ones he marks to explore enter a queue you deepen (see "Exploration queue"). Principle:
**evidence before opinion**. Every fact in a write-up has a source link; what you did not find, you say
"no encontrado". Never invent prices, market sizes or quotes.

Requirements: `npm install` done, `SEEDBOX_URL` set, GitHub tools for `fguzman01/Seedbox`, web search.
You never write to the site's database, never approve, merge or close an issue, and never edit scoring weights.

## Procedure

1. **First, skip what was already written up:** list the issues with label `tipo:oportunidad`, open
   **and** closed (discarded ones included). Each write-up starts with `Oportunidad #<id>` in its title or
   first line; collect those ids.
2. **Then, read Felipe's decisions** (H20, memory of the evaluator) from those same issues and classify:
   - ✅ approved: closed as `completed`, or label `estado:hecha`. Since H26, `estado:aprobada` +
     `tipo:oportunidad` no longer means "approved and done": it means **in the exploration queue** (Felipe
     chose 🔎 Explorar). The final decision is the last stage Felipe approved (e.g. 🧪 Validar after a brief);
     Once a brief exists, `aprobada` again means Felipe approved the stage the brief recommended (e.g. 🧪 Validar).
   - ❌ discarded: closed as `not_planned`, or label `estado:descartada`;
   - undecided: open and still `estado:propuesta`.
   The reason is Felipe's last comment (or the operator's comment relaying his answer to the card). If he
   left none, write "sin motivo": never invent one.
3. **Update `docs/preferencias.md`** only if there are decisions not yet in its table: add the rows
   (`Oportunidad #id | título | decisión | motivo | fecha`) and rewrite "Patrones" (3–5 lines). Open a
   small PR for it (it needs Felipe's ✅ like any repo change); never push to `main`.
4. **Exploration queue (H26)** — before the short list, see the section below. Do up to 2 briefs, then
   continue with the short list.
5. `npm run agent -- work shortlist --exclude <ids comma-separated>` (omit `--exclude` if none) writes
   `.agent/shortlist.work.json`: up to 5 opportunities, not in your list, that are assessed (competition
   and buildability) and have non-weak evidence (H12), ordered by total score. Each has its pains with
   quote, source and link. The file also has `quota` (H27): at least `quota.minNonTech` slots go to
   opportunities outside devtools; if `quota.shortfall` > 0, say in your summary how many non-tech ones
   were missing (the input is still biased) instead of padding the list. Empty list → say so and stop (nothing new to write up this week).
6. **Do not repeat discarded ideas:** compare each candidate by vertical, problem and affected group
   against the ❌ rows of the table. If it matches and there are no new pains since the discard date,
   skip it (and say so in the summary). If there is new evidence, write it up and open the write-up with
   "Vuelve a ficharse porque: …" citing the new pains with their link.
7. Write up **3 to 5** of them, in the order given (fewer if fewer came back).
8. For each, research on the web (competitor pricing pages, market size reports) and open the issue:
   - Title: `Oportunidad #<id>: <title>`
   - Labels: `tipo:oportunidad`, `estado:propuesta`, `prio:P3`, `riesgo:bajo`
   - Body: the template below, in Spanish, including the line "Preferencias consideradas" with a link to
     the version of `docs/preferencias.md` you used.
9. **Monthly weights proposal:** on the first run of each month, if there are at least 5 decisions and
   the pattern contradicts `DEFAULT_WEIGHTS` (`src/lib/scoring.ts`), open an issue `estado:propuesta`,
   `tipo:mejora`, `riesgo:alto` (it touches scoring rules) with the data and the suggested change. Weights
   are only ever proposed through an issue: **never edit `scoring.ts`** or any weight.
10. Finish with a short summary: ids written up, ids skipped and why, stages, briefs written.

## Template of the write-up

```
Qué es: <una línea> · Para quién: <una línea>
Etapa: <🔎 Explorar | 🧪 Validar | 🚀 Construir | proponer descartar (motivo)> → siguiente: <siguiente paso>
Viabilidad <0-10>/10 · Factibilidad de desarrollo <0-10>/10 (<por qué: tamaño del MVP, integraciones, datos o permisos, riesgo técnico>)

Oportunidad #<id> · etapa: <…> · viabilidad: <0-10>/10
Preferencias consideradas: [docs/preferencias.md](<link a la versión usada>)
(si se vuelve a fichar: «Vuelve a ficharse porque: …» con los dolores nuevos y su link)

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
## Etapa
```

## Viability score (0–10), development feasibility and stage

Felipe's criteria (2026-11-09). Score each from 0 to 10; the viability score is their average, rounded
to one decimal:

| Criterio | 10 | 0 |
|---|---|---|
| 1. Felipe lo construye **solo, con IA, en menos de un mes** | MVP en 1–2 semanas, sin integraciones difíciles | meses, equipo o datos que no tiene |
| 2. **Ingreso mínimo esperado** (propuesta: US$1.000/mes posibles en 12 meses) | los precios reales de los competidores lo sostienen con holgura | no se sostiene |
| 3. Sirve al mercado **hispanohablante o global** | global o hispanohablante sin adaptación | sólo un mercado local sin acceso |

**Development feasibility (0–10)** is criterion 1 shown on its own in the 3-line summary of every
write-up and brief, with one line of why (MVP size, hard integrations, data or permissions needed,
technical risk). Recompute it in every brief, because deepening changes what is known.

Stages (replace "investigar más / construir / descartar"):

- **🔎 Explorar:** information is missing to know whether it is worth it (unverified prices, doubtful demand).
- **🧪 Validar:** there are real prices and a clear gap; what is missing is proof that someone pays
  (a landing page, 5 conversations or a pre-sale). Requires real competitor prices and a clear gap.
- **🚀 Construir:** the three criteria score ≥ 6 **and** criterion 2 is supported by real competitor
  prices **with a link** (users × price ≥ the threshold, shown in the write-up), and the validation
  was already done or is not needed. Without real prices, "Construir" is forbidden.
- **Propose to discard**, with the reason, when a criterion fails (≤ 3) or the market is saturated.

## Exploration queue (H26)

Run this before the short list.

1. List open issues with labels `tipo:oportunidad` + `estado:aprobada` (Felipe chose 🔎 Explorar) that do
   **not** yet have a comment starting with `## Brief de exploración`.
2. Order them by viability (the `Viabilidad X/10` line of the summary; in old write-ups, the `viabilidad` in the first line), highest first, ties by lower issue
   number. An opportunity whose stage is "descartar" (e.g. #29) goes last unless Felipe says otherwise.
3. Deepen **at most 2 per weekly run**; the rest wait their turn. This run counts even when the short
   list is empty.
4. For each, research on the web and leave a comment (never edit the original write-up) with the brief
   template below. Then move the issue to `estado:propuesta` so Felipe receives the card
   **🧪 Validar / ❌ Descartar**. (Agents never set `aprobada` or `hecha`.)

### Template of the brief

```
## Brief de exploración
Qué es: … · Para quién: …
Etapa: <🧪 Validar | 🔎 Explorar (si aún falta algo decisivo) | proponer descartar (motivo)> → siguiente: <decisión de Felipe: 🧪 Validar o ❌ Descartar>
Viabilidad <0-10>/10 · Factibilidad de desarrollo <0-10>/10 (recalculada, con el porqué)

### Qué se averiguó
(precios, demanda, competidores; cada dato con [link]; lo que no se halló: "no encontrado")
### Qué cambió
(respecto de la ficha original)
### Experimento más barato (sólo si la etapa es 🧪 Validar)
(qué se hace, cuánto cuesta y cómo se mide; si Felipe lo aprueba, es el punto de partida del proyecto aparte)
```

If after deepening something decisive is still missing, say so and keep 🔎 Explorar as the stage; Felipe
decides the next step.
